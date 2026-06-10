import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { approximateSettlementIds } from '../data/boundaries/metadata';
import {
  boundaryDistrictLoaders,
  type BoundaryDistrictId,
} from '../data/boundaries/byDistrict/loaders';
import { loadKmlSupplementBoundaries } from '../data/boundaries/kmlSupplement';
import {
  boundaryDistrictEstimatedBytes,
  boundaryRegionEstimatedBytes,
  kmlSupplementEstimatedBytes,
} from '../data/boundaries/loadMetadata';
import { sourceBackedSupplementSettlementIds } from '../data/boundaries/sourceBackedSupplementIds';
import {
  boundaryRegionLoaders,
  type BoundaryRegionId,
} from '../data/boundaries/loaders';
import { districtSourceRegions } from '../data/districtSourceRegions';
import { settlementDistrictById } from '../data/settlementDistrictLookup';
import type {
  Settlement,
  SettlementBoundaryCollection,
  SettlementBoundary,
  SettlementBoundaryGeometry,
} from '../types';

const MAX_MATCH_DISTANCE_KM = 12;
const DISTRICT_CHUNK_THRESHOLD = 4;
const DISTRICT_CHUNK_MAX_COUNT = 12;
const DISTRICT_CHUNK_IMPORT_OVERHEAD_BYTES = 2_000;

const FALLBACK_RADIUS_KM: Record<Settlement['type'], number> = {
  city: 1.8,
  local_council: 1.1,
  regional_council: 2.1,
  settlement: 0.85,
  kibbutz: 0.7,
  moshav: 0.7,
  town: 1.15,
};

const APPROXIMATE_RADIUS_OVERRIDES_KM: Partial<Record<string, number>> = {
  yoqneam_moshava: 0.6,
  newe_avot: 0.42,
  qiryat_shelomo: 0.42,
  abu_abdun: 0.48,
  asam: 0.52,
  afeinish: 0.46,
  huzayyel: 0.46,
  kochlea: 0.58,
  masudin_al_azazme: 0.6,
  uqbi_banu_uqba: 0.5,
  atawne: 0.54,
  ruah_midbar: 0.62,
  tarabin_as_sani: 0.66,
};

