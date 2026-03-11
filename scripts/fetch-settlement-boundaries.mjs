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
const SKIP_REMOTE_LOOKUPS = ['1', 'true', 'yes'].includes(
  String(process.env.BOUNDARY_SKIP_REMOTE_LOOKUPS ?? '').toLowerCase()
);
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OREF_SEGMENTS_URL =
  'https://dist-android.meser-hadash.org.il/smart-dist/services/anonymous/segments/android?instance=1544803905&locale=iw_IL';
const OREF_POLYGON_URL =
  'https://services.meser-hadash.org.il/smart-dist/services/anonymous/polygon/id/android?instance=1544803905&id=';
const TZEVAADOM_CITIES_URL = 'https://www.tzevaadom.co.il/static/cities.json?v=5';
const TZEVAADOM_POLYGONS_URL = 'https://www.tzevaadom.co.il/static/polygons.json?v=3';
const TARGET_SETTLEMENT_IDS = new Set(
  (process.env.BOUNDARY_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const WAY_OVERRIDES = {
  abu_ruqayyeq: 92880152,
};
const RELATION_OVERRIDES = {
  alfei_menashe: 11993345,
  ariel: 10011903,
};

const SEARCH_COORDINATE_OVERRIDES = {
  arsuf: { lat: 32.209475, lng: 34.81757 },
  bat_hadar: { lat: 31.645321, lng: 34.596329 },
  hodayot: { lat: 32.788542, lng: 35.4353 },
  karme_qatif: { lat: 31.537243, lng: 34.912677 },
  kefar_zoharim: { lat: 31.621718, lng: 34.924752 },
  khawaled: { lat: 32.770093, lng: 35.136336 },
  maale_iron: { lat: 32.547887, lng: 35.171902 },
  sderot_south: { lat: 32.262046, lng: 34.969692 },
};

const NAME_OVERRIDES = {
  acre: ['Acre, Israel', 'Akko, Israel'],
  arsuf: ['Arsuf, Israel', 'ארסוף, ישראל'],
  bat_hadar: ['Bat Hadar, Israel', 'בת הדר, ישראל'],
  nazareth_illit: ['Nof HaGalil, Israel'],
  modiin: ["Modi'in-Maccabim-Re'ut, Israel"],
  ben_shemen_k_noar: ['Ben Shemen, Israel', 'בן שמן, ישראל'],
  ben_shemen_moshav: ['Ben Shemen, Israel', 'בן שמן, ישראל'],
  beersheba: ['Beersheba, Israel', 'Beer Sheva, Israel'],
  even_yizhaq_galed: ["Gal'ed, Israel", 'גלעד, ישראל'],
  haluz: ['Har Halutz, Israel', 'הר חלוץ, ישראל'],
  hamam: ['Wadi al-Hamam, Israel', 'Wadi Hamam, Israel', 'ואדי אל חמאם, ישראל'],
  hodayot: ['Hodayot, Israel', 'הודיות, ישראל'],
  hujeirat_dahra: ["Hujeirat, Israel", "חוג'ייראת, ישראל"],
  kaabiyye_tabbash_ha: ["Ka'abiyye Tabbash, Israel", 'כעביה טבאש, ישראל'],
  kefar_hasidim_alef: ['Kfar Hasidim, Israel', 'כפר חסידים, ישראל'],
  kefar_hasidim_bet: ['Kfar Hasidim, Israel', 'כפר חסידים, ישראל'],
  kefar_rosh_haniqra: ['Rosh HaNikra, Israel', 'ראש הנקרה, ישראל'],
  kefar_rozenwald_zar: ["Zare'it, Israel", 'זרעית, ישראל'],
  khawaled_986: ['Khawaled Village, Israel', "כפר ח'וואלד, ישראל"],
  kinneret_qevuza: ['Kvutzat Kinneret, Israel', 'כינרת קבוצה, ישראל'],
  maale_iron: ["Ma'ale Iron, Israel", 'מעלה עירון, ישראל'],
  mayan_barukh: ["Ma'ayan Baruch, Israel", 'מעיין ברוך, ישראל'],
  nizzana_qehilat_hin: ['Nitzana, Israel', 'ניצנה, ישראל'],
  abu_juweiid: ["Abu Juwei'id, Israel", "אבו ג'ווייעד, ישראל"],
  abu_sureihan: ['Abu Sureihan, Israel', 'אבו סריחאן, ישראל'],
  abu_ruqayyeq: ['Abu Ruqaiq, Israel', 'אבו רוקייק, ישראל'],
  hawashla: ['Hawashla, Israel', 'הוואשלה, ישראל'],
  nasasra: ['Nasasra, Israel', 'נצאצרה, ישראל'],
  qabboa: ["Qabbo'a, Israel", 'קבועה, ישראל'],
  qawain: ["Qawa'in, Israel", 'קוואעין, ישראל'],
  qudeirat_as_sani: ['Qudeirat al Sani, Israel', 'קודייראת א צאנע, ישראל'],
  peqiin_hadasha: ["Peqi'in Hadasha, Israel", 'פקיעין החדשה, ישראל', "Peqi'in, Israel", 'פקיעין, ישראל'],
  sderot_south: ['Azriel, Israel'],
  tarabin_as_sani: ['Tarabin al Sani, Israel', 'תראבין א צאנע, ישראל'],
  tene: ['Tene Omarim, Israel', 'טנא עומרים, ישראל'],
  zabarga: ['Zabarga, Israel', 'זבארגה, ישראל'],
};

const OREF_NAME_OVERRIDES = {
  abu_qureinat: ['אבו קרינאת'],
  asefar: ['מיצד'],
  berakha: ['הר ברכה'],
  bet_yattir: ['בית יתיר'],
  en_harod_ihud: ['עין חרוד, תל יוסף'],
  en_harod_meuhad: ['עין חרוד, תל יוסף'],
  en_karem_b_s_haqlai: ['פנימיית עין כרם'],
  gat_qibbuz: ['גת'],
  ginnegar: ['גניגר'],
  haggai: ['בית חג"י'],
  hazor_ashdod: ['חצור'],
  hazorea: ['יקנעם המושבה והזורע'],
  hever: ['מרכז חבר'],
  hefzi_bah: ['בית אלפא וחפציבה'],
  khawaled: ["כפר ח'וואלד"],
  lohame_hagetaot: ['לוחמי הגטאות'],
  mayan_barukh: ['מעיין ברוך'],
  naama: ['נעמה'],
  pene_hever: ['מעלה חבר'],
  qiryat_netafim: ['קריית נטפים'],
  sawaid_humayra: ['סואעד חמירה'],
  tarabin_as_sani_1346: ['תארבין'],
  yedida: ['כפר הנוער קריית יערים'],
  yuval: ['כפר יובל'],
  zofiyya: ['מעון צופיה'],
};

let tzevaAdomSourcePromise = null;
let orefSourcePromise = null;
const orefPolygonPromiseBySegmentId = new Map();

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

function normalizeLookupKey(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/["'`׳״()\-.,/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripLookupQuerySuffix(value) {
  return String(value ?? '')
    .replace(/,\s*Israel$/i, '')
    .replace(/,\s*ישראל$/i, '')
    .trim();
}

function getLookupNames(settlement) {
  return [
    settlement.name_he,
    settlement.name_en,
    ...settlement.aliases,
    ...(NAME_OVERRIDES[settlement.id] ?? []).map(stripLookupQuerySuffix),
  ]
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
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
  return getLookupNames(settlement);
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

function geojsonFromLatLngPairs(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    return null;
  }

  const ring = coordinates
    .filter(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
    )
    .map(([lat, lng]) => [Number(lng), Number(lat)]);

  closeRing(ring);

  return ring.length >= 4
    ? {
        type: 'Polygon',
        coordinates: [ring],
      }
    : null;
}

function geojsonFromOrefPolygonPointLists(polygonPointLists) {
  if (!Array.isArray(polygonPointLists) || polygonPointLists.length === 0) {
    return null;
  }

  const polygons = polygonPointLists
    .map((coordinates) => {
      const ring = coordinates
        .filter(
          (point) =>
            Array.isArray(point) &&
            point.length >= 2 &&
            Number.isFinite(Number(point[0])) &&
            Number.isFinite(Number(point[1]))
        )
        .map(([lat, lng]) => [Number(lng), Number(lat)]);

      closeRing(ring);

      return ring.length >= 4 ? [ring] : null;
    })
    .filter(Boolean);

  if (polygons.length === 0) {
    return null;
  }

  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

async function loadTzevaAdomSource() {
  if (!tzevaAdomSourcePromise) {
    tzevaAdomSourcePromise = Promise.all([
      fetchJsonWithRetry(
        TZEVAADOM_CITIES_URL,
        {
          headers: { 'User-Agent': USER_AGENT },
        },
        'TzevaAdom cities'
      ),
      fetchJsonWithRetry(
        TZEVAADOM_POLYGONS_URL,
        {
          headers: { 'User-Agent': USER_AGENT },
        },
        'TzevaAdom polygons'
      ),
    ]).then(([citiesPayload, polygonsPayload]) => {
      const cityIdByLookupKey = new Map();
      const citiesById = new Map();

      for (const [name, city] of Object.entries(citiesPayload.cities ?? {})) {
        const cityId = String(city.id);
        citiesById.set(cityId, {
          ...city,
          name,
        });

        const lookupValues = [
          name,
          city.he,
          city.en,
          city.ru,
          city.ar,
          city.es,
        ];

        for (const lookupValue of lookupValues) {
          const key = normalizeLookupKey(lookupValue);

          if (key && !cityIdByLookupKey.has(key)) {
            cityIdByLookupKey.set(key, cityId);
          }
        }
      }

      return {
        citiesById,
        cityIdByLookupKey,
        polygonsById: polygonsPayload,
      };
    });
  }

  return tzevaAdomSourcePromise;
}

async function loadOrefSource() {
  if (!orefSourcePromise) {
    orefSourcePromise = fetchJsonWithRetry(
      OREF_SEGMENTS_URL,
      {
        headers: { 'User-Agent': USER_AGENT },
      },
      'OREF segments'
    ).then((payload) => {
      const segmentsById = new Map();
      const segmentIdsByLookupKey = new Map();

      for (const segment of Object.values(payload.segments ?? {})) {
        const segmentId = String(segment.id);
        segmentsById.set(segmentId, segment);

        const lookupKey = normalizeLookupKey(segment.name);

        if (!lookupKey) {
          continue;
        }

        if (!segmentIdsByLookupKey.has(lookupKey)) {
          segmentIdsByLookupKey.set(lookupKey, []);
        }

        segmentIdsByLookupKey.get(lookupKey).push(segmentId);
      }

      return {
        segmentsById,
        segmentIdsByLookupKey,
      };
    });
  }

  return orefSourcePromise;
}

function getOrefLookupNames(settlement) {
  return [
    settlement.name_he,
    ...(settlement.aliases ?? []),
    ...(OREF_NAME_OVERRIDES[settlement.id] ?? []),
  ]
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

async function fetchOrefPolygon(segmentId) {
  const cacheKey = String(segmentId);

  if (!orefPolygonPromiseBySegmentId.has(cacheKey)) {
    orefPolygonPromiseBySegmentId.set(
      cacheKey,
      fetchJsonWithRetry(
        `${OREF_POLYGON_URL}${cacheKey}`,
        {
          headers: { 'User-Agent': USER_AGENT },
        },
        `OREF polygon ${cacheKey}`
      )
    );
  }

  return orefPolygonPromiseBySegmentId.get(cacheKey);
}

async function fetchOrefCandidate(settlement) {
  const source = await loadOrefSource();
  const lookupKeys = getOrefLookupNames(settlement)
    .map(normalizeLookupKey)
    .filter(Boolean);
  const candidateSegmentIds = [...new Set(
    lookupKeys.flatMap(
      (lookupKey) => source.segmentIdsByLookupKey.get(lookupKey) ?? []
    )
  )];
  const candidates = (
    await Promise.all(
      candidateSegmentIds.map(async (segmentId) => {
        const segment = source.segmentsById.get(segmentId);

        if (!segment) {
          return null;
        }

        const polygonPayload = await fetchOrefPolygon(segmentId);
        const geojson = geojsonFromOrefPolygonPointLists(
          polygonPayload?.polygonPointList
        );

        if (!geojson) {
          return null;
        }

        const centroid = centroidFromGeoJSON(geojson);
        const distance = centroid
          ? distanceKm(settlement.lat, settlement.lng, centroid.lat, centroid.lng)
          : Number.POSITIVE_INFINITY;

        return {
          candidate: {
            geojson,
            display_name: `OREF / ${segment.name}`,
          },
          centroid,
          distance,
        };
      })
    )
  )
    .filter(Boolean)
    .sort(compareBoundaryCandidates);

  return candidates[0] ?? null;
}

async function fetchTzevaAdomCandidate(settlement) {
  const source = await loadTzevaAdomSource();
  const lookupKeys = getLookupNames(settlement)
    .map(normalizeLookupKey)
    .filter(Boolean);
  const candidateIds = [...new Set(
    lookupKeys
      .map((lookupKey) => source.cityIdByLookupKey.get(lookupKey))
      .filter(Boolean)
  )];
  const candidates = candidateIds
    .map((cityId) => {
      const polygonCoordinates = source.polygonsById?.[cityId];
      const geojson = geojsonFromLatLngPairs(polygonCoordinates);

      if (!geojson) {
        return null;
      }

      const centroid = centroidFromGeoJSON(geojson);
      const distance = centroid
        ? distanceKm(settlement.lat, settlement.lng, centroid.lat, centroid.lng)
        : Number.POSITIVE_INFINITY;
      const sourceCity = source.citiesById.get(cityId);

      return {
        candidate: {
          geojson,
          display_name: sourceCity?.he
            ? `TzevaAdom / ${sourceCity.he}`
            : `TzevaAdom / ${cityId}`,
        },
        centroid,
        distance,
      };
    })
    .filter(Boolean)
    .sort(compareBoundaryCandidates);

  return candidates[0] ?? null;
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

function geojsonFromOsmWay(wayId, elements) {
  const way = elements.find(
    (element) => element.type === 'way' && element.id === wayId
  );

  if (!way) {
    return null;
  }

  const nodeMap = new Map(
    elements
      .filter((element) => element.type === 'node')
      .map((element) => [element.id, element])
  );
  const coordinates = buildWayCoordinates(way, nodeMap);

  if (!coordinates) {
    return null;
  }

  closeRing(coordinates);

  return coordinates.length >= 4
    ? { type: 'Polygon', coordinates: [coordinates] }
    : null;
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

async function fetchWayOverrideCandidate(settlement) {
  const wayId = WAY_OVERRIDES[settlement.id];

  if (!wayId) {
    return null;
  }

  const data = await fetchJsonWithRetry(
    `https://www.openstreetmap.org/api/0.6/way/${wayId}/full.json`,
    {
      headers: { 'User-Agent': USER_AGENT },
    },
    `OSM way ${wayId}`
  );
  const geojson = geojsonFromOsmWay(wayId, data.elements ?? []);
  const way = (data.elements ?? []).find(
    (element) => element.type === 'way' && element.id === wayId
  );

  if (!geojson || !way) {
    return null;
  }

  const centroid = centroidFromGeoJSON(geojson);
  const distance = centroid
    ? distanceKm(settlement.lat, settlement.lng, centroid.lat, centroid.lng)
    : Number.POSITIVE_INFINITY;
  const sourceName = [
    way.tags?.['name:he'],
    way.tags?.name,
    way.tags?.['name:en'],
    way.tags?.['name:ar'],
  ]
    .filter(Boolean)
    .join(' / ');

  return {
    candidate: {
      geojson,
      display_name: sourceName || `OSM way ${wayId}`,
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

function isRateLimitError(error) {
  return error instanceof Error && error.message.includes('429');
}

async function main() {
  const [source, existingOutputSource] = await Promise.all([
    readFile(SOURCE_PATH, 'utf8'),
    readFile(OUTPUT_PATH, 'utf8').catch(() => ''),
  ]);
  const settlements = parseSettlements(source)
    .map((settlement) => {
      const coordinateOverride = SEARCH_COORDINATE_OVERRIDES[settlement.id];

      return coordinateOverride ? { ...settlement, ...coordinateOverride } : settlement;
    })
    .filter(
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

    if (TARGET_SETTLEMENT_IDS.size > 0 || SKIP_REMOTE_LOOKUPS) {
      try {
        const tzevaAdomCandidate = await fetchTzevaAdomCandidate(settlement);

        if (tzevaAdomCandidate) {
          best = tzevaAdomCandidate;
        }
      } catch (error) {
        console.warn(`TzevaAdom fallback failed for ${settlement.id}: ${error.message}`);
      }

      if (!isAcceptableCandidate(best)) {
        try {
          const orefCandidate = await fetchOrefCandidate(settlement);

          if (orefCandidate) {
            best = orefCandidate;
          }
        } catch (error) {
          console.warn(`OREF fallback failed for ${settlement.id}: ${error.message}`);
        }
      }
    }

    if (SKIP_REMOTE_LOOKUPS && isAcceptableCandidate(best)) {
      missingIds.delete(settlement.id);
      entries[settlement.id] = {
        centroid: best.centroid ?? { lat: settlement.lat, lng: settlement.lng },
        geojson: best.candidate.geojson,
        sourceName: best.candidate.display_name,
        distanceKm: Number(best.distance.toFixed(2)),
      };

      console.log(`Fetched ${settlement.id} (${entries[settlement.id].distanceKm} km)`);
      continue;
    }

    if (SKIP_REMOTE_LOOKUPS && !isAcceptableCandidate(best)) {
      delete entries[settlement.id];
      missingIds.add(settlement.id);
      console.warn(`Missing boundary for ${settlement.id}`);
      continue;
    }

    for (const query of getQueries(settlement)) {
      let candidate = null;

      try {
        const candidates = await fetchCandidate(query);
        candidate = pickBestCandidate(settlement, candidates);
      } catch (error) {
        console.warn(`Nominatim lookup failed for ${settlement.id}: ${error.message}`);

        if (isRateLimitError(error)) {
          break;
        }

        continue;
      }

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
      (!best ||
        !isPolygonalGeometry(best.candidate.geojson) ||
        best.distance > MAX_NOMINATIM_MATCH_DISTANCE_KM)
    ) {
      try {
        const tzevaAdomCandidate = await fetchTzevaAdomCandidate(settlement);

        if (
          tzevaAdomCandidate &&
          (!best || compareBoundaryCandidates(tzevaAdomCandidate, best) < 0)
        ) {
          best = tzevaAdomCandidate;
        }
      } catch (error) {
        console.warn(`TzevaAdom fallback failed for ${settlement.id}: ${error.message}`);
      }
    }

    if (
      !best ||
      !isPolygonalGeometry(best.candidate.geojson) ||
      best.distance > MAX_NOMINATIM_MATCH_DISTANCE_KM
    ) {
      try {
        const orefCandidate = await fetchOrefCandidate(settlement);

        if (orefCandidate && (!best || compareBoundaryCandidates(orefCandidate, best) < 0)) {
          best = orefCandidate;
        }
      } catch (error) {
        console.warn(`OREF fallback failed for ${settlement.id}: ${error.message}`);
      }
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
      WAY_OVERRIDES[settlement.id]
    ) {
      try {
        const wayCandidate = await fetchWayOverrideCandidate(settlement);

        if (wayCandidate && (!best || compareBoundaryCandidates(wayCandidate, best) < 0)) {
          best = wayCandidate;
        }
      } catch (error) {
        console.warn(`Way override failed for ${settlement.id}: ${error.message}`);
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