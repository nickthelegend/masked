/**
 * Dependency health, checked live.
 *
 * A demo that fails because a validator quietly died is indistinguishable from
 * a demo that fails because the code is wrong. This tells you which.
 */
import { useCallback, useEffect, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { ACTIVE_CLUSTER, DELEGATION_PROGRAM_ID, FOGDUEL_PROGRAM_ID, PERMISSION_PROGRAM_ID } from './config';

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
