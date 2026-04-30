/**
 * Runs madge for circular dependency detection across repo-owned runtime,
 * script, and test code.
 *
 * Default mode: fails if cycle groups exceed the current baseline count.
 * --strict mode: fails if any cycle group is present.
 */

import madge from 'madge';

import {
  printRatchetTighteningHint,
  writeJsonReport,
} from './metric-check-helpers.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1N0AK = 'Circular dependency violations:\n';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_Y0V8O = 'No circular dependencies detected.';
const LOCAL_STR_1E11T = 'scripts/check-circular-dependencies.js';

const BASELINE_CYCLE_GROUP_COUNT = 0;
const STRICT_FLAG = '--strict';
const FILE_EXTENSIONS = ['js'];
const SOURCE_DIRECTORIES = ['src', 'scripts', 'test'];
const REPORT_RELATIVE_PATH =
  'test-output/analysis/madge-circular-src-scripts-test.json';
const strict = process.argv.includes(STRICT_FLAG);

const result = await madge(SOURCE_DIRECTORIES, {
  fileExtensions: FILE_EXTENSIONS,
});
const cycleGroups = result.circular();
const cycleGroupCount = cycleGroups.length;

writeJsonReport(REPORT_RELATIVE_PATH, {cycleGroups});

if (strict) {
  if (cycleGroupCount > LOCAL_NUM_ZERO) {
    console.log(LOCAL_STR_1N0AK);
    for (const cycleGroup of cycleGroups) {
      console.log(JSON.stringify(cycleGroup));
    }
    console.log(`\n${cycleGroupCount} cycle group(s) found.`);
    process.exit(LOCAL_NUM_ONE);
  }
  console.log(LOCAL_STR_Y0V8O);
} else {
  if (cycleGroupCount > BASELINE_CYCLE_GROUP_COUNT) {
    console.log(
      `Circular dependency ratchet FAILED: ${cycleGroupCount} cycle group(s) ` +
      `exceeds baseline of ${BASELINE_CYCLE_GROUP_COUNT}.\n`,
    );
    for (const cycleGroup of cycleGroups) {
      console.log(JSON.stringify(cycleGroup));
    }
    process.exit(LOCAL_NUM_ONE);
  }
  console.log(
    `Circular dependency ratchet OK: ${cycleGroupCount}/` +
    `${BASELINE_CYCLE_GROUP_COUNT} cycle group(s).`,
  );
  console.log(`Saved cycle report to ${REPORT_RELATIVE_PATH}.`);
  printRatchetTighteningHint(
    LOCAL_STR_1E11T,
    cycleGroupCount,
    BASELINE_CYCLE_GROUP_COUNT,
    LOCAL_STR_1E11T,
  );
}
