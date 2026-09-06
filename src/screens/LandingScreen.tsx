import { PixelText, Stack, color, space } from '../ui';

export default function LandingScreen() {
  return (
    <Stack flex={1} bg={color.bg} align="center" justify="center" gap={space.md}>
      <PixelText variant="wordmark">MASKED</PixelText>
      <PixelText variant="bodySmall">landing goes here</PixelText>
    </Stack>
  );
}
