import { useState, useCallback, useMemo } from 'react';
import type { Settlement, RoundResult, GameConfig, GamePhase } from '../types';
import { defaultMapStyleId } from '../data/mapStyles';
import { regions } from '../data/regions';
import { settlements } from '../data/settlements';
import {
  calculateAttemptScore,
  calculateStreakBonus,
  calculateTimeAttackBonus,
  shuffleArray,
} from '../utils/geo';
import { getSettlementDistrictId } from '../utils/districts';
import { usesApproximateBoundary } from '../utils/settlementBoundaries';

interface SubmitGuessInput {
  wrongGuessIds: string[];
  timeRemainingSeconds?: number;
  timedOut?: boolean;
}

interface GameState {
  phase: GamePhase;
  config: GameConfig;
  currentRound: number;
  currentSettlement: Settlement | null;
  roundResults: RoundResult[];
  questionPool: Settlement[];
  currentStreak: number;
  bestStreak: number;
  survivalMistakes: number;
  masteryDistrictIds: string[];
  masteryDistrictIndex: number;
}

const defaultConfig: GameConfig = {
  selectedRegions: [],
  roundCount: 10,
  mode: 'rounds',
  mapStyle: defaultMapStyleId,
  timeLimitSeconds: 20,
};

const SURVIVAL_MAX_MISTAKES = 3;

