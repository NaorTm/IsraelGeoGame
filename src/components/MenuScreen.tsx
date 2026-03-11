import { useState } from 'react';
import { mapStyles } from '../data/mapStyles';
import { regions } from '../data/regions';
import type { GameConfig, GameMode, MapStyleId } from '../types';
import { settlements } from '../data/settlements';
import { getSettlementDistrictId } from '../utils/districts';
import { usesApproximateBoundary } from '../utils/settlementBoundaries';

interface MenuScreenProps {
  config: GameConfig;
  onUpdateConfig: (updates: Partial<GameConfig>) => void;
  onStartGame: () => void;
}

const gameModes: Array<{
  id: GameMode;
  label: string;
  description: string;
}> = [
  { id: 'rounds', label: '🎯 סיבובים', description: 'משחק קלאסי עם מספר סיבובים קבוע' },
  { id: 'endless', label: '♾️ אינסוף', description: 'המשך לשחק בלי סוף ידני' },
  { id: 'time_attack', label: '⏱️ זמן', description: 'הכה בשעון כדי לקבל בונוס מהירות' },
  { id: 'survival', label: '❤️ הישרדות', description: 'אחרי 3 טעויות המשחק נגמר' },
  { id: 'mastery', label: '🏁 שליטה במחוזות', description: 'מסיימים מחוז ואז פותחים את הבא' },
];

export default function MenuScreen({
  config,
  onUpdateConfig,
  onStartGame,
}: MenuScreenProps) {
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const exactBoundarySettlements = settlements.filter(
    (settlement) => !usesApproximateBoundary(settlement)
  );

  const updateMapStyle = (mapStyle: MapStyleId) => {
    onUpdateConfig({ mapStyle });
  };

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
  const selectedMode = gameModes.find((mode) => mode.id === config.mode);

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

        <div className="menu-section">
          <h2 className="section-title">סגנון מפה</h2>
          <div className="map-style-grid">
            {mapStyles.map((style) => (
              <button
                key={style.id}
                className={`map-style-chip ${
                  config.mapStyle === style.id ? 'selected' : ''
                }`}
                onClick={() => updateMapStyle(style.id)}
              >
                <span className="map-style-name">{style.name_he}</span>
                <span className="map-style-name-en">{style.name_en}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="menu-section">
          <h2 className="section-title">מצב משחק</h2>
          <div className="mode-buttons">
            {gameModes.map((mode) => (
              <button
                key={mode.id}
                className={`mode-btn ${config.mode === mode.id ? 'active' : ''}`}
                onClick={() => onUpdateConfig({ mode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {selectedMode && (
            <p className="mode-description">{selectedMode.description}</p>
          )}
        </div>

        {(config.mode === 'rounds' || config.mode === 'time_attack') && (
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

        {config.mode === 'time_attack' && (
          <div className="menu-section">
            <h2 className="section-title">זמן לכל סיבוב</h2>
            <div className="round-buttons">
              {[15, 20, 30].map((seconds) => (
                <button
                  key={seconds}
                  className={`round-btn ${
                    config.timeLimitSeconds === seconds ? 'active' : ''
                  }`}
                  onClick={() => onUpdateConfig({ timeLimitSeconds: seconds })}
                >
                  {seconds}ש
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
