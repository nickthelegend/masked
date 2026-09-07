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

export type HealthState = 'up' | 'down' | 'checking';

export interface HealthCheck {
  name: string;
  state: HealthState;
  detail: string;
}

const check = async (name: string, fn: () => Promise<string>): Promise<HealthCheck> => {
  try {
    return { name, state: 'up', detail: await fn() };
  } catch (e) {
    return { name, state: 'down', detail: e instanceof Error ? e.message.slice(0, 60) : 'unreachable' };
  }
};

export function useHealth(pollMs = 8000) {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [online, setOnline] = useState(true);

  const run = useCallback(async () => {
    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const er = new Connection(ACTIVE_CLUSTER.er, 'confirmed');

    const results = await Promise.all([
      check('base layer', async () => `slot ${await l1.getSlot('confirmed')}`),
      check('ephemeral rollup', async () => `slot ${await er.getSlot('confirmed')}`),
      check('fogduel program', async () => {
        const i = await l1.getAccountInfo(FOGDUEL_PROGRAM_ID);
        if (!i?.executable) throw new Error('not deployed');
        return `${i.data.length} bytes`;
      }),
      check('delegation program', async () => {
        const i = await l1.getAccountInfo(DELEGATION_PROGRAM_ID);
        if (!i?.executable) throw new Error('absent — the rollup cannot work');
        return 'deployed';
      }),
      check('permission program', async () => {
        const i = await l1.getAccountInfo(PERMISSION_PROGRAM_ID);
        if (!i?.executable) throw new Error('absent — no access control');
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
        if (!r.ok) throw new Error(`HTTP ${r.status} — is something else on this port?`);
        const body = (await r.json()) as { service?: string };
        if (body.service !== 'masked-market-proxy') {
          throw new Error(`a different service is on ${proxyBase}`);
        }
        return proxyBase;
      }),
      check('pump.fun', async () => {
        const r = await fetch(`${feedBase('pump')}/coins?limit=1&sort=market_cap&order=DESC`, {
          signal: AbortSignal.timeout(12_000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rows = (await r.json()) as unknown[];
        if (!Array.isArray(rows) || rows.length === 0) throw new Error('no markets returned');
        return 'listing markets';
      }),
      check('jupiter', async () => {
        const r = await fetch(
          `${feedBase('jup')}/price/v3?ids=So11111111111111111111111111111111111111112`,
          { signal: AbortSignal.timeout(12_000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as Record<string, { usdPrice?: number } | null>;
        const sol = Object.values(body)[0]?.usdPrice;
        if (!sol) throw new Error('no SOL price');
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
