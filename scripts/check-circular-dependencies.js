/**
 * Runs madge for circular dependency detection across repo-owned runtime,
 * script, and test code.
 *
 * Default mode: fails if cycle groups exceed the current baseline count.
 * --strict mode: fails if any cycle group is present.
 */

import {METRIC_REPORTS} from './metric-report-constants.js';
import {beginMetricMeasurement, finishMetricMeasurement} from './metric-report-provenance.js';

import madge from 'madge';

import {
  printRatchetTighteningHint,
} from './metric-check-helpers.js';

const LOCAL_STR_CIRCULAR_DEPENDENCY_VIOLATIONS = 'Circular dependency violations:\n';
const LOCAL_STR_NO_CIRCULAR_DEPENDENCIES_DETECTED = 'No circular dependencies detected.';
const LOCAL_STR_SCRIPTS_CHECK_CIRCULAR_DEPENDENCIES_JS = 'scripts/check-circular-dependencies.js';

// Circular imports are an owner-boundary violation, so the ratchet is strict.
const BASELINE_CYCLE_GROUP_COUNT = 0;
const STRICT_FLAG = '--strict';
const FILE_EXTENSIONS = ['js'];
const SOURCE_DIRECTORIES = METRIC_REPORTS.cycles.targets;
const REPORT_RELATIVE_PATH = METRIC_REPORTS.cycles.reportPath;
const strict = process.argv.includes(STRICT_FLAG);

const measurement = beginMetricMeasurement('cycles');
const result = await madge(SOURCE_DIRECTORIES, {
  fileExtensions: FILE_EXTENSIONS,
});
const cycleGroups = result.circular();
const cycleGroupCount = cycleGroups.length;

finishMetricMeasurement(measurement, {cycleGroups});

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
