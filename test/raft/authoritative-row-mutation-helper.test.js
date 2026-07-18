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
        routingReadinessDimension: 'controlPlaneRecoveryEligible',
        deliverySource: 'control-plane:write:services',
        recoveryCandidateSelectionKey: '{"data":{"raft_role":"leader","updated_at":123},"deliveryPriority":null,"ignoreExisting":false,"kind":"control-plane-mutation","operation":"update","routingReadinessDimension":"controlPlaneRecoveryEligible","row":null,"tableName":"services","whereClause":{"service_id":"replica-1"},"workClass":null}',
      },
    }, 'should use the configured row key and cache-visibility fields');
    t.same(result, {
      applied: true,
      authoritativeWriteApplied: true,
      cacheVisible: true,
      recoveredFromCacheGap: false,
      attempts: 1,
      partitionResult: {
        success: true,
        outcome: 'applied',
        completionState: 'applied',
        contractState: 'ready',
        nextAction: 'proceed',
      },
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

test('AuthoritativeRowMutationHelper - authoritative read failure cannot dedup against a local seed',
  async (t) => {
    const scheduled = [];
    const writes = [];
    let authoritativeReadCount = 0;
    const locallySeededRow = {
      partition_id: 'p1',
      leader_node_id: 'node-b',
      updated_at: 7,
    };
    const durableRow = {
      partition_id: 'p1',
      leader_node_id: 'node-a',
      updated_at: 7,
    };
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'partitions',
      buildWhereClause: (_value, context = {}) => ({
        partition_id: 'p1',
        leader_node_id: context.authoritativeRow?.leader_node_id,
        updated_at: context.authoritativeRow?.updated_at,
      }),
      buildUpdateData: (value, now) => ({
        leader_node_id: value,
        updated_at: now,
      }),
      buildExpectedCacheFields: (value) => ({
        leader_node_id: value,
      }),
      readValueFromCache: () => locallySeededRow.leader_node_id,
      readAuthoritativeRow: async () => {
        authoritativeReadCount += 1;
        if (authoritativeReadCount === 1) {
          throw new Error('authoritative owner timed out');
        }
        return {
          supported: true,
          available: true,
          row: durableRow,
        };
      },
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: {
        submitMutation: async (mutation) => {
          writes.push(mutation);
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
      now: () => 11,
    });

    helper.pendingValue = 'node-b';
    helper.persistedValue = 'node-a';

    const unavailableResult = await helper.flush();

    t.equal(
      unavailableResult.reason,
      'authoritative-confirm-unavailable',
      'a failed authoritative read should remain an unavailable confirmation',
    );
    t.equal(writes.length, 0,
      'the locally seeded cache row must not suppress the durable write');
    t.equal(helper.pendingValue, 'node-b',
      'the pending publication should survive the read failure');
    t.equal(helper.persistedValue, 'node-a',
      'the local seed must not be promoted to persisted evidence');
    t.equal(scheduled.length, 1,
      'the unavailable authoritative confirmation should arm a retry');

    await scheduled[0]();

    t.equal(writes.length, 1,
      'the retry should submit the durable owner publication');
    t.same(writes[0].whereClause, {
      partition_id: 'p1',
      leader_node_id: 'node-a',
      updated_at: 7,
    }, 'the durable publication should CAS against the authoritative row');
    t.equal(helper.pendingValue, null,
      'the pending publication should clear only after the durable write');
    t.equal(helper.persistedValue, 'node-b',
      'the helper should record persistence only after the durable write');
  });

test('AuthoritativeRowMutationHelper - deferred gateway outcome preserves pending state and retries with bounded delay',
  async (t) => {
    const scheduled = [];
    let submitCount = 0;
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'services',
      buildWhereClause: () => ({service_id: 'replica-1'}),
      buildUpdateData: (value, now) => ({
        raft_role: value,
        updated_at: now,
      }),
      buildExpectedCacheFields: (value) => ({raft_role: value}),
      readValueFromCache: () => null,
      retryDelayMs: 100,
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: {
        submitMutation: async () => {
          submitCount += 1;
          if (submitCount === 1) {
            return {
              success: false,
              outcome: 'deferred',
              retryAfterMs: 250,
            };
          }
          return {success: true, partitionResult: {affectedRows: 1}};
        },
      },
      setTimeoutFn: (callback, delayMs) => {
        scheduled.push({callback, delayMs});
        return callback;
      },
      clearTimeoutFn: () => {},
    });

    helper.pendingValue = 'leader';

    const deferredResult = await helper.flush();

    t.equal(deferredResult.reason, 'deferred',
      'gateway deferrals should surface typed deferred results');
    t.equal(deferredResult.partitionResult?.retryAfterMs, 250,
      'deferred result should preserve gateway retry hints');
    t.equal(helper.pendingValue, 'leader',
      'deferred gateway outcome should preserve pending state');
    t.equal(helper.persistedValue, null,
      'deferred gateway outcome should not claim the value was persisted');
    t.equal(scheduled.length, 1, 'deferred gateway outcome should arm one retry');
    t.equal(scheduled[0].delayMs, 250,
      'retry should respect the larger gateway retry hint');

    await scheduled[0].callback();

    t.equal(submitCount, 2, 'retry should reattempt the deferred owner write');
    t.equal(helper.pendingValue, null,
      'successful retry should clear the deferred pending value');
    t.equal(helper.persistedValue, 'leader',
      'successful retry should track the persisted owner value');
  });

