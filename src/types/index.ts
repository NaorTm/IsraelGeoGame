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

export interface RoundResult {
  settlement: Settlement;
  guessLat: number;
  guessLng: number;
  distanceKm: number;
  score: number;
}

export type GameMode = 'rounds' | 'endless';

export interface GameConfig {
  selectedRegions: string[];
  roundCount: number;
  mode: GameMode;
}

export type GamePhase = 'menu' | 'playing' | 'feedback' | 'summary';
