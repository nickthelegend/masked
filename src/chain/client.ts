/**
 * Typed client for the fogduel program.
 *
 * Holds two connections: the base layer, and the Ephemeral Rollup. Which one a
 * call goes to is not a detail the screens should have to know, so it is
 * decided here — lifecycle instructions (create/join/settle) go to L1, and
 * in-round instructions (fills) go to the ER, where the position is delegated
 * and private.
 */
import { AnchorProvider, BN, Program, type Idl, type Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, type Commitment } from '@solana/web3.js';
import {
  PERMISSION_PROGRAM_ID,
  createCommitAndUndelegatePermissionInstruction,
  permissionPdaFromAccount,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { FOGDUEL_IDL as idl } from './idl';
import { ACTIVE_CLUSTER, DELEGATION_PROGRAM_ID, type ClusterConfig } from './config';
import { feedPda, matchPda, positionPda, statsPda, statusPda, tapePda, treasuryPda, vaultPda } from './pdas';
import { toTapeState, type TapeState } from './tape';
import { authenticate, type MessageSigner } from './erAuth';
import { VALUE_DIV } from './units';
import { isProgramError } from './errors';

const COMMITMENT: Commitment = 'confirmed';

/** Prices and base quantities are integers scaled by 1e6 on-chain. */
/** Mirrors `MAX_PUSH_BPS` in state.rs: the per-push cap on the mark. */
export const MAX_PUSH_BPS = 500;
/**
 * Re-exported from units.ts, which is the one place these are defined.
 *
 * They were declared here as well, and the two copies drifted: `px` gained
 * PRICE_SCALE, units.ts followed, this file did not, and a flat position
 * rendered as +29,813,639%. Import them, do not retype them.
 */
export { BASE_SCALE, PRICE_SCALE, VALUE_DIV } from './units';
export const BPS = 10_000;

export type Side = 'buy' | 'sell';
export type MarketKind = 'meme' | 'major';

export interface FillRecord {
  side: string;
  qty: number;
  px: number;
  ts: number;
}

/** One player's chosen market, as written on chain. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const decodeLegRaw = (raw: any): MatchLeg => ({
  mint: raw.mint,
  marketType: decodeMarketType(raw.marketType),
  symbol: decodeFixed(raw.symbol),
  name: decodeFixed(raw.name),
  startPx: BigInt(raw.startPx.toString()),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface MatchLeg {
  mint: PublicKey;
  /** Where the mark comes from: a pump.fun curve, or an aggregator. */
  marketType: MarketKind;
  /** Ticker, as written on chain when this side was set. */
  symbol: string;
  /** Full market name. */
  name: string;
  /** The mark this side opened on. */
  startPx: bigint;
}

/** An empty leg — a match nobody has joined yet has no second market. */
export const EMPTY_LEG: MatchLeg = {
  mint: PublicKey.default,
  marketType: 'meme',
  symbol: '',
  name: '',
  startPx: 0n,
};

export interface MatchState {
  address: PublicKey;
  creator: PublicKey;
  joiner: PublicKey | null;
  /** The creator's market. */
  legA: MatchLeg;
  /** The joiner's. Blank until somebody joins and names their own. */
  legB: MatchLeg;
  /** When the match was opened, from the chain's clock. */
  createdTs: number;
  matchId: number;
  startTs: number;
  duration: number;
  entry: number;
  status: 'open' | 'live' | 'settling' | 'settled' | 'cancelled';
  pot: number;
  winner: PublicKey | null;
  pnlABps: number;
  pnlBBps: number;
}

export interface PlayerRecord {
  owner: PublicKey;
  wins: number;
  losses: number;
  taken: number;
  staked: number;
  streak: number;
  bestStreak: number;
  lastPlayedTs: number;
}

/** A player's own private constant-product book, carried inside the position. */
export interface BookState {
  /** Traded units x BASE_SCALE. */
  virtualBase: number;
  /** Lamports. */
  virtualQuote: number;
  /** Lamports per traded unit, at seed time. */
  seedPx: number;
}

export interface PositionState {
  owner: PublicKey;
  quoteBalance: number;
  baseQty: number;
  avgPx: number;
  realized: number;
  lastPx: number;
  fillCount: number;
  fills: FillRecord[];
  book: BookState;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Anchor's generated
   account namespace is dynamically typed; the shapes are narrowed below. */
type AnyProgram = Program<Idl> & { account: Record<string, any>; methods: Record<string, any> };

const sideArg = (side: Side) => (side === 'buy' ? { buy: {} } : { sell: {} });

/**
 * The websocket URL for an RPC endpoint, carrying the auth token.
 *
 * web3.js derives ws://host:port+1 on its own, which is right, but it has
 * nowhere to put a token — so the URL is built here.
 */
const wsUrlFor = (httpUrl: string, token: string): string => {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  if (u.port) u.port = String(Number(u.port) + 1);
  u.searchParams.set('token', token);
  return u.toString();
};

const decodeStatus = (raw: Record<string, unknown>): MatchState['status'] =>
  (Object.keys(raw)[0] as MatchState['status']) ?? 'open';

const decodeMarketType = (raw: Record<string, unknown>): MarketKind =>
  Object.keys(raw ?? {})[0] === 'major' ? 'major' : 'meme';

/**
 * A fixed-width on-chain string back to a JS one.
 *
 * The field is zero-padded, and trailing NULs would otherwise render as boxes
 * in a pixel font.
 */
const decodeFixed = (bytes: number[] | Uint8Array | undefined): string => {
  if (!bytes) return '';
  const arr = Array.from(bytes);
  const end = arr.indexOf(0);
  return new TextDecoder().decode(new Uint8Array(end === -1 ? arr : arr.slice(0, end)));
};

export class FogduelClient {
  readonly cluster: ClusterConfig;
  readonly l1: Connection;
  er: Connection;
  private readonly wallet: Wallet;
  private readonly signer?: MessageSigner;
  private readonly l1Program: AnyProgram;
  private erProgram: AnyProgram;
  private erToken: string | null = null;
  private pendingAuth: Promise<void> | null = null;

