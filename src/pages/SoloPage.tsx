import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import MenuScreen from '../components/MenuScreen';
import SummaryScreen from '../components/SummaryScreen';
import { regions } from '../data/regions';
import {
  PLAYABLE_SETTLEMENT_COUNT,
  SETTLEMENT_COUNT_BY_DISTRICT,
  countSettlementsForDistrictSelection,
} from '../lib/catalog';
import {
  getDistrictDisplayName,
  resolveSoloDistrictId,
  roundResultsToSoloRecords,
} from '../lib/gameSession';
import {
  loadSettlementCatalog,
  preloadSettlementCatalog,
} from '../lib/settlementCatalog';
import { useSoloGame } from '../hooks/useGame';
import { useAuth } from '../providers/AuthProvider';
import { recordSoloSession } from '../services/supabaseApi';
import type { MapViewport, Settlement } from '../types';
import { preloadBoundaryCollectionsForDistrictIds } from '../utils/settlementBoundaries';

const PlayingScreen = lazy(() => import('../components/PlayingScreen'));
const FeedbackScreen = lazy(() => import('../components/FeedbackScreen'));

const DEFAULT_MAP_VIEWPORT: MapViewport = {
  center: [31.5, 35.0],
  zoom: 7,
};

function GameplayStageFallback() {
  return (
    <div className="surface-card loading-panel" data-testid="solo-stage-loading">
      <strong>
        {
          '\u05d8\u05d5\u05e2\u05df \u05d0\u05ea \u05d4\u05de\u05e4\u05d4 \u05d5\u05d0\u05ea \u05d4\u05e1\u05d9\u05d1\u05d5\u05d1...'
        }
      </strong>
      <span>
        {
          '\u05d8\u05e2\u05d9\u05e0\u05ea \u05d4\u05de\u05e4\u05d4 \u05d5\u05d4\u05d2\u05d1\u05d5\u05dc\u05d5\u05ea \u05e0\u05d3\u05d7\u05d9\u05ea \u05e2\u05d3 \u05dc\u05e8\u05d2\u05e2 \u05e9\u05d1\u05d5 \u05de\u05ea\u05d7\u05d9\u05dc\u05d9\u05dd \u05dc\u05e9\u05d7\u05e7.'
        }
      </span>
    </div>
  );
}

function getCatalogScopeKey(districtIds: string[]) {
  if (districtIds.length === 0) {
    return 'all_israel';
  }

  return districtIds.join('|');
}

