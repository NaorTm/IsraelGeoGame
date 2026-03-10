import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { approximateSettlementIds } from '../data/boundaries/metadata';
import {
  boundaryRegionLoaders,
  type BoundaryRegionId,
} from '../data/boundaries/loaders';
import type {
  Settlement,
  SettlementBoundaryCollection,
  SettlementBoundary,
  SettlementBoundaryGeometry,
} from '../types';

const MAX_MATCH_DISTANCE_KM = 12;

const FALLBACK_RADIUS_KM: Record<Settlement['type'], number> = {
  city: 4.2,
  local_council: 2.6,
  regional_council: 5,
  settlement: 2,
  kibbutz: 1.3,
  moshav: 1.3,
  town: 2.8,
};

interface SettlementFeatureProperties {
  settlementId: string;
  approximate: boolean;
}

export type SettlementMapFeature = Feature<
  Polygon | MultiPolygon,
  SettlementFeatureProperties
>;

type RenderableSettlementBoundary = Omit<SettlementBoundary, 'geojson'> & {
  geojson: Polygon | MultiPolygon;
};

const approximateSettlementIdSet = new Set<string>(approximateSettlementIds);
const loadedRegionBoundaries = new Map<BoundaryRegionId, SettlementBoundaryCollection>();
const regionBoundaryPromises = new Map<
  BoundaryRegionId,
  Promise<SettlementBoundaryCollection>
>();

function createApproximatePolygon(
  lat: number,
  lng: number,
  radiusKm: number
): Polygon {
  const points = 28;
  const latRadius = radiusKm / 111;
  const lngRadius = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];

  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    ring.push([
      Number((lng + Math.cos(angle) * lngRadius).toFixed(5)),
      Number((lat + Math.sin(angle) * latRadius).toFixed(5)),
    ]);
  }

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

function isPolygonalGeometry(
  geometry: SettlementBoundaryGeometry
): geometry is Polygon | MultiPolygon {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

function isBoundaryRegionId(regionId: string): regionId is BoundaryRegionId {
  return regionId in boundaryRegionLoaders;
}

function createRenderableBoundary(
  settlement: Settlement,
  boundary?: SettlementBoundary
): RenderableSettlementBoundary {
  if (
    boundary &&
    boundary.distanceKm <= MAX_MATCH_DISTANCE_KM &&
    isPolygonalGeometry(boundary.geojson)
  ) {
    return {
      ...boundary,
      geojson: boundary.geojson,
    };
  }

  return {
    centroid: {
      lat: settlement.lat,
      lng: settlement.lng,
    },
    geojson: createApproximatePolygon(
      settlement.lat,
      settlement.lng,
      FALLBACK_RADIUS_KM[settlement.type] ?? 2.5
    ),
    sourceName: 'Approximate fallback area',
    distanceKm: boundary?.distanceKm ?? 0,
    approximate: true,
  };
}

async function loadRegionBoundaries(
  regionId: BoundaryRegionId
): Promise<SettlementBoundaryCollection> {
  const cachedBoundaries = loadedRegionBoundaries.get(regionId);

  if (cachedBoundaries) {
    return cachedBoundaries;
  }

  const existingPromise = regionBoundaryPromises.get(regionId);

  if (existingPromise) {
    return existingPromise;
  }

  const promise = boundaryRegionLoaders[regionId]().then((module) => {
    loadedRegionBoundaries.set(regionId, module.settlementBoundaries);
    regionBoundaryPromises.delete(regionId);
    return module.settlementBoundaries;
  });

  regionBoundaryPromises.set(regionId, promise);
  return promise;
}

export async function loadBoundaryCollectionsForSettlements(
  settlements: Settlement[]
): Promise<SettlementBoundaryCollection> {
  const regionIds = [...new Set(settlements.map((settlement) => settlement.region))]
    .filter(isBoundaryRegionId);

  const regionCollections = await Promise.all(
    regionIds.map((regionId) => loadRegionBoundaries(regionId))
  );

  return regionCollections.reduce<SettlementBoundaryCollection>((acc, collection) => {
    Object.assign(acc, collection);
    return acc;
  }, {});
}

export function hasLoadedBoundariesForSettlements(settlements: Settlement[]): boolean {
  return [...new Set(settlements.map((settlement) => settlement.region))]
    .filter(isBoundaryRegionId)
    .every((regionId) => loadedRegionBoundaries.has(regionId));
}

export function getSettlementBoundary(
  settlement: Settlement,
  boundaryCollection?: SettlementBoundaryCollection
): RenderableSettlementBoundary {
  return createRenderableBoundary(
    settlement,
    boundaryCollection?.[settlement.id]
  );
}

export function getSettlementFeature(
  settlement: Settlement,
  boundaryCollection?: SettlementBoundaryCollection
): SettlementMapFeature {
  const boundary = getSettlementBoundary(settlement, boundaryCollection);

  return {
    type: 'Feature',
    properties: {
      settlementId: settlement.id,
      approximate: boundary.approximate === true,
    },
    geometry: boundary.geojson,
  };
}

export function usesApproximateBoundary(settlement: Settlement): boolean {
  return approximateSettlementIdSet.has(settlement.id);
}