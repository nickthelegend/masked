import Row from './Row';
import Box from './Box';
import PixelText from './PixelText';
import { CoinIcon, TrophyIcon } from './icons';
import { color, space, radius, border, onInk } from './theme';

export interface PotentialEarningsProps {
  /** What the pot pays the winner, net of rake, already formatted in SOL. */
  sol: string;
  /** Trophies the win is worth. */
  trophies: number;
  /**
   * Dims the bar. Never set from who is leading: mid-round the opponent's PnL
   * is sealed, so this app cannot know, and a bar that brightened when the
   * reader took the lead would be a side channel straight through the ACL.
   * The reveal dims it once the pot has actually gone the other way.
   */
  dimmed?: boolean;
}

/**
 * What this round pays the reader if they take it.
 *
 * A conditional, not a prediction — it is the same number all round, because
 * the only input is the pot. Nothing here is derived from the opponent.
 */
export default function PotentialEarnings({ sol, trophies, dimmed = false }: PotentialEarningsProps) {
  const winning = !dimmed;
  const ink = winning ? color.white : color.textFaint;
  return (
    <Row
      align="center"
      justify="space-between"
      bg={color.panel}
      outline={winning ? color.blue : color.ink}
      outlineWidth={border.thin}
      round={radius.tile}
      padX={space.md}
      padY={space.sm}
    >
      <PixelText variant="bodySmall" size={11} color={ink}>
        Your potential earnings
      </PixelText>
      <Row align="center" gap={space.sm}>
        <Row align="center" gap={space.xs}>
          <Box width={16} height={16} round={radius.pill} bg={winning ? color.blue : color.ink} align="center" justify="center">
            <CoinIcon size={11} color={winning ? color.white : color.textFaint} />
          </Box>
          <PixelText variant="tabLabel" size={8} color={winning ? color.cyan : color.textFaint}>
            {`+${sol}`}
          </PixelText>
        </Row>
        <Row align="center" gap={space.xs}>
          <Box width={16} height={16} round={radius.pill} bg={winning ? color.yellow : color.ink} align="center" justify="center">
            <TrophyIcon size={11} color={winning ? onInk.yellow : color.textFaint} />
          </Box>
          <PixelText variant="tabLabel" size={8} color={winning ? color.yellow : color.textFaint}>
            {`+${trophies}`}
          </PixelText>
        </Row>
      </Row>
    </Row>
  );
}
