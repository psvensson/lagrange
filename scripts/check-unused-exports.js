/**
 * Runs knip's unused-export detection and enforces both a count and an
 * identity ratchet from the committed baseline.
 *
 * The gated `test:unused` knip run excludes exports entirely, so without
 * this ratchet the unused-export backlog grows unbounded.
 * New unused export identities (<filePath>::<symbolName>) always fail even if
 * unrelated unused exports were removed in the same change.
 * Ratchet DOWN only from here.
 */

import fs from 'node:fs';
import path from 'node:path';
import {main as runKnip} from 'knip';
import {createOptions} from 'knip/session';

import {printRatchetTighteningHint} from './metric-check-helpers.js';

// 2026-08-03: tightened 1448 -> 1445 (un-exported the internal-only
// call-cell and write-health surfaces; one-way-baseline rule).
// 2026-11-23 (integration composition Stage 1 + Stage 2 + unused-exports):
// tightened 1316 -> 1305 on the checker hint after de-exporting 37
// internal-only symbols in endpoint-sync and service-discovery-catalog.
// 2026-11-24 (Wave 8 & 44-finding deletion audit): tightened 1305 -> 1300 on
// the checker hint after deleting dead legacy modules and de-exporting
// internal symbols.
// 2026-11-25 (post-0.4.2 review remediation): tightened 1300 -> 1297 on the
// checker hint after consuming countSqlParameterPlaceholders and
// extractUpdateWhereColumns in parameterized CDC extraction and de-exporting
// PUBLICATION_RECOVERY_TERMINAL_PUBLICATION_STATUSES.
const BASELINE_UNUSED_EXPORT_COUNT = 1297;
const EXIT_FAILURE = 1;
const ZERO_COUNT = 0;
const JSON_INDENT = 2;
const TOP_OFFENDER_COUNT = 10;
const PRINT_LIMIT = 40;
const UTF8_ENCODING = 'utf8';
const WRITE_BASELINE_FLAG = '--write-baseline';
const IDENTITY_SEPARATOR = '::';
const SELF_REFERENCE = 'scripts/check-unused-exports.js';
const BASELINE_LABEL = 'scripts/check-unused-exports.js baseline';
const BASELINE_RELATIVE_PATH =
  'scripts/baselines/unused-exports-ratchet-baseline.json';
const KNIP_EXPORT_INCLUDE = 'exports';
const HEADER_NEW_UNUSED_EXPORTS = 'New unused exports';
const HEADER_REMOVED_UNUSED_EXPORTS_FAILURE =
  'Removed unused exports (cannot offset new unused exports)';
const HEADER_REMOVED_UNUSED_EXPORTS_BASELINE =
  'Removed unused-export baseline identities';
const HEADER_TOP_FILES = '\nTop files by unused export count:';

/**
 * Run knip and return its parsed unused-export issues per file, including
 * sorted symbol names and stable `<filePath>::<symbolName>` identities.
 * @return {Promise<Array<{
 *   filePath: string,
 *   unusedExportCount: number,
 *   symbols: string[],
 *   identities: string[]
 * }>>}
 */
async function collectKnipExportIssues() {
  const options = await createOptions({
    args: {'include': [KNIP_EXPORT_INCLUDE], 'no-progress': true},
  });
  const report = await runKnip(options);
  return Object.values(report.issues.exports).map((symbols) => {
    const symbolIssues = Object.values(symbols);
    const filePath = path.relative(process.cwd(), symbolIssues[0].filePath);
    const sortedSymbols = symbolIssues
      .map((issue) => issue.symbol)
      .sort((left, right) => left.localeCompare(right));
    const identities = sortedSymbols.map(
      (symbolName) => `${filePath}${IDENTITY_SEPARATOR}${symbolName}`,
    );
    return {
      filePath,
      unusedExportCount: symbolIssues.length,
      symbols: sortedSymbols,
      identities,
    };
  });
}

function printIdentityList(header, identities) {
  if (identities.length === ZERO_COUNT) {
    return;
  }
  console.log(`\n${header} (${identities.length}):`);
  for (const identity of identities.slice(ZERO_COUNT, PRINT_LIMIT)) {
    console.log(`  ${identity}`);
  }
  if (identities.length > PRINT_LIMIT) {
    console.log(`  ... ${identities.length - PRINT_LIMIT} more.`);
  }
}

