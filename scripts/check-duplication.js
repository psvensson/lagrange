/**
 * Runs jscpd against repo-owned runtime and script code and enforces a
 * duplication ratchet from the current baseline.
 *
 * Default mode: fails if clone groups or duplicated lines exceed baseline.
 * --strict mode: fails if any duplicate clone group is present.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';

import {
  getRepoPath,
  printRatchetTighteningHint,
} from './metric-check-helpers.js';

const BASELINE_CLONE_GROUP_COUNT = 15;
const BASELINE_DUPLICATED_LINE_COUNT = 417;
const MINIMUM_LINE_COUNT = 20;
const MINIMUM_TOKEN_COUNT = 100;
const STRICT_FLAG = '--strict';
const SOURCE_DIRECTORIES = ['src', 'scripts'];
const REPORT_OUTPUT_DIRECTORY =
  'test-output/analysis/jscpd-src-scripts';
const REPORT_FILE_NAME = 'jscpd-report.json';
const REPORT_RELATIVE_PATH =
  `${REPORT_OUTPUT_DIRECTORY}/${REPORT_FILE_NAME}`;
const require = createRequire(import.meta.url);
const {detectClones} = require('jscpd');
const JSCPD_OPTIONS = {
  path: SOURCE_DIRECTORIES,
  minLines: MINIMUM_LINE_COUNT,
  minTokens: MINIMUM_TOKEN_COUNT,
  format: ['javascript'],
  reporters: ['json'],
  output: REPORT_OUTPUT_DIRECTORY,
  silent: true,
};
const strict = process.argv.includes(STRICT_FLAG);

await detectClones(JSCPD_OPTIONS);
const reportPath = getRepoPath(REPORT_RELATIVE_PATH);

if (!fs.existsSync(reportPath)) {
  throw new Error(`jscpd did not produce ${REPORT_RELATIVE_PATH}.`);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const totals = report.statistics.total;
const sourceStats = Object.entries(report.statistics.formats.javascript.sources)
  .map(([filePath, stats]) => ({
    filePath,
    duplicatedLines: stats.duplicatedLines,
    cloneCount: stats.clones,
  }))
  .filter((entry) => entry.duplicatedLines > 0)
  .sort((left, right) => right.duplicatedLines - left.duplicatedLines)
  .slice(0, 10);

if (strict) {
  if (totals.clones > 0) {
    console.log('Duplication violations:\n');
    for (const entry of sourceStats) {
      console.log(
        `${entry.filePath}: ${entry.cloneCount} clone group(s), ` +
        `${entry.duplicatedLines} duplicated line(s)`,
      );
    }
    console.log(`\n${totals.clones} clone group(s) found.`);
    process.exit(1);
  }
  console.log('No duplication detected.');
} else {
  const exceedsCloneBaseline = totals.clones > BASELINE_CLONE_GROUP_COUNT;
  const exceedsLineBaseline =
    totals.duplicatedLines > BASELINE_DUPLICATED_LINE_COUNT;

  if (exceedsCloneBaseline || exceedsLineBaseline) {
    console.log(
      `Duplication ratchet FAILED: ${totals.clones} clone group(s) and ` +
      `${totals.duplicatedLines} duplicated line(s) exceed the current ` +
      `baseline of ${BASELINE_CLONE_GROUP_COUNT} clone group(s) and ` +
      `${BASELINE_DUPLICATED_LINE_COUNT} duplicated line(s).\n`,
    );
    for (const entry of sourceStats) {
      console.log(
        `${entry.filePath}: ${entry.cloneCount} clone group(s), ` +
        `${entry.duplicatedLines} duplicated line(s)`,
      );
    }
    process.exit(1);
  }
  console.log(
    `Duplication ratchet OK: ${totals.clones}/` +
    `${BASELINE_CLONE_GROUP_COUNT} clone group(s), ` +
    `${totals.duplicatedLines}/${BASELINE_DUPLICATED_LINE_COUNT} ` +
    'duplicated line(s).',
  );
  console.log(`Saved duplication report to ${REPORT_RELATIVE_PATH}.`);
  printRatchetTighteningHint(
    'scripts/check-duplication.js clone baseline',
    totals.clones,
    BASELINE_CLONE_GROUP_COUNT,
    'scripts/check-duplication.js',
  );
  printRatchetTighteningHint(
    'scripts/check-duplication.js duplicated-line baseline',
    totals.duplicatedLines,
    BASELINE_DUPLICATED_LINE_COUNT,
    'scripts/check-duplication.js',
  );
}
