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
// @ts-nocheck


import {execSync} from 'node:child_process';

const TARGET_THRESHOLD = 12;
const BASELINE_COUNT = 308;
const strict = process.argv.includes('--strict');

const cmd =
  `npx eslint src/ test/ --ignore-pattern test/.gitkeep` +
  ` --rule 'complexity: ["error", ${TARGET_THRESHOLD}]'`;

let output = '';
try {
  execSync(cmd, {encoding: 'utf8', stdio: 'pipe'});
} catch (err) {
  output = err.stdout || '';
}

const complexityLines = output
  .split('\n')
  .filter((line) => line.includes('complexity'));

const count = complexityLines.length;

if (strict) {
  if (count > 0) {
    console.log(
      `Complexity violations (threshold: ${TARGET_THRESHOLD}):\n`
    );
    for (const line of complexityLines) {
      console.log(line);
    }
    console.log(`\n${count} violation(s) found.`);
    process.exit(1);
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
    process.exit(1);
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
