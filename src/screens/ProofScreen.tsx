/**
 * /proof — the judge-facing evidence screen.
 *
 * Everything here is read live from chain. Nothing is asserted that is not
 * also shown: account owners, delegation state, measured latency, and an
 * explicit statement of what this cluster does and does not enforce.
 */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import {
  Badge,
  ConnectWalletButton,
  Divider,
  PixelText,
  ProofPanel,
  Row,
  Stack,
  TxFeed,
  Wordmark,
  color,
  space,
} from '../ui';
import { ACTIVE_CLUSTER, DELEGATION_PROGRAM_ID, FOGDUEL_PROGRAM_ID, PERMISSION_PROGRAM_ID } from '../chain/config';
import { useDelegationStatus } from '../chain/useDelegationStatus';
import { useGateProbe } from '../chain/useGateProbe';
import { useOpenMatches } from '../chain/useOpenMatches';
import { useLatency } from '../chain/useLatency';
import { useChainStats } from '../chain/useChainStats';
import { useTxFeed, explorerUrl } from '../chain/useTxFeed';
import { useTapes } from '../chain/useTapes';
import { positionPda } from '../chain/pdas';
import { permissionPdaFromAccount } from '@magicblock-labs/ephemeral-rollups-sdk';
import { PublicKey as PK } from '@solana/web3.js';

