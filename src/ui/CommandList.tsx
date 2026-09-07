import { useState } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import PixelText from './PixelText';
import Row from './Row';
import Stack from './Stack';
import Divider from './Divider';
import { color, space } from './theme';

export interface CommandEntry {
  /** The command, exactly as it should be pasted. */
  cmd: string;
  /** What running it proves, in one line. */
  proves: string;
}

export interface CommandListProps {
  commands: CommandEntry[];
  title?: string;
  subtitle?: string;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Commands a judge can run, each saying what it proves, each one tap to copy.
 *
 * The argument this project makes is checkable, and the difference between
 * "checkable" and "checked" is usually whether somebody had to retype a
 * command. Tapping a row copies it.
 *
 * A refused clipboard is a normal path — browsers block `writeText` on
 * insecure origins and without a user-gesture grant — so the row says COPY
 * BLOCKED and leaves the command on screen to be read, rather than claiming a
 * copy that did not happen.
 */
export default function CommandList({
  commands,
  title = 'RUN THIS YOURSELF',
  subtitle,
  style,
}: CommandListProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const copy = (cmd: string) => {
    const settle = (ok: boolean) => {
      if (ok) setCopied(cmd);
      else setBlocked(cmd);
      setTimeout(() => {
        setCopied(null);
        setBlocked(null);
      }, 2000);
    };
    try {
      const clip = globalThis.navigator?.clipboard;
      if (!clip?.writeText) return settle(false);
      void clip.writeText(cmd).then(
        () => settle(true),
        () => settle(false)
      );
    } catch {
      settle(false);
    }
  };

  return (
    <PixelPanel flat bg={color.chartBg} style={style}>
      <Stack gap={space.sm}>
        <PixelText variant="label" size={8}>
          {title}
        </PixelText>
        {subtitle ? (
          <PixelText variant="bodySmall" size={9} color={color.textFaint}>
            {subtitle}
          </PixelText>
        ) : null}

        <Stack>
          {commands.map((c) => (
            <Stack key={c.cmd}>
              <Divider color={color.panel} />
              <Pressable
                onPress={() => copy(c.cmd)}
                accessibilityRole="button"
                accessibilityLabel={`Copy ${c.cmd}`}
              >
                <Stack gap={1} style={{ paddingVertical: space.xs }}>
                  <Row justify="space-between" gap={space.sm}>
                    <PixelText variant="bodySmall" size={9} color={color.cyan}>
                      {c.cmd}
                    </PixelText>
                    <PixelText
                      variant="tabLabel"
                      size={7}
                      color={blocked === c.cmd ? color.red : color.textFaint}
                    >
                      {copied === c.cmd ? 'COPIED' : blocked === c.cmd ? 'COPY BLOCKED' : 'TAP TO COPY'}
                    </PixelText>
                  </Row>
                  <PixelText variant="bodySmall" size={8} color={color.textDim} numberOfLines={2}>
                    {c.proves}
                  </PixelText>
                </Stack>
              </Pressable>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </PixelPanel>
  );
}
