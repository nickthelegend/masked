/**
 * UIGallery — every component in the library, in every state, on the app's
 * dark navy ground. This is the regression check: if a token or a bevel moves,
 * it shows up here before it shows up in a screen.
 */
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  useToast,
  Badge,
  Box,
  Divider,
  FillTape,
  FogOverlay,
  GLYPH,
  ICONS,
  IconPlate,
  LeaderRow,
  MaskAvatar,
  MatchCard,
  ModeTile,
  Orb,
  PixelButton,
  PixelPanel,
  PixelText,
  PnLOdometer,
  PnLReadout,
  ProofPanel,
  RevealCurtain,
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
  TokenLogo,
  MarketRow,
  MarketTabs,
  MarketPicker,
  MarketHeader,
  type MarketKindKey,
  type PickableMarket,
} from '../ui';

/**
 * Fixed rows, so the gallery renders the same thing every time.
 *
 * The app's picker is fed by live HTTP; a component catalogue that changed
 * every reload would be useless for spotting a visual regression.
 */
const GALLERY_MARKETS: PickableMarket[] = [
  {
    mint: 'ujpDypnBtY8hEFvPSJyo7uP6Ds8a18qPJxhZVQRpump',
    symbol: 'NTDA',
    name: 'National Trump Digital Accounts',
    price: '$1.00',
    cap: '$1.00B',
    source: 'pump.fun',
  },
  {
    mint: 'ARtjW78Jy285Np4f2K1fM2zNCskezrnK1YJehjbFpump',
    symbol: 'WOFI',
    name: 'WOFI',
    price: '$0.8329',
    cap: '$832.9M',
    source: 'pump.fun',
  },
  {
    mint: 'qX4gjQfLKZaTfLKZaTfLKZaTfLKZaTfLKZaTfLKZpump',
    symbol: 'WOTF',
    name: 'World Of The Future',
    price: '$0.8061',
    cap: '$806.1M',
    source: 'pump.fun',
  },
];

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
  const [curtain, setCurtain] = useState(false);
  const [galleryKind, setGalleryKind] = useState<MarketKindKey>('meme');
  const [odo, setOdo] = useState(4.12);
  const toast = useToast();

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

      <Section title="ICONPLATE / BADGE" note="drawn SVG icons + glyphs">
        <Stack gap={space.md}>
          <Row gap={space.sm} wrap>
            {Object.entries(ICONS).map(([name, Icon]) => (
              <IconPlate key={name} icon={Icon} bg={color.panelLight} ink={color.white} size={34} />
            ))}
          </Row>
          <PixelText variant="bodySmall">
            Drawn on a 12x12 lattice, so they render identically on web, iOS and Android.
          </PixelText>
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

      <Section title="MOTION" note="buzzer · odometer · toasts">
        <Stack gap={space.md}>
          <Row gap={space.sm} wrap>
            <PixelButton
              tone="gold"
              label="FIRE BUZZER"
              size={9}
              onPress={() => {
                setCurtain(false);
                setTimeout(() => setCurtain(true), 40);
              }}
            />
            <PixelButton tone="primary" label="ROLL PNL" size={9} onPress={() => setOdo(Math.round((Math.random() * 24 - 12) * 100) / 100)} />
            <PixelButton tone="info" label="TOAST OK" size={9} onPress={() => toast.ok('LONG FILLED', '0.40 @ 100.0000')} />
            <PixelButton tone="danger" label="TOAST ERR" size={9} onPress={() => toast.error('NOT ENOUGH QUOTE', 'Reduce the size.')} />
          </Row>
          <Row gap={space.md} align="center">
            <PixelText variant="bodySmall">odometer:</PixelText>
            <PnLOdometer value={odo} size={20} signed />
          </Row>
          <Box height={140} bg={color.chartBg} outline={color.ink} align="center" justify="center">
            <PixelText variant="statBig">HIDDEN</PixelText>
            <RevealCurtain active={curtain} label="TAPE UNSEALED" sublabel="+$9.80" onDone={() => setCurtain(false)} />
          </Box>
        </Stack>
      </Section>

      <Section title="PROOFPANEL" note="live evidence readout">
        <ProofPanel
          title="CLUSTER"
          status={{ label: 'NO TEE', tone: 'soon' }}
          rows={[
            { label: 'name', value: 'LOCAL' },
            { label: 'privacy enforced', value: 'NO — needs a TEE', tone: 'bad' },
            { label: 'rollup latency', value: '1.6ms', tone: 'good' },
          ]}
        />
      </Section>

      <Section title="TOKENLOGO" note="drawn marks · remote image · fallback tile">
        <Stack gap={space.sm}>
          <Row gap={space.md} align="center">
            <TokenLogo mint="So11111111111111111111111111111111111111112" symbol="SOL" size={40} />
            <TokenLogo mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" symbol="USDC" size={40} />
            {/* A mint with no logo: the tile is keyed off the address, so a
                given coin always gets the same colour. */}
            <TokenLogo mint="ujpDypnBtY8hEFvPSJyo7uP6Ds8a18qPJxhZVQRpump" symbol="NTDA" size={40} />
            <TokenLogo mint="ARtjW78Jy285Np4f2K1fM2zNCskezrnK1YJehjbFpump" symbol="WOFI" size={40} />
            <TokenLogo mint="9cRCn9rGrRKn5Vc8kQpnvcRmXQZm7dHFLzsKgC5WfwUT" symbol="ANSEM" size={40} />
          </Row>
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            SOL and USDC are drawn — neither feed carries a logo for them.
            Everything else loads a real image and falls back to a tile.
          </PixelText>
        </Stack>
      </Section>

      <Section title="MARKETROW / SOURCEBADGE" note="one live market">
        <Stack gap={space.sm}>
          <MarketRow
            mint="ujpDypnBtY8hEFvPSJyo7uP6Ds8a18qPJxhZVQRpump"
            symbol="NTDA"
            name="National Trump Digital Accounts"
            price="$1.00"
            cap="$1.00B"
            source="pump.fun"
            selected
          />
          <MarketRow
            mint="So11111111111111111111111111111111111111112"
            symbol="SOL"
            name="Solana"
            price="$106.12"
            source="jupiter"
          />
        </Stack>
      </Section>

      <Section title="MARKETTABS" note="segmented control, not the tab bar">
        <MarketTabs
          tabs={[
            { key: 'meme', label: 'MEMES' },
            { key: 'major', label: 'MAJORS' },
          ]}
          active={galleryKind}
          onChange={setGalleryKind}
        />
      </Section>

      <Section title="MARKETPICKER" note="loading · empty · failed · listed">
        <Stack gap={space.md}>
          <MarketPicker
            kind={galleryKind}
            onKindChange={setGalleryKind}
            markets={GALLERY_MARKETS}
            selectedMint={GALLERY_MARKETS[0].mint}
            onSelect={() => {}}
            maxHeight={160}
          />
          <MarketPicker kind="meme" onKindChange={() => {}} markets={[]} onSelect={() => {}} loading />
          <MarketPicker kind="meme" onKindChange={() => {}} markets={[]} onSelect={() => {}} />
          <MarketPicker
            kind="meme"
            onKindChange={() => {}}
            markets={[]}
            onSelect={() => {}}
            error="pump.fun returned HTTP 503"
            onRetry={() => {}}
          />
        </Stack>
      </Section>

      <Section title="MARKETHEADER" note="what the live round is fought over">
        <Stack gap={space.sm}>
          <MarketHeader
            mint="ujpDypnBtY8hEFvPSJyo7uP6Ds8a18qPJxhZVQRpump"
            symbol="NTDA"
            name="National Trump Digital Accounts"
            price="0.009450◎"
            changePct={4.21}
            source="pump.fun"
          />
          <MarketHeader
            mint="So11111111111111111111111111111111111111112"
            symbol="SOL"
            name="Solana"
            price="1.0000◎"
            source="jupiter"
          />
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
