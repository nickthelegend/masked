/**
 * UIGallery — every component in the library, in every state, on the app's
 * dark navy ground. This is the regression check: if a token or a bevel moves,
 * it shows up here before it shows up in a screen.
 */
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Badge,
  Box,
  Divider,
  FillTape,
  FogOverlay,
  GLYPH,
  IconPlate,
  LeaderRow,
  MaskAvatar,
  MatchCard,
  ModeTile,
  Orb,
  PixelButton,
  PixelPanel,
  PixelText,
  PnLReadout,
  PocketShell,
  Podium,
  PotPill,
  ProgressBar,
  QuestRow,
  RoundClock,
  Row,
  ScanlineOverlay,
  Stack,
  StakePicker,
  StatTile,
  TabBar,
  TapeChart,
  Ticker,
  color,
  mulberry32,
  space,
  toEnd,
  type ButtonTone,
} from '../ui';

const TONES: ButtonTone[] = ['primary', 'danger', 'gold', 'quiet', 'info'];

const MINE = [0, 1.2, 0.4, 2.8, 2.1, 4.6, 3.9, 6.1];
const THEIRS = toEnd(MINE.length, -2.4, mulberry32(11));
const FILLS = [
  { side: 'SETTLE', px: '0.9981', t: '0:00' },
  { side: 'CLOSE', px: '1.0042', t: '1:12' },
  { side: 'LONG', px: '0.9930', t: '3:48' },
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Stack gap={space.md}>
      <Stack gap={space.xs}>
        <Divider color={color.panelLight} />
        <Row justify="space-between" gap={space.sm}>
          <PixelText variant="label">{title}</PixelText>
          {note ? <PixelText variant="bodySmall">{note}</PixelText> : null}
        </Row>
      </Stack>
      {children}
    </Stack>
  );
}

