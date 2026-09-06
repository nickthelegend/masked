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

const COMMITMENT: Commitment = 'confirmed';

/** Prices and base quantities are integers scaled by 1e6 on-chain. */
export const PRICE_SCALE = 1_000_000;
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

const decodeStatus = (raw: Record<string, unknown>): MatchState['status'] =>
  (Object.keys(raw)[0] as MatchState['status']) ?? 'open';

export class FogduelClient {
  readonly cluster: ClusterConfig;
  readonly l1: Connection;
  readonly er: Connection;
  private readonly l1Program: AnyProgram;
  private readonly erProgram: AnyProgram;

  constructor(wallet: Wallet, cluster: ClusterConfig = ACTIVE_CLUSTER) {
    this.cluster = cluster;
    this.l1 = new Connection(cluster.l1, COMMITMENT);
    this.er = new Connection(cluster.er, COMMITMENT);

    const l1Provider = new AnchorProvider(this.l1, wallet, { commitment: COMMITMENT });
    const erProvider = new AnchorProvider(this.er, wallet, { commitment: COMMITMENT });
    this.l1Program = new Program(idl as Idl, l1Provider) as AnyProgram;
    this.erProgram = new Program(idl as Idl, erProvider) as AnyProgram;
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
    await this.erProgram.methods
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
    return this.erProgram.methods
      .applyFill(sideArg(side), new BN(Math.round(amount)))
      .accounts({
        player,
        matchAccount: match,
        priceFeed: feedPda(match),
        position: positionPda(match, player),
      })
      .rpc();
  }

  async commitAndUndelegate(match: PublicKey, payer: PublicKey, creator: PublicKey, joiner: PublicKey): Promise<void> {
    await this.erProgram.methods
      .commitAndUndelegatePositions()
      .accounts({
        payer,
        positionA: positionPda(match, creator),
        positionB: positionPda(match, joiner),
      })
      .rpc();
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

  /** Post an oracle mark. `px` is lamports per traded unit — see units.ts. */
  async pushPrice(match: PublicKey, authority: PublicKey, px: number, onEr = false): Promise<void> {
    const program = onEr ? this.erProgram : this.l1Program;
    await program.methods
      .pushPrice(new BN(Math.round(px)))
      .accounts({ authority, priceFeed: feedPda(match) })
      .rpc();
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
  async fetchPosition(match: PublicKey, owner: PublicKey, fromEr: boolean): Promise<PositionState | null> {
    const program = fromEr ? this.erProgram : this.l1Program;
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

  /** The posted oracle mark as a `px`: lamports per traded unit. */
  async fetchPrice(match: PublicKey, fromEr: boolean): Promise<number> {
    const program = fromEr ? this.erProgram : this.l1Program;
    const raw = await program.account.priceFeed.fetchNullable(feedPda(match));
    return raw ? raw.px.toNumber() : 0;
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
