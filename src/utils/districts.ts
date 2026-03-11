import { districtSettlementIds } from '../data/districts';
import type { Settlement } from '../types';

const settlementDistrictIdById = new Map<string, string>(
  Object.entries(districtSettlementIds).flatMap(([districtId, settlementIds]) =>
    settlementIds.map((settlementId) => [settlementId, districtId] as const)
  )
);

export function getSettlementDistrictId(settlement: Settlement): string {
  return settlementDistrictIdById.get(settlement.id) ?? settlement.region;
}