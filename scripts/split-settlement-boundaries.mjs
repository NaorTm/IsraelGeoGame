import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import simplify from '@turf/simplify';

const ROOT = '/workspaces/IsraelGeoGame';
const BOUNDARIES_SOURCE_PATH = path.join(
  ROOT,
  'src/data/settlementBoundaries.ts'
);
const SETTLEMENTS_SOURCE_PATH = path.join(ROOT, 'src/data/settlements.ts');
const OUTPUT_DIR = path.join(ROOT, 'src/data/boundaries');
const MAX_MATCH_DISTANCE_KM = 12;
const SIMPLIFY_TOLERANCE = 0.00045;
const COORDINATE_PRECISION = 5;

function parseSettlements(source) {
  const matches = source.matchAll(
    /\{ id: '([^']+)', name_he: '((?:\\'|[^'])*)', name_en: '((?:\\'|[^'])*)', lat: ([\d.]+), lng: ([\d.]+), region: '([^']+)', type: '([^']+)'(?:, aliases: \[([^\]]+)\])? \}/g
  );

  return Array.from(matches, (match) => {
    const [, id, , , , , region] = match;
    return { id, region };
  });
}

function parseBoundaries(source) {
  const boundariesStart = source.indexOf(
    'export const settlementBoundaries: SettlementBoundaryCollection = '
  );
  const missingStart = source.indexOf('export const missingSettlementBoundaries = ');

  if (boundariesStart === -1 || missingStart === -1) {
    throw new Error('Could not parse settlement boundaries source file.');
  }

  const boundariesJson = source
    .slice(
      boundariesStart +
        'export const settlementBoundaries: SettlementBoundaryCollection = '.length,
      source.indexOf(' as const;', boundariesStart)
    )
    .trim();

  const missingJson = source
    .slice(
      missingStart + 'export const missingSettlementBoundaries = '.length,
      source.indexOf(' as const;', missingStart)
    )
    .trim();

  return {
    boundaries: JSON.parse(boundariesJson),
    missing: JSON.parse(missingJson),
  };
}

function isPolygonalGeometry(geometry) {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

function roundCoordinate(value) {
  return Number(value.toFixed(COORDINATE_PRECISION));
}

function roundCoordinates(value) {
  if (!Array.isArray(value)) {
    return value;
  }

  if (value.length >= 2 && typeof value[0] === 'number') {
    return [roundCoordinate(value[0]), roundCoordinate(value[1])];
  }

  return value.map(roundCoordinates);
}

function simplifyBoundary(boundary) {
  if (!isPolygonalGeometry(boundary.geojson)) {
    return boundary;
  }

  const simplified = simplify(
    {
      type: 'Feature',
      properties: {},
      geometry: boundary.geojson,
    },
    {
      tolerance: SIMPLIFY_TOLERANCE,
      highQuality: false,
      mutate: false,
    }
  );

  return {
    ...boundary,
    geojson: {
      ...simplified.geometry,
      coordinates: roundCoordinates(simplified.geometry.coordinates),
    },
  };
}

async function main() {
  const [boundariesSource, settlementsSource] = await Promise.all([
    readFile(BOUNDARIES_SOURCE_PATH, 'utf8'),
    readFile(SETTLEMENTS_SOURCE_PATH, 'utf8'),
  ]);

  const settlements = parseSettlements(settlementsSource);
  const { boundaries, missing } = parseBoundaries(boundariesSource);
  const settlementToRegion = new Map(
    settlements.map((settlement) => [settlement.id, settlement.region])
  );
  const grouped = new Map();
  const approximateSettlementIds = new Set(missing);
  const boundaryIds = new Set(Object.keys(boundaries));

  for (const settlement of settlements) {
    if (!boundaryIds.has(settlement.id)) {
      approximateSettlementIds.add(settlement.id);
    }
  }

  for (const [settlementId, boundary] of Object.entries(boundaries)) {
    const region = settlementToRegion.get(settlementId);

    if (!region) {
      continue;
    }

    if (!grouped.has(region)) {
      grouped.set(region, {});
    }

    grouped.get(region)[settlementId] = simplifyBoundary(boundary);

    if (
      boundary.distanceKm > MAX_MATCH_DISTANCE_KM ||
      !isPolygonalGeometry(boundary.geojson)
    ) {
      approximateSettlementIds.add(settlementId);
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const regionIds = [...grouped.keys()].sort();
  const loaderLines = regionIds.map(
    (regionId) =>
      `  ${JSON.stringify(regionId)}: () => import('./${regionId}.ts'),`
  );

  await Promise.all(
    regionIds.map(async (regionId) => {
      const filePath = path.join(OUTPUT_DIR, `${regionId}.ts`);
      const content = `import type { SettlementBoundaryCollection } from '../../types';\n\nexport const settlementBoundaries: SettlementBoundaryCollection = ${JSON.stringify(
        grouped.get(regionId),
        null,
        2
      )} as const;\n`;
      await writeFile(filePath, content, 'utf8');
    })
  );

  await writeFile(
    path.join(OUTPUT_DIR, 'loaders.ts'),
    `export const boundaryRegionLoaders = {\n${loaderLines.join(
      '\n'
    )}\n} as const;\n\nexport type BoundaryRegionId = keyof typeof boundaryRegionLoaders;\n`,
    'utf8'
  );

  await writeFile(
    path.join(OUTPUT_DIR, 'metadata.ts'),
    `export const approximateSettlementIds = ${JSON.stringify(
      [...approximateSettlementIds].sort(),
      null,
      2
    )} as const;\n`,
    'utf8'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});