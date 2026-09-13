import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Badge,
  PixelButton,
  ResultBoard,
  WinBurst,
  PixelPanel,
  PixelText,
  RevealCurtain,
  RoundTimeline,
  Row,
  Stack,
  color,
  playSound,
  sol,
  solExact,
  space,
} from '../ui';
import { carriedSide, marketMove, replayEquity, tapeWindowNote, type TapeState } from '../chain/tape';
import { canExportRevealCard, exportRevealCard } from '../ui/revealCard';
import { TROPHIES_PER_WIN } from './data';

export interface RevealScreenProps {
  won: boolean;
  pot: number;
  stake: number;
  /**
   * The settled tape, carrying both players' real fill lists. Null only while
   * it is still being read back, which is the one case the timeline is absent.
   */
  tape: TapeState | null;
  /** Which side of the tape is yours. */
  isPlayerA: boolean;
  /** Per-player entry in lamports — what the replay starts each side from. */
  entryLamports: number;
  /** When the round went live, and how long it ran. */
  startTs: number;
  duration: number;
  myPnl: number;
  opponentPnl: number;
  myFills: number;
  /** Null if it was never readable — see useDuel. The tape supersedes it. */
  opponentFills: number | null;
  opponentName: string;
  /** The reader's own wallet, shortened, for the board row. */
  myName?: string;
  /** Full wallets, for the generated masks. */
  myAddress?: string | null;
  opponentAddress?: string | null;
  /** The record against this opponent, counted off chain. Null while unknown. */
  record?: string | null;
  onRematch: () => void;
  /** Copies a spectate link for this duel. */
  onShare: () => void;
  onPost: () => void;
  /** Label for the share button, so it can confirm after a copy. */
  shareLabel?: string;
  /**
   * Fade the winner: open a match at this duel's stake and round length and
   * hand back its invite link. Offered to the side that lost.
   */
  onFade?: () => void;
  /** Label for the fade button, so it can report what it is doing. */
  fadeLabel?: string;
  /** The public tape's URL, printed on the result image so it can be checked. */
  tapeUrl?: string | null;
}

/**
 * The reveal.
 *
 * This is the moment the fog lifts, so it is the one screen that must not
 * contain anything invented. It used to: the opponent's curve was a seeded
 * random walk pinned to their final PnL, and a five-point constant stood in
 * for your own round when too few samples had landed. Both are gone. The
 * timeline is replayed from the fill lists `settle_match` wrote into the
 * public tape, and the replay lands on the chain's own PnL to the basis point
 * (`npm run check:tape` asserts exactly that against every settled tape).
 */
/** Basis points as a signed percentage: `+2.10%`, `-0.44%`. */
const signedPct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;