  /**
   * @param signer optional message signer used to unlock reads on the rollup.
   *   Without it the client still trades — signing in is only needed to *read*
   *   a sealed position, and the front door refuses everyone otherwise,
   *   including the position's own owner.
   */
  constructor(wallet: Wallet, cluster: ClusterConfig = ACTIVE_CLUSTER, signer?: MessageSigner) {
    this.cluster = cluster;
    this.wallet = wallet;
    this.signer = signer;
    this.l1 = new Connection(cluster.l1, COMMITMENT);
    this.er = new Connection(cluster.er, COMMITMENT);

    const l1Provider = new AnchorProvider(this.l1, wallet, { commitment: COMMITMENT });
    const erProvider = new AnchorProvider(this.er, wallet, { commitment: COMMITMENT });
    this.l1Program = new Program(idl as Idl, l1Provider) as AnyProgram;
    this.erProgram = new Program(idl as Idl, erProvider) as AnyProgram;
  }

  /**
   * The rollup program, with a token if one can be had.
   *
   * Every path to the rollup goes through here. The front door gates writes as
   * well as reads, and a send that gets through but cannot confirm looks
   * exactly like a slow rollup — so signing in is not something a caller
   * should have to remember.
   */
  private async erProgramAuthed(): Promise<AnyProgram> {
    await this.signInToEr().catch(() => undefined);
    return this.erProgram;
  }

  /** True once this client holds a token for the rollup's front door. */
  get authenticated(): boolean {
    return this.erToken !== null;
  }

  /**
   * Sign in to the rollup so this wallet's own position becomes readable.
   *
   * Costs one wallet signature and nothing on-chain. Concurrent callers share
   * one attempt, because every poll tick would otherwise pop a signing prompt.
   */
  async signInToEr(): Promise<void> {
    if (this.erToken || !this.signer) return;
    if (this.pendingAuth) return this.pendingAuth;

    this.pendingAuth = (async () => {
      const token = await authenticate(this.cluster.er, this.signer!);
      this.erToken = token;
      this.er = new Connection(this.cluster.er, {
        commitment: COMMITMENT,
        httpHeaders: { Authorization: `Bearer ${token}` },
        // The socket cannot carry a header, so it takes the token as a query
        // param instead. Without this, sending works and *confirming* hangs —
        // which looks exactly like a slow rollup.
        wsEndpoint: wsUrlFor(this.cluster.er, token),
      });
      const provider = new AnchorProvider(this.er, this.wallet, { commitment: COMMITMENT });
      this.erProgram = new Program(idl as Idl, provider) as AnyProgram;
    })();

    try {
      await this.pendingAuth;
    } finally {
      this.pendingAuth = null;
    }
  }

  get programId(): PublicKey {
    return this.l1Program.programId;
  }

  /* ------------------------------ lifecycle ------------------------------ */

  async ensureTreasury(payer: PublicKey): Promise<void> {
    const treasury = treasuryPda();
    if (await this.l1.getAccountInfo(treasury)) return;
    await this.l1Program.methods
      .initTreasury()
      .accounts({ payer, treasury, systemProgram: SystemProgram.programId })
      .rpc();
  }

