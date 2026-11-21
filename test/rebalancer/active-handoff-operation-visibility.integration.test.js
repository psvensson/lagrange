import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {CDC_OPERATION, TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../../src/control-plane/timeout-budget.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  createCommittedTimeoutLedger, createTimeoutSweepCoordinator, createTimeoutVisibilityCache,
} from './rebalance-coordinator-timeout-cache-visibility-fixture.js';

const OPERATION_ID = 'active-handoff-exact-ledger-operation';
const PARTITION_ID = 'active-handoff-exact-ledger-p1';
const REPLICA_ID = `${PARTITION_ID}-r2`;
const SOURCE = 'node-a';
const TARGET = 'node-b';

function exactOperationRead(sql, params) {
  return sql.includes('FROM replica_operations WHERE operation_id = ?') &&
    params[0] === OPERATION_ID;
}

async function driveRepositoryBackoff(timeSource, callback) {
  let settled = false;
  const result = Promise.resolve(callback()).finally(() => {
    settled = true;
  });
  // The real repository owns these backoff sleeps. Advance only the injected
  // fixture clock while waiting for this exact retry turn.
  for (let turn = 0; turn < 200 && !settled; turn += 1) {
    timeSource.advance(20);
    await nextTurn();
  }
  assert.ok(settled, 'the repository turn settles within its existing read retry window');
  return result;
}

async function withWaitingHandoff(measure) {
  const now = Date.now();
  const timeSource = new VirtualTimeSource({startMs: now});
  const sentAt = now - 70_000;
  const operation = {
    operation_id: OPERATION_ID, type: 'ADD', partition_id: PARTITION_ID,
    entity_type: 'partition', entity_id: PARTITION_ID, replica_id: REPLICA_ID,
    source_node_id: SOURCE, target_node_id: TARGET, workflow_step: WORKFLOW_STEP.SENDING,
    status: 'pending', created_at: sentAt, updated_at: sentAt, completed_at: null,
    steps_history: JSON.stringify([{step: WORKFLOW_STEP.SENDING, timestamp: sentAt}]),
  };
  const service = {
    service_id: REPLICA_ID, replica_id: REPLICA_ID, partition_id: PARTITION_ID,
    service_type: 'partition', node_id: TARGET, address: `${TARGET}/partition/${REPLICA_ID}`,
    status: 'active', raft_role: 'follower', created_at: sentAt,
    state_entered_at: sentAt + 1, updated_at: sentAt + 1,
  };
  let serviceReadCount = 0;
  let serviceAvailable = false;
  let operationReadDeferred = false;
  const notifications = [];
  const cache = createTimeoutVisibilityCache(operation, [service], {
    scheduleCacheChangeNotification: (notify) => notifications.push(notify),
  });
  const liveService = {...service, state_entered_at: now, updated_at: now};
  const ledger = createCommittedTimeoutLedger(operation, {
    cache,
    readServices(_sql, params) {
      serviceReadCount += 1;
      const rows = serviceAvailable && params[0] === REPLICA_ID ? [liveService] : [];
      return {success: true, rows, rowSetComplete: rows.length === 1};
    },
  });
  const gateway = ledger.options.controlPlaneSystemTableGateway;
  const query = gateway.executeQuery.bind(gateway);
  gateway.executeQuery = (sql, params, options) => {
    if (operationReadDeferred && exactOperationRead(sql, params)) {
      return {success: false, errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
        error: 'control_plane_pressure_degraded', retryAfterMs: 1};
    }
    return query(sql, params, options);
  };
  const deliveries = [];
  const coordinator = createTimeoutSweepCoordinator({
    nodeId: SOURCE, systemTableCache: cache, ...ledger.options, timeSource,
    // Only the authority failure phase exposes unavailable planning.
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningAnswerForOwnerRead() {
        return {publicationStatus: operationReadDeferred ? 'PENDING' : 'PUBLISHED'};
      },
    },
    setTimeoutFn: (callback) => ({callback}), clearTimeoutFn() {},
    messageRouter: {async deliver(address, payload) {
      deliveries.push({address, payload});
    }},
  });
  coordinator.initialize();
  const owner = coordinator.workflowOwner;
  const repository = owner.repository;
  const exactVisibility = repository.queryAuthoritativeOperationVisibilityObservation
    .bind(repository);
  const visibility = [];
  let hold = null;
  repository.queryAuthoritativeOperationVisibilityObservation = async (...args) => {
    const observed = await exactVisibility(...args);
    visibility.push(observed);
    if (hold) {
      const current = hold;
      hold = null;
      current.reached.resolve(observed);
      await current.release.promise;
    }
    return observed;
  };
  try {
    await coordinator.checkTimeouts();
    const retry = () => owner.observedProgressRetryTimerByOperationId.get(OPERATION_ID);
    assert.ok(retry(), 'real timeout reconciliation arms the ACTIVE handoff timer');
    assert.equal(ledger.read().workflow_step, WORKFLOW_STEP.SENDING);
    await measure({
      row: ledger.read, retry, coordinator, timeSource, deliveries, visibility,
      serviceReads: () => serviceReadCount,
      deferOperationRead() {
        cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, CDC_OPERATION.DELETE, operation);
        operationReadDeferred = true;
      },
      restoreOperationRead() {
        operationReadDeferred = false;
      },
      restoreServices() {
        serviceAvailable = true;
      },
      async deleteRow() {
        cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, CDC_OPERATION.DELETE, operation);
        const result = await gateway.submitMutation({
          operation: 'delete', tableName: TABLES.REPLICA_OPERATIONS,
          whereClause: {operation_id: OPERATION_ID},
        });
        assert.equal(result.partitionResult.affectedRows, 1);
      },
      async insertReplacement() {
        const result = await gateway.submitMutation({
          operation: 'insert', tableName: TABLES.REPLICA_OPERATIONS,
          row: {...operation, created_at: sentAt + 1},
        });
        assert.equal(result.partitionResult.affectedRows, 1);
      },
      holdLookup() {
        hold = {reached: Promise.withResolvers(), release: Promise.withResolvers()};
        return hold;
      },
      async deliverActive() {
        serviceAvailable = true;
        assert.ok(cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, liveService));
        for (const notify of notifications.splice(0)) notify();
        await owner.operationWorkflowCoordinator.inFlightExecutionsByOwnerKey
          .get(owner.getOperationOwnerSingleFlightKey(OPERATION_ID));
      },
    });
  } finally {
    try {
      await coordinator.shutdown();
    } finally {
      ledger.close();
    }
  }
}

