/**
 * Runs eslint with the complexity rule and reports only complexity
 * violations, ignoring other lint errors.
 *
 * Default mode: fails if violations exceed the current baseline count.
 * --strict mode: fails if any function exceeds the target threshold (12).
 *
 * The baseline count should be ratcheted down as complex functions
 * are refactored. Update BASELINE_COUNT when violations are fixed.
 */

import {execSync} from 'node:child_process';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_PIPE = 'pipe';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

const TARGET_THRESHOLD = 12;
const BASELINE_COUNT = 308;
const strict = process.argv.includes('--strict');

const cmd =
  `npx eslint src/ test/ --ignore-pattern test/.gitkeep` +
  ` --rule 'complexity: ["error", ${TARGET_THRESHOLD}]'`;

let output = LOCAL_STR_EMPTY;
try {
  execSync(cmd, {encoding: LOCAL_STR_UTF8, stdio: LOCAL_STR_PIPE});
} catch (err) {
  output = err.stdout || LOCAL_STR_EMPTY;
}

const complexityLines = output
  .split('\n')
  .filter((line) => line.includes('complexity'));

const count = complexityLines.length;

if (strict) {
  if (count > LOCAL_NUM_ZERO) {
    console.log(
      `Complexity violations (threshold: ${TARGET_THRESHOLD}):\n`
    );
    for (const line of complexityLines) {
      console.log(line);
    }
    console.log(`\n${count} violation(s) found.`);
    process.exit(LOCAL_NUM_ONE);
  }
  console.log(
    `No complexity violations (threshold: ${TARGET_THRESHOLD}).`
  );
} else {
  if (count > BASELINE_COUNT) {
    console.log(
      `Complexity ratchet FAILED: ${count} violations ` +
      `exceeds baseline of ${BASELINE_COUNT}.\n`
    );
    for (const line of complexityLines) {
      console.log(line);
    }
    process.exit(LOCAL_NUM_ONE);
  }
  console.log(
    `Complexity ratchet OK: ${count}/${BASELINE_COUNT} ` +
    `violations (threshold: ${TARGET_THRESHOLD}).`
  );
  if (count < BASELINE_COUNT) {
    console.log(
      `Baseline can be tightened from ${BASELINE_COUNT} ` +
      `to ${count} in scripts/check-complexity.js.`
    );
  }
}