export function useGame() {
  const [state, setState] = useState<GameState>({
    phase: 'menu',
    config: defaultConfig,
    currentRound: 0,
    currentSettlement: null,
    roundResults: [],
    questionPool: [],
    currentStreak: 0,
    bestStreak: 0,
    survivalMistakes: 0,
    masteryDistrictIds: [],
    masteryDistrictIndex: 0,
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

  const masteryDistrictIds = useMemo(() => {
    const orderedDistricts =
      state.config.selectedRegions.length > 0
        ? regions.filter((region) => state.config.selectedRegions.includes(region.id))
        : regions;

    return orderedDistricts
      .filter((region) =>
        filteredSettlements.some(
          (settlement) => getSettlementDistrictId(settlement) === region.id
        )
      )
      .map((region) => region.id);
  }, [filteredSettlements, state.config.selectedRegions]);

  const totalScore = useMemo(
    () => state.roundResults.reduce((sum, r) => sum + r.score, 0),
    [state.roundResults]
  );

  const totalRounds = useMemo(() => {
    if (state.config.mode === 'endless' || state.config.mode === 'survival') {
      return Infinity;
    }

    if (state.config.mode === 'mastery') {
      return filteredSettlements.length;
    }

    return Math.min(state.config.roundCount, filteredSettlements.length);
  }, [state.config, filteredSettlements]);

  const currentDistrictId =
    state.config.mode === 'mastery'
      ? state.masteryDistrictIds[state.masteryDistrictIndex] ?? null
      : null;

  const currentDistrictName =
    currentDistrictId !== null
      ? regions.find((region) => region.id === currentDistrictId)?.name_he ?? null
      : null;

  const survivalLivesRemaining = Math.max(
    0,
    SURVIVAL_MAX_MISTAKES - state.survivalMistakes
  );

  const isLastRound = useMemo(() => {
    if (state.config.mode === 'endless' || state.config.mode === 'survival') {
      return false;
    }

    return state.currentRound >= totalRounds;
  }, [state.config.mode, state.currentRound, totalRounds]);

  const updateConfig = useCallback((updates: Partial<GameConfig>) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, ...updates },
    }));
  }, []);

  const startGame = useCallback(() => {
    const activeMasteryDistrictIds = masteryDistrictIds;
    const pool =
      state.config.mode === 'mastery'
        ? shuffleArray(
            filteredSettlements.filter(
              (settlement) =>
                getSettlementDistrictId(settlement) === activeMasteryDistrictIds[0]
            )
          )
        : shuffleArray(filteredSettlements);
    const first = pool[0];

    setState((prev) => ({
      ...prev,
      phase: 'playing',
      currentRound: 1,
      currentSettlement: first,
      roundResults: [],
      questionPool: pool,
      currentStreak: 0,
      bestStreak: 0,
      survivalMistakes: 0,
      masteryDistrictIds: activeMasteryDistrictIds,
      masteryDistrictIndex: 0,
    }));
  }, [filteredSettlements, masteryDistrictIds, state.config.mode]);

  const submitGuess = useCallback(
    ({ wrongGuessIds, timeRemainingSeconds = 0, timedOut = false }: SubmitGuessInput) => {
      setState((prev) => {
        if (!prev.currentSettlement) {
          return prev;
        }

        const attempts = wrongGuessIds.length;
        const baseScore = timedOut ? 0 : calculateAttemptScore(attempts);
        const nextStreak = !timedOut && attempts === 0 ? prev.currentStreak + 1 : 0;
        const timeBonus =
          prev.config.mode === 'time_attack' && !timedOut
            ? calculateTimeAttackBonus(
                timeRemainingSeconds,
                prev.config.timeLimitSeconds
              )
            : 0;
        const streakBonus = !timedOut ? calculateStreakBonus(nextStreak) : 0;
        const score = timedOut ? 0 : baseScore + timeBonus + streakBonus;

        const result: RoundResult = {
          settlement: prev.currentSettlement,
          attempts,
          wrongGuessIds,
          baseScore,
          timeBonus,
          streakBonus,
          score,
          timedOut,
          usedApproximateBoundary: usesApproximateBoundary(prev.currentSettlement),
        };

        return {
          ...prev,
          phase: 'feedback',
          roundResults: [...prev.roundResults, result],
          currentStreak: nextStreak,
          bestStreak: Math.max(prev.bestStreak, nextStreak),
        };
      });
    },
    []
  );

  const registerWrongGuess = useCallback(() => {
    setState((prev) => {
      if (prev.config.mode !== 'survival') {
        return prev;
      }

      const survivalMistakes = prev.survivalMistakes + 1;

      if (survivalMistakes >= SURVIVAL_MAX_MISTAKES) {
        return {
          ...prev,
          survivalMistakes,
          phase: 'summary',
        };
      }

      return {
        ...prev,
        survivalMistakes,
      };
    });
  }, []);

  const nextRound = useCallback(() => {
    setState((prev) => {
      const nextRoundNum = prev.currentRound + 1;

      if (prev.config.mode === 'mastery') {
        const activeDistrictId = prev.masteryDistrictIds[prev.masteryDistrictIndex];
        const answeredInActiveDistrict = prev.roundResults.filter(
          (result) => getSettlementDistrictId(result.settlement) === activeDistrictId
        ).length;
        let pool = prev.questionPool;
        let nextIdx = answeredInActiveDistrict;
        let masteryDistrictIndex = prev.masteryDistrictIndex;

        if (answeredInActiveDistrict >= pool.length) {
          masteryDistrictIndex += 1;
          const nextDistrictId = prev.masteryDistrictIds[masteryDistrictIndex];

          if (!nextDistrictId) {
            return {
              ...prev,
              phase: 'summary',
            };
          }

          pool = shuffleArray(
            filteredSettlements.filter(
              (settlement) => getSettlementDistrictId(settlement) === nextDistrictId
            )
          );
          nextIdx = 0;
        }

        return {
          ...prev,
          phase: 'playing',
          currentRound: nextRoundNum,
          currentSettlement: pool[nextIdx],
          questionPool: pool,
          masteryDistrictIndex,
        };
      }

      const isLoopingMode =
        prev.config.mode === 'endless' || prev.config.mode === 'survival';
      const maxRounds = Math.min(prev.config.roundCount, filteredSettlements.length);

      if (!isLoopingMode && nextRoundNum > maxRounds) {
        return {
          ...prev,
          phase: 'summary',
        };
      }

      let pool = prev.questionPool;
      let nextIdx = nextRoundNum - 1;

      if (nextIdx >= pool.length) {
        pool = shuffleArray(filteredSettlements);
        nextIdx = 0;
      }

      return {
        ...prev,
        phase: 'playing',
        currentRound: nextRoundNum,
        currentSettlement: pool[nextIdx],
        questionPool: pool,
      };
    });
  }, [
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
    currentStreak: state.currentStreak,
    bestStreak: state.bestStreak,
    survivalLivesRemaining,
    currentDistrictId,
    currentDistrictName,
    isLastRound,
    filteredSettlements,
    updateConfig,
    startGame,
    submitGuess,
    registerWrongGuess,
    nextRound,
    endGame,
    resetGame,
  };
}
