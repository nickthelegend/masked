/**
 * Demo content for the MASKED screens, lifted verbatim from the working app.
 * Kept apart from the screens so a screen file is layout only.
 */

export interface FeedMatch {
  token: string;
  pot: string;
  winner: string;
  loser: string;
  winnerPnl: string;
  loserPnl: string;
  ago: string;
  winnerSeries: number[];
  loserSeries: number[];
}

/**
 * The feed is read from chain (see src/chain/useTapes.ts). This interface is
 * retained because MatchCard's props are shaped by it; the hardcoded match
 * list that used to live here was demo data and has been deleted.
 */

/**
 * Feed filters. These actually filter — the previous set included a
 * "FRIENDS" tab with no social graph behind it and a "LIVE FOG" tab that
 * showed the same settled reveals as the others.
 */
export const FEED_FILTERS = ['REVEALS', 'BIG POTS', 'MINE'] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

/**
 * Round length in seconds.
 *
 * The product round is five minutes, and that is what ships. A five-minute
 * wait is unwatchable on camera, so DEMO.md records with
 * EXPO_PUBLIC_ROUND_SECONDS=60 rather than the product pretending to be
 * shorter than it is. The program accepts anything from MIN_DURATION (10s) to
 * MAX_DURATION (3600s), so this is a real parameter, not a display trick.
 */
export const FULL_ROUND_SECONDS = 300;
export const DEMO_ROUND_SECONDS = 60;

const envRound = Number(process.env.EXPO_PUBLIC_ROUND_SECONDS);
export const ROUND_SECONDS =
  Number.isFinite(envRound) && envRound >= 10 && envRound <= 3600 ? envRound : FULL_ROUND_SECONDS;
export const RAKE = 0.02;

/**
 * Trophies a duel is worth.
 *
 * A display counter, not a chain value: the program records wins, and this is
 * the multiplier the arena prints them with. Kept here so the live round and
 * the result board cannot disagree about what a win pays.
 */
export const TROPHIES_PER_WIN = 1000;

/**
 * The round length, written out for prose and for captions.
 *
 * Both derive from ROUND_SECONDS rather than repeating a number. The marketing
 * copy used to say "five minutes" in three places while the app ran 60-second
 * rounds and the badge next to it said 60S — so the page contradicted itself
 * and the product, and would have again the first time the constant moved.
 */
export const roundPhrase = (secs: number = ROUND_SECONDS): string => {
  if (secs % 60 !== 0) return `${secs} seconds`;
  const mins = secs / 60;
  if (mins === 1) return 'one minute';
  const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return `${WORDS[mins] ?? mins} minutes`;
};

/** The same length as a caption: "60S", "5 MIN". */
export const roundBadge = (secs: number = ROUND_SECONDS): string =>
  secs % 60 === 0 && secs >= 120 ? `${secs / 60} MIN` : `${secs}S`;

/** A pot at or above this many lamports counts as a big one. */
export const BIG_POT_LAMPORTS = 0.2 * 1e9;


export interface BoardRow {
  rank: number;
  name: string;
  won: string;
  wins: string;
}


export interface ModeDef {
  name: string;
  description: string;
  status: 'LIVE' | 'SOON';
}

export const MODES: ModeDef[] = [
  { name: 'FOG DUEL', description: `Your token vs theirs, ${roundBadge()}, hidden positions.`, status: 'LIVE' },
  { name: 'CHICKEN', description: 'First seller pays a penalty to holders.', status: 'SOON' },
  { name: 'FADE ME', description: 'Opponent must take the opposite side.', status: 'SOON' },
  { name: 'GHOST ROYALE', description: 'Bottom 3 cut every 90 seconds.', status: 'SOON' },
  { name: 'BLIND DRAFT', description: 'VRF picks 3 tokens, you pick privately.', status: 'SOON' },
  { name: 'HOT POTATO', description: 'Empty-handed at the buzzer = loss.', status: 'SOON' },
  { name: 'SQUAD FOG', description: '2v2. Teammates visible, enemies fogged.', status: 'SOON' },
  { name: 'SUDDEN REVEAL', description: '4 min fog, then 60s public chaos.', status: 'SOON' },
  { name: 'COPY BAN', description: 'You see that they traded, not what.', status: 'SOON' },
  { name: 'ASSASSINATION', description: 'Beat the marked wallet blind.', status: 'SOON' },
  { name: 'HOLD THE LINE', description: 'Early exit pays the table.', status: 'SOON' },
  { name: 'THESIS FIGHT', description: 'Lock a private thesis, reveal with tape.', status: 'SOON' },
];

export interface QuestDef {
  name: string;
  reward: string;
  value: number;
  progress: string;
}

/* QUESTS deleted — progress is derived from on-chain PlayerStats in
   src/chain/useQuests.ts rather than hardcoded. */

/* TICKER_ITEMS deleted — the ticker reads real chain activity via
   src/chain/useTickerItems.ts. */

/* TOKEN deleted — the market label is resolved from the match's real mint
   in src/chain/market.ts. It used to read "$BONK" over PublicKey.default. */
/** Shown before an opponent has actually joined. Not a handle — nobody is
 *  there yet, and inventing a name would imply otherwise. */
export const OPPONENT_PENDING = 'AWAITING OPPONENT';
/* ---------- landing ---------- */

export interface LandingStat {
  value: string;
  label: string;
}

/**
 * Labels only. The values are read from chain at render time — these were
 * previously invented figures presented as platform metrics.
 */
export const LANDING_STAT_LABELS = ['OPEN FOGS', 'PAID OUT', 'DUELS SETTLED'] as const;

export interface HowStep {
  glyph: string;
  plate: string;
  ink: string;
  title: string;
  body: string;
}

export const HOW_IT_WORKS: HowStep[] = [
  {
    glyph: '\u25C6',
    plate: '#ffd21e',
    ink: '#3a2a00',
    title: '1 · STAKE',
    body: 'Pick a pot from 0.05◎ to 1◎. Your opponent matches it. Both sides lock before a single fill.',
  },
  {
    glyph: '\u25CF',
    plate: '#35e0ff',
    ink: '#06263a',
    title: '2 · TRADE FOGGED',
    body:
      `${roundPhrase()[0].toUpperCase()}${roundPhrase().slice(1)}, one token. ` +
      'You see your own tape. Of theirs you see a fill count and nothing else.',
  },
  {
    glyph: '\u25B2',
    plate: '#2fbf5c',
    ink: '#05270f',
    title: '3 · REVEAL',
    body: 'At 0:00 both tapes unseal. Best PnL takes the pot, less a 2% rake. Rematch or fade on the spot.',
  },
];
