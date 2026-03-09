import type { RoundResult } from '../types';
import { formatDistance } from '../utils/geo';

interface SummaryScreenProps {
  results: RoundResult[];
  totalScore: number;
  onRestart: () => void;
}

export default function SummaryScreen({
  results,
  totalScore,
  onRestart,
}: SummaryScreenProps) {
  const avgDistance =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.distanceKm, 0) / results.length
      : 0;

  const bestRound = results.reduce(
    (best, r) => (r.score > best.score ? r : best),
    results[0]
  );

  const maxPossible = results.length * 1000;
  const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

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
              <span className="stat-value">{formatDistance(avgDistance)}</span>
              <span className="stat-label">ממוצע מרחק</span>
            </div>
          </div>
        </div>

        {bestRound && (
          <div className="best-round">
            🎯 הניחוש הטוב ביותר: {bestRound.settlement.name_he} (
            {formatDistance(bestRound.distanceKm)})
          </div>
        )}

        {/* Round-by-round table */}
        <div className="results-table-container">
          <table className="results-table">
            <thead>
              <tr>
                <th>#</th>
                <th>יישוב</th>
                <th>מרחק</th>
                <th>ניקוד</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className={r.score >= 800 ? 'excellent' : ''}>
                  <td>{i + 1}</td>
                  <td>{r.settlement.name_he}</td>
                  <td>{formatDistance(r.distanceKm)}</td>
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
