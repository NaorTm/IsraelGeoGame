import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import proj4 from 'proj4';

const ROOT = '/workspaces/IsraelGeoGame';
const SETTLEMENTS_PATH = path.join(ROOT, 'src/data/settlements.ts');
const USER_AGENT = 'IsraelGeoGameLocalityBuilder/1.0 (local development)';
const CITIES_RESOURCE_ID = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba';
const UNIFIED_RESOURCE_ID = 'e9701dcb-9f1c-43bb-bd44-eb380ade542f';
const ALARMS_ALIASES_URL =
  'https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/missing_cities.json';

const REGION_ORDER = [
  'north',
  'haifa',
  'center',
  'tel_aviv',
  'jerusalem',
  'south',
  'judea_samaria',
  'shephelah',
];

const REGION_BY_DISTRICT = {
  'גולן': 'north',
  'כנרת': 'north',
  'נצרת': 'north',
  'עכו': 'north',
  'עפולה': 'north',
  'צפת': 'north',
  'חדרה': 'haifa',
  'חיפה': 'haifa',
  'השרון': 'center',
  'פתח תקווה': 'center',
  'רחובות': 'center',
  'רמלה': 'center',
  'חולון': 'tel_aviv',
  'רמת גן': 'tel_aviv',
  'תל אביב': 'tel_aviv',
  'ירושלים': 'jerusalem',
  'אשקלון': 'shephelah',
  'באר שבע': 'south',
  'בית לחם': 'judea_samaria',
  "ג'נין": 'judea_samaria',
  'חברון': 'judea_samaria',
  'טול כרם': 'judea_samaria',
  'ירדן )יריחו(': 'judea_samaria',
  'ראמאללה': 'judea_samaria',
  'שכם': 'judea_samaria',
};

proj4.defs(
  'EPSG:2039',
  '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs'
);

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeSingleQuotes(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function normalizeKey(value) {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/["'`׳״()\-.,/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function titleCaseEnglish(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();

  return normalized.replace(/(^|[\s\-\/])([a-z])/g, (_, prefix, letter) => {
    return `${prefix}${letter.toUpperCase()}`;
  });
}

function slugifyId(nameEn, code) {
  const slug = normalizeWhitespace(nameEn)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug || `settlement_${code}`;
}

function inferRegion(lat, lng, district) {
  const mappedRegion = REGION_BY_DISTRICT[normalizeWhitespace(district)];

  if (mappedRegion) {
    return mappedRegion;
  }

  if (lng > 35.05 && lat >= 31.45 && lat <= 32.5) {
    return 'judea_samaria';
  }

  if (lat < 31.45) {
    return 'south';
  }

  if (lat < 31.85 && lng < 34.95) {
    return 'shephelah';
  }

  if (lat < 32.18 && lng < 34.87) {
    return 'tel_aviv';
  }

  if (lat < 32.25) {
    return 'center';
  }

  if (lat < 32.9) {
    return 'haifa';
  }

  return 'north';
}

function inferType(nameHe) {
  if (nameHe.includes('קיבוץ')) {
    return 'kibbutz';
  }

  if (nameHe.includes('מושב')) {
    return 'moshav';
  }

  return 'town';
}

function parseExistingSettlements(source) {
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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }

  return response.json();
}

async function fetchDatastoreRecords(resourceId) {
  const records = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const payload = await fetchJson(
      `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&limit=${limit}&offset=${offset}`
    );
    const result = payload.result ?? {};
    const batch = result.records ?? [];

    if (batch.length === 0) {
      break;
    }

    records.push(...batch);
    offset += limit;

    if (offset >= (result.total ?? 0)) {
      break;
    }
  }

  return records;
}

function toLatLng(x, y) {
  const [lng, lat] = proj4('EPSG:2039', 'WGS84', [Number(x), Number(y)]);

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
}

function buildAliasMap(rawAliases) {
  const aliasMap = new Map();

  for (const [alias, canonical] of Object.entries(rawAliases)) {
    const canonicalKey = normalizeKey(canonical);

    if (!canonicalKey) {
      continue;
    }

    if (!aliasMap.has(canonicalKey)) {
      aliasMap.set(canonicalKey, new Set());
    }

    aliasMap.get(canonicalKey).add(normalizeWhitespace(alias));
  }

  return aliasMap;
}

function pickExisting(existingByHebrew, existingByEnglish, nameHe, nameEn) {
  return (
    existingByHebrew.get(normalizeKey(nameHe)) ??
    existingByEnglish.get(normalizeKey(nameEn)) ??
    null
  );
}

