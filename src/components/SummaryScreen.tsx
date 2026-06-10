import type { GameMode, RoundResult } from '../types';
import { formatAttempts } from '../utils/geo';

interface SummaryScreenProps {
  results: RoundResult[];
  totalScore: number;
  bestStreak: number;
  mode: GameMode;
  onRestart: () => void;
}

function getModeLabel(mode: GameMode) {
  switch (mode) {
    case 'time_attack':
      return 'מרוץ זמן';
    case 'survival':
      return 'הישרדות';
    case 'mastery':
      return 'שליטה במחוזות';
    case 'endless':
      return 'אינסוף';
    default:
      return 'סיבובים';
  }
}

function getOverallEmoji(percentage: number): string {
  if (percentage >= 90) return '🏆';
  if (percentage >= 70) return '🌟';
  if (percentage >= 50) return '👏';
  if (percentage >= 30) return '👍';
  return '💪';
}

export default function SummaryScreen({
  results,
  totalScore,
  bestStreak,
  mode,
  onRestart,
}: SummaryScreenProps) {
  const avgMisses =
    results.length > 0
      ? results.reduce((sum, result) => sum + result.attempts, 0) / results.length
      : 0;

  const bestRound =
    results.length > 0
      ? results.reduce((best, result) => (result.score > best.score ? result : best), results[0])
      : null;

  const baseTotal = results.reduce((sum, result) => sum + result.baseScore, 0);
  const bonusTotal = results.reduce(
    (sum, result) => sum + result.timeBonus + result.streakBonus,
    0
  );
  const perfectRounds = results.filter((result) => result.attempts === 0 && !result.timedOut).length;
  const timedOutRounds = results.filter((result) => result.timedOut).length;
  const maxPossible = results.length * 3;
  const accuracyPct = maxPossible > 0 ? Math.round((baseTotal / maxPossible) * 100) : 0;

  return (
    <div className="summary-screen" data-testid="solo-summary">
      <div className="summary-card summary-card-polished">
        <div className="summary-header">
          <div className="summary-emoji">{getOverallEmoji(accuracyPct)}</div>
          <div>
            <h1 className="summary-title">סיכום משחק</h1>
            <p className="summary-subtitle">
              מצב משחק: {getModeLabel(mode)} · {results.length} סיבובים הושלמו
            </p>
          </div>
        </div>

        <div className="summary-stats">
          <div className="stat-item main-stat">
            <span className="stat-value">{totalScore}</span>
            <span className="stat-label">ניקוד כולל</span>
          </div>
          <div className="stat-row">
            <div className="stat-item">
              <span className="stat-value">{accuracyPct}%</span>
              <span className="stat-label">דיוק בסיס</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{perfectRounds}</span>
              <span className="stat-label">פגיעות ראשונות</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{avgMisses.toFixed(1)}</span>
              <span className="stat-label">ממוצע פספוסים</span>
            </div>
          </div>
          <div className="summary-meta-row">
            <span>בונוסים: {bonusTotal}</span>
            <span>רצף שיא: {bestStreak}</span>
            <span>סיבובי timeout: {timedOutRounds}</span>
          </div>
        </div>

        {bestRound && (
          <div className="best-round">
            הניחוש הטוב ביותר: {bestRound.settlement.name_he} ({formatAttempts(bestRound.attempts)})
          </div>
        )}

        <div className="results-table-container">
          <table className="results-table">
            <thead>
              <tr>
                <th>#</th>
                <th>יישוב</th>
                <th>פספוסים</th>
                <th>ניקוד</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr
                  key={`${result.settlement.id}-${index}`}
                  className={result.attempts === 0 && !result.timedOut ? 'excellent' : ''}
                >
                  <td>{index + 1}</td>
                  <td>{result.settlement.name_he}</td>
                  <td>{result.attempts}</td>
                  <td className="score-cell">{result.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="restart-btn" data-testid="solo-restart-button" onClick={onRestart}>
          שחק שוב
        </button>
      </div>
    </div>
  );
}
