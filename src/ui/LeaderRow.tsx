import { Pressable, type ViewStyle } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import MaskAvatar from './MaskAvatar';
import { HIT_SLOP_MIN, border, color, space } from './theme';

export interface LeaderRowProps {
  rank: number | string;
  name: string;
  /** Amount won, pre-formatted: "+$120". */
  won: string;
  /** Win count: "18W". */
  wins: string;
  /** Mask ring color. */
  ring?: string;
  /** Highlights the viewer's own row. */
  highlight?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
}

/**
 * One rank below the podium. Blue outline rather than a bevel — the board is a
 * flat list, so rows sit in the ground instead of standing on it.
 */
export default function LeaderRow({
  rank,
  name,
  won,
  wins,
  ring = color.panelLight,
  highlight = false,
  onPress,
  style,
}: LeaderRowProps) {
  const body = (
    <Row
      gap={space.sm}
      pad={space.sm + 2}
      minHeight={HIT_SLOP_MIN}
      bg={highlight ? color.panelLight : color.panel}
      outline={highlight ? color.yellow : color.blue}
      outlineWidth={border.base}
      style={onPress ? undefined : style}
    >
      <PixelText variant="label" color={color.yellow} align="center" style={{ width: 34 }}>
        #{rank}
      </PixelText>
      <MaskAvatar size={30} seed={name} ring={ring} glyphSize={11} />
      <PixelText variant="body" size={12} numberOfLines={1} color={color.white} style={{ flex: 1 }}>
        {name}
      </PixelText>
      <PixelText variant="label" color={color.green}>
        {won}
      </PixelText>
      <PixelText variant="label" color={color.textDim}>
        {wins}
      </PixelText>
    </Row>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, rank ${rank}`} android_ripple={null} style={style}>
      {body}
    </Pressable>
  );
}
