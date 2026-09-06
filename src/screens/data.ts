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
  { name: 'FOG DUEL', description: 'Same token, 5 min, hidden positions.', status: 'LIVE' },
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

export const TOKEN = '$BONK';
/** Shown before an opponent has actually joined. Not a handle — nobody is
 *  there yet, and inventing a name would imply otherwise. */
export const OPPONENT_PENDING = 'AWAITING OPPONENT';
export const ROUND_SECONDS = 300;
export const RAKE = 0.02;

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
    body: 'Pick a pot from $1 to $100. Your opponent matches it. Both sides lock before a single fill.',
  },
  {
    glyph: '\u25CF',
    plate: '#35e0ff',
    ink: '#06263a',
    title: '2 · TRADE FOGGED',
    body: 'Five minutes, one token. You see your own tape. Of theirs you see a fill count and nothing else.',
  },
  {
    glyph: '\u25B2',
    plate: '#2fbf5c',
    ink: '#05270f',
    title: '3 · REVEAL',
    body: 'At 0:00 both tapes unseal. Best PnL takes the pot, less a 2% rake. Rematch or fade on the spot.',
  },
];
