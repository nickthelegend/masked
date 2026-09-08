import type { ViewStyle } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import MaskAvatar from './MaskAvatar';
import TokenLogo from './TokenLogo';
import { border, color, space } from './theme';

export interface MatchRowProps {
  /** Shortened creator address. */
  creator: string;
  /** Stake in SOL. */
  entrySol: number;
  durationSecs: number;
  ageLabel: string;
  /**
   * The market this duel is over.
   *
   * Not decoration: without it a player takes a 1-SOL match on a coin they
   * cannot see, which is the one thing they would want to know first.
   */
  symbol?: string;
  mint?: string;
  imageUri?: string | null;
  /** True when the connected wallet opened this one. */
  mine?: boolean;
  /**
   * Opened too long ago for its price to still mean anything, so the program
   * will refuse a join. Shown as such rather than offered and then refused.
   */
  stale?: boolean;
  busy?: boolean;
  onJoin?: () => void;
  onCancel?: () => void;
  style?: ViewStyle | ViewStyle[];
}

/** One open match in the book. */
export default function MatchRow({
  creator,
  entrySol,
  durationSecs,
  ageLabel,
  symbol,
  mint,
  imageUri = null,
  mine = false,
  stale = false,
  busy = false,
  onJoin,
  onCancel,
  style,
}: MatchRowProps) {
  return (
    <Row
      gap={space.sm}
      pad={space.sm}
      bg={color.panel}
      outline={mine ? color.yellow : color.blue}
      outlineWidth={border.base}
      style={style}
    >
      {mint ? (
        <TokenLogo mint={mint} symbol={symbol ?? '?'} uri={imageUri} size={30} />
      ) : (
        <MaskAvatar size={30} seed={creator} ring={mine ? color.yellow : color.panelLight} glyphSize={11} />
      )}

      <Stack flex={1} gap={2}>
        <PixelText variant="bodySmall" size={11} color={color.white} numberOfLines={1}>
          {symbol ? `${symbol} · ${creator}` : creator}
        </PixelText>
        <PixelText variant="bodySmall" size={10} color={color.textFaint}>
          {durationSecs}s · {ageLabel}
        </PixelText>
      </Stack>

      <PixelText variant="label" color={color.yellow}>
        {entrySol.toFixed(2)}◎
      </PixelText>

      {mine ? (
        <PixelButton label="CANCEL" tone="quiet" size={8} padY={space.sm} loading={busy} onPress={onCancel} />
      ) : stale ? (
        // Both books are seeded from the price snapshotted when the match was
        // opened, so joining a stale one means starting at a number the market
        // left behind. The program refuses it; saying so here is kinder than
        // letting the tap fail.
        <PixelText variant="tabLabel" size={7} color={color.textFaint}>
          STALE
        </PixelText>
      ) : (
        <PixelButton label="JOIN" tone="primary" size={8} padY={space.sm} loading={busy} onPress={onJoin} />
      )}
    </Row>
  );
}
