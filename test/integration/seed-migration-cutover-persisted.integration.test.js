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
 * mocked.
 */
import assert from 'node:assert/strict';
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
import {NodeService} from '../../src/node/node-service.js';
import {TRANSACTION_STATUS} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
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
async () => {
  initializeTestEnvironment({nodeId: SEED_NODE_ID});
  const wsPort = getUniquePort();
  const bootstrapService = await createVirginSeedBootstrapService({nodeId: SEED_NODE_ID,
    nodeAddress: `ws://localhost:${wsPort}`, wsPort, config: TEST_CONFIG.bootstrap});
  let bootstrapResult = null;
  let setupEngine = null;
  try {
    bootstrapResult = await bootstrapService.bootstrap();
    assert.equal(bootstrapResult.success, true, 'the seed must bootstrap');
    const replicas = getPartitionServices(bootstrapResult, bootstrapService);
    const localReplica = (partitionId) =>
      replicas.find((service) => getPartitionId(service) === partitionId);
    const readLocal = async (partitionId, sql, params) =>
      (await localReplica(partitionId).executeLocalQuery(sql, params)).rows;
    const cdcIntegrationService = bootstrapService.cdcIntegrationService;
    // The engine the seed phase built, handed to the CDC service and published.
    const seedEngine = cdcIntegrationService.sqlQueryEngine;
    const systemTableCache = NodeService.getInstance().getSystemTableCache();

    setupEngine = new SQLQueryEngine({systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter, cdcIntegrationService,
      nodeId: SEED_NODE_ID, rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
      migrationAutoWire: false, autoStartDistributedTransactionRecovery: false,
      unrefRetryDelayTimers: true});
    const created = await setupEngine.executeQuery(M1_SQL.CREATE_TABLE);
    assert.equal(created.success, true, `setup CREATE TABLE: ${created.error}`);
    assert.equal(await waitFor(() => userTableRoutable(systemTableCache), ROUTABLE_WAIT_MS,
      POLL_INTERVAL_MS), true, 'setup: the user table partition becomes routable');
    const inserted = await setupEngine.executeQuery(M1_SQL.INSERT_ROW, [...SEED_ROW]);
    assert.equal(inserted.success, true, `setup INSERT: ${inserted.error}`);

    const altered = await seedEngine.executeQuery(M1_SQL.ALTER_ADD_COLUMN);
    assert.equal(altered.success, true, `ALTER TABLE through the seed engine: ${altered.error}`);
    const {migrationId, tableId} = altered;
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
      migrationStatus: MIGRATION_STATUS.COMPLETED,
      cutoverApplied: {schemaColumns: ['id', 'payload', ADDED_COLUMN],
        partitionRowStatuses: [MIGRATION_STATUS.COMPLETED], oneCutoverStamp: true},
      cutoverTransactions: [{status: TRANSACTION_STATUS.COMMITTED,
        commitMode: COMMIT_MODE.TWO_PHASE_COMMIT, frozenParticipantCount: 2,
        participants: [PARTITION_OF.migrationPartitions, PARTITION_OF.tables].sort()}],
    }, 'migration-coordinator-stage-methods.js:507-545 commits BEGIN..COMMIT on the seed ' +
      'engine; its sql_transactions row must be persisted with the decision, never skipped ' +
      '(sql-query-engine.js:115-117)');
  } finally {
    await setupEngine?.shutdown();
    await gracefulShutdown(bootstrapService, bootstrapResult, null);
    await cleanupTestEnvironment();
  }
});
