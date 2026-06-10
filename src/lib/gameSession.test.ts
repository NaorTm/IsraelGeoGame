import { describe, expect, it } from 'vitest';
import {
  ALL_ISRAEL_DISTRICT_ID,
  MIXED_REGIONS_DISTRICT_ID,
  formatDuration,
  isValidUsername,
  normalizeUsername,
  orderSettlementIdsBySeed,
  resolveSoloDistrictId,
  sortParticipantsByOfficialRules,
} from './gameSession';
import { calculateAttemptScore } from '../utils/geo';
import type { MatchParticipant } from '../types';

function participant(overrides: Partial<MatchParticipant>): MatchParticipant {
  return {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    seat: 1,
    display_name: 'Player',
    username: 'player',
    avatar_url: null,
    ready_at: null,
    finished_at: null,
    final_score: 0,
    total_misses: 0,
    successful_rounds: 0,
    accuracy_pct: 0,
    completion_ms: null,
    result: 'pending',
    current_round_number: 1,
    last_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('gameSession helpers', () => {
  it('resolves special solo district ids', () => {
    expect(resolveSoloDistrictId([])).toBe(ALL_ISRAEL_DISTRICT_ID);
    expect(resolveSoloDistrictId(['גליל עליון'])).toBe('גליל עליון');
    expect(resolveSoloDistrictId(['גליל עליון', 'גולן'])).toBe(MIXED_REGIONS_DISTRICT_ID);
  });

  it('normalizes and validates usernames', () => {
    expect(normalizeUsername('  NaOr_Geo  ')).toBe('naor_geo');
    expect(isValidUsername('naor_geo')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('bad name')).toBe(false);
  });

  it('orders ids deterministically by seed', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const first = orderSettlementIdsBySeed(ids, 'seed-1');
    const second = orderSettlementIdsBySeed(ids, 'seed-1');

    expect(first).toEqual(second);
    expect(first).toHaveLength(ids.length);
    expect(new Set(first)).toEqual(new Set(ids));
    expect(first).not.toEqual(ids);
  });

  it('sorts participants by official PvP tie breakers', () => {
    const ranked = sortParticipantsByOfficialRules([
      participant({ seat: 2, final_score: 24, total_misses: 4, completion_ms: 42000 }),
      participant({ seat: 1, final_score: 24, total_misses: 3, completion_ms: 45000 }),
      participant({ seat: 3 as never, final_score: 23, total_misses: 1, completion_ms: 30000 }),
    ]);

    expect(ranked[0].total_misses).toBe(3);
    expect(ranked[1].total_misses).toBe(4);
    expect(ranked[2].final_score).toBe(23);
  });

  it('formats duration compactly', () => {
    expect(formatDuration(12000)).toBe('12ש׳');
    expect(formatDuration(75000)).toBe('1:15');
    expect(formatDuration(null)).toBe('—');
  });

  it('keeps attempt scoring stable', () => {
    expect(calculateAttemptScore(0)).toBe(3);
    expect(calculateAttemptScore(1)).toBe(2);
    expect(calculateAttemptScore(2)).toBe(1);
    expect(calculateAttemptScore(3)).toBe(0);
  });
});
