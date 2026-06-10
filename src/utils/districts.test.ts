import { describe, expect, it } from 'vitest';
import { districtSettlementIds, regions } from '../data/districts';
import { settlements } from '../data/settlements';
import { getSettlementDistrictId } from './districts';

describe('district dataset integrity', () => {
  it('maps every settlement to a known district', () => {
    const knownDistricts = new Set(regions.map((region) => region.id));
    const unmapped = settlements.filter(
      (settlement) => !knownDistricts.has(getSettlementDistrictId(settlement))
    );

    expect(unmapped).toEqual([]);
  });

  it('does not reference missing settlement ids in district lists', () => {
    const knownSettlementIds = new Set(settlements.map((settlement) => settlement.id));
    const unknownIds = Object.values(districtSettlementIds)
      .flat()
      .filter((settlementId) => !knownSettlementIds.has(settlementId));

    expect(unknownIds).toEqual([]);
  });
});
