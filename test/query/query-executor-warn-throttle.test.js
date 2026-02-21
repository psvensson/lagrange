/**
 * Query Executor Warning Throttle Tests
 * Verifies that repeated lookups for a missing partition do not
 * flood the logger with warnings on every call.
 * Requirements: stability under missing-service conditions
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

function createEmptySystemCache() {
  return {
    filter: function(_type, _predicate) {
      return [];
    },
  };
}

test('getPartitionServiceCandidates throttles warnings for the same partition', async (t) => {
  const warnings = [];
  const mockLogger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: (msg, data) => warnings.push({msg, data}),
  };

  const executor = new QueryExecutor({
    messageRouter: null,
    systemCache: createEmptySystemCache(),
  });
  // Inject mock logger
  executor.logger = mockLogger;

  const partitionId = 'missing-partition-1';
  const callCount = 50;

  for (let i = 0; i < callCount; i++) {
    executor.getPartitionServiceCandidates(partitionId);
  }

  // The first call should warn, but subsequent calls within the
  // throttle window must be suppressed.  Before the fix every call
  // emits a warning, so warnings.length === callCount.
  t.ok(
    warnings.length < callCount,
    `Expected fewer than ${callCount} warnings, got ${warnings.length}`,
  );
  t.ok(
    warnings.length >= 1,
    'At least one warning should be emitted',
  );
});

test('getPartitionServiceCandidates warns independently per partition', async (t) => {
  const warnings = [];
  const mockLogger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: (msg, data) => warnings.push({msg, data}),
  };

  const executor = new QueryExecutor({
    messageRouter: null,
    systemCache: createEmptySystemCache(),
  });
  executor.logger = mockLogger;

  // Two different partitions should each get their own first warning.
  executor.getPartitionServiceCandidates('partition-a');
  executor.getPartitionServiceCandidates('partition-b');

  const partitionIds = warnings.map((w) => w.data?.partitionId);
  t.ok(
    partitionIds.includes('partition-a'),
    'Warning emitted for partition-a',
  );
  t.ok(
    partitionIds.includes('partition-b'),
    'Warning emitted for partition-b',
  );
  t.equal(warnings.length, 2, 'Exactly two warnings for two partitions');
});

test('executeOnPartition throttles NO_SERVICE warnings for reads', async (t) => {
  const warnings = [];
  const mockLogger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: (msg, data) => warnings.push({msg, data}),
  };

  const executor = new QueryExecutor({
    messageRouter: {deliver: async () => ({acknowledged: false})},
    systemCache: createEmptySystemCache(),
  });
  executor.logger = mockLogger;

  const partitionId = 'missing-read-partition';
  const callCount = 20;

  for (let i = 0; i < callCount; i++) {
    await executor.executeOnPartition(
      partitionId, 'SELECT 1', [], true, false, false,
    );
  }

  // Each call returns immediately with an error, but the warning
  // should be throttled so we don't get one per call.
  t.ok(
    warnings.length < callCount,
    `Expected fewer than ${callCount} warnings, got ${warnings.length}`,
  );
  t.ok(warnings.length >= 1, 'At least one warning emitted');
});
