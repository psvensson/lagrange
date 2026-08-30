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

import path from 'node:path';
import {main as runKnip} from 'knip';
import {createOptions} from 'knip/session';

import {printRatchetTighteningHint} from './metric-check-helpers.js';

// 2026-08-03: tightened 1448 -> 1445 (un-exported the internal-only
// call-cell and write-health surfaces; one-way-baseline rule).
// 2026-08-11: tightened 1444 -> 1443 per checker hint after the mutation
// outcome normalizer removed one divergent gateway dependency.
// 2026-08-23: tightened 1442 -> 1441 per checker hint after the
// no-use-before-define sweep and admin literal-table extraction.
// 2026-08-30: tightened 1441 -> 1439 while landing the self-move holder-release
// interlock fix (consumer-parity and holder-release fixtures stopped exporting
// helpers nothing imports).
const BASELINE_UNUSED_EXPORT_COUNT = 1439;
const EXIT_FAILURE = 1;
const TOP_OFFENDER_COUNT = 10;
const SELF_REFERENCE = 'scripts/check-unused-exports.js';

/**
 * Run knip and return its parsed unused-export issues.
 * knip exits non-zero when it finds issues, so tolerate that and parse
 * stdout either way.
 * @return {Promise<object[]>}
 */
async function collectKnipExportIssues() {
  const options = await createOptions({
    args: {'include': ['exports'], 'no-progress': true},
  });
  const report = await runKnip(options);
  return Object.values(report.issues.exports).map((symbols) => {
    const symbolIssues = Object.values(symbols);
    return {
      filePath: path.relative(process.cwd(), symbolIssues[0].filePath),
      unusedExportCount: symbolIssues.length,
    };
  });
}

const issues = await collectKnipExportIssues();
const perFile = issues
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
