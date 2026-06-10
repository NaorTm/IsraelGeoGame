import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { districtSettlementIds } from '../data/districts';
import { regions } from '../data/regions';
import { settlements } from '../data/settlements';
import { useSoloGame } from './useGame';

describe('useSoloGame', () => {
  const gameOptions = { settlements, regions };

  it('finishes rounds mode after the configured round count', () => {
    const { result } = renderHook(() => useSoloGame(gameOptions));

    act(() => {
      result.current.updateConfig({ mode: 'rounds', roundCount: 1 });
    });

    act(() => {
      result.current.startGame();
      result.current.submitGuess({ wrongGuessIds: [] });
      result.current.nextRound();
    });

    expect(result.current.phase).toBe('summary');
    expect(result.current.roundResults).toHaveLength(1);
  });

  it('keeps endless mode running past the configured round count', () => {
    const { result } = renderHook(() => useSoloGame(gameOptions));

    act(() => {
      result.current.updateConfig({ mode: 'endless', roundCount: 1 });
    });

    act(() => {
      result.current.startGame();
      result.current.submitGuess({ wrongGuessIds: [] });
      result.current.nextRound();
    });

    expect(result.current.phase).toBe('playing');
    expect(result.current.currentRound).toBe(2);
    expect(result.current.roundResults).toHaveLength(1);
  });

  it('adds time and streak bonuses in time attack mode', () => {
    const { result } = renderHook(() => useSoloGame(gameOptions));

    act(() => {
      result.current.updateConfig({
        mode: 'time_attack',
        timeLimitSeconds: 20,
        roundCount: 2,
      });
    });

    act(() => {
      result.current.startGame();
    });

    act(() => {
      result.current.submitGuess({
        wrongGuessIds: [],
        timeRemainingSeconds: 15,
      });
    });

    expect(result.current.roundResults[0]?.baseScore).toBe(3);
    expect(result.current.roundResults[0]?.timeBonus).toBe(3);
    expect(result.current.roundResults[0]?.streakBonus).toBe(0);

    act(() => {
      result.current.nextRound();
      result.current.submitGuess({
        wrongGuessIds: [],
        timeRemainingSeconds: 10,
      });
    });

    expect(result.current.roundResults[1]?.baseScore).toBe(3);
    expect(result.current.roundResults[1]?.timeBonus).toBe(2);
    expect(result.current.roundResults[1]?.streakBonus).toBe(1);
    expect(result.current.totalScore).toBe(12);
  });

  it('ends survival immediately after the third accumulated miss', () => {
    const { result } = renderHook(() => useSoloGame(gameOptions));

    act(() => {
      result.current.updateConfig({ mode: 'survival' });
    });

    act(() => {
      result.current.startGame();
    });

    expect(result.current.phase).toBe('playing');

    act(() => {
      result.current.registerWrongGuess();
      result.current.registerWrongGuess();
      result.current.registerWrongGuess();
      result.current.submitGuess({
        wrongGuessIds: ['wrong-1', 'wrong-2', 'wrong-3'],
      });
    });

    expect(result.current.phase).toBe('summary');
    expect(result.current.roundResults).toHaveLength(1);
    expect(result.current.survivalLivesRemaining).toBe(0);
    expect(result.current.roundResults[0]?.score).toBe(0);
  });

  it('advances mastery mode through the selected districts in order', () => {
    const selectedRegions = Object.entries(districtSettlementIds)
      .filter(([, settlementIds]) => settlementIds.length > 0)
      .slice(0, 2)
      .map(([districtId]) => districtId);

    const { result } = renderHook(() => useSoloGame(gameOptions));

    act(() => {
      result.current.updateConfig({
        mode: 'mastery',
        selectedRegions,
      });
    });

    act(() => {
      result.current.startGame();
    });

    const initialDistrictId = result.current.currentDistrictId;
    const nextDistrictId = selectedRegions.find(
      (districtId) => districtId !== initialDistrictId
    );

    expect(initialDistrictId).toBeTruthy();
    expect(nextDistrictId).toBeTruthy();
    let safetyCounter = 0;

    while (result.current.currentDistrictId === initialDistrictId && safetyCounter < 200) {
      act(() => {
        result.current.submitGuess({ wrongGuessIds: [] });
      });

      act(() => {
        result.current.nextRound();
      });

      safetyCounter += 1;
    }

    expect(result.current.phase).toBe('playing');
    expect(result.current.currentDistrictId).toBe(nextDistrictId);
    expect(safetyCounter).toBeGreaterThan(0);
  });

  it('keeps all settlements playable when no district filter is selected', () => {
    const { result } = renderHook(() => useSoloGame(gameOptions));

    expect(result.current.filteredSettlements.length).toBeGreaterThan(1230);
  });
});
