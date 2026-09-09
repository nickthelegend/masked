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
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';
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
  /** Matches with both players in, clock running. */
  live: number;
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

export function useProtocolStats(pollMs = 20_000): ProtocolStats {
  const [stats, setStats] = useState<ProtocolStats>(EMPTY);

  useEffect(() => {
    let alive = true;

    const read = async () => {
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
        const live = matches.filter((m: any) => statusOf(m) === 'live').length;

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
          fills += a.fillsA.length + a.fillsB.length;
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

    void read();
    const id = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return stats;
}