test('AuthoritativeRowMutationHelper - repeated retryable outcomes back off exponentially',
  async (t) => {
    const scheduled = [];
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'services',
      buildWhereClause: () => ({service_id: 'replica-1'}),
      buildUpdateData: (value, now) => ({
        raft_role: value,
        updated_at: now,
      }),
      readValueFromCache: () => null,
      retryDelayMs: 100,
      maxRetryDelayMs: 350,
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: {
        submitMutation: async () => ({
          success: false,
          outcome: 'rejected',
        }),
      },
      setTimeoutFn: (callback, delayMs) => {
        scheduled.push({callback, delayMs});
        return callback;
      },
      clearTimeoutFn: () => {},
    });

    helper.pendingValue = 'leader';

    const firstResult = await helper.flush();
    t.equal(firstResult.reason, 'rejected',
      'first retryable gateway failure should surface typed rejection');
    t.equal(scheduled[0]?.delayMs, 100,
      'first retry should use the base retry delay');

    helper.retryTimer = null;
    const secondResult = await helper.flush();
    t.equal(secondResult.reason, 'rejected',
      'second retryable gateway failure should still preserve pending state');
    t.equal(scheduled[1]?.delayMs, 200,
      'second retry should back off exponentially');

    helper.retryTimer = null;
    await helper.flush();
    t.equal(scheduled[2]?.delayMs, 350,
      'retry delay should cap at the configured maximum');
  });

test('AuthoritativeRowMutationHelper - prepareFlush can defer and retry a pending owner update',
  async (t) => {
    const scheduled = [];
    let updateCalls = 0;
    let settling = true;
    const helper = new AuthoritativeRowMutationHelper({
      tableName: 'services',
      buildWhereClause: () => ({service_id: 'replica-1'}),
      buildUpdateData: (value, now) => ({
        raft_role: value,
        updated_at: now,
      }),
      readValueFromCache: () => null,
      prepareFlush: () => ({
        skip: settling,
        clearPending: false,
        retry: settling,
        reason: settling ? 'settling' : 'ready',
      }),
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

    const deferredResult = await helper.flush();

    t.equal(deferredResult.reason, 'settling', 'should surface the settling skip reason');
    t.equal(updateCalls, 0, 'should not write while prepareFlush keeps the owner deferred');
    t.equal(scheduled.length, 1, 'should arm one retry for the deferred owner update');
    t.equal(helper.pendingValue, 'leader', 'should preserve pending state while deferred');

    settling = false;
    await scheduled[0]();

    t.equal(updateCalls, 1, 'retry should persist once the defer gate opens');
    t.equal(helper.pendingValue, null, 'successful retry should clear the deferred pending value');
    t.equal(helper.persistedValue, 'leader', 'successful retry should track the persisted value');
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
    await new Promise((resolve) => setImmediate(resolve));

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
    let resolveSecondWrite = null;
    const secondWriteCompleted = new Promise((resolve) => {
      resolveSecondWrite = resolve;
    });
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
          resolveSecondWrite();
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
    await secondWriteCompleted;
    await new Promise((resolve) => setImmediate(resolve));

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

test('AuthoritativeRowMutationHelper - guard miss refreshes the observed row so a starved CDC feed cannot thrash the CAS forever',
  async (t) => {
    // Run-15 freeze trigger: the leader_node_id publish CAS-guards on the
    // locally cached partitions row, but that cache converges through the
    // very CDC publication this write is trying to make. With the guard
    // stale and the feed stalled, the pre-fix helper silently retried the
    // identical zero-row UPDATE for minutes (r4 became leader 09:32:27,
    // the pointer landed 09:36:44). The fix: a guard miss surfaces via
    // onObservedStateChanged and re-reads the authoritative row into the
    // cache before the retry, so the next CAS targets observed state.
    const scheduled = [];
    const writes = [];
    const observedEvents = [];
    let refreshCallCount = 0;
    const cachedRow = {
      partition_id: 'p1',
      leader_node_id: 'node-a',
      updated_at: 7,
    };
    // What the authority actually holds (advanced past the cached snapshot
    // by a write whose CDC event this node never received).
    const authoritativeRow = {
      partition_id: 'p1',
      leader_node_id: 'node-x',
      updated_at: 9,
    };
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
          writes.push({whereClause: {...whereClause}, data: {...data}});
          const guardMatchesAuthority =
            whereClause.leader_node_id === authoritativeRow.leader_node_id &&
            whereClause.updated_at === authoritativeRow.updated_at;
          return {
            success: true,
            partitionResult: {affectedRows: guardMatchesAuthority ? 1 : 0},
          };
        },
      },
      refreshObservedRow: async () => {
        refreshCallCount += 1;
        Object.assign(cachedRow, authoritativeRow);
      },
      onObservedStateChanged: (context) => {
        observedEvents.push(context);
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

    const firstResult = await helper.flush();

    t.equal(firstResult.reason, 'observed-state-changed',
      'the stale guard should miss the authoritative row');
    t.equal(observedEvents.length, 1,
      'the guard miss must be surfaced, never silent');
    t.equal(observedEvents[0].tableName, 'partitions',
      'the surfaced miss should carry the table name');
    t.equal(refreshCallCount, 1,
      'the guard miss must refresh the observed row from the authority');
    t.equal(scheduled.length, 1, 'the guard miss should arm one retry');

    // Fire the armed retry: the guard was refreshed, so the CAS must now
    // target the authoritative row and land.
    await scheduled.shift()();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(writes.length, 2, 'the retry should issue the follow-up write');
    t.same(writes[1].whereClause, {
      partition_id: 'p1',
      leader_node_id: 'node-x',
      updated_at: 9,
    }, 'the retry must guard against the refreshed observed row, not the stale snapshot');
    t.equal(helper.persistedValue, 'node-b',
      'the pending publication must converge once the guard is refreshed');
    t.equal(helper.pendingValue, null,
      'the pending value should clear after the converged write');
  });
