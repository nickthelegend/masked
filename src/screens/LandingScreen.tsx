/**
 * The marketing page at `/`.
 *
 * Built entirely from the component library — the hero is a real, clickable
 * PocketShell running the actual duel lobby, so the page demonstrates the
 * product instead of illustrating it. Every CTA funnels to /play.
 */
import { useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Badge,
  BeachBackdrop,
  ConnectWalletButton,
  Box,
  Divider,
  IconPlate,
  MatchCard,
  ModeTile,
  PixelButton,
  PixelPanel,
  PixelText,
  PocketShell,
  Row,
  Stack,
  StatTile,
  TabBar,
  Ticker,
  Wordmark,
  color,
  solExact,
  space,
} from '../ui';
import AppHeader from './AppHeader';
import DuelLobbyScreen from './DuelLobbyScreen';
import { HOW_IT_WORKS, LANDING_STAT_LABELS, MODES, RAKE, roundPhrase } from './data';
import { useTickerItems } from '../chain/useTickerItems';
import { marketLabel } from '../chain/market';
import { bpsPct, short, useTapes } from '../chain/useTapes';
import { useWallet } from '@solana/wallet-adapter-react';
import { useChainStats } from '../chain/useChainStats';
import { useBalance } from '../chain/useBalance';
import { usePlayerStats } from '../chain/usePlayerStats';
import type { TradableMarket } from '../chain/markets';

/** Above this width the hero splits into copy + device columns. */
const WIDE = 900;
const MAX_CONTENT = 1120;
const HERO_SHELL_HEIGHT = 700;
const MODE_PREVIEW = 6;
const MODE_MIN_WIDTH = 250;
const REVEAL_MIN_WIDTH = 320;
const REVEAL_PREVIEW = 2;

