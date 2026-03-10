import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = '/workspaces/IsraelGeoGame';
const SOURCE_PATH = path.join(ROOT, 'src/data/settlements.ts');
const OUTPUT_PATH = path.join(ROOT, 'src/data/settlementBoundaries.ts');
const USER_AGENT = 'IsraelGeoGameBoundaryBuilder/1.0 (local development)';

const NAME_OVERRIDES = {
  acre: ['Acre, Israel', 'Akko, Israel'],
  nazareth_illit: ['Nof HaGalil, Israel'],
  modiin: ["Modi'in-Maccabim-Re'ut, Israel"],
  beersheba: ['Beersheba, Israel', 'Beer Sheva, Israel'],
  sderot_south: ['Azriel, Israel'],
};

function parseSettlements(source) {
  const matches = source.matchAll(
    /\{ id: '([^']+)', name_he: '((?:\\'|[^'])*)', name_en: '((?:\\'|[^'])*)', lat: ([\d.]+), lng: ([\d.]+), region: '([^']+)', type: '([^']+)'(?:, aliases: \[([^\]]+)\])? \}/g
  );

  return Array.from(matches, (match) => {
    const [, id, nameHe, nameEn, lat, lng, region, type, aliasesRaw] = match;
    const aliases = aliasesRaw
      ? Array.from(aliasesRaw.matchAll(/'((?:\\'|[^'])*)'/g), (aliasMatch) =>
          aliasMatch[1].replace(/\\'/g, "'")
        )
      : [];

    return {
      id,
      name_he: nameHe.replace(/\\'/g, "'"),
      name_en: nameEn.replace(/\\'/g, "'"),
      lat: Number(lat),
      lng: Number(lng),
      region,
      type,
      aliases,
    };
  });
}

function centroidFromGeoJSON(geojson) {
  const coordinates = [];

  function collectCoords(value) {
    if (!Array.isArray(value)) {
      return;
    }

    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      coordinates.push([value[0], value[1]]);
      return;
    }

    value.forEach(collectCoords);
  }

  collectCoords(geojson.coordinates);

  if (coordinates.length === 0) {
    return null;
  }

  const totals = coordinates.reduce(
    (acc, [lng, lat]) => {
      acc.lat += lat;
      acc.lng += lng;
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return {
    lat: Number((totals.lat / coordinates.length).toFixed(6)),
    lng: Number((totals.lng / coordinates.length).toFixed(6)),
  };
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getQueries(settlement) {
  const queries = [];
  const overrideQueries = NAME_OVERRIDES[settlement.id] ?? [];
  const aliasQueries = settlement.aliases.map((alias) => `${alias}, Israel`);

  queries.push(...overrideQueries);
  queries.push(`${settlement.name_en}, Israel`);
  queries.push(`${settlement.name_he}, ישראל`);
  queries.push(...aliasQueries);

  return [...new Set(queries)];
}

async function fetchCandidate(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('polygon_geojson', '1');
  url.searchParams.set('countrycodes', 'il');
  url.searchParams.set('limit', '5');
  url.searchParams.set('q', query);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed: ${response.status}`);
  }

  return response.json();
}

function pickBestCandidate(settlement, candidates) {
  const viable = candidates
    .filter((candidate) => candidate.geojson)
    .map((candidate) => {
      const centroid = centroidFromGeoJSON(candidate.geojson);
      const distance = centroid
        ? distanceKm(settlement.lat, settlement.lng, centroid.lat, centroid.lng)
        : Number.POSITIVE_INFINITY;

      return {
        candidate,
        centroid,
        distance,
      };
    })
    .sort((a, b) => a.distance - b.distance);

  return viable[0] ?? null;
}

function toSource(entries, missingIds) {
  return `import type { SettlementBoundaryCollection } from '../types';\n\nexport const settlementBoundaries: SettlementBoundaryCollection = ${JSON.stringify(
    entries,
    null,
    2
  )} as const;\n\nexport const missingSettlementBoundaries = ${JSON.stringify(
    missingIds,
    null,
    2
  )} as const;\n`;
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const source = await readFile(SOURCE_PATH, 'utf8');
  const settlements = parseSettlements(source);
  const entries = {};
  const missingIds = [];

  for (const settlement of settlements) {
    let best = null;

    for (const query of getQueries(settlement)) {
      const candidates = await fetchCandidate(query);
      best = pickBestCandidate(settlement, candidates);

      if (best && best.distance <= 25) {
        break;
      }

      await sleep(1100);
    }

    if (!best) {
      missingIds.push(settlement.id);
      console.warn(`Missing boundary for ${settlement.id}`);
      continue;
    }

    entries[settlement.id] = {
      centroid: best.centroid ?? { lat: settlement.lat, lng: settlement.lng },
      geojson: best.candidate.geojson,
      sourceName: best.candidate.display_name,
      distanceKm: Number(best.distance.toFixed(2)),
    };

    console.log(`Fetched ${settlement.id} (${entries[settlement.id].distanceKm} km)`);
    await sleep(1100);
  }

  await writeFile(OUTPUT_PATH, toSource(entries, missingIds), 'utf8');

  if (missingIds.length > 0) {
    console.warn(`Missing boundaries: ${missingIds.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});