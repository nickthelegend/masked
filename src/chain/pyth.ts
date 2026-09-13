/**
 * Pyth prices for the majors, as the program reads them.
 *
 * `push_price_pyth` (programs/fogduel/src/pyth.rs) sets a major's mark from a
 * token/USD and a SOL/USD `PriceUpdateV2`, both owned by Pyth's receiver. Pyth
 * sponsors one such account per popular feed and keeps it current, at the same
 * address on devnet and mainnet — so a caller needs no Hermes round trip, only
 * the two addresses below.
 *
 * Everything here mirrors the program: the mint table (`MAJOR_FEEDS`), the
 * layout, the checks and the arithmetic. It exists so a script or screen can
 * say what the program will accept before sending, and so a check can
 * recompute the mark the program wrote from the same bytes.
 */
import { PublicKey, type Connection } from '@solana/web3.js';
import { USDC_MINT, WSOL_MINT } from './jupiter';
import { feedPda } from './pdas';

export const PYTH_RECEIVER_ID = new PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ');
export const SOL_USD_PRICE_UPDATE = new PublicKey('7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE');

/** Mirrors `pyth::MAJOR_FEEDS`, with the sponsored account for each feed. */
export const PYTH_MAJORS: Record<string, { symbol: string; feedId: string; priceUpdate: PublicKey }> = {
  [WSOL_MINT]: {
    symbol: 'SOL/USD',
    feedId: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    priceUpdate: SOL_USD_PRICE_UPDATE,
  },
  [USDC_MINT]: {
    symbol: 'USDC/USD',
    feedId: 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    priceUpdate: new PublicKey('Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX'),
  },
};

/** Mirrors `pyth::MAX_PYTH_AGE`, `MAX_CLOCK_SKEW` and `MAX_CONF_BPS`. */
export const MAX_PYTH_AGE_SECS = 360;
export const MAX_CLOCK_SKEW_SECS = 30;
export const MAX_CONF_BPS = 200n;

const DISCRIMINATOR = Buffer.from([0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd]);

export const hasPythFeed = (mint: string): boolean => mint in PYTH_MAJORS;

export interface PythPrice {
  feedId: string;
  fullyVerified: boolean;
  price: bigint;
  conf: bigint;
  exponent: number;
  publishTime: number;
}

/** Decode a `PriceUpdateV2`. Throws on anything that is not one. */
export function decodePriceUpdate(data: Uint8Array): PythPrice {
  const b = Buffer.from(data);
  if (b.length < 41 || !b.subarray(0, 8).equals(DISCRIMINATOR)) throw new Error('not a Pyth PriceUpdateV2');
  const level = b[40];
  const o = level === 1 ? 41 : 42;
  return {
    feedId: b.subarray(o, o + 32).toString('hex'),
    fullyVerified: level === 1,
    price: b.readBigInt64LE(o + 32),
    conf: b.readBigUInt64LE(o + 40),
    exponent: b.readInt32LE(o + 48),
    publishTime: Number(b.readBigInt64LE(o + 52)),
  };
}

/** Read an update, refusing an account the receiver does not own. */
export async function readPriceUpdate(connection: Connection, account: PublicKey): Promise<PythPrice> {
  const info = await connection.getAccountInfo(account, 'confirmed');
  if (!info) throw new Error(`no account at ${account.toBase58()}`);
  if (!info.owner.equals(PYTH_RECEIVER_ID)) throw new Error(`${account.toBase58()} is not owned by the Pyth receiver`);
  return decodePriceUpdate(info.data);
}

/** Why the program would refuse this price as a mark now, or null if it would take it. */
export function refusal(p: PythPrice, expectedFeedId: string, nowSecs: number): string | null {
  if (!p.fullyVerified) return 'OracleNotFullyVerified';
  if (p.feedId !== expectedFeedId) return 'OracleWrongFeed';
  if (p.price <= 0n) return 'InvalidPrice';
  if (p.publishTime > nowSecs + MAX_CLOCK_SKEW_SECS || nowSecs - p.publishTime > MAX_PYTH_AGE_SECS) return 'OracleStale';
  if (p.conf * 10_000n > p.price * MAX_CONF_BPS) return 'OracleConfidence';
  return null;
}

/** Mirrors `pyth::px_from_usd_pair`: lamports per whole token x PRICE_SCALE. */
export function pxFromUsdPair(token: PythPrice, sol: PythPrice): bigint {
  const shift = 15 + token.exponent - sol.exponent;
  const pow = 10n ** BigInt(Math.abs(shift));
  return shift >= 0 ? (token.price * pow) / sol.price : token.price / (sol.price * pow);
}

/**
 * Send `push_price_pyth` for one player's major leg.
 *
 * `program` is an Anchor `Program` for fogduel on the base layer, where marks
 * are posted.
 */
export async function pushPricePyth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anchor's method namespace is untyped
  program: any,
  args: { authority: PublicKey; match: PublicKey; owner: PublicKey; mint: string; tokenPriceUpdate?: PublicKey }
): Promise<string> {
  const entry = PYTH_MAJORS[args.mint];
  if (!entry && !args.tokenPriceUpdate) throw new Error(`no Pyth feed for ${args.mint}`);
  return program.methods
    .pushPricePyth(args.owner)
    .accounts({
      authority: args.authority,
      matchAccount: args.match,
      priceFeed: feedPda(args.match, args.owner),
      tokenPriceUpdate: args.tokenPriceUpdate ?? entry.priceUpdate,
      solPriceUpdate: SOL_USD_PRICE_UPDATE,
    })
    .rpc();
}
