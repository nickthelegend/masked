/**
 * Dependency health, checked live.
 *
 * A demo that fails because a validator quietly died is indistinguishable from
 * a demo that fails because the code is wrong. This tells you which.
 */
import { useCallback, useEffect, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { ACTIVE_CLUSTER, DELEGATION_PROGRAM_ID, FOGDUEL_PROGRAM_ID, PERMISSION_PROGRAM_ID } from './config';
import { feedBase, proxyBase, usesProxy } from './marketEndpoints';
import { explainRead } from './errors';
import { programCodeBytes } from './programSize';

export type HealthState = 'up' | 'down' | 'checking';

export interface HealthCheck {
  name: string;
  state: HealthState;
  detail: string;
}

/**
 * Something a check found out, worded for its row.
 *
 * Every failure used to go through `explainRead`, which keeps a timeout and
 * swaps any other message for its fallback — so "a different service is on
 * :8791" and "no SOL price" both reached the page as "did not answer", about
 * services that had answered. A finding is shown as written; only a transport
 * failure, which cannot name its host, is reworded.
 */
class Finding extends Error {}

/**
 * A dependency that stops answering does not fail — it hangs.
 *
 * A paused validator leaves getSlot pending forever, and with no bound on it
 * the whole Promise.all never resolved: the page showed DEGRADED above an
 * empty list, which is the one thing it exists not to do. Every check gets a
 * deadline, and a missed deadline is an answer.
 */
const CHECK_TIMEOUT_MS = 6000;

const check = async (name: string, fn: () => Promise<string>): Promise<HealthCheck> => {
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Finding(`no answer in ${CHECK_TIMEOUT_MS / 1000}s`)), CHECK_TIMEOUT_MS)
      ),
    ]);
    return { name, state: 'up', detail };
  } catch (e) {
    // `explainRead` for anything that is not a finding: the Fetch API's "Failed
    // to fetch" told a reader nothing except that something failed, on the one
    // page whose entire job is saying which dependency broke. The name is
    // already in the row, so the fallback can be short.
    const detail = e instanceof Finding ? e.message : explainRead(e, 'did not answer');
    return { name, state: 'down', detail: detail.slice(0, 60) };
  }
};

/**
 * A chain that answers but has stopped making blocks is down.
 *
 * `getHealth` and `getSlot` both keep answering from a rollup that has
 * stalled. This page read ALL SYSTEMS UP over a rollup frozen at slot 331,694
 * for minutes, while not one fill could land — the "validator quietly died"
 * case it exists to name. So each chain row reads its slot twice and calls a
 * slot that does not move a stall. Two seconds is several blocks on either
 * layer: the rollup makes one every 50 ms, the base layer every 400.
 */
const SLOT_WAIT_MS = 2000;

const advancingSlot = async (connection: Connection): Promise<string> => {
  const first = await connection.getSlot('confirmed');
  await new Promise((resolve) => setTimeout(resolve, SLOT_WAIT_MS));
  const second = await connection.getSlot('confirmed');
  if (second <= first) throw new Finding(`stalled at slot ${first} — no block in ${SLOT_WAIT_MS / 1000}s`);
  return `slot ${second}`;
};

export function useHealth(pollMs = 8000) {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [online, setOnline] = useState(true);

  const run = useCallback(async () => {
    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const er = new Connection(ACTIVE_CLUSTER.er, 'confirmed');

    const results = await Promise.all([
      check('base layer', () => advancingSlot(l1)),
      check('ephemeral rollup', () => advancingSlot(er)),
      check('fogduel program', async () => {
        const i = await l1.getAccountInfo(FOGDUEL_PROGRAM_ID);
        if (!i?.executable) throw new Finding('not deployed');
        const bytes = await programCodeBytes(ACTIVE_CLUSTER.l1, i);
        return bytes === null ? 'deployed' : `${bytes.toLocaleString('en-US')} bytes deployed`;
      }),
      check('delegation program', async () => {
        const i = await l1.getAccountInfo(DELEGATION_PROGRAM_ID);
        if (!i?.executable) throw new Finding('absent — the rollup cannot work');
        return 'deployed';
      }),
      check('permission program', async () => {
        const i = await l1.getAccountInfo(PERMISSION_PROGRAM_ID);
        if (!i?.executable) throw new Finding('absent — no access control');
        return 'deployed';
      }),
      // The market feed is a hard dependency: with no live price a match
      // cannot be opened at all. It is also the piece most likely to be quietly
      // wrong, because in a browser it goes through a local proxy — and a
      // different service answering on that port once had the app reporting
      // "pump.fun returned 401" about something that was not pump.fun.
      check('market proxy', async () => {
        if (!usesProxy) return 'not needed outside a browser';
        const r = await fetch(`${proxyBase}/whoami`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Finding(`HTTP ${r.status} — is something else on this port?`);
        const body = (await r.json()) as { service?: string };
        if (body.service !== 'masked-market-proxy') {
          throw new Finding(`a different service is on ${proxyBase}`);
        }
        return proxyBase;
      }),
      check('pump.fun', async () => {
        const r = await fetch(`${feedBase('pump')}/coins?limit=1&sort=market_cap&order=DESC`, {
          signal: AbortSignal.timeout(12_000),
        });
        if (!r.ok) throw new Finding(`HTTP ${r.status}`);
        const rows = (await r.json()) as unknown[];
        if (!Array.isArray(rows) || rows.length === 0) throw new Finding('no markets returned');
        return 'listing markets';
      }),
      check('jupiter', async () => {
        const r = await fetch(
          `${feedBase('jup')}/price/v3?ids=So11111111111111111111111111111111111111112`,
          { signal: AbortSignal.timeout(12_000) }
        );
        if (!r.ok) throw new Finding(`HTTP ${r.status}`);
        const body = (await r.json()) as Record<string, { usdPrice?: number } | null>;
        const sol = Object.values(body)[0]?.usdPrice;
        if (!sol) throw new Finding('no SOL price');
        return `SOL $${sol.toFixed(2)}`;
      }),
    ]);

    setChecks(results);
    setOnline(results.some((r) => r.state === 'up'));
  }, []);

  useEffect(() => {
    void run();
    const id = setInterval(() => void run(), pollMs);
    return () => clearInterval(id);
  }, [run, pollMs]);

  return { checks, online, refresh: run };
}
