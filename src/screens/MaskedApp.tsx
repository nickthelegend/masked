/**
 * MASKED — the running app. Composes the screens inside the pocket shell and
 * owns nothing but navigation; the duel itself lives in `useDuel`.
 */
import { useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, View } from 'react-native';
import { BeachBackdrop, PocketShell, TabBar, Ticker, color } from '../ui';
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
import { useDuel } from './useDuel';

const SCREEN_HEIGHT = 700;

export default function MaskedApp() {
  const [tab, setTab] = useState('duel');
  const duel = useDuel();
  const tickerItems = useTickerItems();

  const toMatchmaking = () => {
    setTab('duel');
    duel.findMatch();
  };

  const postToFeed = () => {
    setTab('feed');
    duel.backToLobby();
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
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'searching' ? (
              <MatchmakingScreen
                pot={duel.pot}
                stake={duel.stake}
                busy={duel.busy}
                myAddress={duel.myAddress}
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
                onLong={duel.openLong}
                onClose={duel.closeLong}
                onSkip={duel.settleNow}
                busy={duel.busy}
                error={duel.error}
                sealed={duel.sealed}
                market={duel.market}
                teeEnforced={duel.teeEnforced}
              />
            ) : null}

            {tab === 'duel' && duel.phase === 'reveal' ? (
              <RevealScreen
                won={duel.won}
                pot={duel.pot}
                stake={duel.stake}
                equity={duel.equity}
                myPnl={duel.myPnl}
                opponentPnl={duel.opponentPnl}
                myFills={duel.fills.length}
                opponentFills={duel.opponentFills}
                opponentName={duel.opponentName}
                onRematch={duel.rematch}
                onFade={duel.rematch}
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
