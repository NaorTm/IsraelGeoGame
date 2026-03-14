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

  return (
    <div className="feedback-screen">
      {/* Score feedback */}
      <div className="feedback-card">
        <div className="feedback-emoji">{scoreLabel.emoji}</div>
        <div className="feedback-score-text">{scoreLabel.text}</div>

        <div className="feedback-details">
          <div className="detail-row">
            <span className="detail-label">יישוב:</span>
            <span className="detail-value">
              {result.settlement.name_he} ({result.settlement.name_en})
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">מחוז:</span>
            <span className="detail-value">
              {mode === 'mastery' && currentDistrictName ? currentDistrictName : regionName}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">ניסיונות:</span>
            <span className="detail-value distance">
              {formatAttempts(result.attempts)}
            </span>
          </div>
          <div className="detail-row score-row">
            <span className="detail-label">ניקוד בסיס:</span>
            <span className="detail-value score">
              +{result.baseScore} נקודות
            </span>
          </div>
          {result.timeBonus > 0 && (
            <div className="detail-row score-row">
              <span className="detail-label">בונוס מהירות:</span>
              <span className="detail-value score">+{result.timeBonus}</span>
            </div>
          )}
          {result.streakBonus > 0 && (
            <div className="detail-row score-row">
              <span className="detail-label">בונוס רצף:</span>
              <span className="detail-value score">+{result.streakBonus}</span>
            </div>
          )}
          <div className="detail-row score-row total-round-row">
            <span className="detail-label">סה"כ לסיבוב:</span>
            <span className="detail-value score">+{result.score}</span>
          </div>
          {result.usedApproximateBoundary && (
            <div className="detail-row score-row">
              <span className="detail-label">הערה:</span>
              <span className="detail-value">ליישוב הזה מוצג אזור מקורב</span>
            </div>
          )}
        </div>

        <div className="feedback-total">סה"כ ניקוד: {totalScore}</div>
        {currentStreak > 1 && !result.timedOut && (
          <div className="feedback-streak">רצף מושלם נוכחי: {currentStreak}</div>
        )}
      </div>

      {/* Map showing both markers */}
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

      {/* Actions */}
      <div className="feedback-actions">
        {isLastRound ? (
          <button className="next-btn summary-btn" onClick={onNextRound}>
            📊 צפה בסיכום
          </button>
        ) : (
          <button className="next-btn" onClick={onNextRound}>
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
