// Regression tests for algebraically contradictory (empty-range / conflicting-
// equality) key predicates in PartitionResolver, DistributedQueryPlanner,
// SQLQueryEngine, and QueryExecutor.
//
// Proves:
// 1. TPC-C STOCK_LEVEL_COUNT join (`ol.order_id >= 1 AND ol.order_id < 1` when
//    `district.next_order_id === 1`) succeeds with `[{low_stock: 0}]` and zero
//    partition RPCs instead of failing with XX000
//    `Authoritative routing metadata unavailable for table: order_line`.
// 2. Single-table ungrouped aggregates (`COUNT(*)`, `SUM(...)`) over a
//    contradiction-pruned table return SQL-standard `[{c: 0, total: null}]`,
//    while grouped aggregates and plain SELECT return `[]`.
// 3. Joined table contradiction pruning (right-hand table pruned empty) returns
//    valid SQL results without failing `validateSelectJoinPlans` or
//    `MISSING_JOIN_PLAN`.
// 4. UPDATE and DELETE with contradictory key predicates return success with
//    zero affected rows and zero partition RPCs.
// 5. Negative control: a table with genuinely absent partition metadata still
//    fails closed with `ROUTING_METADATA_UNAVAILABLE`.

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {METADATA_AUTHORITY_ERROR_CODE} from
  '../../src/query/sql-query-engine-metadata-authority-refresh.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

ConfigurationManager.getInstance().initialize();

const ORDER_LINE_SCHEMA = Object.freeze({
  columns: [
    {name: 'warehouse_id', type: 'INTEGER', primaryKey: true},
    {name: 'district_id', type: 'INTEGER', primaryKey: true},
    {name: 'order_id', type: 'INTEGER', primaryKey: true},
    {name: 'line_number', type: 'INTEGER', primaryKey: true},
    {name: 'item_id', type: 'INTEGER'},
    {name: 'amount_cents', type: 'INTEGER'},
    {name: 'delivered', type: 'INTEGER'},
  ],
  primaryKey: ['warehouse_id', 'district_id', 'order_id', 'line_number'],
});

const STOCK_SCHEMA = Object.freeze({
  columns: [
    {name: 'warehouse_id', type: 'INTEGER', primaryKey: true},
    {name: 'item_id', type: 'INTEGER', primaryKey: true},
    {name: 'quantity', type: 'INTEGER'},
  ],
  primaryKey: ['warehouse_id', 'item_id'],
});

const UNPARTITIONED_MISSING_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'val', type: 'TEXT'},
  ],
  primaryKey: ['id'],
});

function createEngineFixture() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    table_id: 'tbl-order-line',
    table_name: 'order_line',
    schema_definition: JSON.stringify(ORDER_LINE_SCHEMA),
    partition_key: 'warehouse_id,district_id,order_id,line_number',
    replica_count: 3,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: 'tbl-order-line-p1',
    table_id: 'tbl-order-line',
    table_name: 'order_line',
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: 'node-1',
    replica_count: 3,
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    service_id: 'tbl-order-line-p1-r1',
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: 'tbl-order-line-p1',
    node_id: 'node-1',
    raft_role: 'leader',
    address: 'node-1/partition/tbl-order-line-p1-r1',
    status: SERVICE_STATUS.ACTIVE,
  });

  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    table_id: 'tbl-stock',
    table_name: 'stock',
    schema_definition: JSON.stringify(STOCK_SCHEMA),
    partition_key: 'warehouse_id,item_id',
    replica_count: 3,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: 'tbl-stock-p1',
    table_id: 'tbl-stock',
    table_name: 'stock',
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: 'node-1',
    replica_count: 3,
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    service_id: 'tbl-stock-p1-r1',
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: 'tbl-stock-p1',
    node_id: 'node-1',
    raft_role: 'leader',
    address: 'node-1/partition/tbl-stock-p1-r1',
    status: SERVICE_STATUS.ACTIVE,
  });

  // Table whose partition metadata is genuinely missing (negative control).
  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    table_id: 'tbl-missing-parts',
    table_name: 'missing_parts',
    schema_definition: JSON.stringify(UNPARTITIONED_MISSING_SCHEMA),
    partition_key: 'id',
    replica_count: 3,
  });

  const deliveries = [];
  const messageRouter = {
    async deliver(address, request) {
      deliveries.push({address, sql: request?.sql});
      if (address === 'node-1/partition/tbl-stock-p1-r1') {
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [{warehouse_id: 1, item_id: 7, quantity: 5}],
        });
      }
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rows: [],
      });
    },
  };

  let refreshCalls = 0;
  const engine = new SQLQueryEngine({
    nodeId: 'node-1',
    systemCache: cache,
    messageRouter,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  });
  const origRefresh = engine.refreshTableRoutingMetadataFromAuthority.bind(engine);
  engine.refreshTableRoutingMetadataFromAuthority = async (...args) => {
    refreshCalls += 1;
    return origRefresh(...args);
  };

  return {
    engine,
    deliveries,
    getRefreshCalls: () => refreshCalls,
  };
}