export default function UIGallery() {
  const [tab, setTab] = useState('feed');
  const [stake, setStake] = useState(5);
  const [claimed, setClaimed] = useState(false);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.screen }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 120, gap: space.xl }}
      showsVerticalScrollIndicator={false}
    >
      <Stack gap={space.xs}>
        <PixelText variant="wordmark">MASKED</PixelText>
        <PixelText variant="bodySmall">UI GALLERY · every component, every state</PixelText>
      </Stack>

      <Section title="TYPE ROLES" note="9 roles">
        <Stack gap={space.sm}>
          <PixelText variant="wordmark">WORDMARK 18</PixelText>
          <PixelText variant="h1">H1 VERDICT 17</PixelText>
          <PixelText variant="h2">H2 SCREEN TITLE 13</PixelText>
          <PixelText variant="statBig">STATBIG 20</PixelText>
          <PixelText variant="numeric">NUMERIC 11 · +4.12%</PixelText>
          <PixelText variant="label">LABEL 9</PixelText>
          <PixelText variant="tabLabel">TABLABEL 7 · FLOOR</PixelText>
          <PixelText variant="body">Body 13 — Silkscreen explanatory copy.</PixelText>
          <PixelText variant="bodySmall">Body small 11 — ticker, meta, timestamps.</PixelText>
        </Stack>
      </Section>

      <Section title="PIXELBUTTON" note="tone × state">
        <Stack gap={space.sm}>
          {TONES.map((tone) => (
            <Row key={tone} gap={space.sm}>
              <PixelButton flex={1} tone={tone} label={tone.toUpperCase()} size={9} />
              <PixelButton flex={1} tone={tone} label="DISABLED" size={9} disabled />
              <PixelButton flex={1} tone={tone} label="LOAD" size={9} loading />
            </Row>
          ))}
          <PixelText variant="bodySmall">Press any button: the drop edge collapses and the face falls 4px into it.</PixelText>
        </Stack>
      </Section>

      <Section title="PIXELPANEL" note="bevel · accent · flat">
        <Stack gap={space.sm}>
          <PixelPanel>
            <PixelText variant="bodySmall">default · panel bg, ink edge, bevel.md</PixelText>
          </PixelPanel>
          <Row gap={space.sm}>
            <PixelPanel flex={1} accent={color.cyan}>
              <PixelText variant="bodySmall">accent cyan</PixelText>
            </PixelPanel>
            <PixelPanel flex={1} accent={color.magenta}>
              <PixelText variant="bodySmall">accent magenta</PixelText>
            </PixelPanel>
          </Row>
          <PixelPanel flat bg={color.chartBg}>
            <PixelText variant="bodySmall">flat · a well, no drop edge</PixelText>
          </PixelPanel>
        </Stack>
      </Section>

      <Section title="ICONPLATE / BADGE" note="geometric glyphs only">
        <Stack gap={space.md}>
          <Row gap={space.sm} wrap>
            {Object.entries(GLYPH).map(([name, glyph]) => (
              <IconPlate key={name} glyph={glyph} bg={color.panelLight} ink={color.white} />
            ))}
          </Row>
          <Row gap={space.sm} wrap>
            <Badge label="LIVE" tone="live" />
            <Badge label="SOON" tone="soon" />
            <Badge label="GOLD" tone="gold" />
            <Badge label="QUIET" tone="quiet" />
            <Badge label="WIN" tone="win" />
            <Badge label="LOSS" tone="loss" />
            <Badge label="RESETS IN 06:12:40" tone="quiet" variant="label" />
          </Row>
        </Stack>
      </Section>

      <Section title="PROGRESSBAR / DIVIDER">
        <Stack gap={space.sm}>
          <ProgressBar value={0} />
          <ProgressBar value={0.4} />
          <ProgressBar value={1} fill={color.yellow} />
          <Divider />
          <Divider color={color.blue} thickness={4} />
        </Stack>
      </Section>

      <Section title="OVERLAYS" note="scanline · fog">
        <Row gap={space.sm}>
          <Box flex={1} bg={color.panel} height={92} align="center" justify="center" outline={color.ink}>
            <PixelText variant="bodySmall">SCANLINE</PixelText>
            <ScanlineOverlay />
          </Box>
          <Box flex={1} bg={color.panel} height={92} align="center" justify="center" outline={color.ink}>
            <PixelText variant="statBig">+9.99%</PixelText>
            <FogOverlay label="FOGGED" />
          </Box>
        </Row>
      </Section>

      <Section title="MASKAVATAR / STATTILE">
        <Stack gap={space.md}>
          <Row gap={space.md} align="flex-end">
            <MaskAvatar size={30} ring={color.panelLight} glyphSize={11} />
            <MaskAvatar size={58} ring={color.yellow} glyphSize={20} />
            <MaskAvatar size={64} ring={color.blue} glyphSize={22} />
            <MaskAvatar size={58} ring={color.magenta} glyph="!" glyphSize={20} />
          </Row>
          <Row gap={space.xl}>
            <StatTile value="21W" label="WINS" />
            <StatTile value="+$120" label="TAKEN" tone={color.green} />
            <StatTile value="B1" label="RANK" tone={color.cyan} align="left" />
          </Row>
        </Stack>
      </Section>

      <Section title="ORB" note="fog · live · reveal · static">
        <Row gap={space.md} justify="space-between">
          <Orb size={88} state="fog" />
          <Orb size={88} state="live" />
          <Orb size={88} state="reveal" />
          <Orb size={88} state="fog" animate={false} />
        </Row>
      </Section>

      <Section title="TAPECHART" note="one shared lo/hi scale">
        <Stack gap={space.sm}>
          <PixelPanel flat bg={color.chartBg}>
            <TapeChart mine={MINE} height={120} baseline />
          </PixelPanel>
          <PixelPanel flat bg={color.chartBg}>
            <TapeChart mine={MINE} opponent={THEIRS} height={120} />
          </PixelPanel>
          <PixelText variant="bodySmall">
            Dashed magenta ends at -2.40% exactly — toEnd damps its noise to zero at the last sample.
          </PixelText>
        </Stack>
      </Section>

      <Section title="HUD" note="clock · pot · pnl · stake">
        <Stack gap={space.md}>
          <Row gap={space.md} wrap>
            <RoundClock seconds={300} />
            <RoundClock seconds={18} />
            <RoundClock seconds={0} />
            <PotPill amount={9.8} />
            <PotPill amount="$50" tone={color.green} />
          </Row>
          <Row gap={space.sm}>
            <PnLReadout panel flex={1} label="YOU" value={4.12} note="LONG FROM 0.9981" />
            <PnLReadout panel flex={1} label="NOFILLS.SOL" fogged note="FOGGED · 3 FILLS" accent={color.panelLight} />
          </Row>
          <Row gap={space.sm}>
            <PnLReadout panel flex={1} label="WINNER" value={7.9} signed note="4 FILLS" />
            <PnLReadout panel flex={1} label="LOSER" value={-5.1} signed accent={color.magenta} note="6 FILLS" />
          </Row>
          <StakePicker value={stake} onChange={setStake} note="WINNER TAKES $9.80 · 2% RAKE" />
        </Stack>
      </Section>

      <Section title="FILLTAPE" note="empty · filled · fogged">
        <Stack gap={space.sm}>
          <FillTape fills={[]} note="HIDDEN UNTIL REVEAL" />
          <FillTape fills={FILLS} note="HIDDEN UNTIL REVEAL" />
          <FillTape fills={FILLS} title="OPPONENT TAPE" fogged fogLabel="SEALED" />
        </Stack>
      </Section>

      <Section title="MATCHCARD">
        <MatchCard
          token="$BONK"
          pot="$50"
          ago="2m ago"
          winner="nofills.sol"
          loser="jpegliq"
          winnerPnl="+4.12%"
          loserPnl="-1.80%"
          winnerSeries={MINE}
          loserSeries={THEIRS}
        />
      </Section>

      <Section title="PODIUM / LEADERROW">
        <Stack gap={space.sm}>
          <Podium
            entries={[
              { name: 'nofills.sol', place: 1, wins: '21W' },
              { name: 'shadowbid', place: 2, wins: '14W' },
              { name: 'vwapgoblin', place: 3, wins: '11W' },
            ]}
          />
          <LeaderRow rank={4} name="liqhunter" won="+$120" wins="18W" />
          <LeaderRow rank={5} name="you" won="+$96" wins="15W" highlight ring={color.yellow} />
        </Stack>
      </Section>

      <Section title="MODETILE / QUESTROW">
        <Stack gap={space.md}>
          <Row gap={space.md} wrap>
            <ModeTile name="FOG DUEL" description="Same token, 5 min, hidden positions." status="LIVE" onPress={() => {}} />
            <ModeTile name="CHICKEN" description="First seller pays a penalty to holders." status="SOON" />
          </Row>
          <QuestRow name="Win 3 fog duels" reward="+$5" value={0.66} progress="2 / 3" />
          <QuestRow
            name="Rematch the same wallet"
            reward="+$1"
            value={1}
            progress="1 / 1"
            claimed={claimed}
            onClaim={() => setClaimed(true)}
          />
        </Stack>
      </Section>

      <Section title="TICKER / TABBAR">
        <Stack gap={space.md}>
          <Ticker items={['t_kev_2 WON $7.65 ON FOG DUEL', 'nofills.sol 6 WIN STREAK', 'LIVE FOGS: 38']} />
          <Box bg={color.ink}>
            <TabBar active={tab} onChange={setTab} />
          </Box>
        </Stack>
      </Section>

      <Section title="POCKETSHELL" note="screen clipped to 180px here">
        <View style={{ alignItems: 'center' }}>
          <PocketShell screenHeight={180}>
            <Stack pad={space.lg} gap={space.sm} align="center" justify="center" flex={1}>
              <PixelText variant="h2">FOG DUEL</PixelText>
              <PixelText variant="bodySmall">the shell clips its screen and pins the tab bar</PixelText>
            </Stack>
          </PocketShell>
        </View>
      </Section>
    </ScrollView>
  );
}
