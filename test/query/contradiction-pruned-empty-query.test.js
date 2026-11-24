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
import {SQLParser} from '../../src/query/sql-parser.js';
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

function createEngineFixture({orderLineRows = []} = {}) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    table_id: 'tbl-order-line',
    table_name: 'order_line',
    schema_definition: JSON.stringify(ORDER_LINE_SCHEMA),
    partition_key: 'warehouse_id,district_id,order_id,line_number',
    active_partition_version: 1,
    replica_count: 3,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: 'tbl-order-line-p1',
    table_id: 'tbl-order-line',
    table_name: 'order_line',
    partition_key_start: null,
    partition_key_end: null,
    partition_version: 1,
    state: 'NORMAL',
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
    active_partition_version: 1,
    replica_count: 3,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: 'tbl-stock-p1',
    table_id: 'tbl-stock',
    table_name: 'stock',
    partition_key_start: null,
    partition_key_end: null,
    partition_version: 1,
    state: 'NORMAL',
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
    active_partition_version: 1,
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
        rows: orderLineRows,
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

test('HAVING clauses and nested/function aggregates over contradiction-pruned ' +
  'empty relations preserve SQL semantics with zero RPCs', async (t) => {
  const {engine, deliveries} = createEngineFixture();
  const emptyWhere =
    'WHERE warehouse_id = 1 AND district_id = 1 AND order_id >= 1 AND order_id < 1';

  const havingUnsatisfied = await engine.executeQuery(
    `SELECT COUNT(*) AS c FROM order_line ${emptyWhere} HAVING COUNT(*) > 0`,
  );
  t.equal(havingUnsatisfied.success, true, `HAVING > 0 failed: ${havingUnsatisfied.error}`);
  t.same(havingUnsatisfied.rows, [], 'HAVING COUNT(*) > 0 over empty relation returns []');

  const havingSatisfied = await engine.executeQuery(
    `SELECT COUNT(*) AS c FROM order_line ${emptyWhere} HAVING COUNT(*) = 0`,
  );
  t.equal(havingSatisfied.success, true, `HAVING = 0 failed: ${havingSatisfied.error}`);
  t.same(havingSatisfied.rows, [{c: 0}], 'HAVING COUNT(*) = 0 over empty relation returns [{c: 0}]');

  const havingAliasSatisfied = await engine.executeQuery(
    `SELECT COUNT(*) AS c FROM order_line ${emptyWhere} HAVING c = 0`,
  );
  t.equal(havingAliasSatisfied.success, true,
    `HAVING alias = 0 failed: ${havingAliasSatisfied.error}`);
  t.same(havingAliasSatisfied.rows, [{c: 0}],
    'HAVING referencing SELECT aggregate alias returns [{c: 0}]');

  const havingAliasUnsatisfied = await engine.executeQuery(
    `SELECT COUNT(*) AS c FROM order_line ${emptyWhere} HAVING c > 0`,
  );
  t.equal(havingAliasUnsatisfied.success, true);
  t.same(havingAliasUnsatisfied.rows, [],
    'HAVING referencing SELECT aggregate alias returns [] when unsatisfied');

  const havingSumNull = await engine.executeQuery(
    `SELECT COUNT(*) AS c, SUM(amount_cents) AS total FROM order_line ${emptyWhere} ` +
    'HAVING SUM(amount_cents) IS NULL',
  );
  t.equal(havingSumNull.success, true, `HAVING SUM IS NULL failed: ${havingSumNull.error}`);
  t.same(havingSumNull.rows, [{c: 0, total: null}]);

  const havingSumGtZero = await engine.executeQuery(
    `SELECT COUNT(*) AS c, SUM(amount_cents) AS total FROM order_line ${emptyWhere} ` +
    'HAVING SUM(amount_cents) > 0',
  );
  t.equal(havingSumGtZero.success, true);
  t.same(havingSumGtZero.rows, []);

  const nestedCoalesceSum = await engine.executeQuery(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM order_line ${emptyWhere} ` +
    'HAVING COALESCE(SUM(amount_cents), 0) = 0',
  );
  t.equal(nestedCoalesceSum.success, true,
    `COALESCE(SUM) failed: ${nestedCoalesceSum.error}`);
  t.same(nestedCoalesceSum.rows, [{total: 0}],
    'nested COALESCE(SUM(...), 0) aggregate over empty relation evaluates in SQLite');

  const totalFnAgg = await engine.executeQuery(
    `SELECT TOTAL(amount_cents) AS total FROM order_line ${emptyWhere}`,
  );
  t.equal(totalFnAgg.success, true, `TOTAL() failed: ${totalFnAgg.error}`);
  t.same(totalFnAgg.rows, [{total: 0}],
    'TOTAL() function-call aggregate over empty relation returns 0');

  const exprCountAgg = await engine.executeQuery(
    `SELECT COUNT(*) + 1 AS c FROM order_line ${emptyWhere}`,
  );
  t.equal(exprCountAgg.success, true, `COUNT(*) + 1 failed: ${exprCountAgg.error}`);
  t.same(exprCountAgg.rows, [{c: 1}],
    'binary expression wrapping COUNT(*) evaluates over empty relation');

  const groupedHavingEqZero = await engine.executeQuery(
    `SELECT item_id, COUNT(*) AS c FROM order_line ${emptyWhere} ` +
    'GROUP BY item_id HAVING COUNT(*) = 0',
  );
  t.equal(groupedHavingEqZero.success, true);
  t.same(groupedHavingEqZero.rows, [],
    'GROUP BY ... HAVING COUNT(*) = 0 over empty relation produces zero groups');

  const groupedHavingGtZero = await engine.executeQuery(
    `SELECT item_id, COUNT(*) AS c FROM order_line ${emptyWhere} ` +
    'GROUP BY item_id HAVING COUNT(*) > 0',
  );
  t.equal(groupedHavingGtZero.success, true);
  t.same(groupedHavingGtZero.rows, [],
    'GROUP BY ... HAVING COUNT(*) > 0 over empty relation produces zero groups');

  t.equal(deliveries.length, 0,
    'all contradiction-pruned HAVING and aggregate queries issue zero partition RPCs');
});

test('LEFT JOIN and LEFT OUTER JOIN when left (preserved) table is ' +
  'contradiction-pruned return exact SQL results with zero RPCs', async (t) => {
  const {engine, deliveries} = createEngineFixture();
  const emptyLeftWhere =
    'WHERE ol.warehouse_id = 1 AND ol.district_id = 1 AND ol.order_id >= 1 AND ol.order_id < 1';

  for (const joinKeyword of ['LEFT JOIN', 'LEFT OUTER JOIN']) {
    const plainRes = await engine.executeQuery(
      `SELECT ol.order_id, s.quantity FROM order_line AS ol ${joinKeyword} stock AS s ` +
      `ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ${emptyLeftWhere}`,
    );
    t.equal(plainRes.success, true, `${joinKeyword} plain failed: ${plainRes.error}`);
    t.same(plainRes.rows, [], `${joinKeyword} with empty preserved left table returns []`);

    const unqualifiedRightCol = await engine.executeQuery(
      `SELECT quantity FROM order_line AS ol ${joinKeyword} stock AS s ` +
      `ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ${emptyLeftWhere}`,
    );
    t.equal(unqualifiedRightCol.success, true,
      `${joinKeyword} unqualified right column failed: ${unqualifiedRightCol.error}`);
    t.same(unqualifiedRightCol.rows, []);

    const aggHavingEqZero = await engine.executeQuery(
      'SELECT COUNT(*) AS c, COUNT(s.item_id) AS matched ' +
      `FROM order_line AS ol ${joinKeyword} stock AS s ` +
      `ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ${emptyLeftWhere} ` +
      'HAVING COUNT(*) = 0',
    );
    t.equal(aggHavingEqZero.success, true,
      `${joinKeyword} HAVING = 0 failed: ${aggHavingEqZero.error}`);
    t.same(aggHavingEqZero.rows, [{c: 0, matched: 0}]);

    const aggHavingGtZero = await engine.executeQuery(
      `SELECT COUNT(*) AS c FROM order_line AS ol ${joinKeyword} stock AS s ` +
      `ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ${emptyLeftWhere} ` +
      'HAVING COUNT(*) > 0',
    );
    t.equal(aggHavingGtZero.success, true);
    t.same(aggHavingGtZero.rows, []);

    const aggHavingAlias = await engine.executeQuery(
      `SELECT COUNT(*) AS c FROM order_line AS ol ${joinKeyword} stock AS s ` +
      `ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ${emptyLeftWhere} ` +
      'HAVING c = 0',
    );
    t.equal(aggHavingAlias.success, true,
      `${joinKeyword} HAVING alias failed: ${aggHavingAlias.error}`);
    t.same(aggHavingAlias.rows, [{c: 0}]);

    const groupedRes = await engine.executeQuery(
      `SELECT ol.item_id, COUNT(*) AS c FROM order_line AS ol ${joinKeyword} stock AS s ` +
      `ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ${emptyLeftWhere} ` +
      'GROUP BY ol.item_id HAVING COUNT(*) = 0',
    );
    t.equal(groupedRes.success, true);
    t.same(groupedRes.rows, []);
  }

  t.equal(deliveries.length, 0,
    'LEFT JOIN with contradiction-pruned left table must issue zero RPCs to either table');
});

test('LEFT JOIN and LEFT OUTER JOIN when right (nullable) table is ' +
  'contradiction-pruned handle NULL-rejecting WHERE, NULL-preserving ON, and prunedEmpty plans',
async (t) => {
  const {engine, deliveries} = createEngineFixture({
    orderLineRows: [{
      warehouse_id: 1,
      district_id: 1,
      order_id: 10,
      line_number: 1,
      item_id: 7,
      amount_cents: 500,
      delivered: 0,
    }],
  });

  // 1. Contradiction on nullable right table in WHERE rejects NULL-extended rows and skips right RPCs.
  for (const joinKeyword of ['LEFT JOIN', 'LEFT OUTER JOIN']) {
    deliveries.length = 0;
    const wherePruned = await engine.executeQuery(
      `SELECT s.item_id, ol.order_id FROM stock AS s ${joinKeyword} order_line AS ol ` +
      'ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ' +
      'WHERE s.warehouse_id = 1 AND ol.warehouse_id = 1 AND ol.district_id = 1 ' +
      'AND ol.order_id >= 1 AND ol.order_id < 1',
    );
    t.equal(wherePruned.success, true, `${joinKeyword} WHERE-pruned failed: ${wherePruned.error}`);
    t.same(wherePruned.rows, [],
      `${joinKeyword} with NULL-rejecting contradiction in WHERE returns []`);
    t.equal(
      deliveries.filter((d) => d.address.includes('order-line')).length,
      0,
      `${joinKeyword} skips RPCs to contradiction-pruned right table`,
    );

    const wherePrunedAgg = await engine.executeQuery(
      'SELECT COUNT(*) AS c, COUNT(ol.order_id) AS matched ' +
      `FROM stock AS s ${joinKeyword} order_line AS ol ` +
      'ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ' +
      'WHERE s.warehouse_id = 1 AND ol.warehouse_id = 1 AND ol.district_id = 1 ' +
      'AND ol.order_id >= 1 AND ol.order_id < 1 HAVING COUNT(*) = 0',
    );
    t.equal(wherePrunedAgg.success, true);
    t.same(wherePrunedAgg.rows, [{c: 0, matched: 0}]);

    // 2. Contradiction on nullable right table in ON preserves left row with NULL right columns.
    const onContradiction = await engine.executeQuery(
      `SELECT s.item_id, ol.order_id FROM stock AS s ${joinKeyword} order_line AS ol ` +
      'ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ' +
      'AND ol.warehouse_id = 1 AND ol.district_id = 1 AND ol.order_id >= 1 AND ol.order_id < 1 ' +
      'WHERE s.warehouse_id = 1',
    );
    t.equal(onContradiction.success, true,
      `${joinKeyword} ON-contradiction failed: ${onContradiction.error}`);
    t.same(onContradiction.rows, [{item_id: 7, order_id: null}],
      `${joinKeyword} with ON contradiction preserves left row with NULL right columns`);

    const onContradictionAgg = await engine.executeQuery(
      'SELECT COUNT(*) AS c, COUNT(ol.order_id) AS matched ' +
      `FROM stock AS s ${joinKeyword} order_line AS ol ` +
      'ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ' +
      'AND ol.warehouse_id = 1 AND ol.district_id = 1 AND ol.order_id >= 1 AND ol.order_id < 1 ' +
      'WHERE s.warehouse_id = 1 HAVING COUNT(ol.order_id) = 0',
    );
    t.equal(onContradictionAgg.success, true);
    t.same(onContradictionAgg.rows, [{c: 1, matched: 0}]);

    // 3. Direct prunedEmpty right table plan (0 right RPCs) preserves left row with NULL right columns.
    deliveries.length = 0;
    const prunedRightSql =
      `SELECT s.item_id, ol.order_id FROM stock AS s ${joinKeyword} order_line AS ol ` +
      'ON s.warehouse_id = ol.warehouse_id AND s.item_id = ol.item_id ' +
      'WHERE s.warehouse_id = 1';
    const ast = new SQLParser(prunedRightSql).parse();
    const directRes = await engine.queryExecutor.executeSelect(ast, ['tbl-stock-p1'], [], {
      distributedPlan: {
        tablePlans: new Map([
          ['s', {tableName: 'stock', tableAlias: 's', partitions: ['tbl-stock-p1'], prunedEmpty: false}],
          ['ol', {tableName: 'order_line', tableAlias: 'ol', partitions: [], prunedEmpty: true}],
        ]),
      },
    });
    t.equal(directRes.success, true,
      `${joinKeyword} direct prunedEmpty right plan failed: ${directRes.error}`);
    t.same(directRes.rows, [{item_id: 7, order_id: null}],
      `${joinKeyword} with prunedEmpty right table preserves left row with NULL right columns`);
    t.equal(
      deliveries.filter((d) => d.address.includes('order-line')).length,
      0,
      `${joinKeyword} direct prunedEmpty right table issues zero RPCs to right table`,
    );
  }
});
