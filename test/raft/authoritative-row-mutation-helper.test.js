import {test} from '../../src/test-helpers/tap.js';
import {
  AuthoritativeRowMutationHelper,
  classifyMutationFailure,
} from '../../src/raft/authoritative-row-mutation-helper.js';

test('AuthoritativeRowMutationHelper - flush persists pending owner-row update',
  async (t) => {
    const updates = [];
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'services',
      buildWhereClause: () => ({service_id: 'replica-1'}),
      buildUpdateData: (value, now) => ({
        raft_role: value,
        updated_at: now,
      }),
      buildExpectedCacheFields: (value) => ({raft_role: value}),
      readValueFromCache: () => null,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, data, options) => {
          updates.push({tableName, whereClause, data, options});
          return {success: true};
        },
      },
      now: () => 123,
    });

    helper.pendingValue = 'leader';

    const result = await helper.flush();

    t.equal(updates.length, 1, 'should issue a single authoritative update');
    t.same(updates[0], {
      tableName: 'services',
      whereClause: {service_id: 'replica-1'},
      data: {
        raft_role: 'leader',
        updated_at: 123,
      },
      options: {
        expectedCacheFields: {raft_role: 'leader'},
      },
    }, 'should use the configured row key and cache-visibility fields');
    t.same(result, {
      applied: true,
      authoritativeWriteApplied: true,
      cacheVisible: true,
      recoveredFromCacheGap: false,
      attempts: 1,
      partitionResult: {success: true},
      reason: 'applied',
    }, 'should return structured success metadata');
    t.equal(helper.persistedValue, 'leader', 'should track persisted value');
    t.equal(helper.pendingValue, null, 'should clear pending value after success');
  });

test('AuthoritativeRowMutationHelper - flush recovers from cache visibility gap without rewrite',
  async (t) => {
    let updateCalls = 0;
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'services',
      buildWhereClause: () => ({service_id: 'replica-1'}),
      buildUpdateData: (value, now) => ({
        raft_role: value,
        updated_at: now,
      }),
      readValueFromCache: () => 'leader',
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          updateCalls += 1;
          return {success: true};
        },
      },
    });

    helper.pendingValue = 'leader';

    const result = await helper.flush();

    t.equal(updateCalls, 0, 'cache convergence should suppress a redundant rewrite');
    t.equal(helper.persistedValue, 'leader', 'persisted value should resync from cache');
    t.equal(helper.pendingValue, null, 'pending value should clear when cache matches');
    t.same(result, {
      applied: false,
      authoritativeWriteApplied: false,
      cacheVisible: true,
      recoveredFromCacheGap: true,
      attempts: 0,
      reason: 'cache-visibility-gap-recovered',
    }, 'should classify recovered cache gaps without another write');
  });

test('AuthoritativeRowMutationHelper - flush schedules retry when owner row is not ready',
  async (t) => {
    const scheduled = [];
    let ready = false;
    let updateCalls = 0;
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'services',
      buildWhereClause: () => ({service_id: 'replica-1'}),
      buildUpdateData: (value, now) => ({
        raft_role: value,
        updated_at: now,
      }),
      buildExpectedCacheFields: (value) => ({raft_role: value}),
      readValueFromCache: () => null,
      isWriteReady: () => ready,
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          updateCalls += 1;
          return {success: true};
        },
      },
      setTimeoutFn: (callback) => {
        scheduled.push(callback);
        return callback;
      },
      clearTimeoutFn: () => {},
    });

    helper.pendingValue = 'leader';

    const initialResult = await helper.flush();

    t.equal(initialResult.reason, 'owner-not-ready', 'should classify owner readiness gaps');
    t.equal(scheduled.length, 1, 'should schedule exactly one retry');
    t.equal(updateCalls, 0, 'should not write before the owner row is ready');

    ready = true;
    await scheduled[0]();

    t.equal(updateCalls, 1, 'retry should perform the authoritative write once ready');
    t.equal(helper.pendingValue, null, 'successful retry should clear pending state');
    t.equal(helper.persistedValue, 'leader', 'successful retry should persist the pending value');
  });

