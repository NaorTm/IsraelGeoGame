import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

function evalTs(filePath, exportedName) {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/import[\s\S]*?from\s+['"][^'"]+['"];\r?\n/g, '');
  code = code.replace(/const (\w+)\s*:[^=]+=/g, 'const $1 =');
  code = code.replace(/export const (\w+)\s*:[^=]+=/g, 'const $1 =');
  code = code.replace(/export const (\w+)\s*=/g, 'const $1 =');
  code = code.replace(/export async function (\w+)/g, 'async function $1');
  code = code.replace(/export function (\w+)/g, 'function $1');
  code = code.replace(/ as const satisfies [^=;\n]+/g, '');
  code = code.replace(/ as const/g, '');

  if (exportedName === 'baseSettlements') {
    const match = code.match(/const baseSettlements = \[[\s\S]*?\n\];/);
    if (!match) {
      throw new Error(`Could not isolate baseSettlements in ${filePath}`);
    }
    code = match[0];
  }

  if (exportedName === 'baseDistrictSettlementIds') {
    const match = code.match(/const baseDistrictSettlementIds = \{[\s\S]*?\n\};/);
    if (!match) {
      throw new Error(`Could not isolate baseDistrictSettlementIds in ${filePath}`);
    }
    code = match[0];
  }

  code += `\nmodule.exports = ${exportedName};`;
  const module = { exports: null };
  eval(code);
  return module.exports;
}

