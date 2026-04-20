import {test} from '../../src/test-helpers/tap.js';
import {
  BOUNDARY_MODE_HOTSPOT_CONTRACTS,
  collectBoundaryModeContractViolationsFromSource,
} from '../../scripts/check-guideline-boundary-mode-contracts.js';

const REBALANCE_COORDINATOR_FILE_PATH =
  'src/rebalancer/rebalance-coordinator.js';
const NON_HOTSPOT_FILE_PATH = 'src/runtime/plain-helper.js';

test('detects legacy semantic mode fragments in hotspot files', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'export function queryIncompleteOperations(options = {}) {',
      '  if (options.preferAuthoritativeRead === true) {',
      '    return [];',
      '  }',
      '}',
    ].join('\n'),
    REBALANCE_COORDINATOR_FILE_PATH,
  );

  t.equal(violations.length, 1);
  t.equal(
    violations[0].target,
    'preferAuthoritativeRead',
  );
});

test('accepts hotspot files that use only named mode vocabulary', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'export function queryIncompleteOperations(options = {}) {',
      '  return {',
      '    visibilityReadMode: options.visibilityReadMode,',
      '    concurrentBudgetReadMode: options.concurrentBudgetReadMode,',
      '  };',
      '}',
    ].join('\n'),
    REBALANCE_COORDINATOR_FILE_PATH,
  );

  t.equal(violations.length, 0);
});

test('ignores non-hotspot files', async (t) => {
  const violations = collectBoundaryModeContractViolationsFromSource(
    [
      'export function helper() {',
      '  return {ok: true};',
      '}',
    ].join('\n'),
    NON_HOTSPOT_FILE_PATH,
  );

  t.equal(violations.length, 0);
});

test('tracks the bounded boundary-mode hotspot set explicitly', async (t) => {
  t.same(
    Object.keys(BOUNDARY_MODE_HOTSPOT_CONTRACTS).sort(),
    [
      'src/control-plane/control-plane-readiness-service.js',
      'src/rebalancer/rebalance-coordinator.js',
      'src/rebalancer/unified-rebalancer.js',
      'test/control-plane/control-plane-readiness-service.test.js',
      'test/rebalancer/rebalance-coordinator-facade-compatibility.test.js',
      'test/rebalancer/unified-rebalancer.test.js',
    ],
  );
});
