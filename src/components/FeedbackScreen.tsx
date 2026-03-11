import type { RoundResult } from '../types';
import type { Settlement } from '../types';
import { formatAttempts } from '../utils/geo';
import { regions } from '../data/regions';
import { getSettlementDistrictId } from '../utils/districts';
import GameMap from './GameMap';

interface FeedbackScreenProps {
  availableSettlements: Settlement[];
  result: RoundResult;
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  mode: string;
  onNextRound: () => void;
  onEndGame: () => void;
}

function getScoreLabel(score: number): { text: string; emoji: string } {
  if (score === 3) return { text: 'מושלם!', emoji: '🎯' };
  if (score === 2) return { text: 'כמעט מיד!', emoji: '🌟' };
  if (score === 1) return { text: 'מצאת בסוף', emoji: '👏' };
  return { text: 'נכון, אבל בלי נקודות', emoji: '💪' };
}

export default function FeedbackScreen({
  availableSettlements,
  result,
  currentRound,
  totalRounds,
  totalScore,
  mode,
  onNextRound,
  onEndGame,
}: FeedbackScreenProps) {
  const scoreLabel = getScoreLabel(result.score);
  const regionName =
    regions.find((r) => r.id === getSettlementDistrictId(result.settlement))?.name_he || '';

  const isLastRound = mode === 'rounds' && currentRound >= totalRounds;

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
            <span className="detail-value">{regionName}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">ניסיונות:</span>
            <span className="detail-value distance">
              {formatAttempts(result.attempts)}
            </span>
          </div>
          <div className="detail-row score-row">
            <span className="detail-label">ניקוד:</span>
            <span className="detail-value score">
              +{result.score} נקודות
            </span>
          </div>
          {result.usedApproximateBoundary && (
            <div className="detail-row score-row">
              <span className="detail-label">הערה:</span>
              <span className="detail-value">ליישוב הזה מוצג אזור מקורב</span>
            </div>
          )}
        </div>

        <div className="feedback-total">סה"כ ניקוד: {totalScore}</div>
      </div>

      {/* Map showing both markers */}
      <div className="map-container feedback-map">
        <GameMap
          settlements={availableSettlements}
          revealedSettlementId={result.settlement.id}
          wrongGuessIds={result.wrongGuessIds}
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
        {mode === 'endless' && (
          <button className="end-game-btn" onClick={onEndGame}>
            סיים משחק
          </button>
        )}
      </div>
    </div>
  );
}
