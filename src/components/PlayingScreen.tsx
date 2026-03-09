import { useState } from 'react';
import type { Settlement } from '../types';
import GameMap from './GameMap';

interface PlayingScreenProps {
  settlement: Settlement;
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  mode: string;
  onSubmitGuess: (lat: number, lng: number) => void;
  onEndGame: () => void;
}

export default function PlayingScreen({
  settlement,
  currentRound,
  totalRounds,
  totalScore,
  mode,
  onSubmitGuess,
  onEndGame,
}: PlayingScreenProps) {
  const [guess, setGuess] = useState<[number, number] | null>(null);

  const handleMapClick = (lat: number, lng: number) => {
    setGuess([lat, lng]);
  };

  const handleConfirm = () => {
    if (guess) {
      onSubmitGuess(guess[0], guess[1]);
      setGuess(null);
    }
  };

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
          onMapClick={handleMapClick}
          guessPosition={guess}
          correctPosition={null}
          interactive={true}
        />
      </div>

      {/* Confirm button */}
      <div className="confirm-area">
        {guess ? (
          <button className="confirm-btn" onClick={handleConfirm}>
            ✓ אישור ניחוש
          </button>
        ) : (
          <p className="click-hint">👆 לחץ על המפה כדי לנחש</p>
        )}
      </div>
    </div>
  );
}
