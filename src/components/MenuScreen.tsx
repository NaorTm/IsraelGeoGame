import { useState } from 'react';
import { regions } from '../data/regions';
import type { GameConfig, GameMode } from '../types';
import { settlements } from '../data/settlements';
import { getSettlementDistrictId } from '../utils/districts';
import { usesApproximateBoundary } from '../utils/settlementBoundaries';

interface MenuScreenProps {
  config: GameConfig;
  onUpdateConfig: (updates: Partial<GameConfig>) => void;
  onStartGame: () => void;
}

export default function MenuScreen({
  config,
  onUpdateConfig,
  onStartGame,
}: MenuScreenProps) {
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const exactBoundarySettlements = settlements.filter(
    (settlement) => !usesApproximateBoundary(settlement)
  );

  const toggleRegion = (regionId: string) => {
    const current = config.selectedRegions;
    if (current.includes(regionId)) {
      onUpdateConfig({
        selectedRegions: current.filter((r) => r !== regionId),
      });
    } else {
      onUpdateConfig({ selectedRegions: [...current, regionId] });
    }
  };

  const selectAllRegions = () => {
    onUpdateConfig({ selectedRegions: [] });
  };

  const availableCount =
    config.selectedRegions.length === 0
      ? exactBoundarySettlements.length
      : exactBoundarySettlements.filter((settlement) =>
          config.selectedRegions.includes(getSettlementDistrictId(settlement))
        ).length;

  const canStart = availableCount >= 1;

  return (
    <div className="menu-screen">
      <div className="menu-card">
        <div className="menu-header">
          <h1 className="menu-title">🗺️ משחק הגיאוגרפיה של ישראל</h1>
          <p className="menu-subtitle">
            כמה טוב אתה מכיר את מפת ישראל? בחר אזור ונסה לנחש!
          </p>
        </div>

        {/* District selection */}
        <div className="menu-section">
          <h2 className="section-title">בחר מחוזות</h2>
          <p className="region-info">מוצגים רק יישובים עם גבולות מדויקים במפה</p>

          <button
            className={`region-toggle-btn ${
              config.selectedRegions.length === 0 ? 'active' : ''
            }`}
            onClick={selectAllRegions}
          >
            🌍 כל ישראל ({exactBoundarySettlements.length} יישובים)
          </button>

          <button
            className="region-expand-btn"
            onClick={() => setShowRegionPicker(!showRegionPicker)}
          >
            {showRegionPicker ? '▲ הסתר מחוזות' : '▼ בחר מחוזות ספציפיים'}
          </button>

          {showRegionPicker && (
            <div className="region-grid">
              {regions.map((region) => {
                const count = exactBoundarySettlements.filter(
                  (settlement) => getSettlementDistrictId(settlement) === region.id
                ).length;
                const isSelected = config.selectedRegions.includes(region.id);
                return (
                  <button
                    key={region.id}
                    className={`region-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleRegion(region.id)}
                  >
                    <span className="region-name">{region.name_he}</span>
                    <span className="region-count">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {config.selectedRegions.length > 0 && (
            <p className="region-info">{availableCount} יישובים זמינים</p>
          )}
        </div>

        {/* Game mode */}
        <div className="menu-section">
          <h2 className="section-title">מצב משחק</h2>
          <div className="mode-buttons">
            <button
              className={`mode-btn ${
                config.mode === 'rounds' ? 'active' : ''
              }`}
              onClick={() => onUpdateConfig({ mode: 'rounds' as GameMode })}
            >
              🎯 סיבובים
            </button>
            <button
              className={`mode-btn ${
                config.mode === 'endless' ? 'active' : ''
              }`}
              onClick={() => onUpdateConfig({ mode: 'endless' as GameMode })}
            >
              ♾️ אינסוף
            </button>
          </div>
        </div>

        {/* Round count */}
        {config.mode === 'rounds' && (
          <div className="menu-section">
            <h2 className="section-title">מספר סיבובים</h2>
            <div className="round-buttons">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  className={`round-btn ${
                    config.roundCount === n ? 'active' : ''
                  }`}
                  onClick={() => onUpdateConfig({ roundCount: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Start button */}
        <button
          className="start-btn"
          onClick={onStartGame}
          disabled={!canStart}
        >
          🚀 התחל משחק!
        </button>
      </div>
    </div>
  );
}
