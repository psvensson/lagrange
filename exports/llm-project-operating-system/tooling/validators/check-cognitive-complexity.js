/**
 * Runs eslint with the sonar cognitive complexity rule and reports only
 * cognitive-complexity violations, ignoring unrelated lint errors.
 *
 * Default mode: fails if violations exceed the current baseline count.
 * --strict mode: fails if any function exceeds the target threshold.
 */

import * as sonarjsNamespace from 'eslint-plugin-sonarjs';
import {LegacyESLint} from 'eslint/use-at-your-own-risk';

import {
  printRatchetTighteningHint,
  writeJsonReport,
} from './metric-check-helpers.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_1A2OZ = 'tooling/validators/check-cognitive-complexity.js';

const TARGET_THRESHOLD = 20;
const BASELINE_COUNT = 144;
const STRICT_FLAG = '--strict';
const SCOPED_FLAG = '--scoped';
const ARG_SEPARATOR = '--';
const SONAR_RULE_ID = 'sonarjs/cognitive-complexity';
const SONAR_PLUGIN_NAME = 'sonarjs';
const SOURCE_DIRECTORIES = ['src/', 'scripts/'];
const REPORT_RELATIVE_PATH =
  'test-output/analysis/cognitive-complexity-src-scripts.json';
const SCOPED_REPORT_RELATIVE_PATH =
  'test-output/analysis/cognitive-complexity-scoped.json';
const PRINT_LIMIT = 40;
const FILTERED_FLAGS = new Set([
  STRICT_FLAG,
  SCOPED_FLAG,
  ARG_SEPARATOR,
]);
const SONAR_PLUGIN =
  sonarjsNamespace.default.default ?? sonarjsNamespace.default;
const ESLINT_OVERRIDE_CONFIG = {
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2022: true,
  },
  plugins: [SONAR_PLUGIN_NAME],
  rules: {
    [SONAR_RULE_ID]: ['error', TARGET_THRESHOLD],
  },
};
const args = process.argv.slice(LOCAL_NUM_TWO);
const strict = args.includes(STRICT_FLAG);
const scoped = args.includes(SCOPED_FLAG);
const scopedTargets = args.filter((arg) => !FILTERED_FLAGS.has(arg));

if (scoped && scopedTargets.length === LOCAL_NUM_ZERO) {
  console.error(
    'Usage: npm run test:complexity:cognitive:scoped -- ' +
    '<file-or-directory> [...]',
  );
  process.exit(LOCAL_NUM_ONE);
}

const lintTargets = scoped ? scopedTargets : SOURCE_DIRECTORIES;
const reportRelativePath = scoped ?
  SCOPED_REPORT_RELATIVE_PATH :
  REPORT_RELATIVE_PATH;

const eslint = new LegacyESLint({
  cwd: process.cwd(),
  useEslintrc: false,
  plugins: {
    [SONAR_PLUGIN_NAME]: SONAR_PLUGIN,
  },
  overrideConfig: ESLINT_OVERRIDE_CONFIG,
});
const results = await eslint.lintFiles(lintTargets);
const violations = results.flatMap((result) =>
  result.messages
    .filter((message) => message.ruleId === SONAR_RULE_ID)
    .map((message) => ({
      filePath: result.filePath,
      line: message.line,
      column: message.column,
      message: message.message,
    })),
);
const count = violations.length;

writeJsonReport(reportRelativePath, {
  targetThreshold: TARGET_THRESHOLD,
  baselineCount: BASELINE_COUNT,
  scoped,
  targets: lintTargets,
  count,
  violations,
});

function printViolations(entries) {
  for (const violation of entries.slice(LOCAL_NUM_ZERO, PRINT_LIMIT)) {
    console.log(
      `${violation.filePath}:${violation.line}:${violation.column} ` +
      `${violation.message}`,
    );
  }
  if (entries.length > PRINT_LIMIT) {
    console.log(
      `... ${entries.length - PRINT_LIMIT} more violation(s). Full report: ` +
      `${reportRelativePath}.`,
    );
  }
}

if (strict) {
  if (count > LOCAL_NUM_ZERO) {
    console.log(
      `Cognitive complexity violations (threshold: ${TARGET_THRESHOLD}):\n`,
    );
    printViolations(violations);
    console.log(`\n${count} violation(s) found.`);
    process.exit(LOCAL_NUM_ONE);
  }
  console.log(
    `No cognitive complexity violations (threshold: ${TARGET_THRESHOLD}).`,
  );
} else if (scoped) {
  console.log(
    `Scoped cognitive complexity ratchet: ${count} violation(s) in ` +
    `${lintTargets.length} target(s) (threshold: ${TARGET_THRESHOLD}).`,
  );
  if (count > LOCAL_NUM_ZERO) {
    printViolations(violations);
  }
  console.log(`Saved cognitive complexity report to ${reportRelativePath}.`);
} else {
  if (count > BASELINE_COUNT) {
    console.log(
      `Cognitive complexity ratchet FAILED: ${count} violations exceeds ` +
      `baseline of ${BASELINE_COUNT}.\n`,
    );
    printViolations(violations);
    process.exit(LOCAL_NUM_ONE);
  }
  console.log(
    `Cognitive complexity ratchet OK: ${count}/${BASELINE_COUNT} violations ` +
    `(threshold: ${TARGET_THRESHOLD}).`,
  );
  console.log(`Saved cognitive complexity report to ${reportRelativePath}.`);
  printRatchetTighteningHint(
    LOCAL_STR_1A2OZ,
    count,
    BASELINE_COUNT,
    LOCAL_STR_1A2OZ,
  );
}
