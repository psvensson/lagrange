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
const LOCAL_STR_1A2OZ = 'scripts/check-cognitive-complexity.js';

const TARGET_THRESHOLD = 20;
const BASELINE_COUNT = 144;
const STRICT_FLAG = '--strict';
const SONAR_RULE_ID = 'sonarjs/cognitive-complexity';
const SONAR_PLUGIN_NAME = 'sonarjs';
const SOURCE_DIRECTORIES = ['src/', 'scripts/'];
const REPORT_RELATIVE_PATH =
  'test-output/analysis/cognitive-complexity-src-scripts.json';
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
const strict = process.argv.includes(STRICT_FLAG);

const eslint = new LegacyESLint({
  cwd: process.cwd(),
  useEslintrc: false,
  plugins: {
    [SONAR_PLUGIN_NAME]: SONAR_PLUGIN,
  },
  overrideConfig: ESLINT_OVERRIDE_CONFIG,
});
const results = await eslint.lintFiles(SOURCE_DIRECTORIES);
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

writeJsonReport(REPORT_RELATIVE_PATH, {
  targetThreshold: TARGET_THRESHOLD,
  baselineCount: BASELINE_COUNT,
  count,
  violations,
});

if (strict) {
  if (count > LOCAL_NUM_ZERO) {
    console.log(
      `Cognitive complexity violations (threshold: ${TARGET_THRESHOLD}):\n`,
    );
    for (const violation of violations) {
      console.log(
        `${violation.filePath}:${violation.line}:${violation.column} ` +
        `${violation.message}`,
      );
    }
    console.log(`\n${count} violation(s) found.`);
    process.exit(LOCAL_NUM_ONE);
  }
  console.log(
    `No cognitive complexity violations (threshold: ${TARGET_THRESHOLD}).`,
  );
} else {
  if (count > BASELINE_COUNT) {
    console.log(
      `Cognitive complexity ratchet FAILED: ${count} violations exceeds ` +
      `baseline of ${BASELINE_COUNT}.\n`,
    );
    for (const violation of violations) {
      console.log(
        `${violation.filePath}:${violation.line}:${violation.column} ` +
        `${violation.message}`,
      );
    }
    process.exit(LOCAL_NUM_ONE);
  }
  console.log(
    `Cognitive complexity ratchet OK: ${count}/${BASELINE_COUNT} violations ` +
    `(threshold: ${TARGET_THRESHOLD}).`,
  );
  console.log(`Saved cognitive complexity report to ${REPORT_RELATIVE_PATH}.`);
  printRatchetTighteningHint(
    LOCAL_STR_1A2OZ,
    count,
    BASELINE_COUNT,
    LOCAL_STR_1A2OZ,
  );
}
