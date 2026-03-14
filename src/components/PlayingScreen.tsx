import { useEffect, useState } from 'react';
import type { GameMode, MapStyleId, MapViewport, Settlement } from '../types';
import GameMap from './GameMap';
import { calculateAttemptScore } from '../utils/geo';

interface PlayingScreenProps {
  availableSettlements: Settlement[];
  settlement: Settlement;
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  mode: GameMode;
  mapStyle: MapStyleId;
  onMapStyleChange: (mapStyle: MapStyleId) => void;
  mapViewport: MapViewport;
  onMapViewportChange: (mapViewport: MapViewport) => void;
  completedSettlementIds: string[];
  currentStreak: number;
  survivalLivesRemaining: number;
  currentDistrictName: string | null;
  timeLimitSeconds: number;
  onSubmitGuess: (input: {
    wrongGuessIds: string[];
    timeRemainingSeconds?: number;
    timedOut?: boolean;
  }) => void;
  onRegisterWrongGuess: () => void;
  onEndGame: () => void;
}

export default function PlayingScreen({
  availableSettlements,
  settlement,
  currentRound,
  totalRounds,
  totalScore,
  mode,
  mapStyle,
  onMapStyleChange,
  mapViewport,
  onMapViewportChange,
  completedSettlementIds,
  currentStreak,
  survivalLivesRemaining,
  currentDistrictName,
  timeLimitSeconds,
  onSubmitGuess,
  onRegisterWrongGuess,
  onEndGame,
}: PlayingScreenProps) {
  const [wrongGuessIds, setWrongGuessIds] = useState<string[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(timeLimitSeconds);
  const [roundResolved, setRoundResolved] = useState(false);

  const currentPoints = calculateAttemptScore(wrongGuessIds.length);

  useEffect(() => {
    if (mode !== 'time_attack' || roundResolved) {
      return;
    }

    if (timeRemaining <= 0) {
      onSubmitGuess({
        wrongGuessIds,
        timeRemainingSeconds: 0,
        timedOut: true,
      });
      return;
    }

    const timerId = window.setTimeout(() => {
      setTimeRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [mode, onSubmitGuess, roundResolved, timeRemaining, wrongGuessIds]);

  const handleSettlementClick = (selectedSettlementId: string) => {
    if (roundResolved) {
      return;
    }

    if (selectedSettlementId === settlement.id) {
      setRoundResolved(true);
      onSubmitGuess({
        wrongGuessIds,
        timeRemainingSeconds: mode === 'time_attack' ? timeRemaining : undefined,
      });
      return;
    }

    if (wrongGuessIds.includes(selectedSettlementId)) {
      return;
    }

    const nextWrongGuessIds = [...wrongGuessIds, selectedSettlementId];

    onRegisterWrongGuess();

    if (nextWrongGuessIds.length >= 3) {
      setWrongGuessIds(nextWrongGuessIds);
      setRoundResolved(true);
      onSubmitGuess({
        wrongGuessIds: nextWrongGuessIds,
        timeRemainingSeconds: mode === 'time_attack' ? timeRemaining : undefined,
      });
      return;
    }

    setWrongGuessIds(nextWrongGuessIds);
  };

  const missesLabel =
    wrongGuessIds.length === 0
      ? 'עדיין בלי פספוסים'
      : `${wrongGuessIds.length} פספוסים בסיבוב הזה`;

  const pointsLabel =
    mode === 'time_attack'
      ? currentPoints > 0
        ? `${currentPoints} נק' בסיס ועוד בונוס מהירות`
        : 'נגמר ניקוד הבסיס, אבל עדיין יש זמן לסיים'
      : currentPoints > 0
        ? `${currentPoints} נקודות אם תפגע עכשיו`
        : 'עדיין אפשר לפגוע, אבל הניקוד ירד ל-0';

  const wrongGuessNames = wrongGuessIds
    .map(
      (settlementId) =>
        availableSettlements.find((item) => item.id === settlementId)?.name_he
    )
    .filter((value): value is string => Boolean(value));

  const roundLabel =
    mode === 'endless' || mode === 'survival'
      ? `סיבוב ${currentRound}`
      : `סיבוב ${currentRound} מתוך ${totalRounds}`;

  return (
    <div className="playing-screen">
      <div className="map-container playing-map-container">
        <GameMap
          settlements={availableSettlements}
          mapStyle={mapStyle}
          onMapStyleChange={onMapStyleChange}
          mapViewport={mapViewport}
          onMapViewportChange={onMapViewportChange}
          correctSettlementIds={completedSettlementIds}
          wrongGuessIds={wrongGuessIds}
          onSettlementSelect={handleSettlementClick}
          interactive={true}
        />

        <div className="playing-overlay">
          <div className="playing-top-hud">
            <div className="hud-pills">
              <span className="hud-pill">{roundLabel}</span>
              <span className="hud-pill score">ניקוד: {totalScore}</span>
              {currentStreak > 1 && (
                <span className="hud-pill streak">רצף: {currentStreak}</span>
              )}
              {mode === 'survival' && (
                <span className="hud-pill survival">חיים: {survivalLivesRemaining}</span>
              )}
              {mode === 'time_attack' && (
                <span className={`hud-pill timer ${timeRemaining <= 5 ? 'urgent' : ''}`}>
                  זמן: {timeRemaining}
                </span>
              )}
            </div>
            <button className="end-game-btn ghost" onClick={onEndGame}>
              סיים משחק
            </button>
          </div>

          <div className="settlement-prompt floating">
            <div className="prompt-label">איפה נמצא/ת:</div>
            <div className="settlement-name">{settlement.name_he}</div>
            <div className="settlement-name-en">{settlement.name_en}</div>
            {currentDistrictName && mode === 'mastery' && (
              <div className="mode-context">מחוז פעיל: {currentDistrictName}</div>
            )}
          </div>

          <div className="confirm-area floating">
            <div className="attempt-status">
              <div className="attempt-score">{pointsLabel}</div>
              <div className="attempt-misses">{missesLabel}</div>
            </div>
            {wrongGuessNames.length > 0 && (
              <div className="wrong-guesses-list">
                ניסיונות קודמים: {wrongGuessNames.join(' • ')}
              </div>
            )}
            <p className="click-hint">
              {mode === 'time_attack'
                ? 'פגע מהר במפה. אחרי 3 פספוסים התשובה נחשפת.'
                : 'בחר את היישוב במפה. אחרי 3 פספוסים התשובה נחשפת.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
