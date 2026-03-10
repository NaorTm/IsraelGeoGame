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
  score: number;
  usedApproximateBoundary: boolean;
}

export type GameMode = 'rounds' | 'endless';

export interface GameConfig {
  selectedRegions: string[];
  roundCount: number;
  mode: GameMode;
}

export type GamePhase = 'menu' | 'playing' | 'feedback' | 'summary';
