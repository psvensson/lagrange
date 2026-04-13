/**
 * Tests for AssignmentEpochManager class.
 * Requirements: 3.2, 3.6, 3.7, 3.8
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  AssignmentEpochManager,
} from '../../src/rebalancer/assignment-epoch-manager.js';
import {
  AssignmentEpoch,
} from '../../src/rebalancer/assignment-epoch.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// Sample test data
const sampleAssignments = {
  'tables-p1': ['node1', 'node2', 'node3'],
  'nodes-p1': ['node1', 'node2', 'node3'],
};

const sampleTimestamp = '1706000000000-0001-node1';

test('AssignmentEpochManager - constructor requires nodeId', async (t) => {
  t.throws(
    () => new AssignmentEpochManager(),
    /nodeId is required/,
    'should throw without nodeId',
  );

  t.throws(
    () => new AssignmentEpochManager({}),
    /nodeId is required/,
    'should throw with empty options',
  );

  t.throws(
    () => new AssignmentEpochManager({nodeId: ''}),
    /nodeId is required/,
    'should throw with empty nodeId',
  );

  t.throws(
    () => new AssignmentEpochManager({nodeId: 123}),
    /nodeId is required/,
    'should throw with non-string nodeId',
  );
  t.end();
});

test('AssignmentEpochManager - constructor with valid nodeId', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});

  t.ok(manager, 'should create manager');
  t.notOk(manager.isInitialized(), 'should not be initialized');
  t.end();
});

test('AssignmentEpochManager - initialize with default epoch', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  t.ok(manager.isInitialized(), 'should be initialized');

  const epoch = manager.getCurrentEpoch();
  t.equal(epoch.epoch, 0, 'should start at epoch 0');
  t.same(epoch.assignments, {}, 'should have empty assignments');
  t.equal(epoch.proposedBy, 'node1', 'should have correct proposedBy');
  t.end();
});

test('AssignmentEpochManager - initialize with provided epoch', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  const initialEpoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: 'node2',
  });

  manager.initialize(initialEpoch);

  t.ok(manager.isInitialized(), 'should be initialized');

  const epoch = manager.getCurrentEpoch();
  t.equal(epoch.epoch, 42, 'should have provided epoch number');
  t.same(epoch.assignments, sampleAssignments, 'should have provided assignments');
  t.end();
});

test('AssignmentEpochManager - initialize rejects non-AssignmentEpoch', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});

  t.throws(
    () => manager.initialize({epoch: 1}),
    /must be an AssignmentEpoch instance/,
    'should reject plain object',
  );
  t.end();
});

test('AssignmentEpochManager - getCurrentEpoch throws if not initialized', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});

  t.throws(
    () => manager.getCurrentEpoch(),
    /not initialized/,
    'should throw if not initialized',
  );
  t.end();
});

test('AssignmentEpochManager - getPartitionAssignments', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  const initialEpoch = new AssignmentEpoch({
    epoch: 1,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: 'node1',
  });
  manager.initialize(initialEpoch);

  t.same(
    manager.getPartitionAssignments('tables-p1'),
    ['node1', 'node2', 'node3'],
    'should return correct assignments',
  );
  t.equal(
    manager.getPartitionAssignments('non-existent'),
    undefined,
    'should return undefined for non-existent partition',
  );
  t.end();
});

test('AssignmentEpochManager - getNodeAssignments', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  const initialEpoch = new AssignmentEpoch({
    epoch: 1,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: 'node1',
  });
  manager.initialize(initialEpoch);

  const node1Partitions = manager.getNodeAssignments('node1');
  t.equal(node1Partitions.length, 2, 'node1 should have 2 partitions');
  t.ok(node1Partitions.includes('tables-p1'), 'should include tables-p1');
  t.ok(node1Partitions.includes('nodes-p1'), 'should include nodes-p1');

  const unknownPartitions = manager.getNodeAssignments('unknown');
  t.same(unknownPartitions, [], 'unknown node should have empty array');
  t.end();
});

test('AssignmentEpochManager - proposeEpoch success with CAS', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  const newAssignments = {'partition-1': ['node1', 'node2']};
  const result = manager.proposeEpoch(0, newAssignments);

  t.ok(result.success, 'should succeed');
  t.ok(result.epoch, 'should return new epoch');
  t.equal(result.epoch.epoch, 1, 'new epoch should be 1');
  t.same(
    result.epoch.assignments['partition-1'],
    ['node1', 'node2'],
    'should have new assignments',
  );
  t.equal(result.epoch.proposedBy, 'node1', 'should have correct proposedBy');
  t.end();
});

test('AssignmentEpochManager - proposeEpoch fails with wrong expectedEpoch', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  const newAssignments = {'partition-1': ['node1']};

  // Try to propose with wrong expected epoch
  const result = manager.proposeEpoch(5, newAssignments);

  t.notOk(result.success, 'should fail');
  t.ok(result.error, 'should have error message');
  t.match(result.error, /Epoch mismatch/, 'should indicate epoch mismatch');
  t.equal(result.currentEpoch, 0, 'should return current epoch');

  // Verify epoch unchanged
  t.equal(manager.getCurrentEpoch().epoch, 0, 'epoch should remain unchanged');
  t.end();
});

test('AssignmentEpochManager - proposeEpoch increments epoch by exactly 1', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  const initialEpoch = new AssignmentEpoch({
    epoch: 41,
    assignments: {},
    timestamp: sampleTimestamp,
    proposedBy: 'node1',
  });
  manager.initialize(initialEpoch);

  const result = manager.proposeEpoch(41, {'p1': ['node1']});

  t.ok(result.success, 'should succeed');
  t.equal(result.epoch.epoch, 42, 'new epoch should be exactly 42 (41 + 1)');
  t.end();
});

test('AssignmentEpochManager - proposeEpoch fails if not initialized', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});

  const result = manager.proposeEpoch(0, {});

  t.notOk(result.success, 'should fail');
  t.match(result.error, /not initialized/, 'should indicate not initialized');
  t.end();
});

test('AssignmentEpochManager - proposeEpoch validates expectedEpoch type', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  let result = manager.proposeEpoch('0', {});
  t.notOk(result.success, 'should fail with string');
  t.match(result.error, /must be an integer/, 'should indicate type error');

  result = manager.proposeEpoch(1.5, {});
  t.notOk(result.success, 'should fail with float');
  t.match(result.error, /must be an integer/, 'should indicate type error');
  t.end();
});

test('AssignmentEpochManager - proposeEpoch emits epochChange event', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  let eventReceived = null;
  manager.on('epochChange', (event) => {
    eventReceived = event;
  });

  manager.proposeEpoch(0, {'p1': ['node1']});

  t.ok(eventReceived, 'should emit event');
  t.equal(eventReceived.previousEpoch, 0, 'should have previous epoch');
  t.equal(eventReceived.newEpoch, 1, 'should have new epoch');
  t.equal(eventReceived.proposedBy, 'node1', 'should have proposedBy');
  t.ok(eventReceived.timestamp, 'should have timestamp');
  t.end();
});

test('AssignmentEpochManager - applyEpoch accepts newer epoch', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  const newerEpoch = new AssignmentEpoch({
    epoch: 5,
    assignments: {'p1': ['node2']},
    timestamp: sampleTimestamp,
    proposedBy: 'node2',
  });

  const result = manager.applyEpoch(newerEpoch);

  t.ok(result, 'should return true');
  t.equal(manager.getCurrentEpoch().epoch, 5, 'should update to new epoch');
  t.same(
    manager.getPartitionAssignments('p1'),
    ['node2'],
    'should have new assignments',
  );
  t.end();
});

test('AssignmentEpochManager - applyEpoch rejects older epoch', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  const initialEpoch = new AssignmentEpoch({
    epoch: 10,
    assignments: {'p1': ['node1']},
    timestamp: sampleTimestamp,
    proposedBy: 'node1',
  });
  manager.initialize(initialEpoch);

  const olderEpoch = new AssignmentEpoch({
    epoch: 5,
    assignments: {'p1': ['node2']},
    timestamp: sampleTimestamp,
    proposedBy: 'node2',
  });

  const result = manager.applyEpoch(olderEpoch);

  t.notOk(result, 'should return false');
  t.equal(manager.getCurrentEpoch().epoch, 10, 'should keep current epoch');
  t.same(
    manager.getPartitionAssignments('p1'),
    ['node1'],
    'should keep current assignments',
  );
  t.end();
});

test('AssignmentEpochManager - applyEpoch rejects equal epoch', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  const initialEpoch = new AssignmentEpoch({
    epoch: 10,
    assignments: {'p1': ['node1']},
    timestamp: sampleTimestamp,
    proposedBy: 'node1',
  });
  manager.initialize(initialEpoch);

  const sameEpoch = new AssignmentEpoch({
    epoch: 10,
    assignments: {'p1': ['node2']},
    timestamp: '1706000000001-0001-node2',
    proposedBy: 'node2',
  });

  const result = manager.applyEpoch(sameEpoch);

  t.notOk(result, 'should return false for equal epoch');
  t.same(
    manager.getPartitionAssignments('p1'),
    ['node1'],
    'should keep original assignments',
  );
  t.end();
});

test('AssignmentEpochManager - applyEpoch rejects non-AssignmentEpoch', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  const result = manager.applyEpoch({epoch: 5, assignments: {}});

  t.notOk(result, 'should return false for plain object');
  t.end();
});

test('AssignmentEpochManager - applyEpoch works when not initialized', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});

  const epoch = new AssignmentEpoch({
    epoch: 5,
    assignments: {'p1': ['node2']},
    timestamp: sampleTimestamp,
    proposedBy: 'node2',
  });

  const result = manager.applyEpoch(epoch);

  t.ok(result, 'should return true');
  t.ok(manager.isInitialized(), 'should be initialized');
  t.equal(manager.getCurrentEpoch().epoch, 5, 'should have applied epoch');
  t.end();
});

test('AssignmentEpochManager - applyEpoch emits epochApplied event', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  let eventReceived = null;
  manager.on('epochApplied', (event) => {
    eventReceived = event;
  });

  const newerEpoch = new AssignmentEpoch({
    epoch: 5,
    assignments: {},
    timestamp: sampleTimestamp,
    proposedBy: 'node2',
  });

  manager.applyEpoch(newerEpoch);

  t.ok(eventReceived, 'should emit event');
  t.equal(eventReceived.previousEpoch, 0, 'should have previous epoch');
  t.equal(eventReceived.epoch, 5, 'should have new epoch');
  t.equal(eventReceived.source, 'cdc', 'should indicate CDC source');
  t.end();
});

test('AssignmentEpochManager - sequential proposeEpoch calls', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  // First proposal
  let result = manager.proposeEpoch(0, {'p1': ['node1']});
  t.ok(result.success, 'first proposal should succeed');
  t.equal(result.epoch.epoch, 1, 'should be epoch 1');

  // Second proposal with correct expected epoch
  result = manager.proposeEpoch(1, {'p1': ['node1', 'node2']});
  t.ok(result.success, 'second proposal should succeed');
  t.equal(result.epoch.epoch, 2, 'should be epoch 2');

  // Third proposal with wrong expected epoch
  result = manager.proposeEpoch(1, {'p1': ['node3']});
  t.notOk(result.success, 'third proposal should fail');
  t.equal(result.currentEpoch, 2, 'should report current epoch is 2');
  t.end();
});

test('AssignmentEpochManager - custom timestampProvider', async (t) => {
  let callCount = 0;
  const customTimestamp = () => {
    callCount++;
    return `custom-timestamp-${callCount}`;
  };

  const manager = new AssignmentEpochManager({
    nodeId: 'node1',
    timestampProvider: customTimestamp,
  });
  manager.initialize();

  t.equal(callCount, 1, 'should call timestampProvider on initialize');

  manager.proposeEpoch(0, {});
  t.equal(callCount, 2, 'should call timestampProvider on proposeEpoch');

  const epoch = manager.getCurrentEpoch();
  t.equal(epoch.timestamp, 'custom-timestamp-2', 'should use custom timestamp');
  t.end();
});

test('AssignmentEpochManager - proposeEpoch with invalid assignments', async (t) => {
  const manager = new AssignmentEpochManager({nodeId: 'node1'});
  manager.initialize();

  // Invalid assignments (non-array node list)
  const result = manager.proposeEpoch(0, {'p1': 'not-an-array'});

  t.notOk(result.success, 'should fail with invalid assignments');
  t.ok(result.error, 'should have error message');
  t.equal(manager.getCurrentEpoch().epoch, 0, 'epoch should remain unchanged');
  t.end();
});


// Tests for proposeEpochWithRetry - Requirements 6.2, 6.3

test('AssignmentEpochManager - proposeEpochWithRetry succeeds on first attempt',
  async (t) => {
    const delays = [];
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    manager.initialize();

    const result = await manager.proposeEpochWithRetry({'p1': ['node1']});

    t.ok(result.success, 'should succeed');
    t.equal(result.attempts, 1, 'should succeed on first attempt');
    t.equal(result.epoch.epoch, 1, 'should have new epoch');
    t.equal(delays.length, 0, 'should not have any delays');
    t.end();
  });

test('AssignmentEpochManager - proposeEpochWithRetry retries on CAS failure',
  async (t) => {
    const delays = [];
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    manager.initialize();

    // Simulate concurrent modification by another node
    let callCount = 0;
    const originalProposeEpoch = manager.proposeEpoch.bind(manager);
    manager.proposeEpoch = (expectedEpoch, assignments) => {
      callCount++;
      if (callCount === 1) {
        // First call: simulate another node winning the CAS
        manager._currentEpoch = AssignmentEpoch.createNext(
          manager._currentEpoch,
          {},
          manager._timestampProvider(),
          'other-node',
        );
        return {
          success: false,
          error: 'Epoch mismatch: expected 0, but current epoch is 1',
          currentEpoch: 1,
        };
      }
      // Subsequent calls: use original implementation
      return originalProposeEpoch(expectedEpoch, assignments);
    };

    const result = await manager.proposeEpochWithRetry({'p1': ['node1']});

    t.ok(result.success, 'should eventually succeed');
    t.equal(result.attempts, 2, 'should succeed on second attempt');
    t.equal(result.epoch.epoch, 2, 'should have epoch 2 (after retry)');
    t.equal(delays.length, 1, 'should have one delay');
    t.equal(delays[0], 100, 'first delay should be initialDelayMs');
    t.end();
  });

test('AssignmentEpochManager - proposeEpochWithRetry emits proposalRetry event',
  async (t) => {
    const retryEvents = [];
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: () => Promise.resolve(),
    });
    manager.initialize();

    manager.on('proposalRetry', (event) => {
      retryEvents.push(event);
    });

    // Force CAS failure on first attempt
    let callCount = 0;
    const originalProposeEpoch = manager.proposeEpoch.bind(manager);
    manager.proposeEpoch = (expectedEpoch, assignments) => {
      callCount++;
      if (callCount === 1) {
        manager._currentEpoch = AssignmentEpoch.createNext(
          manager._currentEpoch,
          {},
          manager._timestampProvider(),
          'other-node',
        );
        return {
          success: false,
          error: 'Epoch mismatch',
          currentEpoch: 1,
        };
      }
      return originalProposeEpoch(expectedEpoch, assignments);
    };

    await manager.proposeEpochWithRetry({'p1': ['node1']});

    t.equal(retryEvents.length, 1, 'should emit one retry event');
    t.equal(retryEvents[0].attempt, 1, 'should have attempt number');
    t.equal(retryEvents[0].maxRetries, 3, 'should have maxRetries');
    t.equal(retryEvents[0].expectedEpoch, 0, 'should have expectedEpoch');
    t.equal(retryEvents[0].currentEpoch, 1, 'should have currentEpoch');
    t.ok(retryEvents[0].error, 'should have error message');
    t.equal(retryEvents[0].nextDelayMs, 100, 'should have nextDelayMs');
    t.end();
  });

test('AssignmentEpochManager - proposeEpochWithRetry uses exponential backoff',
  async (t) => {
    const delays = [];
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    manager.initialize();

    // Force all attempts to fail
    manager.proposeEpoch = () => ({
      success: false,
      error: 'Epoch mismatch',
      currentEpoch: 999,
    });

    await manager.proposeEpochWithRetry({'p1': ['node1']}, {
      maxRetries: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
    });

    t.equal(delays.length, 3, 'should have 3 delays (for 3 retries)');
    t.equal(delays[0], 100, 'first delay should be 100ms');
    t.equal(delays[1], 200, 'second delay should be 200ms');
    t.equal(delays[2], 400, 'third delay should be 400ms');
    t.end();
  });

test('AssignmentEpochManager - proposeEpochWithRetry respects maxDelayMs',
  async (t) => {
    const delays = [];
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    manager.initialize();

    // Force all attempts to fail
    manager.proposeEpoch = () => ({
      success: false,
      error: 'Epoch mismatch',
      currentEpoch: 999,
    });

    await manager.proposeEpochWithRetry({'p1': ['node1']}, {
      maxRetries: 4,
      initialDelayMs: 100,
      backoffMultiplier: 10,
      maxDelayMs: 500,
    });

    t.equal(delays.length, 4, 'should have 4 delays');
    t.equal(delays[0], 100, 'first delay should be 100ms');
    t.equal(delays[1], 500, 'second delay should be capped at 500ms');
    t.equal(delays[2], 500, 'third delay should be capped at 500ms');
    t.equal(delays[3], 500, 'fourth delay should be capped at 500ms');
    t.end();
  });

test('AssignmentEpochManager - proposeEpochWithRetry fails after max retries',
  async (t) => {
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: () => Promise.resolve(),
    });
    manager.initialize();

    // Force all attempts to fail
    manager.proposeEpoch = () => ({
      success: false,
      error: 'Epoch mismatch: expected 0, but current epoch is 999',
      currentEpoch: 999,
    });

    const result = await manager.proposeEpochWithRetry({'p1': ['node1']}, {
      maxRetries: 2,
    });

    t.notOk(result.success, 'should fail');
    t.equal(result.attempts, 3, 'should have made 3 attempts (1 initial + 2 retries)');
    t.match(result.error, /Epoch mismatch/, 'should have error message');
    t.end();
  });

test('AssignmentEpochManager - proposeEpochWithRetry uses default config',
  async (t) => {
    const delays = [];
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    manager.initialize();

    // Force all attempts to fail
    manager.proposeEpoch = () => ({
      success: false,
      error: 'Epoch mismatch',
      currentEpoch: 999,
    });

    const result = await manager.proposeEpochWithRetry({'p1': ['node1']});

    t.notOk(result.success, 'should fail');
    t.equal(result.attempts, 4, 'should have 4 attempts (default maxRetries=3)');
    t.equal(delays[0], 100, 'should use default initialDelayMs=100');
    t.end();
  });

test('AssignmentEpochManager - proposeEpochWithRetry fails if not initialized',
  async (t) => {
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: () => Promise.resolve(),
    });

    const result = await manager.proposeEpochWithRetry({'p1': ['node1']});

    t.notOk(result.success, 'should fail');
    t.equal(result.attempts, 1, 'should have 1 attempt');
    t.match(result.error, /not initialized/, 'should indicate not initialized');
    t.end();
  });

test('AssignmentEpochManager - proposeEpochWithRetry with custom options',
  async (t) => {
    const delays = [];
    const manager = new AssignmentEpochManager({
      nodeId: 'node1',
      delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    manager.initialize();

    // Force all attempts to fail
    manager.proposeEpoch = () => ({
      success: false,
      error: 'Epoch mismatch',
      currentEpoch: 999,
    });

    const result = await manager.proposeEpochWithRetry({'p1': ['node1']}, {
      maxRetries: 2,
      initialDelayMs: 50,
      backoffMultiplier: 3,
      maxDelayMs: 200,
    });

    t.notOk(result.success, 'should fail');
    t.equal(result.attempts, 3, 'should have 3 attempts');
    t.equal(delays[0], 50, 'first delay should be 50ms');
    t.equal(delays[1], 150, 'second delay should be 150ms');
    t.end();
  });
