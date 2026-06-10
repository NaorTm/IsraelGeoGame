import { regions } from '../data/regions';
import type {
  RoundResult,
  SoloRoundRecord,
  DistrictProgress,
  MatchParticipant,
} from '../types';

export const SOLO_RULESET_VERSION = 'solo_client_v1';
export const PVP_RULESET_VERSION = 'pvp_fixed_10_v1';
export const ALL_ISRAEL_DISTRICT_ID = 'all_israel';
export const MIXED_REGIONS_DISTRICT_ID = 'mixed_regions';

export function resolveSoloDistrictId(selectedRegions: string[]): string {
  if (selectedRegions.length === 0) {
    return ALL_ISRAEL_DISTRICT_ID;
  }

  if (selectedRegions.length === 1) {
    return selectedRegions[0];
  }

  return MIXED_REGIONS_DISTRICT_ID;
}

export function getDistrictDisplayName(districtId: string): string {
  if (districtId === ALL_ISRAEL_DISTRICT_ID) {
    return 'כל ישראל';
  }

  if (districtId === MIXED_REGIONS_DISTRICT_ID) {
    return 'מספר מחוזות';
  }

  return regions.find((region) => region.id === districtId)?.name_he ?? districtId;
}

export function roundResultsToSoloRecords(results: RoundResult[]): SoloRoundRecord[] {
  return results.map((result, index) => ({
    round_number: index + 1,
    settlement_id: result.settlement.id,
    attempts: result.attempts,
    misses: result.attempts,
    score: result.score,
    timed_out: result.timedOut,
  }));
}

export function getProgressHeadline(progress?: DistrictProgress | null): string {
  if (!progress) {
    return 'עדיין אין התקדמות שמורה למחוז הזה.';
  }

  return `שיחקת ${progress.games_played} פעמים, השיא שלך הוא ${progress.best_score} נקודות והדיוק ${Math.round(progress.accuracy_pct)}%.`;
}

export function getParticipantLabel(participant: MatchParticipant): string {
  return participant.username || participant.display_name || 'שחקן';
}

export function formatDuration(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) {
    return '—';
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}ש׳`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value));
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2147483647;
  }

  return hash;
}

export function orderSettlementIdsBySeed(settlementIds: string[], seed: string): string[] {
  return [...settlementIds].sort((left, right) => {
    const leftHash = hashString(`${seed}:${left}:${hashString(`${left}:${seed}`)}`);
    const rightHash = hashString(`${seed}:${right}:${hashString(`${right}:${seed}`)}`);

    if (leftHash === rightHash) {
      return left.localeCompare(right);
    }

    return leftHash - rightHash;
  });
}

export function sortParticipantsByOfficialRules(participants: MatchParticipant[]): MatchParticipant[] {
  return [...participants].sort((left, right) => {
    if (left.final_score !== right.final_score) {
      return right.final_score - left.final_score;
    }

    if (left.total_misses !== right.total_misses) {
      return left.total_misses - right.total_misses;
    }

    if ((left.completion_ms ?? Number.MAX_SAFE_INTEGER) !== (right.completion_ms ?? Number.MAX_SAFE_INTEGER)) {
      return (left.completion_ms ?? Number.MAX_SAFE_INTEGER) - (right.completion_ms ?? Number.MAX_SAFE_INTEGER);
    }

    return left.seat - right.seat;
  });
}