export default function LandingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [stake, setStake] = useState(0.1); // SOL
  // The hero is a live preview: it lists the same real markets the app does,
  // so what a visitor sees on the landing page is what they get at /play.
  const [previewMarket, setPreviewMarket] = useState<TradableMarket | null>(null);
  const stats = useChainStats();
  const tickerItems = useTickerItems();
  const balance = useBalance();
  const { publicKey } = useWallet();
  const { board } = usePlayerStats();
  const trophies = board.find((r) => r.owner.toBase58() === publicKey?.toBase58())?.wins ?? 0;
  const { tapes, loaded: tapesLoaded } = useTapes();

  // "HOW IT WORKS" scrolls to the explainer rather than dumping you into a
  // duel — the label has to mean what it says.
  //
  // The offset is measured when the button is pressed, not cached from
  // onLayout: onLayout fires before the hero's device and backdrop have
  // settled, so the cached value was stale (and often 0, which scrolled
  // nowhere at all).
  const scrollRef = useRef<ScrollView>(null);
  const howRef = useRef<View>(null);
  const scrollY = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  const goPlay = () => router.push('/play');
  const goHow = () => {
    const scroll = scrollRef.current;
    const node = howRef.current;
    if (!scroll || !node) return;
    // measureInWindow is viewport-relative, so add where we already are.
    node.measureInWindow((_x, y) => {
      scroll.scrollTo({ y: Math.max(0, scrollY.current + y - 12), animated: true });
    });
  };

  const heroCopy = (
    // The sunset is a ground for the device, not for type — `text` on the
    // orange bands is well under 4.5:1. The copy gets a panel to sit on.
    <PixelPanel pad={space.xl} flex={wide ? 1 : undefined} style={{ maxWidth: 560 }}>
    <Stack gap={space.lg}>
      <Badge label="LIVE ON SOLANA" tone="live" variant="label" />

      <Stack gap={space.xs}>
        <PixelText variant="statBig" size={wide ? 26 : 20} color={color.white}>
          TRADE BLIND.
        </PixelText>
        <PixelText variant="statBig" size={wide ? 26 : 20} color={color.yellow}>
          TAKE THE POT.
        </PixelText>
      </Stack>

      <PixelText variant="body">
        1v1 fog duels. Two traders stake a pot and each pick their own token — any coin, any pool — then trade
        it for {roundPhrase()} with every position hidden. At the buzzer the tape reveals — best PnL takes the pot.
      </PixelText>

      <Row gap={space.sm} wrap>
        <PixelButton tone="primary" label="PLAY FREE" size={12} padY={16} onPress={goPlay} />
        <PixelButton tone="quiet" bg={color.panelLight} label="HOW IT WORKS" size={10} padY={16} onPress={goHow} />
      </Row>

      <Divider color={color.panelLight} />

      <Row gap={space.xl} wrap>
        {/* Read from chain, not invented. */}
        {(() => {
          // "—" means we could not read the chain. A number always means a
          // number we actually read.
          const known = stats.loaded && stats.reachable;
          return (
            <>
              <StatTile value={known ? String(stats.openMatches) : '—'} label={LANDING_STAT_LABELS[0]} align="left" />
              <StatTile value={known ? `${stats.paidOutSol.toFixed(2)}◎` : '—'} label={LANDING_STAT_LABELS[1]} align="left" />
              <StatTile value={known ? String(stats.settled) : '—'} label={LANDING_STAT_LABELS[2]} align="left" />
            </>
          );
        })()}
      </Row>
    </Stack>
    </PixelPanel>
  );

  const heroDevice = (
    <View style={{ width: '100%', maxWidth: 440 }}>
      <PocketShell screenHeight={HERO_SHELL_HEIGHT}>
        {/* A preview of the app, but the header inside it is the real one and
            shows the real wallet, so its counters have to be real too. It
            printed a flat 0.00 next to a connected wallet holding several
            SOL — a hardcoded 50 before that. */}
        <AppHeader balance={balance} trophies={trophies} onHome={goPlay} />
        <Ticker items={tickerItems} />
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <DuelLobbyScreen
            stake={stake}
            onStakeChange={setStake}
            pot={stake * 2 * (1 - RAKE)}
            onFind={goPlay}
            selected={previewMarket}
            onSelectMarket={setPreviewMarket}
          />
        </ScrollView>
        <TabBar active="duel" onChange={goPlay} />
      </PocketShell>
    </View>
  );

  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={{ flex: 1, backgroundColor: color.bg }}
      showsVerticalScrollIndicator={false}
    >
      {/* ---- hero, on the beach ---- */}
      <View>
        <BeachBackdrop />

        <Stack pad={space.xl} gap={space.xxl} style={{ width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' }}>
          <Row justify="space-between" gap={space.md}>
            <Wordmark size={wide ? 18 : 14} />
            <Row gap={space.sm}>
              <ConnectWalletButton size={9} padY={space.md} />
              <PixelButton tone="gold" label="PLAY" size={10} padY={space.md} onPress={goPlay} />
            </Row>
          </Row>

          {wide ? (
            <Row gap={space.xxl} align="center" justify="space-between">
              {heroCopy}
              {heroDevice}
            </Row>
          ) : (
            <Stack gap={space.xxl} align="center">
              {heroCopy}
              {heroDevice}
            </Stack>
          )}
        </Stack>
      </View>

      <Ticker items={tickerItems} />

      {/* ---- how it works ---- */}
      <Stack
        ref={howRef}
        pad={space.xl}
        gap={space.lg}
        style={{ width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' }}
      >
        <Stack gap={space.sm}>
          <PixelText variant="h2">HOW A FOG DUEL WORKS</PixelText>
          <Divider color={color.panelLight} />
        </Stack>

        <Row gap={space.md} wrap align="stretch">
          {HOW_IT_WORKS.map((step) => (
            <PixelPanel key={step.title} flex={1} pad={space.lg} style={{ minWidth: MODE_MIN_WIDTH }}>
              <Stack gap={space.md}>
                <IconPlate glyph={step.glyph} bg={step.plate} ink={step.ink} size={34} glyphSize={15} />
                <PixelText variant="label">{step.title}</PixelText>
                <PixelText variant="bodySmall">{step.body}</PixelText>
              </Stack>
            </PixelPanel>
          ))}
        </Row>
      </Stack>

      {/* ---- modes ---- */}
      <Stack pad={space.xl} gap={space.lg} style={{ width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' }}>
        <Stack gap={space.sm}>
          <Row justify="space-between" gap={space.md}>
            <PixelText variant="h2">GAME MODES</PixelText>
            <PixelText variant="bodySmall">{MODES.length} IN THE LAB</PixelText>
          </Row>
          <Divider color={color.panelLight} />
        </Stack>

        <Row gap={space.md} wrap align="stretch">
          {MODES.slice(0, MODE_PREVIEW).map((m) => (
            // Flex + minWidth rather than a fixed tile width, so the grid
            // reflows 3-up / 2-up / 1-up and always fills the row.
            <Box key={m.name} flex={1} style={{ minWidth: MODE_MIN_WIDTH }}>
              <ModeTile name={m.name} description={m.description} status={m.status} width="100%" onPress={goPlay} />
            </Box>
          ))}
        </Row>
      </Stack>

      {/* ---- recent reveals ---- */}
      <Stack pad={space.xl} gap={space.lg} style={{ width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center' }}>
        <Stack gap={space.sm}>
          <PixelText variant="h2">LAST REVEALS</PixelText>
          <Divider color={color.panelLight} />
        </Stack>

        <Row gap={space.md} wrap align="stretch">
          {/* Real settled tapes, same source as the in-app feed. */}
          {tapes.slice(0, REVEAL_PREVIEW).map((t) => (
            <Box key={t.match} flex={1} style={{ minWidth: REVEAL_MIN_WIDTH }}>
              <MatchCard
                // The tape says what was traded. This was `marketLabel(DEMO_MINT)`,
                // a constant, so every duel on the landing page was labelled
                // $FOG whatever market it had actually been fought over — the
                // in-app feed had been reading the real symbol all along.
                token={t.symbol || marketLabel(t.mint)}
                pot={solExact((t.potPaid + t.rake) / 1e9)}
                ago={`${Math.max(0, Math.floor((Date.now() / 1000 - t.settledTs) / 60))}m ago`}
                winner={short(t.winner)}
                loser={short(t.loser)}
                winnerPnl={bpsPct(t.winnerPnlBps)}
                loserPnl={bpsPct(t.loserPnlBps)}
                winnerSeries={t.winnerSeries}
                loserSeries={t.loserSeries}
                onChallenge={goPlay}
                onCopy={goPlay}
                onFade={goPlay}
              />
            </Box>
          ))}
        </Row>

        {tapesLoaded && tapes.length === 0 ? (
          <PixelText variant="bodySmall" color={color.textFaint}>
            NO DUELS SETTLED YET — THE FIRST ONE LANDS HERE
          </PixelText>
        ) : null}
      </Stack>

      {/* ---- footer ---- */}
      <Stack bg={color.ink} pad={space.xl} gap={space.lg} align="center">
        <Wordmark size={16} />
        <PixelText variant="bodySmall" align="center" color={color.textFaint}>
          FOG DUEL 1V1 · PRIVATE ROLLUP · SETTLES ON SOLANA
        </PixelText>
        <PixelButton tone="gold" label="PLAY FREE" size={12} padY={16} onPress={goPlay} />
      </Stack>
    </ScrollView>
  );
}
