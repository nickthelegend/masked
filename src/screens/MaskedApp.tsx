/**
 * MASKED — the running app. Composes the screens inside the pocket shell and
 * owns nothing but navigation; the duel itself lives in `useDuel`.
 */
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, View } from 'react-native';
import { BeachBackdrop, MatchFound, PocketShell, TabBar, Ticker, color, solExact, useToast } from '../ui';
import AppHeader from './AppHeader';
import FeedScreen from './FeedScreen';
import LeaderboardScreen from './LeaderboardScreen';
import DuelLobbyScreen from './DuelLobbyScreen';
import MatchmakingScreen from './MatchmakingScreen';
import LiveRoundScreen from './LiveRoundScreen';
import RevealScreen from './RevealScreen';
import ModesScreen from './ModesScreen';
import QuestsScreen from './QuestsScreen';
import { useTickerItems } from '../chain/useTickerItems';
import { usePlayerStats } from '../chain/usePlayerStats';
import { searchMarkets } from '../chain/markets';
import { useRouter } from 'expo-router';
import { formatSolPrice } from '../chain/units';
import { useDuel } from './useDuel';
import { RAKE, TROPHIES_PER_WIN } from './data';

const SCREEN_HEIGHT = 700;

export default function MaskedApp() {
  const [tab, setTab] = useState('duel');
  const duel = useDuel();
  const toast = useToast();
  const tickerItems = useTickerItems();
  /**
   * The trophy counter, straight off the player's on-chain account.
   *
   * `wins` is what `settle_match` increments, so the HUD counts the same thing
   * the leaderboard does. A wallet with no settled duels has no account yet and
   * shows zero, which is the truth rather than a placeholder.
   */
  const { board } = usePlayerStats();
  const trophies =
    board.find((r) => r.owner.toBase58() === duel.myAddress)?.wins ?? 0;

  /**
   * The lock-in card, once per duel.
   *
   * Keyed on the match address rather than on the phase, so it fires when a
   * *new* duel goes live and not again on a re-render, a reconnect, or a
   * reload part-way through a round already in progress.
   */
  const [greeted, setGreeted] = useState<string | null>(null);
  const lastLive = useRef<string | null>(null);
  useEffect(() => {
    if (duel.phase !== 'live' || !duel.matchAddress) return;
    if (lastLive.current === duel.matchAddress) return;
    lastLive.current = duel.matchAddress;
    // Only for a round that is genuinely just starting. Reopening the tab on a
    // duel with two minutes left should drop straight into the round.
    if (duel.duration - duel.secondsLeft <= 20) setGreeted(duel.matchAddress);
  }, [duel.phase, duel.matchAddress, duel.duration, duel.secondsLeft]);

  const router = useRouter();

  /**
   * Open a duel on the token a settled tape was fought over.
   *
   * The tape stores a mint and a ticker, not a priceable market, so the mint
   * is resolved through the same search the picker uses before the lobby is
   * handed it. If the token can no longer be priced the lobby simply opens on
   * whatever was already selected — better than carrying a market forward that
   * `create_match` would reject.
   */
  const duelToken = (mint: string) => {
    setTab('duel');
    void (async () => {
      try {
        const [found] = await searchMarkets(mint);
        if (found && found.mint === mint) duel.selectMarket(found);
      } catch {
        /* the picker is still there; the player can choose by hand */
      }
    })();
  };

  const toMatchmaking = () => {
    setTab('duel');
    duel.findMatch();
  };

  const postToFeed = () => {
    setTab('feed');
    duel.backToLobby();
  };

  /**
   * A link anyone can open to read this duel — no wallet, no account.
   *
   * It points at /tape rather than /spectate. This button lives on the reveal,
   * where the round is already over: there is nothing left to watch, and the
   * thing that has just become public — every fill of both players — is what
   * /tape shows. The Tape account never changes after settlement, so the link
   * says the same thing tomorrow as it does now.
   *
   * The clipboard can be refused (permissions, an insecure origin), so the
   * label reports what actually happened rather than always claiming success.
   */
  const [shareLabel, setShareLabel] = useState('COPY TAPE LINK');
  const shareWatchLink = () => {
    const address = duel.matchAddress;
    if (!address) return;
    const url = `${globalThis.location?.origin ?? ''}/tape/${address}`;
    const done = (ok: boolean) => {
      setShareLabel(ok ? 'LINK COPIED' : 'COPY BLOCKED');
      // A refused clipboard must not be a dead end: show the link so it can
      // still be read off the screen. Browsers block writeText on insecure
      // origins and without a user-gesture grant, so this is a normal path.
      if (!ok) toast.info('Copy this link', url);
      setTimeout(() => setShareLabel('COPY TAPE LINK'), 2500);
    };
    try {
      const clip = globalThis.navigator?.clipboard;
      if (!clip?.writeText) return done(false);
      void clip.writeText(url).then(() => done(true), () => done(false));
    } catch {
      done(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.sunset[0] }}>
      <StatusBar barStyle="light-content" />
      <BeachBackdrop />

      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <PocketShell screenHeight={SCREEN_HEIGHT}>
          <AppHeader balance={duel.balance} trophies={trophies} onHome={() => setTab('feed')} />
          <Ticker items={tickerItems} />

          {greeted && duel.phase === 'live' && greeted === duel.matchAddress ? (
            <MatchFound
              me={duel.myAddress ? `${duel.myAddress.slice(0, 6)}…` : 'YOU'}
              meSeed={duel.myAddress}
              them={duel.opponentName}
              themSeed={duel.opponentAddress}
              myToken={
                duel.marketMint
                  ? { mint: duel.marketMint, symbol: duel.market, uri: duel.marketImageUri }
                  : null
              }
              theirToken={
                duel.opponentMarketMint
                  ? { mint: duel.opponentMarketMint, symbol: duel.opponentMarket, uri: null }
                  : null
              }
              duration={duel.duration}
              onDone={() => setGreeted(null)}
            />
          ) : null}

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {tab === 'feed' ? (
              <FeedScreen
                onChallenge={(mint) => duelToken(mint)}
                onReadTape={(match) => router.push(`/tape/${match}`)}
              />
            ) : null}
            {tab === 'board' ? <LeaderboardScreen /> : null}
            {tab === 'modes' ? <ModesScreen wins={trophies} /> : null}
            {tab === 'quests' ? <QuestsScreen /> : null}

            {tab === 'duel' && duel.phase === 'lobby' ? (
              <DuelLobbyScreen
                stake={duel.stake}
                onStakeChange={duel.setStake}
                pot={duel.pot}
                onFind={toMatchmaking}
                selected={duel.selectedMarket}
                onSelectMarket={duel.selectMarket}
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'searching' ? (
              <MatchmakingScreen
                pot={duel.pot}
                stake={duel.stake}
                busy={duel.busy}
                myAddress={duel.myAddress}
                marketSymbol={duel.selectedMarket?.symbol}
                marketMint={duel.selectedMarket?.mint}
                marketImageUri={duel.selectedMarket?.imageUri}
                onStart={duel.startMatch}
                onJoin={duel.joinMatch}
                onCancel={duel.cancelMatch}
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'live' ? (
              <LiveRoundScreen
                secondsLeft={duel.secondsLeft}
                pot={duel.pot}
                equity={duel.equity}
                price={duel.price}
                myPnl={duel.myPnl}
                positionLabel={duel.positionLabel}
                opponentName={duel.opponentName}
                opponentFills={duel.opponentFills}
                fills={duel.fills}
                fillSize={duel.fillSize}
                onFillSize={duel.setFillSize}
                sizeNote={duel.sizeNote}
                sessionActive={duel.sessionActive}
                onLong={duel.openLong}
                onShort={duel.openShort}
                onClose={duel.closeLong}
                liquidated={duel.liquidated}
                onSkip={duel.settleNow}
                busy={duel.busy}
                error={duel.error}
                sealed={duel.sealed}
                market={duel.market}
                marketMint={duel.marketMint}
                marketImageUri={duel.marketImageUri}
                marketSource={duel.marketSource}
                priceLabel={duel.priceLabel}
                settleStages={duel.settleStages}
                lastFill={
                  duel.lastFill
                    ? {
                        side: duel.lastFill.side,
                        price: `${formatSolPrice(duel.lastFill.px)}◎`,
                        mark: `${formatSolPrice(duel.lastFill.markBefore)}◎`,
                        impactPct: duel.lastFill.impactPct,
                        at: duel.lastFill.at,
                      }
                    : null
                }
                teeEnforced={duel.teeEnforced}
                myName={duel.myAddress ? `${duel.myAddress.slice(0, 6)}…` : 'YOU'}
                myAddress={duel.myAddress}
                opponentAddress={duel.opponentAddress}
                mySide={duel.mySide}
                opponentMarket={duel.opponentMarket}
                opponentMarketMint={duel.opponentMarketMint}
                payout={solExact(duel.pot * (1 - RAKE))}
                trophies={TROPHIES_PER_WIN}
                elapsed={Math.max(0, duel.duration - duel.secondsLeft)}
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'reveal' ? (
              <RevealScreen
                won={duel.won}
                pot={duel.pot}
                stake={duel.entrySol}
                tape={duel.tape}
                isPlayerA={duel.isPlayerA}
                myName={duel.myAddress ? `${duel.myAddress.slice(0, 6)}…` : 'YOU'}
                myAddress={duel.myAddress}
                opponentAddress={duel.opponentAddress}
                entryLamports={duel.entryLamports}
                startTs={duel.startTs}
                duration={duel.duration}
                myPnl={duel.myPnl}
                opponentPnl={duel.opponentPnl}
                myFills={duel.fills.length}
                opponentFills={duel.opponentFills}
                opponentName={duel.opponentName}
                record={duel.record}
                onRematch={duel.rematch}
                onShare={shareWatchLink}
                shareLabel={shareLabel}
                onPost={postToFeed}
              />
            ) : null}
          </ScrollView>

          <TabBar active={tab} onChange={setTab} />
        </PocketShell>
      </SafeAreaView>
    </View>
  );
}
