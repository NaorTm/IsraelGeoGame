import { approximateSettlementIds } from '../data/boundaries/metadata';
import { sourceBackedSupplementSettlementIds } from '../data/boundaries/sourceBackedSupplementIds';
import { settlementDistrictById } from '../data/settlementDistrictLookup';

const sourceBackedSupplementSettlementIdSet = new Set<string>(
  sourceBackedSupplementSettlementIds
);

export const PLAYABLE_SETTLEMENT_COUNT = Object.keys(settlementDistrictById).length;
export const APPROXIMATE_SETTLEMENT_COUNT = approximateSettlementIds.filter(
  (settlementId) => !sourceBackedSupplementSettlementIdSet.has(settlementId)
).length;
export const SOURCE_BACKED_SETTLEMENT_COUNT =
  PLAYABLE_SETTLEMENT_COUNT - APPROXIMATE_SETTLEMENT_COUNT;
export const SOURCE_BACKED_SUPPLEMENT_IDS = sourceBackedSupplementSettlementIds;

export const SETTLEMENT_COUNT_BY_DISTRICT = Object.entries(settlementDistrictById).reduce<
  Record<string, number>
>((counts, [, districtId]) => {
  counts[districtId] = (counts[districtId] ?? 0) + 1;
  return counts;
}, {});

export function countSettlementsForDistrictSelection(districtIds: string[]): number {
  if (districtIds.length === 0) {
    return PLAYABLE_SETTLEMENT_COUNT;
  }

  return districtIds.reduce(
    (sum, districtId) => sum + (SETTLEMENT_COUNT_BY_DISTRICT[districtId] ?? 0),
    0
  );
}
