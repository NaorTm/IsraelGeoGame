import { districtSourceRegions } from '../data/districtSourceRegions';
import { regions } from '../data/regions';
import {
  settlementRegionLoaders,
  type SettlementRegionId,
} from '../data/settlementCatalogRegions/loaders';
import { settlementDistrictById } from '../data/settlementDistrictLookup';
import type { Region, Settlement } from '../types';

interface SettlementCatalog {
  settlements: Settlement[];
  regions: Region[];
}

interface LoadSettlementCatalogOptions {
  districtIds?: string[] | null;
}

const ALL_REGION_IDS = Object.keys(settlementRegionLoaders) as SettlementRegionId[];
const regionCatalogPromises = new Map<SettlementRegionId, Promise<Settlement[]>>();

function normalizeDistrictIds(districtIds?: string[] | null): string[] {
  if (!districtIds?.length) {
    return [];
  }

  return [...new Set(districtIds.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'he')
  );
}

function getRegionIdsForDistricts(districtIds: string[]): SettlementRegionId[] {
  if (districtIds.length === 0) {
    return ALL_REGION_IDS;
  }

  const regionIds = new Set<SettlementRegionId>();

  for (const districtId of districtIds) {
    const mappedRegions = districtSourceRegions[districtId];

    if (!mappedRegions?.length) {
      return ALL_REGION_IDS;
    }

    for (const regionId of mappedRegions) {
      regionIds.add(regionId);
    }
  }

  return [...regionIds].sort();
}

async function loadSettlementsForRegion(regionId: SettlementRegionId): Promise<Settlement[]> {
  const existingPromise = regionCatalogPromises.get(regionId);

  if (existingPromise) {
    return existingPromise;
  }

  const promise = settlementRegionLoaders[regionId]().then(
    (module) => module.settlements
  );

  regionCatalogPromises.set(regionId, promise);
  return promise;
}

export async function loadSettlementCatalog(
  options: LoadSettlementCatalogOptions = {}
): Promise<SettlementCatalog> {
  const districtIds = normalizeDistrictIds(options.districtIds);
  const regionIds = getRegionIdsForDistricts(districtIds);
  const regionCatalogs = await Promise.all(
    regionIds.map((regionId) => loadSettlementsForRegion(regionId))
  );

  const settlements = regionCatalogs.flat();

  if (districtIds.length === 0) {
    return { settlements, regions };
  }

  const allowedDistrictIds = new Set(districtIds);

  return {
    settlements: settlements.filter((settlement) =>
      allowedDistrictIds.has(settlementDistrictById[settlement.id] ?? settlement.region)
    ),
    regions,
  };
}

export async function preloadSettlementCatalog(
  options: LoadSettlementCatalogOptions = {}
): Promise<void> {
  await loadSettlementCatalog(options);
}
