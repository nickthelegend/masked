import type { ReactNode } from 'react';
import { View } from 'react-native';
import Box from './Box';
import Row from './Row';
import PixelText from './PixelText';
import { border, color, onInk, radius, shade, space } from './theme';

export interface PocketShellProps {
  children?: ReactNode;
  /** Inner screen height. The design screen is 440 x 700. */
  screenHeight?: number;
  /** Engraved caption under the d-pad row. */
  caption?: string;
  /** Label printed on the shell's top edge. */
  brand?: string;
}

/**
 * Red Game Boy-style shell. The screen has curved edges and clips its content;
 * every control here is decorative — the app is driven by the touch screen.
 */
export default function PocketShell({
  children,
  screenHeight = 700,
  caption = 'FOG DUEL',
  brand = 'MASKED·POCKET',
}: PocketShellProps) {
  return (
    <View
      style={{
        width: '100%',
        maxWidth: 440,
        backgroundColor: color.shellBottom,
        borderWidth: border.shell,
        borderColor: color.shellEdge,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomRightRadius: 18,
        borderBottomLeftRadius: 70,
        paddingHorizontal: space.lg,
        paddingTop: space.lg,
      }}
    >
      {/* top edge: power LEDs, brand, speaker slot */}
      <Row justify="space-between" style={{ paddingBottom: space.md }}>
        <Row gap={5}>
          <Box width={9} height={9} round={5} bg={shade.led} />
          <Box width={9} height={9} round={5} bg={color.shellButton} />
        </Row>
        <PixelText variant="tabLabel" size={8} color={color.shellInk}>
          {brand}
        </PixelText>
        <Box width={34} height={6} round={3} bg={color.shellButton} />
      </Row>

      {/* screen bezel */}
      <View
        style={{
          backgroundColor: color.shellInner,
          padding: space.md,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderBottomRightRadius: 16,
          borderBottomLeftRadius: 30,
        }}
      >
        <Box
          bg={color.screen}
          outline={color.inkDeep}
          outlineWidth={border.thick}
          height={screenHeight}
          round={radius.screen}
          overflow="hidden"
        >
          {children}
        </Box>
      </View>

      {/* controls */}
      <Row justify="space-between" style={{ paddingHorizontal: space.md, paddingTop: 16, paddingBottom: space.xl }}>
        <View style={{ width: 74, height: 74 }}>
          <Box
            bg={onInk.red}
            outline={color.shellInner}
            round={radius.tile}
            width={26}
            height={74}
            style={{ position: 'absolute', left: 24 }}
          />
          <Box
            bg={onInk.red}
            outline={color.shellInner}
            round={radius.tile}
            width={74}
            height={26}
            style={{ position: 'absolute', top: 24 }}
          />
        </View>

        <Box align="center" gap={space.sm}>
          <PixelText variant="label" color={color.shellInk}>
            {caption}
          </PixelText>
          <Row gap={space.sm}>
            <Box width={30} height={8} round={4} bg={color.shellButton} />
            <Box width={30} height={8} round={4} bg={color.shellButton} />
          </Row>
        </Box>

        <Row gap={space.md} style={{ transform: [{ rotate: '-16deg' }] }}>
          {['B', 'A'].map((l) => (
            <Box
              key={l}
              bg={color.shellButton}
              outline={color.shellInner}
              width={38}
              height={38}
              round={19}
              align="center"
              justify="center"
            >
              <PixelText variant="tabLabel" size={10} color={color.shellInk}>
                {l}
              </PixelText>
            </Box>
          ))}
        </Row>
      </Row>
    </View>
  );
}
