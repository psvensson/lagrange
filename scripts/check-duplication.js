/**
 * Runs jscpd against repo-owned runtime, script, and test code and enforces
 * a duplication ratchet from the current baseline per target.
 *
 * Targets are ratcheted independently so the tight src/scripts baseline is
 * not diluted by the larger test corpus.
 *
 * Default mode: fails if any target's clone groups or duplicated lines
 * exceed that target's baseline.
 * --strict mode: fails if any duplicate clone group is present in the
 * src/scripts target (test duplication stays ratchet-governed only).
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';

import {
  getRepoPath,
  printRatchetTighteningHint,
} from './metric-check-helpers.js';

const LOCAL_STR_JSCPD = 'jscpd';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_13JIR = 'Duplication violations:\n';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_1ARTH = 'No duplication detected.';
const LOCAL_STR_DUPLICATED_LINE_S = 'duplicated line(s).';
const LOCAL_STR_1Q3KT = 'scripts/check-duplication.js';

const MINIMUM_LINE_COUNT = 20;
const MINIMUM_TOKEN_COUNT = 100;
const STRICT_FLAG = '--strict';
const REPORT_FILE_NAME = 'jscpd-report.json';
const TOP_OFFENDER_COUNT = 10;

const RATCHET_TARGETS = [
  {
    // Re-anchored 2026-07-02: the 16/529 baseline had silently gone stale
    // (81/2853 measured at c9d41aae before that day's lint sweep reduced it
    // to 75/2283). Ratcheted DOWN 2026-07-05 after extracting the shared
    // count-based baseline machinery + getEnclosingFunctionName into
    // guideline-check-shared.js. Ratchet DOWN only from here.
    name: 'src+scripts',
    directories: ['src', 'scripts'],
    // 2026-07-25: tightened 73/2239 -> 66/2095 (measured; one-way-baseline rule).
    // 2026-07-28: tightened 66/2095 -> 66/2088 (complexity-checker violation
    // mapping hoisted into metric-check-helpers; measured in a clean worktree).
    // 2026-08-05: tightened 66/2088 -> 65/2063 (quest evidence-harness receipt
    // loop extracted into quest-evidence-harness-runtime.js; measured).
    // 2026-08-07: tightened 65/2063 -> 63/2003 (measured after the V2a/V4
    // proof-cone landings; one-way-baseline rule).
    // 2026-08-11: tightened 63/2003 -> 62/1970 after the available-read
    // fixture guard removed the duplicated over-target cache setup.
    baselineCloneGroupCount: 62,
    baselineDuplicatedLineCount: 1970,
    reportOutputDirectory: 'test-output/analysis/jscpd-src-scripts',
    strictEligible: true,
  },
  {
    // Ratcheted DOWN 2026-07-03 after deduplicating the SQL-fallback
    // services-rows clones in the convergence snapshot test cases
    // (was 842/32222, anchored 2026-07-02 post primitive-alias codemod).
    // Re-anchored 2026-07-05: 842/32226 was already the measured state at
    // 2009194a (a pre-2026-07-05 commit landed one group without running
    // this gate locally — the drift the test:static wiring now prevents).
    // Re-anchored at the executable no-skip test corpus after the
    // proof-integrity cutover. Ratchet DOWN only from here.
    name: 'test',
    directories: ['test'],
    // 2026-07-19: tightened 845/32308 -> 842/32209 (measured; one-way-baseline rule).
    // 2026-07-25: re-measured 842/32140 after extracting the shared
    // binding-compilation test harness; line baseline tightened, group
    // baseline already exact.
    // 2026-07-30: tightened 842/32140 -> 841/32119 after removing the
    // unconsumed measured-P0 planning export surface.
    // 2026-08-03: tightened 841/32119 -> 839/32044 (measured after the
    // call-cell gate-restoration batch; one-way-baseline rule).
    // 2026-08-03: tightened 839/32044 -> 838/31997 (measured after the
    // bounded-parallel-shard-dispatch landing; one-way-baseline rule).
    // 2026-08-03: tightened 838/31997 -> 836/31886 (measured after
    // extracting the shared two-node call-cell deployment fixture for
    // the HTTP-to-call composition proof; one-way-baseline rule).
    // 2026-08-04: tightened 836/31886 -> 834/31824 (measured after the
    // split/merge mirror-hardening batch; one-way-baseline rule).
    // 2026-08-08: tightened 834/31824 -> 833/31738 (measured after
    // extracting the quorum-conditioned remove-safety tail fixture
    // builders; one-way-baseline rule).
    // 2026-08-10: tightened 833/31738 -> 832/31718 (measured after
    // extracting the shared stall-repro stack builder in the
    // over-target-cap-spread-cure-wipe test additions; one-way-baseline
    // rule).
    // 2026-08-10: tightened 832/31718 -> 828/31601 (measured after
    // extracting the shared user-table topology helpers from the
    // public-path baseline scenario for user-table-leader-placement-
    // spread; one-way-baseline rule).
    // 2026-08-11: tightened 828/31601 -> 827/31572 after the available-read
    // fixture guard extracted the shared over-target cache setup.
    // 2026-08-11: tightened 827/31572 -> 826/31551 after the join mutation-
    // outcome matrix consolidated duplicated cases.
    baselineCloneGroupCount: 826,
    baselineDuplicatedLineCount: 31551,
    reportOutputDirectory: 'test-output/analysis/jscpd-test',
    strictEligible: false,
  },
];

const require = createRequire(import.meta.url);
const {detectClones} = require(LOCAL_STR_JSCPD);
const strict = process.argv.includes(STRICT_FLAG);

/**
 * Run jscpd for one ratchet target and return its parsed report totals.
 * @param {object} target
 * @return {Promise<{totals: object, sourceStats: object[]}>}
 */