function normalizeName(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[׳״"'`]/g, '')
    .replace(/[־-]/g, ' ')
    .replace(/[\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePlacemarks(rawKml) {
  return [...rawKml.matchAll(/<Placemark>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Placemark>/g)].map(
    ([, name, coordinates]) => ({
      name,
      normalizedName: normalizeName(name),
      coordinates,
    })
  );
}

function parsePoints(rawCoordinates) {
  return rawCoordinates
    .trim()
    .split(/\s+/)
    .map((entry) => entry.split(',').slice(0, 2).map(Number))
    .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
}

function centroid(rawCoordinates) {
  const points = parsePoints(rawCoordinates);
  const totals = points.reduce(
    (acc, [lng, lat]) => ({
      lng: acc.lng + lng,
      lat: acc.lat + lat,
    }),
    { lng: 0, lat: 0 }
  );

  return {
    lng: totals.lng / points.length,
    lat: totals.lat / points.length,
  };
}

function distanceKm(a, b) {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

const baseSettlements = evalTs(
  path.join(projectRoot, 'src/data/settlements.ts'),
  'baseSettlements'
);
const settlementAliasOverrides = evalTs(
  path.join(projectRoot, 'src/data/settlementSupplement.ts'),
  'settlementAliasOverrides'
);
const supplementalSettlements = evalTs(
  path.join(projectRoot, 'src/data/settlementSupplement.ts'),
  'supplementalSettlements'
);
const settlements = [
  ...baseSettlements.map((settlement) => {
    const aliases = settlementAliasOverrides[settlement.id];
    return aliases?.length
      ? {
          ...settlement,
          aliases: [...new Set([...(settlement.aliases ?? []), ...aliases])],
        }
      : settlement;
  }),
  ...supplementalSettlements,
];
const baseDistrictSettlementIds = evalTs(
  path.join(projectRoot, 'src/data/districts.ts'),
  'baseDistrictSettlementIds'
);
const supplementalDistrictSettlementIds = evalTs(
  path.join(projectRoot, 'src/data/districtSupplement.ts'),
  'supplementalDistrictSettlementIds'
);
const districtSettlementIds = Object.fromEntries(
  Object.entries(baseDistrictSettlementIds).map(([districtId, settlementIds]) => [
    districtId,
    [...settlementIds, ...(supplementalDistrictSettlementIds[districtId] ?? [])],
  ])
);
const approximateSettlementIds = evalTs(
  path.join(projectRoot, 'src/data/boundaries/metadata.ts'),
  'approximateSettlementIds'
);
const sourceBackedSupplementSettlementIds = evalTs(
  path.join(projectRoot, 'src/data/boundaries/sourceBackedSupplementIds.ts'),
  'sourceBackedSupplementSettlementIds'
);

const boundaryDir = path.join(projectRoot, 'src/data/boundaries');
const boundaryFiles = fs
  .readdirSync(boundaryDir)
  .filter(
    (fileName) =>
      fileName.endsWith('.ts') &&
      ![
        'loaders.ts',
        'metadata.ts',
        'kmlSupplement.ts',
        'sourceBackedPlacemarkMap.ts',
        'sourceBackedSupplementIds.ts',
      ].includes(fileName)
  );

const boundaryIds = new Set();
for (const fileName of boundaryFiles) {
  const collection = evalTs(path.join(boundaryDir, fileName), 'settlementBoundaries');
  Object.keys(collection).forEach((settlementId) => boundaryIds.add(settlementId));
}

const rawKml = fs.readFileSync(path.join(projectRoot, 'src/data/israel-alerts-map.kml'), 'utf8');
const placemarks = parsePlacemarks(rawKml);

const settlementsByName = new Map();
for (const settlement of settlements) {
  const names = [settlement.name_he, ...(settlement.aliases ?? [])].map(normalizeName);
  for (const name of names) {
    if (!settlementsByName.has(name)) {
      settlementsByName.set(name, []);
    }
    settlementsByName.get(name).push(settlement);
  }
}

const matchedSettlementIds = new Set();
let matchedPlacemarkCount = 0;
const unmatchedPlacemarkSample = [];

for (const placemark of placemarks) {
  const matches = settlementsByName.get(placemark.normalizedName) ?? [];
  if (matches.length > 0) {
    matchedPlacemarkCount += 1;
    matches.forEach((settlement) => matchedSettlementIds.add(settlement.id));
    continue;
  }

  if (unmatchedPlacemarkSample.length < 50) {
    const center = centroid(placemark.coordinates);
    const nearest = settlements
      .map((settlement) => ({
        id: settlement.id,
        name: settlement.name_he,
        distanceKm: Number(
          distanceKm(center, { lat: settlement.lat, lng: settlement.lng }).toFixed(2)
        ),
      }))
      .sort((left, right) => left.distanceKm - right.distanceKm)
      .slice(0, 3);

    unmatchedPlacemarkSample.push({
      placemark: placemark.name,
      nearest,
    });
  }
}

const allDistrictSettlementIds = new Set(Object.values(districtSettlementIds).flat());

const report = {
  placemarkCount: placemarks.length,
  settlementCount: settlements.length,
  sourceBackedBoundaryCount:
    boundaryIds.size + sourceBackedSupplementSettlementIds.length,
  approximateFallbackCount: approximateSettlementIds.filter(
    (settlementId) => !sourceBackedSupplementSettlementIds.includes(settlementId)
  ).length,
  sourceBackedSupplementSettlementIds,
  unmatchedPlacemarkCount: placemarks.length - matchedPlacemarkCount,
  unmatchedPlacemarkSample,
  settlementsWithoutSplitBoundary: settlements
    .filter((settlement) => !boundaryIds.has(settlement.id))
    .map((settlement) => ({
      id: settlement.id,
      name: settlement.name_he,
      region: settlement.region,
      approximate: approximateSettlementIds.includes(settlement.id),
    })),
  settlementsUsingApproximateFallbackOnly: settlements
    .filter(
      (settlement) =>
        !boundaryIds.has(settlement.id) &&
        !sourceBackedSupplementSettlementIds.includes(settlement.id)
    )
    .map((settlement) => ({
      id: settlement.id,
      name: settlement.name_he,
      region: settlement.region,
    })),
  orphanedSettlementRows: settlements
    .filter((settlement) => !allDistrictSettlementIds.has(settlement.id))
    .map((settlement) => settlement.id),
  districtRowsPointingToUnknownSettlements: [...allDistrictSettlementIds].filter(
    (settlementId) => !settlements.some((settlement) => settlement.id === settlementId)
  ),
};

console.log(JSON.stringify(report, null, 2));
