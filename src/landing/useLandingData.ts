/**
 * Everything the landing page shows, read once at the page root.
 *
 * Sections receive slices of this instead of calling the hooks themselves, so
 * a figure that appears twice on the page is one reading shown twice, and the
 * page makes one set of RPC calls rather than one per section. Every hook here
 * is the same one the app uses — nothing on the landing page has a data source
 * of its own.
 *
 * No clock lives here. A one-second tick at the root would re-render the whole
 * page every second; the one component with a live countdown keeps its own.
 */
import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useProtocolStats } from '../chain/useProtocolStats';
import { useTapes } from '../chain/useTapes';
import { useOpenMatches } from '../chain/useOpenMatches';
import { useLatency } from '../chain/useLatency';
import { useMarkets } from '../chain/useMarkets';
import { useGateProbe } from '../chain/useGateProbe';
import { useDuelProof } from '../chain/useDuelProof';
import { positionPda } from '../chain/pdas';
import { FOGDUEL_PROGRAM_ID } from '../chain/config';

export function useLandingData() {
  const protocol = useProtocolStats(30_000);
  const { tapes, loaded: tapesLoaded } = useTapes(20_000);
  const { matches: open, live, loaded: roomsLoaded } = useOpenMatches(10_000);
  const latency = useLatency(3000, 8);
  const memes = useMarkets('meme', 14);
  const majors = useMarkets('major', 40);

  const latestTape = tapes[0] ?? null;

  // The same candidates /proof probes: positions of matches under way first,
  // since those are the ones actually sealed, then the last settled duel's.
  const gateCandidates = useMemo(() => {
    const out: PublicKey[] = [];
    for (const m of live) out.push(positionPda(m.address, m.creator), positionPda(m.address, m.joiner));
    if (latestTape) {
      const k = new PublicKey(latestTape.match);
      out.push(positionPda(k, latestTape.winner), positionPda(k, latestTape.loser));
    }
    return out;
  }, [live, latestTape]);
  const gate = useGateProbe(gateCandidates, FOGDUEL_PROGRAM_ID, 8000);

  const proof = useDuelProof(
    latestTape ? new PublicKey(latestTape.match) : null,
    latestTape?.winner ?? null,
    latestTape?.loser ?? null
  );

  // Every wallet that has finished a duel, newest first, once each.
  const players = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tapes) {
      for (const k of [t.winner.toBase58(), t.loser.toBase58()]) {
        if (!seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
    }
    return out;
  }, [tapes]);

  return { protocol, tapes, tapesLoaded, latestTape, open, live, roomsLoaded, latency, memes, majors, gate, proof, players };
}

export type LandingData = ReturnType<typeof useLandingData>;
