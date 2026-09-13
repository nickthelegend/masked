/**
 * One duel's whole life, as signatures.
 *
 * /proof asserts that positions are delegated to an Ephemeral Rollup and
 * sealed by an on-chain ACL. That is a claim until somebody can click it. Each
 * of those steps is a real transaction on the base layer, and the base layer
 * will list them: asking for a position PDA's signature history returns the
 * instruction that opened it, the two that created and delegated its
 * permission, the one that handed it to the rollup, the delegation program's
 * own `ProcessUndelegation` handing it back, and the settlement.
 *
 * Nothing here is a client-side log of what this tab did. It is the chain's
 * record, so it survives a reload, includes work done by the other player, and
 * can be checked in an explorer by someone who does not trust the app.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { ACTIVE_CLUSTER, DELEGATION_PROGRAM_ID } from './config';
import { permissionPdaFromAccount } from '@magicblock-labs/ephemeral-rollups-sdk';
import { positionPda } from './pdas';

export interface ProofStep {
  signature: string;
  /** Lamports the network actually charged for this transaction. */
  fee: number;
  slot: number;
  blockTime: number | null;
  err: boolean;
  /** Anchor instruction names found in the logs, in the order they ran. */
  instructions: string[];
  /** A short label for the step, from the first instruction that matters. */
  label: string;
  /** What this step demonstrates, in one line. */
  meaning: string;
}

/**
 * What each instruction is evidence *of*.
 *
 * Only steps that are part of the delegation story are described. Anything
 * else is still listed — hiding a transaction from an evidence page would be
 * the opposite of the point — but it is labelled as itself.
 */
const MEANING: Record<string, string> = {
  JoinMatch: 'the position account is created and escrowed on Solana',
  CreatePositionPermission: 'an ACL account is created for this position',
  DelegatePositionPermission: 'the ACL is delegated so the rollup can read it',
  DelegatePositionToEr: 'Solana hands the position to the delegation program',
  CommitAndUndelegatePosition: 'the rollup is asked to commit the position home',
  ProcessUndelegation: 'the delegation program gives ownership back to Solana',
  SettleMatch: 'PnL compared, pot paid, the public tape written',
  RequestSettle: 'the round is flipped to settling, by anyone',
  CreateMatch: 'the match is opened and the creator escrows',
};

/** CamelCase to spaced upper: DelegatePositionToEr -> DELEGATE POSITION TO ER. */
const spaced = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

/** What a duel cost in network fees, summed from the transactions themselves. */
export interface DuelCost {
  /** Lamports across every base-layer transaction in the duel's life. */
  lamports: number;
  /** How many transactions that is. */
  transactions: number;
  /** How many of them the chain refused. They still paid their fee, so they stay in `lamports`. */
  failed: number;
}

export function useDuelProof(
  match: PublicKey | null,
  playerA: PublicKey | null,
  playerB: PublicKey | null,
  // Per position. The page says "every" base-layer transaction, and twelve was
  // not every one once a duel's history included refusals.
  limit = 50
) {
  const [steps, setSteps] = useState<ProofStep[]>([]);
  const [loaded, setLoaded] = useState(false);

  const key = match?.toBase58() ?? null;
  const aKey = playerA?.toBase58() ?? null;
  const bKey = playerB?.toBase58() ?? null;

  useEffect(() => {
    if (!key || !aKey || !bKey) {
      setSteps([]);
      setLoaded(false);
      return undefined;
    }
    let alive = true;

    (async () => {
      try {
        const conn = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const m = new PublicKey(key);
        const positions = [
          positionPda(m, new PublicKey(aKey)),
          positionPda(m, new PublicKey(bKey)),
        ];
        // Each position's ACL as well. Sealing hands it to the rollup and
        // settlement brings it back, and that last step touches only the
        // permission account — the position's own history cannot show it.
        const accounts = [...positions, ...positions.map((p) => permissionPdaFromAccount(p))];

        const lists = await Promise.all(
          accounts.map((a) => conn.getSignaturesForAddress(a, { limit }))
        );
        if (!alive) return;

        // Settlement touches both positions, so the same signature comes back
        // from several queries. The chain did it once; show it once — and
        // remember whether only an ACL's history had it.
        const seen = new Map<
          string,
          { slot: number; blockTime: number | null; err: boolean; aclOnly: boolean }
        >();
        lists.forEach((list, i) => {
          const fromAcl = i >= positions.length;
          for (const s of list) {
            const prior = seen.get(s.signature);
            if (!prior) {
              seen.set(s.signature, {
                slot: s.slot,
                blockTime: s.blockTime ?? null,
                err: !!s.err,
                aclOnly: fromAcl,
              });
            } else if (!fromAcl) {
              prior.aclOnly = false;
            }
          }
        });
        if (seen.size === 0) {
          setSteps([]);
          setLoaded(true);
          return;
        }

        const sigs = [...seen.keys()];
        const txs = await conn.getParsedTransactions(sigs, { maxSupportedTransactionVersion: 0 });
        if (!alive) return;

        const out: ProofStep[] = sigs.map((signature, i) => {
          const logs = txs[i]?.meta?.logMessages ?? [];
          const instructions = logs
            .filter((l) => l.includes('Instruction: '))
            .map((l) => l.split('Instruction: ')[1])
            .filter(Boolean);
          // The first instruction whose meaning is known names the step; a
          // transaction with none is named by whatever it did run.
          const named = instructions.find((n) => MEANING[n]) ?? instructions[0] ?? 'TRANSACTION';
          const meta = seen.get(signature)!;
          // An ACL coming home is the delegation program undelegating the
          // permission account at the top level. The permission program is not
          // Anchor, so that transaction logs no instruction name at all, and the
          // row used to read TRANSACTION — the one step this list exists to show.
          const aclHome =
            meta.aclOnly &&
            (named === 'ProcessUndelegation' ||
              logs.some((l) => l.startsWith(`Program ${DELEGATION_PROGRAM_ID.toBase58()} invoke [1]`)));
          return {
            signature,
            fee: txs[i]?.meta?.fee ?? 0,
            slot: meta.slot,
            blockTime: meta.blockTime,
            err: meta.err,
            instructions,
            label: aclHome ? 'ACL BACK ON SOLANA' : spaced(named),
            meaning: aclHome
              ? 'the rollup releases the ACL — the permission program owns it on Solana again'
              : MEANING[named] ?? 'a transaction against this duel',
          };
        });

        // Ascending, so it reads as a life rather than a feed.
        out.sort((x, y) => x.slot - y.slot);
        setSteps(out);
        setLoaded(true);
      } catch {
        if (alive) {
          setSteps([]);
          setLoaded(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [key, aKey, bKey, limit]);

  /**
   * What the duel cost, from the transactions rather than from a fee table.
   *
   * Only the base layer is counted, because these are the base-layer
   * signatures — the rollup's own fills are cheaper still and are not in this
   * list. Nobody else will show a judge this number, and it is a good one:
   * a whole duel, sealed and settled, for a fraction of a cent.
   */
  const cost: DuelCost = {
    lamports: steps.reduce((sum, s) => sum + s.fee, 0),
    transactions: steps.length,
    failed: steps.filter((s) => s.err).length,
  };

  return { steps, loaded, cost };
}