test('AuthoritativeRowMutationHelper - flushes newer pending value after in-flight write',
  async (t) => {
    const updates = [];
    let now = 100;
    let releaseFirstWrite = null;
    let signalFirstWriteStarted = null;
    let resolveSecondWrite = null;
    const firstWriteStarted = new Promise((resolve) => {
      signalFirstWriteStarted = resolve;
    });
    const firstWriteReleased = new Promise((resolve) => {
      releaseFirstWrite = resolve;
    });
    const secondWriteCompleted = new Promise((resolve) => {
      resolveSecondWrite = resolve;
    });
    let updateCallCount = 0;
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'services',
      buildWhereClause: () => ({service_id: 'replica-1'}),
      buildUpdateData: (value, updatedAt) => ({
        raft_role: value,
        updated_at: updatedAt,
      }),
      buildExpectedCacheFields: (value) => ({raft_role: value}),
      readValueFromCache: () => null,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, data, options) => {
          updateCallCount += 1;
          updates.push({tableName, whereClause, data, options});
          if (updateCallCount === 1) {
            signalFirstWriteStarted();
            await firstWriteReleased;
          } else {
            resolveSecondWrite();
          }
          return {success: true, call: updateCallCount};
        },
      },
      now: () => now++,
    });

    helper.pendingValue = 'candidate';
    const initialFlush = helper.flush();
    await firstWriteStarted;

    helper.queue('leader');
    releaseFirstWrite();

    await initialFlush;
    await secondWriteCompleted;

    t.equal(updates.length, 2, 'should perform a follow-up authoritative write');
    t.same(updates.map((update) => update.data), [
      {raft_role: 'candidate', updated_at: 100},
      {raft_role: 'leader', updated_at: 101},
    ], 'should persist both the in-flight value and the newer pending value in order');
    t.equal(helper.persistedValue, 'leader', 'should track the latest persisted value');
    t.equal(helper.pendingValue, null, 'should clear the newer pending value after follow-up flush');
  });

test('AuthoritativeRowMutationHelper - guarded owner write miss preserves pending state and retries',
  async (t) => {
    const scheduled = [];
    let capturedWhereClause = null;
    let updateCallCount = 0;
    const cachedRow = {
      partition_id: 'p1',
      leader_node_id: 'node-a',
      updated_at: 7,
    };
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'partitions',
      buildWhereClause: (_value, context = {}) => ({
        partition_id: 'p1',
        leader_node_id: context.cachedRow?.leader_node_id,
        updated_at: context.cachedRow?.updated_at,
      }),
      buildUpdateData: (value, now) => ({
        leader_node_id: value,
        updated_at: now,
      }),
      readRowFromCache: () => cachedRow,
      readValueFromCache: () => cachedRow.leader_node_id,
      cdcIntegrationService: {
        updateSystemTableRow: async (_tableName, whereClause) => {
          updateCallCount += 1;
          capturedWhereClause = whereClause;
          return {
            success: true,
            partitionResult: {affectedRows: 0},
          };
        },
      },
      setTimeoutFn: (callback) => {
        scheduled.push(callback);
        return callback;
      },
      clearTimeoutFn: () => {},
      now: () => 11,
    });

    helper.pendingValue = 'node-b';
    helper.persistedValue = 'node-a';

    const result = await helper.flush();

    t.same(
      capturedWhereClause,
      {
        partition_id: 'p1',
        leader_node_id: 'node-a',
        updated_at: 7,
      },
      'guarded owner write should target the observed owner row snapshot',
    );
    t.equal(result.reason, 'observed-state-changed',
      'guard miss should classify observed-state changes explicitly');
    t.equal(helper.pendingValue, 'node-b',
      'guard miss should preserve the pending owner update for reconciliation');
    t.equal(helper.persistedValue, 'node-a',
      'guard miss should keep the last known persisted owner value');
    t.equal(scheduled.length, 1, 'guard miss should schedule one retry');

    await Promise.resolve();
    await Promise.resolve();

    t.equal(updateCallCount, 1,
      'guard miss must not spin immediate follow-up microtasks before the retry budget');
  });

