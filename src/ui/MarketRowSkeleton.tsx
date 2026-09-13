import { View } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import { border, color, space } from './theme';

/** A flat block the size of the text it stands in for. */
function Bar({ width, height }: { width: number | `${number}%`; height: number }) {
  return <View style={{ width, height, backgroundColor: color.panelLight }} />;
}

/**
 * A market row that has not arrived yet, drawn at the size the real one will be.
 *
 * The picker used to say LOADING MARKETS… in a box one line tall and then jump
 * to a dozen rows when the list landed. This keeps the layout still: a logo
 * square, the ticker and name, and the price, in MarketRow's own padding, so the
 * real rows replace it in place. Static rather than shimmering, like everything
 * else drawn on the pixel grid.
 */
export default function MarketRowSkeleton() {
  return (
    <Row
      testID="market-row-skeleton"
      gap={space.sm}
      pad={space.sm}
      align="center"
      bg={color.panel}
      outline={color.panelLight}
      outlineWidth={border.base}
    >
      <View style={{ width: 32, height: 32, backgroundColor: color.panelLight }} />
      <Stack flex={1} gap={6}>
        <Bar width={64} height={10} />
        <Bar width="55%" height={8} />
      </Stack>
      <Stack gap={6} align="flex-end">
        <Bar width={56} height={11} />
        <Bar width={40} height={8} />
      </Stack>
    </Row>
  );
}
