/**
 * The global move budget's in-flight count is read from replica_operations
 * through the authoritative row reader. On the seed during formation that
 * reader answers from the seed's own (leader) replica of the ledger and
 * merges partition row sets by primary key. A COUNT(*) row has no key, so
 * the merge dropped it: the read "succeeded" with no rows, the count was
 * typed UNAVAILABLE on every pass, and every non-emergency priority
 * partition held for the whole formation (no operation was ever planned).
 * The count is now taken over keyed rows, which the reader keeps.
 *
 * Composition: the production CDCIntegrationService and
 * ControlPlaneSystemTableGateway over a local replica_operations partition
 * backed by real SQLite with the production schema; the count is read by
 * the UnifiedRebalancer's own budget read.
 */
import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {createLocalSystemTablePartitionServices} from
  '../cdc/cdc-integration-service-test-support.js';

function ledgerDatabase(rows) {
  const db = new Database(':memory:');
  const schema = SYSTEM_TABLE_SCHEMAS.find((candidate) =>
    candidate.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
  db.exec(generateCreateTableSQL(schema));
  const insert = db.prepare(`INSERT INTO replica_operations
    (operation_id, type, partition_id, replica_id, source_node_id,
     target_node_id, status, workflow_step, created_at, updated_at,
     entity_type, entity_id, steps_history)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`);
  for (const row of rows) {
    insert.run(row.operationId, 'ADD', 'nodes-p1', `${row.operationId}-r`,
      'seed', 'seed', row.status, row.step, 1, 1, 'partition', 'nodes-p1');
  }
  return db;
}

test('the seed\'s global in-flight count answers from its own ledger replica ' +
  'during formation', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const db = ledgerDatabase([
    {operationId: 'op-in-flight-1', status: 'pending', step: 'PENDING'},
    {operationId: 'op-in-flight-2', status: 'creating', step: 'CREATING'},
    {operationId: 'op-done', status: 'active', step: 'ACTIVE'},
  ]);
  const cdc = new CDCIntegrationService({
    nodeId: 'seed',
    sqlQueryEngine: {
      async executeQuery() {
        return {success: false, error: 'routed SQL is not reached'};
      },
    },
    partitionServicesProvider: () => createLocalSystemTablePartitionServices(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      {
        isLeader: true,
        async executeQuery(sql, params = []) {
          return {success: true, rows: db.prepare(sql).all(...params)};
        },
      },
    ),
  });
  cdc.initialize();
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'seed',
    cdcIntegrationService: cdc,
    sqlQueryEngine: null,
    systemTableCache: null,
    messageRouter: null,
    controlPlaneReadinessService: null,
  });
  const wakes = [];
  const budgetReader = Object.assign(Object.create(UnifiedRebalancer.prototype), {
    controlPlaneSystemTableGateway: gateway,
    armOperationListReadWake: () => wakes.push('armed'),
  });
  try {
    const outcome = await budgetReader.getGlobalInFlightOperationCount()
      .then((count) => ({count}), (error) => ({error}));
    t.equal(outcome.error, undefined,
      'the seed\'s own ledger replica answers the count');
    t.equal(outcome.count, 2,
      'the two non-terminal operations are counted; the terminal one is not');
    t.same(wakes, [], 'no unanswered-read wait is armed');
  } finally {
    cdc.markShuttingDown?.();
    db.close();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
