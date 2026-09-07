/**
 * The MASKED icon set. Hand-drawn on a 12x12 pixel lattice — see PixelIcon for
 * why these are not unicode glyphs.
 */
import PixelIcon, { type PixelIconProps } from './PixelIcon';

export { default as PixelIcon, GRID, type PixelIconProps } from './PixelIcon';
export { default as PixelArt, type PixelArtProps } from './PixelArt';
export { SolanaMark, UsdcMark, PumpMark } from './TokenMarks';

/** Stacked tape rows — the reveals feed. */
const FEED = [
  '............',
  '............',
  '.##########.',
  '............',
  '.##########.',
  '............',
  '.##########.',
  '............',
  '.#######....',
  '............',
  '............',
  '............',
];

/** A podium, tallest in the middle — the leaderboard. */
const RANK = [
  '............',
  '.....##.....',
  '....####....',
  '....####....',
  '...######...',
  '...######...',
  '..########..',
  '..########..',
  '.##########.',
  '.##########.',
  '............',
  '............',
];

/** Crossed blades — the duel. The glyph this replaces (U+2694) was the worst
 *  offender in the old set: no pixel-font coverage anywhere. */
const DUEL = [
  '##........##',
  '.##......##.',
  '..##....##..',
  '...##..##...',
  '....####....',
  '.....##.....',
  '....####....',
  '...##..##...',
  '..##....##..',
  '.##......##.',
  '##........##',
  '............',
];

/** A 2x2 grid — the game modes. */
const MODES = [
  '............',
  '............',
  '.####..####.',
  '.####..####.',
  '.####..####.',
  '............',
  '............',
  '.####..####.',
  '.####..####.',
  '.####..####.',
  '............',
  '............',
];

/** A checkmark — daily quests. */
const QUEST = [
  '............',
  '..........##',
  '.........##.',
  '........##..',
  '.#.....##...',
  '.##...##....',
  '..##.##.....',
  '...####.....',
  '....##......',
  '............',
  '............',
  '............',
];

/** A circular arrow — reset / back to the feed. */
const RESET = [
  '............',
  '...######...',
  '..#......#..',
  '.#........#.',
  '.#..........',
  '###.........',
  '.#..........',
  '.#........#.',
  '..#......#..',
  '...######...',
  '............',
  '............',
];

/** Three bars — the menu. */
const MENU = [
  '............',
  '............',
  '..########..',
  '..########..',
  '............',
  '..########..',
  '..########..',
  '............',
  '..########..',
  '..########..',
  '............',
  '............',
];

const make = (grid: string[]) =>
  function Icon({ size, color }: PixelIconProps) {
    return <PixelIcon grid={grid} size={size} color={color} />;
  };

/** A speaker with two waves — sound on. */
const SOUND_ON = [
  '............',
  '............',
  '.......#....',
  '......##.#..',
  '..######.#.#',
  '..######.#.#',
  '..######.#.#',
  '..######.#.#',
  '......##.#..',
  '.......#....',
  '............',
  '............',
];

/** The same speaker with the waves struck out — sound off. */
const SOUND_OFF = [
  '............',
  '............',
  '.......#....',
  '......##....',
  '..######.#.#',
  '..######..#.',
  '..######.#.#',
  '..######....',
  '......##....',
  '.......#....',
  '............',
  '............',
];

export const FeedIcon = make(FEED);
export const RankIcon = make(RANK);
export const DuelIcon = make(DUEL);
export const ModesIcon = make(MODES);
export const QuestIcon = make(QUEST);
export const ResetIcon = make(RESET);
export const MenuIcon = make(MENU);
export const SoundOnIcon = make(SOUND_ON);
export const SoundOffIcon = make(SOUND_OFF);

export type PixelIconComponent = (props: PixelIconProps) => React.ReactElement;

/** Every icon, for the gallery. */
export const ICONS = {
  feed: FeedIcon,
  rank: RankIcon,
  duel: DuelIcon,
  modes: ModesIcon,
  quest: QuestIcon,
  reset: ResetIcon,
  menu: MenuIcon,
  soundOn: SoundOnIcon,
  soundOff: SoundOffIcon,
} as const;

export type IconName = keyof typeof ICONS;
