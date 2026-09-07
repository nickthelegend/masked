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
import { Connection, PublicKey, SystemProgram, type Commitment } from '@solana/web3.js';
import {
  EPHEMERAL_VAULT_ID,
  MAGIC_PROGRAM_ID,
  PERMISSION_PROGRAM_ID,
  permissionPdaFromAccount,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { FOGDUEL_IDL as idl } from './idl';
import { ACTIVE_CLUSTER, type ClusterConfig } from './config';
import { feedPda, matchPda, positionPda, statsPda, tapePda, treasuryPda, vaultPda } from './pdas';
import { authenticate, type MessageSigner } from './erAuth';

const COMMITMENT: Commitment = 'confirmed';

/** Prices and base quantities are integers scaled by 1e6 on-chain. */
export const PRICE_SCALE = 1_000_000;
/** Mirrors `MAX_PUSH_BPS` in state.rs: the per-push cap on the mark. */
export const MAX_PUSH_BPS = 500;
export const BASE_SCALE = 1_000_000;
export const BPS = 10_000;

export type Side = 'buy' | 'sell';
export type MarketKind = 'meme' | 'major';

export interface FillRecord {
  side: string;
  qty: number;
  px: number;
  ts: number;
}

export interface MatchState {
  address: PublicKey;
  creator: PublicKey;
  joiner: PublicKey | null;
  /** The market this duel is fought over. */
  mint: PublicKey;
  /** Where the mark comes from: a pump.fun curve, or an aggregator. */
  marketType: MarketKind;
  /** Ticker, as written on chain at create time. */
  symbol: string;
  /** Full market name, as written on chain at create time. */
  name: string;
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
    startPx: number;
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
        new BN(Math.round(args.startPx)),
        kind === 'meme' ? { meme: {} } : { major: {} },
        (args.symbol ?? '').slice(0, 12),
        (args.name ?? '').slice(0, 32)
      )
      .accounts({
        creator: args.creator,
        matchAccount: match,
        vault: vaultPda(match),
        priceFeed: feedPda(match),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return match;
  }

  async joinMatch(match: PublicKey, joiner: PublicKey, creator: PublicKey): Promise<void> {
    await this.l1Program.methods
      .joinMatch()
      .accounts({
        joiner,
        matchAccount: match,
        vault: vaultPda(match),
        priceFeed: feedPda(match),
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
    for (const owner of [creator, joiner]) {
      // Idempotent on the program side, so a retry after a partial failure is
      // safe rather than fatal.
      await this.createPositionPermission(match, owner, payer);
    }
    for (const owner of [creator, joiner]) {
      await this.delegatePositionPermission(match, owner, payer);
    }
    for (const owner of [creator, joiner]) {
      await this.delegatePosition(match, owner, payer);
    }
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
    return (pos.book.virtualQuote * BASE_SCALE) / pos.book.virtualBase;
  }

  /**
   * Mark a delegated position private on a TEE rollup.
   *
   * Runs on the ER, not L1, and only works on a TEE validator — on a plain
   * rollup the permission account is not delegated and the write is refused.
   * Called after sealAndDelegateMatch when `cluster.tee` is true.
   */
  async initPositionPrivacy(match: PublicKey, owner: PublicKey, payer: PublicKey): Promise<void> {
    await (await this.erProgramAuthed()).methods
      .initPositionPrivacy(owner)
      .accounts({
        payer,
        matchAccount: match,
        position: positionPda(match, owner),
        permission: permissionPdaFromAccount(positionPda(match, owner)),
        ephemeralVault: EPHEMERAL_VAULT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
        permissionProgram: PERMISSION_PROGRAM_ID,
      })
      .rpc();
  }

  /** Is this position's ACL actually on chain? Read, never assumed. */
  async isPositionSealed(match: PublicKey, owner: PublicKey): Promise<boolean> {
    const permission = permissionPdaFromAccount(positionPda(match, owner));
    const info = await this.l1.getAccountInfo(permission).catch(() => null);
    return !!info;
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
  async applyFill(match: PublicKey, player: PublicKey, side: Side, amount: number): Promise<string> {
    return (await this.erProgramAuthed()).methods
      .applyFill(sideArg(side), new BN(Math.round(amount)))
      .accounts({
        player,
        matchAccount: match,
        priceFeed: feedPda(match),
        position: positionPda(match, player),
      })
      .rpc();
  }

  /**
   * Bring both positions home from the rollup.
   *
   * One transaction each: a Position is 543 bytes and two will not fit in one
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
      sigs.push(
        await (await this.erProgramAuthed()).methods
          .commitAndUndelegatePosition()
          .accounts({ payer, position: positionPda(match, owner) })
          .rpc()
      );
    }
    return sigs;
  }

  /* ------------------------------ settlement ----------------------------- */

  async requestSettle(match: PublicKey, cranker: PublicKey): Promise<void> {
    await this.l1Program.methods.requestSettle().accounts({ cranker, matchAccount: match }).rpc();
  }

  async settleMatch(match: PublicKey, cranker: PublicKey, creator: PublicKey, joiner: PublicKey): Promise<void> {
    await this.l1Program.methods
      .settleMatch()
      .accounts({
        cranker,
        matchAccount: match,
        vault: vaultPda(match),
        priceFeed: feedPda(match),
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
   * Post a mark. `px` is the program's scale — see units.ts.
   *
   * Permissionless on-chain, but rate limited: at most 5% per second. A caller
   * chasing a fast move should walk the mark rather than jump it, which is
   * what `crankPrice` does.
   */
  async pushPrice(match: PublicKey, authority: PublicKey, px: number, onEr = false): Promise<void> {
    const program = onEr ? await this.erProgramAuthed() : this.l1Program;
    await program.methods
      .pushPrice(new BN(Math.round(px)))
      .accounts({ authority, matchAccount: match, priceFeed: feedPda(match) })
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
    targetPx: number,
    onEr = false
  ): Promise<number | null> {
    const feed = await this.fetchPriceFeed(match, onEr);
    if (!feed || feed.px <= 0) return null;
    const current = feed.px;

    // Floored, and divided before multiplying, for two separate reasons.
    //
    // Floored because the on-chain cap is an exact integer comparison: a 5%
    // step is very often fractional, and rounding it up puts the post one
    // lamport over the limit, which the program rejects outright.
    //
    // Divided first because px runs to 1e15 for SOL, and `px * 10000` leaves
    // the range where a double is exact — the cap would then be computed from
    // a number that is already wrong.
    const maxStep = Math.floor((current / BPS) * MAX_PUSH_BPS);
    const clamped = Math.max(
      current - maxStep,
      Math.min(current + maxStep, Math.round(targetPx))
    );
    if (clamped === current || clamped <= 0) return null;

    try {
      await this.pushPrice(match, authority, clamped, onEr);
    } catch (e) {
      // Both players crank the same feed, so losing the race is the normal
      // case rather than a fault. Decided by re-reading the feed instead of
      // matching on the error text: two posts landing in the same slot come
      // back from Anchor with no message and no logs at all, so there is
      // nothing to match on — but the feed itself says plainly whether
      // somebody else just moved it.
      const after = await this.fetchPriceFeed(match, onEr);
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
    targetPx: number,
    onEr = false,
    maxSteps = 12
  ): Promise<number> {
    let last = await this.fetchPrice(match, onEr);
    for (let i = 0; i < maxSteps; i += 1) {
      if (Math.abs(last - targetPx) <= Math.max(1, targetPx / 10_000)) break;
      // MIN_PUSH_INTERVAL is one second against the cluster clock, and the
      // feed was last written when the match was created — so wait before the
      // first post too, not only between posts.
      await new Promise((r) => setTimeout(r, 1100));
      const posted = await this.crankPrice(match, authority, targetPx, onEr);
      if (posted === null) continue;
      last = posted;
    }
    return last;
  }

  /* -------------------------------- reads -------------------------------- */

  async fetchMatch(match: PublicKey): Promise<MatchState | null> {
    const raw = await this.l1Program.account.match.fetchNullable(match);
    if (!raw) return null;
    return {
      address: match,
      creator: raw.creator,
      joiner: raw.joiner ?? null,
      mint: raw.mint,
      marketType: decodeMarketType(raw.marketType),
      symbol: decodeFixed(raw.symbol),
      name: decodeFixed(raw.name),
      matchId: raw.matchId.toNumber(),
      startTs: raw.startTs.toNumber(),
      duration: raw.duration.toNumber(),
      entry: raw.entry.toNumber(),
      status: decodeStatus(raw.status),
      pot: raw.pot.toNumber(),
      winner: raw.winner ?? null,
      pnlABps: raw.pnlABps.toNumber(),
      pnlBBps: raw.pnlBBps.toNumber(),
    };
  }

  /** Every match that is still open to join. */
  async fetchOpenMatches(): Promise<MatchState[]> {
    const all = await this.l1Program.account.match.all();
    return all
      .map((m: { publicKey: PublicKey; account: Record<string, any> }) => ({
        address: m.publicKey,
        creator: m.account.creator,
        joiner: m.account.joiner ?? null,
        mint: m.account.mint,
        marketType: decodeMarketType(m.account.marketType),
        symbol: decodeFixed(m.account.symbol),
        name: decodeFixed(m.account.name),
        matchId: m.account.matchId.toNumber(),
        startTs: m.account.startTs.toNumber(),
        duration: m.account.duration.toNumber(),
        entry: m.account.entry.toNumber(),
        status: decodeStatus(m.account.status),
        pot: m.account.pot.toNumber(),
        winner: m.account.winner ?? null,
        pnlABps: m.account.pnlABps.toNumber(),
        pnlBBps: m.account.pnlBBps.toNumber(),
      }))
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
    fromEr: boolean
  ): Promise<{ px: number; updatedTs: number } | null> {
    const program = fromEr ? await this.erProgramAuthed() : this.l1Program;
    const raw = await program.account.priceFeed.fetchNullable(feedPda(match));
    return raw ? { px: raw.px.toNumber(), updatedTs: raw.updatedTs.toNumber() } : null;
  }

  /** The posted mark as a `px`. See units.ts. */
  async fetchPrice(match: PublicKey, fromEr: boolean): Promise<number> {
    return (await this.fetchPriceFeed(match, fromEr))?.px ?? 0;
  }

  async fetchTape(match: PublicKey) {
    return this.l1Program.account.tape.fetchNullable(tapePda(match));
  }

  /** All settled tapes, newest first — the feed. */
  async fetchAllTapes() {
    const all = await this.l1Program.account.tape.all();
    return all
      .map((t: { publicKey: PublicKey; account: Record<string, any> }) => t.account)
      .sort((a: Record<string, any>, b: Record<string, any>) => b.settledTs.toNumber() - a.settledTs.toNumber());
  }

  async balance(owner: PublicKey): Promise<number> {
    return this.l1.getBalance(owner);
  }
}

/**
 * PnL in basis points against the starting quote balance.
 *
 * `px` is lamports per traded unit and `baseQty` is units x BASE_SCALE, so
 * their product over BASE_SCALE is lamports — the same currency as the quote
 * balance and the entry. Mirrors `Position::pnl_bps` on-chain exactly; a
 * client that computed this differently would show a winner the chain
 * disagrees with.
 */
export const pnlBps = (position: PositionState, px: number, entry: number): number => {
  if (entry === 0) return 0;
  const equity = position.quoteBalance + (position.baseQty * px) / BASE_SCALE;
  return Math.trunc(((equity - entry) * BPS) / entry);
};
