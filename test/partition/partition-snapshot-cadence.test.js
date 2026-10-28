import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  canCompactPartitionRaftLog,
  evaluatePartitionSnapshotCadence,
} from '../../src/partition/partition-snapshot-cadence.js';
import {
  PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS,
} from '../../src/partition/partition-service-participant-transaction-cadence-methods.js';

describe('partition snapshot cadence', () => {
  describe('canCompactPartitionRaftLog', () => {
    it('returns false when service is falsy', () => {
      assert.equal(canCompactPartitionRaftLog(null), false);
      assert.equal(canCompactPartitionRaftLog(undefined), false);
    });

    it('returns true when raftBackend === null and service.raft.compactLog is a function', () => {
      const service = {
        raftBackend: null,
        raft: {
          compactLog: () => {},
        },
      };
      assert.equal(canCompactPartitionRaftLog(service), true);
    });

    it('returns false when raftBackend === null and service.raft has no compactLog', () => {
      const service = {
        raftBackend: null,
        raft: {},
      };
      assert.equal(canCompactPartitionRaftLog(service), false);
    });

    it('returns true when raftBackend !== null and raftBackend.compactLog is a function', () => {
      const service = {
        raftBackend: {
          compactLog: () => {},
        },
      };
      assert.equal(canCompactPartitionRaftLog(service), true);
    });

    it('returns true when compactDurableRaftLog is a function', () => {
      const service = {
        raftBackend: {},
        compactDurableRaftLog: () => {},
      };
      assert.equal(canCompactPartitionRaftLog(service), true);
    });

    it('returns true when raft.compactLog is a function and durable checkpointing is enabled', () => {
      const service = {
        raftBackend: {},
        raft: {
          compactLog: () => {},
        },
        durableCheckpointingEnabled: true,
      };
      assert.equal(canCompactPartitionRaftLog(service), true);
    });
  });

  describe('evaluatePartitionSnapshotCadence', () => {
    it('skips evaluation when compaction is unsupported', () => {
      const service = {};
      const outcome = evaluatePartitionSnapshotCadence(service);
      assert.equal(outcome.status, 'skipped');
      assert.equal(outcome.reason, 'cannot_compact');
    });

    it('skips evaluation when committed writes are below threshold', () => {
      const service = {
        raftBackend: null,
        raft: {compactLog: () => {}},
        committedWritesSinceSnapshot: 5,
        snapshotThreshold: 10,
      };
      const outcome = evaluatePartitionSnapshotCadence(service);
      assert.equal(outcome.status, 'skipped');
      assert.equal(outcome.reason, 'below_threshold');
    });

    it('compacts directly without wal_checkpoint when raftBackend === null', () => {
      let compactedIndex = null;
      let pragmaCalled = false;
      const service = {
        raftBackend: null,
        lastCommittedIndex: 42,
        committedWritesSinceSnapshot: 100,
        snapshotThreshold: 10,
        raft: {
          compactLog: (index) => {
            compactedIndex = index;
            return {compacted: true};
          },
        },
        db: {
          pragma: () => {
            pragmaCalled = true;
          },
        },
      };

      const outcome = evaluatePartitionSnapshotCadence(service);
      assert.equal(outcome.status, 'compacted');
      assert.equal(outcome.commitIndex, 42);
      assert.equal(compactedIndex, 42);
      assert.equal(pragmaCalled, false);
      assert.equal(service.lastCheckpointedCommitIndex, 42);
      assert.equal(service.committedWritesSinceSnapshot, 0);
    });

    it('invokes wal_checkpoint before compaction callback when raftBackend !== null', () => {
      const callOrder = [];
      let compactedIndex = null;
      const service = {
        raftBackend: {
          compactLog: (index) => {
            callOrder.push('compactLog');
            compactedIndex = index;
            return {compacted: true};
          },
        },
        lastCommittedIndex: 108,
        committedWritesSinceSnapshot: 15,
        snapshotThreshold: 10,
        db: {
          pragma: (sql) => {
            callOrder.push(`pragma:${sql}`);
          },
        },
      };

      const outcome = evaluatePartitionSnapshotCadence(service);
      assert.equal(outcome.status, 'compacted');
      assert.equal(outcome.commitIndex, 108);
      assert.equal(compactedIndex, 108);
      assert.deepEqual(callOrder, ['pragma:wal_checkpoint(TRUNCATE)', 'compactLog']);
      assert.equal(service.lastCheckpointedCommitIndex, 108);
      assert.equal(service.committedWritesSinceSnapshot, 0);
    });

    it('prefers compactDurableRaftLog if defined on service', () => {
      let callbackInvoked = null;
      const service = {
        raftBackend: {
          compactLog: () => {
            callbackInvoked = 'backend';
          },
        },
        compactDurableRaftLog: () => {
          callbackInvoked = 'service';
        },
        lastCommittedIndex: 200,
        snapshotThreshold: 5,
        committedWritesSinceSnapshot: 10,
        db: {pragma: () => {}},
      };

      const outcome = evaluatePartitionSnapshotCadence(service);
      assert.equal(outcome.status, 'compacted');
      assert.equal(callbackInvoked, 'service');
      assert.equal(service.lastCheckpointedCommitIndex, 200);
    });

    it('fails safely and catches wal_checkpoint failure without invoking compaction', () => {
      let compactionCalled = false;
      const service = {
        raftBackend: {
          compactLog: () => {
            compactionCalled = true;
          },
        },
        lastCommittedIndex: 50,
        snapshotThreshold: 5,
        committedWritesSinceSnapshot: 10,
        db: {
          pragma: () => {
            throw new Error('database is locked');
          },
        },
      };

      const outcome = evaluatePartitionSnapshotCadence(service);
      assert.equal(outcome.status, 'failed');
      assert.match(outcome.error, /database is locked/);
      assert.equal(compactionCalled, false);
      assert.equal(service.lastCheckpointedCommitIndex, undefined);
    });
  });

  describe('recordCommittedWriteForSnapshotCadence', () => {
    it('increments write count, records outcome, and warns on failure', () => {
      const warnings = [];
      const service = Object.create(
        PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS,
      );
      Object.assign(service, {
        partitionId: 'part-test-1',
        snapshotThreshold: 5,
        committedWritesSinceSnapshot: 3,
        lastCommittedIndex: 12,
        raftBackend: {
          compactLog: () => {
            throw new Error('disk full');
          },
        },
        db: {
          pragma: () => {},
        },
        logger: {
          warn: (msg, meta) => {
            warnings.push({msg, meta});
          },
        },
      });

      // Write count becomes 3 + 2 = 5, meeting threshold 5
      const outcome = service.recordCommittedWriteForSnapshotCadence(2);
      assert.equal(outcome.status, 'failed');
      assert.match(outcome.error, /disk full/);
      assert.equal(service.lastSnapshotCadenceOutcome, outcome);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].meta.partitionId, 'part-test-1');
    });

    it('increments write count and returns skipped if below threshold without warnings', () => {
      const warnings = [];
      const service = Object.create(
        PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS,
      );
      Object.assign(service, {
        partitionId: 'part-test-2',
        snapshotThreshold: 10,
        committedWritesSinceSnapshot: 1,
        raftBackend: null,
        raft: {compactLog: () => {}},
        logger: {
          warn: (msg, meta) => {
            warnings.push({msg, meta});
          },
        },
      });

      const outcome = service.recordCommittedWriteForSnapshotCadence(1);
      assert.equal(outcome.status, 'skipped');
      assert.equal(service.committedWritesSinceSnapshot, 2);
      assert.equal(service.lastSnapshotCadenceOutcome, outcome);
      assert.equal(warnings.length, 0);
    });
  });
});
