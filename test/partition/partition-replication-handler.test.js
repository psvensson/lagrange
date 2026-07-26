/**
 * Unit tests for PartitionReplicationHandler.
 *
 * Validates ProposalQueue integration and the unified write path
 * through applyCommittedEntry for both single-replica and multi-replica.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PartitionReplicationHandler,
} from '../../src/partition/partition-replication-handler.js';
import {ProposalQueue} from '../../src/partition/proposal-queue.js';
import {
  PROPOSAL_QUEUE_ERROR_MSG,
} from '../../src/partition/proposal-queue-constants.js';

const createMockLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

test('PartitionReplicationHandler ProposalQueue integration',
  async (t) => {
    t.test('constructor creates a ProposalQueue instance',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        t.ok(
          handler.proposalQueue instanceof ProposalQueue,
          'proposalQueue should be a ProposalQueue instance',
        );
        t.equal(
          handler.proposalQueue.size, 0,
          'proposalQueue should start empty',
        );
      });

    t.test('getPendingCommitCount delegates to proposalQueue.size',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        t.equal(
          handler.getPendingCommitCount(), 0,
          'should return 0 when empty',
        );

        handler.proposalQueue.enqueue('e-1', {
          resolve: () => {},
          reject: () => {},
        });

        t.equal(
          handler.getPendingCommitCount(), 1,
          'should return 1 after enqueue',
        );
      });

    t.test('resolveCommit delegates to proposalQueue.resolve on success',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        let resolvedValue = null;
        handler.proposalQueue.enqueue('e-1', {
          resolve: (val) => {
            resolvedValue = val;
          },
          reject: () => {},
          logIndex: 42,
        });

        const result = handler.resolveCommit('e-1', {
          success: true,
          changes: 1,
          partitionId: 'p-1',
        });

        t.equal(result, true, 'should return true');
        t.equal(
          handler.getPendingCommitCount(), 0,
          'entry should be removed',
        );
        t.same(resolvedValue, {
          success: true,
          changes: 1,
          partitionId: 'p-1',
          logIndex: 42,
        }, 'should resolve with result augmented by logIndex');
      });

    t.test('resolveCommit delegates to proposalQueue.reject on failure',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        let rejectedError = null;
        handler.proposalQueue.enqueue('e-1', {
          resolve: () => {},
          reject: (err) => {
            rejectedError = err;
          },
          logIndex: 10,
        });

        const result = handler.resolveCommit('e-1', {
          success: false,
          error: 'SQL constraint violation',
        });

        t.equal(result, true, 'should return true');
        t.equal(
          handler.getPendingCommitCount(), 0,
          'entry should be removed',
        );
        t.ok(
          rejectedError instanceof Error,
          'should reject with Error',
        );
        t.equal(
          rejectedError.message,
          'SQL constraint violation',
          'error message should match',
        );
      });

    t.test('resolveCommit returns false for unknown entryId',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        const result = handler.resolveCommit('nonexistent', {
          success: true,
        });

        t.equal(result, false, 'should return false');
      });

    t.test('rejectCommit delegates to proposalQueue.reject',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        let rejectedError = null;
        handler.proposalQueue.enqueue('e-1', {
          resolve: () => {},
          reject: (err) => {
            rejectedError = err;
          },
        });

        const result = handler.rejectCommit('e-1', 'leadership lost');

        t.equal(result, true, 'should return true');
        t.equal(
          handler.getPendingCommitCount(), 0,
          'entry should be removed',
        );
        t.ok(
          rejectedError instanceof Error,
          'should reject with Error',
        );
        t.equal(
          rejectedError.message,
          'leadership lost',
          'error message should match',
        );
      });

    t.test('rejectCommit returns false for unknown entryId',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        const result = handler.rejectCommit('nonexistent', 'error');

        t.equal(result, false, 'should return false');
      });

    t.test('clearPendingCommits delegates to proposalQueue.clear',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        const errors = [];
        handler.proposalQueue.enqueue('e-1', {
          resolve: () => {},
          reject: (err) => errors.push(err),
        });
        handler.proposalQueue.enqueue('e-2', {
          resolve: () => {},
          reject: (err) => errors.push(err),
        });

        t.equal(
          handler.getPendingCommitCount(), 2,
          'should have 2 entries',
        );

        handler.clearPendingCommits('shutdown');

        t.equal(
          handler.getPendingCommitCount(), 0,
          'should be empty after clear',
        );
        t.equal(errors.length, 2, 'all entries should be rejected');
        for (const err of errors) {
          t.ok(err instanceof Error, 'each should be an Error');
          t.equal(err.message, 'shutdown', 'message should match');
        }
      });

    t.test('proposeAndWaitForCommit uses proposalQueue.enqueue',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        let commandCalled = false;
        handler.raft = {
          command: () => {
            commandCalled = true;
            return Promise.resolve();
          },
        };
        handler.storage = {
          appendEntry: () => ({index: 1}),
        };

        const logEntry = {index: 5};
        const entry = {
          sql: 'INSERT INTO t VALUES (?)',
          params: [1],
          entryId: 'test-entry-id',
        };

        // Start the proposal (don't await — it waits for commit)
        const promise = handler.proposeAndWaitForCommit(entry, logEntry);

        t.equal(
          handler.getPendingCommitCount(), 1,
          'should have 1 pending entry',
        );
        t.ok(commandCalled, 'raft.command should be called');

        // Resolve the pending commit to complete the promise
        handler.resolveCommit(entry.entryId, {
          success: true,
          changes: 1,
          partitionId: 'p-1',
        });

        const result = await promise;
        t.equal(result.success, true, 'should resolve with result');
        t.equal(result.logIndex, 5, 'should include logIndex');
        t.equal(
          handler.getPendingCommitCount(), 0,
          'should be empty after resolve',
        );
      });

    t.test(
      'proposeAndWaitForCommit rejects on backpressure',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        // Replace with a tiny-capacity queue
        handler.proposalQueue = new ProposalQueue({maxCapacity: 1});

        handler.raft = {
          command: () => Promise.resolve(),
        };

        // Fill the queue
        handler.proposalQueue.enqueue('existing', {
          resolve: () => {},
          reject: () => {},
        });

        const entry = {
          sql: 'INSERT INTO t VALUES (?)',
          params: [1],
          entryId: 'bp-entry-id',
        };
        const logEntry = {index: 1};

        await t.rejects(
          handler.proposeAndWaitForCommit(entry, logEntry),
          {message: PROPOSAL_QUEUE_ERROR_MSG.BACKPRESSURE},
          'should reject with backpressure error when queue is full',
        );

        // Clean up the existing entry
        handler.proposalQueue.reject('existing', 'cleanup');
      });
  });


test('PartitionReplicationHandler unified write path',
  async (t) => {
    t.test('isMultiReplica returns false when replicaIds is null',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        t.equal(
          handler.isMultiReplica(), false,
          'should return false when replicaIds is null',
        );
      });

    t.test('isMultiReplica returns false for single replica',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        handler.replicaIds = ['r-1'];

        t.equal(
          handler.isMultiReplica(), false,
          'should return false for single replica',
        );
      });

    t.test('isMultiReplica returns true for multiple replicas',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        handler.replicaIds = ['r-1', 'r-2', 'r-3'];

        t.equal(
          handler.isMultiReplica(), true,
          'should return true for 3 replicas',
        );
      });

    t.test('setDependencies stores replicaIds and applyCommittedEntry',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        const replicaIds = ['r-1', 'r-2'];
        const applyCommittedEntry = () => {};

        handler.setDependencies({
          transport: null,
          buildPeerAddress: null,
          storage: null,
          db: null,
          raft: null,
          hlcClock: null,
          getRole: null,
          getLeaderId: null,
          scheduleSizeUpdate: null,
          generateCDCEvent: null,
          replicaIds,
          applyCommittedEntry,
        });

        t.same(
          handler.replicaIds, replicaIds,
          'replicaIds should be set',
        );
        t.equal(
          handler.applyCommittedEntry, applyCommittedEntry,
          'applyCommittedEntry callback should be set',
        );
      });

    t.test(
      'applyWrite single-replica calls applyCommittedEntry callback',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        let committedCommand = null;
        let directApplyMarked = false;
        handler.replicaIds = ['r-1'];
        handler.storage = {
          appendEntry: () => ({index: 7}),
          recordDirectApplyMarker: () => {
            directApplyMarked = true;
          },
        };
        handler.applyCommittedEntry = (command) => {
          committedCommand = command;
          // Simulate what PartitionService does: execute SQL and
          // resolve the pending commit
          handler.resolveCommit(command.entryId, {
            success: true,
            changes: 1,
            partitionId: 'p-1',
          });
        };

        const entry = {
          type: 'write',
          sql: 'INSERT INTO t VALUES (?)',
          params: [1],
        };

        const result = await handler.applyWrite(entry);

        t.ok(
          committedCommand !== null,
          'applyCommittedEntry should be called',
        );
        t.ok(
          directApplyMarked,
          'the direct-apply marker is durably recorded before applying ' +
          '(raft-snapshot-checkpoint-format fail-closed certificate)',
        );
        t.equal(
          committedCommand.sql, entry.sql,
          'should pass the entry to applyCommittedEntry',
        );
        t.ok(
          committedCommand.entryId,
          'entry should have entryId stamped',
        );
        t.equal(
          result.logIndex, 7,
          'should return logIndex from storage',
        );
      });

    t.test(
      'applyWrite multi-replica calls proposeAndWaitForCommit',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        let commandCalled = false;
        handler.replicaIds = ['r-1', 'r-2', 'r-3'];
        handler.storage = {
          appendEntry: () => ({index: 10}),
        };
        handler.raft = {
          command: () => {
            commandCalled = true;
            return Promise.resolve();
          },
        };

        const entry = {
          type: 'write',
          sql: 'INSERT INTO t VALUES (?)',
          params: [1],
        };

        // Start applyWrite (don't await — multi-replica waits for commit)
        const promise = handler.applyWrite(entry);

        t.ok(commandCalled, 'raft.command should be called');
        t.equal(
          handler.getPendingCommitCount(), 1,
          'should have 1 pending entry',
        );

        // Resolve the pending commit
        handler.resolveCommit(entry.entryId, {
          success: true,
          changes: 1,
          partitionId: 'p-1',
        });

        const result = await promise;
        t.equal(result.success, true, 'should resolve with result');
        t.equal(result.logIndex, 10, 'should include logIndex');
      });

    t.test(
      'applyWrite does not call executeWriteEntry directly',
      async (t) => {
        const handler = new PartitionReplicationHandler({
          partitionId: 'p-1',
          replicaId: 'r-1',
          logger: createMockLogger(),
        });

        let executeWriteCalled = false;
        handler.replicaIds = ['r-1'];
        handler.storage = {
          appendEntry: () => ({index: 1}),
          recordDirectApplyMarker: () => {},
        };
        handler.applyCommittedEntry = (command) => {
          // Simulate PartitionService: resolve the pending commit
          handler.resolveCommit(command.entryId, {
            success: true,
            changes: 0,
          });
        };
        handler.executeWriteEntry = () => {
          executeWriteCalled = true;
          return {success: true, changes: 0};
        };

        const entry = {
          type: 'write',
          sql: 'SELECT 1',
        };

        await handler.applyWrite(entry);

        t.equal(
          executeWriteCalled, false,
          'applyWrite should NOT call executeWriteEntry directly; ' +
          'it goes through applyCommittedEntry',
        );
      });
  });
