/**
 * Removed-replica cleanup debt owner (rebalancer safety-audit finding 12,
 * confirmed worse than the audit claimed).
 *
 * A replica removal deletes the authoritative services row BEFORE local
 * runtime cleanup; when cleanupRemovedReplicaLocalRuntime then fails (or
 * the process crashes in between) the replica's DB/WAL files are stranded:
 * the coordinator terminates the operation on the REPLICA_REMOVE_COMPLETED
 * outcome and nothing ever re-sends the idempotent REMOVE request, so
 * reconcileRemovedReplicaCleanup is unreachable and the orphan sits on
 * disk indefinitely.
 *
 * The durable owner is a startup filesystem sweep on the ReplicaHandler:
 * every initialize() compares the partitions directory against
 * authoritative services rows for this node and deletes every row-less
 * replica DB/WAL/SHM file set through the canonical reconcile cleanup
 * path (the sweep variant also catches historical orphans). A deletion
 * failure leaves the file in place so the next startup retries it.
 *
 * Red-on-revert: reverting the sweep wiring from initialize() (or the
 * sweep itself) strands the orphan again and every test below flips red.
 *
 * Quest: removed-replica-cleanup-debt-owner
 * Epic: solve/epics/rebalancer-operation-safety-audit-remediation.md
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import {generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {SERVICES_SCHEMA, REPLICA_OPERATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ControlPlaneSystemTableGateway, CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {REPLICA_CLEANUP_ERROR_CODE} from
  '../../src/node/replica-cleanup-constants.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ExecutorOutcomeEmitter} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_EVENT,
} from '../../src/node/replica-handler-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {STORAGE_DEFAULT} from '../../src/storage/storage-constants.js';
import {
  createCanonicalLifecycleServiceRow,
  createLifecycleCdcServiceForCache,
  createPartitionRow,
} from '../test-helpers/lifecycle-state-store.js';

const TEST_NODE_ID = 'cleanup-debt-node-1';
const TEST_PARTITION_ID = 'partition-cleanup-debt-1';
const TEST_REPLICA_ID = 'replica-cleanup-debt-1';
const TEST_ORPHAN_PARTITION_ID = 'partition-historical-orphan-1';
const TEST_ORPHAN_REPLICA_ID = 'replica-historical-orphan-1';
const TEST_LIVE_REPLICA_ID = 'replica-still-live-1';
const TEST_OPERATION_ID = 'op-cleanup-debt-1';
const TEST_CORRELATION_ID = 'corr-cleanup-debt-1';
const TEST_DB_CONTENT = 'orphaned-sqlite-content';
const ZERO_COUNT = 0;

function createHandlerCache() {
  return new SystemTableCache();
}

function createMockCDCService(cache) {
  return createLifecycleCdcServiceForCache(cache);
}

function createMockPartitionServiceFactory() {
  return async (options) => ({
    partitionId: options.partitionId,
    replicaId: options.replicaId,
    initialized: true,
    async shutdown() {},
    async syncFromLeader() {},
  });
}

function createHandler(options) {
  const cache = options.cache || createHandlerCache();
  return new ReplicaHandler({
    nodeId: options.nodeId || TEST_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: createMockCDCService(cache),
    createPartitionService: createMockPartitionServiceFactory(),
    executorOutcomeEmitter: new ExecutorOutcomeEmitter({logger: console}),
    dataDir: options.dataDir,
  });
}

function makeTempDataDir(t) {
  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-cleanup-debt-'),
  );
  t.teardown(() => {
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  return dataDir;
}

function replicaDbPath(dataDir, partitionId, replicaId) {
  return path.join(
    dataDir,
    STORAGE_DEFAULT.PARTITIONS_DIRNAME,
    partitionId,
    `${replicaId}${STORAGE_DEFAULT.DB_EXT}`,
  );
}

function seedOrphanFiles(dataDir, partitionId, replicaId) {
  const dbPath = replicaDbPath(dataDir, partitionId, replicaId);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  fs.writeFileSync(dbPath, TEST_DB_CONTENT);
  fs.writeFileSync(`${dbPath}-wal`, TEST_DB_CONTENT);
  return dbPath;
}

function seedServicesRow(cache, {replicaId, partitionId, nodeId, status}) {
  if (!cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId)) {
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.PARTITIONS,
      'INSERT',
      createPartitionRow({
        partitionId,
        leaderNodeId: 'another-node',
      }),
    );
  }
  const row = createCanonicalLifecycleServiceRow({
    service_id: replicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: 'follower',
    status,
    address: `${nodeId}/partition/${replicaId}`,
    created_at: Date.now(),
    updated_at: Date.now(),
  });
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', row);
}

function waitForReplicaEvent(handler, successEvent, failureEvent) {
  return new Promise((resolve, reject) => {
    handler.once(successEvent, resolve);
    handler.once(failureEvent, (event) => {
      reject(new Error(event?.error || 'operation failed'));
    });
  });
}

test('removed-replica cleanup debt owner', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test(
    'cleanup-retry-reachable-after-failure: a removal whose local cleanup ' +
    'fails terminates the operation, and the next startup sweep retries ' +
    'the reconcile path and deletes the stranded DB/WAL files',
    async (t) => {
      const dataDir = makeTempDataDir(t);
      const cache = createHandlerCache();
      seedServicesRow(cache, {
        replicaId: TEST_REPLICA_ID,
        partitionId: TEST_PARTITION_ID,
        nodeId: TEST_NODE_ID,
        status: ReplicaStatus.ACTIVE,
      });
      const handler = createHandler({cache, dataDir});
      handler.initialize();
      await handler.removedReplicaCleanupDebtSweepTask;

      const liveService = {shutdownCalls: ZERO_COUNT,
        async shutdown() {
          this.shutdownCalls += 1;
        }};
      handler.localServices.set(TEST_REPLICA_ID, liveService);

      // Force the removal-cleanup failure AFTER the durable row delete so
      // the operation terminates with stranded files (finding 12).
      handler.cleanupReplicaResources = async () => {
        throw new Error('disk busy: unlink failed');
      };

      const removed = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.REMOVED,
        REPLICA_HANDLER_EVENT.REMOVAL_FAILED,
      );
      const response = await handler.handleMessage({
        correlationId: TEST_CORRELATION_ID,
        payload: {
          type: ReplicaOperationMessageType.REMOVE_REPLICA,
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      });
      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'removal is initiated',
      );
      await t.rejects(removed, /disk busy: unlink failed/,
        'the removal remains retryable while cleanup ownership is durable');
      t.equal(liveService.shutdownCalls, 1,
        'the live service was shut down before the file cleanup failed');
      const cleanupMarker = cache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        TEST_REPLICA_ID,
      );
      t.equal(cleanupMarker?.service_type, 'partition_cleanup',
        'failed cleanup retains durable non-routable ownership');
      t.type(cleanupMarker?.cleanup_token, 'string',
        'the retained cleanup ownership has an exact token');
      t.equal(
        handler.getLocalReplica(TEST_REPLICA_ID)?.status,
        ReplicaStatus.REMOVING,
        'local state remains nonterminal while cleanup is incomplete',
      );

      // Stranded by the failed cleanup, invisible to any future REMOVE
      // request (getLocalReplica only consults localReplicas after the
      // services row is gone, and that row is already terminal REMOVED).
      const strandedDbPath = seedOrphanFiles(
        dataDir,
        TEST_PARTITION_ID,
        TEST_REPLICA_ID,
      );
      await handler.shutdown();

      // The durable owner: a fresh handler instance on the same data dir
      // (the restart) must retry the reconcile cleanup at startup.
      const restartHandler = createHandler({cache, dataDir});
      restartHandler.initialize();
      const report = await restartHandler.removedReplicaCleanupDebtSweepTask;

      t.equal(report.sweepCompleted, true,
        'the startup sweep ran to completion');
      t.equal(report.deleted, 1,
        'the stranded replica file set was reconciled and deleted');
      t.notOk(fs.existsSync(strandedDbPath),
        'the stranded DB file is deleted by the startup sweep');
      t.notOk(fs.existsSync(`${strandedDbPath}-wal`),
        'the stranded WAL file is deleted by the startup sweep');
      await restartHandler.shutdown();
    },
  );

  await t.test(
    'orphan-files-eventually-deleted: a historical orphan predating any ' +
    'debt record (crash between the row DELETE and the file unlink) is ' +
    'deleted by the startup sweep, while assigned and quarantined files ' +
    'survive',
    async (t) => {
      const dataDir = makeTempDataDir(t);
      // Historical orphan: no services row ever exists in this cache.
      const orphanDbPath = seedOrphanFiles(
        dataDir,
        TEST_ORPHAN_PARTITION_ID,
        TEST_ORPHAN_REPLICA_ID,
      );
      // Still-assigned replica file must be untouched.
      const liveDbPath = seedOrphanFiles(
        dataDir,
        TEST_PARTITION_ID,
        TEST_LIVE_REPLICA_ID,
      );
      // Quarantined evidence from the reconciliation sweep is diagnostic
      // state, not live removal debt; the sweep must not re-delete it.
      const quarantinedDbPath = replicaDbPath(
        dataDir,
        TEST_ORPHAN_PARTITION_ID,
        'replica-quarantined-1',
      );
      fs.mkdirSync(path.dirname(quarantinedDbPath), {recursive: true});
      fs.writeFileSync(`${quarantinedDbPath}.quarantined`, TEST_DB_CONTENT);

      const cache = createHandlerCache();
      seedServicesRow(cache, {
        replicaId: TEST_LIVE_REPLICA_ID,
        partitionId: TEST_PARTITION_ID,
        nodeId: TEST_NODE_ID,
        status: ReplicaStatus.ACTIVE,
      });
      const handler = createHandler({cache, dataDir});
      handler.initialize();
      const report = await handler.removedReplicaCleanupDebtSweepTask;

      t.equal(report.sweepCompleted, true,
        'the startup sweep ran to completion');
      t.equal(report.deleted, 1,
        'exactly the historical orphan is deleted');
      t.notOk(fs.existsSync(orphanDbPath),
        'historical orphan DB file is deleted');
      t.notOk(fs.existsSync(`${orphanDbPath}-wal`),
        'historical orphan WAL file is deleted');
      t.ok(fs.existsSync(liveDbPath),
        'an assigned replica file is never swept');
      t.ok(fs.existsSync(`${liveDbPath}-wal`),
        'an assigned replica WAL file is never swept');
      t.ok(fs.existsSync(`${quarantinedDbPath}.quarantined`),
        'quarantined evidence is never re-deleted');
      await handler.shutdown();
    },
  );

  await t.test(
    'orphan-files-eventually-deleted: a sweep-time deletion failure leaves ' +
    'the orphan in place and a later sweep retries and deletes it',
    async (t) => {
      const dataDir = makeTempDataDir(t);
      const orphanDbPath = seedOrphanFiles(
        dataDir,
        TEST_ORPHAN_PARTITION_ID,
        TEST_ORPHAN_REPLICA_ID,
      );
      const cache = createHandlerCache();
      const handler = createHandler({cache, dataDir});
      // Simulate a reconcile failure on the startup sweep itself (e.g. the
      // control plane was unavailable during boot): the deletion fails, the
      // orphan stays on disk, and the debt report counts it instead of
      // silently dropping it.
      handler.cleanupReplicaResources = async () => {
        throw new Error('control plane unavailable during sweep');
      };
      handler.initialize();
      const failedReport = await handler.removedReplicaCleanupDebtSweepTask;
      t.equal(failedReport.failed, 1,
        'the failed deletion is counted, not silently dropped');
      t.ok(fs.existsSync(orphanDbPath),
        'a failed sweep leaves the orphan on disk (retryable debt)');

      // A new process captures the marker in its frozen pre-admission
      // startup snapshot. An ordinary live sweep is deliberately forbidden
      // from borrowing the first process's token.
      await handler.shutdown();
      const restartHandler = createHandler({cache, dataDir});
      restartHandler.initialize();
      const retryReport =
        await restartHandler.removedReplicaCleanupDebtSweepTask;
      t.equal(retryReport.deleted, 1,
        'a later sweep retries the reconcile and deletes the orphan');
      t.notOk(fs.existsSync(orphanDbPath),
        'the orphan is eventually deleted');
      await restartHandler.shutdown();
    },
  );
});

// The authority below executes generated production schemas and the gateway's
// mutation SQL. Only read availability/delivery and the existing timer's wake
// are controlled. Public dispatch proves admission reopening, not Raft creation.
const STARTUP_OBSERVATION_BOUND_MS = 2000;

async function boundedStartupObservation(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('startup witness did not settle')),
        STARTUP_OBSERVATION_BOUND_MS);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function startupRecoveryFixture(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-cleanup-live-'));
  fs.mkdirSync(path.join(dataDir, STORAGE_DEFAULT.PARTITIONS_DIRNAME));
  const db = new Database(path.join(dataDir, 'authority.sqlite'));
  for (const schema of [SERVICES_SCHEMA, REPLICA_OPERATIONS_SCHEMA]) {
    db.exec(generateCreateTableSQL(schema));
  }
  const planner = new ControlPlaneSystemTableGateway();
  const state = {available: true, snapshotReads: 0, sweepCalls: 0,
    beforeSnapshot: null, beforePointRead: null, afterPointRead: null,
    wake: null, wakeArms: 0, readOptions: [], mutations: []};
  const gateway = {
    async readAuthoritativeRows(tableName, sql, params = [], options = {}) {
      if (tableName === SYSTEM_TABLE_NAME.SERVICES &&
          params[0] === 'partition_cleanup') {
        state.snapshotReads++;
        state.readOptions.push(options);
        await state.beforeSnapshot?.();
        if (!state.available) return {success: false, error: 'owner unavailable'};
      }
      if (tableName === SYSTEM_TABLE_NAME.SERVICES &&
          params[0] === TEST_ORPHAN_REPLICA_ID) await state.beforePointRead?.();
      const rows = db.prepare(sql).all(...params);
      if (tableName === SYSTEM_TABLE_NAME.SERVICES &&
          params[0] === TEST_ORPHAN_REPLICA_ID) await state.afterPointRead?.(rows);
      return {success: true, rows};
    },
    async submitMutation(mutation) {
      const {sql, params} = planner.buildSqlMutationPlan(mutation);
      const {changes} = db.prepare(sql).run(...params);
      state.mutations.push({mutation: structuredClone(mutation), changes});
      return {success: true, partitionResult: {affectedRows: changes}};
    },
  };
  const handler = new ReplicaHandler({nodeId: TEST_NODE_ID, ownerIncarnation: 1, dataDir,
    systemTableCache: createHandlerCache(), cdcIntegrationService: {},
    controlPlaneSystemTableGateway: gateway,
    createPartitionService: createMockPartitionServiceFactory(),
    executorOutcomeEmitter: new ExecutorOutcomeEmitter({logger: console})});
  const sweep = handler.sweepRemovedReplicaCleanupDebt.bind(handler);
  handler.sweepRemovedReplicaCleanupDebt = async (authorities) => {
    state.sweepCalls++;
    return sweep(authorities);
  };
  const rearm = handler.replicaCreateAdmissionRecoveryRearmOwner;
  const arm = rearm.arm.bind(rearm);
  rearm.arm = (callback, delay) => {
    state.wake = callback;
    state.wakeArms++;
    return arm(callback, delay);
  };
  t.teardown(async () => {
    await boundedStartupObservation(handler.shutdown());
    db.close();
    fs.rmSync(dataDir, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  return {handler, dataDir, db, state};
}

function dispatchMembershipObservation(handler) {
  return handler.handleMessage({correlationId: TEST_CORRELATION_ID,
    payload: {type: ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP,
      partitionId: TEST_PARTITION_ID}});
}

async function acquireStartupMarker(handler, replicaId = TEST_ORPHAN_REPLICA_ID) {
  return handler.getReplicaCleanupTombstoneOwner().acquire({replicaId,
    partitionId: TEST_ORPHAN_PARTITION_ID, nodeId: TEST_NODE_ID});
}

test('ReplicaHandler.initialize recovers a refused cleanup snapshot through ' +
  'one CREATE recovery wake without restarting or borrowing authority', async (t) => {
  const {handler, state} = startupRecoveryFixture(t);
  state.available = false;
  handler.initialize();
  await boundedStartupObservation(handler.removedReplicaCleanupDebtSweepTask);
  await boundedStartupObservation(handler.replicaCreateAdmissionRecoveryTask);
  await t.rejects(boundedStartupObservation(handler.handleMessage({
    correlationId: TEST_CORRELATION_ID,
    payload: {type: ReplicaOperationMessageType.CREATE_REPLICA,
      operationType: OperationType.ADD, operationId: TEST_OPERATION_ID,
      partitionId: TEST_PARTITION_ID, replicaId: TEST_REPLICA_ID},
  })), {code: REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNER_DEFERRED,
    deferRetry: true}, 'unavailable authority refuses promptly with its typed cause');
  t.equal(state.sweepCalls, 0, 'no filesystem sweep on unavailable authority');
  t.equal(state.snapshotReads, 1, 'requests share the first failed observation');
  t.equal(state.wakeArms, 1, 'existing CREATE recovery owner retains one wake');
  t.type(state.wake, 'function', 'startup failure is owned for live recovery');
  if (typeof state.wake !== 'function') return;

  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  state.available = true;
  state.beforeSnapshot = async () => { entered.resolve(); await release.promise; };
  handler.replicaCreateAdmissionRecoveryRearmOwner.cancel();
  state.wake();
  await boundedStartupObservation(entered.promise);
  const requests = [dispatchMembershipObservation(handler),
    dispatchMembershipObservation(handler)];
  release.resolve();
  const replies = await boundedStartupObservation(Promise.all(requests));
  await boundedStartupObservation(handler.replicaCreateAdmissionRecoveryTask);
  await boundedStartupObservation(handler.removedReplicaCleanupDebtSweepTask);
  t.equal(state.snapshotReads, 2, 'one recovery observation is shared by both callers');
  t.equal(state.sweepCalls, 1, 'successful snapshot runs exactly one real sweep');
  for (const reply of replies) {
    t.equal(reply.status, ReplicaOperationResponseStatus.COMPLETED,
      'public dispatch reaches the real membership handler after recovery');
    t.equal(reply.membership.reason, COMMITTED_MEMBERSHIP_REFUSAL.NOT_HOSTED,
      'the handler reports truthful absent membership, not invented creation');
    t.equal(reply.correlationId, TEST_CORRELATION_ID);
  }
  t.ok(state.readOptions.every((options) => options.authoritativeReadMode ===
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED),
  'retry preserves the original required authority');
  t.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
    'successful recovery leaves no retry timer');
});

test('successful startup capture stays frozen across later CREATE recovery wakes',
  async (t) => {
    const {handler, state, dataDir, db} = startupRecoveryFixture(t);
    handler.initialize();
    await boundedStartupObservation(handler.removedReplicaCleanupDebtSweepTask);
    await boundedStartupObservation(handler.replicaCreateAdmissionRecoveryTask);
    const {authority} = await acquireStartupMarker(handler);
    t.ok(authority, 'another cleanup claimant owns a real durable marker');
    const dbPath = seedOrphanFiles(dataDir, TEST_ORPHAN_PARTITION_ID,
      TEST_ORPHAN_REPLICA_ID);
    await boundedStartupObservation(handler.startReplicaCreateAdmissionRecovery());
    await boundedStartupObservation(dispatchMembershipObservation(handler));
    t.equal(state.snapshotReads, 1, 'successful capture is never refreshed');
    t.equal(state.sweepCalls, 1, 'a later wake does not repeat startup deletion');
    t.ok(fs.existsSync(dbPath), 'post-capture claimant retains its database');
    t.ok(fs.existsSync(`${dbPath}-wal`), 'post-capture claimant retains its WAL');
    t.equal(db.prepare('SELECT cleanup_token FROM services WHERE service_id = ?')
      .get(TEST_ORPHAN_REPLICA_ID).cleanup_token, authority.ownerToken,
    'late token is neither borrowed nor released');
  });

test('shutdown fences a late successful startup snapshot before filesystem cleanup',
  async (t) => {
    const {handler, state, dataDir, db} = startupRecoveryFixture(t);
    const {authority} = await acquireStartupMarker(handler);
    const dbPath = seedOrphanFiles(dataDir, TEST_ORPHAN_PARTITION_ID,
      TEST_ORPHAN_REPLICA_ID);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    state.beforeSnapshot = async () => { entered.resolve(); await release.promise; };
    handler.initialize();
    await boundedStartupObservation(entered.promise);
    const shutdown = handler.shutdown();
    release.resolve();
    await boundedStartupObservation(shutdown);
    await boundedStartupObservation(handler.removedReplicaCleanupDebtSweepTask);
    t.equal(state.sweepCalls, 0, 'late capture cannot begin a sweep after shutdown');
    t.ok(fs.existsSync(dbPath), 'shutdown preserves the retained database obligation');
    t.ok(fs.existsSync(`${dbPath}-wal`), 'shutdown preserves retained sidecar debt');
    t.equal(db.prepare('SELECT cleanup_token FROM services WHERE service_id = ?')
      .get(TEST_ORPHAN_REPLICA_ID)?.cleanup_token, authority.ownerToken,
    'the exact cleanup token remains for the next incarnation');
    t.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
      'shutdown retains no rearmed recovery timer');
  });


test('shutdown joins an admitted sweep and fences its paused authority read',
  async (t) => {
    const {handler, state, dataDir, db} = startupRecoveryFixture(t);
    const {authority} = await acquireStartupMarker(handler);
    const dbPath = seedOrphanFiles(dataDir, TEST_ORPHAN_PARTITION_ID,
      TEST_ORPHAN_REPLICA_ID);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    state.beforePointRead = async () => {
      entered.resolve();
      await release.promise;
    };
    handler.initialize();
    await boundedStartupObservation(entered.promise);
    t.equal(state.snapshotReads, 1, 'the pre-admission snapshot succeeded');
    t.equal(state.sweepCalls, 1, 'one real sweep is awaiting current authority');
    await boundedStartupObservation(handler.replicaCreateAdmissionRecoveryTask);
    let shutdownSettled = false;
    const shutdown = handler.shutdown().then(() => { shutdownSettled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(shutdownSettled, false, 'shutdown waits for its in-flight sweep');
    release.resolve();
    await boundedStartupObservation(shutdown);
    await boundedStartupObservation(handler.removedReplicaCleanupDebtSweepTask);
    t.ok(fs.existsSync(dbPath), 'the resumed read cannot authorize database deletion');
    t.ok(fs.existsSync(`${dbPath}-wal`), 'the resumed read cannot authorize WAL deletion');
    t.equal(db.prepare('SELECT cleanup_token FROM services WHERE service_id = ?')
      .get(TEST_ORPHAN_REPLICA_ID)?.cleanup_token, authority.ownerToken,
    'shutdown retains the exact token for the next incarnation');
    t.equal(state.sweepCalls, 1, 'shutdown starts no replacement cleanup work');
    t.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
      'shutdown owns no recovery timer');
  });


test('an admitted cleanup release CAS preserves a new token after shutdown starts',
  async (t) => {
    const {handler, state, db} = startupRecoveryFixture(t);
    const {authority} = await acquireStartupMarker(handler);
    const owner = handler.getReplicaCleanupTombstoneOwner();
    const releaseOwner = owner.release.bind(owner);
    const entered = Promise.withResolvers();
    const deliver = Promise.withResolvers();
    let releaseEntered = false;
    let heldRead = false;
    owner.release = (...args) => {
      releaseEntered = true;
      return releaseOwner(...args);
    };
    state.afterPointRead = async (rows) => {
      if (!releaseEntered || heldRead) return;
      heldRead = true;
      t.equal(rows[0].cleanup_token, authority.ownerToken,
        'the inner release read really observed the original SQL token');
      entered.resolve();
      await deliver.promise;
    };
    handler.initialize();
    await boundedStartupObservation(entered.promise);
    await boundedStartupObservation(handler.replicaCreateAdmissionRecoveryTask);
    let shutdownSettled = false;
    const shutdown = handler.shutdown().then(() => { shutdownSettled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(shutdownSettled, false, 'shutdown joins the already-admitted release');
    t.equal(handler.startReplicaCreateAdmissionRecovery(), false,
      'shutdown admits no new CREATE recovery work');
    const replacementToken = `${authority.ownerToken}:successor`;
    const replacement = await owner.gateway.submitMutation({operation: 'update',
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      whereClause: {service_id: TEST_ORPHAN_REPLICA_ID,
        cleanup_token: authority.ownerToken, updated_at: authority.updatedAt},
      data: {cleanup_token: replacementToken, updated_at: authority.updatedAt + 1}});
    t.equal(replacement.partitionResult.affectedRows, 1,
      'a competing durable generation is installed through real SQL');
    deliver.resolve();
    await boundedStartupObservation(shutdown);
    const report = await boundedStartupObservation(handler.removedReplicaCleanupDebtSweepTask);
    const deletes = state.mutations.filter(({mutation}) => mutation.operation === 'delete');
    t.equal(deletes.length, 1, 'the already-admitted owner attempted its fenced DELETE');
    t.equal(deletes[0]?.mutation.whereClause.cleanup_token, authority.ownerToken,
      'settlement preserves the original token in the predicate');
    t.equal(deletes[0]?.changes, 0, 'SQLite refuses the stale conditional DELETE');
    t.equal(report.failed, 1, 'changed ownership is retained as unresolved cleanup');
    t.equal(db.prepare('SELECT cleanup_token FROM services WHERE service_id = ?')
      .get(TEST_ORPHAN_REPLICA_ID)?.cleanup_token, replacementToken,
    'the replacement token survives the old read and admitted CAS');
    t.equal(state.sweepCalls, 1, 'no new sweep is admitted after shutdown');
    t.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
      'shutdown retains no recovery wake');
  });
