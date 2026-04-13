/**
 * Tests for AssignmentEpoch data structure.
 * Requirements: 3.1, 3.3
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  AssignmentEpoch,
  EpochValidationError,
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
  'partitions-p1': ['node2', 'node3', 'node1'],
};

const sampleTimestamp = '1706000000000-0001-node1';
const sampleProposedBy = 'node2';

test('AssignmentEpoch - constructor creates valid epoch', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.equal(epoch.epoch, 42, 'should have correct epoch number');
  t.equal(epoch.timestamp, sampleTimestamp, 'should have correct timestamp');
  t.equal(epoch.proposedBy, sampleProposedBy, 'should have correct proposedBy');
  t.same(
    epoch.assignments['tables-p1'],
    ['node1', 'node2', 'node3'],
    'should have correct assignments',
  );
  t.end();
});

test('AssignmentEpoch - constructor with epoch 0', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 0,
    assignments: {},
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.equal(epoch.epoch, 0, 'should allow epoch 0');
  t.same(epoch.assignments, {}, 'should allow empty assignments');
  t.end();
});

test('AssignmentEpoch - validation rejects null options', async (t) => {
  t.throws(
    () => new AssignmentEpoch(null),
    EpochValidationError,
    'should reject null options',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects non-object options', async (t) => {
  t.throws(
    () => new AssignmentEpoch('invalid'),
    EpochValidationError,
    'should reject string options',
  );
  t.throws(
    () => new AssignmentEpoch(123),
    EpochValidationError,
    'should reject number options',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects non-number epoch', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 'not-a-number',
      assignments: {},
      timestamp: sampleTimestamp,
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject string epoch',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects non-integer epoch', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 42.5,
      assignments: {},
      timestamp: sampleTimestamp,
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject non-integer epoch',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects negative epoch', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: -1,
      assignments: {},
      timestamp: sampleTimestamp,
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject negative epoch',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects null assignments', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 1,
      assignments: null,
      timestamp: sampleTimestamp,
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject null assignments',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects non-array node list', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 1,
      assignments: {'partition-1': 'not-an-array'},
      timestamp: sampleTimestamp,
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject non-array node list',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects empty node ID in list', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 1,
      assignments: {'partition-1': ['node1', '', 'node3']},
      timestamp: sampleTimestamp,
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject empty node ID',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects non-string node ID', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 1,
      assignments: {'partition-1': ['node1', 123, 'node3']},
      timestamp: sampleTimestamp,
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject non-string node ID',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects non-string timestamp', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 1,
      assignments: {},
      timestamp: 12345,
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject non-string timestamp',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects empty timestamp', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 1,
      assignments: {},
      timestamp: '',
      proposedBy: sampleProposedBy,
    }),
    EpochValidationError,
    'should reject empty timestamp',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects non-string proposedBy', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 1,
      assignments: {},
      timestamp: sampleTimestamp,
      proposedBy: 123,
    }),
    EpochValidationError,
    'should reject non-string proposedBy',
  );
  t.end();
});

test('AssignmentEpoch - validation rejects empty proposedBy', async (t) => {
  t.throws(
    () => new AssignmentEpoch({
      epoch: 1,
      assignments: {},
      timestamp: sampleTimestamp,
      proposedBy: '',
    }),
    EpochValidationError,
    'should reject empty proposedBy',
  );
  t.end();
});

test('AssignmentEpoch - immutability: Object.freeze applied', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.ok(Object.isFrozen(epoch), 'epoch object should be frozen');
  t.ok(Object.isFrozen(epoch.assignments), 'assignments should be frozen');
  t.ok(
    Object.isFrozen(epoch.assignments['tables-p1']),
    'node list should be frozen',
  );
  t.end();
});

test('AssignmentEpoch - immutability: cannot modify epoch number', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  // Attempt to modify (should silently fail in strict mode or throw)
  try {
    epoch._epoch = 100;
  } catch (_e) {
    // Expected in strict mode
  }

  t.equal(epoch.epoch, 42, 'epoch number should remain unchanged');
  t.end();
});

test('AssignmentEpoch - immutability: cannot modify assignments', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  // Attempt to add new partition
  try {
    epoch.assignments['new-partition'] = ['node1'];
  } catch (_e) {
    // Expected in strict mode
  }

  t.notOk(
    epoch.assignments['new-partition'],
    'should not be able to add new partition',
  );

  // Attempt to modify existing node list
  try {
    epoch.assignments['tables-p1'].push('node4');
  } catch (_e) {
    // Expected in strict mode
  }

  t.equal(
    epoch.assignments['tables-p1'].length,
    3,
    'should not be able to modify node list',
  );
  t.end();
});

test('AssignmentEpoch - immutability: original input not affected', async (t) => {
  const originalAssignments = {
    'partition-1': ['node1', 'node2'],
  };

  const epoch = new AssignmentEpoch({
    epoch: 1,
    assignments: originalAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  // Modify original input
  originalAssignments['partition-1'].push('node3');
  originalAssignments['partition-2'] = ['node4'];

  // Epoch should not be affected
  t.equal(
    epoch.assignments['partition-1'].length,
    2,
    'epoch should not be affected by original modification',
  );
  t.notOk(
    epoch.assignments['partition-2'],
    'epoch should not have new partition from original',
  );
  t.end();
});

test('AssignmentEpoch - getPartitionAssignments', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.same(
    epoch.getPartitionAssignments('tables-p1'),
    ['node1', 'node2', 'node3'],
    'should return correct node list',
  );
  t.equal(
    epoch.getPartitionAssignments('non-existent'),
    undefined,
    'should return undefined for non-existent partition',
  );
  t.end();
});

test('AssignmentEpoch - getNodeAssignments', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  const node1Partitions = epoch.getNodeAssignments('node1');
  t.equal(node1Partitions.length, 3, 'node1 should have 3 partitions');
  t.ok(node1Partitions.includes('tables-p1'), 'should include tables-p1');
  t.ok(node1Partitions.includes('nodes-p1'), 'should include nodes-p1');
  t.ok(node1Partitions.includes('partitions-p1'), 'should include partitions-p1');

  const unknownNodePartitions = epoch.getNodeAssignments('unknown-node');
  t.same(unknownNodePartitions, [], 'unknown node should have empty array');
  t.end();
});

test('AssignmentEpoch - getPartitionIds', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  const partitionIds = epoch.getPartitionIds();
  t.equal(partitionIds.length, 3, 'should have 3 partitions');
  t.ok(partitionIds.includes('tables-p1'), 'should include tables-p1');
  t.ok(partitionIds.includes('nodes-p1'), 'should include nodes-p1');
  t.ok(partitionIds.includes('partitions-p1'), 'should include partitions-p1');
  t.end();
});

test('AssignmentEpoch - getAssignedNodeIds', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  const nodeIds = epoch.getAssignedNodeIds();
  t.equal(nodeIds.length, 3, 'should have 3 unique nodes');
  t.ok(nodeIds.includes('node1'), 'should include node1');
  t.ok(nodeIds.includes('node2'), 'should include node2');
  t.ok(nodeIds.includes('node3'), 'should include node3');
  t.end();
});

test('AssignmentEpoch - getPartitionCount', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.equal(epoch.getPartitionCount(), 3, 'should return correct partition count');

  const emptyEpoch = new AssignmentEpoch({
    epoch: 0,
    assignments: {},
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.equal(emptyEpoch.getPartitionCount(), 0, 'empty epoch should have 0 partitions');
  t.end();
});

test('AssignmentEpoch - getTotalReplicaCount', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  // 3 partitions * 3 replicas each = 9 total
  t.equal(epoch.getTotalReplicaCount(), 9, 'should return correct total replica count');
  t.end();
});

test('AssignmentEpoch - hasPartition', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.ok(epoch.hasPartition('tables-p1'), 'should return true for existing partition');
  t.notOk(epoch.hasPartition('non-existent'), 'should return false for non-existent');
  t.end();
});

test('AssignmentEpoch - hasNodeAssignments', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.ok(epoch.hasNodeAssignments('node1'), 'should return true for assigned node');
  t.notOk(epoch.hasNodeAssignments('node99'), 'should return false for unassigned node');
  t.end();
});

test('AssignmentEpoch - toObject returns mutable copy', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  const obj = epoch.toObject();

  t.equal(obj.epoch, 42, 'should have correct epoch');
  t.equal(obj.timestamp, sampleTimestamp, 'should have correct timestamp');
  t.equal(obj.proposedBy, sampleProposedBy, 'should have correct proposedBy');

  // Verify it's a mutable copy
  obj.epoch = 100;
  obj.assignments['new-partition'] = ['node1'];

  t.equal(epoch.epoch, 42, 'original epoch should be unchanged');
  t.notOk(epoch.assignments['new-partition'], 'original should not have new partition');
  t.end();
});

test('AssignmentEpoch - toJSON and fromJSON round-trip', async (t) => {
  const original = new AssignmentEpoch({
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  const json = original.toJSON();
  const restored = AssignmentEpoch.fromJSON(json);

  t.equal(restored.epoch, original.epoch, 'epoch should match');
  t.equal(restored.timestamp, original.timestamp, 'timestamp should match');
  t.equal(restored.proposedBy, original.proposedBy, 'proposedBy should match');
  t.same(restored.assignments, original.assignments, 'assignments should match');
  t.end();
});

test('AssignmentEpoch - fromJSON rejects invalid JSON', async (t) => {
  t.throws(
    () => AssignmentEpoch.fromJSON('not valid json'),
    EpochValidationError,
    'should reject invalid JSON',
  );
  t.end();
});

test('AssignmentEpoch - fromObject creates valid epoch', async (t) => {
  const obj = {
    epoch: 42,
    assignments: sampleAssignments,
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  };

  const epoch = AssignmentEpoch.fromObject(obj);

  t.equal(epoch.epoch, 42, 'should have correct epoch');
  t.ok(Object.isFrozen(epoch), 'should be frozen');
  t.end();
});

test('AssignmentEpoch - createInitial', async (t) => {
  const epoch = AssignmentEpoch.createInitial(sampleTimestamp, sampleProposedBy);

  t.equal(epoch.epoch, 0, 'initial epoch should be 0');
  t.same(epoch.assignments, {}, 'initial assignments should be empty');
  t.equal(epoch.timestamp, sampleTimestamp, 'should have correct timestamp');
  t.equal(epoch.proposedBy, sampleProposedBy, 'should have correct proposedBy');
  t.end();
});

test('AssignmentEpoch - createNext increments epoch', async (t) => {
  const previous = new AssignmentEpoch({
    epoch: 41,
    assignments: {'partition-1': ['node1']},
    timestamp: '1706000000000-0001-node1',
    proposedBy: 'node1',
  });

  const newAssignments = {
    'partition-1': ['node1', 'node2'],
    'partition-2': ['node2', 'node3'],
  };

  const next = AssignmentEpoch.createNext(
    previous,
    newAssignments,
    sampleTimestamp,
    sampleProposedBy,
  );

  t.equal(next.epoch, 42, 'next epoch should be previous + 1');
  t.same(
    next.assignments['partition-1'],
    ['node1', 'node2'],
    'should have new assignments',
  );
  t.equal(next.timestamp, sampleTimestamp, 'should have new timestamp');
  t.equal(next.proposedBy, sampleProposedBy, 'should have new proposedBy');
  t.end();
});

test('AssignmentEpoch - createNext preserves immutability', async (t) => {
  const previous = AssignmentEpoch.createInitial('ts1', 'node1');
  const next = AssignmentEpoch.createNext(
    previous,
    {'p1': ['node1']},
    'ts2',
    'node2',
  );

  t.ok(Object.isFrozen(next), 'next epoch should be frozen');
  t.ok(Object.isFrozen(next.assignments), 'next assignments should be frozen');
  t.end();
});

test('EpochValidationError - has correct properties', async (t) => {
  const error = new EpochValidationError('Test message', 'testField');

  t.equal(error.name, 'EpochValidationError', 'should have correct name');
  t.equal(error.message, 'Test message', 'should have correct message');
  t.equal(error.field, 'testField', 'should have correct field');
  t.end();
});

test('AssignmentEpoch - allows empty node list for partition', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: 1,
    assignments: {'partition-1': []},
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.same(
    epoch.getPartitionAssignments('partition-1'),
    [],
    'should allow empty node list',
  );
  t.end();
});

test('AssignmentEpoch - handles large epoch numbers', async (t) => {
  const epoch = new AssignmentEpoch({
    epoch: Number.MAX_SAFE_INTEGER,
    assignments: {},
    timestamp: sampleTimestamp,
    proposedBy: sampleProposedBy,
  });

  t.equal(epoch.epoch, Number.MAX_SAFE_INTEGER, 'should handle large epoch numbers');
  t.end();
});
