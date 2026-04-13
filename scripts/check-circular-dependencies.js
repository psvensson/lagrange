/**
 * Runs madge for circular dependency detection across repo-owned runtime and
 * script code.
 *
 * Default mode: fails if cycle groups exceed the current baseline count.
 * --strict mode: fails if any cycle group is present.
 */

import madge from 'madge';

import {
  printRatchetTighteningHint,
  writeJsonReport,
} from './metric-check-helpers.js';

const BASELINE_CYCLE_GROUP_COUNT = 0;
const STRICT_FLAG = '--strict';
const FILE_EXTENSIONS = ['js'];
const SOURCE_DIRECTORIES = ['src', 'scripts'];
const REPORT_RELATIVE_PATH =
  'test-output/analysis/madge-circular-src-scripts.json';
const strict = process.argv.includes(STRICT_FLAG);

const result = await madge(SOURCE_DIRECTORIES, {
  fileExtensions: FILE_EXTENSIONS,
});
const cycleGroups = result.circular();
const cycleGroupCount = cycleGroups.length;

writeJsonReport(REPORT_RELATIVE_PATH, {cycleGroups});

if (strict) {
  if (cycleGroupCount > 0) {
    console.log('Circular dependency violations:\n');
    for (const cycleGroup of cycleGroups) {
      console.log(JSON.stringify(cycleGroup));
    }
    console.log(`\n${cycleGroupCount} cycle group(s) found.`);
    process.exit(1);
  }
  console.log('No circular dependencies detected.');
} else {
  if (cycleGroupCount > BASELINE_CYCLE_GROUP_COUNT) {
    console.log(
      `Circular dependency ratchet FAILED: ${cycleGroupCount} cycle group(s) ` +
      `exceeds baseline of ${BASELINE_CYCLE_GROUP_COUNT}.\n`,
    );
    for (const cycleGroup of cycleGroups) {
      console.log(JSON.stringify(cycleGroup));
    }
    process.exit(1);
  }
  console.log(
    `Circular dependency ratchet OK: ${cycleGroupCount}/` +
    `${BASELINE_CYCLE_GROUP_COUNT} cycle group(s).`,
  );
  console.log(`Saved cycle report to ${REPORT_RELATIVE_PATH}.`);
  printRatchetTighteningHint(
    'scripts/check-circular-dependencies.js',
    cycleGroupCount,
    BASELINE_CYCLE_GROUP_COUNT,
    'scripts/check-circular-dependencies.js',
  );
}
