import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

function createMockSystemCache(tableName = SYSTEM_TABLE_NAME.SERVICES) {
  const primaryKey = tableName === SYSTEM_TABLE_NAME.LOGS ?
    'log_id' :
    'service_id';
  const partitionId = `${tableName}-p1`;
  const tables = [{
    table_name: tableName,
    primaryKey,
  }];
  const partitions = [{
    partition_id: partitionId,
    table_name: tableName,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: 'test-node',
  }];
  const services = [{
    service_id: partitionId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${partitionId}`,
    status: 'active',
  }];

  return {
    get(type, key) {
      if (type === 'tables') {
        return tables.find((table) => table.table_name === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'partitions') {
        return partitions.filter(predicate);
      }
      if (type === 'services') {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === 'tables') {
        return tables;
      }
      if (type === 'partitions') {
        return partitions;
      }
      if (type === 'services') {
        return services;
      }
      return [];
    },
  };
}

test('SQLQueryEngine - single-table system selects prefer local authoritative reads',
  async (t) => {
    const deliveries = [];
    const cdcReads = [];
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache(),
      messageRouter: {
        async deliver(address, message) {
          deliveries.push({address, message});
          return {
            acknowledged: true,
            success: true,
            rows: [],
            changes: 0,
          };
        },
      },
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options,
        ) {
          cdcReads.push({tableName, sql, params, options});
          return {
            success: true,
            rows: [{
              service_id: 'svc-1',
              service_type: 'partition',
            }],
            count: 1,
            source: 'local_partition_replica',
          };
        },
      },
    });

    const result = await engine.executeQuery(
      'SELECT * FROM services WHERE service_type = \'partition\'',
    );

    t.equal(result.success, true, 'should succeed from local authoritative rows');
    t.equal(result.rows.length, 1, 'should return local authoritative rows');
    t.equal(
      cdcReads[0]?.tableName,
      SYSTEM_TABLE_NAME.SERVICES,
      'should query the canonical system table',
    );
    t.equal(
      cdcReads[0]?.options?.allowSqlFallback,
      false,
      'should not recurse into routed SQL from the SQL engine fast path',
    );
    t.equal(deliveries.length, 0, 'should bypass routed query delivery');
    t.same(result.partitions, ['services-p1'], 'should still report the target partition');
  });

test('SQLQueryEngine - system-table local reads reuse AuthoritativeControlPlaneView',
  async (t) => {
    const deliveries = [];
    const authoritativeReads = [];
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache(),
      messageRouter: {
        async deliver(address, message) {
          deliveries.push({address, message});
          return {
            acknowledged: true,
            success: true,
            rows: [],
            changes: 0,
          };
        },
      },
      authoritativeControlPlaneView: {
        async readRows(tableName, sql, params, options) {
          authoritativeReads.push({tableName, sql, params, options});
          return {
            success: true,
            rows: [{
              service_id: 'svc-2',
              service_type: 'partition',
            }],
            rowCount: 1,
            source: 'local_partition_replica',
          };
        },
      },
    });

    const result = await engine.executeQuery(
      'SELECT * FROM services WHERE service_type = \'partition\'',
    );

    t.equal(result.success, true, 'shared authoritative view should satisfy the read');
    t.equal(authoritativeReads.length, 1, 'SQL fast path should delegate to the shared read owner');
    t.equal(authoritativeReads[0].tableName, SYSTEM_TABLE_NAME.SERVICES);
    t.equal(authoritativeReads[0].options.allowSqlFallback, false);
    t.equal(deliveries.length, 0,
      'shared authoritative reads should still bypass routed delivery');
    t.equal(result.rows.length, 1);
  });

test('SQLQueryEngine - bounded system-table primary-key lookups confirm ' +
  'empty local reads through the owner lane', async (t) => {
  const authoritativeReads = [];
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache(SYSTEM_TABLE_NAME.LOGS),
    authoritativeControlPlaneView: {
      async readRows(tableName, sql, params, options) {
        authoritativeReads.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{ack_id: 'log-1'}],
          rowCount: 1,
          source: 'owner_rpc_lane',
        };
      },
    },
  });

  const result = await engine.executeQuery(
    'SELECT log_id AS ack_id FROM logs WHERE log_id IN (\'log-1\', \'log-2\')',
  );

  t.equal(result.success, true,
    'bounded system-table lookup should still succeed');
  t.equal(authoritativeReads.length, 1,
    'bounded lookup should route through the authoritative read owner');
  t.equal(authoritativeReads[0].tableName, SYSTEM_TABLE_NAME.LOGS);
  t.equal(
    authoritativeReads[0].options.confirmEmptyLocalReadWithOwnerRpc,
    true,
    'bounded primary-key lookups should confirm empty local reads via owner RPC',
  );
  t.equal(
    authoritativeReads[0].options.replicaFallbackConsistency,
    'any_replica',
    'bounded primary-key lookups should still allow local replica reads first',
  );
  t.same(result.rows, [{ack_id: 'log-1'}],
    'bounded lookup should return the authoritative rows');
});

test('SQLQueryEngine - routed system-table queries default to critical delivery priority',
  async (t) => {
    const deliveries = [];
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache(),
      messageRouter: {
        async deliver(address, message, options) {
          deliveries.push({address, message, options});
          return {
            acknowledged: true,
            success: true,
            rows: [],
            changes: 0,
          };
        },
      },
    });

    const result = await engine.executeQuery(
      'SELECT * FROM services WHERE service_type = \'partition\'',
    );

    t.equal(result.success, true, 'routed system-table query should succeed');
    t.equal(deliveries.length > 0, true,
      'system-table query should route through the message router');
    t.equal(
      deliveries[0]?.options?.deliveryPriority,
      'critical',
      'system-table routed queries should claim the critical delivery lane by default',
    );
  });