  async createMatch(args: {
    creator: PublicKey;
    matchId: number;
    mint: PublicKey;
    durationSecs: number;
    entryLamports: number;
    /** Opening mark, as the program stores it: lamports per traded unit. */
    startPx: bigint;
    marketType?: MarketKind;
    symbol?: string;
    name?: string;
  }): Promise<PublicKey> {
    const match = matchPda(args.creator, args.matchId);
    const kind = args.marketType ?? 'meme';
    await this.l1Program.methods
      .createMatch(
        new BN(args.matchId),
        args.mint,
        new BN(args.durationSecs),
        new BN(args.entryLamports),
        new BN(args.startPx.toString()),
        kind === 'meme' ? { meme: {} } : { major: {} },
        (args.symbol ?? '').slice(0, 12),
        (args.name ?? '').slice(0, 32)
      )
      .accounts({
        creator: args.creator,
        matchAccount: match,
        vault: vaultPda(match),
        priceFeed: feedPda(match, args.creator),
        roundStatus: statusPda(match),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return match;
  }

  /**
   * Join an open match, bringing your own market.
   *
   * The joiner names their own mint and the mark they just read for it, rather
   * than inheriting the creator's. That is what makes the duel "my read
   * against yours" instead of "we both had to want the same coin".
   */
  async joinMatch(
    match: PublicKey,
    joiner: PublicKey,
    creator: PublicKey,
    leg: { mint: PublicKey; startPx: bigint; marketType: 'meme' | 'major'; symbol: string; name: string }
  ): Promise<void> {
    await this.l1Program.methods
      .joinMatch(
        leg.mint,
        new BN(leg.startPx.toString()),
        leg.marketType === 'meme' ? { meme: {} } : { major: {} },
        leg.symbol.slice(0, 12),
        leg.name.slice(0, 32)
      )
      .accounts({
        joiner,
        matchAccount: match,
        vault: vaultPda(match),
        priceFeed: feedPda(match, creator),
        priceFeedB: feedPda(match, joiner),
        positionA: positionPda(match, creator),
        positionB: positionPda(match, joiner),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async cancelMatch(match: PublicKey, creator: PublicKey): Promise<void> {
    await this.l1Program.methods
      .cancelIfUnjoined()
      .accounts({ creator, matchAccount: match, vault: vaultPda(match) })
      .rpc();
  }

  /* ------------------------- ephemeral rollup ---------------------------- */

  async delegatePosition(match: PublicKey, owner: PublicKey, payer: PublicKey): Promise<void> {
    await this.l1Program.methods
      .delegatePositionToEr(owner, this.cluster.validator, 1_000)
      .accounts({ payer, matchAccount: match })
      .rpc();
  }

  /**
   * Create the on-chain access-control list for a position: one member, the
   * owner. Runs on L1, so it needs no delegated fee payer.
   */
  async createPositionPermission(match: PublicKey, owner: PublicKey, payer: PublicKey): Promise<void> {
    await this.l1Program.methods
      .createPositionPermission(owner)
      .accounts({
        payer,
        matchAccount: match,
        position: positionPda(match, owner),
        permission: permissionPdaFromAccount(positionPda(match, owner)),
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /** Delegate a position's ACL to the same validator as the position. */
  async delegatePositionPermission(
    match: PublicKey,
    owner: PublicKey,
    payer: PublicKey,
    position?: PublicKey
  ): Promise<void> {
    const pos = position ?? positionPda(match, owner);
    const permission = permissionPdaFromAccount(pos);
    await this.l1Program.methods
      .delegatePositionPermission(owner)
      .accounts({
        payer,
        matchAccount: match,
        position: pos,
        permission,
        delegationBuffer: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(permission, PERMISSION_PROGRAM_ID),
        delegationRecord: delegationRecordPdaFromDelegatedAccount(permission),
        delegationMetadata: delegationMetadataPdaFromDelegatedAccount(permission),
        validator: this.cluster.validator,
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Seal a live match: give both positions an access-control list, delegate
   * those lists, then delegate the positions themselves.
   *
   * The order is not arbitrary and is proved by chain/tests/permission.ts.
   * A position must get its permission *before* it is delegated — once the
   * delegation program owns the account, the program can no longer sign for
   * it and CreatePermission fails.
   *
   * This exists as one method so the ordering lives in exactly one place. It
   * used to live only in a test and a script, which meant a player going
   * through the UI got an unsealed match.
   */
  async sealAndDelegateMatch(
    match: PublicKey,
    creator: PublicKey,
    joiner: PublicKey,
    payer: PublicKey
  ): Promise<void> {
    // Both players' clients seal the match, and either can get there first:
    // the joiner starts the moment they join, the creator the moment their
    // poll notices somebody has. So every step is skipped if the chain already
    // shows it done, rather than sent and allowed to fail.
    //
    // Sending it anyway is not harmless. `delegate_position_to_er` moves the
    // account to the delegation program, so the second client's copy fails
    // with AccountOwnedByWrongProgram — an error the loser of a race would
    // then show its player, for a round that is in fact correctly sealed.
    const state = await Promise.all(
      [creator, joiner].map(async (owner) => {
        const position = positionPda(match, owner);
        const permission = permissionPdaFromAccount(position);
        const [posInfo, permInfo] = await Promise.all([
          this.l1.getAccountInfo(position).catch(() => null),
          this.l1.getAccountInfo(permission).catch(() => null),
        ]);
        return {
          owner,
          hasPermission: !!permInfo,
          // Delegated accounts are owned by the delegation program. That is
          // the only reliable signal — the data still decodes either way.
          permissionDelegated: !!permInfo && permInfo.owner.equals(DELEGATION_PROGRAM_ID),
          positionDelegated: !!posInfo && posInfo.owner.equals(DELEGATION_PROGRAM_ID),
        };
      })
    );

    // Reading first narrows the race but cannot close it: both clients can
    // read "not yet" in the same instant and both send. So a step that throws
    // is re-checked against the chain, and only accepted if the chain now
    // shows the state it was trying to reach. An error is swallowed on
    // evidence, never on the assumption that it was probably the other player.
    const ensure = async (done: boolean, send: () => Promise<void>, confirm: () => Promise<boolean>) => {
      if (done) return;
      try {
        await send();
      } catch (e) {
        if (!(await confirm())) throw e;
      }
    };

    const isDelegated = async (address: PublicKey) => {
      const info = await this.l1.getAccountInfo(address).catch(() => null);
      return !!info && info.owner.equals(DELEGATION_PROGRAM_ID);
    };

    for (const s of state) {
      const permission = permissionPdaFromAccount(positionPda(match, s.owner));
      await ensure(
        s.hasPermission,
        () => this.createPositionPermission(match, s.owner, payer),
        async () => !!(await this.l1.getAccountInfo(permission).catch(() => null))
      );
    }
    for (const s of state) {
      const permission = permissionPdaFromAccount(positionPda(match, s.owner));
      await ensure(
        s.permissionDelegated,
        () => this.delegatePositionPermission(match, s.owner, payer),
        () => isDelegated(permission)
      );
    }
    for (const s of state) {
      await ensure(
        s.positionDelegated,
        () => this.delegatePosition(match, s.owner, payer),
        () => isDelegated(positionPda(match, s.owner))
      );
    }
    // The public status account goes to the rollup too, but deliberately
    // without a permission: `liquidate` runs there and has to write it, and
    // both players plus any spectator have to be able to read it. It is the
    // one account in a live round that is not sealed.
    await ensure(
      await isDelegated(statusPda(match)),
      () => this.delegateStatus(match, payer),
      () => isDelegated(statusPda(match))
    );

    // Each player's book travels inside their Position, so delegating the
    // positions delegates the books — and sealing the positions seals them.
  }

  /**
   * Mid of a player's own private book, as a `px`.
   *
   * Only ever your own: another player's book is inside their sealed Position,
   * which is the point.
   */
  async fetchBookMid(match: PublicKey, owner: PublicKey, fromEr: boolean): Promise<number> {
    const pos = await this.fetchPosition(match, owner, fromEr);
    if (!pos || pos.book.virtualBase === 0) return 0;
    return (pos.book.virtualQuote * VALUE_DIV) / pos.book.virtualBase;
  }

  /** Is this position's ACL actually on chain? Read, never assumed. */
  async isPositionSealed(match: PublicKey, owner: PublicKey): Promise<boolean> {
    const permission = permissionPdaFromAccount(positionPda(match, owner));
    const info = await this.l1.getAccountInfo(permission).catch(() => null);
    return !!info;
  }

  /**
   * How far a seal has got, read off Solana: each position's ACL created and
   * delegated, each position delegated, and the round status delegated. The
   * status is the step `sealAndDelegateMatch` takes last, so `sealed` is only
   * true once the whole seal has landed. The client waiting on the other
   * player's seal watches `steps` rise to tell a slow seal from an abandoned one.
   */
  async sealProgress(
    match: PublicKey,
    creator: PublicKey,
    joiner: PublicKey
  ): Promise<{ steps: number; sealed: boolean }> {
    const posA = positionPda(match, creator);
    const posB = positionPda(match, joiner);
    const [permA, permB, a, b, status] = await this.l1.getMultipleAccountsInfo([
      permissionPdaFromAccount(posA),
      permissionPdaFromAccount(posB),
      posA,
      posB,
      statusPda(match),
    ]);
    const delegated = (i: { owner: PublicKey } | null) => !!i && i.owner.equals(DELEGATION_PROGRAM_ID);
    const steps =
      [permA, permB].filter(Boolean).length + [permA, permB, a, b, status].filter(delegated).length;
    return { steps, sealed: delegated(a) && delegated(b) && delegated(status) };
  }

  /**
   * How far a settlement has got: both positions and the round status handed
   * back by the delegation program, then the round moving to Settling and to
   * Settled. The client waiting on the other player's settlement watches
   * `steps` rise to tell a slow settlement from an abandoned one.
   */
  async settleProgress(
    match: PublicKey,
    creator: PublicKey,
    joiner: PublicKey
  ): Promise<{ steps: number; status: string | null }> {
    const [infos, m] = await Promise.all([
      this.l1.getMultipleAccountsInfo([positionPda(match, creator), positionPda(match, joiner), statusPda(match)]),
      this.fetchMatch(match).catch(() => null),
    ]);
    const home = infos.filter((i) => !i || !i.owner.equals(DELEGATION_PROGRAM_ID)).length;
    const status = m?.status ?? null;
    return { steps: home + (status === 'settling' ? 1 : status === 'settled' ? 2 : 0), status };
  }

  /** The permission PDA for a position, for inspectors and tests. */
  permissionFor(match: PublicKey, owner: PublicKey): PublicKey {
    return permissionPdaFromAccount(positionPda(match, owner));
  }

  /** Raw on-chain owner of an account — used by the delegation inspector. */
  async accountOwner(address: PublicKey, fromEr = false): Promise<PublicKey | null> {
    const conn = fromEr ? this.er : this.l1;
    const info = await conn.getAccountInfo(address);
    return info?.owner ?? null;
  }

  /**
   * A fill on the private book, on the rollup.
   *
   * Units differ by side and are deliberately raw, because the program's two
   * sides consume different things:
   *   buy  — `amount` is quote spent, in the same units as the entry (lamports)
   *   sell — `amount` is base sold, scaled by BASE_SCALE
   */
  async applyFill(
    match: PublicKey,
    player: PublicKey,
    side: Side,
    amount: number,
    /**
     * Whose position is being filled, when that is not the signer.
     *
     * Defaults to the signer, which is every ordinary fill. It differs only
     * when a Gum session key signs on the owner's behalf — the position is
     * seeded by the owner, so the program needs to be told who that is.
     */
    owner: PublicKey = player,
    /** The session token authorising `player` to act for `owner`. */
    sessionToken: PublicKey | null = null
  ): Promise<string> {
    return (await this.erProgramAuthed()).methods
      .applyFill(sideArg(side), new BN(Math.round(amount)), owner)
      .accounts({
        player,
        matchAccount: match,
        priceFeed: feedPda(match, owner),
        position: positionPda(match, owner),
        sessionToken,
      })
      .rpc();
  }

  /**
   * A fill signed by a session key on the owner's behalf.
   *
   * The session key is not an identity: the position stays the owner's and the
   * tape records their fill. It is a signature mechanism, so a sixty-second
   * round costs one wallet prompt instead of one per trade. The program's
   * `session_auth_or` guard is what makes this safe — without a token the
   * signer must be the owner, and a token names exactly one owner.
   */
  async applyFillAs(
    match: PublicKey,
    session: { signer: Keypair; token: PublicKey },
    owner: PublicKey,
    side: Side,
    amount: number
  ): Promise<string> {
    const program = await this.erProgramAuthed();
    const ix = await program.methods
      .applyFill(sideArg(side), new BN(Math.round(amount)), owner)
      .accounts({
        player: session.signer.publicKey,
        matchAccount: match,
        priceFeed: feedPda(match, owner),
        position: positionPda(match, owner),
        sessionToken: session.token,
      })
      .instruction();

    // Sent directly rather than through the provider: the provider signs with
    // the player's wallet, and this transaction must be signed — and paid for
    // — by the session key alone.
    const tx = new Transaction().add(ix);
    tx.feePayer = session.signer.publicKey;
    tx.recentBlockhash = (await this.er.getLatestBlockhash()).blockhash;
    tx.sign(session.signer);
    const sig = await this.er.sendRawTransaction(tx.serialize());
    await this.er.confirmTransaction(sig, COMMITMENT);
    return sig;
  }

  /**
   * Bring both positions home from the rollup.
   *
   * One transaction each: a Position is 559 bytes and two will not fit in one
   * transaction, which pushes the rollup's committor onto a chunked buffer
   * path. Sequential rather than parallel, because both commits are scheduled
   * against the same payer and the rollup processes them in order anyway.
   */
  async commitAndUndelegate(
    match: PublicKey,
    payer: PublicKey,
    creator: PublicKey,
    joiner: PublicKey
  ): Promise<string[]> {
    const sigs: string[] = [];
    for (const owner of [creator, joiner]) {
      const position = positionPda(match, owner);

      // Skip what is already home. The rollup refuses to undelegate an account
      // it no longer holds — "required to be writable and delegated in order
      // to be undelegated" — so a retry after a partial success used to die on
      // the position that had already come back, and the one that had not
      // never got a second chance. Settlement then failed forever.
      const onL1 = await this.l1.getAccountInfo(position);
      if (onL1 && !onL1.owner.equals(DELEGATION_PROGRAM_ID)) continue;

      sigs.push(
        await (await this.erProgramAuthed()).methods
          .commitAndUndelegatePosition()
          .accounts({ payer, position })
          .rpc()
      );
    }

    // The status account comes home too, or `settle_match` cannot read the
    // liquidation flags off it — on L1 a delegated account is owned by the
    // delegation program and the whole settle transaction is rejected.
    const statusOnL1 = await this.l1.getAccountInfo(statusPda(match));
    if (statusOnL1 && statusOnL1.owner.equals(DELEGATION_PROGRAM_ID)) {
      sigs.push(await this.commitAndUndelegateStatusSig(match, payer));
    }

    return sigs;
  }

  /**
   * Hand the round's upkeep to the rollup itself.
   *
   * Schedules the program's two cranks on the Ephemeral Rollup's own task
   * scheduler: a keeper that liquidates a blown-up position every two seconds,
   * and a buzzer that commits both positions and the round status home just
   * after the clock runs out. Both used to be the players' browsers' job, which
   * is why a round nobody was watching never came home.
   *
   * Safe for both players to call: a task this wallet already owns is replaced,
   * and one the other player's client scheduled first is left alone.
   */
  async scheduleRoundCranks(match: PublicKey, payer: PublicKey): Promise<string> {
    return (await this.erProgramAuthed()).methods
      .scheduleRoundCranks()
      .accounts({ payer, matchAccount: match })
      .rpc();
  }

  /**
   * Release this wallet's own access-control list from the rollup.
   *
   * Sealing delegates each position's ACL to the rollup so the rollup can
   * enforce it, and until this nothing brought it back: every duel left both
   * ACLs owned by the delegation program on Solana.
   *
   * Only the wallet the ACL names can do it. The permission program pays for
   * the commit from the authority that signs, and a delegated position PDA
   * cannot pay without a fee vault the permission program does not pass — so
   * neither this program nor the rollup's crank can release it for you. The
   * position goes read-only, which is what lets this run before or after the
   * position's own commit.
   *
   * After the buzzer only: releasing it earlier would unseal a round still in
   * progress. Returns null when there is nothing left to release.
   */
  async releaseOwnAcl(match: PublicKey, owner: PublicKey): Promise<string | null> {
    const position = positionPda(match, owner);
    const permission = permissionPdaFromAccount(position);
    const onL1 = await this.l1.getAccountInfo(permission).catch(() => null);
    if (!onL1 || !onL1.owner.equals(DELEGATION_PROGRAM_ID)) return null;
    // The rollup's copy changes owner the moment a release is scheduled, so a
    // second attempt would be refused there. An unreadable copy is not proof
    // either way, and is sent.
    const onEr = await this.er.getAccountInfo(permission).catch(() => null);
    if (onEr && onEr.owner.equals(DELEGATION_PROGRAM_ID)) return null;

    const ix = createCommitAndUndelegatePermissionInstruction({
      authority: [owner, true],
      permissionedAccount: [position, false],
    });
    // The SDK marks the position writable. The permission program does not
    // write it, and a position already on its way home is not writable on the
    // rollup, so read-only is what lets the order not matter.
    ix.keys[1].isWritable = false;
    const program = await this.erProgramAuthed();
    return program.provider.sendAndConfirm!(new Transaction().add(ix));
  }

  /* ------------------------------ settlement ----------------------------- */

  async requestSettle(match: PublicKey, cranker: PublicKey): Promise<void> {
    await this.l1Program.methods.requestSettle().accounts({ cranker, matchAccount: match }).rpc();
  }

  /**
   * Force-close a position that has run out of equity.
   *
   * Runs on the rollup, where the position lives. Permissionless and safe to
   * call blind: a solvent position is left alone, so the crank fires this at
   * both sides on every beat without needing to know anything private.
   */
  async liquidate(match: PublicKey, cranker: PublicKey, owner: PublicKey): Promise<void> {
    await (await this.erProgramAuthed()).methods
      .liquidate(owner)
      .accounts({
        cranker,
        matchAccount: match,
        priceFeed: feedPda(match, owner),
        position: positionPda(match, owner),
        roundStatus: statusPda(match),
      })
      .rpc();
  }

  /**
   * Who has blown up this round.
   *
   * The one thing about a live round that is public — this account is
   * deliberately never given a permission, so both players and any spectator
   * read it the same way. Everything else about a position stays sealed.
   */
  async fetchRoundStatus(
    match: PublicKey,
    fromEr: boolean
  ): Promise<{ liquidatedA: boolean; liquidatedB: boolean } | null> {
    const program = fromEr ? await this.erProgramAuthed() : this.l1Program;
    const raw = await program.account.roundStatus.fetchNullable(statusPda(match)).catch(() => null);
    return raw ? { liquidatedA: raw.liquidatedA, liquidatedB: raw.liquidatedB } : null;
  }

  /** Delegate the public status account so `liquidate` can write it. */
  async delegateStatus(match: PublicKey, payer: PublicKey): Promise<void> {
    await this.l1Program.methods
      .delegateStatusToEr(this.cluster.validator ? new PublicKey(this.cluster.validator) : null, 0)
      .accounts({ payer, matchAccount: match, roundStatus: statusPda(match) })
      .rpc();
  }

  /** Bring the status account home so `settle_match` can read it on L1. */
  async commitAndUndelegateStatusSig(match: PublicKey, payer: PublicKey): Promise<string> {
    const program = await this.erProgramAuthed();
    return program.methods
      .commitAndUndelegateStatus()
      .accounts({ payer, roundStatus: statusPda(match) })
      .rpc();
  }

  async settleMatch(match: PublicKey, cranker: PublicKey, creator: PublicKey, joiner: PublicKey): Promise<void> {
    await this.l1Program.methods
      .settleMatch()
      .accounts({
        cranker,
        matchAccount: match,
        vault: vaultPda(match),
        priceFeed: feedPda(match, creator),
        priceFeedB: feedPda(match, joiner),
        roundStatus: statusPda(match),
        positionA: positionPda(match, creator),
        positionB: positionPda(match, joiner),
        creator,
        joiner,
        treasury: treasuryPda(),
        tape: tapePda(match),
        statsCreator: statsPda(creator),
        statsJoiner: statsPda(joiner),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /** One wallet's lifetime record, straight from chain. */
  async fetchStats(owner: PublicKey): Promise<PlayerRecord | null> {
    const raw = await this.l1Program.account.playerStats.fetchNullable(statsPda(owner));
    if (!raw) return null;
    return {
      owner: raw.owner,
      wins: raw.wins,
      losses: raw.losses,
      taken: raw.taken.toNumber(),
      staked: raw.staked.toNumber(),
      streak: raw.streak,
      bestStreak: raw.bestStreak,
      lastPlayedTs: raw.lastPlayedTs.toNumber(),
    };
  }

  /** Every player record on chain — the leaderboard, no client-side tally. */
  async fetchAllStats(): Promise<PlayerRecord[]> {
    const all = await this.l1Program.account.playerStats.all();
    return all
      .map((r: { account: Record<string, any> }) => ({
        owner: r.account.owner,
        wins: r.account.wins,
        losses: r.account.losses,
        taken: r.account.taken.toNumber(),
        staked: r.account.staked.toNumber(),
        streak: r.account.streak,
        bestStreak: r.account.bestStreak,
        lastPlayedTs: r.account.lastPlayedTs.toNumber(),
      }))
      .sort((a: PlayerRecord, b: PlayerRecord) => b.taken - a.taken);
  }

  /**
   * Wait until both positions are back under the program on L1.
   *
   * `commit_and_undelegate` only *schedules* the commit: the rollup sends it
   * to the base layer and the ownership flip lands a moment later. Settling
   * before it does hands `settle_match` accounts still owned by the delegation
   * program, and Anchor rejects the whole transaction — which is exactly what
   * the UI did, because this wait existed only inside the scripts.
   *
   * Returns false on timeout rather than throwing, so a caller can say
   * something useful instead of surfacing a raw simulation error.
   */
  async waitForUndelegation(
    match: PublicKey,
    creator: PublicKey,
    joiner: PublicKey,
    timeoutMs = 60_000
  ): Promise<boolean> {
    const keys = [positionPda(match, creator), positionPda(match, joiner)];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const owners = await Promise.all(
        keys.map(async (k) => (await this.l1.getAccountInfo(k))?.owner)
      );
      if (owners.every((o) => o?.equals(this.programId))) return true;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }

  /**
   * Post a mark. `px` is the program's scale — see units.ts.
   *
   * Permissionless on-chain, but rate limited: at most 5% per second. A caller
   * chasing a fast move should walk the mark rather than jump it, which is
   * what `crankPrice` does.
   */
  async pushPrice(
    match: PublicKey,
    authority: PublicKey,
    px: bigint,
    owner: PublicKey,
    onEr = false
  ): Promise<void> {
    const program = onEr ? await this.erProgramAuthed() : this.l1Program;
    await program.methods
      .pushPrice(new BN(px.toString()), owner)
      .accounts({ authority, matchAccount: match, priceFeed: feedPda(match, owner) })
      .rpc();
  }

  /**
   * Move the mark towards `targetPx`, as far as one push is allowed to.
   *
   * The program caps a single push at MAX_PUSH_BPS, so a client that posted a
   * real market price after a sharp move would simply be rejected and the mark
   * would stop tracking. Clamping here means the mark keeps following, one
   * step per call, instead of getting stuck.
   *
   * Returns the mark that was actually posted, or null if it was already there.
   */
  async crankPrice(
    match: PublicKey,
    authority: PublicKey,
    targetPx: bigint,
    owner: PublicKey,
    onEr = false
  ): Promise<bigint | null> {
    const feed = await this.fetchPriceFeed(match, owner, onEr);
    if (!feed || feed.px <= 0n) return null;
    const current = feed.px;

    // All of this is integer arithmetic on chain, and now it is here too.
    // px reaches 7.6e17 for an asset like WBTC, well past where a double can
    // represent consecutive integers — the cap would have been computed from a
    // number that was already wrong, and the post rejected for being a step
    // over a limit it was trying to respect. bigint truncates towards zero,
    // which is the floor the program's exact comparison wants.
    const maxStep = (current * BigInt(MAX_PUSH_BPS)) / BigInt(BPS);
    const lo = current - maxStep;
    const hi = current + maxStep;
    const clamped = targetPx < lo ? lo : targetPx > hi ? hi : targetPx;
    if (clamped === current || clamped <= 0n) return null;

    try {
      await this.pushPrice(match, authority, clamped, owner, onEr);
    } catch (e) {
      // `PriceTooSoon` is the program saying "come back in a moment", so it is
      // always a wait rather than a fault. It fires against our *own* last
      // post too: MIN_PUSH_INTERVAL is measured on the cluster clock, which
      // ticks in whole seconds, so two posts 1.1s apart in wall time can still
      // land in the same on-chain second. The old handler only forgave the
      // error when *somebody else* had moved the feed, so a script walking the
      // mark on its own — `prove:privacy` — crashed on its own rate limit.
      if (isProgramError(e, 'PriceTooSoon')) return null;

      // Both players crank the same feed, so losing the race is the normal
      // case rather than a fault. Decided by re-reading the feed instead of
      // matching on the error text: two posts landing in the same slot come
      // back from Anchor with no message and no logs at all, so there is
      // nothing to match on — but the feed itself says plainly whether
      // somebody else just moved it.
      const after = await this.fetchPriceFeed(match, owner, onEr);
      if (after && after.updatedTs > feed.updatedTs) return null;
      throw e;
    }
    return clamped;
  }

  /**
   * Walk the mark to `targetPx`, respecting the on-chain rate limit.
   *
   * For scripts and tests that want a specific mark rather than a live feed.
   * The product does not use this — a real round follows the market, one
   * clamped step at a time, and never teleports it.
   */
  async walkPriceTo(
    match: PublicKey,
    authority: PublicKey,
    targetPx: bigint,
    owner: PublicKey,
    onEr = false,
    maxSteps = 12
  ): Promise<bigint> {
    let last = await this.fetchPrice(match, owner, onEr);
    for (let i = 0; i < maxSteps; i += 1) {
      const gap = last > targetPx ? last - targetPx : targetPx - last;
      if (gap <= (targetPx / 10_000n > 1n ? targetPx / 10_000n : 1n)) break;
      // MIN_PUSH_INTERVAL is one second against the cluster clock, and the
      // feed was last written when the match was created — so wait before the
      // first post too, not only between posts.
      await new Promise((r) => setTimeout(r, 1100));
      const posted = await this.crankPrice(match, authority, targetPx, owner, onEr);
      if (posted === null) continue;
      last = posted;
    }
    return last;
  }

  /* -------------------------------- reads -------------------------------- */

  /**
   * One decoder for a Match account, used by every read.
   *
   * There were two copies of this and they drifted twice — `symbol` and then
   * `createdTs` were added to one and not the other, so the open book showed
   * fields the match screen did not.
   */
  private toMatchState(address: PublicKey, a: Record<string, any>): MatchState {
    return {
      address,
      creator: a.creator,
      joiner: a.joiner ?? null,
      legA: decodeLegRaw(a.legA),
      legB: decodeLegRaw(a.legB),
      createdTs: a.createdTs.toNumber(),
      matchId: a.matchId.toNumber(),
      startTs: a.startTs.toNumber(),
      duration: a.duration.toNumber(),
      entry: a.entry.toNumber(),
      status: decodeStatus(a.status),
      pot: a.pot.toNumber(),
      winner: a.winner ?? null,
      pnlABps: a.pnlABps.toNumber(),
      pnlBBps: a.pnlBBps.toNumber(),
    };
  }

  async fetchMatch(match: PublicKey): Promise<MatchState | null> {
    const raw = await this.l1Program.account.match.fetchNullable(match);
    return raw ? this.toMatchState(match, raw) : null;
  }

  /**
   * Matches past their buzzer that have not been settled.
   *
   * Anyone may settle these — the instructions are permissionless — which is
   * what stops a closed browser tab from stranding a pot.
   */
  async fetchExpiredMatches(): Promise<MatchState[]> {
    const now = Math.floor(Date.now() / 1000);
    const all = await this.l1Program.account.match.all();
    return all
      .map((m: { publicKey: PublicKey; account: Record<string, any> }) =>
        this.toMatchState(m.publicKey, m.account))
      .filter(
        (m: MatchState) =>
          (m.status === 'live' || m.status === 'settling') &&
          m.startTs > 0 &&
          now >= m.startTs + m.duration
      );
  }

  /**
   * A live match this wallet is in, if there is one.
   *
   * Rounds last minutes and a browser can be refreshed, so "what was I doing"
   * has to be answerable from chain. Without this a reload drops the player in
   * the lobby while their entry is still escrowed in a running match.
   */
  async fetchMyLiveMatch(owner: PublicKey): Promise<MatchState | null> {
    const now = Math.floor(Date.now() / 1000);
    const all = await this.l1Program.account.match.all();
    const mine = all
      .map((m: { publicKey: PublicKey; account: Record<string, any> }) =>
        this.toMatchState(m.publicKey, m.account))
      .filter(
        (m: MatchState) =>
          m.status === 'live' &&
          m.joiner !== null &&
          (m.creator.equals(owner) || m.joiner.equals(owner)) &&
          // Still running. An expired one belongs to settlement, not to a
          // resumed round.
          now < m.startTs + m.duration
      )
      .sort((a: MatchState, b: MatchState) => b.startTs - a.startTs);
    return mine[0] ?? null;
  }

  /** An open match this wallet created and nobody has taken yet. */
  async fetchMyOpenMatch(owner: PublicKey): Promise<MatchState | null> {
    const open = await this.fetchOpenMatches();
    return (
      open
        .filter((m) => m.creator.equals(owner))
        .sort((a, b) => b.createdTs - a.createdTs)[0] ?? null
    );
  }

  /** Every match that is still open to join. */
  async fetchOpenMatches(): Promise<MatchState[]> {
    const all = await this.l1Program.account.match.all();
    return all
      .map((m: { publicKey: PublicKey; account: Record<string, any> }) =>
        this.toMatchState(m.publicKey, m.account))
      .filter((m: MatchState) => m.status === 'open');
  }

  /**
   * Read a position. During a live round the account lives on the ER, so read
   * it there; afterwards it has been committed back and L1 is authoritative.
   */
  /**
   * A position, from the rollup or from L1.
   *
   * A rollup read goes through the front door, which refuses a sealed position
   * to anyone without a token — so sign in first if we can. Passing `owner` as
   * somebody else will simply be refused, which is the point.
   */
  async fetchPosition(match: PublicKey, owner: PublicKey, fromEr: boolean): Promise<PositionState | null> {
    const program = fromEr ? await this.erProgramAuthed() : this.l1Program;
    const raw = await program.account.position.fetchNullable(positionPda(match, owner));
    if (!raw) return null;
    return {
      owner: raw.owner,
      quoteBalance: raw.quoteBalance.toNumber(),
      baseQty: raw.baseQty.toNumber(),
      avgPx: raw.avgPx.toNumber(),
      realized: raw.realized.toNumber(),
      lastPx: raw.lastPx.toNumber(),
      fillCount: raw.fillCount,
      fills: (raw.fills ?? []).map((f: Record<string, any>) => ({
        side: Object.keys(f.side)[0].toUpperCase(),
        qty: f.qty.toNumber(),
        px: f.px.toNumber(),
        ts: f.ts.toNumber(),
      })),
      book: {
        virtualBase: raw.book.virtualBase.toNumber(),
        virtualQuote: raw.book.virtualQuote.toNumber(),
        seedPx: raw.book.seedPx.toNumber(),
      },
    };
  }

  /** The posted mark, with the moment it was posted. */
  async fetchPriceFeed(
    match: PublicKey,
    owner: PublicKey,
    fromEr: boolean
  ): Promise<{ px: bigint; updatedTs: number } | null> {
    const program = fromEr ? await this.erProgramAuthed() : this.l1Program;
    const raw = await program.account.priceFeed.fetchNullable(feedPda(match, owner));
    // `toString()` rather than `toNumber()`: a px above ~9e15 is exactly what
    // this release added support for, and `toNumber()` throws on it.
    return raw ? { px: BigInt(raw.px.toString()), updatedTs: raw.updatedTs.toNumber() } : null;
  }

  /** The posted mark as a `px`. See units.ts. */
  async fetchPrice(match: PublicKey, owner: PublicKey, fromEr: boolean): Promise<bigint> {
    return (await this.fetchPriceFeed(match, owner, fromEr))?.px ?? 0n;
  }

  /**
   * The public record of a settled duel, decoded.
   *
   * Carries both players' real fill lists, which is the only place the
   * opponent's trading is ever legible — see tape.ts for what can be
   * reconstructed from them.
   */
  async fetchTape(match: PublicKey): Promise<TapeState | null> {
    const raw = await this.l1Program.account.tape.fetchNullable(tapePda(match));
    return raw ? toTapeState(raw) : null;
  }

  /** All settled tapes, newest first — the feed. */
  async fetchAllTapes(): Promise<TapeState[]> {
    const all = await this.l1Program.account.tape.all();
    return all
      .map((t: { publicKey: PublicKey; account: Record<string, any> }) => toTapeState(t.account))
      .sort((a: TapeState, b: TapeState) => b.settledTs - a.settledTs);
  }

  async balance(owner: PublicKey): Promise<number> {
    return this.l1.getBalance(owner);
  }
}

/**
 * PnL in basis points against the starting quote balance.
 *
 * `px` is lamports per token x PRICE_SCALE and `baseQty` is tokens x
 * BASE_SCALE, so their product over VALUE_DIV is lamports — the same currency
 * as the quote balance and the entry. Mirrors `Position::equity` on-chain
 * exactly; a client that computed this differently would show a winner the
 * chain disagrees with, and dividing by BASE_SCALE alone put +29,813,639% on
 * the screen of a position that was flat.
 */
export const pnlBps = (position: PositionState, px: number, entry: number): number => {
  if (entry === 0) return 0;
  const equity = position.quoteBalance + (position.baseQty * px) / VALUE_DIV;
  return Math.trunc(((equity - entry) * BPS) / entry);
};
