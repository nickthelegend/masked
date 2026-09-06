/**
 * /proof — the judge-facing evidence screen.
 *
 * Everything here is read live from chain. Nothing is asserted that is not
 * also shown: account owners, delegation state, measured latency, and an
 * explicit statement of what this cluster does and does not enforce.
 */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useWallet } from '@solana/wallet-adapter-react';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  Badge,
  ConnectWalletButton,
  Divider,
  PixelText,
  ProofPanel,
  Row,
  Stack,
  Wordmark,
  color,
  space,
} from '../ui';
import { FogduelClient } from '../chain/client';
import { ACTIVE_CLUSTER, DELEGATION_PROGRAM_ID, FOGDUEL_PROGRAM_ID, PERMISSION_PROGRAM_ID } from '../chain/config';
import { useDelegationStatus } from '../chain/useDelegationStatus';
import { useLatency } from '../chain/useLatency';
import { useChainStats } from '../chain/useChainStats';

const shortKey = (k: PublicKey | null) => (k ? `${k.toBase58().slice(0, 6)}…${k.toBase58().slice(-4)}` : '—');
const ms = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}ms`);

export default function ProofScreen() {
  const wallet = useWallet();
  const stats = useChainStats(8000);
  const latency = useLatency();

  const client = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null;
    const w: AnchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    };
    return new FogduelClient(w as never, ACTIVE_CLUSTER);
  }, [wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  const watch = useMemo(
    () => [
      { label: 'fogduel program', address: FOGDUEL_PROGRAM_ID },
      { label: 'delegation program', address: DELEGATION_PROGRAM_ID },
      { label: 'permission program', address: PERMISSION_PROGRAM_ID },
    ],
    []
  );
  const { accounts, loaded } = useDelegationStatus(client, watch, 4000);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 80, gap: space.lg, maxWidth: 720, alignSelf: 'center', width: '100%' }}
      showsVerticalScrollIndicator={false}
    >
      <Row justify="space-between" gap={space.md}>
        <Wordmark size={16} />
        <ConnectWalletButton size={9} padY={space.md} />
      </Row>

      <Stack gap={space.xs}>
        <PixelText variant="h2">PROOF</PixelText>
        <PixelText variant="bodySmall">
          Live on-chain evidence. Every value below is read from the cluster, not asserted.
        </PixelText>
        <Divider color={color.panelLight} />
      </Stack>

      <ProofPanel
        title="CLUSTER"
        status={{ label: ACTIVE_CLUSTER.tee ? 'TEE' : 'NO TEE', tone: ACTIVE_CLUSTER.tee ? 'live' : 'soon' }}
        rows={[
          { label: 'name', value: ACTIVE_CLUSTER.name.toUpperCase() },
          { label: 'base layer', value: ACTIVE_CLUSTER.l1, mono: true },
          { label: 'rollup', value: ACTIVE_CLUSTER.er, mono: true },
          { label: 'validator', value: shortKey(ACTIVE_CLUSTER.validator), mono: true },
          {
            label: 'privacy enforced',
            value: ACTIVE_CLUSTER.tee ? 'YES — TEE ingress' : 'NO — needs a TEE',
            tone: ACTIVE_CLUSTER.tee ? 'good' : 'bad',
          },
        ]}
      />

      <ProofPanel
        title="MEASURED LATENCY"
        note={`Median of the last ${latency.samples} getSlot round trips against each endpoint.`}
        rows={[
          { label: 'base layer', value: ms(latency.l1Ms) },
          { label: 'ephemeral rollup', value: ms(latency.erMs), tone: 'good' },
          {
            label: 'speedup',
            value: latency.speedup ? `${latency.speedup.toFixed(1)}x` : '—',
            tone: latency.speedup && latency.speedup > 1 ? 'good' : 'neutral',
          },
        ]}
      />

      <ProofPanel
        title="PROGRAMS ON CHAIN"
        note={loaded ? undefined : 'connect a wallet to read live account state'}
        rows={
          accounts.length
            ? accounts.map((a) => ({
                label: a.label,
                value: a.owner ? `${shortKey(a.address)} · ${a.bytes}B` : 'NOT FOUND',
                tone: (a.owner ? 'good' : 'bad') as 'good' | 'bad',
                mono: true,
              }))
            : watch.map((w) => ({ label: w.label, value: shortKey(w.address), mono: true }))
        }
      />

      <ProofPanel
        title="SETTLED ON CHAIN"
        rows={[
          { label: 'duels settled', value: stats.loaded ? String(stats.settled) : '—', tone: 'good' },
          { label: 'paid out', value: stats.loaded ? `${stats.paidOutSol.toFixed(3)} SOL` : '—' },
          { label: 'open matches', value: stats.loaded ? String(stats.openMatches) : '—' },
        ]}
      />

      <Stack gap={space.sm}>
        <PixelText variant="label" size={8}>
          WHAT THIS CLUSTER DOES NOT DO
        </PixelText>
        <PixelText variant="bodySmall" size={10} color={color.textDim}>
          {ACTIVE_CLUSTER.tee
            ? 'This is a TEE validator. Opponent position reads are refused at ingress for non-members.'
            : 'This is a local validator with no TEE. The access-control list is created on chain and delegated, but reads are not gated. The client refuses to read opponent state anyway (src/chain/fog.ts) — that protects this app, not the RPC.'}
        </PixelText>
        <Row gap={space.sm} wrap>
          <Badge label="npm run prove:privacy" tone="quiet" variant="bodySmall" />
          <Badge label="npm run check:fog" tone="quiet" variant="bodySmall" />
        </Row>
      </Stack>

      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}
