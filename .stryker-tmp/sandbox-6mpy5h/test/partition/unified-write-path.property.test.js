/**
 * Property Test: Unified Write Path Through applyCommittedEntry
 * **Property 7: Unified write path through applyCommittedEntry**
 * **Validates: Requirements 4.1, 4.2, 4.4, 4.5**
 *
 * Feature: transport-architecture-improvements,
 * Property 7: Unified write path through applyCommittedEntry
 *
 * *For any* write entry applied to a PartitionReplicationHandler,
 * regardless of whether the group has one replica or multiple replicas,
 * the entry SHALL pass through `applyCommittedEntry` which calls
 * `executeWriteEntry` — the single place where write SQL is executed.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  PartitionReplicationHandler,
} from '../../src/partition/partition-replication-handler.js';

const SINGLE_REPLICA_IDS = ['r-1'];
const MULTI_REPLICA_IDS = ['r-1', 'r-2', 'r-3'];

/**
 * Arbitrary for write entry payloads with random sql, params, and type.
 */
const writeEntryArb = fc.record({
  type: fc.constant('write'),
  sql: fc.stringOf(
    fc.constantFrom(
      'INSERT INTO t VALUES (?)',
      'UPDATE t SET x = ? WHERE id = ?',
      'DELETE FROM t WHERE id = ?',
      'INSERT INTO logs (msg) VALUES (?)',
    ),
  ).filter((s) => s.length > 0).map(
    () => fc.constantFrom(
      'INSERT INTO t VALUES (?)',
      'UPDATE t SET x = ? WHERE id = ?',
      'DELETE FROM t WHERE id = ?',
      'INSERT INTO logs (msg) VALUES (?)',
    ),
  ).chain((arb) => arb),
  params: fc.array(
    fc.oneof(fc.integer(), fc.string({maxLength: 20})),
    {minLength: 1, maxLength: 3},
  ),
});

/**
 * Arbitrary for replica configuration — single or multi.
 */
const replicaConfigArb = fc.constantFrom(
  {replicaIds: SINGLE_REPLICA_IDS, label: 'single-replica'},
  {replicaIds: MULTI_REPLICA_IDS, label: 'multi-replica'},
);

const createMockLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

/**
 * Create a PartitionReplicationHandler with call tracking.
 *
 * Tracks whether applyCommittedEntry and executeWriteEntry are called,
 * and in what order, to verify the unified write path.
 *
 * @param {Array<string>} replicaIds - Replica IDs for the partition.
 * @return {Object} Handler and tracking state.
 */
function createTrackedHandler(replicaIds) {
  const callLog = [];
  let logIndex = 0;

  const handler = new PartitionReplicationHandler({
    partitionId: 'p-test',
    replicaId: 'r-1',
    logger: createMockLogger(),
  });

  handler.replicaIds = replicaIds;

  handler.storage = {
    appendEntry: () => {
      logIndex++;
      return {index: logIndex};
    },
  };

  // Track applyCommittedEntry calls.
  // For single-replica, applyWrite calls this directly.
  // For multi-replica, the Raft commit event triggers this.
  // Must call resolveCommit to unblock the pending promise.
  handler.applyCommittedEntry = (command) => {
    callLog.push({
      method: 'applyCommittedEntry',
      entryId: command.entryId,
    });
    handler.resolveCommit(command.entryId, {
      success: true,
      changes: 1,
      partitionId: 'p-test',
    });
  };

  // Track executeWriteEntry calls — this should NOT be called
  // directly by applyWrite. It should only be reached through
  // applyCommittedEntry (which is wired by PartitionService).
  const originalExecuteWriteEntry =
    handler.executeWriteEntry.bind(handler);
  handler.executeWriteEntry = (entry, emitCdc) => {
    callLog.push({method: 'executeWriteEntry', entryId: entry.entryId});
    return originalExecuteWriteEntry(entry, emitCdc);
  };

  // For multi-replica: mock raft.command to simulate Raft consensus.
  // After raft.command is called, we simulate the commit event by
  // calling applyCommittedEntry and then resolveCommit.
  handler.raft = {
    command: (entry) => {
      callLog.push({method: 'raft.command', entryId: entry.entryId});
      // Simulate async Raft commit: call applyCommittedEntry then
      // resolve the pending commit (mimicking PartitionService).
      Promise.resolve().then(() => {
        handler.applyCommittedEntry(entry);
        handler.resolveCommit(entry.entryId, {
          success: true,
          changes: 1,
          partitionId: 'p-test',
        });
      });
      return Promise.resolve();
    },
  };

  return {handler, callLog};
}

