import { settlementDistrictById } from '../data/settlementDistrictLookup';
import type { Settlement } from '../types';

export function getSettlementDistrictId(settlement: Settlement): string {
  return settlementDistrictById[settlement.id] ?? settlement.region;
}
