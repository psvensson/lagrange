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
