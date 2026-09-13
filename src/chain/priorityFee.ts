/**
 * Priority fees, priced from what the cluster is actually charging.
 *
 * A fixed compute-unit price is wrong in both directions: on a quiet cluster it
 * pays for nothing, and under load it is outbid. `getRecentPrioritizationFees`
 * returns, per recent slot, the lowest fee that landed a transaction touching
 * the given accounts — the market rate for exactly the accounts a transaction
 * writes. This takes a percentile of that and prices the transaction there.
 *
 * On devnet the rate is almost always zero (median 0 and p90 0 over 150 slots
 * on 2026-09-13), so the usual result is no instruction at all: a transaction
 * that pays nothing extra when nothing extra buys a place.
 */
import { ComputeBudgetProgram, type Connection, type PublicKey, type TransactionInstruction } from '@solana/web3.js';

export interface PriorityFeeEstimate {
  /** Micro-lamports per compute unit. */
  microLamports: number;
  /** Slots the estimate was taken over. */
  samples: number;
  /** How many of them charged anything. */
  nonZero: number;
  percentile: number;
}

/**
 * The fee at `percentile` of recent slots for these accounts, never below
 * `floor`. Pass the accounts the transaction will write: the RPC's answer is
 * the rate for transactions that locked them.
 */
export async function estimatePriorityFee(
  connection: Connection,
  writableAccounts: PublicKey[],
  { percentile = 75, floor = 0 }: { percentile?: number; floor?: number } = {}
): Promise<PriorityFeeEstimate> {
  const recent = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: writableAccounts });
  const fees = recent.map((r) => r.prioritizationFee).sort((a, b) => a - b);
  const at = fees.length === 0 ? 0 : fees[Math.min(fees.length - 1, Math.floor((fees.length * percentile) / 100))];
  return {
    microLamports: Math.max(floor, at),
    samples: fees.length,
    nonZero: fees.filter((f) => f > 0).length,
    percentile,
  };
}

/**
 * The compute-budget instructions for a price and a unit limit, or none when
 * the price is zero — a zero price instruction still costs bytes and buys
 * nothing.
 */
export function priorityFeeInstructions(microLamports: number, units: number): TransactionInstruction[] {
  if (microLamports <= 0) return [];
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
}

/** Lamports the priority part of a transaction costs: ceil(price x limit / 1e6). */
export const priorityFeeLamports = (microLamports: number, units: number): number =>
  microLamports <= 0 ? 0 : Math.ceil((microLamports * units) / 1_000_000);
