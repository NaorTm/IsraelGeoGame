import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = '/workspaces/IsraelGeoGame';
const SOURCE_PATH = path.join(ROOT, 'src/data/settlements.ts');
const OUTPUT_PATH = path.join(ROOT, 'src/data/settlementBoundaries.ts');
const USER_AGENT = 'IsraelGeoGameBoundaryBuilder/1.0 (local development)';
const MAX_NOMINATIM_MATCH_DISTANCE_KM = 12;
const OVERPASS_SEARCH_RADIUS_METERS = 8000;
const REQUEST_DELAY_MS = Number(process.env.BOUNDARY_REQUEST_DELAY_MS ?? 1100);
const MAX_REQUEST_RETRIES = Number(process.env.BOUNDARY_MAX_RETRIES ?? 3);
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const TARGET_SETTLEMENT_IDS = new Set(
  (process.env.BOUNDARY_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const RELATION_OVERRIDES = {
  alfei_menashe: 11993345,
  ariel: 10011903,
};

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

function isPolygonalGeometry(geojson) {
  return geojson?.type === 'Polygon' || geojson?.type === 'MultiPolygon';
}

function isClosedRing(coordinates) {
  if (coordinates.length < 4) {
    return false;
  }

  const [firstLng, firstLat] = coordinates[0];
  const [lastLng, lastLat] = coordinates[coordinates.length - 1];

  return firstLng === lastLng && firstLat === lastLat;
}

function toClosedRing(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 3) {
    return null;
  }

  const ring = geometry.map((point) => [point.lon, point.lat]);

  if (!isClosedRing(ring)) {
    ring.push([...ring[0]]);
  }

  return ring.length >= 4 ? ring : null;
}

function geojsonFromOverpassElement(element) {
  if (element.type === 'way') {
    const ring = toClosedRing(element.geometry);

    if (!ring) {
      return null;
    }

    return {
      type: 'Polygon',
      coordinates: [ring],
    };
  }

  if (element.type === 'relation') {
    const polygons = (element.members ?? [])
      .filter((member) => member.role === 'outer')
      .map((member) => toClosedRing(member.geometry))
      .filter(Boolean)
      .map((ring) => [ring]);

    if (polygons.length === 0) {
      return null;
    }

    return polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons };
  }

  return null;
}

function compareBoundaryCandidates(candidateA, candidateB) {
  const candidateAWithinRange =
    candidateA.distance <= MAX_NOMINATIM_MATCH_DISTANCE_KM;
  const candidateBWithinRange =
    candidateB.distance <= MAX_NOMINATIM_MATCH_DISTANCE_KM;
  const candidateAGeometry = candidateA?.candidate?.geojson;
  const candidateBGeometry = candidateB?.candidate?.geojson;
  const candidateAIsPolygon = isPolygonalGeometry(candidateAGeometry);
  const candidateBIsPolygon = isPolygonalGeometry(candidateBGeometry);

  if (candidateAWithinRange !== candidateBWithinRange) {
    return candidateAWithinRange ? -1 : 1;
  }

  if (!candidateAWithinRange && !candidateBWithinRange) {
    return candidateA.distance - candidateB.distance;
  }

  if (candidateAIsPolygon !== candidateBIsPolygon) {
    return candidateAIsPolygon ? -1 : 1;
  }

  return candidateA.distance - candidateB.distance;
}

function buildOverpassNames(settlement) {
  const rawNames = [settlement.name_he, settlement.name_en, ...settlement.aliases]
    .map((name) => name.trim())
    .filter(Boolean);

  return [...new Set(rawNames)];
}

function escapeOverpassString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function buildOverpassQuery(settlement) {
  const names = buildOverpassNames(settlement);
  const filters = [];

  for (const name of names) {
    const literal = escapeOverpassString(name);

    filters.push(
      `way["name"="${literal}"](around:${OVERPASS_SEARCH_RADIUS_METERS},${settlement.lat},${settlement.lng});`,
      `way["name:he"="${literal}"](around:${OVERPASS_SEARCH_RADIUS_METERS},${settlement.lat},${settlement.lng});`,
      `way["name:en"="${literal}"](around:${OVERPASS_SEARCH_RADIUS_METERS},${settlement.lat},${settlement.lng});`,
      `relation["name"="${literal}"](around:${OVERPASS_SEARCH_RADIUS_METERS},${settlement.lat},${settlement.lng});`,
      `relation["name:he"="${literal}"](around:${OVERPASS_SEARCH_RADIUS_METERS},${settlement.lat},${settlement.lng});`,
      `relation["name:en"="${literal}"](around:${OVERPASS_SEARCH_RADIUS_METERS},${settlement.lat},${settlement.lng});`
    );
  }

  return `[out:json][timeout:25];(${filters.join('')});out tags center geom;`;
}

