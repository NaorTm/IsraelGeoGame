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

function parsePoints(rawCoordinates) {
  return rawCoordinates
    .trim()
    .split(/\s+/)
    .map((entry) => entry.split(',').slice(0, 2).map(Number))
    .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
}

function toPolygon(points) {
  const coordinates = [...points];
  const [firstLng, firstLat] = coordinates[0];
  const [lastLng, lastLat] = coordinates[coordinates.length - 1];

  if (firstLng !== lastLng || firstLat !== lastLat) {
    coordinates.push([firstLng, firstLat]);
  }

  return coordinates;
}

function calculateCentroid(points) {
  const totals = points.reduce(
    (acc, [lng, lat]) => ({
      lng: acc.lng + lng,
      lat: acc.lat + lat,
    }),
    { lng: 0, lat: 0 }
  );

  return {
    lng: Number((totals.lng / points.length).toFixed(6)),
    lat: Number((totals.lat / points.length).toFixed(6)),
  };
}

function formatCoordinates(points) {
  return points
    .map(([lng, lat]) => `      [${lng}, ${lat}],`)
    .join('\n');
}

const kml = fs.readFileSync(
  path.join(projectRoot, 'src/data/israel-alerts-map.kml'),
  'utf8'
);
const placemarkMap = evalTs(
  path.join(projectRoot, 'src/data/boundaries/sourceBackedPlacemarkMap.ts'),
  'sourceBackedPlacemarkBySettlementId'
);

const blocks = Object.entries(placemarkMap).map(([settlementId, sourceName]) => {
  const escapedName = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = kml.match(
    new RegExp(
      `<Placemark>[\\s\\S]*?<name>${escapedName}</name>[\\s\\S]*?<coordinates>([\\s\\S]*?)<\\/coordinates>[\\s\\S]*?<\\/Placemark>`
    )
  );

  if (!match) {
    throw new Error(`Could not find KML placemark for "${sourceName}" (${settlementId}).`);
  }

  const points = toPolygon(parsePoints(match[1]));
  const centroid = calculateCentroid(points);

  return `  ${settlementId}: {
    centroid: {
      lat: ${centroid.lat},
      lng: ${centroid.lng},
    },
    geojson: {
      type: 'Polygon',
      coordinates: [[
${formatCoordinates(points)}
      ]],
    },
    sourceName: ${JSON.stringify(sourceName)},
    distanceKm: 0,
  },`;
});

const output = `import type { SettlementBoundaryCollection } from '../../types';
import { sourceBackedSupplementSettlementIds } from './sourceBackedSupplementIds';

const kmlSupplementBoundaries: SettlementBoundaryCollection = {
${blocks.join('\n')}
};

export { sourceBackedSupplementSettlementIds };

export async function loadKmlSupplementBoundaries(): Promise<SettlementBoundaryCollection> {
  return kmlSupplementBoundaries;
}
`;

fs.writeFileSync(
  path.join(projectRoot, 'src/data/boundaries/kmlSupplement.ts'),
  output,
  'utf8'
);

console.log(`Generated source-backed supplement for ${Object.keys(placemarkMap).length} placemarks.`);
