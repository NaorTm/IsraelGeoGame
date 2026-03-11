import { useState } from 'react';
import { useGame } from './hooks/useGame';
import MenuScreen from './components/MenuScreen';
import PlayingScreen from './components/PlayingScreen';
import FeedbackScreen from './components/FeedbackScreen';
import SummaryScreen from './components/SummaryScreen';
import type { MapViewport } from './types';
import './App.css';

const DEFAULT_MAP_VIEWPORT: MapViewport = {
  center: [31.5, 35.0],
  zoom: 7,
};

export default function App() {
  const game = useGame();
  const [mapViewport, setMapViewport] = useState<MapViewport>(DEFAULT_MAP_VIEWPORT);
  const completedSettlementIds = game.roundResults
    .filter((result) => !result.timedOut)
    .map((result) => result.settlement.id);

  return (
    <div className="app" dir="rtl">
      {game.phase === 'menu' && (
        <MenuScreen
          config={game.config}
          onUpdateConfig={game.updateConfig}
          onStartGame={game.startGame}
        />
      )}

      {game.phase === 'playing' && game.currentSettlement && (
        <PlayingScreen
          availableSettlements={game.filteredSettlements}
          settlement={game.currentSettlement}
          currentRound={game.currentRound}
          totalRounds={game.totalRounds}
          totalScore={game.totalScore}
          mode={game.config.mode}
          mapStyle={game.config.mapStyle}
          onMapStyleChange={(mapStyle) => game.updateConfig({ mapStyle })}
          mapViewport={mapViewport}
          onMapViewportChange={setMapViewport}
          completedSettlementIds={completedSettlementIds}
          currentStreak={game.currentStreak}
          survivalLivesRemaining={game.survivalLivesRemaining}
          currentDistrictName={game.currentDistrictName}
          timeLimitSeconds={game.config.timeLimitSeconds}
          onSubmitGuess={game.submitGuess}
          onRegisterWrongGuess={game.registerWrongGuess}
          onEndGame={game.endGame}
        />
      )}

      {game.phase === 'feedback' && game.roundResults.length > 0 && (
        <FeedbackScreen
          availableSettlements={game.filteredSettlements}
          result={game.roundResults[game.roundResults.length - 1]}
          currentRound={game.currentRound}
          totalRounds={game.totalRounds}
          totalScore={game.totalScore}
          mode={game.config.mode}
          mapStyle={game.config.mapStyle}
          onMapStyleChange={(mapStyle) => game.updateConfig({ mapStyle })}
          mapViewport={mapViewport}
          onMapViewportChange={setMapViewport}
          completedSettlementIds={completedSettlementIds}
          currentStreak={game.currentStreak}
          currentDistrictName={game.currentDistrictName}
          isLastRound={game.isLastRound}
          onNextRound={game.nextRound}
          onEndGame={game.endGame}
        />
      )}

      {game.phase === 'summary' && (
        <SummaryScreen
          results={game.roundResults}
          totalScore={game.totalScore}
          bestStreak={game.bestStreak}
          mode={game.config.mode}
          onRestart={() => {
            setMapViewport(DEFAULT_MAP_VIEWPORT);
            game.resetGame();
          }}
        />
      )}
    </div>
  );
}
