import { useMemo, useState } from 'react';
import { mapStyles } from '../data/mapStyles';
import type { GameConfig, GameMode, MapStyleId, Region } from '../types';

interface MenuScreenProps {
  config: GameConfig;
  regions: Region[];
  totalSettlementCount: number;
  availableCount: number;
  settlementCountByRegion: Record<string, number>;
  isPreparingGame: boolean;
  onUpdateConfig: (updates: Partial<GameConfig>) => void;
  onStartGame: () => void;
}

const gameModes: Array<{
  id: GameMode;
  label: string;
  description: string;
}> = [
  {
    id: 'rounds',
    label: '\u05e1\u05d9\u05d1\u05d5\u05d1\u05d9\u05dd',
    description:
      '\u05de\u05e9\u05d7\u05e7 \u05e7\u05dc\u05d0\u05e1\u05d9 \u05e2\u05dd \u05de\u05e1\u05e4\u05e8 \u05e1\u05d9\u05d1\u05d5\u05d1\u05d9\u05dd \u05e7\u05d1\u05d5\u05e2 \u05d5\u05de\u05e1\u05da \u05e1\u05d9\u05db\u05d5\u05dd \u05de\u05dc\u05d0.',
  },
  {
    id: 'endless',
    label: '\u05d0\u05d9\u05e0\u05e1\u05d5\u05e3',
    description:
      '\u05de\u05de\u05e9\u05d9\u05db\u05d9\u05dd \u05dc\u05e2\u05e0\u05d5\u05ea \u05e2\u05d3 \u05e9\u05de\u05d7\u05dc\u05d9\u05d8\u05d9\u05dd \u05dc\u05e2\u05e6\u05d5\u05e8 \u05d0\u05d5 \u05e2\u05d3 \u05e9\u05e0\u05d2\u05de\u05e8 \u05d4\u05de\u05d0\u05d2\u05e8 \u05d4\u05d6\u05de\u05d9\u05df.',
  },
  {
    id: 'time_attack',
    label: '\u05de\u05e8\u05d5\u05e5 \u05d6\u05de\u05df',
    description:
      '\u05d0\u05d5\u05ea\u05d5 \u05de\u05e9\u05d7\u05e7 \u05e7\u05dc\u05d0\u05e1\u05d9, \u05e2\u05dd \u05d1\u05d5\u05e0\u05d5\u05e1 \u05de\u05d4\u05d9\u05e8\u05d5\u05ea \u05e2\u05dc \u05e4\u05d2\u05d9\u05e2\u05d4 \u05de\u05d5\u05e7\u05d3\u05de\u05ea.',
  },
  {
    id: 'survival',
    label: '\u05d4\u05d9\u05e9\u05e8\u05d3\u05d5\u05ea',
    description:
      '\u05d0\u05d7\u05e8\u05d9 3 \u05e4\u05e1\u05e4\u05d5\u05e1\u05d9\u05dd \u05de\u05e6\u05d8\u05d1\u05e8\u05d9\u05dd \u05d4\u05de\u05e9\u05d7\u05e7 \u05e0\u05d2\u05de\u05e8 \u05de\u05d9\u05d3.',
  },
  {
    id: 'mastery',
    label: '\u05e9\u05dc\u05d9\u05d8\u05d4 \u05d1\u05de\u05d7\u05d5\u05d6\u05d5\u05ea',
    description:
      '\u05de\u05e1\u05d9\u05d9\u05de\u05d9\u05dd \u05de\u05d7\u05d5\u05d6 \u05e4\u05e2\u05d9\u05dc \u05d5\u05d0\u05d6 \u05e2\u05d5\u05d1\u05e8\u05d9\u05dd \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea \u05dc\u05de\u05d7\u05d5\u05d6 \u05d4\u05d1\u05d0.',
  },
];

