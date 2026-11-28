/**
 * Fresh global-index founding through production construction: provisioning
 * through the real provisionInitialTablePartition and placement admission,
 * fail-closed founding identity and placement authority, and the founding
 * grant (a returned pending grant retained for the retry; the table's replica
 * default carried into the durable intent). Split by subject out of
 * global-index-production-construction.test.js.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {waitForCondition} from '../partition/partition-service-test-support.js';
import {
  GLOBAL_INDEX_STATE,
} from '../../src/index-management/global-index-catalog-contract.js';
import {
  GLOBAL_INDEX_ACCESS_PATH,
} from '../../src/index-management/global-index-read-router.js';
import {ledgerRows} from '../partition/placement-admission-fixture.js';
import {
  withFoundingPlacementEnvironment,
} from './global-index-founding-witness-support.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('Production construction 6 (2A positive): fresh global index provisioning through real provisionInitialTablePartition and placement admission', async (t) => {
  await withFoundingPlacementEnvironment(async ({
    engine,
    leader,
    gateway,
    cache,
    createdReplicas,
  }) => {
    await engine.executeQuery(
      'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)',
      [10, 'alice@example.com', 'Alice', 'active'],
    );
    await engine.executeQuery(
      'INSERT INTO users (id, email, name, status) VALUES (?, ?, ?, ?)',
      [20, 'bob@example.com', 'Bob', 'pending'],
    );

    const preExisting = cache.filter(
      TABLES.PARTITIONS,
      (p) => p.table_name === '__idx_users_idx_users_email',
    );
    t.equal(preExisting.length, 0, 'No pre-created index partitions exist before CREATE GLOBAL INDEX');

    const createRes = await engine.executeQuery(
      'CREATE GLOBAL INDEX idx_users_email ON users (email)',
    );
    t.equal(createRes.success, true, 'Fresh CREATE GLOBAL INDEX succeeds with placement admission');
    t.equal(createdReplicas.length, 1, 'Founding operation instantiated 1 real PartitionService');

    const schemaOps = gateway.db.prepare('SELECT * FROM schema_operations').all();
    const gsiJob = schemaOps.find((row) => row.table_name === '__idx_users_idx_users_email');
    t.ok(gsiJob, 'Durable schema provisioning job row recorded for GSI dataset');
    t.equal(gsiJob.status, 'SUCCEEDED', 'GSI durable schema provisioning job reached SUCCEEDED');

    const rows = ledgerRows(leader);
    t.ok(rows.length >= 1, 'Real placement admission ledger recorded native FOUND row(s)');
    const foundedOp = rows.find((row) =>
      row.partition_id === '__gsi_users_idx_users_email_p0',
    );
    t.ok(foundedOp, 'Ledger recorded native FOUND operation for GSI partition');
    const [initialStep] = JSON.parse(foundedOp.steps_history);
    t.equal(
      initialStep.placementAdmission?.foundingIntentId,
      `${gsiJob.job_id}:__gsi_users_idx_users_email_p0`,
      'Founding admission intent binds deterministically to durable schema job identity',
    );

    const idxRecord = gateway.db.prepare(
      'SELECT * FROM indices WHERE index_name = ?',
    ).get('idx_users_email');
    t.equal(idxRecord?.state, GLOBAL_INDEX_STATE.READ_WRITE, 'Fresh GSI reached READ_WRITE');
    t.equal(idxRecord?.backfill_total_rows, 2, 'Backfilled existing base rows into founded GSI');

    const selectRes = await engine.executeQuery(
      'SELECT * FROM users WHERE email = ? ORDER BY id ASC',
      ['alice@example.com'],
    );
    t.equal(selectRes.success, true);
    t.equal(
      selectRes.globalIndexPlan?.accessPath,
      GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
      'Query after real founding engages GLOBAL_SECONDARY_INDEX',
    );
    t.same(
      selectRes.rows.map((r) => ({id: r.id, email: r.email, name: r.name})),
      [{id: 10, email: 'alice@example.com', name: 'Alice'}],
      'Query against newly founded GSI partition returns authoritative row',
    );
  });
});

test('Production construction 7 (2A negative): missing/conflicting founding identity and unavailable placement authority fail closed', async (t) => {
  await withFoundingPlacementEnvironment(async ({engine, leader, coordinator}) => {
    await t.rejects(
      engine.provisionInitialTablePartition({
        tableId: '__idx_users_idx_missing_id',
        tableName: '__idx_users_idx_missing_id',
        partitionId: '__gsi_users_idx_missing_id_p0',
        replicaCount: 1,
        targetNodeIds: ['test-node'],
      }),
      {code: 'PLACEMENT_FOUND_IDENTITY_REQUIRED'},
      'provisionInitialTablePartition rejects missing founding identity fail-closed',
    );

    await t.rejects(
      engine.provisionInitialTablePartition({
        tableId: '__idx_users_idx_conflict_id',
        tableName: '__idx_users_idx_conflict_id',
        partitionId: '__gsi_users_idx_conflict_id_p0',
        replicaCount: 1,
        targetNodeIds: ['test-node'],
        schemaJobId: 'schema-job-1',
        partitionWorkflowId: 'workflow-1',
      }),
      {code: 'PLACEMENT_FOUND_IDENTITY_REQUIRED'},
      'provisionInitialTablePartition preserves XOR founding identity guard fail-closed',
    );
    t.same(ledgerRows(leader), [], 'Refused founding attempts leave zero ledger rows');

    const originalNodeId = coordinator.nodeId;
    coordinator.nodeId = '';
    await t.rejects(
      engine.indexService.createIndex('CREATE GLOBAL INDEX idx_users_no_host ON users (email)'),
      {code: 'PLACEMENT_FOUND_IDENTITY_REQUIRED'},
      'CREATE GLOBAL INDEX fails closed when placement coordinator lacks hosting nodeId',
    );
    t.equal(
      engine.tableCreationService.schemaProvisioningJobOwner.retryTimersByWorkflowId.size,
      0,
      'Non-retryable placement refusal cancels/retains zero retry timers',
    );
    coordinator.nodeId = originalNodeId;
  });
});

test('fresh GSI retains a returned pending grant and founds the exact durable partition on retry', async (t) => {
  await withFoundingPlacementEnvironment(async ({engine, gateway, createdReplicas, leader}) => {
    const owner = engine.tableCreationService.schemaProvisioningJobOwner;
    const provision = engine.provisionInitialTablePartition.bind(engine);
    const grants = [];
    let retry;
    owner.retrySetTimeoutFn = (callback) => {
      retry = callback; return {};
    };
    owner.retryClearTimeoutFn = () => {};
    engine.provisionInitialTablePartition = (grant) => {
      grants.push({partitionId: grant.partitionId, tableId: grant.tableId});
      if (grants.length === 1) {
        return {contractState: 'pending', nextAction: 'wait',
          requestedReplicaCount: grant.replicaCount, minimumRoutableReplicaCount: 1,
          committedReplicaCount: 0, routableReplicaCount: 0};
      }
      return provision(grant);
    };
    // The bare index name is also a real application table with a live
    // partition. Only the index dataset may satisfy index partition discovery.
    const result = await engine.executeQuery('CREATE GLOBAL INDEX users ON users (email)');
    t.equal(result.deferred, true);
    const readJob = () => gateway.db.prepare(
      'SELECT * FROM schema_operations WHERE job_id = ?').get(result.jobId);
    const pending = readJob();
    t.equal(pending.status, 'PENDING');
    t.equal(createdReplicas.length, 0);
    const [part] = JSON.parse(pending.normalized_ddl).partitions;
    const [catalog] = gateway.db.prepare(
      'SELECT partition_id, replica_count FROM partitions WHERE table_id = ?').all(pending.table_id);
    t.same(catalog, {partition_id: part.partitionId, replica_count: part.replicaCount});
    t.same(grants, [{partitionId: part.partitionId, tableId: pending.table_id}]);
    retry();
    t.ok(await waitForCondition(() => readJob().status === 'SUCCEEDED', 3000, 15));
    const terminal = readJob();
    t.equal(JSON.parse(terminal.result_json).partitionId, catalog.partition_id);
    t.same(grants[1], grants[0]);
    t.equal(createdReplicas[0].partitionId, catalog.partition_id);
    t.ok(ledgerRows(leader).some((row) => row.partition_id === catalog.partition_id));
    t.ok(await waitForCondition(() => gateway.db.prepare(
      'SELECT state FROM indices WHERE index_id = ?').get(result.indexId)?.state ===
      GLOBAL_INDEX_STATE.READ_WRITE, 3000, 15));
  });
});

test('fresh public GSI carries the table default into its durable intent and first grant', async (t) => {
  await withFoundingPlacementEnvironment(async ({engine, gateway}) => {
    engine.tableCreationService.defaultReplicaCount = 3;
    const grants = [];
    engine.provisionInitialTablePartition = async (grant) => {
      grants.push(grant.replicaCount);
      return {contractState: 'pending', nextAction: 'wait', requestedReplicaCount: grant.replicaCount,
        committedReplicaCount: 0, routableReplicaCount: 0, minimumRoutableReplicaCount: 1};
    };
    const owner = engine.tableCreationService.schemaProvisioningJobOwner;
    owner.retrySetTimeoutFn = () => ({});
    owner.retryClearTimeoutFn = () => {};
    const result = await engine.executeQuery('CREATE GLOBAL INDEX idx_rf ON users (email)');
    t.equal(result.deferred, true);
    const job = gateway.db.prepare('SELECT normalized_ddl FROM schema_operations WHERE job_id = ?')
      .get(result.jobId);
    const [partition] = JSON.parse(job.normalized_ddl).partitions;
    t.equal(partition.replicaCount, 3);
    const catalog = gateway.db.prepare('SELECT replica_count FROM partitions WHERE partition_id = ?')
      .get(partition.partitionId);
    t.equal(catalog.replica_count, 3);
    t.same(grants, [3]);
  });
});
