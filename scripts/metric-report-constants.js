import {IMPORT_GRAPH_SEAL_PATH} from './checks/impact-proof-cone-constants.js';
import {PRIMARY_CLASS_MANIFEST_PATH} from './checks/test-primary-classification-constants.js';
import {RESOURCE_CLASS_MANIFEST_PATH} from './checks/test-resource-classification-constants.js';
import {SUBSYSTEM_MANIFEST_PATH} from './checks/test-subsystem-classification-constants.js';

// These generated views are not analyzer inputs. Excluding their canonical
// output paths prevents inventory/metadata refresh from invalidating itself.
export const METRIC_GENERATED_OUTPUTS = new Set([
  IMPORT_GRAPH_SEAL_PATH, PRIMARY_CLASS_MANIFEST_PATH,
  RESOURCE_CLASS_MANIFEST_PATH, SUBSYSTEM_MANIFEST_PATH,
]);

// One catalogue for producer scope, report locations and inventory refresh.
export const METRIC_CYCLE_DISCOVERY = 'madge-resolution';
const ANALYSIS = 'test-output/analysis';
export const METRIC_REPORTS = Object.freeze({
  complexity: {
    targets: ['src/', 'test/'], tools: ['eslint'],
    command: ['scripts/check-complexity.js'],
    reportPath: `${ANALYSIS}/complexity-src-test.json`,
  },
  cognitive: {
    targets: ['src/', 'scripts/'], tools: ['eslint', 'eslint-plugin-sonarjs'],
    command: ['scripts/check-cognitive-complexity.js'],
    reportPath: `${ANALYSIS}/cognitive-complexity-src-scripts.json`,
  },
  cycles: {
    inputDiscovery: METRIC_CYCLE_DISCOVERY,
    targets: ['src', 'scripts', 'test'], tools: ['madge'],
    command: ['scripts/check-circular-dependencies.js'],
    reportPath: `${ANALYSIS}/madge-circular-src-scripts-test.json`,
  },
  duplicationSource: {
    targets: ['src', 'scripts'], tools: ['jscpd'], targetName: 'src+scripts',
    command: ['scripts/check-duplication.js', '--target', 'src+scripts'],
    reportPath: `${ANALYSIS}/jscpd-src-scripts/jscpd-report.json`,
  },
  duplicationTest: {
    targets: ['test'], tools: ['jscpd'], targetName: 'test',
    command: ['scripts/check-duplication.js', '--target', 'test'],
    reportPath: `${ANALYSIS}/jscpd-test/jscpd-report.json`,
  },
});