function closeRing(coordinates) {
  if (coordinates.length === 0) {
    return coordinates;
  }

  const [firstLng, firstLat] = coordinates[0];
  const [lastLng, lastLat] = coordinates[coordinates.length - 1];

  if (firstLng !== lastLng || firstLat !== lastLat) {
    coordinates.push([...coordinates[0]]);
  }

  return coordinates;
}

function buildWayCoordinates(way, nodeMap) {
  const coordinates = way.nodes
    .map((nodeId) => nodeMap.get(nodeId))
    .filter(Boolean)
    .map((node) => [node.lon, node.lat]);

  return coordinates.length >= 3 ? coordinates : null;
}

function assembleOuterRings(outerWays, nodeMap) {
  const remaining = outerWays
    .map((way) => ({
      id: way.id,
      coordinates: buildWayCoordinates(way, nodeMap),
    }))
    .filter((way) => way.coordinates);
  const rings = [];

  while (remaining.length > 0) {
    const current = remaining.shift();
    const coordinates = [...current.coordinates];
    let changed = true;

    while (changed && !isClosedRing(coordinates)) {
      changed = false;

      for (let index = 0; index < remaining.length; index += 1) {
        const segment = remaining[index].coordinates;
        const [startLng, startLat] = coordinates[0];
        const [endLng, endLat] = coordinates[coordinates.length - 1];
        const [segmentStartLng, segmentStartLat] = segment[0];
        const [segmentEndLng, segmentEndLat] = segment[segment.length - 1];

        if (endLng === segmentStartLng && endLat === segmentStartLat) {
          coordinates.push(...segment.slice(1));
          remaining.splice(index, 1);
          changed = true;
          break;
        }

        if (endLng === segmentEndLng && endLat === segmentEndLat) {
          coordinates.push(...segment.slice(0, -1).reverse());
          remaining.splice(index, 1);
          changed = true;
          break;
        }

        if (startLng === segmentEndLng && startLat === segmentEndLat) {
          coordinates.unshift(...segment.slice(0, -1));
          remaining.splice(index, 1);
          changed = true;
          break;
        }

        if (startLng === segmentStartLng && startLat === segmentStartLat) {
          coordinates.unshift(...segment.slice(1).reverse());
          remaining.splice(index, 1);
          changed = true;
          break;
        }
      }
    }

    closeRing(coordinates);

    if (coordinates.length >= 4) {
      rings.push(coordinates);
    }
  }

  return rings;
}

function geojsonFromOsmRelation(relationId, elements) {
  const relation = elements.find(
    (element) => element.type === 'relation' && element.id === relationId
  );

  if (!relation) {
    return null;
  }

  const nodeMap = new Map(
    elements
      .filter((element) => element.type === 'node')
      .map((element) => [element.id, element])
  );
  const wayMap = new Map(
    elements
      .filter((element) => element.type === 'way')
      .map((element) => [element.id, element])
  );
  const outerWays = relation.members
    .filter((member) => member.type === 'way' && member.role === 'outer')
    .map((member) => wayMap.get(member.ref))
    .filter(Boolean);
  const rings = assembleOuterRings(outerWays, nodeMap);

  if (rings.length === 0) {
    return null;
  }

  return rings.length === 1
    ? { type: 'Polygon', coordinates: [rings[0]] }
    : { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) };
}

function isUsefulOverpassElement(element) {
  return Boolean(
    element?.tags?.landuse === 'residential' ||
      element?.tags?.place ||
      element?.tags?.boundary === 'administrative'
  );
}

