/** /status — is everything this demo depends on actually up? */
import { ScrollView } from 'react-native';
import {
  Badge,
  Divider,
  PixelButton,
  PixelText,
  ProofPanel,
  Row,
  Stack,
  Wordmark,
  color,
  space,
} from '../ui';
import { useHealth } from '../chain/useHealth';
import { ACTIVE_CLUSTER } from '../chain/config';

const BUILD = { version: '1.0.0', builtAt: new Date().toISOString().slice(0, 10) };

export default function StatusScreen() {
  const { checks, online, refresh } = useHealth();
  const allUp = checks.length > 0 && checks.every((c) => c.state === 'up');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg, maxWidth: 640, alignSelf: 'center', width: '100%' }}
    >
      <Row justify="space-between" gap={space.md}>
        <Wordmark size={16} />
        <Badge
          label={allUp ? 'ALL SYSTEMS UP' : online ? 'DEGRADED' : 'DOWN'}
          tone={allUp ? 'win' : online ? 'soon' : 'loss'}
          variant="label"
        />
      </Row>

      <Stack gap={space.xs}>
        <PixelText variant="h2">STATUS</PixelText>
        <PixelText variant="bodySmall">
          A demo that fails because a validator died looks the same as one that fails because the code is wrong.
          This tells you which.
        </PixelText>
        <Divider color={color.panelLight} />
      </Stack>

      <ProofPanel
        title="DEPENDENCIES"
        rows={checks.map((c) => ({
          label: c.name,
          value: c.state === 'up' ? c.detail : `DOWN — ${c.detail}`,
          tone: (c.state === 'up' ? 'good' : 'bad') as 'good' | 'bad',
          mono: true,
        }))}
      />

      <ProofPanel
        title="BUILD"
        rows={[
          { label: 'version', value: BUILD.version },
          { label: 'cluster', value: ACTIVE_CLUSTER.name.toUpperCase() },
          { label: 'tee', value: ACTIVE_CLUSTER.tee ? 'YES' : 'NO', tone: ACTIVE_CLUSTER.tee ? 'good' : 'bad' },
        ]}
      />

      <PixelButton tone="info" label="RE-CHECK" onPress={() => void refresh()} />
    </ScrollView>
  );
}
