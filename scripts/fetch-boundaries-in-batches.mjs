import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/workspaces/IsraelGeoGame';
const METADATA_PATH = path.join(ROOT, 'src/data/boundaries/metadata.ts');
const DEFAULT_CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 20);
const DEFAULT_START_INDEX = Number(process.env.START_INDEX ?? 0);
const MAX_BATCHES = Number(process.env.MAX_BATCHES ?? 0);

function parseApproximateIds(source) {
  return Array.from(source.matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function chunkItems(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function main() {
  const metadataSource = await readFile(METADATA_PATH, 'utf8');
  const approximateIds = parseApproximateIds(metadataSource);

  if (approximateIds.length === 0) {
    console.log('No approximate localities remain.');
    return;
  }

  const chunks = chunkItems(approximateIds.slice(DEFAULT_START_INDEX), DEFAULT_CHUNK_SIZE);
  const limitedChunks = MAX_BATCHES > 0 ? chunks.slice(0, MAX_BATCHES) : chunks;

  for (const [chunkIndex, ids] of limitedChunks.entries()) {
    const label = `${DEFAULT_START_INDEX + chunkIndex * DEFAULT_CHUNK_SIZE + 1}-${DEFAULT_START_INDEX + chunkIndex * DEFAULT_CHUNK_SIZE + ids.length}`;

    console.log(`Fetching chunk ${chunkIndex + 1}/${limitedChunks.length} (${label})`);

    try {
      execFileSync('node', ['scripts/fetch-settlement-boundaries.mjs'], {
        cwd: ROOT,
        env: {
          ...process.env,
          BOUNDARY_IDS: ids.join(','),
        },
        stdio: 'inherit',
      });
    } catch (error) {
      console.warn(`Chunk ${chunkIndex + 1} finished with unresolved localities.`);
    }

    execFileSync('node', ['scripts/split-settlement-boundaries.mjs'], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});