/**
 * Removed-replica cleanup debt owner (rebalancer safety-audit finding 12,
 * confirmed worse than the audit claimed).
 *
 * A replica removal deletes the authoritative services row BEFORE local
 * runtime cleanup; when cleanupRemovedReplicaLocalRuntime then fails (or
 * the process crashes in between) the replica's DB/WAL files are stranded:
 * the coordinator terminalizes the operation on the REPLICA_REMOVE_COMPLETED
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
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
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
  return {
    async insertSystemTableRow(tableName, data) {
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      cache.applySystemTableChange(
        tableName,
        'UPDATE',
        {...whereClause, ...data},
      );
      return {success: true};
    },
    async upsertSystemTableRow(tableName, data) {
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      cache.applySystemTableChange(tableName, 'DELETE', whereClause);
      return {success: true};
    },
  };
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
  const row = {
    service_id: replicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: 'follower',
    status,
    address: `${nodeId}/partition/${replicaId}`,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', row);
  // In-memory harnesses have no CDC derivation pipeline, so mirror the
  // derived replica_id projection the sweep's authoritative filter reads.
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.SERVICES,
    'UPDATE',
    {...row, replica_id: replicaId},
  );
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
    'fails terminalizes the operation, and the next startup sweep retries ' +
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
      // the operation terminalizes with stranded files (finding 12).
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
      await removed;
      t.equal(liveService.shutdownCalls, 1,
        'the live service was shut down before the file cleanup failed');
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID),
        undefined,
        'the authoritative services row is gone even though cleanup failed',
      );
      t.equal(
        handler.getLocalReplica(TEST_REPLICA_ID)?.status,
        ReplicaStatus.REMOVED,
        'the operation terminalizes as REMOVED despite the failed cleanup',
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
      const restartHandler = createHandler({
        cache: createHandlerCache(),
        dataDir,
      });
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
      const handler = createHandler({
        cache: createHandlerCache(),
        dataDir,
      });
      // Simulate a reconcile failure on the startup sweep itself (e.g. the
      // control plane was unavailable during boot): the deletion fails, the
      // orphan stays on disk, and the debt report counts it instead of
      // silently dropping it.
      handler.reconcileRemovedReplicaCleanup = async () => {
        throw new Error('control plane unavailable during sweep');
      };
      handler.initialize();
      const failedReport = await handler.removedReplicaCleanupDebtSweepTask;
      t.equal(failedReport.failed, 1,
        'the failed deletion is counted, not silently dropped');
      t.ok(fs.existsSync(orphanDbPath),
        'a failed sweep leaves the orphan on disk (retryable debt)');

      // The next sweep (the next startup in production) retries the debt
      // with a healthy reconcile path and the orphan is eventually deleted.
      delete handler.reconcileRemovedReplicaCleanup;
      const retryReport = await handler.sweepRemovedReplicaCleanupDebt();
      t.equal(retryReport.deleted, 1,
        'a later sweep retries the reconcile and deletes the orphan');
      t.notOk(fs.existsSync(orphanDbPath),
        'the orphan is eventually deleted');
      await handler.shutdown();
    },
  );
});
