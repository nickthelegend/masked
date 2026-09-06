import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { font, text, type as typeTokens } from './theme';
import type { TypeRole } from './tokens';

/** The 7px tab label is the hard floor — pixel faces smear below it. */
export const MIN_FONT_SIZE = typeTokens.tabLabel.size;

export interface PixelTextProps extends Omit<TextProps, 'style'> {
  /** One of the nine roles from the platform-notes type table. */
  variant?: TypeRole;
  color?: string;
  align?: TextStyle['textAlign'];
  /**
   * Size override in px. The role's family is kept and `lineHeight` is scaled
   * with it, rounded up to an even number so glyph rows stay on the grid.
   */
  size?: number;
  lineHeight?: number;
  /** Extra style. `fontWeight` is not part of the type — these faces ignore it. */
  style?: Omit<TextStyle, 'fontWeight'> | Array<Omit<TextStyle, 'fontWeight'> | false | undefined>;
  children?: React.ReactNode;
}

const toEven = (n: number) => Math.ceil(n / 2) * 2;

/**
 * Every string in the app goes through here. It pins the family/size/lineHeight
 * to a role, so no screen can invent a type scale, and it turns off font
 * scaling for the display face — those readouts sit in fixed-height HUD boxes
 * and clip the moment the OS scales them.
 */
export default function PixelText({
  variant = 'body',
  color,
  align,
  size,
  lineHeight,
  allowFontScaling,
  style,
  children,
  ...rest
}: PixelTextProps) {
  const role = typeTokens[variant];
  const isDisplay = role.family === font.display;

  if (__DEV__ && size !== undefined && size < MIN_FONT_SIZE) {
    console.warn(
      `PixelText: size ${size} is below the ${MIN_FONT_SIZE}px pixel-font floor (variant "${variant}").`,
    );
  }

  const scaled: TextStyle | undefined =
    size === undefined
      ? lineHeight === undefined
        ? undefined
        : { lineHeight }
      : { fontSize: size, lineHeight: lineHeight ?? toEven((size / role.size) * role.lineHeight) };

  return (
    <Text
      // Display-face readouts (clock, PnL, pot, price, labels) must not scale.
      // Silkscreen body copy still respects the user's text-size setting.
      allowFontScaling={allowFontScaling ?? !isDisplay}
      style={[text[variant], color ? { color } : null, align ? { textAlign: align } : null, scaled, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