test('deferred exact operation visibility preserves the registered ACTIVE handoff wake',
  async () => {
    await withWaitingHandoff(async (f) => {
      const original = f.row();
      const serviceReads = f.serviceReads();
      let current = f.retry();
      f.deferOperationRead();
      for (let turn = 0; turn < 2; turn += 1) {
        await driveRepositoryBackoff(f.timeSource, current.timeoutHandle.callback);
        assert.ok(f.visibility.at(-1).deferredOutcome, 'the repository emits typed deferral');
        assert.equal(f.visibility.at(-1).operation, null);
        assert.deepEqual(f.row(), original);
        assert.equal(f.serviceReads(), serviceReads);
        const successor = f.retry();
        assert.ok(successor && successor.timeoutHandle !== current.timeoutHandle,
          'the registered wake survives the unavailable exact operation read');
        assert.equal(successor.deadlineMs, current.deadlineMs);
        current = successor;
      }
      f.restoreOperationRead();
      f.restoreServices();
      await current.timeoutHandle.callback();
      assert.equal(f.row().workflow_step, WORKFLOW_STEP.ACTIVE);
      assert.equal(f.row().created_at, original.created_at);
      assert.equal(f.retry(), undefined);
      assert.deepEqual(f.deliveries, []);
    });
  });

test('a current operation completes from its own registered ACTIVE handoff timer', async () => {
  await withWaitingHandoff(async (f) => {
    const original = f.row();
    f.restoreServices();
    await f.retry().timeoutHandle.callback();
    assert.equal(f.row().workflow_step, WORKFLOW_STEP.ACTIVE);
    assert.equal(f.row().created_at, original.created_at);
    assert.equal(f.retry(), undefined);
    assert.deepEqual(f.deliveries, []);
  });
});

test('a complete exact absence retires the stale ACTIVE handoff timer', async () => {
  await withWaitingHandoff(async (f) => {
    const timer = f.retry();
    const serviceReads = f.serviceReads();
    await f.deleteRow();
    await timer.timeoutHandle.callback();
    assert.equal(f.visibility.at(-1).operation, null);
    assert.equal(f.visibility.at(-1).deferredOutcome, null);
    assert.equal(f.row(), undefined);
    assert.equal(f.retry(), undefined);
    assert.equal(f.serviceReads(), serviceReads);
    assert.deepEqual(f.deliveries, []);
  });
});

test('a registered ACTIVE handoff timer cannot act on a replacement operation', async () => {
  await withWaitingHandoff(async (f) => {
    const timer = f.retry();
    const serviceReads = f.serviceReads();
    await f.deleteRow();
    await f.insertReplacement();
    const replacement = f.row();
    f.restoreServices();
    await timer.timeoutHandle.callback();
    assert.deepEqual(f.row(), replacement);
    assert.equal(f.retry(), undefined);
    assert.equal(f.serviceReads(), serviceReads);
    assert.deepEqual(f.deliveries, []);
  });
});

for (const interruption of ['deadline', 'shutdown']) {
  test(`an ACTIVE handoff operation read returning after ${interruption} cannot start work`,
    async () => {
      await withWaitingHandoff(async (f) => {
        f.restoreServices();
        const latch = f.holdLookup();
        const timer = f.retry();
        const running = timer.timeoutHandle.callback();
        let shutdown;
        try {
          const observed = await Promise.race([latch.reached.promise, Promise.resolve(running)
            .then(() => assert.fail('the callback must reach its real operation lookup'))]);
          assert.equal(observed.operation.operationId, OPERATION_ID);
          const serviceReads = f.serviceReads();
          if (interruption === 'shutdown') {
            shutdown = f.coordinator.shutdown();
          } else {
            f.timeSource.advance(TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS);
          }
          latch.release.resolve();
          await running;
          assert.equal(f.serviceReads(), serviceReads);
          assert.equal(f.row().workflow_step, WORKFLOW_STEP.SENDING);
          assert.equal(f.retry(), undefined);
          assert.deepEqual(f.deliveries, []);
          if (interruption === 'deadline') {
            await f.deliverActive();
            assert.equal(f.row().workflow_step, WORKFLOW_STEP.ACTIVE,
              'later real CDC independently settles the durable original');
          }
        } finally {
          latch.release.resolve();
          await running;
          await shutdown;
        }
      });
    });
}
