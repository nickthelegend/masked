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

/** A cup with two handles — first place, and the trophy counter in the HUD. */
const TROPHY = [
  '............',
  '..########..',
  '##.######.##',
  '##.######.##',
  '##.######.##',
  '.#.######.#.',
  '...######...',
  '....####....',
  '.....##.....',
  '...######...',
  '..########..',
  '............',
];

/** A skull — last place. The counterpart to TROPHY on a result board. */
const SKULL = [
  '............',
  '..########..',
  '.##########.',
  '.##########.',
  '.##..##..##.',
  '.##..##..##.',
  '.##########.',
  '..##.##.##..',
  '..########..',
  '..#.#..#.#..',
  '............',
  '............',
];

/** A struck coin — the balance chip. */
const COIN = [
  '............',
  '...######...',
  '..########..',
  '.###.##.###.',
  '.##..##..##.',
  '.##.###..##.',
  '.##..###.##.',
  '.##..##..##.',
  '.###.##.###.',
  '..########..',
  '...######...',
  '............',
];

/** A left arrow — back out of a screen. */
const BACK = [
  '............',
  '............',
  '.....##.....',
  '....##......',
  '...##.......',
  '..##########',
  '..##########',
  '...##.......',
  '....##......',
  '.....##.....',
  '............',
  '............',
];

/** A plus — top up the balance. */
const PLUS = [
  '............',
  '............',
  '.....##.....',
  '.....##.....',
  '.....##.....',
  '.##########.',
  '.##########.',
  '.....##.....',
  '.....##.....',
  '.....##.....',
  '............',
  '............',
];

/** A clock face — the countdown to the buzzer. */
const CLOCK = [
  '............',
  '...######...',
  '..#......#..',
  '.#....#...#.',
  '#.....#....#',
  '#.....#....#',
  '#.....####.#',
  '#..........#',
  '.#........#.',
  '..#......#..',
  '...######...',
  '............',
];

/** A filled up-caret — a long. */
const CARET_UP = [
  '............',
  '............',
  '.....##.....',
  '....####....',
  '...######...',
  '..########..',
  '.##########.',
  '############',
  '............',
  '............',
  '............',
  '............',
];

/** A filled down-caret — a short. */
const CARET_DOWN = [
  '............',
  '............',
  '............',
  '............',
  '############',
  '.##########.',
  '..########..',
  '...######...',
  '....####....',
  '.....##.....',
  '............',
  '............',
];

/** A crown — the tier badge and the match winner. */
const CROWN = [
  '............',
  '............',
  '#..........#',
  '#....##....#',
  '##...##...##',
  '##.######.##',
  '############',
  '############',
  '#.########.#',
  '############',
  '............',
  '............',
];

/** A shut padlock — a sealed position. The fog, drawn. */
const LOCK = [
  '............',
  '....####....',
  '...##..##...',
  '...##..##...',
  '.##########.',
  '.##########.',
  '.####..####.',
  '.####..####.',
  '.##########.',
  '.##########.',
  '............',
  '............',
];

export const TrophyIcon = make(TROPHY);
export const SkullIcon = make(SKULL);
export const CoinIcon = make(COIN);
export const BackIcon = make(BACK);
export const PlusIcon = make(PLUS);
export const ClockIcon = make(CLOCK);
export const CaretUpIcon = make(CARET_UP);
export const CaretDownIcon = make(CARET_DOWN);
export const CrownIcon = make(CROWN);
export const LockIcon = make(LOCK);

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
  trophy: TrophyIcon,
  skull: SkullIcon,
  coin: CoinIcon,
  back: BackIcon,
  plus: PlusIcon,
  clock: ClockIcon,
  caretUp: CaretUpIcon,
  caretDown: CaretDownIcon,
  crown: CrownIcon,
  lock: LockIcon,
} as const;

export type IconName = keyof typeof ICONS;