export default function RevealScreen({
  won,
  pot,
  stake,
  tape,
  isPlayerA,
  entryLamports,
  startTs,
  duration,
  myPnl,
  opponentPnl,
  myFills,
  opponentFills,
  opponentName,
  myName = 'YOU',
  myAddress = null,
  opponentAddress = null,
  record,
  onRematch,
  onShare,
  onPost,
  shareLabel = 'COPY TAPE LINK',
  onFade,
  fadeLabel = 'FADE WINNER',
  tapeUrl = null,
}: RevealScreenProps) {
  // Hold the tape back until the curtain has torn, so the numbers land at the
  // moment the fog lifts rather than before it.
  const [unsealed, setUnsealed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setUnsealed(true), 1400);
    return () => clearTimeout(id);
  }, []);

  // The sting lands with the curtain, not with the mount, so the result is
  // heard at the moment it is seen.
  useEffect(() => {
    if (unsealed) playSound(won ? 'win' : 'loss');
  }, [unsealed, won]);

  // Both sides replayed from the tape the program wrote. No fallback: if the
  // tape has not been read back yet the timeline says so rather than drawing
  // a shape nothing produced.
  const lanes = useMemo(() => {
    if (!tape || entryLamports <= 0) return null;
    const mineFills = isPlayerA ? tape.fillsA : tape.fillsB;
    const theirFills = isPlayerA ? tape.fillsB : tape.fillsA;
    const myCount = isPlayerA ? tape.fillCountA : tape.fillCountB;
    const theirCount = isPlayerA ? tape.fillCountB : tape.fillCountA;
    // A side with more fills than a tape keeps replays from the snapshot the
    // program folded the older ones into, and says it is the last few.
    return {
      mine: replayEquity(mineFills, entryLamports, startTs, isPlayerA ? tape.startA : tape.startB),
      theirs: replayEquity(theirFills, entryLamports, startTs, isPlayerA ? tape.startB : tape.startA),
      myCount,
      theirCount,
      myNote: tapeWindowNote(mineFills.length, myCount),
      theirNote: tapeWindowNote(theirFills.length, theirCount),
    };
  }, [tape, isPlayerA, entryLamports, startTs]);

  /**
   * What the token itself did, so the score can be read against something.
   * Losing 0.4% while the market fell 6% is a good round; the two numbers above
   * cannot say that on their own.
   */
  /**
   * Fill counts, from the tape.
   *
   * The tape is the public record the program just wrote, so at the reveal it
   * is both authoritative and certainly readable — unlike the live position,
   * which is sealed and may never have been read at all. Falls back to what
   * was passed only until the tape arrives, and says "—" rather than zero if
   * neither is available.
   */
  const shownMyFills = tape
    ? (isPlayerA ? tape.fillCountA : tape.fillCountB)
    : myFills;
  const shownTheirFills = tape
    ? (isPlayerA ? tape.fillCountB : tape.fillCountA)
    : opponentFills ?? '—';

  const myMove = useMemo(
    () => (tape ? marketMove(isPlayerA ? tape.fillsA : tape.fillsB, entryLamports) : null),
    [tape, entryLamports, isPlayerA]
  );
  const theirMove = useMemo(
    () => (tape ? marketMove(isPlayerA ? tape.fillsB : tape.fillsA, entryLamports) : null),
    [tape, entryLamports, isPlayerA]
  );
  const myLeg = tape ? (isPlayerA ? tape.legA : tape.legB) : null;
  const theirLeg = tape ? (isPlayerA ? tape.legB : tape.legA) : null;

  /**
   * The two standings, winner first.
   *
   * Ordered by the chain's own outcome, never by comparing the two PnLs here.
   * `settle_match` breaks a draw in favour of the creator — `pnl_a >= pnl_b`
   * — and its comment warns in as many words that a client-side `>=` would
   * silently favour whoever happened to be looking at the screen. This board
   * did exactly that: it ranked on `myPnl >= opponentPnl`, so a drawn round
   * showed *both* players a gold trophy and `#1`, directly above a summary
   * reading "You finished at #2". The pot has already been paid by the time
   * this renders; who won is a fact to be read, not recomputed.
   */
  const standings = useMemo(() => {
    const myFillList = tape ? (isPlayerA ? tape.fillsA : tape.fillsB) : [];
    const theirFillList = tape ? (isPlayerA ? tape.fillsB : tape.fillsA) : [];
    const mine = {
      rank: 0,
      name: myName,
      seed: myAddress ?? myName,
      you: true,
      pnl: myPnl,
      // Nothing is sealed once the tape is written, so the side is read off it
      // rather than fogged. Null only while the tape has not arrived. A
      // remainder under a lamport is flat here, as it was on the round's own
      // readout — the entry is what backs the mark out of a fill to judge it.
      side: tape ? carriedSide(myFillList, entryLamports) : null,
      token: myLeg ? { mint: myLeg.mint.toBase58(), symbol: myLeg.symbol } : null,
      liquidated: tape ? (isPlayerA ? tape.liquidatedA : tape.liquidatedB) : false,
    };
    const theirs = {
      rank: 0,
      name: opponentName.toUpperCase(),
      seed: opponentAddress ?? opponentName,
      you: false,
      pnl: opponentPnl,
      side: tape ? carriedSide(theirFillList, entryLamports) : null,
      token: theirLeg ? { mint: theirLeg.mint.toBase58(), symbol: theirLeg.symbol } : null,
      liquidated: tape ? (isPlayerA ? tape.liquidatedB : tape.liquidatedA) : false,
    };
    const ordered = won ? [mine, theirs] : [theirs, mine];
    return ordered.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [won, myPnl, opponentPnl, myLeg, theirLeg, opponentName, myName, myAddress, opponentAddress, tape, isPlayerA, entryLamports]);

  /**
   * A drawn round, decided by the program's tie-break rather than by trading.
   *
   * "You missed the top by 0.0000%" is true and tells the reader nothing about
   * why they lost. The rule is public, so it is named.
   */
  const drawn = myPnl === opponentPnl;

  // One line per market, because there are two of them now. "Both traded a
  // market that moved X%" was true when the duel had one token; with a leg
  // each it averaged a memecoin against SOL and reported +11,975%.
  const movesLine = [
    // Measured between a side's first and last stored fills, so a truncated
    // side's move covers only that window, and says so.
    myMove && myLeg?.symbol
      ? `${myLeg.symbol.toUpperCase()} MOVED ${signedPct(myMove.bps)}${lanes?.myNote ? ` (${lanes.myNote})` : ''}`
      : null,
    theirMove && theirLeg?.symbol
      ? `${theirLeg.symbol.toUpperCase()} MOVED ${signedPct(theirMove.bps)}${lanes?.theirNote ? ` (${lanes.theirNote})` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /** The result image: what the button says it is doing, or just did. */
  const [imageLabel, setImageLabel] = useState('SAVE RESULT IMAGE');
  useEffect(() => {
    if (imageLabel === 'SAVE RESULT IMAGE' || imageLabel === 'DRAWING…') return undefined;
    const id = setTimeout(() => setImageLabel('SAVE RESULT IMAGE'), 4000);
    return () => clearTimeout(id);
  }, [imageLabel]);

  const saveImage = async () => {
    if (!lanes) return;
    setImageLabel('DRAWING…');
    try {
      const outcome = await exportRevealCard({
        won,
        headline: won ? 'YOU TAKE THE POT' : 'POT LOST',
        amount: won ? `+${solExact(pot)}` : `-${sol(stake)}`,
        players: standings.map((e) => ({
          rank: e.rank,
          name: e.name,
          you: e.you,
          pnl: e.pnl,
          symbol: e.token?.symbol ?? null,
          liquidated: e.liquidated,
        })),
        you: lanes.mine,
        them: lanes.theirs,
        youNote: lanes.myNote,
        themNote: lanes.theirNote,
        opponentName,
        fills: `YOUR FILLS ${shownMyFills} · THEIRS ${shownTheirFills}`,
        startTs,
        duration,
        moves: movesLine || null,
        record: record ?? null,
        link: tapeUrl,
      });
      setImageLabel(outcome === 'shared' ? 'IMAGE SHARED' : outcome === 'saved' ? 'IMAGE SAVED' : 'SAVE RESULT IMAGE');
    } catch {
      setImageLabel('COULD NOT DRAW IT');
    }
  };

  return (
    <View>
    {/* Once, on a win, after the curtain has torn. */}
    <WinBurst active={won && unsealed} />
    <RevealCurtain
      active
      label={won ? 'YOU TAKE THE POT' : 'POT LOST'}
      sublabel={won ? `+${solExact(pot)}` : `-${sol(stake)}`}
      onDone={() => setUnsealed(true)}
    />
    <Stack pad={space.lg} gap={space.md}>
      <PixelText variant="h1" align="center" color={color.yellow}>
        {won ? 'YOU TAKE THE POT' : 'POT LOST'}
      </PixelText>

      <Badge
        label={won ? `+${solExact(pot)}` : `-${sol(stake)}`}
        tone={won ? 'win' : 'loss'}
        variant="numeric"
        style={{ alignSelf: 'center' }}
      />

      <PixelPanel flat bg={color.chartBg} pad={space.sm}>
        <Stack gap={space.sm}>
          <PixelText variant="label" size={8} color={color.textDim}>
            ROUND TIMELINE
          </PixelText>
          {/* Held back until the curtain tears, so the fills land with it. */}
          {unsealed && lanes ? (
            <RoundTimeline
              you={{ label: 'YOU', points: lanes.mine, tone: color.cyan, note: lanes.myNote }}
              opponent={{ label: opponentName, points: lanes.theirs, tone: color.magenta, note: lanes.theirNote }}
              startTs={startTs}
              duration={duration}
              height={150}
            />
          ) : (
            <View style={{ height: 150, justifyContent: 'center' }}>
              <PixelText variant="bodySmall" size={9} color={color.textFaint} align="center">
                {unsealed ? 'READING THE TAPE…' : ''}
              </PixelText>
            </View>
          )}
        </Stack>
      </PixelPanel>

      {/* The board. Nothing is fogged here: `settle_match` publishes both legs
          and both fill lists, so every field the live round refused is now on
          chain and readable by anyone. Held back until the curtain tears. */}
      {unsealed ? (
        <ResultBoard
          entries={standings}
          settledAt={startTs + duration}
          entryFee={sol(stake)}
          yourRank={won ? 1 : 2}
          trophies={won ? TROPHIES_PER_WIN : 0}
          missedBy={won || drawn ? null : myPnl - opponentPnl}
          drawNote={!won && drawn ? 'A DRAW GOES TO THE MATCH CREATOR' : null}
          paid={won ? solExact(pot) : null}
        />
      ) : null}

      <Row gap={space.sm} justify="center">
        <PixelText variant="bodySmall" size={9} color={color.textFaint}>
          {`YOUR FILLS ${shownMyFills} · THEIRS ${shownTheirFills}`}
        </PixelText>
      </Row>

      {movesLine ? (
        <PixelText variant="bodySmall" size={9} align="center" color={color.textDim}>
          {movesLine}
        </PixelText>
      ) : null}

      {/* The rivalry, recounted from every tape these two wallets share. It is
          the reason to press REMATCH, so it sits directly above it. */}
      {record ? (
        <PixelText variant="label" size={9} align="center" color={color.yellow}>
          {record}
        </PixelText>
      ) : null}

      <Row gap={space.sm}>
        <PixelButton flex={1} tone="gold" label="REMATCH" size={10} onPress={onRematch} />
        {/* This slot once held a "FADE WINNER" that called REMATCH's handler;
            the real one is below. The tape link is real, needs no wallet at
            the other end, and keeps working: it points at the Tape, which the
            program never rewrites. */}
        <PixelButton flex={1} tone="info" label={shareLabel} size={10} onPress={onShare} />
      </Row>

      {/* Fading the winner is a new duel against them: the same stake and round
          length, opened now, with an invite link to send. Only the side that
          lost has someone to fade. */}
      {!won && onFade ? <PixelButton tone="primary" label={fadeLabel} size={10} onPress={onFade} /> : null}

      {/* The tape is public the moment it settles — it is already in the feed.
          The old label promised a posting step that does not exist. */}
      {/* The result as a picture, drawn from the same settled tape as the
          timeline above, so only once that tape has been read. Web only. */}
      {canExportRevealCard && unsealed && lanes ? (
        <PixelButton
          tone="quiet"
          label={imageLabel}
          size={9}
          disabled={imageLabel === 'DRAWING…'}
          onPress={() => void saveImage()}
        />
      ) : null}

      <PixelButton tone="quiet" label="SEE IT IN THE FEED" size={9} onPress={onPost} />
    </Stack>
    </View>
  );
}