function readBaselineIdentities(baselineFilePath) {
  if (!fs.existsSync(baselineFilePath)) {
    console.error(
      `Unused-export baseline file is missing: ${BASELINE_RELATIVE_PATH}.`,
    );
    process.exit(EXIT_FAILURE);
  }
  const parsed = JSON.parse(fs.readFileSync(baselineFilePath, UTF8_ENCODING));
  if (!Array.isArray(parsed)) {
    console.error(
      `Unused-export baseline file must contain a JSON array: ${BASELINE_RELATIVE_PATH}.`,
    );
    process.exit(EXIT_FAILURE);
  }
  return parsed;
}

function writeBaselineIdentities(baselineFilePath, identities) {
  fs.mkdirSync(path.dirname(baselineFilePath), {recursive: true});
  fs.writeFileSync(
    baselineFilePath,
    `${JSON.stringify(identities, null, JSON_INDENT)}\n`,
    UTF8_ENCODING,
  );
  console.log(
    `Wrote ${identities.length} unused-export baseline identities to ` +
    `${BASELINE_RELATIVE_PATH}.`,
  );
}

const args = process.argv.slice(2);
const writeBaseline = args.includes(WRITE_BASELINE_FLAG);
const issues = await collectKnipExportIssues();
const perFile = issues
  .filter((entry) => entry.unusedExportCount > ZERO_COUNT)
  .sort((left, right) =>
    right.unusedExportCount - left.unusedExportCount ||
    left.filePath.localeCompare(right.filePath));
const totalUnusedExports = perFile.reduce(
  (sum, entry) => sum + entry.unusedExportCount,
  ZERO_COUNT,
);
const currentIdentities = perFile
  .flatMap((entry) => entry.identities)
  .sort((left, right) => left.localeCompare(right));
const baselineFilePath = path.resolve(process.cwd(), BASELINE_RELATIVE_PATH);

if (writeBaseline) {
  writeBaselineIdentities(baselineFilePath, currentIdentities);
  process.exit(ZERO_COUNT);
}

const baselineIdentities = readBaselineIdentities(baselineFilePath);
const baselineSet = new Set(baselineIdentities);
const currentSet = new Set(currentIdentities);
const newUnusedExports = currentIdentities.filter(
  (identity) => !baselineSet.has(identity),
);
const removedUnusedExports = baselineIdentities.filter(
  (identity) => !currentSet.has(identity),
);

if (newUnusedExports.length > ZERO_COUNT ||
    totalUnusedExports > BASELINE_UNUSED_EXPORT_COUNT) {
  console.log(
    `Unused-export ratchet FAILED: ${totalUnusedExports}/` +
    `${BASELINE_UNUSED_EXPORT_COUNT} unused export(s) ` +
    `(${newUnusedExports.length} new, ` +
    `${removedUnusedExports.length} removed).\n`,
  );
  printIdentityList(HEADER_NEW_UNUSED_EXPORTS, newUnusedExports);
  printIdentityList(
    HEADER_REMOVED_UNUSED_EXPORTS_FAILURE,
    removedUnusedExports,
  );
  console.log(HEADER_TOP_FILES);
  for (const entry of perFile.slice(ZERO_COUNT, TOP_OFFENDER_COUNT)) {
    console.log(
      `  ${entry.filePath}: ${entry.unusedExportCount} unused export(s)`,
    );
  }
  console.log(
    '\nRun `npm run test:unused:exports` for the full list; remove the new ' +
    'unused exports or delete newly-dead code.',
  );
  process.exit(EXIT_FAILURE);
}

console.log(
  `Unused-export ratchet OK: ${totalUnusedExports}/` +
  `${BASELINE_UNUSED_EXPORT_COUNT} unused export(s) across ` +
  `${perFile.length} file(s).`,
);
if (removedUnusedExports.length > ZERO_COUNT) {
  printIdentityList(
    HEADER_REMOVED_UNUSED_EXPORTS_BASELINE,
    removedUnusedExports,
  );
  console.log(
    `Run \`node scripts/check-unused-exports.js ${WRITE_BASELINE_FLAG}\` ` +
    `to tighten ${BASELINE_RELATIVE_PATH}.`,
  );
}
printRatchetTighteningHint(
  BASELINE_LABEL,
  totalUnusedExports,
  BASELINE_UNUSED_EXPORT_COUNT,
  SELF_REFERENCE,
);
