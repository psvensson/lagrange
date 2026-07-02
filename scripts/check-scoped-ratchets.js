/**
 * Runs the focused static ratchets against an explicit file or directory list.
 *
 * Default mode reports scoped counts without failing on inherited local debt.
 * --strict mode fails if any scoped target exceeds the configured thresholds.
 */

import {spawnSync} from 'node:child_process';


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
const args = process.argv.slice(2);
const strict = args.includes(STRICT_FLAG);
const helpRequested = args.includes(HELP_FLAG) || args.includes(HELP_SHORT_FLAG);
const scopedTargets = args.filter((arg) => !FILTERED_FLAGS.has(arg));

if (helpRequested) {
  console.log(USAGE_TEXT);
  console.log(STRICT_USAGE_TEXT);
  process.exit(0);
}

if (scopedTargets.length === 0) {
  console.error(USAGE_TEXT);
  process.exit(1);
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

let exitCode = 0;

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

  if (result.status && result.status !== 0) {
    exitCode = result.status;
  } else if (result.error) {
    console.error(result.error.message);
    exitCode = 1;
  }
}

process.exit(exitCode);
