/**
 * Runs the focused static ratchets against an explicit file or directory list.
 *
 * Default mode reports scoped counts without failing on inherited local debt.
 * --strict mode fails if any scoped target exceeds the configured thresholds.
 */

import {spawnSync} from 'node:child_process';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;

const STRICT_FLAG = '--strict';
const HELP_FLAG = '--help';
const HELP_SHORT_FLAG = '-h';
const SCOPED_FLAG = '--scoped';
const ARG_SEPARATOR = '--';
const SCRIPT_COMPLEXITY = 'scripts/check-complexity.js';
const SCRIPT_COGNITIVE_COMPLEXITY = 'scripts/check-cognitive-complexity.js';
const USAGE_TEXT = 'Usage: npm run test:metrics:scoped -- <file-or-directory> [...]';
const STRICT_USAGE_TEXT =
  'Use --strict before paths to fail on scoped threshold violations.';
const FILTERED_FLAGS = new Set([
  STRICT_FLAG,
  ARG_SEPARATOR,
  HELP_FLAG,
  HELP_SHORT_FLAG,
]);
const args = process.argv.slice(LOCAL_NUM_TWO);
const strict = args.includes(STRICT_FLAG);
const helpRequested = args.includes(HELP_FLAG) || args.includes(HELP_SHORT_FLAG);
const scopedTargets = args.filter((arg) => !FILTERED_FLAGS.has(arg));

if (helpRequested) {
  console.log(USAGE_TEXT);
  console.log(STRICT_USAGE_TEXT);
  process.exit(LOCAL_NUM_ZERO);
}

if (scopedTargets.length === LOCAL_NUM_ZERO) {
  console.error(USAGE_TEXT);
  process.exit(LOCAL_NUM_ONE);
}

const strictArgs = strict ? [STRICT_FLAG] : [];
const checks = Object.freeze([
  Object.freeze({
    label: 'Cyclomatic complexity',
    script: SCRIPT_COMPLEXITY,
  }),
  Object.freeze({
    label: 'Cognitive complexity',
    script: SCRIPT_COGNITIVE_COMPLEXITY,
  }),
]);

let exitCode = LOCAL_NUM_ZERO;

for (const check of checks) {
  console.log(`\n${check.label}`);
  const result = spawnSync(
    process.execPath,
    [
      check.script,
      SCOPED_FLAG,
      ...strictArgs,
      ...scopedTargets,
    ],
    {
      stdio: 'inherit',
    },
  );

  if (result.status && result.status !== LOCAL_NUM_ZERO) {
    exitCode = result.status;
  } else if (result.error) {
    console.error(result.error.message);
    exitCode = LOCAL_NUM_ONE;
  }
}

process.exit(exitCode);
