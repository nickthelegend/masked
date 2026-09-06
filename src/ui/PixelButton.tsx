import { useEffect, useState } from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import PixelText from './PixelText';
import { HIT_SLOP_MIN, PRESS_TRAVEL, bevel as bevelToken, border, color, onInk, radius, space, type as typeTokens } from './theme';

export type ButtonTone = 'primary' | 'danger' | 'gold' | 'quiet' | 'info';

interface ToneSpec {
  bg: string;
  fg: string;
}

const TONES: Record<ButtonTone, ToneSpec> = {
  primary: { bg: color.green, fg: color.white },
  danger: { bg: color.red, fg: color.white },
  gold: { bg: color.yellow, fg: onInk.yellow },
  quiet: { bg: color.panel, fg: color.text },
  info: { bg: color.blue, fg: color.white },
};

/** Loading marches a 3-cell block meter so the button keeps its footprint. */
const LOADING_FRAMES = ['■  ', ' ■ ', '  ■', ' ■ '];
const LOADING_MS = 220;

export interface PixelButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  /** Label size in px. Defaults to the `numeric` role's 11px. */
  size?: number;
  disabled?: boolean;
  /** Swaps the label for a marching block meter and blocks presses. */
  loading?: boolean;
  /** Bevel depth. Defaults to `bevel.md`. */
  depth?: number;
  /** Override the tone's background — used only for the stake picker's states. */
  bg?: string;
  fg?: string;
  padY?: number;
  flex?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Press pushes the button down into its own bevel — the whole 8-bit feel lives
 * here. The bottom edge collapses from `base + depth` to `base` while the box
 * translates down by the same 4px, so the face lands exactly where its drop
 * edge was. No opacity fade, no scale spring, no ripple.
 */
export default function PixelButton({
  label,
  onPress,
  tone = 'primary',
  size = typeTokens.numeric.size,
  disabled = false,
  loading = false,
  depth = bevelToken.md,
  bg,
  fg,
  padY = 12,
  flex,
  style,
  ...rest
}: PixelButtonProps) {
  const t = TONES[tone];
  const inert = disabled || loading;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!loading) return undefined;
    const id = setInterval(() => setFrame((f) => (f + 1) % LOADING_FRAMES.length), LOADING_MS);
    return () => clearInterval(id);
  }, [loading]);

  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      accessibilityLabel={label}
      // The bevel translate is the press feedback; a ripple would fight it.
      android_ripple={null}
      style={({ pressed }) => [
        {
          backgroundColor: disabled ? color.panelLight : (bg ?? t.bg),
          borderWidth: border.base,
          borderColor: color.ink,
          borderBottomWidth: pressed && !inert ? border.base : border.base + depth,
          borderRadius: radius.tile,
          paddingVertical: padY,
          paddingHorizontal: space.lg,
          minHeight: HIT_SLOP_MIN,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: pressed && !inert ? PRESS_TRAVEL : 0 }],
          // Disabled is a flat plate on `panelLight`; the 0.6 alpha is inherited
          // from ui/rn/PixelButton.js and is the one opacity in the library.
          opacity: disabled ? 0.6 : 1,
          flex,
        },
        style,
      ]}
      {...rest}
    >
      <PixelText variant="numeric" size={size} color={disabled ? color.textFaint : (fg ?? t.fg)}>
        {loading ? LOADING_FRAMES[frame] : label}
      </PixelText>
    </Pressable>
  );
}
