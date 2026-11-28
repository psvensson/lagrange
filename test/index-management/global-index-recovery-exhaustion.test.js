import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {GLOBAL_INDEX_STATE} from '../../src/index-management/global-index-catalog-contract.js';
import {getGlobalIndexDatasetName} from '../../src/index-management/global-index-dataset-manager.js';
import {GLOBAL_INDEX_ACCESS_PATH} from '../../src/index-management/global-index-read-router.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {withFoundingPlacementEnvironment} from './global-index-founding-witness-support.js';

const FIRST = 'idx_blocked_email';
const MAX_ATTEMPTS = 20;

// Run the callbacks scheduled by each real owner in a controlled order.
function captureTimers() {
  const pending = new Set();
  return {
    pending,
    set(callback) {
      pending.add(callback); return callback;
    },
    clear(callback) {
      pending.delete(callback);
    },
    fire() {
      assert.equal(pending.size, 1, 'one timer owns the next wake');
      const [callback] = pending;
      pending.delete(callback);
      callback();
    },
  };
}

async function mustSettle(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), 3000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

test('GSI discovery progresses other generations across retry exhaustion and resumes the original index',
  async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
    LoggingService.getInstance().initialize({level: 'error'});
    try {
      await withFoundingPlacementEnvironment(exerciseRecovery);
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

async function exerciseRecovery({engine: producer, gateway, cache, readiness, partitionServices,
  coordinator}) {
  const insert = await producer.executeQuery(
    'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)',
    [10, 'alice@example.com', 'Alice', 'active']);
  assert.equal(insert.success, true);
  const catalogRow = (name) => gateway.db.prepare('SELECT * FROM indices WHERE index_name = ?').get(name);
  async function createPending(name, column) {
    const metadata = await producer.indexService.createIndex(
      `CREATE GLOBAL INDEX ${name} ON users (${column})`, {deferBackfill: true});
    const row = catalogRow(name);
    assert.equal(row.index_id, metadata.indexId);
    assert.equal(row.state, GLOBAL_INDEX_STATE.BACKFILLING);
    const job = gateway.db.prepare('SELECT status FROM schema_operations WHERE table_name = ?')
      .get(getGlobalIndexDatasetName('users', name));
    assert.equal(job?.status, 'SUCCEEDED', 'the real schema owner provisioned this generation');
    return row;
  }

  const first = await createPending(FIRST, 'email');
  const retryTimers = captureTimers();
  const inventoryTimers = captureTimers();
  const firstRefusal = Promise.withResolvers();
  let blocked = true;
  let holdPartitionRead = false;
  let refusals = 0;
  const late = {receiver: null};
  const readerGateway = Object.create(gateway);
  readerGateway.readRows = (table, sql, params, options) => {
    const denied = holdPartitionRead ? table === TABLES.PARTITIONS :
      table === TABLES.INDICES && params?.[0] === FIRST && sql === 'SELECT * FROM indices WHERE index_name = ?';
    if (blocked && denied) {
      const queue = late.receiver.indexService._gsiRecoveryQueue;
      queue.setTimeoutFn = retryTimers.set;
      queue.clearTimeoutFn = retryTimers.clear;
      refusals++;
      firstRefusal.resolve();
      throw Object.assign(new Error('GSI metadata read unavailable'), {code: 'AUTHORITY_UNAVAILABLE'});
    }
    return gateway.readRows(table, sql, params, options);
  };
  const receiver = new SQLQueryEngine({
    nodeId: 'test-node', systemCache: cache, controlPlaneReadinessService: readiness,
    controlPlaneSystemTableGateway: readerGateway,
    cdcIntegrationService: producer.cdcIntegrationService,
    messageRouter: producer.messageRouter, partitionServicesProvider: () => partitionServices,
    rebalanceCoordinator: coordinator, autoStartDistributedTransactionRecovery: false,
    migrationAutoWire: false,
  });
  late.receiver = receiver;
  const index = receiver.indexService;
  const service = receiver.tableCreationService;
  const owner = service.schemaProvisioningJobOwner;
  owner.retrySetTimeoutFn = inventoryTimers.set;
  owner.retryClearTimeoutFn = inventoryTimers.clear;
  receiver.setRebalanceCoordinator(coordinator);

  async function missCatalogNotification(name, column) {
    index._detachSystemTableCacheListener();
    try {
      return await createPending(name, column);
    } finally {
      index._attachSystemTableCacheListener();
    }
  }

  async function ordinaryWake() {
    const previous = owner.discoveryReads.get(owner.readNonterminalRows);
    assert.ok(previous, 'the previous inventory owns its scheduled wake');
    inventoryTimers.fire();
    const next = owner.discoveryReads.get(owner.readNonterminalRows);
    assert.ok(next && next !== previous, 'the timer alone registered a fresh inventory scan');
    await mustSettle(next, 'timer-driven schema inventory failed to settle');
    await mustSettle(owner.indexRecovery, 'active or exhausted generation held the ordinary inventory');
    await mustSettle(index._gsiRecoveryQueue.awaitCurrentWorkIdle(), 'inventory work failed to drain');
  }

  try {
    await receiver.activateDistributedTransactionRecovery();
    await service.resumeDurableProvisioningJobs();
    await mustSettle(firstRefusal.promise, 'ordinary discovery never attempted the first generation');
    const queue = index._gsiRecoveryQueue;
    assert.ok(queue, 'ordinary discovery created the generation queue');
    await queue.awaitCurrentWorkIdle();
    assert.equal(refusals, 1);
    const intent = await owner.findSucceededGlobalIndexIntent(
      getGlobalIndexDatasetName('users', FIRST), first.index_generation ?? 1);
    assert.equal(intent?.globalIndex?.indexId, first.index_id);

    // The caller already obtained the SUCCEEDED intent. A weaker catalog
    // discovery would now see an empty schema lookup for this exact identity.
    const [leader] = owner.recoveryLeaders();
    const readJob = leader.executeLocalQuery;
    leader.executeLocalQuery = async function(sql, params) {
      const answer = await readJob.call(this, sql, params);
      return params?.[0] === intent.tableIdentityKey ? {...answer, rows: []} : answer;
    };
    const waiters = [];
    try {
      assert.equal(await owner.findSucceededGlobalIndexIntent(intent.tableName,
        intent.globalIndex.generation),
      null, 'the discovery path currently lacks the retained schema intent');
      // The strong attempt reaches partition refresh. The weak alternative
      // would settle as null before it can read any partition metadata.
      holdPartitionRead = true;
      const previousRefusals = refusals;
      waiters.push(Promise.allSettled([index.completeRecoveredGlobalIndexProvisioning(intent)]));
      waiters.push(Promise.allSettled([index.initialize()]));
      await queue.awaitCurrentWorkIdle();
      // A join may leave the next attempt with the existing retry timer.
      if (refusals === previousRefusals && retryTimers.pending.size === 1) {
        retryTimers.fire();
        await queue.awaitCurrentWorkIdle();
      }
      assert.equal(refusals, previousRefusals + 1,
        'the merged explicit intent reached partition recovery exactly once');
    } finally {
      leader.executeLocalQuery = readJob;
      holdPartitionRead = false;
    }

    const second = await missCatalogNotification('idx_missed_name', 'name');
    assert.equal(catalogRow(second.index_name).state, GLOBAL_INDEX_STATE.BACKFILLING);
    const beforeWake = refusals;
    assert.equal(retryTimers.pending.size, 1);
    const [armedRetry] = retryTimers.pending;
    await ordinaryWake();
    assert.equal(refusals, beforeWake, 'discovery did not run the already deferred generation');
    assert.equal(retryTimers.pending.size, 1);
    assert.ok(retryTimers.pending.has(armedRetry), 'discovery preserved the exact scheduled callback');
    assert.equal(catalogRow(second.index_name).state, GLOBAL_INDEX_STATE.READ_WRITE,
      'the missed generation finished while the first was still retrying');
    assert.ok(refusals < MAX_ATTEMPTS && retryTimers.pending.size === 1);
    assert.equal(owner.indexRecovery, null);

    while (refusals < MAX_ATTEMPTS) {
      retryTimers.fire();
      await queue.awaitCurrentWorkIdle();
    }
    const exhausted = queue.getDiagnostics().exhaustedRetryStates[first.index_id];
    assert.equal(exhausted?.failureCount, MAX_ATTEMPTS, 'mixed callers did not restart the burst');
    assert.equal(exhausted.maxAttempts, MAX_ATTEMPTS);
    assert.equal(retryTimers.pending.size, 0);
    const lateWaiter = Promise.allSettled([index.completeRecoveredGlobalIndexProvisioning(intent)]);
    for (const waiter of [...waiters, lateWaiter]) {
      const [outcome] = await mustSettle(waiter, 'an exhausted generation retained a completion waiter');
      assert.equal(outcome.status, 'rejected');
      assert.equal(outcome.reason.ownerKey, first.index_id);
      assert.equal(outcome.reason.failureCount, MAX_ATTEMPTS);
    }
    assert.equal(refusals, MAX_ATTEMPTS, 'late completion did not start another burst');

    const third = await missCatalogNotification('idx_missed_status', 'status');
    assert.equal(catalogRow(FIRST).state, GLOBAL_INDEX_STATE.BACKFILLING);
    assert.equal(catalogRow(third.index_name).state, GLOBAL_INDEX_STATE.BACKFILLING);
    await ordinaryWake();
    assert.equal(catalogRow(third.index_name).state, GLOBAL_INDEX_STATE.READ_WRITE,
      'inventory discovered the notification missed after exhaustion');
    assert.equal(refusals, MAX_ATTEMPTS + 1);
    assert.equal(queue.getDiagnostics().retryStates[first.index_id]?.failureCount, 1,
      'ordinary inventory rearmed a fresh bounded burst for the original identity');
    assert.equal(catalogRow(FIRST).state, GLOBAL_INDEX_STATE.BACKFILLING);
    assert.equal(retryTimers.pending.size, 1);
    blocked = false;
    retryTimers.fire();
    await queue.awaitCurrentWorkIdle();
    const recovered = catalogRow(FIRST);
    assert.equal(recovered.state, GLOBAL_INDEX_STATE.READ_WRITE);
    assert.equal(recovered.index_id, first.index_id);
    const query = await receiver.executeQuery('SELECT * FROM users WHERE email = ?', ['alice@example.com']);
    assert.equal(query.success, true);
    assert.equal(query.globalIndexPlan?.accessPath,
      GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX);
    assert.deepEqual(query.rows.map(({id, email}) => ({id, email})), [{id: 10, email: 'alice@example.com'}]);
    assert.equal(owner.indexRecovery, null);
    assert.equal(inventoryTimers.pending.size, 1, 'the warm owner still has its ordinary wake');
  } finally {
    await mustSettle(receiver.shutdown(), 'engine shutdown did not settle');
  }
  assert.equal(inventoryTimers.pending.size, 0);
  assert.equal(retryTimers.pending.size, 0);
}
