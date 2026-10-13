/**
 * TX1 M1 (quest replicated-transaction-decision-and-apply, receipt 6): a schema
 * migration cutover on the seed-hydration SQL engine persists its
 * two-participant transaction. Owner decision S4c option 1: the seed phase hands
 * its engine the CDC integration service it created or upgraded, through the
 * existing setter, so the engine's canonical gateway persists transaction state
 * (design-leg-a-v10-2026-10-10.md, derivation 2: the cutover was otherwise a live
 * instance of the S4b defect, committed with its sql_transactions row never
 * written).
 *
 * One seed node is booted through production construction (BootstrapService,
 * its SeedCacheHydrationPhase and the real CDC integration service). The witness
 * engine is the one the phase published to the partitions. A user table is
 * created through a setup engine that holds the seed's CDC service (setup only;
 * it runs no recovery and wires no migration owners). ALTER TABLE then runs
 * through the seed engine, and the seed engine's own migration owner advances
 * the migration. Its cutover (executeCutoverTransaction) opens BEGIN and updates
 * tables (tables-p1) and schema_migration_partitions
 * (schema_migration_partitions-p1) in one transaction. Every fact is read back
 * from the partitions' local committed state, never from the cache. Nothing is
 * mocked. Fixture scheduling is accelerated, but release uses the existing
 * production seed budget and the real disk-derived membership decision.
 * The four system-table groups' three local replicas must then agree, close
 * cleanly, and retain the same rows in a separate read-only process. This is
 * same-host RF3 plus orderly-close persistence, not coordinator crash recovery.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveAutoRejoinStartupDecision} from '../../src/bootstrap/rejoin-hints.js';
import {BOOTSTRAP_DEFAULT} from '../../src/bootstrap/bootstrap-constants.js';
import {test} from 'node:test';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {COMMIT_MODE} from '../../src/constants/transactions.js';
import {MIGRATION_STATUS} from '../../src/migration/migration-constants.js';
import {TRANSACTION_STATUS} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  TEST_CONFIG,
  cleanupTestEnvironment,
  createVirginSeedBootstrapService,
  getPartitionId,
  getPartitionServices,
  getUniquePort,
  gracefulShutdown,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';
import {createSeedQuerySurface} from './helpers/seed-query-surface.js';

const SEED_NODE_ID = 'tx1-m1-seed';
const USER_TABLE = 'tx1_m1_cutover_rows';
const ADDED_COLUMN = 'note';
const M1_SQL = Object.freeze({
  CREATE_TABLE: `CREATE TABLE ${USER_TABLE} (id TEXT PRIMARY KEY, payload TEXT)`,
  INSERT_ROW: `INSERT INTO ${USER_TABLE} (id, payload) VALUES (?, ?)`,
  ALTER_ADD_COLUMN: `ALTER TABLE ${USER_TABLE} ADD COLUMN ${ADDED_COLUMN} TEXT`,
  SELECT_TABLE: `SELECT schema_definition, updated_at FROM ${TABLES.TABLES} ` +
    'WHERE table_id = ?',
  SELECT_PARTITION_MIGRATIONS: 'SELECT partition_id, status, updated_at FROM ' +
    `${TABLES.SCHEMA_MIGRATION_PARTITIONS} WHERE migration_id = ?`,
  SELECT_TRANSACTIONS: `SELECT * FROM ${TABLES.SQL_TRANSACTIONS} WHERE session_id = ?`,
  SELECT_PARTICIPANTS: 'SELECT partition_id FROM ' +
    `${TABLES.SQL_TRANSACTION_PARTICIPANTS} WHERE transaction_id = ?`,
});
const SEED_ROW = Object.freeze(['m1-row-1', 'm1-payload-1']);
// The cutover's session identity (migration-coordinator-stage-methods.js:500).
const CUTOVER_SESSION_PREFIX = 'schema-migration-cutover-';
const PARTITION_OF = Object.freeze({
  tables: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.TABLES],
  migrationPartitions: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS],
  transactions: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS],
  participants: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS],
  writeOperations: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS],
});
const ROUTABLE_WAIT_MS = 15000;
const POLL_INTERVAL_MS = 50;
const TEST_TIMEOUT_MS = 120000;

// The user table has a partition with an active, addressed replica.
function userTableRoutable(systemTableCache) {
  const partition = systemTableCache.filter(TABLES.PARTITIONS,
    (row) => row.table_name === USER_TABLE)[0] || null;
  return Boolean(partition) && systemTableCache.filter(TABLES.SERVICES,
    (service) => service.partition_id === partition.partition_id &&
      service.service_type === SERVICE_TYPE.PARTITION &&
      service.status === SERVICE_STATUS.ACTIVE &&
      typeof service.address === 'string' && service.address.length > 0).length > 0;
}

test('TX1 M1: the schema-migration cutover on the production seed-hydration engine persists ' +
  'its two-participant transaction (tables-p1 and schema_migration_partitions-p1) with a ' +
  'durable COMMITTED decision, and both cutover UPDATEs apply', {timeout: TEST_TIMEOUT_MS},
async (t) => {
  initializeTestEnvironment({nodeId: SEED_NODE_ID});
  const wsPort = getUniquePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-m1-authorized-'));
  const nodeAddress = `ws://localhost:${wsPort}`;
  let bootstrapService = null;
  let bootstrapResult = null;
  let setupEngine = null;
  let seedApi = null;
  try {
    const startupDecision = await resolveAutoRejoinStartupDecision({
      dataDir, nodeId: SEED_NODE_ID, nodeAddress,
    });
    assert.equal(startupDecision.mode, 'seed');
    assert.equal(startupDecision.durableStateDetected, false);
    bootstrapService = await createVirginSeedBootstrapService({nodeId: SEED_NODE_ID,
      dataDir, nodeAddress, wsPort, config: {...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs},
      membershipOwnerOutcome: startupDecision.membershipOwnerOutcome});
    bootstrapResult = await bootstrapService.bootstrap();
    assert.equal(bootstrapResult.success, true,
      `the seed must bootstrap: ${bootstrapResult.error ?? 'no error detail'}`);
    const replicas = getPartitionServices(bootstrapResult, bootstrapService);
    const localReplica = (partitionId) =>
      replicas.find((service) => getPartitionId(service) === partitionId);
    const readLocal = async (partitionId, sql, params) =>
      (await localReplica(partitionId).executeLocalQuery(sql, params)).rows;
    const cdcIntegrationService = bootstrapService.cdcIntegrationService;
    // The engine the seed phase built, handed to the CDC service and published.
    const seedEngine = cdcIntegrationService.sqlQueryEngine;
    const seedSurface = createSeedQuerySurface(bootstrapService, bootstrapResult,
      {seedNodeId: SEED_NODE_ID, seedWsPort: wsPort});
    seedApi = seedSurface.seedApi;
    await seedSurface.start();
    const systemTableCache = seedSurface.systemTableCache;
    setupEngine = seedSurface.sqlQueryEngine;
    const created = await setupEngine.executeQuery(M1_SQL.CREATE_TABLE);
    assert.equal(created.success, true, `setup CREATE TABLE: ${created.error}`);
    assert.equal(await waitFor(() => userTableRoutable(systemTableCache), ROUTABLE_WAIT_MS,
      POLL_INTERVAL_MS), true, 'setup: the user table partition becomes routable');
    const inserted = await setupEngine.executeQuery(M1_SQL.INSERT_ROW, [...SEED_ROW]);
    assert.equal(inserted.success, true, `setup INSERT: ${inserted.error}`);

    const altered = await seedEngine.executeQuery(M1_SQL.ALTER_ADD_COLUMN);
    assert.equal(altered.success, true, `ALTER TABLE through the seed engine: ${altered.error}`);
    const {migrationId, tableId} = altered;
    const decisionKillMarker = process.env.LAGRANGE_TX1_M1_DECISION_KILL_MARKER_PATH;
    if (decisionKillMarker) {
      // The production coordinator reaches its first physical COMMIT call
      // only after its immutable decision has been persisted.
      const {promise: commitEntered, resolve: recordCommitEntered} = Promise.withResolvers();
      const originalCommitParticipant = seedEngine.transactionCoordinator.commitParticipant;
      let physicalCommitCalls = 0;
      seedEngine.transactionCoordinator.commitParticipant = async (...args) => {
        physicalCommitCalls += 1;
        recordCommitEntered(args[1]);
        // The parent kills the process before forwarding any participant COMMIT.
        await new Promise(() => {});
        return originalCommitParticipant(...args);
      };
      const advancing = seedEngine.migrationCoordinator.advanceMigration(migrationId);
      advancing.catch(() => {});
      assert.equal(await Promise.race([
        commitEntered.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 60000)),
      ]), true, 'production coordinator must enter COMMIT delivery');
      assert.equal(physicalCommitCalls, 1, 'the first COMMIT is gated');
      const controlRows = await readLocal(PARTITION_OF.transactions,
        M1_SQL.SELECT_TRANSACTIONS, [`${CUTOVER_SESSION_PREFIX}${migrationId}`]);
      assert.equal(controlRows.length, 1, 'one durable coordinator row');
      const tx = controlRows[0];
      assert.equal(tx.decision, 'COMMIT', 'decision is durable before fanout');
      assert.notEqual(tx.status, TRANSACTION_STATUS.COMMITTED);
      assert.equal(tx.frozen_participant_count, 2);
      const selections = [
        [PARTITION_OF.tables, M1_SQL.SELECT_TABLE, [tableId]],
        [PARTITION_OF.migrationPartitions, M1_SQL.SELECT_PARTITION_MIGRATIONS,
          [migrationId]],
        [PARTITION_OF.transactions,
          `SELECT * FROM ${TABLES.SQL_TRANSACTIONS} WHERE transaction_id = ?`,
          [tx.transaction_id]],
        [PARTITION_OF.participants,
          `SELECT * FROM ${TABLES.SQL_TRANSACTION_PARTICIPANTS} WHERE transaction_id = ?`,
          [tx.transaction_id]],
      ];
      const requests = [];
      const expectedRows = [];
      const observedEffects = [];
      for (const [partitionId, sql, params] of selections) {
        const group = replicas.filter((replica) => getPartitionId(replica) === partitionId);
        assert.equal(group.length, 3, 'each witness group has three real SQLite replicas');
        const expected = await readLocal(partitionId, sql, params);
        assert.ok(expected.length > 0, 'each durable observation must be populated');
        assert.equal(await waitFor(async () => {
          const current = await Promise.all(group.map(async (replica) =>
            (await replica.executeLocalQuery(sql, params)).rows));
          return current.every((rows) => JSON.stringify(rows) === JSON.stringify(expected));
        }, ROUTABLE_WAIT_MS, POLL_INTERVAL_MS), true,
        'all three replicas converge on the same pre-fanout state');
        if (partitionId === PARTITION_OF.tables ||
            partitionId === PARTITION_OF.migrationPartitions) {
          observedEffects.push({partitionId, rows: expected});
        }
        for (const replica of group) {
          assert.ok(path.isAbsolute(replica.dbPath) &&
            replica.dbPath.startsWith(dataDir + path.sep));
          requests.push({replicaId: replica.replicaId, dbPath: replica.dbPath,
            partitionId, sql, params});
          expectedRows.push({replicaId: replica.replicaId, rows: expected});
        }
      }
      const prepared = expectedRows.filter((row, index) =>
        requests[index].partitionId === PARTITION_OF.participants)[0]?.rows || [];
      assert.equal(prepared.length, 2);
      assert.ok(prepared.every((row) => row.prepared_digest &&
        row.status !== 'COMMITTED'), 'both prepared participants remain undecided');
      const schema = JSON.parse(observedEffects[0].rows[0].schema_definition);
      assert.equal((schema.columns || []).some((column) => column.name === ADDED_COLUMN),
        false, 'tables update must not apply before participant COMMIT');
      assert.ok(observedEffects[1].rows.every((row) =>
        row.status !== MIGRATION_STATUS.COMPLETED),
      'migration-partition update must not apply before participant COMMIT');
      assert.equal(new Set(requests.map((request) => request.dbPath)).size, 12);
      const marker = {schemaVersion: 1, kind: 'TX1_M1_COMMIT_DECIDED_UNDELIVERED',
        pid: process.pid, transactionId: tx.transaction_id, dataDir,
        requests, expectedRows, persistedDecision: tx,
        neverDeliveredCommitCalls: physicalCommitCalls,
        pendingOpenHandles: new Set(requests.map((request) => request.dbPath)).size,
        effectRowsNotApplied: true, coordinatorRestarted: false};
      const writingPath = decisionKillMarker + '.writing';
      const markerFd = fs.openSync(writingPath, 'wx', 0o600);
      try {
        fs.writeFileSync(markerFd, JSON.stringify(marker) + '\n');
        fs.fsyncSync(markerFd);
      } finally {
        fs.closeSync(markerFd);
      }
      fs.renameSync(writingPath, decisionKillMarker);
      await new Promise(() => {});
    }
    const advanced = await seedEngine.migrationCoordinator.advanceMigration(migrationId);

    const [tableRow] = await readLocal(PARTITION_OF.tables, M1_SQL.SELECT_TABLE, [tableId]);
    const partitionRows = await readLocal(PARTITION_OF.migrationPartitions,
      M1_SQL.SELECT_PARTITION_MIGRATIONS, [migrationId]);
    const transactionRows = await readLocal(PARTITION_OF.transactions,
      M1_SQL.SELECT_TRANSACTIONS, [`${CUTOVER_SESSION_PREFIX}${migrationId}`]);
    const transactions = [];
    for (const row of transactionRows) {
      const participants = await readLocal(PARTITION_OF.participants,
        M1_SQL.SELECT_PARTICIPANTS, [row.transaction_id]);
      transactions.push({status: row.status, commitMode: row.commit_mode,
        frozenParticipantCount: row.frozen_participant_count,
        participants: participants.map((participant) => participant.partition_id).sort()});
    }
    const facts = {
      seedEngineIsPublished: localReplica(PARTITION_OF.tables)?.sqlQueryEngine === seedEngine &&
        localReplica(PARTITION_OF.migrationPartitions)?.sqlQueryEngine === seedEngine,
      seedRuntimeOwnership: {
        bootstrapOwner: bootstrapService.sqlQueryEngine === seedEngine,
        cdcOwner: bootstrapService.cdcIntegrationService.sqlQueryEngine === seedEngine,
        querySurface: setupEngine === seedEngine,
        currentCache: seedEngine.systemCache === systemTableCache &&
          seedEngine.partitionResolver.systemCache === systemTableCache &&
          seedEngine.queryExecutor.systemCache === systemTableCache &&
          seedEngine.tableCreationService.systemCache === systemTableCache,
        finalRebalanceOwner:
          seedEngine.rebalanceCoordinator === bootstrapService.rebalanceCoordinator,
        partitionProvisioner:
          typeof seedEngine.tableCreationService.partitionProvisioner === 'function',
      },
      migrationStatus: advanced?.status ?? null,
      cutoverApplied: {
        schemaColumns: (JSON.parse(tableRow?.schema_definition || '{}').columns || [])
          .map((column) => column.name),
        partitionRowStatuses: partitionRows.map((row) => row.status),
        oneCutoverStamp: partitionRows.length > 0 &&
          partitionRows.every((row) => row.updated_at === tableRow?.updated_at),
      },
      cutoverTransactions: transactions,
    };
    assert.deepEqual(facts, {
      seedEngineIsPublished: true,
      seedRuntimeOwnership: {
        bootstrapOwner: true,
        cdcOwner: true,
        querySurface: true,
        currentCache: true,
        finalRebalanceOwner: true,
        partitionProvisioner: true,
      },
      migrationStatus: MIGRATION_STATUS.COMPLETED,
      cutoverApplied: {schemaColumns: ['id', 'payload', ADDED_COLUMN],
        partitionRowStatuses: [MIGRATION_STATUS.COMPLETED], oneCutoverStamp: true},
      cutoverTransactions: [{status: TRANSACTION_STATUS.COMMITTED,
        commitMode: COMMIT_MODE.TWO_PHASE_COMMIT, frozenParticipantCount: 2,
        participants: [PARTITION_OF.migrationPartitions, PARTITION_OF.tables].sort()}],
    }, 'migration-coordinator-stage-methods.js:507-545 commits BEGIN..COMMIT on the seed ' +
      'engine; its sql_transactions row must be persisted with the decision, never skipped ' +
      '(sql-query-engine.js:115-117)');

    // These are the actual system-table replicas, not the single-connection
    // gateway double used by the smaller coordinator reconstruction fixture.
    const selections = [
      [PARTITION_OF.tables, M1_SQL.SELECT_TABLE, [tableId]],
      [PARTITION_OF.migrationPartitions, M1_SQL.SELECT_PARTITION_MIGRATIONS, [migrationId]],
      [PARTITION_OF.transactions, M1_SQL.SELECT_TRANSACTIONS,
        [`${CUTOVER_SESSION_PREFIX}${migrationId}`]],
      [PARTITION_OF.participants, M1_SQL.SELECT_PARTICIPANTS,
        [transactionRows[0].transaction_id]],
    ];
    const requests = [];
    const expectedDiskRows = [];
    const retainedReplicas = [];
    for (const [partitionId, sql, params] of selections) {
      const group = replicas.filter((replica) => getPartitionId(replica) === partitionId);
      assert.equal(group.length, 3, 'each M1 system-table group has three real local replicas');
      const expected = await readLocal(partitionId, sql, params);
      assert.ok(expected.length > 0, 'every persisted-state observation must be populated');
      assert.equal(await waitFor(async () => {
        const current = await Promise.all(group.map(async (replica) =>
          (await replica.executeLocalQuery(sql, params)).rows));
        return current.every((rows) => JSON.stringify(rows) === JSON.stringify(expected));
      }, ROUTABLE_WAIT_MS, POLL_INTERVAL_MS), true,
      'the committed system-table rows must reach all replicas before shutdown');
      for (const replica of group) {
        assert.ok(path.isAbsolute(replica.dbPath) &&
          replica.dbPath.startsWith(dataDir + path.sep), 'use the exact real replica file');
        requests.push({replicaId: replica.replicaId, dbPath: replica.dbPath, sql, params});
        expectedDiskRows.push({replicaId: replica.replicaId, rows: expected});
        retainedReplicas.push(replica);
      }
    }
    assert.equal(new Set(requests.map((request) => request.dbPath)).size, 12,
      'the four RF3 system groups must use twelve independent SQLite files');
    // Optional external kill witness follows this SAME real M1 execution,
    // after RF3 committed convergence, before any orderly SQLite shutdown.
    const killMarkerPath = process.env.LAGRANGE_TX1_M1_KILL_MARKER_PATH;
    if (killMarkerPath) {
      const recoveryRequests = [];
      const expectedRecoveryRows = [];
      for (const [partitionId, tableName] of [
        [PARTITION_OF.transactions, TABLES.SQL_TRANSACTIONS],
        [PARTITION_OF.participants, TABLES.SQL_TRANSACTION_PARTICIPANTS],
        [PARTITION_OF.writeOperations, TABLES.SQL_WRITE_OPERATIONS],
      ]) {
        const sql = 'SELECT * FROM ' + tableName + ' WHERE transaction_id = ?';
        const params = [transactionRows[0].transaction_id];
        const expected = await readLocal(partitionId, sql, params);
        const group = replicas.filter((replica) => getPartitionId(replica) === partitionId);
        assert.equal(group.length, 3, 'every coordinator recovery group has RF3');
        assert.equal(await waitFor(async () => {
          const current = await Promise.all(group.map(async (replica) =>
            (await replica.executeLocalQuery(sql, params)).rows));
          return current.every((rows) => JSON.stringify(rows) === JSON.stringify(expected));
        }, ROUTABLE_WAIT_MS, POLL_INTERVAL_MS), true,
        'the coordinator rows must converge before SIGKILL');
        for (const replica of group) {
          recoveryRequests.push({replicaId: replica.replicaId, dbPath: replica.dbPath,
            tableName, sql, params});
          expectedRecoveryRows.push({replicaId: replica.replicaId, rows: expected});
        }
      }
      const marker = {schemaVersion: 1, kind: 'TX1_M1_PRE_KILL', pid: process.pid,
        dataDir, transactionId: transactionRows[0].transaction_id,
        requests, expectedDiskRows, recoveryRequests, expectedRecoveryRows,
        coordinatorRestarted: false, persistedDecision: transactions[0],
        pendingOpenHandles: retainedReplicas.filter((replica) => replica.db?.open).length};
      // Marker existence is a complete, fsynced signal. Do not let the
      // parent observe partially written bytes and kill too early.
      const unpublishedMarkerPath = killMarkerPath + '.writing';
      const markerFd = fs.openSync(unpublishedMarkerPath, 'wx', 0o600);
      try {
        fs.writeFileSync(markerFd, JSON.stringify(marker) + '\n');
        fs.fsyncSync(markerFd);
      } finally {
        fs.closeSync(markerFd);
      }
      fs.renameSync(unpublishedMarkerPath, killMarkerPath);
      await new Promise(() => {});
    }
    await setupEngine.shutdown();
    await seedApi.shutdown();
    await bootstrapService.shutdown();
    assert.ok(retainedReplicas.every((replica) => !replica.db || !replica.db.open),
      'a live connection cannot stand in for orderly persisted-state proof');
    const diskRead = spawnSync(process.execPath, [fileURLToPath(new URL(
      './helpers/tx1-migration-disk-reader.js', import.meta.url))], {
      input: JSON.stringify(requests), encoding: 'utf8', timeout: 10000,
    });
    assert.equal(diskRead.error, undefined, 'the independent disk-reader process must run');
    assert.equal(diskRead.signal, null, 'the disk reader must not be killed');
    assert.equal(diskRead.status, 0, diskRead.stderr);
    assert.deepEqual(JSON.parse(diskRead.stdout), expectedDiskRows,
      'the real coordinator decision, participant list and two cutover effects survive close');
    t.diagnostic(JSON.stringify({kind: 'TX1_M1_PERSISTENCE',
      replicaFiles: requests.length, distinctFiles: new Set(requests.map((r) => r.dbPath)).size,
      transactionId: transactionRows[0].transaction_id, cutoverTransactions: transactions,
      independentlyReadAfterShutdown: true, coordinatorRestarted: false}));
  } finally {
    await setupEngine?.shutdown();
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    await cleanupTestEnvironment();
    fs.rmSync(dataDir, {recursive: true, force: true});
  }
});
