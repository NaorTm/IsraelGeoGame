import type { GameMode, RoundResult } from '../types';
import type { MapStyleId, MapViewport, Settlement } from '../types';
import { formatAttempts } from '../utils/geo';
import { regions } from '../data/regions';
import { getSettlementDistrictId } from '../utils/districts';
import GameMap from './GameMap';

interface FeedbackScreenProps {
  availableSettlements: Settlement[];
  result: RoundResult;
  totalScore: number;
  mode: GameMode;
  mapStyle: MapStyleId;
  onMapStyleChange: (mapStyle: MapStyleId) => void;
  mapViewport: MapViewport;
  onMapViewportChange: (mapViewport: MapViewport) => void;
  completedSettlementIds: string[];
  currentStreak: number;
  currentDistrictName: string | null;
  isLastRound: boolean;
  onNextRound: () => void;
  onEndGame: () => void;
}

function getScoreLabel(result: RoundResult): { text: string; emoji: string } {
  if (result.timedOut) return { text: 'הזמן נגמר', emoji: '⏱️' };
  if (result.baseScore === 3) return { text: 'מושלם!', emoji: '🎯' };
  if (result.baseScore === 2) return { text: 'כמעט מיד!', emoji: '🌟' };
  if (result.baseScore === 1) return { text: 'מצאת בסוף', emoji: '👏' };
  return { text: 'נכון, אבל בלי נקודות בסיס', emoji: '💪' };
}

export default function FeedbackScreen({
  availableSettlements,
  result,
  totalScore,
  mode,
  mapStyle,
  onMapStyleChange,
  mapViewport,
  onMapViewportChange,
  completedSettlementIds,
  currentStreak,
  currentDistrictName,
  isLastRound,
  onNextRound,
  onEndGame,
}: FeedbackScreenProps) {
  const scoreLabel = getScoreLabel(result);
  const regionName =
    regions.find((r) => r.id === getSettlementDistrictId(result.settlement))?.name_he || '';
  const districtName =
    mode === 'mastery' && currentDistrictName ? currentDistrictName : regionName;

  return (
    <div className="feedback-screen">
      <div className="feedback-card">
        <div className="feedback-header">
          <div className="feedback-result">
            <div className="feedback-emoji">{scoreLabel.emoji}</div>
            <div className="feedback-title-group">
              <div className="feedback-score-text">{scoreLabel.text}</div>
              <div className="feedback-settlement">
                <span className="feedback-settlement-he">{result.settlement.name_he}</span>
                <span className="feedback-settlement-en">({result.settlement.name_en})</span>
              </div>
            </div>
          </div>
          <div className="feedback-score-pills">
            <div className="feedback-pill feedback-pill-round">+{result.score} לסיבוב</div>
            <div className="feedback-pill feedback-pill-total">סה"כ {totalScore}</div>
          </div>
        </div>

        <div className="feedback-meta">
          <div className="feedback-chip">מחוז: {districtName}</div>
          <div className="feedback-chip feedback-chip-attempts">
            ניסיונות: {formatAttempts(result.attempts)}
          </div>
          <div className="feedback-chip">בסיס: +{result.baseScore}</div>
          {result.timeBonus > 0 && (
            <div className="feedback-chip feedback-chip-bonus">מהירות: +{result.timeBonus}</div>
          )}
          {result.streakBonus > 0 && (
            <div className="feedback-chip feedback-chip-bonus">רצף: +{result.streakBonus}</div>
          )}
          {currentStreak > 1 && !result.timedOut && (
            <div className="feedback-chip feedback-chip-streak">רצף נוכחי: {currentStreak}</div>
          )}
          {result.usedApproximateBoundary && (
            <div className="feedback-chip feedback-chip-note">ליישוב הזה מוצג אזור מקורב</div>
          )}
        </div>
      </div>

      <div className="map-container feedback-map">
        <GameMap
          settlements={availableSettlements}
          mapStyle={mapStyle}
          onMapStyleChange={onMapStyleChange}
          mapViewport={mapViewport}
          onMapViewportChange={onMapViewportChange}
          correctSettlementIds={completedSettlementIds}
          wrongGuessIds={result.wrongGuessIds}
          focusSettlementId={result.settlement.id}
          interactive={false}
        />
      </div>

      <div className="feedback-actions">
        {isLastRound ? (
          <button className="next-btn summary-btn" data-testid="solo-feedback-next" onClick={onNextRound}>
            📊 צפה בסיכום
          </button>
        ) : (
          <button className="next-btn" data-testid="solo-feedback-next" onClick={onNextRound}>
            ➡️ סיבוב הבא
          </button>
        )}
        {(mode === 'endless' || mode === 'survival') && (
          <button className="end-game-btn" onClick={onEndGame}>
            סיים משחק
          </button>
        )}
      </div>
    </div>
  );
}