function formatSettlementEntry(entry) {
  const aliases = entry.aliases.length
    ? `, aliases: [${entry.aliases
        .map((alias) => `'${escapeSingleQuotes(alias)}'`)
        .join(', ')}]`
    : '';

  return `  { id: '${entry.id}', name_he: '${escapeSingleQuotes(entry.name_he)}', name_en: '${escapeSingleQuotes(entry.name_en)}', lat: ${entry.lat.toFixed(6)}, lng: ${entry.lng.toFixed(6)}, region: '${entry.region}', type: '${entry.type}'${aliases} },`;
}

async function main() {
  const [existingSource, citiesRecords, unifiedRecords, rawAliases] =
    await Promise.all([
      readFile(SETTLEMENTS_PATH, 'utf8'),
      fetchDatastoreRecords(CITIES_RESOURCE_ID),
      fetchDatastoreRecords(UNIFIED_RESOURCE_ID),
      fetchJson(ALARMS_ALIASES_URL),
    ]);

  const existingSettlements = parseExistingSettlements(existingSource);
  const existingByHebrew = new Map(
    existingSettlements.map((settlement) => [
      normalizeKey(settlement.name_he),
      settlement,
    ])
  );
  const existingByEnglish = new Map(
    existingSettlements.map((settlement) => [
      normalizeKey(settlement.name_en),
      settlement,
    ])
  );
  const aliasMap = buildAliasMap(rawAliases);
  const citiesByCode = new Map(
    citiesRecords.map((record) => [
      String(record['סמל_ישוב']).trim(),
      {
        district: normalizeWhitespace(record['שם_נפה']),
        englishName: titleCaseEnglish(record['שם_ישוב_לועזי']),
      },
    ])
  );

  const generated = [];
  const usedIds = new Set();

  for (const record of unifiedRecords) {
    const code = String(record.symbol_number ?? '').trim();
    const nameHe = normalizeWhitespace(record.name_in_hebrew);

    if (!code || code === '0' || !nameHe || nameHe === 'לא רשום') {
      continue;
    }

    if (!record.X || !record.Y) {
      continue;
    }

    const nameEn = titleCaseEnglish(record.name_in_english);
    const cityRecord = citiesByCode.get(code);
    const fallbackEnglishName = cityRecord?.englishName || nameEn || `Settlement ${code}`;
    const { lat, lng } = toLatLng(record.X, record.Y);
    const existing = pickExisting(
      existingByHebrew,
      existingByEnglish,
      nameHe,
      fallbackEnglishName
    );

    let id = existing?.id ?? slugifyId(fallbackEnglishName, code);

    if (!existing) {
      while (usedIds.has(id)) {
        id = `${id}_${code}`;
      }
    }

    usedIds.add(id);

    const aliases = new Set(existing?.aliases ?? []);
    const canonicalAliasSet = aliasMap.get(normalizeKey(nameHe));

    if (canonicalAliasSet) {
      for (const alias of canonicalAliasSet) {
        if (normalizeKey(alias) !== normalizeKey(nameHe)) {
          aliases.add(alias);
        }
      }
    }

    if (
      cityRecord?.englishName &&
      normalizeKey(cityRecord.englishName) !== normalizeKey(fallbackEnglishName)
    ) {
      aliases.add(cityRecord.englishName);
    }

    generated.push({
      id,
      name_he: existing?.name_he ?? nameHe,
      name_en: existing?.name_en ?? fallbackEnglishName,
      lat: existing?.lat ?? lat,
      lng: existing?.lng ?? lng,
      region: existing?.region ?? inferRegion(lat, lng, cityRecord?.district),
      type: existing?.type ?? inferType(nameHe),
      aliases: [...aliases]
        .map(normalizeWhitespace)
        .filter(Boolean)
        .filter((alias) => normalizeKey(alias) !== normalizeKey(nameHe))
        .filter((alias) => normalizeKey(alias) !== normalizeKey(fallbackEnglishName))
        .sort((aliasA, aliasB) => aliasA.localeCompare(aliasB, 'he')),
    });
  }

  generated.sort((entryA, entryB) => {
    const regionDiff =
      REGION_ORDER.indexOf(entryA.region) - REGION_ORDER.indexOf(entryB.region);

    if (regionDiff !== 0) {
      return regionDiff;
    }

    return entryA.name_he.localeCompare(entryB.name_he, 'he');
  });

  const content = `import type { Settlement } from '../types';\n\n// Generated by \`npm run localities:build\` from official data.gov.il registries.\nexport const settlements: Settlement[] = [\n${generated.map(formatSettlementEntry).join('\n')}\n];\n`;

  await writeFile(SETTLEMENTS_PATH, content, 'utf8');

  console.log(`Generated ${generated.length} localities.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});