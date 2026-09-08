import Box from './Box';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import MaskAvatar from './MaskAvatar';
import TokenLogo from './TokenLogo';
import { CaretDownIcon, CaretUpIcon, LockIcon, SkullIcon, TrophyIcon } from './icons';
import { color, space, radius, border, onInk } from './theme';
import { signColor } from './format';

/** What a side reads as, once it is allowed to be read at all. */
export type RowSide = 'long' | 'short' | 'flat';

export interface RankRowProps {
  /**
   * 1-based standing, or `null` while the standings themselves are sealed.
   *
   * Mid-round there is no honest rank to print: deciding who is ahead needs
   * both PnLs, and one of them is behind an ACL. `null` draws a padlock and
   * `#?` — the board keeps its shape without inventing an order.
   */
  rank: number | null;
  lastRank: number;
  name: string;
  /** The wallet, for the generated mask. Falls back to the name. */
  seed?: string | null;
  you?: boolean;
  verified?: boolean;
  /**
   * PnL as a percentage. `null` means the reader is not allowed to know —
   * it renders as a fog bar, never as `0.00%`. A zero here would be a lie
   * with the same shape as the truth.
   */
  pnl: number | null;
  /** `null` fogs the side chip, on the same rule as `pnl`. */
  side: RowSide | null;
  token?: { mint: string; symbol: string; uri?: string | null } | null;
  /** Force-closed for running out of equity. Public while the round runs. */
  liquidated?: boolean;
}

function Medal({ rank, lastRank }: { rank: number | null; lastRank: number }) {
  const first = rank === 1;
  const last = rank !== null && rank === lastRank && lastRank > 1;
  const Icon = rank === null ? LockIcon : first ? TrophyIcon : last ? SkullIcon : TrophyIcon;
  const bg = rank === null ? color.ink : first ? color.yellow : color.panelLight;
  const ink = rank === null ? color.textFaint : first ? onInk.yellow : color.textDim;
  return (
    <Stack align="center" gap={1} width={26}>
      <Box
        width={24}
        height={24}
        round={radius.tile}
        bg={bg}
        align="center"
        justify="center"
        outline={color.ink}
        outlineWidth={border.thin}
      >
        <Icon size={14} color={ink} />
      </Box>
      <PixelText variant="tabLabel" size={7} color={color.textFaint}>
        {rank === null ? '#?' : `#${rank}`}
      </PixelText>
    </Stack>
  );
}

/** The side chip — `▲ LONG` / `▼ SHORT`, or a padlock when it is sealed. */
function SideChip({ side }: { side: RowSide | null }) {
  if (side === null) {
    return (
      <Row align="center" gap={3} bg={color.ink} outline={color.panelLight} padX={space.xs} padY={2} round={radius.tile}>
        <LockIcon size={8} color={color.textFaint} />
        <PixelText variant="tabLabel" size={7} color={color.textFaint}>
          SEALED
        </PixelText>
      </Row>
    );
  }
  if (side === 'flat') {
    return (
      <Row align="center" bg={color.ink} outline={color.panelLight} padX={space.xs} padY={2} round={radius.tile}>
        <PixelText variant="tabLabel" size={7} color={color.textDim}>
          FLAT
        </PixelText>
      </Row>
    );
  }
  const long = side === 'long';
  const Icon = long ? CaretUpIcon : CaretDownIcon;
  return (
    <Row align="center" gap={3} bg={color.ink} outline={long ? color.green : color.red} padX={space.xs} padY={2} round={radius.tile}>
      <Icon size={8} color={long ? color.green : color.red} />
      <PixelText variant="tabLabel" size={7} color={long ? color.green : color.red}>
        {long ? 'LONG' : 'SHORT'}
      </PixelText>
    </Row>
  );
}

/**
 * One standing on the live board or the result board.
 *
 * The whole fog rule lives in two props. `pnl: null` and `side: null` are how
 * an opponent is drawn mid-round — the row keeps its shape, its rank, its
 * avatar and its token, and refuses only the two fields the ACL refuses. The
 * token is not one of them: each leg is written into the match account on L1
 * where anyone can read it, so hiding it here would imply a secret that the
 * chain does not keep.
 */
export default function RankRow({
  rank,
  lastRank,
  name,
  seed = null,
  you = false,
  verified = false,
  pnl,
  side,
  token = null,
  liquidated = false,
}: RankRowProps) {
  const fogged = pnl === null;
  return (
    <Row
      align="center"
      gap={space.sm}
      bg={you ? color.panelLight : color.panel}
      outline={you ? color.cyan : color.ink}
      outlineWidth={border.thin}
      round={radius.tile}
      pad={space.sm}
    >
      <Medal rank={rank} lastRank={lastRank} />
      <MaskAvatar size={34} seed={seed ?? name} ring={you ? color.cyan : color.panelLight} bg={color.ink} />
      <Stack flex={1} gap={1}>
        <Row align="center" gap={space.xs}>
          <PixelText variant="tabLabel" size={8} color={color.white} numberOfLines={1}>
            {name}
          </PixelText>
          {verified ? (
            <Box width={11} height={11} round={radius.pill} bg={color.cyan} align="center" justify="center">
              <PixelText variant="tabLabel" size={7} color={color.ink}>
                ✓
              </PixelText>
            </Box>
          ) : null}
          {you ? (
            <PixelText variant="tabLabel" size={7} color={color.textFaint}>
              (YOU)
            </PixelText>
          ) : null}
        </Row>
        {fogged ? (
          // A bar, not a number. Nothing here is derived from their position.
          <Row align="center" gap={space.xs}>
            <Box width={54} height={9} bg={color.ink} round={2} outline={color.panelLight} outlineWidth={2} />
            <PixelText variant="tabLabel" size={7} color={color.textFaint}>
              FOGGED
            </PixelText>
          </Row>
        ) : (
          <PixelText variant="numeric" size={9} color={signColor(pnl)}>
            {`${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)}%`}
          </PixelText>
        )}
      </Stack>
      <Stack align="flex-end" gap={space.xs}>
        {token ? (
          <Row align="center" gap={space.xs} bg={color.ink} round={radius.tile} padX={space.xs} padY={2}>
            <TokenLogo mint={token.mint} symbol={token.symbol} uri={token.uri ?? null} size={14} />
            <PixelText variant="tabLabel" size={7} color={color.yellow}>
              {`$${token.symbol}`}
            </PixelText>
          </Row>
        ) : null}
        {liquidated ? (
          <Row align="center" bg={color.red} round={radius.tile} padX={space.xs} padY={2}>
            <PixelText variant="tabLabel" size={7} color={color.white}>
              LIQUIDATED
            </PixelText>
          </Row>
        ) : (
          <SideChip side={side} />
        )}
      </Stack>
    </Row>
  );
}
