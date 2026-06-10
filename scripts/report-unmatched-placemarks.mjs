import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const outputPath = path.join(projectRoot, 'reports', 'unmatched-placemarks-report.md');

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
const baseDistrictSettlementIds = evalTs(
  path.join(projectRoot, 'src/data/districts.ts'),
  'baseDistrictSettlementIds'
);
const supplementalDistrictSettlementIds = evalTs(
  path.join(projectRoot, 'src/data/districtSupplement.ts'),
  'supplementalDistrictSettlementIds'
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

const districtSettlementIds = Object.fromEntries(
  Object.entries(baseDistrictSettlementIds).map(([districtId, settlementIds]) => [
    districtId,
    [...settlementIds, ...(supplementalDistrictSettlementIds[districtId] ?? [])],
  ])
);

const districtBySettlementId = new Map(
  Object.entries(districtSettlementIds).flatMap(([districtId, ids]) =>
    ids.map((id) => [id, districtId])
  )
);

const normalizedSettlementNames = new Set(
  settlements.flatMap((settlement) =>
    [settlement.name_he, ...(settlement.aliases ?? [])].map(normalizeName)
  )
);
const aliasValues = new Set(Object.values(settlementAliasOverrides).flat());
const addedLocalityNames = new Set(supplementalSettlements.map((settlement) => settlement.name_he));

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
      district: districtBySettlementId.get(settlement.id) ?? settlement.region,
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

function categoryForPlacemark(placemark) {
  const nearest = nearestSettlements(placemark.coordinates);
  const placemarkFlat = normalizeName(placemark.name).replace(/\s+/g, '');
  const nearestFlat = normalizeName(nearest[0]?.name ?? '').replace(/\s+/g, '');

  if (addedLocalityNames.has(placemark.name)) {
    return {
      category: 'added_playable_localities',
      recommendation: 'added',
      rationale: 'Distinct inhabited locality added to the playable dataset with a source-backed polygon.',
    };
  }

  if (aliasValues.has(placemark.name)) {
    return {
      category: 'existing_locality_aliases',
      recommendation: 'keep existing entry',
      rationale: 'Already represented in gameplay; this placemark is an alternate local spelling.',
    };
  }

  if (placemark.name === 'תל חי') {
    return {
      category: 'institutional_or_historic',
      recommendation: 'exclude',
      rationale: 'Historic and institutional site, not a standalone residential locality.',
    };
  }

  if (placemark.name === 'עלי זהב - לשם') {
    return {
      category: 'aggregated_polygons',
      recommendation: 'exclude',
      rationale: 'Aggregate polygon covering multiple or overlapping localities.',
    };
  }

  if (industrialPattern.test(placemark.name)) {
    return {
      category: 'industrial_zones',
      recommendation: 'exclude',
      rationale: 'Industrial or logistics area, not residential gameplay content.',
    };
  }

  if (infrastructurePattern.test(placemark.name)) {
    return {
      category: 'institutional_or_historic',
      recommendation: 'exclude',
      rationale: 'Infrastructure, memorial, military, transport, or institution polygon.',
    };
  }

  if (citySubareaPattern.test(placemark.name)) {
    return {
      category: 'city_subareas',
      recommendation: 'exclude',
      rationale: 'Broad city-sector polygon rather than a distinct locality.',
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
      category: 'existing_locality_aliases',
      recommendation: 'exclude duplicate placemark',
      rationale: 'Near-duplicate of an existing playable locality.',
    };
  }

  if (/,/.test(placemark.name) || / ו/.test(placemark.name)) {
    return {
      category: 'aggregated_polygons',
      recommendation: 'exclude',
      rationale: 'Combined polygon that does not map to one distinct locality.',
    };
  }

  return {
    category: 'curated_freeze_exclusions',
    recommendation: 'exclude',
    rationale: 'Curated freeze: inhabited-looking or ambiguous placemark left outside the playable set after the final inclusion pass.',
  };
}

const grouped = new Map();

for (const placemark of placemarks) {
  if (normalizedSettlementNames.has(placemark.normalizedName)) {
    continue;
  }

  const classification = categoryForPlacemark(placemark);
  const entry = {
    name: placemark.name,
    recommendation: classification.recommendation,
    rationale: classification.rationale,
    nearest: nearestSettlements(placemark.coordinates)
      .map((item) => `${item.name} (${item.district}, ${item.distanceKm}km)`)
      .join(', '),
  };

  if (!grouped.has(classification.category)) {
    grouped.set(classification.category, []);
  }

  grouped.get(classification.category).push(entry);
}

const categoryOrder = [
  ['added_playable_localities', 'Newly Added Playable Localities'],
  ['existing_locality_aliases', 'Existing Localities With Alternate KML Names'],
  ['industrial_zones', 'Industrial Zones'],
  ['institutional_or_historic', 'Institutional / Historic / Infrastructure'],
  ['city_subareas', 'City Subareas / Neighborhood Aggregations'],
  ['aggregated_polygons', 'Aggregated Or Combined Polygons'],
  ['curated_freeze_exclusions', 'Curated Freeze Exclusions'],
];

const totalUnmatched = [...grouped.values()].reduce((sum, entries) => sum + entries.length, 0);

const markdown = [
  '# Unmatched KML Placemark Report',
  '',
  `Generated on ${new Date().toISOString()}.`,
  '',
  `Total currently unmatched placemarks: **${totalUnmatched}**`,
  '',
  'This report contains only definitive classifications: added playable places, duplicate/alias cases, intentional exclusions, and curated freeze exclusions.',
  '',
  '## Summary',
  '',
  ...categoryOrder
    .filter(([category]) => grouped.has(category))
    .map(([category, label]) => `- ${label}: ${grouped.get(category).length}`),
  '',
];

for (const [category, label] of categoryOrder) {
  const entries = grouped.get(category);

  if (!entries?.length) {
    continue;
  }

  markdown.push(`## ${label}`);
  markdown.push('');
  markdown.push('| Placemark | Recommendation | Why | Nearest known places |');
  markdown.push('| --- | --- | --- | --- |');

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'he'))) {
    markdown.push(
      `| ${entry.name} | ${entry.recommendation} | ${entry.rationale} | ${entry.nearest} |`
    );
  }

  markdown.push('');
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, markdown.join('\n'), 'utf8');

console.log(`Wrote unmatched placemark report to ${outputPath}`);
