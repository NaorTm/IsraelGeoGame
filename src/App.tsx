import { useGame } from './hooks/useGame';
import MenuScreen from './components/MenuScreen';
import PlayingScreen from './components/PlayingScreen';
import FeedbackScreen from './components/FeedbackScreen';
import SummaryScreen from './components/SummaryScreen';
import './App.css';

export default function App() {
  const game = useGame();

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
          onSubmitGuess={game.submitGuess}
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
          onNextRound={game.nextRound}
          onEndGame={game.endGame}
        />
      )}

      {game.phase === 'summary' && (
        <SummaryScreen
          results={game.roundResults}
          totalScore={game.totalScore}
          onRestart={game.resetGame}
        />
      )}
    </div>
  );
}
