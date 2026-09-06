/**
 * The market a duel is fought over.
 *
 * The UI used to label every match "$BONK" while every `create_match` passed
 * `PublicKey.default` — a fictional ticker over a null mint. This resolves the
 * label from the match's actual `mint` field, so what is displayed is what is
 * on chain.
 *
 * Positions are virtual inventory: no SPL moves during a round, because a
 * public swap print would hand the opponent the fills the fog exists to hide.
 * The mint identifies the market; it is not custodied.
 */
import { PublicKey } from '@solana/web3.js';

/**
 * The demo market, created for real with `spl-token create-token` on the
 * cluster. Override with EXPO_PUBLIC_MINT when deploying elsewhere.
 */
export const DEMO_MINT = new PublicKey(
  process.env.EXPO_PUBLIC_MINT || '3nmxq3N78WQGQPXULxmSQ2rjXYwX8zrjrcYxnP2aQpNo'
);

/** Symbols for mints we actually know. Anything else is shown by address. */
const KNOWN: Record<string, string> = {
  [DEMO_MINT.toBase58()]: '$FOG',
  So11111111111111111111111111111111111111112: '$SOL',
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: '$BONK',
};

const short = (k: PublicKey) => `${k.toBase58().slice(0, 4)}…${k.toBase58().slice(-4)}`;

/**
 * Display label for a market. An unset mint is called what it is rather than
 * given a borrowed ticker.
 */
export function marketLabel(mint: PublicKey | null | undefined): string {
  if (!mint || mint.equals(PublicKey.default)) return 'SYNTHETIC';
  return KNOWN[mint.toBase58()] ?? short(mint);
}

/** Full mint address, for the panels that show provenance. */
export function marketMintLabel(mint: PublicKey | null | undefined): string {
  if (!mint || mint.equals(PublicKey.default)) return 'no mint';
  return short(mint);
}
