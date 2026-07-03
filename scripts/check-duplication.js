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
    // to 75/2283). Ratchet DOWN only from here.
    name: 'src+scripts',
    directories: ['src', 'scripts'],
    baselineCloneGroupCount: 75,
    baselineDuplicatedLineCount: 2283,
    reportOutputDirectory: 'test-output/analysis/jscpd-src-scripts',
    strictEligible: true,
  },
  {
    // Ratcheted DOWN 2026-07-03 after deduplicating the SQL-fallback
    // services-rows clones in the convergence snapshot test cases
    // (was 842/32222, anchored 2026-07-02 post primitive-alias codemod).
    // Ratchet DOWN only from here.
    name: 'test',
    directories: ['test'],
    baselineCloneGroupCount: 841,
    baselineDuplicatedLineCount: 32182,
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