async function fetchOverpassCandidate(settlement) {
  const query = buildOverpassQuery(settlement);
  let responseText = '';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      responseText = await fetchTextWithRetry(
        endpoint,
        {
          method: 'POST',
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          body: new URLSearchParams({ data: query }),
        },
        `Overpass ${endpoint}`
      );
      break;
    } catch (error) {
      if (endpoint === OVERPASS_ENDPOINTS[OVERPASS_ENDPOINTS.length - 1]) {
        throw error;
      }
    }
  }

  if (responseText.trimStart().startsWith('<')) {
    throw new Error('Overpass request failed or was rate-limited.');
  }

  const data = JSON.parse(responseText);
  const candidates = (data.elements ?? [])
    .filter(isUsefulOverpassElement)
    .map((element) => {
      const geojson = geojsonFromOverpassElement(element);

      if (!geojson) {
        return null;
      }

      const centroid = centroidFromGeoJSON(geojson);
      const distance = centroid
        ? distanceKm(settlement.lat, settlement.lng, centroid.lat, centroid.lng)
        : Number.POSITIVE_INFINITY;
      const sourceName = [
        element.tags?.['name:he'],
        element.tags?.name,
        element.tags?.['name:en'],
      ]
        .filter(Boolean)
        .join(' / ');

      return {
        candidate: {
          geojson,
          display_name:
            sourceName || `OSM ${element.type} ${element.id}`,
        },
        centroid,
        distance,
      };
    })
    .filter(Boolean)
    .sort(compareBoundaryCandidates);

  return candidates[0] ?? null;
}

async function fetchRelationOverrideCandidate(settlement) {
  const relationId = RELATION_OVERRIDES[settlement.id];

  if (!relationId) {
    return null;
  }

  const data = await fetchJsonWithRetry(
    `https://www.openstreetmap.org/api/0.6/relation/${relationId}/full.json`,
    {
      headers: { 'User-Agent': USER_AGENT },
    },
    `OSM relation ${relationId}`
  );
  const geojson = geojsonFromOsmRelation(relationId, data.elements ?? []);
  const relation = (data.elements ?? []).find(
    (element) => element.type === 'relation' && element.id === relationId
  );

  if (!geojson || !relation) {
    return null;
  }

  const centroid = centroidFromGeoJSON(geojson);
  const distance = centroid
    ? distanceKm(settlement.lat, settlement.lng, centroid.lat, centroid.lng)
    : Number.POSITIVE_INFINITY;
  const sourceName = [
    relation.tags?.['name:he'],
    relation.tags?.name,
    relation.tags?.['name:en'],
  ]
    .filter(Boolean)
    .join(' / ');

  return {
    candidate: {
      geojson,
      display_name: sourceName || `OSM relation ${relationId}`,
    },
    centroid,
    distance,
  };
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

  return fetchJsonWithRetry(
    url,
    {
      headers: { 'User-Agent': USER_AGENT },
    },
    `Nominatim ${query}`
  );
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
    .sort(compareBoundaryCandidates);

  return viable[0] ?? null;
}

function isAcceptableCandidate(candidate) {
  return Boolean(
    candidate &&
      isPolygonalGeometry(candidate.candidate.geojson) &&
      candidate.distance <= MAX_NOMINATIM_MATCH_DISTANCE_KM
  );
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

function parseExistingOutput(source) {
  const boundariesPrefix =
    "export const settlementBoundaries: SettlementBoundaryCollection = ";
  const missingPrefix = 'export const missingSettlementBoundaries = ';
  const boundariesStart = source.indexOf(boundariesPrefix);
  const missingStart = source.indexOf(missingPrefix);

  if (boundariesStart === -1 || missingStart === -1) {
    return {
      entries: {},
      missingIds: [],
    };
  }

  const entries = JSON.parse(
    source
      .slice(
        boundariesStart + boundariesPrefix.length,
        source.indexOf(' as const;', boundariesStart)
      )
      .trim()
  );
  const missingIds = JSON.parse(
    source
      .slice(
        missingStart + missingPrefix.length,
        source.indexOf(' as const;', missingStart)
      )
      .trim()
  );

  return { entries, missingIds };
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithRetry(url, options, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        if (!isRetryableStatus(response.status) || attempt === MAX_REQUEST_RETRIES) {
          throw new Error(`${label} failed: ${response.status}`);
        }

        const retryAfterSeconds = Number(response.headers.get('retry-after') ?? 0);
        const retryDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : REQUEST_DELAY_MS * attempt;
        await sleep(retryDelayMs);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt === MAX_REQUEST_RETRIES) {
        break;
      }

      await sleep(REQUEST_DELAY_MS * attempt);
    }
  }

  throw lastError ?? new Error(`${label} failed.`);
}

