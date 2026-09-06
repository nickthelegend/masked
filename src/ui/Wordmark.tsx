import { View, type ViewStyle } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import MaskAvatar from './MaskAvatar';
import { color, space, type as typeTokens } from './theme';

export interface WordmarkProps {
  label?: string;
  /** Wordmark size in px. Defaults to the 18px `wordmark` role. */
  size?: number;
  /** Shows the masked "?" plate to the left of the word. */
  plate?: boolean;
  /**
   * Chromatic split — magenta and cyan copies offset behind the white word.
   * It is the one place the palette's two brightest accents are used as an
   * effect rather than as meaning, and it reads as CRT misconvergence.
   */
  glitch?: boolean;
  /** Offset of the split copies, in px. */
  offset?: number;
  color?: string;
  style?: ViewStyle | ViewStyle[];
}

/**
 * The MASKED lockup: masked plate + wordmark. Used in the landing nav and the
 * footer (ui/platform-notes.md lists both as `wordmark` sites).
 */
export default function Wordmark({
  label = 'MASKED',
  size = typeTokens.wordmark.size,
  plate = true,
  glitch = true,
  offset = 2,
  color: face = color.white,
  style,
}: WordmarkProps) {
  const word = (
    <View>
      {glitch ? (
        <>
          <PixelText
            variant="wordmark"
            size={size}
            color={color.magenta}
            style={{ position: 'absolute', left: -offset, top: 0 }}
          >
            {label}
          </PixelText>
          <PixelText
            variant="wordmark"
            size={size}
            color={color.cyan}
            style={{ position: 'absolute', left: offset, top: 0 }}
          >
            {label}
          </PixelText>
        </>
      ) : null}
      <PixelText variant="wordmark" size={size} color={face}>
        {label}
      </PixelText>
    </View>
  );

  if (!plate) return <View style={style}>{word}</View>;

  return (
    <Row gap={space.sm} style={style}>
      <MaskAvatar size={Math.round(size * 1.9)} ring={color.yellow} glyphSize={Math.round(size * 0.72)} />
      {word}
    </Row>
  );
}
