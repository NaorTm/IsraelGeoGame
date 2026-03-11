import { useState, useCallback, useMemo } from 'react';
import type { Settlement, RoundResult, GameConfig, GamePhase } from '../types';
import { defaultMapStyleId } from '../data/mapStyles';
import { settlements } from '../data/settlements';
import { calculateAttemptScore, shuffleArray } from '../utils/geo';
import { getSettlementDistrictId } from '../utils/districts';
import { usesApproximateBoundary } from '../utils/settlementBoundaries';

interface GameState {
  phase: GamePhase;
  config: GameConfig;
  currentRound: number;
  currentSettlement: Settlement | null;
  roundResults: RoundResult[];
  questionPool: Settlement[];
}

const defaultConfig: GameConfig = {
  selectedRegions: [],
  roundCount: 10,
  mode: 'rounds',
  mapStyle: defaultMapStyleId,
};

export function useGame() {
  const [state, setState] = useState<GameState>({
    phase: 'menu',
    config: defaultConfig,
    currentRound: 0,
    currentSettlement: null,
    roundResults: [],
    questionPool: [],
  });

  const exactBoundarySettlements = useMemo(
    () => settlements.filter((settlement) => !usesApproximateBoundary(settlement)),
    []
  );

  const filteredSettlements = useMemo(() => {
    if (state.config.selectedRegions.length === 0) {
      return exactBoundarySettlements;
    }
    return exactBoundarySettlements.filter((settlement) =>
      state.config.selectedRegions.includes(getSettlementDistrictId(settlement))
    );
  }, [exactBoundarySettlements, state.config.selectedRegions]);

  const totalScore = useMemo(
    () => state.roundResults.reduce((sum, r) => sum + r.score, 0),
    [state.roundResults]
  );

  const totalRounds = useMemo(() => {
    if (state.config.mode === 'endless') return Infinity;
    return Math.min(state.config.roundCount, filteredSettlements.length);
  }, [state.config, filteredSettlements]);

  const updateConfig = useCallback((updates: Partial<GameConfig>) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, ...updates },
    }));
  }, []);

  const startGame = useCallback(() => {
    const pool = shuffleArray(filteredSettlements);
    const first = pool[0];
    setState((prev) => ({
      ...prev,
      phase: 'playing',
      currentRound: 1,
      currentSettlement: first,
      roundResults: [],
      questionPool: pool,
    }));
  }, [filteredSettlements]);

  const submitGuess = useCallback(
    (wrongGuessIds: string[]) => {
      if (!state.currentSettlement) return;

      const attempts = wrongGuessIds.length;
      const score = calculateAttemptScore(attempts);

      const result: RoundResult = {
        settlement: state.currentSettlement,
        attempts,
        wrongGuessIds,
        score,
        usedApproximateBoundary: usesApproximateBoundary(state.currentSettlement),
      };

      setState((prev) => ({
        ...prev,
        phase: 'feedback',
        roundResults: [...prev.roundResults, result],
      }));
    },
    [state.currentSettlement]
  );

  const nextRound = useCallback(() => {
    const nextRoundNum = state.currentRound + 1;
    const isEndless = state.config.mode === 'endless';
    const maxRounds = Math.min(
      state.config.roundCount,
      state.questionPool.length
    );

    if (!isEndless && nextRoundNum > maxRounds) {
      setState((prev) => ({ ...prev, phase: 'summary' }));
      return;
    }

    // For endless mode, cycle through and reshuffle when needed
    let pool = state.questionPool;
    let nextIdx = nextRoundNum - 1;
    if (nextIdx >= pool.length) {
      pool = shuffleArray(filteredSettlements);
      nextIdx = 0;
    }

    setState((prev) => ({
      ...prev,
      phase: 'playing',
      currentRound: nextRoundNum,
      currentSettlement: pool[nextIdx],
      questionPool: pool,
    }));
  }, [
    state.currentRound,
    state.config,
    state.questionPool,
    filteredSettlements,
  ]);

  const endGame = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'summary' }));
  }, []);

  const resetGame = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: 'menu',
      currentRound: 0,
      currentSettlement: null,
      roundResults: [],
      questionPool: [],
    }));
  }, []);

  return {
    phase: state.phase,
    config: state.config,
    currentRound: state.currentRound,
    currentSettlement: state.currentSettlement,
    roundResults: state.roundResults,
    totalScore,
    totalRounds,
    filteredSettlements,
    updateConfig,
    startGame,
    submitGuess,
    nextRound,
    endGame,
    resetGame,
  };
}
