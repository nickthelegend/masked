/**
 * Protocol-wide numbers, aggregated from chain.
 *
 * Everything here is summed from `Tape` and `Match` accounts and the treasury's
 * own lamport balance — there is no analytics service and no counter the app
 * increments. That matters for the rake in particular: it is read from the
 * account the program actually pays into, so if the treasury and the sum of
 * every tape's `rake` ever disagreed, this page would show it rather than hide
 * it behind one number computed twice the same way.
 */
import { useEffect, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl, utils } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER, FOGDUEL_PROGRAM_ID } from './config';
import { treasuryPda } from './pdas';
import { withDeadline } from './rpcTimeout';
import { decodeFixed } from './tape';

/** One market's whole history on this cluster. */
export interface MarketStat {
  symbol: string;
  mint: string;
  /** Duels in which this market was one of the two legs. */
  duels: number;
  /** Lamports staked across those duels — both sides of each pot. */
  volumeLamports: number;
  /** The biggest single pot fought over this market, in lamports. */
  biggestPotLamports: number;
}

export interface ProtocolStats {
  loaded: boolean;
  reachable: boolean;
  /** Duels that reached settlement and wrote a tape. */
  settled: number;
  /** Matches open and waiting for an opponent. */
  open: number;
  /**
   * Matches with both players in and the clock genuinely still running.
   *
   * Not every match whose on-chain status is `live`. Settlement is
   * permissionless but not automatic, so a round whose duration ran out while
   * both players had their tabs closed keeps that status until somebody
   * settles it. Counting those as live is the defect `/proof` already fixed —
   * it listed twelve finished duels under LIVE RIGHT NOW, all frozen at 0:00,
   * which reads as a broken clock rather than as the truth.
   */
  live: number;
  /** Status `live`, clock run out, nobody has settled them yet. */
  awaitingSettlement: number;
  /** Lamports paid to winners, summed from every tape. */
  paidLamports: number;
  /** Lamports taken as rake, summed from every tape. */
  rakeLamports: number;
  /**
   * The treasury account's actual balance.
   *
   * Read from the account rather than derived, so it can be compared against
   * `rakeLamports` instead of restating it.
   */
  treasuryLamports: number;
  /**
   * The treasury's rent-exempt floor — lamports it must always hold to exist.
   *
   * The balance is rake *plus* this, and the difference is not a discrepancy:
   * `settle_match` refuses to pay out below the floor, so those lamports can
   * never be part of the rake. Comparing the raw balance against the tape sum
   * reports a 953,520-lamport "leak" that is really the account being alive.
   */
  treasuryRentFloor: number;
  /** Wallets that have settled at least one duel. */
  players: number;
  /** The largest pot ever settled, in lamports. */
  biggestPotLamports: number;
  /** Fills recorded across every settled tape, both sides. */
  fills: number;
  /** Markets, busiest first. */
  markets: MarketStat[];
}

const EMPTY: ProtocolStats = {
  loaded: false,
  reachable: true,
  settled: 0,
  open: 0,
  live: 0,
  awaitingSettlement: 0,
  paidLamports: 0,
  rakeLamports: 0,
  treasuryLamports: 0,
  treasuryRentFloor: 0,
  players: 0,
  biggestPotLamports: 0,
  fills: 0,
  markets: [],
};

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

/** The fastest a burst of account changes can make this re-read everything. */
const MIN_READ_GAP_MS = 5_000;
/**
 * The read that still happens with nothing changing, in case the socket died
 * without saying so. Subscriptions are best effort on any cluster.
 */
const SAFETY_POLL_MS = 60_000;

/**
 * Read on change, not on a clock.
 *
 * Every read here is two full `getProgramAccounts` sweeps plus the treasury,
 * and it used to run every `pollMs` whether or not anything had happened. Now a
 * subscription wakes it: fogduel accounts filtered to the Match and Tape types
 * (a match opens, is joined, settles or is cancelled; a tape is written) and
 * the treasury account. The mark crank writes `PriceFeed` every few seconds,
 * which is exactly why the filter is on the account type: an unfiltered program
 * subscription would re-read on every price push. Bursts are coalesced to one
 * read per MIN_READ_GAP_MS, and SAFETY_POLL_MS still re-reads if the socket
 * silently stops.
 */
