import type { Geometry } from 'geojson';

export interface Settlement {
  id: string;
  name_he: string;
  name_en: string;
  lat: number;
  lng: number;
  region: string;
  type: SettlementType;
  aliases?: string[];
}

export type SettlementType =
  | 'city'
  | 'local_council'
  | 'regional_council'
  | 'settlement'
  | 'kibbutz'
  | 'moshav'
  | 'town';

export interface Region {
  id: string;
  name_he: string;
  name_en: string;
  description_he: string;
  description_en: string;
}

export type MapStyleId = 'voyager' | 'streets' | 'topo' | 'satellite';

export interface MapStyle {
  id: MapStyleId;
  name_he: string;
  name_en: string;
  tileUrl: string;
  attribution: string;
  subdomains?: string;
  maxZoom?: number;
}

export interface MapViewport {
  center: [number, number];
  zoom: number;
}

export type SettlementBoundaryGeometry = Geometry;

export interface SettlementBoundary {
  centroid: {
    lat: number;
    lng: number;
  };
  geojson: SettlementBoundaryGeometry;
  sourceName: string;
  distanceKm: number;
  approximate?: boolean;
}

export type SettlementBoundaryCollection = Record<string, SettlementBoundary>;

export interface RoundResult {
  settlement: Settlement;
  attempts: number;
  wrongGuessIds: string[];
  baseScore: number;
  timeBonus: number;
  streakBonus: number;
  score: number;
  timedOut: boolean;
  usedApproximateBoundary: boolean;
}

export type GameMode =
  | 'rounds'
  | 'endless'
  | 'time_attack'
  | 'survival'
  | 'mastery';

export interface GameConfig {
  selectedRegions: string[];
  roundCount: number;
  mode: GameMode;
  mapStyle: MapStyleId;
  timeLimitSeconds: number;
}

export type GamePhase = 'menu' | 'playing' | 'feedback' | 'summary';

export interface AppProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  username: string | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export interface DistrictProgress {
  district_id: string;
  games_played: number;
  best_score: number;
  best_streak: number;
  total_rounds: number;
  successful_rounds: number;
  total_misses: number;
  accuracy_pct: number;
  last_played_at: string | null;
}

export interface SessionSummary {
  id: string;
  session_type: 'solo' | 'pvp';
  mode: string;
  district_id: string;
  ruleset_version: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'abandoned';
  question_count: number;
  winner_user_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MatchParticipant {
  id: string;
  user_id: string;
  seat: number;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  ready_at: string | null;
  finished_at: string | null;
  final_score: number;
  total_misses: number;
  successful_rounds: number;
  accuracy_pct: number;
  completion_ms: number | null;
  result: 'pending' | 'win' | 'loss' | 'draw' | 'completed' | 'abandoned';
  current_round_number: number;
  last_seen_at: string;
}

export interface MatchRound {
  round_number: number;
  settlement_id: string;
}

export interface MatchResult {
  winner_user_id: string | null;
  status: SessionSummary['status'];
  participants: MatchParticipant[];
}

export interface ActiveMatch extends SessionSummary {
  participants: MatchParticipant[];
  rounds: MatchRound[];
}

export interface QueueState {
  id: string;
  district_id: string;
  ruleset_version: string;
  status: 'searching' | 'matched' | 'cancelled';
  matched_session_id: string | null;
  created_at: string;
}

export interface SoloRoundRecord {
  round_number: number;
  settlement_id: string;
  attempts: number;
  misses: number;
  score: number;
  timed_out: boolean;
}