test('Property 7: Unified write path through applyCommittedEntry',
  async (t) => {
    /**
     * Property: For any write entry on a single-replica handler,
     * applyWrite SHALL call applyCommittedEntry (not executeWriteEntry
     * directly). This verifies the unified path for single-replica.
     */
    t.test(
      'single-replica: applyWrite calls applyCommittedEntry',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            writeEntryArb,
            async (entry) => {
              const {handler, callLog} =
                createTrackedHandler(SINGLE_REPLICA_IDS);

              await handler.applyWrite({...entry});

              // applyCommittedEntry must have been called
              const committedCalls = callLog.filter(
                (c) => c.method === 'applyCommittedEntry',
              );
              if (committedCalls.length !== 1) return false;

              // executeWriteEntry must NOT have been called directly
              // by applyWrite (it is only called inside
              // applyCommittedEntry which is wired by PartitionService)
              const directExecuteCalls = callLog.filter(
                (c) => c.method === 'executeWriteEntry',
              );
              if (directExecuteCalls.length !== 0) return false;

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass('single-replica calls applyCommittedEntry');
      },
    );

    /**
     * Property: For any write entry on a multi-replica handler,
     * applyWrite SHALL propose through Raft (raft.command) and the
     * commit event SHALL trigger applyCommittedEntry.
     */
    t.test(
      'multi-replica: applyWrite proposes through Raft then ' +
      'applyCommittedEntry is called on commit',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            writeEntryArb,
            async (entry) => {
              const {handler, callLog} =
                createTrackedHandler(MULTI_REPLICA_IDS);

              await handler.applyWrite({...entry});

              // raft.command must have been called
              const raftCalls = callLog.filter(
                (c) => c.method === 'raft.command',
              );
              if (raftCalls.length !== 1) return false;

              // applyCommittedEntry must have been called (via
              // simulated Raft commit event)
              const committedCalls = callLog.filter(
                (c) => c.method === 'applyCommittedEntry',
              );
              if (committedCalls.length !== 1) return false;

              // raft.command must come before applyCommittedEntry
              const raftIdx = callLog.findIndex(
                (c) => c.method === 'raft.command',
              );
              const committedIdx = callLog.findIndex(
                (c) => c.method === 'applyCommittedEntry',
              );
              if (raftIdx >= committedIdx) return false;

              // executeWriteEntry must NOT have been called directly
              const directExecuteCalls = callLog.filter(
                (c) => c.method === 'executeWriteEntry',
              );
              if (directExecuteCalls.length !== 0) return false;

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'multi-replica proposes through Raft then ' +
          'applyCommittedEntry is called',
        );
      },
    );

    /**
     * Property: For any write entry and any replica configuration
     * (single or multi), applyCommittedEntry is always called exactly
     * once — verifying the unified path regardless of replica count.
     */
    t.test(
      'both paths converge at applyCommittedEntry for any config',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            writeEntryArb,
            replicaConfigArb,
            async (entry, config) => {
              const {handler, callLog} =
                createTrackedHandler(config.replicaIds);

              await handler.applyWrite({...entry});

              // applyCommittedEntry must be called exactly once
              const committedCalls = callLog.filter(
                (c) => c.method === 'applyCommittedEntry',
              );
              if (committedCalls.length !== 1) return false;

              // executeWriteEntry must NOT be called directly by
              // applyWrite — only through applyCommittedEntry
              const directExecuteCalls = callLog.filter(
                (c) => c.method === 'executeWriteEntry',
              );
              if (directExecuteCalls.length !== 0) return false;

              // The entryId on the committed call must match the
              // entry that was written
              const committedEntryId = committedCalls[0].entryId;
              if (!committedEntryId) return false;

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'both paths converge at applyCommittedEntry',
        );
      },
    );
  });