export function useProtocolStats(pollMs = 20_000): ProtocolStats {
  const [stats, setStats] = useState<ProtocolStats>(EMPTY);

  useEffect(() => {
    let alive = true;
    let lastRead = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const read = async () => {
      lastRead = Date.now();
      try {
        const connection = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const provider = new AnchorProvider(connection, readOnlyWallet as never, {
          commitment: 'confirmed',
        });
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const program = new Program(FOGDUEL_IDL as Idl, provider) as any;

        const treasuryKey = treasuryPda();
        const [matches, tapes, treasury, treasuryInfo] = await withDeadline(
          Promise.all([
            program.account.match.all(),
            program.account.tape.all(),
            connection.getBalance(treasuryKey),
            connection.getAccountInfo(treasuryKey),
          ]),
          'the base layer'
        );
        const rentFloor = treasuryInfo
          ? await connection.getMinimumBalanceForRentExemption(treasuryInfo.data.length)
          : 0;
        if (!alive) return;

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const statusOf = (m: any) => Object.keys(m.account.status)[0];
        const open = matches.filter((m: any) => statusOf(m) === 'open').length;
        const nowSecs = Math.floor(Date.now() / 1000);
        const liveStatus = matches.filter((m: any) => statusOf(m) === 'live');
        const isRunning = (m: any) =>
          m.account.duration - (nowSecs - m.account.startTs.toNumber()) > 0;
        const live = liveStatus.filter(isRunning).length;
        const awaitingSettlement = liveStatus.length - live;

        let paid = 0;
        let rake = 0;
        let biggest = 0;
        let fills = 0;
        const players = new Set<string>();
        const byMint = new Map<string, MarketStat>();

        for (const t of tapes) {
          const a = t.account;
          const potPaid = a.potPaid.toNumber();
          const potRake = a.rake.toNumber();
          const pot = potPaid + potRake;

          paid += potPaid;
          rake += potRake;
          if (pot > biggest) biggest = pot;
          // Every fill made, not the last MAX_FILLS a tape keeps per side.
          // Tapes written before the count existed fall back to what is stored.
          fills +=
            Math.max(typeof a.fillCountA === 'number' ? a.fillCountA : 0, a.fillsA.length) +
            Math.max(typeof a.fillCountB === 'number' ? a.fillCountB : 0, a.fillsB.length);
          players.add(a.playerA.toBase58());
          players.add(a.playerB.toBase58());

          // Both legs count: a duel over WOFI and SOL is a duel for each of
          // them. The pot is the whole pot on both, because both markets are
          // what it was fought over — this is "how much has ridden on this
          // market", not a split of the money.
          for (const leg of [a.legA, a.legB]) {
            const mint = leg.mint.toBase58();
            const prev = byMint.get(mint);
            if (prev) {
              prev.duels += 1;
              prev.volumeLamports += pot;
              if (pot > prev.biggestPotLamports) prev.biggestPotLamports = pot;
            } else {
              byMint.set(mint, {
                mint,
                symbol: decodeFixed(leg.symbol) || `${mint.slice(0, 4)}…`,
                duels: 1,
                volumeLamports: pot,
                biggestPotLamports: pot,
              });
            }
          }
        }

        setStats({
          loaded: true,
          reachable: true,
          settled: tapes.length,
          open,
          live,
          awaitingSettlement,
          paidLamports: paid,
          rakeLamports: rake,
          treasuryLamports: treasury,
          treasuryRentFloor: rentFloor,
          players: players.size,
          biggestPotLamports: biggest,
          fills,
          markets: [...byMint.values()].sort(
            (x, y) => y.duels - x.duels || y.volumeLamports - x.volumeLamports
          ),
        });
      } catch {
        // Unknown is not zero. A dead RPC must not render as an empty chain.
        if (alive) setStats((s) => ({ ...s, loaded: true, reachable: false }));
      }
    };

    const schedule = () => {
      if (pending || !alive) return;
      const wait = Math.max(0, lastRead + MIN_READ_GAP_MS - Date.now());
      pending = setTimeout(() => {
        pending = null;
        void read();
      }, wait);
    };

    const socket = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const programSubs: number[] = [];
    const accountSubs: number[] = [];
    let subscribed = false;
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const idlAccounts = (FOGDUEL_IDL as any).accounts as { name: string; discriminator: number[] }[];
      for (const name of ['Match', 'Tape']) {
        const discriminator = idlAccounts.find((a) => a.name === name)?.discriminator;
        if (!discriminator) continue;
        programSubs.push(
          socket.onProgramAccountChange(FOGDUEL_PROGRAM_ID, schedule, 'confirmed', [
            { memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(Buffer.from(discriminator)) } },
          ])
        );
      }
      accountSubs.push(socket.onAccountChange(treasuryPda(), schedule, 'confirmed'));
      subscribed = programSubs.length === 2;
    } catch {
      subscribed = false;
    }

    void read();
    // Subscribed, the clock is only a safety net; without subscriptions it is
    // the only way to hear about anything, so it keeps the caller's pace.
    const id = setInterval(read, subscribed ? Math.max(pollMs, SAFETY_POLL_MS) : pollMs);
    return () => {
      alive = false;
      clearInterval(id);
      if (pending) clearTimeout(pending);
      programSubs.forEach((sub) => void socket.removeProgramAccountChangeListener(sub));
      accountSubs.forEach((sub) => void socket.removeAccountChangeListener(sub));
    };
  }, [pollMs]);

  return stats;
}