test('TPC-C STOCK_LEVEL_COUNT join with empty range (order_id >= 1 AND ' +
  'order_id < 1) returns low_stock = 0 with zero RPCs', async (t) => {
  const {engine, deliveries, getRefreshCalls} = createEngineFixture();
  const sql =
    'SELECT COUNT(DISTINCT ol.item_id) AS low_stock ' +
    'FROM order_line AS ol JOIN stock AS s ' +
    'ON s.warehouse_id = $1 AND s.item_id = ol.item_id ' +
    'WHERE ol.warehouse_id = $2 AND ol.district_id = $3 ' +
    'AND ol.order_id >= $4 AND ol.order_id < $5 AND s.quantity < $6';
  const result = await engine.executeQuery(sql, [1, 1, 1, 1, 1, 15], {
    dialect: 'postgresql',
  });
  t.equal(result.success, true, `expected success, got: ${result.error}`);
  t.same(result.rows, [{low_stock: 0}],
    'COUNT(DISTINCT ...) over contradiction-pruned join must return 0');
  t.equal(getRefreshCalls(), 0,
    'contradiction-pruned table must not trigger cold authority metadata refresh');
  t.equal(deliveries.length, 0,
    'contradiction-pruned INNER JOIN must issue zero partition RPCs');
});

test('single-table aggregates, GROUP BY, and plain SELECT over ' +
  'contradiction-pruned predicates preserve SQL semantics', async (t) => {
  const {engine, deliveries} = createEngineFixture();

  const aggRes = await engine.executeQuery(
    'SELECT COUNT(*) AS c, SUM(amount_cents) AS total FROM order_line ' +
    'WHERE warehouse_id = 1 AND district_id = 1 AND order_id >= 5 AND order_id < 5',
  );
  t.equal(aggRes.success, true, `ungrouped aggregate failed: ${aggRes.error}`);
  t.same(aggRes.rows, [{c: 0, total: null}],
    'ungrouped COUNT/SUM over empty relation returns one row {0, null}');

  const groupedRes = await engine.executeQuery(
    'SELECT item_id, COUNT(*) AS c FROM order_line ' +
    'WHERE warehouse_id = 1 AND district_id = 1 AND order_id >= 5 AND order_id < 5 ' +
    'GROUP BY item_id',
  );
  t.equal(groupedRes.success, true, `grouped aggregate failed: ${groupedRes.error}`);
  t.same(groupedRes.rows, [],
    'GROUP BY aggregate over empty relation returns zero rows');

  const plainRes = await engine.executeQuery(
    'SELECT * FROM order_line WHERE warehouse_id = 1 AND warehouse_id = 2',
  );
  t.equal(plainRes.success, true, `plain SELECT failed: ${plainRes.error}`);
  t.same(plainRes.rows, [],
    'plain SELECT with conflicting equality returns zero rows');

  t.equal(deliveries.length, 0,
    'all contradiction-pruned single-table selects must issue zero partition RPCs');
});

test('JOIN where joined right-hand table is contradiction-pruned returns ' +
  'exact SQL aggregate without ROUTING_METADATA_UNAVAILABLE', async (t) => {
  const {engine} = createEngineFixture();
  const sql =
    'SELECT COUNT(DISTINCT ol.item_id) AS low_stock ' +
    'FROM stock AS s JOIN order_line AS ol ' +
    'ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ' +
    'WHERE s.warehouse_id = 1 AND ol.warehouse_id = 1 ' +
    'AND ol.district_id = 1 AND ol.order_id >= 1 AND ol.order_id < 1';
  const result = await engine.executeQuery(sql);
  t.equal(result.success, true, `right-side pruned JOIN failed: ${result.error}`);
  t.same(result.rows, [{low_stock: 0}],
    'right-side contradiction-pruned JOIN returns low_stock = 0');
});

test('UPDATE and DELETE with contradictory key predicates succeed with ' +
  'zero affected rows and zero partition RPCs', async (t) => {
  const {engine, deliveries} = createEngineFixture();

  const updateRes = await engine.executeQuery(
    'UPDATE order_line SET delivered = 1 ' +
    'WHERE warehouse_id = 1 AND district_id = 1 AND order_id >= 1 AND order_id < 1',
  );
  t.equal(updateRes.success, true, `UPDATE failed: ${updateRes.error}`);
  t.equal(updateRes.affectedRows ?? updateRes.changes ?? 0, 0);

  const deleteRes = await engine.executeQuery(
    'DELETE FROM order_line ' +
    'WHERE warehouse_id = 1 AND district_id = 1 AND order_id >= 1 AND order_id < 1',
  );
  t.equal(deleteRes.success, true, `DELETE failed: ${deleteRes.error}`);
  t.equal(deleteRes.affectedRows ?? deleteRes.changes ?? 0, 0);

  t.equal(deliveries.length, 0,
    'contradiction-pruned UPDATE and DELETE must issue zero partition RPCs');
});

test('negative control: table with genuinely absent partition metadata still ' +
  'fails closed with ROUTING_METADATA_UNAVAILABLE even on contradictory WHERE',
async (t) => {
  const {engine} = createEngineFixture();
  const result = await engine.executeQuery(
    'SELECT COUNT(*) AS c FROM missing_parts WHERE id >= 1 AND id < 1',
  );
  t.equal(result.success, false,
    'missing partition metadata must never be masked by contradiction pruning');
  t.equal(result.errorCode, METADATA_AUTHORITY_ERROR_CODE.ROUTING_METADATA_UNAVAILABLE);
});
