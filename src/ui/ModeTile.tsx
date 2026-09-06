import { Pressable, type ViewStyle } from 'react-native';
import Box from './Box';
import Stack from './Stack';
import PixelText from './PixelText';
import Badge from './Badge';
import { bevel, color, space } from './theme';

export type ModeStatus = 'LIVE' | 'SOON';

export interface ModeTileProps {
  name: string;
  description: string;
  status?: ModeStatus;
  onPress?: () => void;
  /** Tile width. The modes grid uses '47.5%' for two columns. */
  width?: ViewStyle['width'];
  style?: ViewStyle | ViewStyle[];
}

const MIN_HEIGHT = 108;

/**
 * One game mode. LIVE tiles sit on deep green and are pressable; SOON tiles
 * stay on `panel` and are inert — the status drives both the color and whether
 * the tile responds, so a locked mode can never look playable.
 */
export default function ModeTile({
  name,
  description,
  status = 'SOON',
  onPress,
  width = '47.5%',
  style,
}: ModeTileProps) {
  const live = status === 'LIVE';

  const tile = (
    <Box
      bg={live ? color.greenDeep : color.panel}
      bevel={bevel.sm}
      pad={space.md}
      minHeight={MIN_HEIGHT}
      justify="space-between"
      gap={space.sm}
      width={onPress && live ? undefined : width}
      style={onPress && live ? undefined : style}
    >
      <Stack gap={space.sm}>
        <PixelText variant="label" color={live ? color.white : color.text}>
          {name}
        </PixelText>
        <PixelText variant="bodySmall" size={10} color={live ? color.text : color.textDim}>
          {description}
        </PixelText>
      </Stack>
      <Badge label={status} tone={live ? 'live' : 'soon'} />
    </Box>
  );

  if (!onPress || !live) return tile;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${status}`}
      android_ripple={null}
      style={[{ width }, style as ViewStyle]}
    >
      {tile}
    </Pressable>
  );
}
