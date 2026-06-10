import { describe, expect, it } from 'vitest';
import { settlements } from '../data/settlements';
import {
  getSettlementBoundary,
  loadBoundaryCollectionsForSettlements,
  shouldUseDistrictChunksForSelection,
  usesApproximateBoundary,
} from './settlementBoundaries';

describe('settlement boundary coverage', () => {
  it(
    'provides a renderable boundary for every playable settlement',
    async () => {
      const boundaryCollection = await loadBoundaryCollectionsForSettlements(
        settlements
      );

      const missing = settlements.filter(
        (settlement) => getSettlementBoundary(settlement, boundaryCollection) === null
      );

      expect(missing).toEqual([]);
    },
    15000
  );

  it(
    'loads source-backed supplemental polygons for the previously missing settlements',
    async () => {
      const boundaryCollection = await loadBoundaryCollectionsForSettlements(
        settlements.filter((settlement) =>
          ['nir_dawid_tel_amal', 'bet_herut', 'givat_shemesh'].includes(settlement.id)
        )
      );

      expect(boundaryCollection.nir_dawid_tel_amal?.approximate).not.toBe(true);
      expect(boundaryCollection.bet_herut?.approximate).not.toBe(true);
      expect(boundaryCollection.givat_shemesh?.approximate).not.toBe(true);
      expect(
        usesApproximateBoundary(
          settlements.find((settlement) => settlement.id === 'bet_herut')!
        )
      ).toBe(false);
      expect(
        usesApproximateBoundary(
          settlements.find((settlement) => settlement.id === 'yoqneam_moshava')!
        )
      ).toBe(true);
    },
    15000
  );

  it('keeps approximate fallback polygons intentionally compact', () => {
    const settlement = settlements.find(
      (item) => item.id === 'yoqneam_moshava'
    );

    expect(settlement).toBeDefined();

    const boundary = getSettlementBoundary(settlement!);

    expect(boundary).not.toBeNull();
    expect(boundary?.approximate).toBe(true);

    const polygon =
      boundary?.geojson.type === 'Polygon'
        ? boundary.geojson.coordinates[0]
        : boundary?.geojson.coordinates[0]?.[0];

    expect(polygon).toBeDefined();

    const maxLatDelta = Math.max(
      ...(polygon ?? []).map((point) => Math.abs(point[1] - settlement!.lat))
    );
    const maxLngDelta = Math.max(
      ...(polygon ?? []).map((point) => Math.abs(point[0] - settlement!.lng))
    );

    expect(maxLatDelta).toBeLessThan(0.02);
    expect(maxLngDelta).toBeLessThan(0.02);
  });

  it('keeps nearby multi-district selections on district chunks', () => {
    expect(
      shouldUseDistrictChunksForSelection([
        'גליל עליון',
        'קו העימות',
        'גולן',
        'קצרין',
        'בקעת בית שאן',
      ])
    ).toBe(true);

    expect(
      shouldUseDistrictChunksForSelection([
        'חיפה',
        'חוף הכרמל',
        'קריות',
        'גליל תחתון',
        'תבור',
        'מנשה',
      ])
    ).toBe(true);
  });

  it('keeps sparse broad selections on district chunks when that is cheaper', () => {
    expect(
      shouldUseDistrictChunksForSelection([
        'אילת',
        'דן',
        'שרון',
        'חיפה',
        'ירושלים',
        'יהודה',
        'גולן',
      ])
    ).toBe(true);
  });

  it('falls back to regional loading for truly broad all-israel selections', () => {
    expect(
      shouldUseDistrictChunksForSelection([
        'אילת',
        'בית שמש',
        'בקעה',
        'בקעת בית שאן',
        'גולן',
        'גליל עליון',
        'גליל תחתון',
        'דן',
        'דרום הנגב',
        'דרום השפלה',
        'השפלה',
        'חיפה',
        'ירושלים',
      ])
    ).toBe(false);
  });
});