export default function MenuScreen({
  config,
  regions,
  totalSettlementCount,
  availableCount,
  settlementCountByRegion,
  isPreparingGame,
  onUpdateConfig,
  onStartGame,
}: MenuScreenProps) {
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  const selectedMode = useMemo(
    () => gameModes.find((mode) => mode.id === config.mode),
    [config.mode]
  );

  function updateMapStyle(mapStyle: MapStyleId) {
    onUpdateConfig({ mapStyle });
  }

  function toggleRegion(regionId: string) {
    const current = config.selectedRegions;

    if (current.includes(regionId)) {
      onUpdateConfig({
        selectedRegions: current.filter((item) => item !== regionId),
      });
      return;
    }

    onUpdateConfig({ selectedRegions: [...current, regionId] });
  }

  function selectAllRegions() {
    onUpdateConfig({ selectedRegions: [] });
  }

  return (
    <div className="menu-screen">
      <div className="menu-card">
        <div className="menu-header">
          <h1 className="menu-title">
            {'\u05de\u05e9\u05d7\u05e7 \u05d4\u05d2\u05d9\u05d0\u05d5\u05d2\u05e8\u05e4\u05d9\u05d4 \u05e9\u05dc \u05d9\u05e9\u05e8\u05d0\u05dc'}
          </h1>
          <p className="menu-subtitle">
            {
              '\u05d1\u05d7\u05e8 \u05de\u05d7\u05d5\u05d6, \u05de\u05e6\u05d1 \u05de\u05e9\u05d7\u05e7 \u05d5\u05e7\u05e6\u05d1 \u05de\u05e9\u05d7\u05e7. \u05db\u05dc \u05d4\u05d9\u05d9\u05e9\u05d5\u05d1\u05d9\u05dd \u05d4\u05e4\u05e2\u05d9\u05dc\u05d9\u05dd \u05d6\u05de\u05d9\u05e0\u05d9\u05dd, \u05d5\u05d1\u05de\u05e7\u05e8\u05d9\u05dd \u05d1\u05d5\u05d3\u05d3\u05d9\u05dd \u05d9\u05d5\u05e6\u05d2 \u05d0\u05d6\u05d5\u05e8 \u05de\u05e7\u05d5\u05e8\u05d1 \u05db\u05d0\u05e9\u05e8 \u05d0\u05d9\u05df \u05d2\u05d1\u05d5\u05dc \u05de\u05e4\u05d5\u05e8\u05d8 \u05d1\u05de\u05e7\u05d5\u05e8 \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd.'
            }
          </p>
        </div>

        <div className="menu-section">
          <h2 className="section-title">{'\u05d1\u05d7\u05d9\u05e8\u05ea \u05de\u05d7\u05d5\u05d6\u05d5\u05ea'}</h2>
          <p className="region-info">
            {config.selectedRegions.length === 0
              ? `\u05db\u05dc \u05d9\u05e9\u05e8\u05d0\u05dc \u05e4\u05e2\u05d9\u05dc\u05d4 \u05db\u05e8\u05d2\u05e2 \u05e2\u05dd ${totalSettlementCount} \u05d9\u05d9\u05e9\u05d5\u05d1\u05d9\u05dd.`
              : `${availableCount} \u05d9\u05d9\u05e9\u05d5\u05d1\u05d9\u05dd \u05e4\u05e2\u05d9\u05dc\u05d9\u05dd \u05d1\u05d1\u05d7\u05d9\u05e8\u05d4 \u05d4\u05e0\u05d5\u05db\u05d7\u05d9\u05ea.`}
          </p>

          <button
            className={`region-toggle-btn ${config.selectedRegions.length === 0 ? 'active' : ''}`}
            onClick={selectAllRegions}
          >
            {'\u05db\u05dc \u05d9\u05e9\u05e8\u05d0\u05dc'} ({totalSettlementCount})
          </button>

          <button
            className="region-expand-btn"
            data-testid="region-expand-toggle"
            onClick={() => setShowRegionPicker((previous) => !previous)}
          >
            {showRegionPicker
              ? '\u05d4\u05e1\u05ea\u05e8 \u05de\u05d7\u05d5\u05d6\u05d5\u05ea'
              : '\u05d1\u05d7\u05e8 \u05de\u05d7\u05d5\u05d6\u05d5\u05ea \u05e1\u05e4\u05e6\u05d9\u05e4\u05d9\u05d9\u05dd'}
          </button>

          {showRegionPicker && (
            <div className="region-grid">
              {regions.map((region) => {
                const count = settlementCountByRegion[region.id] ?? 0;
                const isSelected = config.selectedRegions.includes(region.id);

                return (
                  <button
                    key={region.id}
                    className={`region-chip ${isSelected ? 'selected' : ''}`}
                    data-region-id={region.id}
                    data-testid={`region-chip-${region.id}`}
                    onClick={() => toggleRegion(region.id)}
                  >
                    <span className="region-name">{region.name_he}</span>
                    <span className="region-count">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="menu-section">
          <h2 className="section-title">{'\u05de\u05e6\u05d1 \u05de\u05e9\u05d7\u05e7'}</h2>
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
          {selectedMode && <p className="mode-description">{selectedMode.description}</p>}
        </div>

        {(config.mode === 'rounds' || config.mode === 'time_attack') && (
          <div className="menu-section">
            <h2 className="section-title">{'\u05de\u05e1\u05e4\u05e8 \u05e1\u05d9\u05d1\u05d5\u05d1\u05d9\u05dd'}</h2>
            <div className="round-buttons">
              {[5, 10, 15, 20].map((roundCount) => (
                <button
                  key={roundCount}
                  className={`round-btn ${config.roundCount === roundCount ? 'active' : ''}`}
                  data-testid={`round-count-${roundCount}`}
                  onClick={() => onUpdateConfig({ roundCount })}
                >
                  {roundCount}
                </button>
              ))}
            </div>
          </div>
        )}

        {config.mode === 'time_attack' && (
          <div className="menu-section">
            <h2 className="section-title">{'\u05d6\u05de\u05df \u05dc\u05db\u05dc \u05e1\u05d9\u05d1\u05d5\u05d1'}</h2>
            <div className="round-buttons">
              {[15, 20, 30].map((timeLimitSeconds) => (
                <button
                  key={timeLimitSeconds}
                  className={`round-btn ${config.timeLimitSeconds === timeLimitSeconds ? 'active' : ''}`}
                  onClick={() => onUpdateConfig({ timeLimitSeconds })}
                >
                  {timeLimitSeconds}
                  {'\u05e9\u05f3'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="menu-section">
          <h2 className="section-title">{'\u05e1\u05d2\u05e0\u05d5\u05df \u05de\u05e4\u05d4'}</h2>
          <div className="map-style-grid">
            {mapStyles.map((style) => (
              <button
                key={style.id}
                className={`map-style-chip ${config.mapStyle === style.id ? 'selected' : ''}`}
                onClick={() => updateMapStyle(style.id)}
              >
                <span className="map-style-name">{style.name_he}</span>
                <span className="map-style-name-en">{style.name_en}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          className="start-btn"
          data-testid="solo-start-button"
          onClick={onStartGame}
          disabled={availableCount < 1 || isPreparingGame}
        >
          {isPreparingGame
            ? '\u05d8\u05d5\u05e2\u05df \u05d0\u05ea \u05de\u05d0\u05d2\u05e8 \u05d4\u05de\u05e9\u05d7\u05e7...'
            : '\u05d4\u05ea\u05d7\u05dc \u05de\u05e9\u05d7\u05e7'}
        </button>
      </div>
    </div>
  );
}
