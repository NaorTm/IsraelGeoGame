import type { RoundResult } from '../types';
import { formatDistance } from '../utils/geo';
import { regions } from '../data/regions';
import GameMap from './GameMap';

interface FeedbackScreenProps {
  result: RoundResult;
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  mode: string;
  onNextRound: () => void;
  onEndGame: () => void;
}

function getScoreLabel(score: number): { text: string; emoji: string } {
  if (score >= 950) return { text: 'מושלם!', emoji: '🎯' };
  if (score >= 800) return { text: 'מצוין!', emoji: '🌟' };
  if (score >= 600) return { text: 'טוב מאוד!', emoji: '👏' };
  if (score >= 400) return { text: 'לא רע!', emoji: '👍' };
  if (score >= 200) return { text: 'יש מקום לשיפור', emoji: '🤔' };
  return { text: 'נסה שוב!', emoji: '💪' };
}

export default function FeedbackScreen({
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
    regions.find((r) => r.id === result.settlement.region)?.name_he || '';

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
            <span className="detail-label">אזור:</span>
            <span className="detail-value">{regionName}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">מרחק:</span>
            <span className="detail-value distance">
              {formatDistance(result.distanceKm)}
            </span>
          </div>
          <div className="detail-row score-row">
            <span className="detail-label">ניקוד:</span>
            <span className="detail-value score">
              +{result.score} נקודות
            </span>
          </div>
        </div>

        <div className="feedback-total">סה"כ ניקוד: {totalScore}</div>
      </div>

      {/* Map showing both markers */}
      <div className="map-container feedback-map">
        <GameMap
          guessPosition={[result.guessLat, result.guessLng]}
          correctPosition={[result.settlement.lat, result.settlement.lng]}
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
