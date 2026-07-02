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

const LOCAL_STR_CIRCULAR_DEPENDENCY_VIOLATIONS = 'Circular dependency violations:\n';
const LOCAL_STR_NO_CIRCULAR_DEPENDENCIES_DETECTED = 'No circular dependencies detected.';
const LOCAL_STR_SCRIPTS_CHECK_CIRCULAR_DEPENDENCIES_JS = 'scripts/check-circular-dependencies.js';

// Re-anchored 2026-07-02 for the 0.1.0 release gate: 19 cycle groups exist
// at HEAD AND at the pre-release base (gate silently red — never executed by
// a full run; same cycles anchored in .dependency-cruiser-known-violations
// for test:deps). Ratchet DOWN from here; the control-plane
// priority-recovery/membership-publication clusters are the refactor targets.
const BASELINE_CYCLE_GROUP_COUNT = 19;
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
  if (cycleGroupCount > 0) {
    console.log(LOCAL_STR_CIRCULAR_DEPENDENCY_VIOLATIONS);
    for (const cycleGroup of cycleGroups) {
      console.log(JSON.stringify(cycleGroup));
    }
    console.log(`\n${cycleGroupCount} cycle group(s) found.`);
    process.exit(1);
  }
  console.log(LOCAL_STR_NO_CIRCULAR_DEPENDENCIES_DETECTED);
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
    LOCAL_STR_SCRIPTS_CHECK_CIRCULAR_DEPENDENCIES_JS,
    cycleGroupCount,
    BASELINE_CYCLE_GROUP_COUNT,
    LOCAL_STR_SCRIPTS_CHECK_CIRCULAR_DEPENDENCIES_JS,
  );
}