export default function SoloPage() {
  const auth = useAuth();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [mapViewport, setMapViewport] = useState<MapViewport>(DEFAULT_MAP_VIEWPORT);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [prepareStatus, setPrepareStatus] = useState<string | null>(null);
  const savedSignatureRef = useRef<string | null>(null);
  const pendingStartRef = useRef(false);
  const loadedCatalogScopeKeyRef = useRef<string | null>(null);
  const game = useSoloGame({ settlements, regions });
  const startSoloGame = game.startGame;
  const selectedDistrictIds = useMemo(
    () => [...game.config.selectedRegions].sort((left, right) => left.localeCompare(right, 'he')),
    [game.config.selectedRegions]
  );
  const catalogScopeKey = useMemo(
    () => getCatalogScopeKey(selectedDistrictIds),
    [selectedDistrictIds]
  );

  const completedSettlementIds = game.roundResults
    .filter((result) => !result.timedOut)
    .map((result) => result.settlement.id);

  const effectiveDistrictId = useMemo(
    () => resolveSoloDistrictId(game.config.selectedRegions),
    [game.config.selectedRegions]
  );

  const availableCount = useMemo(
    () => countSettlementsForDistrictSelection(game.config.selectedRegions),
    [game.config.selectedRegions]
  );

  const sessionSignature = useMemo(
    () =>
      JSON.stringify({
        district: effectiveDistrictId,
        mode: game.config.mode,
        results: game.roundResults.map((result) => ({
          id: result.settlement.id,
          attempts: result.attempts,
          score: result.score,
          timedOut: result.timedOut,
        })),
      }),
    [effectiveDistrictId, game.config.mode, game.roundResults]
  );

  useEffect(() => {
    if (
      !pendingStartRef.current ||
      settlements.length === 0 ||
      loadedCatalogScopeKeyRef.current !== catalogScopeKey
    ) {
      return;
    }

    pendingStartRef.current = false;
    setPrepareStatus(null);
    startSoloGame();
  }, [catalogScopeKey, settlements.length, startSoloGame]);

  useEffect(() => {
    if (game.phase !== 'menu') {
      return;
    }

    void preloadSettlementCatalog({
      districtIds: selectedDistrictIds.length > 0 ? selectedDistrictIds : undefined,
    }).catch(() => undefined);
    void preloadBoundaryCollectionsForDistrictIds(selectedDistrictIds).catch(() => undefined);
  }, [game.phase, selectedDistrictIds]);

  useEffect(() => {
    if (
      !auth.isAuthenticated ||
      !auth.configured ||
      game.phase !== 'summary' ||
      game.roundResults.length === 0 ||
      savedSignatureRef.current === sessionSignature
    ) {
      return;
    }

    let active = true;

    const saveStart = window.setTimeout(() => {
      if (active) {
        setSaveStatus(
          '\u05e9\u05d5\u05de\u05e8 \u05d4\u05ea\u05e7\u05d3\u05de\u05d5\u05ea \u05d1\u05e2\u05e0\u05df...'
        );
      }
    }, 0);

    void recordSoloSession({
      districtId: effectiveDistrictId,
      mode: game.config.mode,
      roundResults: roundResultsToSoloRecords(game.roundResults),
      totalScore: game.totalScore,
      bestStreak: game.bestStreak,
    })
      .then(() => {
        if (!active) {
          return;
        }

        savedSignatureRef.current = sessionSignature;
        setSaveStatus(
          `\u05d4\u05d4\u05ea\u05e7\u05d3\u05de\u05d5\u05ea \u05e0\u05e9\u05de\u05e8\u05d4 \u05e2\u05d1\u05d5\u05e8 ${getDistrictDisplayName(effectiveDistrictId)}.`
        );
      })
      .catch((error) => {
        if (active) {
          setSaveStatus(
            error instanceof Error
              ? `\u05e9\u05de\u05d9\u05e8\u05d4 \u05e0\u05db\u05e9\u05dc\u05d4: ${error.message}`
              : '\u05e9\u05de\u05d9\u05e8\u05d4 \u05e0\u05db\u05e9\u05dc\u05d4.'
          );
        }
      });

    return () => {
      active = false;
      window.clearTimeout(saveStart);
    };
  }, [
    auth.configured,
    auth.isAuthenticated,
    effectiveDistrictId,
    game.bestStreak,
    game.config.mode,
    game.phase,
    game.roundResults,
    game.totalScore,
    sessionSignature,
  ]);

  async function ensureCatalogLoaded(districtIds: string[]) {
    if (
      catalogLoading ||
      (settlements.length > 0 && loadedCatalogScopeKeyRef.current === getCatalogScopeKey(districtIds))
    ) {
      return;
    }

    setCatalogLoading(true);
    setPrepareStatus(
      districtIds.length > 0
        ? `מכין את המפה והגבולות עבור ${districtIds.length === 1 ? getDistrictDisplayName(districtIds[0]) : 'המחוזות שנבחרו'}...`
        : 'מכין את מפת כל הארץ והגבולות הרלוונטיים...'
    );

    try {
      const nextCatalog = await loadSettlementCatalog({
        districtIds: districtIds.length > 0 ? districtIds : undefined,
      });
      loadedCatalogScopeKeyRef.current = getCatalogScopeKey(districtIds);
      setSettlements(nextCatalog.settlements);
    } catch (error) {
      pendingStartRef.current = false;
      setPrepareStatus(null);
      setSaveStatus(
        error instanceof Error
          ? `\u05d8\u05e2\u05d9\u05e0\u05ea \u05d4\u05de\u05d0\u05d2\u05e8 \u05e0\u05db\u05e9\u05dc\u05d4: ${error.message}`
          : '\u05d8\u05e2\u05d9\u05e0\u05ea \u05d4\u05de\u05d0\u05d2\u05e8 \u05e0\u05db\u05e9\u05dc\u05d4.'
      );
    } finally {
      setCatalogLoading(false);
    }
  }

  function handleStartGame() {
    if (
      settlements.length > 0 &&
      loadedCatalogScopeKeyRef.current === catalogScopeKey
    ) {
      startSoloGame();
      return;
    }

    pendingStartRef.current = true;
    void ensureCatalogLoaded(selectedDistrictIds);
  }

  return (
    <section className="solo-page">
      {prepareStatus && (
        <div className="info-banner info-banner-preparing" data-testid="solo-prepare-status">
          {prepareStatus}
        </div>
      )}

      {saveStatus && (
        <div className="info-banner" data-testid="solo-save-status">
          {saveStatus}
        </div>
      )}

      <div className="solo-stage">
        {game.phase === 'menu' && (
          <MenuScreen
            config={game.config}
            regions={regions}
            totalSettlementCount={PLAYABLE_SETTLEMENT_COUNT}
            availableCount={availableCount}
            settlementCountByRegion={SETTLEMENT_COUNT_BY_DISTRICT}
            isPreparingGame={catalogLoading}
            onUpdateConfig={game.updateConfig}
            onStartGame={handleStartGame}
          />
        )}

        {((game.phase === 'playing' && game.currentSettlement) ||
          (game.phase === 'feedback' && game.roundResults.length > 0)) && (
          <Suspense fallback={<GameplayStageFallback />}>
            {game.phase === 'playing' && game.currentSettlement && (
              <PlayingScreen
                key={`${game.currentRound}-${game.currentSettlement.id}-${game.config.timeLimitSeconds}`}
                availableSettlements={game.filteredSettlements}
                settlement={game.currentSettlement}
                currentRound={game.currentRound}
                totalRounds={game.totalRounds}
                totalScore={game.totalScore}
                mode={game.config.mode}
                mapStyle={game.config.mapStyle}
                onMapStyleChange={(mapStyle) => game.updateConfig({ mapStyle })}
                mapViewport={mapViewport}
                onMapViewportChange={setMapViewport}
                completedSettlementIds={completedSettlementIds}
                currentStreak={game.currentStreak}
                survivalLivesRemaining={game.survivalLivesRemaining}
                currentDistrictName={game.currentDistrictName}
                timeLimitSeconds={game.config.timeLimitSeconds}
                onSubmitGuess={game.submitGuess}
                onRegisterWrongGuess={game.registerWrongGuess}
                onEndGame={game.endGame}
              />
            )}

            {game.phase === 'feedback' && game.roundResults.length > 0 && (
              <FeedbackScreen
                availableSettlements={game.filteredSettlements}
                result={game.roundResults[game.roundResults.length - 1]}
                totalScore={game.totalScore}
                mode={game.config.mode}
                mapStyle={game.config.mapStyle}
                onMapStyleChange={(mapStyle) => game.updateConfig({ mapStyle })}
                mapViewport={mapViewport}
                onMapViewportChange={setMapViewport}
                completedSettlementIds={completedSettlementIds}
                currentStreak={game.currentStreak}
                currentDistrictName={game.currentDistrictName}
                isLastRound={game.isLastRound}
                onNextRound={game.nextRound}
                onEndGame={game.endGame}
              />
            )}
          </Suspense>
        )}

        {game.phase === 'summary' && (
          <SummaryScreen
            results={game.roundResults}
            totalScore={game.totalScore}
            bestStreak={game.bestStreak}
            mode={game.config.mode}
            onRestart={() => {
              setMapViewport(DEFAULT_MAP_VIEWPORT);
              game.resetGame();
              setSaveStatus(null);
              setPrepareStatus(null);
            }}
          />
        )}
      </div>
    </section>
  );
}
