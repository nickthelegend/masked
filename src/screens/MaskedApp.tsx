/**
 * MASKED — the running app. Composes the screens inside the pocket shell and
 * owns nothing but navigation; the duel itself lives in `useDuel`.
 */
import { useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, View } from 'react-native';
import { BeachBackdrop, PocketShell, TabBar, Ticker, color, useToast } from '../ui';
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
import { formatSolPrice } from '../chain/units';
import { useDuel } from './useDuel';

const SCREEN_HEIGHT = 700;

export default function MaskedApp() {
  const [tab, setTab] = useState('duel');
  const duel = useDuel();
  const toast = useToast();
  const tickerItems = useTickerItems();

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
          <AppHeader balance={duel.balance} onHome={() => setTab('feed')} />
          <Ticker items={tickerItems} />

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {tab === 'feed' ? <FeedScreen onChallenge={toMatchmaking} /> : null}
            {tab === 'board' ? <LeaderboardScreen /> : null}
            {tab === 'modes' ? <ModesScreen /> : null}
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
                series={duel.series}
                price={duel.price}
                myPnl={duel.myPnl}
                positionLabel={duel.positionLabel}
                opponentName={duel.opponentName}
                opponentFills={duel.opponentFills}
                fills={duel.fills}
                fillSize={duel.fillSize}
                onFillSize={duel.setFillSize}
                sizeNote={duel.sizeNote}
                onLong={duel.openLong}
                onClose={duel.closeLong}
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
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'reveal' ? (
              <RevealScreen
                won={duel.won}
                pot={duel.pot}
                stake={duel.entrySol}
                tape={duel.tape}
                isPlayerA={duel.isPlayerA}
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
