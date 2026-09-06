import type { ViewStyle } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import MaskAvatar from './MaskAvatar';
import { border, color, space } from './theme';

export interface MatchRowProps {
  /** Shortened creator address. */
  creator: string;
  /** Stake in SOL. */
  entrySol: number;
  durationSecs: number;
  ageLabel: string;
  /** True when the connected wallet opened this one. */
  mine?: boolean;
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
  mine = false,
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
      <MaskAvatar size={30} ring={mine ? color.yellow : color.panelLight} glyphSize={11} />

      <Stack flex={1} gap={2}>
        <PixelText variant="bodySmall" size={11} color={color.white} numberOfLines={1}>
          {creator}
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
      ) : (
        <PixelButton label="JOIN" tone="primary" size={8} padY={space.sm} loading={busy} onPress={onJoin} />
      )}
    </Row>
  );
}
