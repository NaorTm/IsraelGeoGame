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

const lookup = Object.fromEntries(
  Object.entries(districtSettlementIds).flatMap(([districtId, settlementIds]) =>
    settlementIds.map((settlementId) => [settlementId, districtId])
  )
);

const lines = Object.entries(lookup)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([settlementId, districtId]) => `  ${JSON.stringify(settlementId)}: ${JSON.stringify(districtId)},`);

const output = `export const settlementDistrictById: Record<string, string> = {\n${lines.join('\n')}\n};\n`;

const outputPath = path.join(projectRoot, 'src/data/settlementDistrictLookup.ts');
fs.writeFileSync(outputPath, output, 'utf8');

console.log(`Generated settlementDistrictLookup.ts with ${Object.keys(lookup).length} entries.`);