test('AuthoritativeRowMutationHelper - queued owner update is not stranded behind a retry timer',
  async (t) => {
    const scheduled = [];
    const writes = [];
    const cachedRow = {
      partition_id: 'p1',
      leader_node_id: 'node-a',
      updated_at: 7,
    };
    let updateCallCount = 0;
    let now = 11;
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'partitions',
      buildWhereClause: (_value, context = {}) => ({
        partition_id: 'p1',
        leader_node_id: context.cachedRow?.leader_node_id,
        updated_at: context.cachedRow?.updated_at,
      }),
      buildUpdateData: (value, updatedAt) => ({
        leader_node_id: value,
        updated_at: updatedAt,
      }),
      readRowFromCache: () => cachedRow,
      readValueFromCache: () => cachedRow.leader_node_id,
      cdcIntegrationService: {
        updateSystemTableRow: async (_tableName, whereClause, data) => {
          updateCallCount += 1;
          writes.push({whereClause, data});
          if (updateCallCount === 1) {
            return {
              success: true,
              partitionResult: {affectedRows: 0},
            };
          }
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
      },
      setTimeoutFn: (callback) => {
        scheduled.push(callback);
        return callback;
      },
      clearTimeoutFn: () => {},
      now: () => now++,
    });

    helper.pendingValue = 'node-b';
    helper.persistedValue = 'node-a';

    const firstResult = await helper.flush();

    t.equal(firstResult.reason, 'observed-state-changed',
      'initial guarded miss should schedule reconciliation');
    t.equal(scheduled.length, 1, 'guard miss should arm one retry timer');

    cachedRow.leader_node_id = 'node-b';
    cachedRow.updated_at = 8;
    helper.queue('node-c');
    await Promise.resolve();

    t.equal(updateCallCount, 2,
      'a newer queued owner update should converge before the retry timer fires');
    t.same(writes, [
      {
        whereClause: {
          partition_id: 'p1',
          leader_node_id: 'node-a',
          updated_at: 7,
        },
        data: {
          leader_node_id: 'node-b',
          updated_at: 11,
        },
      },
      {
        whereClause: {
          partition_id: 'p1',
          leader_node_id: 'node-b',
          updated_at: 8,
        },
        data: {
          leader_node_id: 'node-c',
          updated_at: 12,
        },
      },
    ], 'follow-up writes should eventually advance to the latest observed owner row');

    cachedRow.leader_node_id = 'node-c';
    cachedRow.updated_at = 9;
    await scheduled[0]();

    t.equal(updateCallCount, 2, 'stale retry timer should no-op once the latest value is persisted');
    t.equal(helper.persistedValue, 'node-c', 'latest queued owner update should persist');
    t.equal(helper.pendingValue, null, 'latest queued owner update should clear pending state');
  });

test('AuthoritativeRowMutationHelper - classifies cache visibility failures', async (t) => {
  t.equal(
    classifyMutationFailure(new Error('Cache update not observed for services:replica-1')),
    'cache-visibility-gap-unrecovered',
  );
  t.equal(
    classifyMutationFailure(new Error('database unavailable')),
    'authoritative-write-failed',
  );
});

test('AuthoritativeRowMutationHelper - prepareFlush can clear pending owner update',
  async (t) => {
    let updateCalls = 0;
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'partitions',
      buildWhereClause: () => ({partition_id: 'p1'}),
      buildUpdateData: (value, now) => ({
        leader_node_id: value,
        updated_at: now,
      }),
      readValueFromCache: () => null,
      prepareFlush: () => ({
        skip: true,
        clearPending: true,
        reason: 'not-owner',
      }),
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          updateCalls += 1;
          return {success: true};
        },
      },
    });

    helper.pendingValue = 'node-a';

    const result = await helper.flush();

    t.equal(updateCalls, 0, 'skipped owner updates should not write');
    t.equal(helper.pendingValue, null, 'skip path should clear pending owner update');
    t.same(result, {
      applied: false,
      authoritativeWriteApplied: false,
      cacheVisible: true,
      recoveredFromCacheGap: false,
      attempts: 0,
      reason: 'not-owner',
    }, 'skip path should report structured ownership metadata');
  });

test('AuthoritativeRowMutationHelper - shutdown prevents retries from an in-flight failed write',
  async (t) => {
    const scheduled = [];
    let releaseWrite;
    const writeStarted = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'services',
      buildWhereClause: () => ({service_id: 'replica-1'}),
      buildUpdateData: (value, now) => ({
        raft_role: value,
        updated_at: now,
      }),
      readValueFromCache: () => null,
      cdcIntegrationService: {
        updateSystemTableRow: async () => {
          await writeStarted;
          throw new Error('distributed operation failed');
        },
      },
      setTimeoutFn: (callback) => {
        scheduled.push(callback);
        return callback;
      },
      clearTimeoutFn: () => {},
    });

    helper.pendingValue = 'leader';
    const flushPromise = helper.flush();
    helper.shutdown();
    releaseWrite();

    await t.rejects(flushPromise, /distributed operation failed/,
      'in-flight failure should still reach the caller');
    t.equal(scheduled.length, 0,
      'shutdown should suppress any retry timer armed by the late failure');
    t.equal(helper.pendingValue, null,
      'shutdown should discard pending state once the helper is terminal');
  });