async function fetchJsonWithRetry(url, options, label) {
  const response = await fetchWithRetry(url, options, label);
  return response.json();
}

async function fetchTextWithRetry(url, options, label) {
  const response = await fetchWithRetry(url, options, label);
  const responseText = await response.text();

  if (responseText.trimStart().startsWith('<')) {
    throw new Error(`${label} returned HTML instead of JSON.`);
  }

  return responseText;
}

async function main() {
  const [source, existingOutputSource] = await Promise.all([
    readFile(SOURCE_PATH, 'utf8'),
    readFile(OUTPUT_PATH, 'utf8').catch(() => ''),
  ]);
  const settlements = parseSettlements(source).filter(
    (settlement) =>
      TARGET_SETTLEMENT_IDS.size === 0 || TARGET_SETTLEMENT_IDS.has(settlement.id)
  );
  const existingOutput = parseExistingOutput(existingOutputSource);
  const entries =
    TARGET_SETTLEMENT_IDS.size === 0 ? {} : { ...existingOutput.entries };
  const missingIds = new Set(
    TARGET_SETTLEMENT_IDS.size === 0 ? [] : existingOutput.missingIds
  );

  if (settlements.length === 0) {
    throw new Error('No settlements matched BOUNDARY_IDS.');
  }

  for (const settlement of settlements) {
    let best = null;

    for (const query of getQueries(settlement)) {
      const candidates = await fetchCandidate(query);
      const candidate = pickBestCandidate(settlement, candidates);

      if (
        candidate &&
        (!best || compareBoundaryCandidates(candidate, best) < 0)
      ) {
        best = candidate;
      }

      if (isAcceptableCandidate(candidate)) {
        best = candidate;
        break;
      }

      await sleep(REQUEST_DELAY_MS);
    }

    if (
      !best ||
      !isPolygonalGeometry(best.candidate.geojson) ||
      best.distance > MAX_NOMINATIM_MATCH_DISTANCE_KM
    ) {
      try {
        const overpassCandidate = await fetchOverpassCandidate(settlement);

        if (overpassCandidate) {
          best = overpassCandidate;
        }
      } catch (error) {
        console.warn(`Overpass fallback failed for ${settlement.id}: ${error.message}`);
      }
    }

    if (
      (!best ||
        !isPolygonalGeometry(best.candidate.geojson) ||
        best.distance > MAX_NOMINATIM_MATCH_DISTANCE_KM) &&
      RELATION_OVERRIDES[settlement.id]
    ) {
      try {
        const relationCandidate = await fetchRelationOverrideCandidate(settlement);

        if (
          relationCandidate &&
          (!best || compareBoundaryCandidates(relationCandidate, best) < 0)
        ) {
          best = relationCandidate;
        }
      } catch (error) {
        console.warn(`Relation override failed for ${settlement.id}: ${error.message}`);
      }
    }

    if (!isAcceptableCandidate(best)) {
      delete entries[settlement.id];
      missingIds.add(settlement.id);

      if (best) {
        console.warn(
          `Rejected boundary for ${settlement.id}: ${best.distance.toFixed(2)} km, ${best.candidate.geojson.type}`
        );
      }

      console.warn(`Missing boundary for ${settlement.id}`);
      continue;
    }

    missingIds.delete(settlement.id);

    entries[settlement.id] = {
      centroid: best.centroid ?? { lat: settlement.lat, lng: settlement.lng },
      geojson: best.candidate.geojson,
      sourceName: best.candidate.display_name,
      distanceKm: Number(best.distance.toFixed(2)),
    };

    console.log(`Fetched ${settlement.id} (${entries[settlement.id].distanceKm} km)`);
    await sleep(REQUEST_DELAY_MS);
  }

  await writeFile(
    OUTPUT_PATH,
    toSource(entries, [...missingIds].sort()),
    'utf8'
  );

  if (missingIds.size > 0) {
    console.warn(`Missing boundaries: ${[...missingIds].sort().join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});