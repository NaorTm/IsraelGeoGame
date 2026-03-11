import type { GameMode, RoundResult } from '../types';
import { formatAttempts } from '../utils/geo';

interface SummaryScreenProps {
  results: RoundResult[];
  totalScore: number;
  bestStreak: number;
  mode: GameMode;
  onRestart: () => void;
}

export default function SummaryScreen({
  results,
  totalScore,
  bestStreak,
  mode,
  onRestart,
}: SummaryScreenProps) {
  const avgAttempts =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.attempts, 0) / results.length
      : 0;

  const bestRound =
    results.length > 0
      ? results.reduce((best, r) => (r.score > best.score ? r : best), results[0])
      : null;

  const baseTotal = results.reduce((sum, r) => sum + r.baseScore, 0);
  const bonusTotal = results.reduce(
    (sum, r) => sum + r.timeBonus + r.streakBonus,
    0
  );
  const maxPossible = results.length * 3;
  const percentage =
    maxPossible > 0 ? Math.round((baseTotal / maxPossible) * 100) : 0;

  const modeLabel =
    mode === 'time_attack'
      ? 'מרוץ זמן'
      : mode === 'survival'
        ? 'הישרדות'
        : mode === 'mastery'
          ? 'שליטה במחוזות'
          : mode === 'endless'
            ? 'אינסוף'
            : 'סיבובים';

  function getOverallEmoji(pct: number): string {
    if (pct >= 90) return '🏆';
    if (pct >= 70) return '🌟';
    if (pct >= 50) return '👏';
    if (pct >= 30) return '👍';
    return '💪';
  }

  return (
    <div className="summary-screen">
      <div className="summary-card">
        <div className="summary-header">
          <div className="summary-emoji">{getOverallEmoji(percentage)}</div>
          <h1 className="summary-title">סיכום משחק</h1>
        </div>

        <div className="summary-stats">
          <div className="stat-item main-stat">
            <span className="stat-value">{totalScore}</span>
            <span className="stat-label">ניקוד כולל</span>
          </div>
          <div className="stat-row">
            <div className="stat-item">
              <span className="stat-value">{results.length}</span>
              <span className="stat-label">סיבובים</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{percentage}%</span>
              <span className="stat-label">דיוק</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{avgAttempts.toFixed(1)}</span>
              <span className="stat-label">ממוצע פספוסים</span>
            </div>
          </div>
          <div className="summary-meta-row">
            <span>מצב: {modeLabel}</span>
            <span>בונוסים: {bonusTotal}</span>
            <span>רצף מושלם שיא: {bestStreak}</span>
          </div>
        </div>

        {bestRound && (
          <div className="best-round">
            🎯 הניחוש הטוב ביותר: {bestRound.settlement.name_he} (
            {formatAttempts(bestRound.attempts)})
          </div>
        )}

        {/* Round-by-round table */}
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
              {results.map((r, i) => (
                <tr key={i} className={r.score === 3 ? 'excellent' : ''}>
                  <td>{i + 1}</td>
                  <td>{r.settlement.name_he}</td>
                  <td>{r.attempts}</td>
                  <td className="score-cell">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="restart-btn" onClick={onRestart}>
          🔄 שחק שוב
        </button>
      </div>
    </div>
  );
}
