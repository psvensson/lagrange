/**
 * Runs knip's unused-export detection and enforces a ratchet from the
 * current baseline, mirroring the scripts/check-duplication.js idiom.
 *
 * The gated `test:unused` knip run excludes exports entirely, so without
 * this ratchet the unused-export backlog grows unbounded (1,607 across
 * 335 files when the ratchet was introduced on 2026-07-02, after the
 * primitive-alias codemod deleted two of the original 1,609).
 * Ratchet DOWN only from here.
 */

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

import {printRatchetTighteningHint} from './metric-check-helpers.js';

const execFileAsync = promisify(execFile);

const BASELINE_UNUSED_EXPORT_COUNT = 1607;
const EXIT_FAILURE = 1;
const TOP_OFFENDER_COUNT = 10;
const KNIP_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const SELF_REFERENCE = 'scripts/check-unused-exports.js';

/**
 * Run knip and return its parsed unused-export issues.
 * knip exits non-zero when it finds issues, so tolerate that and parse
 * stdout either way.
 * @return {Promise<object[]>}
 */
async function collectKnipExportIssues() {
  let stdout;
  try {
    ({stdout} = await execFileAsync(
      'npx',
      ['knip', '--include', 'exports', '--reporter', 'json'],
      {maxBuffer: KNIP_MAX_BUFFER_BYTES},
    ));
  } catch (error) {
    if (typeof error?.stdout !== 'string' || error.stdout.length === 0) {
      throw error;
    }
    stdout = error.stdout;
  }
  const report = JSON.parse(stdout);
  return Array.isArray(report?.issues) ? report.issues : [];
}

const issues = await collectKnipExportIssues();
const perFile = issues
  .map((issue) => ({
    filePath: issue.file,
    unusedExportCount: (issue.exports || []).length,
  }))
  .filter((entry) => entry.unusedExportCount > 0)
  .sort((left, right) => right.unusedExportCount - left.unusedExportCount);
const totalUnusedExports = perFile.reduce(
  (sum, entry) => sum + entry.unusedExportCount,
  0,
);

if (totalUnusedExports > BASELINE_UNUSED_EXPORT_COUNT) {
  console.log(
    `Unused-export ratchet FAILED: ${totalUnusedExports} unused export(s) ` +
    `exceed the current baseline of ${BASELINE_UNUSED_EXPORT_COUNT}.\n`,
  );
  for (const entry of perFile.slice(0, TOP_OFFENDER_COUNT)) {
    console.log(`${entry.filePath}: ${entry.unusedExportCount} unused export(s)`);
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
printRatchetTighteningHint(
  'scripts/check-unused-exports.js baseline',
  totalUnusedExports,
  BASELINE_UNUSED_EXPORT_COUNT,
  SELF_REFERENCE,
);
