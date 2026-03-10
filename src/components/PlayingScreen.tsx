import { useState } from 'react';
import type { Settlement } from '../types';
import GameMap from './GameMap';
import { calculateAttemptScore } from '../utils/geo';

interface PlayingScreenProps {
  availableSettlements: Settlement[];
  settlement: Settlement;
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  mode: string;
  onSubmitGuess: (wrongGuessIds: string[]) => void;
  onEndGame: () => void;
}

export default function PlayingScreen({
  availableSettlements,
  settlement,
  currentRound,
  totalRounds,
  totalScore,
  mode,
  onSubmitGuess,
  onEndGame,
}: PlayingScreenProps) {
  const [wrongGuessIds, setWrongGuessIds] = useState<string[]>([]);

  const currentPoints = calculateAttemptScore(wrongGuessIds.length);

  const handleSettlementClick = (selectedSettlementId: string) => {
    if (selectedSettlementId === settlement.id) {
      onSubmitGuess(wrongGuessIds);
      setWrongGuessIds([]);
      return;
    }

    setWrongGuessIds((previous) => {
      if (previous.includes(selectedSettlementId)) {
        return previous;
      }

      return [...previous, selectedSettlementId];
    });
  };

  const missesLabel =
    wrongGuessIds.length === 0
      ? 'עדיין בלי פספוסים'
      : `${wrongGuessIds.length} פספוסים בסיבוב הזה`;

  const pointsLabel =
    currentPoints > 0
      ? `${currentPoints} נקודות אם תפגע עכשיו`
      : 'עדיין אפשר לפגוע, אבל הניקוד ירד ל-0';

  const wrongGuessNames = wrongGuessIds
    .map(
      (settlementId) =>
        availableSettlements.find((item) => item.id === settlementId)?.name_he
    )
    .filter((value): value is string => Boolean(value));

  const roundLabel =
    mode === 'endless'
      ? `סיבוב ${currentRound}`
      : `סיבוב ${currentRound} מתוך ${totalRounds}`;

  return (
    <div className="playing-screen">
      {/* Top bar */}
      <div className="game-top-bar">
        <div className="top-bar-info">
          <span className="round-label">{roundLabel}</span>
          <span className="score-label">ניקוד: {totalScore}</span>
        </div>
        {mode === 'endless' && (
          <button className="end-game-btn" onClick={onEndGame}>
            סיים משחק
          </button>
        )}
      </div>

      {/* Settlement prompt */}
      <div className="settlement-prompt">
        <div className="prompt-label">איפה נמצא/ת:</div>
        <div className="settlement-name">{settlement.name_he}</div>
        <div className="settlement-name-en">{settlement.name_en}</div>
      </div>

      {/* Map */}
      <div className="map-container">
        <GameMap
          settlements={availableSettlements}
          wrongGuessIds={wrongGuessIds}
          onSettlementSelect={handleSettlementClick}
          interactive={true}
        />
      </div>

      {/* Round status */}
      <div className="confirm-area">
        <div className="attempt-status">
          <div className="attempt-score">{pointsLabel}</div>
          <div className="attempt-misses">{missesLabel}</div>
        </div>
        {wrongGuessNames.length > 0 && (
          <div className="wrong-guesses-list">
            ניסיונות קודמים: {wrongGuessNames.join(' • ')}
          </div>
        )}
        <p className="click-hint">לחץ על צורת היישוב הנכון במפה</p>
      </div>
    </div>
  );
}