async function measureTargetDuplication(target) {
  await detectClones({
    path: target.directories,
    minLines: MINIMUM_LINE_COUNT,
    minTokens: MINIMUM_TOKEN_COUNT,
    format: ['javascript'],
    reporters: ['json'],
    output: target.reportOutputDirectory,
    silent: true,
  });
  const reportRelativePath =
    `${target.reportOutputDirectory}/${REPORT_FILE_NAME}`;
  const reportPath = getRepoPath(reportRelativePath);
  if (!fs.existsSync(reportPath)) {
    throw new Error(`jscpd did not produce ${reportRelativePath}.`);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const sourceStats =
    Object.entries(report.statistics.formats.javascript.sources)
      .map(([filePath, stats]) => ({
        filePath,
        duplicatedLines: stats.duplicatedLines,
        cloneCount: stats.clones,
      }))
      .filter((entry) => entry.duplicatedLines > LOCAL_NUM_ZERO)
      .sort((left, right) => right.duplicatedLines - left.duplicatedLines)
      .slice(LOCAL_NUM_ZERO, TOP_OFFENDER_COUNT);
  return {
    totals: report.statistics.total,
    sourceStats,
    reportRelativePath,
  };
}

/**
 * Print the top duplication offenders for a target.
 * @param {object[]} sourceStats
 */
function printTopOffenders(sourceStats) {
  for (const entry of sourceStats) {
    console.log(
      `${entry.filePath}: ${entry.cloneCount} clone group(s), ` +
      `${entry.duplicatedLines} duplicated line(s)`,
    );
  }
}

let failed = false;

for (const target of RATCHET_TARGETS) {
  if (strict && target.strictEligible !== true) {
    continue;
  }
  const {totals, sourceStats, reportRelativePath} =
    await measureTargetDuplication(target);

  if (strict) {
    if (totals.clones > LOCAL_NUM_ZERO) {
      console.log(LOCAL_STR_13JIR);
      printTopOffenders(sourceStats);
      console.log(
        `\n[${target.name}] ${totals.clones} clone group(s) found.`,
      );
      failed = true;
      continue;
    }
    console.log(`[${target.name}] ${LOCAL_STR_1ARTH}`);
    continue;
  }

  const exceedsCloneBaseline =
    totals.clones > target.baselineCloneGroupCount;
  const exceedsLineBaseline =
    totals.duplicatedLines > target.baselineDuplicatedLineCount;

  if (exceedsCloneBaseline || exceedsLineBaseline) {
    console.log(
      `[${target.name}] Duplication ratchet FAILED: ${totals.clones} ` +
      `clone group(s) and ${totals.duplicatedLines} duplicated line(s) ` +
      `exceed the current baseline of ${target.baselineCloneGroupCount} ` +
      `clone group(s) and ${target.baselineDuplicatedLineCount} ` +
      'duplicated line(s).\n',
    );
    printTopOffenders(sourceStats);
    failed = true;
    continue;
  }
  console.log(
    `[${target.name}] Duplication ratchet OK: ${totals.clones}/` +
    `${target.baselineCloneGroupCount} clone group(s), ` +
    `${totals.duplicatedLines}/${target.baselineDuplicatedLineCount} ` +
    LOCAL_STR_DUPLICATED_LINE_S,
  );
  console.log(`Saved duplication report to ${reportRelativePath}.`);
  printRatchetTighteningHint(
    `scripts/check-duplication.js [${target.name}] clone baseline`,
    totals.clones,
    target.baselineCloneGroupCount,
    LOCAL_STR_1Q3KT,
  );
  printRatchetTighteningHint(
    `scripts/check-duplication.js [${target.name}] duplicated-line baseline`,
    totals.duplicatedLines,
    target.baselineDuplicatedLineCount,
    LOCAL_STR_1Q3KT,
  );
}

if (failed) {
  process.exit(LOCAL_NUM_ONE);
}
