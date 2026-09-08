import type { ViewStyle } from 'react-native';
import Box from './Box';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import MaskAvatar from './MaskAvatar';
import { color, onInk, space } from './theme';

export type Place = 1 | 2 | 3;

export interface PodiumEntry {
  name: string;
  place: Place;
  /** Win count printed on the plinth: "21W". */
  wins: string;
}

export interface PodiumProps {
  /** Any three entries. They are ordered 2 · 1 · 3 for display. */
  entries: PodiumEntry[];
  style?: ViewStyle | ViewStyle[];
}

interface PlaceSpec {
  plate: string;
  ink: string;
  height: number;
  avatar: number;
  flex: number;
}

/**
 * Plinth styling is derived from the place, not passed in, so first place can
 * never be drawn shorter than second. Gold, silver-blue, sand-bronze.
 */
const PLACES: Record<Place, PlaceSpec> = {
  1: { plate: color.orange, ink: onInk.yellow, height: 74, avatar: 64, flex: 1.15 },
  2: { plate: color.textFaint, ink: color.ink, height: 46, avatar: 54, flex: 1 },
  3: { plate: color.sand, ink: color.ink, height: 32, avatar: 54, flex: 1 },
};

const ORDER: Place[] = [2, 1, 3];

/** Top three, tallest in the middle. */
export default function Podium({ entries, style }: PodiumProps) {
  const byPlace = new Map(entries.map((e) => [e.place, e]));
  return (
    <Row align="flex-end" gap={space.sm} style={style}>
      {ORDER.map((place) => {
        const entry = byPlace.get(place);
        if (!entry) return null;
        const spec = PLACES[place];
        return (
          <Stack key={place} flex={spec.flex} align="center" gap={space.xs}>
            <MaskAvatar
              size={spec.avatar}
              seed={entry.name}
              ring={spec.plate}
              glyphSize={place === 1 ? 22 : 18}
            />
            <PixelText variant="bodySmall" numberOfLines={1} color={place === 1 ? color.yellow : color.white}>
              {entry.name}
            </PixelText>
            <Box
              width="100%"
              height={spec.height}
              bg={spec.plate}
              outline={color.ink}
              align="center"
              justify="center"
            >
              <PixelText variant="numeric" color={spec.ink}>
                #{place}
              </PixelText>
              <PixelText variant="numeric" size={8} color={spec.ink}>
                {entry.wins}
              </PixelText>
            </Box>
          </Stack>
        );
      })}
    </Row>
  );
}
