/**
 * /proof — the judge-facing evidence screen.
 *
 * Everything here is read live from chain. Nothing is asserted that is not
 * also shown: account owners, delegation state, measured latency, and an
 * explicit statement of what this cluster does and does not enforce.
 */
import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  Badge,
  ConnectWalletButton,
  CommandList,
  Divider,
  LifecycleFeed,
  LiveDuelRow,
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
import { useDuelProof } from '../chain/useDuelProof';
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

  /**
   * The most recent duel that was actually sealed.
   *
   * The newest tape is whatever settled last, and on a cluster that also runs
   * the test suites that is usually a fixture that never had an ACL — so the
   * panels below traced a duel with nothing in it to show: both ACLs ABSENT,
   * three transactions and no delegation at all. A sealed duel is one whose
   * positions were given permission accounts, so this picks the newest tape
   * that has one, and falls back to the newest tape when none does.
   */
  const tapeKeys = tapes
    .slice(0, 20)
    .map((t) => `${t.match}:${t.winner.toBase58()}`)
    .join(',');
  const [sealedMatch, setSealedMatch] = useState<string | null>(null);
  useEffect(() => {
    if (!tapeKeys) {
      setSealedMatch(null);
      return undefined;
    }
    let alive = true;
    const pairs = tapeKeys.split(',').map((pair) => pair.split(':'));
    new Connection(ACTIVE_CLUSTER.l1, 'confirmed')
      .getMultipleAccountsInfo(
        pairs.map(([m, w]) => permissionPdaFromAccount(positionPda(new PK(m), new PK(w))))
      )
      .then((infos) => {
        if (!alive) return;
        const i = infos.findIndex((info) => !!info);
        setSealedMatch(i >= 0 ? pairs[i][0] : null);
      })
      .catch(() => {
        /* the next poll of the tapes tries again */
      });
    return () => {
      alive = false;
    };
  }, [tapeKeys]);

  // The same duel's transitions, as real signatures. The panels above report
  // what is true now; this reports how it got that way, which is the half
  // that would otherwise have to be believed.
  const traced = tapes.find((t) => t.match === sealedMatch) ?? tapes[0] ?? null;
  const tracedKey = traced
    ? `${traced.match}:${traced.winner.toBase58()}:${traced.loser.toBase58()}`
    : null;

  // Watch that duel's ACLs, so the permission accounts are visible as real
  // on-chain objects rather than a claim — and whether they came home.
  const aclWatch = useMemo(() => {
    if (!tracedKey) return [];
    const [m, w, l] = tracedKey.split(':');
    const matchKey = new PK(m);
    return [
      { label: 'winner position ACL', address: permissionPdaFromAccount(positionPda(matchKey, new PK(w))) },
      { label: 'loser position ACL', address: permissionPdaFromAccount(positionPda(matchKey, new PK(l))) },
    ];
  }, [tracedKey]);
  const { accounts: acls } = useDelegationStatus(aclWatch, 6000);
  const { steps: proofSteps, loaded: proofLoaded, cost: duelCost } = useDuelProof(
    traced ? new PK(traced.match) : null,
    traced?.winner ?? null,
    traced?.loser ?? null
  );
  // The traced duel's own pot, off its tape. The cost panel used to divide by a
  // fixed 0.20◎, which was only right for a duel at the default stake.
  const tracedPot = traced ? traced.potPaid + traced.rake : 0;

  // Probe the front door for real: a delegated position should be refused
  // while an undelegated account on the same rollup is served. Candidates come
  // from live matches first — those are the ones actually sealed right now —
  // and fall back to the most recent settled duel's positions.
  const { live: liveMatches } = useOpenMatches(8000);

  // Ticks so the clocks on the live rows count down.
  const [nowSecs, setNowSecs] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSecs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  /**
   * A duel is running only while its clock is.
   *
   * `useOpenMatches` reports anything whose on-chain status is `live`, which
   * includes rounds whose sixty seconds ran out and that nobody has settled —
   * both players closed their tabs, and settlement is permissionless but not
   * automatic. Listing those under LIVE RIGHT NOW put twelve duels on the
   * evidence page all frozen at 0:00, which reads as a broken clock rather
   * than as the truth: they are over and waiting to be settled.
   */
  const { running, expired } = useMemo(() => {
    const isRunning = (m: (typeof liveMatches)[number]) =>
      m.duration - (nowSecs - m.startTs) > 0;
    return {
      running: liveMatches.filter(isRunning),
      expired: liveMatches.filter((m) => !isRunning(m)).length,
    };
  }, [liveMatches, nowSecs]);

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
            //
            // And a TEE flag in our own config is not attestation either. This
            // said YES on the flag's word. The quote check needs Node's crypto,
            // so the page names the command that asks the enclave instead.
            value: ACTIVE_CLUSTER.tee ? 'CHECK IT — npx tsx scripts/check-tee.mts' : 'NO — not a TEE',
          },
        ]}
      />

      {/* Duels happening now, watchable without a wallet. The point of putting
          this on the evidence page: a judge can click through and see the fog
          from outside, which is a stronger demonstration than any panel. */}
      <Stack gap={space.sm}>
        <Row justify="space-between" align="center">
          <PixelText variant="label" size={8}>
            LIVE RIGHT NOW
          </PixelText>
          <Badge
            label={`${running.length} DUEL${running.length === 1 ? '' : 'S'}`}
            tone={running.length > 0 ? 'live' : 'quiet'}
            variant="label"
          />
        </Row>
        {running.length === 0 ? (
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            Nothing running. Open one at /play and this fills in.
          </PixelText>
        ) : (
          <Stack gap={space.xs}>
            {running.slice(0, 5).map((m) => (
              <LiveDuelRow
                key={m.address.toBase58()}
                symbol={m.symbol}
                mint={m.mint.toBase58()}
                creator={shortKey(m.creator)}
                joiner={shortKey(m.joiner)}
                potSol={(m.entry * 2) / 1e9}
                secondsLeft={Math.max(0, m.duration - (nowSecs - m.startTs))}
                onPress={() => router.push(`/spectate/${m.address.toBase58()}`)}
              />
            ))}
          </Stack>
        )}
        {expired > 0 ? (
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            {expired} more {expired === 1 ? 'duel is' : 'duels are'} over but
            unsettled — both players left before the buzzer. Settlement is
            permissionless: `npm run crank` closes them and pays the pots.
          </PixelText>
        ) : null}
        <PixelText variant="bodySmall" size={10} color={color.textFaint}>
          Spectating needs no wallet, and shows no position — the rollup refuses
          them to a spectator exactly as it does to the opponent.
        </PixelText>
      </Stack>

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
                value: a.owner
                  ? `${shortKey(a.address)} · ${a.bytes === null ? 'size unknown' : `${a.bytes.toLocaleString('en-US')} bytes`}`
                  : 'NOT FOUND',
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
            : "The most recent sealed duel's permission accounts, read from chain. Each player's client releases its own from the rollup after the buzzer, so both should be home."
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
                // Settled, so an ACL belongs back on Solana. One the delegation
                // program still owns was left on the rollup — which is what
                // every duel did before settlement started releasing them.
                value: a.owner
                  ? `${shortKey(a.address)} · ${a.delegated ? 'STILL ON THE ROLLUP' : 'HOME ON SOLANA'}`
                  : 'ABSENT',
                tone: (a.isPermission && !a.delegated ? 'good' : 'bad') as 'good' | 'bad',
                mono: true,
              }))
            : [{ label: 'permission accounts', value: '—' }]
        }
      />

      <LifecycleFeed
        steps={proofSteps.map((s) => ({
          signature: s.signature,
          label: s.label,
          meaning: s.meaning,
          slot: s.slot,
          err: s.err,
          url: explorerUrl(s.signature),
        }))}
        loaded={proofLoaded}
        subtitle={
          traced
            ? `Every base-layer transaction touching either position of duel ${traced.match.slice(0, 8)}…, or either position's ACL, oldest first. Click any row to check it yourself.`
            : undefined
        }
        emptyLabel="NO SETTLED DUEL TO TRACE YET — PLAY ONE, OR RUN npm run seed"
      />

      {/* What a whole duel costs, summed from the transactions above rather
          than from a fee table. Only the base layer — the rollup's own fills
          are cheaper still and are not in that list. */}
      {duelCost.transactions > 0 ? (
        <ProofPanel
          title="WHAT ONE DUEL COSTS"
          note="Network fees for every base-layer transaction in the duel traced above, read from the transactions themselves."
          status={
            duelCost.failed > 0
              ? { label: `${duelCost.transactions} TX · ${duelCost.failed} FAILED`, tone: 'soon' }
              : { label: `${duelCost.transactions} TX`, tone: 'live' }
          }
          rows={[
            {
              label: 'total network fees',
              value: `${(duelCost.lamports / 1e9).toFixed(6)} SOL`,
              mono: true,
            },
            {
              label: 'per transaction',
              value: `${(duelCost.lamports / duelCost.transactions / 1e9).toFixed(6)} SOL`,
              mono: true,
            },
            {
              label: 'refused on chain',
              value:
                duelCost.failed > 0
                  ? `${duelCost.failed} of ${duelCost.transactions} — their fees are in the total`
                  : 'none',
              tone: duelCost.failed > 0 ? 'bad' : 'good',
            },
            {
              label: 'against the pot',
              value:
                tracedPot > 0
                  ? `${((duelCost.lamports / tracedPot) * 100).toFixed(3)}% of this duel's ${(tracedPot / 1e9).toFixed(2)}◎ pot`
                  : '—',
            },
          ]}
        />
      ) : null}

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
      </Stack>

      {/* Every claim on this page is reproducible, and the gap between
          "checkable" and "checked" is usually whether somebody had to retype a
          command. Each row copies. */}
      <CommandList
        subtitle="Every claim above, reproduced from a clean checkout. Tap a row to copy it."
        commands={[
          {
            cmd: 'npx tsx scripts/check-tee.mts',
            proves:
              "MagicBlock's devnet TEE rollup answers a fresh random challenge with an Intel TDX quote that verifies against Intel's collateral. Attestation asked of the machine, not read off a config flag.",
          },
          {
            cmd: 'npm run check:gate',
            proves:
              'The read gate refuses a sealed position and serves the same account shape without a permission. The control row is the point — a door shut for everybody is not access control.',
          },
          {
            cmd: 'npm run check:session',
            proves:
              'A real Gum session token signing a real fill on the rollup, and refusing to move a position it was not issued for.',
          },
          {
            cmd: 'npm run check:guards',
            proves:
              'Every refusal the deployed program makes: self-join, cancel-after-join, settle-before-buzzer, fill-on-undelegated, fill-after-buzzer, join-a-stale-match.',
          },
          {
            cmd: 'npm run check:race',
            proves:
              'Two independent clients sealing and settling the same match at once. The app splits that work — the joiner seals, the creator settles — and this is the fallback for when one of them goes quiet: the round still seals once and pays once.',
          },
          {
            cmd: 'npm run check:tape',
            proves:
              "Every settled tape on this cluster replayed onto the chain's own PnL, and the impact previewer checked against every recorded execution price.",
          },
          {
            cmd: 'npm run check:vrf',
            proves:
              'The VRF request really lands and the VRF program accepts it — and exactly where it stops, because no oracle here can answer.',
          },
          {
            cmd: 'npm run prove:privacy',
            proves: 'A whole match walked stage by stage, reporting what each party can read at each point (~31s).',
          },
          {
            cmd: 'cd chain && anchor test --skip-local-validator',
            proves: "38 on-chain tests, 2 pending. Includes the rollup running a round by itself — its own crank liquidating a blown-up short and committing the round home at the buzzer with no client — a round busy enough that the rollup stages its commit through MagicBlock's committor program, a tape past sixteen fills replayed from the window start it records, each owner releasing their ACL, and the negative case: a fill that succeeds on the rollup is rejected on L1 while the account is delegated.",
          },
        ]}
      />

      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}
