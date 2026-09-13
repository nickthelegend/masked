import { forwardRef, useEffect, useState } from 'react';
import { Pressable, type PressableProps, type View, type ViewStyle } from 'react-native';
import PixelText from './PixelText';
import { HIT_SLOP_MIN, PRESS_TRAVEL, bevel as bevelToken, border, color, focusRing, onInk, radius, space, type as typeTokens } from './theme';

export type ButtonTone = 'primary' | 'short' | 'danger' | 'gold' | 'quiet' | 'info';

interface ToneSpec {
  bg: string;
  fg: string;
}

const TONES: Record<ButtonTone, ToneSpec> = {
  primary: { bg: color.green, fg: color.white },
  // Shorting is a direction, not a warning, so it gets its own plate rather
  // than borrowing the red one CLOSE already owns. Purple is the only accent
  // not already carrying a meaning in the round HUD.
  short: { bg: color.purple, fg: onInk.purple },
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
/**
 * Forwards its ref to the underlying Pressable.
 *
 * expo-router's `<Link asChild>` clones its child and hands it a ref so it can
 * attach navigation. A plain function component cannot take one, and React
 * warned about it on every screen with a Link — including the 404, whose whole
 * job is to be the page you land on when something has already gone wrong.
 */
const PixelButton = forwardRef<View, PixelButtonProps>(function PixelButton({
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
}: PixelButtonProps, ref) {
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
      ref={ref}
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      accessibilityLabel={label}
      // The bevel translate is the press feedback; a ripple would fight it.
      android_ripple={null}
      // `focused` comes from React Native Web's Pressable; it is how a keyboard
      // user sees which control Enter or Space will press.
      style={(state) => {
        const { pressed } = state;
        return [
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
        (state as { focused?: boolean }).focused ? focusRing : null,
        style,
      ];
      }}
      {...rest}
    >
      <PixelText variant="numeric" size={size} color={disabled ? color.textFaint : (fg ?? t.fg)}>
        {loading ? LOADING_FRAMES[frame] : label}
      </PixelText>
    </Pressable>
  );
});

export default PixelButton;