const shortKey = (k: PublicKey | null) => (k ? `${k.toBase58().slice(0, 6)}…${k.toBase58().slice(-4)}` : '—');
const ms = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}ms`);
const rate = (n: number | null) => (n === null ? 'measuring…' : `${n.toFixed(1)} slots/s`);

export default function ProofScreen() {
  const stats = useChainStats(8000);
  const latency = useLatency();

  const watch = useMemo(
    () => [
      { label: 'fogduel program', address: FOGDUEL_PROGRAM_ID },
      { label: 'delegation program', address: DELEGATION_PROGRAM_ID },
      { label: 'permission program', address: PERMISSION_PROGRAM_ID },
    ],
    []
  );
  const { accounts, loaded } = useDelegationStatus(watch, 4000);
  const { entries, loaded: txLoaded, ledgerPruned, firstAvailableBlock } = useTxFeed(10);
  const { tapes } = useTapes(12_000);

  // Watch the ACLs of the most recently settled duel, so the permission
  // accounts are visible as real on-chain objects rather than a claim.
  const aclWatch = useMemo(() => {
    const t = tapes[0];
    if (!t) return [];
    const matchKey = new PK(t.match);
    return [
      { label: 'winner position ACL', address: permissionPdaFromAccount(positionPda(matchKey, t.winner)) },
      { label: 'loser position ACL', address: permissionPdaFromAccount(positionPda(matchKey, t.loser)) },
    ];
  }, [tapes]);
  const { accounts: acls } = useDelegationStatus(aclWatch, 6000);

  // Probe the front door for real: a delegated position should be refused
  // while an undelegated account on the same rollup is served. Candidates come
  // from live matches first — those are the ones actually sealed right now —
  // and fall back to the most recent settled duel's positions.
  const { live: liveMatches } = useOpenMatches(8000);
  const gateCandidates = useMemo(() => {
    const out: PublicKey[] = [];
    // Live matches first: those are the positions that are sealed right now.
    for (const m of liveMatches) {
      out.push(positionPda(m.address, m.creator), positionPda(m.address, m.joiner));
    }
    // A settled duel's positions have come home and are readable by design, so
    // the probe will skip them — but including them means the panel says
    // "nothing sealed" rather than nothing at all when the table is quiet.
    const t = tapes[0];
    if (t) {
      const k = new PK(t.match);
      out.push(positionPda(k, t.winner), positionPda(k, t.loser));
    }
    return out;
  }, [liveMatches, tapes]);
  const gate = useGateProbe(gateCandidates, FOGDUEL_PROGRAM_ID, 6000);

  const GATE_ROW: Record<typeof gate.verdict, { value: string; tone: 'good' | 'bad' | undefined }> = {
    enforced: { value: 'YES — sealed position refused, control served', tone: 'good' },
    shut: { value: 'unproven — the door refused everything', tone: undefined },
    open: { value: 'NO — a sealed position was served', tone: 'bad' },
    'nothing-sealed': { value: 'no delegated position to probe', tone: undefined },
    unreachable: { value: 'rollup front door unreachable', tone: 'bad' },
  };

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
            label: 'read gate',
            value: gate.loaded ? GATE_ROW[gate.verdict].value : 'probing…',
            tone: gate.loaded ? GATE_ROW[gate.verdict].tone : undefined,
          },
          {
            label: 'gate attested',
            // Enforcement and attestation are different claims. This gate does
            // read the ACL — the row above proves it against a control — but
            // it is a process we run, and only a TEE makes that checkable by
            // somebody who does not trust us.
            value: ACTIVE_CLUSTER.tee ? 'YES — TEE ingress' : 'NO — not a TEE',
            tone: ACTIVE_CLUSTER.tee ? 'good' : undefined,
          },
        ]}
      />

      <ProofPanel
        title="MEASURED SPEED"
        note={
          `Block rate is what a rollup is for and what the speedup divides. ` +
          `Round trip is ${latency.samples} getSlot calls, median — on a laptop ` +
          `that is mostly IPC, and the rollup's includes the hop through the ` +
          `permission-checking front door, so it is usually the slower number.`
        }
        rows={[
          { label: 'base block rate', value: rate(latency.l1SlotsPerSec) },
          { label: 'rollup block rate', value: rate(latency.erSlotsPerSec), tone: 'good' },
          {
            label: 'speedup',
            value: latency.speedup ? `${latency.speedup.toFixed(1)}x` : '—',
            tone: latency.speedup && latency.speedup > 1 ? 'good' : undefined,
          },
          { label: 'base round trip', value: ms(latency.l1Ms) },
          { label: 'rollup round trip', value: ms(latency.erMs) },
        ]}
      />

      <ProofPanel
        title="PROGRAMS ON CHAIN"
        note={loaded ? undefined : 'reading…'}
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
          {
            label: 'duels settled',
            value: stats.loaded && stats.reachable ? String(stats.settled) : 'UNREACHABLE',
            tone: (stats.reachable ? 'good' : 'bad') as 'good' | 'bad',
          },
          {
            label: 'paid out',
            value: stats.loaded && stats.reachable ? `${stats.paidOutSol.toFixed(3)} SOL` : '—',
          },
          {
            label: 'open matches',
            value: stats.loaded && stats.reachable ? String(stats.openMatches) : '—',
          },
        ]}
      />

      <ProofPanel
        title="ACCESS CONTROL LISTS"
        note={
          aclWatch.length === 0
            ? 'No settled duel yet — play one and its ACLs appear here.'
            : "The most recent duel's permission accounts, read from chain."
        }
        status={
          acls.length > 0 && acls.every((a) => a.isPermission)
            ? { label: 'ON CHAIN', tone: 'live' }
            : { label: 'NONE', tone: 'soon' }
        }
        rows={
          acls.length > 0
            ? acls.map((a) => ({
                label: a.label,
                value: a.owner ? `${shortKey(a.address)} · ${a.owner.toBase58().slice(0, 6)}…` : 'ABSENT',
                tone: (a.isPermission ? 'good' : 'bad') as 'good' | 'bad',
                mono: true,
              }))
            : [{ label: 'permission accounts', value: '—' }]
        }
      />

      <TxFeed
        items={entries.map((e) => ({ ...e, url: explorerUrl(e.signature) }))}
        loaded={txLoaded}
        title="RECENT PROGRAM TRANSACTIONS"
        emptyLabel={
          ledgerPruned
            ? `LEDGER PRUNED — HISTORY BEFORE SLOT ${firstAvailableBlock} IS GONE. RESTART THE VALIDATOR WITH A LARGER --limit-ledger-size.`
            : 'NOTHING YET — RUN npm run seed'
        }
      />

      <Stack gap={space.sm}>
        <PixelText variant="label" size={8}>
          WHAT THIS CLUSTER DOES AND DOES NOT PROVE
        </PixelText>
        <PixelText variant="bodySmall" size={10} color={color.textDim}>
          {ACTIVE_CLUSTER.tee
            ? 'This is a TEE validator. Opponent reads are refused at ingress, and the ingress itself is attestable.'
            : 'Reads are gated. The rollup sits behind a query-filtering-service that reads the permission program, and the row above probes it live: a sealed position is refused while an undelegated account on the same rollup is served, so the door is checking the ACL rather than being shut. What is missing is attestation — the gate is a process we run, and only a TEE makes it checkable by someone who does not trust us.'}
        </PixelText>
        <Row gap={space.sm} wrap>
          <Badge label="npm run check:gate" tone="quiet" variant="bodySmall" />
          <Badge label="npm run prove:privacy" tone="quiet" variant="bodySmall" />
          <Badge label="npm run check:fog" tone="quiet" variant="bodySmall" />
        </Row>
      </Stack>

      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}
