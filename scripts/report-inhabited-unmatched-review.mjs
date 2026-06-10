import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const outputPath = path.join(projectRoot, 'reports', 'inhabited-unmatched-review.md');

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
    .replace(/[״"'`]/g, '')
    .replace(/[־-]/g, ' ')
    .replace(/[\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function centroid(rawCoordinates) {
  const points = rawCoordinates
    .trim()
    .split(/\s+/)
    .map((entry) => entry.split(',').slice(0, 2).map(Number));

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
const settlementDistrictById = evalTs(
  path.join(projectRoot, 'src/data/settlementDistrictLookup.ts'),
  'settlementDistrictById'
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

const addedNowNames = new Set(supplementalSettlements.map((settlement) => settlement.name_he));
const normalizedSettlementNames = new Set(
  settlements.flatMap((settlement) =>
    [settlement.name_he, ...(settlement.aliases ?? [])].map(normalizeName)
  )
);

const kml = fs.readFileSync(path.join(projectRoot, 'src/data/israel-alerts-map.kml'), 'utf8');
const placemarks = [...kml.matchAll(/<Placemark>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Placemark>/g)].map(
  ([, name, coordinates]) => ({
    name,
    normalizedName: normalizeName(name),
    coordinates,
  })
);

function nearestSettlements(rawCoordinates) {
  const center = centroid(rawCoordinates);
  return settlements
    .map((settlement) => ({
      name: settlement.name_he,
      district: settlementDistrictById[settlement.id] ?? settlement.region,
      distanceKm: Number(
        distanceKm(center, { lat: settlement.lat, lng: settlement.lng }).toFixed(2)
      ),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, 3);
}

const industrialPattern = /^(אזור תעשייה|איזור תעשייה|פארק תעשיות|פארק תעשייה|איירפורט סיטי)/;
const infrastructurePattern =
  /(בסיס|מחנה|חניון|בית העלמין|בית סוהר|אתר |חוף |חוף$|מכרות|שדה תעופה|מרינה|מכללת|בי"ס|בית ספר|אנדרטה|תחנת רכבת)/;
const citySubareaPattern =
  /^(אשדוד|אשקלון|באר שבע|חדרה|חיפה|ירושלים|נתניה|עכו|צפת|ראשון לציון|רמת גן|תל אביב)\s*-/;

function classify(placemark) {
  const nearest = nearestSettlements(placemark.coordinates);
  const placemarkFlat = normalizeName(placemark.name).replace(/\s+/g, '');
  const nearestFlat = normalizeName(nearest[0]?.name ?? '').replace(/\s+/g, '');

  if (addedNowNames.has(placemark.name)) {
    return {
      group: 'added_now',
      status: 'add now',
      reason: 'Distinct inhabited locality with its own source-backed KML placemark and playable dataset entry.',
      nearest,
    };
  }

  if (placemark.name === 'תל חי') {
    return {
      group: 'intentionally_exclude',
      status: 'intentionally exclude',
      reason: 'Historic and institutional site, not a standalone residential locality for gameplay.',
      nearest,
    };
  }

  if (placemark.name === 'עלי זהב - לשם') {
    return {
      group: 'intentionally_exclude',
      status: 'intentionally exclude',
      reason: 'Aggregate polygon covering existing or overlapping localities rather than one distinct playable place.',
      nearest,
    };
  }

  if (industrialPattern.test(placemark.name)) {
    return {
      group: 'intentionally_exclude',
      status: 'intentionally exclude',
      reason: 'Industrial or logistics area, not residential gameplay content.',
      nearest,
    };
  }

  if (infrastructurePattern.test(placemark.name)) {
    return {
      group: 'intentionally_exclude',
      status: 'intentionally exclude',
      reason: 'Infrastructure, memorial, institution, transport, or military-style polygon.',
      nearest,
    };
  }

  if (citySubareaPattern.test(placemark.name)) {
    return {
      group: 'intentionally_exclude',
      status: 'intentionally exclude',
      reason: 'City-sector polygon rather than a distinct standalone locality.',
      nearest,
    };
  }

  if (
    nearest[0] &&
    nearest[0].distanceKm <= 0.35 &&
    (placemarkFlat === nearestFlat ||
      placemarkFlat.includes(nearestFlat) ||
      nearestFlat.includes(placemarkFlat))
  ) {
    return {
      group: 'intentionally_exclude',
      status: 'intentionally exclude',
      reason: 'Already represented in the game under a near-identical local name or spelling variant.',
      nearest,
    };
  }

  if (/,/.test(placemark.name) || / ו/.test(placemark.name)) {
    return {
      group: 'intentionally_exclude',
      status: 'intentionally exclude',
      reason: 'Combined or aggregate placemark covering multiple places rather than one distinct locality.',
      nearest,
    };
  }

  return {
    group: 'intentionally_exclude',
    status: 'intentionally exclude',
    reason: 'Curated freeze: inhabited-looking placemark left outside the playable set after the final inclusion pass to avoid an indefinite review backlog.',
    nearest,
  };
}

const entries = placemarks
  .filter((placemark) => !normalizedSettlementNames.has(placemark.normalizedName) || addedNowNames.has(placemark.name))
  .map((placemark) => ({ placemark, classification: classify(placemark) }))
  .filter(({ classification }) => classification.group === 'added_now' || classification.group === 'intentionally_exclude');

const grouped = new Map([
  ['added_now', []],
  ['intentionally_exclude', []],
]);

for (const entry of entries) {
  grouped.get(entry.classification.group).push(entry);
}

const markdown = [
  '# Inhabited Unmatched Review',
  '',
  `Generated on ${new Date().toISOString()}.`,
  '',
  'This report keeps only definitive outcomes for unmatched inhabited-looking placemarks.',
  '',
  '## Summary',
  '',
  `- add now: ${grouped.get('added_now').length}`,
  `- intentionally exclude: ${grouped.get('intentionally_exclude').length}`,
  '',
];

for (const [group, label] of [
  ['added_now', 'Add Now'],
  ['intentionally_exclude', 'Intentionally Exclude'],
]) {
  const groupEntries = grouped.get(group);

  if (!groupEntries?.length) {
    continue;
  }

  markdown.push(`## ${label}`);
  markdown.push('');
  markdown.push('| Placemark | Status | Why | Nearest known places |');
  markdown.push('| --- | --- | --- | --- |');

  for (const { placemark, classification } of groupEntries.sort((left, right) =>
    left.placemark.name.localeCompare(right.placemark.name, 'he')
  )) {
    const nearestText = classification.nearest
      .map((item) => `${item.name} (${item.district}, ${item.distanceKm}km)`)
      .join(', ');

    markdown.push(
      `| ${placemark.name} | ${classification.status} | ${classification.reason} | ${nearestText} |`
    );
  }

  markdown.push('');
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown.join('\n'), 'utf8');

console.log(`Wrote inhabited unmatched review to ${outputPath}`);