interface SettlementFeatureProperties {
  settlementId: string;
  nameHe: string;
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
const kmlSupplementSettlementIdSet = new Set<string>(
  sourceBackedSupplementSettlementIds
);
const kmlSupplementDistrictIdSet = new Set<string>(
  sourceBackedSupplementSettlementIds
    .map((settlementId) => settlementDistrictById[settlementId])
    .filter((districtId): districtId is string => Boolean(districtId))
);
const loadedDistrictBoundaries = new Map<string, SettlementBoundaryCollection>();
const districtBoundaryPromises = new Map<
  string,
  Promise<SettlementBoundaryCollection>
>();
const loadedRegionBoundaries = new Map<BoundaryRegionId, SettlementBoundaryCollection>();
const regionBoundaryPromises = new Map<
  BoundaryRegionId,
  Promise<SettlementBoundaryCollection>
>();
let cachedKmlSupplementBoundaries: SettlementBoundaryCollection | null = null;
let kmlSupplementPromise: Promise<SettlementBoundaryCollection> | null = null;

function createApproximatePolygon(
  lat: number,
  lng: number,
  radiusKm: number
): Polygon {
  const points = 14;
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

function isBoundaryDistrictId(districtId: string): districtId is BoundaryDistrictId {
  return districtId in boundaryDistrictLoaders;
}

function getSettlementDistrictIds(settlements: Settlement[]): string[] {
  return [...new Set(
    settlements
      .map((settlement) => settlementDistrictById[settlement.id])
      .filter((districtId): districtId is string => Boolean(districtId))
  )];
}

function getSourceRegionIdsForDistricts(
  districtIds: BoundaryDistrictId[]
): BoundaryRegionId[] {
  const sourceRegionIds = new Set<BoundaryRegionId>();

  for (const districtId of districtIds) {
    const mappedRegions = districtSourceRegions[districtId] ?? [];

    for (const regionId of mappedRegions) {
      if (isBoundaryRegionId(regionId)) {
        sourceRegionIds.add(regionId);
      }
    }
  }

  return [...sourceRegionIds];
}

function estimateDistrictBoundaryLoadBytes(districtIds: BoundaryDistrictId[]): number {
  return districtIds.reduce(
    (totalBytes, districtId) =>
      totalBytes +
      (boundaryDistrictEstimatedBytes[districtId] ?? 0) +
      DISTRICT_CHUNK_IMPORT_OVERHEAD_BYTES,
    0
  );
}

function estimateRegionBoundaryLoadBytes(
  regionIds: BoundaryRegionId[],
  districtIds: BoundaryDistrictId[]
): number {
  const regionBytes = regionIds.reduce(
    (totalBytes, regionId) => totalBytes + (boundaryRegionEstimatedBytes[regionId] ?? 0),
    0
  );
  const needsKmlSupplement = districtIds.some((districtId) =>
    kmlSupplementDistrictIdSet.has(districtId)
  );

  return regionBytes + (needsKmlSupplement ? kmlSupplementEstimatedBytes : 0);
}

export function shouldUseDistrictChunksForSelection(
  districtIds: string[]
): districtIds is BoundaryDistrictId[] {
  if (
    districtIds.length === 0 ||
    !districtIds.every(isBoundaryDistrictId)
  ) {
    return false;
  }

  if (districtIds.length <= DISTRICT_CHUNK_THRESHOLD) {
    return true;
  }

  if (districtIds.length > DISTRICT_CHUNK_MAX_COUNT) {
    return false;
  }

  const sourceRegionIds = getSourceRegionIdsForDistricts(districtIds);

  if (sourceRegionIds.length === 0) {
    return false;
  }

  const estimatedDistrictBytes = estimateDistrictBoundaryLoadBytes(districtIds);
  const estimatedRegionBytes = estimateRegionBoundaryLoadBytes(
    sourceRegionIds,
    districtIds
  );

  return estimatedDistrictBytes <= estimatedRegionBytes;
}

function createRenderableBoundary(
  settlement: Settlement,
  boundary?: SettlementBoundary
): RenderableSettlementBoundary | null {
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

  if (!approximateSettlementIdSet.has(settlement.id)) {
    return null;
  }

  return {
    centroid: {
      lat: settlement.lat,
      lng: settlement.lng,
    },
    geojson: createApproximatePolygon(
      settlement.lat,
      settlement.lng,
      APPROXIMATE_RADIUS_OVERRIDES_KM[settlement.id] ??
        FALLBACK_RADIUS_KM[settlement.type] ??
        2.5
    ),
    sourceName: 'Approximate fallback area',
    distanceKm: boundary?.distanceKm ?? 0,
    approximate: true,
  };
}

async function loadDistrictBoundaries(
  districtId: BoundaryDistrictId
): Promise<SettlementBoundaryCollection> {
  const cachedBoundaries = loadedDistrictBoundaries.get(districtId);

  if (cachedBoundaries) {
    return cachedBoundaries;
  }

  const existingPromise = districtBoundaryPromises.get(districtId);

  if (existingPromise) {
    return existingPromise;
  }

  const promise = boundaryDistrictLoaders[districtId]().then((module) => {
    loadedDistrictBoundaries.set(districtId, module.settlementBoundaries);
    districtBoundaryPromises.delete(districtId);
    return module.settlementBoundaries;
  });

  districtBoundaryPromises.set(districtId, promise);
  return promise;
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

async function loadKmlSupplementBoundaryCollection() {
  if (cachedKmlSupplementBoundaries) {
    return cachedKmlSupplementBoundaries;
  }

  if (kmlSupplementPromise) {
    return kmlSupplementPromise;
  }

  kmlSupplementPromise = loadKmlSupplementBoundaries().then((collection) => {
    cachedKmlSupplementBoundaries = collection;
    kmlSupplementPromise = null;
    return collection;
  });

  return kmlSupplementPromise;
}

export async function loadBoundaryCollectionsForSettlements(
  settlements: Settlement[]
): Promise<SettlementBoundaryCollection> {
  const districtIds = getSettlementDistrictIds(settlements);

  if (shouldUseDistrictChunksForSelection(districtIds)) {
    const districtCollections = await Promise.all(
      districtIds.map((districtId) => loadDistrictBoundaries(districtId))
    );

    return districtCollections.reduce<SettlementBoundaryCollection>((acc, collection) => {
      Object.assign(acc, collection);
      return acc;
    }, {});
  }

  const regionIds = [...new Set(settlements.map((settlement) => settlement.region))]
    .filter(isBoundaryRegionId);
  const needsKmlSupplement = settlements.some((settlement) =>
    kmlSupplementSettlementIdSet.has(settlement.id)
  );

  const regionCollections = await Promise.all([
    ...regionIds.map((regionId) => loadRegionBoundaries(regionId)),
    ...(needsKmlSupplement ? [loadKmlSupplementBoundaryCollection()] : []),
  ]);

  return regionCollections.reduce<SettlementBoundaryCollection>((acc, collection) => {
    Object.assign(acc, collection);
    return acc;
  }, {});
}

export async function preloadBoundaryCollectionsForDistrictIds(
  districtIds?: string[] | null
): Promise<void> {
  const normalizedDistrictIds = [...new Set((districtIds ?? []).filter(Boolean))];

  if (!shouldUseDistrictChunksForSelection(normalizedDistrictIds)) {
    return;
  }

  await Promise.all(
    normalizedDistrictIds.map((districtId) => loadDistrictBoundaries(districtId))
  );
}

export function hasLoadedBoundariesForSettlements(settlements: Settlement[]): boolean {
  const districtIds = getSettlementDistrictIds(settlements);

  if (shouldUseDistrictChunksForSelection(districtIds)) {
    return districtIds.every((districtId) => loadedDistrictBoundaries.has(districtId));
  }

  const regionBoundariesReady = [...new Set(settlements.map((settlement) => settlement.region))]
    .filter(isBoundaryRegionId)
    .every((regionId) => loadedRegionBoundaries.has(regionId));

  if (!regionBoundariesReady) {
    return false;
  }

  const needsKmlSupplement = settlements.some((settlement) =>
    kmlSupplementSettlementIdSet.has(settlement.id)
  );

  return !needsKmlSupplement || cachedKmlSupplementBoundaries !== null;
}

export function getSettlementBoundary(
  settlement: Settlement,
  boundaryCollection?: SettlementBoundaryCollection
): RenderableSettlementBoundary | null {
  return createRenderableBoundary(settlement, boundaryCollection?.[settlement.id]);
}

export function getSettlementFeature(
  settlement: Settlement,
  boundaryCollection?: SettlementBoundaryCollection
): SettlementMapFeature | null {
  const boundary = getSettlementBoundary(settlement, boundaryCollection);

  if (!boundary) {
    return null;
  }

  return {
    type: 'Feature',
    properties: {
      settlementId: settlement.id,
      nameHe: settlement.name_he,
      approximate: boundary.approximate === true,
    },
    geometry: boundary.geojson,
  };
}

export function usesApproximateBoundary(settlement: Settlement): boolean {
  return (
    approximateSettlementIdSet.has(settlement.id) &&
    !kmlSupplementSettlementIdSet.has(settlement.id)
  );
}
