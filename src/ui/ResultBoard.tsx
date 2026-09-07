import Stack from './Stack';
import Row from './Row';
import Box from './Box';
import PixelText from './PixelText';
import Divider from './Divider';
import RankRow, { type RankRowProps } from './RankRow';
import { CoinIcon, SkullIcon, TrophyIcon } from './icons';
import { color, space, radius, border, onInk } from './theme';

/** One standing on the board. Identical shape to a live row, minus the fog. */
export type ResultEntry = Omit<RankRowProps, 'lastRank'>;

export interface ResultBoardProps {
  /** Rows in finishing order. The caller sorts; this does not re-rank. */
  entries: ResultEntry[];
  /** Unix seconds the round settled. Printed as the date line. */
  settledAt: number;
  /** What each side staked, formatted. */
  entryFee: string;
  /** Where the reader finished, 1-based. */
  yourRank: number;
  /** Trophies awarded to the reader. */
  trophies: number;
  /** How far off the lead the reader was, in percentage points. */
  missedBy?: number | null;
  /** What the reader was paid, formatted, when they won. */
  paid?: string | null;
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

/** `MAY 11TH, 2026 · 15:10`, in the arena's voice. */
function stamp(unix: number): string {
  const d = new Date(unix * 1000);
  const day = d.getDate();
  const th = day % 10 === 1 && day !== 11 ? 'ST' : day % 10 === 2 && day !== 12 ? 'ND' : day % 10 === 3 && day !== 13 ? 'RD' : 'TH';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${day}${th}, ${d.getFullYear()} · ${hh}:${mm}`;
}

/**
 * The board a finished duel leaves behind.
 *
 * Nothing here is fogged: settlement writes both legs to the match account, so
 * by the time this renders the chain itself has published what the round kept
 * secret. That is the whole shape of the mode — sealed while it can still be
 * traded against, public the moment it cannot.
 */
export default function ResultBoard({
  entries,
  settledAt,
  entryFee,
  yourRank,
  trophies,
  missedBy = null,
  paid = null,
}: ResultBoardProps) {
  const won = yourRank === 1;
  return (
    <Stack gap={space.md}>
      <Stack align="center" gap={2}>
        <PixelText variant="h2" size={15} color={color.white}>
          1V1
        </PixelText>
        <PixelText variant="bodySmall" size={9} color={color.textFaint}>
          {stamp(settledAt)}
        </PixelText>
        <Row align="center" gap={space.xs}>
          <PixelText variant="tabLabel" size={7} color={color.textDim}>
            ENTRY FEE
          </PixelText>
          <Box width={14} height={14} round={radius.pill} bg={color.blue} align="center" justify="center">
            <CoinIcon size={10} color={color.white} />
          </Box>
          <PixelText variant="tabLabel" size={8} color={color.white}>
            {entryFee}
          </PixelText>
        </Row>
      </Stack>

      <Stack gap={space.sm}>
        {entries.map((e, i) => (
          <RankRow key={`${e.name}-${i}`} {...e} lastRank={entries.length} />
        ))}
      </Stack>

      <Divider />

      <Stack align="center" gap={space.sm}>
        <Box
          width={38}
          height={38}
          round={radius.tile}
          bg={won ? color.yellow : color.panelLight}
          align="center"
          justify="center"
          outline={color.ink}
          outlineWidth={border.thin}
        >
          {won ? <TrophyIcon size={22} color={onInk.yellow} /> : <SkullIcon size={22} color={color.textDim} />}
        </Box>
        <PixelText variant="bodySmall" size={11} color={color.textDim}>
          {`You finished at #${yourRank}`}
        </PixelText>
        <Row align="center" gap={space.xs}>
          <TrophyIcon size={11} color={color.yellow} />
          <PixelText variant="tabLabel" size={8} color={color.yellow}>
            {`+${trophies}`}
          </PixelText>
          {paid ? (
            <>
              <CoinIcon size={11} color={color.cyan} />
              <PixelText variant="tabLabel" size={8} color={color.cyan}>
                {`+${paid}`}
              </PixelText>
            </>
          ) : null}
        </Row>
        <PixelText variant="h2" size={14} align="center" color={won ? color.green : color.orange}>
          {won ? 'YOU TOOK THE POT' : 'OOF… SO CLOSE'}
        </PixelText>
        {!won && missedBy !== null ? (
          <PixelText variant="bodySmall" size={10} align="center" color={color.textFaint}>
            {`You missed the top by ${Math.abs(missedBy).toFixed(4)}% (round PnL)`}
          </PixelText>
        ) : null}
      </Stack>
    </Stack>
  );
}
