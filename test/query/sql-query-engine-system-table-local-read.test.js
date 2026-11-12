import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  executeAuthoritativeSystemTableRead,
} from '../../src/cdc/cdc-integration-service-authoritative-read-flow.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
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

test('SQLQueryEngine - claimed system selects retain the RPC owner answer',
  async (t) => {
    const deliveries = [];
    const cdcReads = [];
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: createMockSystemCache(),
      messageRouter: {
        async deliver(address, message) {
          deliveries.push({address, message});
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true,
            rows: [],
            changes: 0,
          });
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
          const witness = {
            appliedIndex: 19,
            commitIndex: 19,
            nodeId: 'test-node',
            observedAtMs: 1700000000000,
            partitionId: 'services-p1',
            role: 'leader',
            term: 2,
          };
          return {
            authoritativeObservation: {
              maxAppliedIndex: 19,
              maxCommitIndex: 19,
              maxTerm: 2,
              observedPartitionCount: 1,
              tableName,
              witnessCount: 1,
            },
            count: 1,
            readAuthorityWitness: witness,
            readAuthorityWitnesses: [witness],
            rowSetComplete: true,
            rows: [{
              service_id: 'svc-1',
              service_type: 'partition',
            }],
            source: 'owner_rpc_lane',
            success: true,
          };
        },
      },
    });

    const result = await engine.executeQuery(
      'SELECT * FROM services WHERE service_type = \'partition\'',
    );
    const serviceRead = cdcReads.find(
      (read) => read.tableName === SYSTEM_TABLE_NAME.SERVICES,
    );
    const readAuthority = serviceRead.options.readAuthority;

    t.equal(result.success, true, 'should succeed from the selected owner rows');
    t.equal(result.rows.length, 1, 'should return the selected owner rows');
    t.equal(result.rowSetComplete, true, 'should preserve rowSetComplete');
    t.equal(
      result.readAuthorityWitness.appliedIndex,
      19,
      'should preserve readAuthorityWitness',
    );
    t.equal(
      result.readAuthorityWitnesses.length,
      1,
      'should preserve readAuthorityWitnesses',
    );
    t.equal(
      result.authoritativeObservation.maxAppliedIndex,
      19,
      'should preserve authoritativeObservation',
    );
    t.equal(
      serviceRead.tableName,
      SYSTEM_TABLE_NAME.SERVICES,
      'should query the canonical system table',
    );
    t.equal(
      readAuthority.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'the SQL adapter selects the RPC owner before attempting the read',
    );
    t.equal(
      readAuthority.localReadConsistency,
      null,
      'the default RPC contract makes no alternate local-read request',
    );
    t.equal(
      readAuthority.replicaFallbackConsistency,
      undefined,
      'the canonical token carries no alternate replica consistency',
    );
    t.equal(deliveries.length, 0, 'should bypass routed query delivery');
    t.same(result.partitions, ['services-p1'], 'should still report the target partition');
  });

test('SQLQueryEngine - claimed system-table reads reuse AuthoritativeControlPlaneView',
  async (t) => {
    const deliveries = [];
    const authoritativeReads = [];
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: createMockSystemCache(),
      messageRouter: {
        async deliver(address, message) {
          deliveries.push({address, message});
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true,
            rows: [],
            changes: 0,
          });
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
            source: 'owner_rpc_lane',
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
    t.equal(
      authoritativeReads[0].options.readAuthority?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    );
    t.equal(deliveries.length, 0,
      'shared authoritative reads should still bypass routed delivery');
    t.equal(result.rows.length, 1);
  });

test('SQLQueryEngine - PG system-table reads send normalized SQLite SQL to the owner',
  async (t) => {
    const authoritativeReads = [];
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: createMockSystemCache(),
      authoritativeControlPlaneView: {
        async readRows(tableName, sql, params) {
          authoritativeReads.push({tableName, sql, params});
          return {success: true, rows: [], rowCount: 0};
        },
      },
    });

    const result = await engine.executeQuery(
      'SELECT * FROM services WHERE service_id = $1',
      ['svc-1'],
      {dialect: 'postgresql'},
    );

    t.equal(result.success, true);
    t.equal(
      authoritativeReads[0].sql,
      'SELECT * FROM services WHERE (service_id = ?)',
    );
    t.same(authoritativeReads[0].params, ['svc-1']);
  });

test('SQLQueryEngine - bounded system-table primary-key lookups use ' +
  'the RPC owner lane', async (t) => {
  const authoritativeReads = [];
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
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
    authoritativeReads[0].options.readAuthority?.authoritativeReadMode,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE
      .OWNER_RPC_REQUIRED,
    'bounded primary-key lookups select the RPC owner',
  );
  t.equal(
    authoritativeReads[0].options.readAuthority
      ?.replicaFallbackConsistency,
    undefined,
    'bounded primary-key lookups carry no local fallback contract',
  );
  t.same(result.rows, [{ack_id: 'log-1'}],
    'bounded lookup should return the authoritative rows');
});

test('SQLQueryEngine - routed system-table queries default to critical delivery priority',
  async (t) => {
    const deliveries = [];
    const engine = new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: createMockSystemCache(),
      messageRouter: {
        async deliver(address, message, options) {
          deliveries.push({address, message, options});
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true,
            rows: [],
            changes: 0,
          });
        },
      },
    });

    const result = await engine.executeQuery(
      'SELECT service_type FROM services WHERE service_type = \'partition\'',
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

test('SQLQueryEngine - system selects that do not project the primary key ' +
  'bypass the local authoritative fast path', async (t) => {
  const deliveries = [];
  const cdcReads = [];
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache(),
    messageRouter: {
      async deliver(address, message) {
        deliveries.push({address, message});
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [{service_type: 'partition'}],
          changes: 0,
        });
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        cdcReads.push({tableName, sql, params, options});
        // The local merge keys rows by the primary key and DROPS rows whose
        // key column is absent — a pk-less projection reaching this path
        // would return a successful empty result (the 2026-07-18
        // learned-affinity attribution stall).
        return {success: true, rows: [], count: 0, source: 'local_partition_replica'};
      },
    },
  });

  const result = await engine.executeQuery(
    'SELECT service_type FROM services',
  );

  const servicesReads = () => cdcReads.filter(
    (read) => read.tableName === SYSTEM_TABLE_NAME.SERVICES,
  );
  t.equal(
    servicesReads().length,
    0,
    'pk-less projections must not take the key-merged local read path',
  );
  t.ok(
    deliveries.length > 0,
    'pk-less projections must route to partition execution instead',
  );
  t.equal(result.success, true, 'routed execution should succeed');
  t.equal(
    result.rows?.length ?? result.results?.length ?? 0,
    1,
    'routed execution should return the projected rows',
  );

  const aliased = await engine.executeQuery(
    'SELECT service_id AS sid FROM services',
  );
  t.equal(
    servicesReads().length,
    0,
    'aliasing the primary key away must also bypass the local read path',
  );
  t.equal(aliased.success, true, 'aliased projection should still succeed');

  const starResult = await engine.executeQuery('SELECT * FROM services');
  t.ok(
    servicesReads().length > 0,
    'star selects use the claimed authoritative path',
  );
  t.equal(starResult.success, true, 'star select should succeed');
});

test('SQLQueryEngine - real executeAuthoritativeSystemTableRead local-leader path attaches witness, completeness, and authoritativeObservation', async (t) => {
  const readAuthority = buildControlPlaneReadAuthority({
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
    localReadConsistency: 'local_leader',
  });
  const localLeaderPartitionService = {
    appliedIndex: 31,
    commitIndex: 31,
    nodeId: 'test-node',
    partitionId: 'services-p1',
    raft: {
      commitIndex: 31,
      currentTerm: 4,
      getRole() {
        return 'leader';
      },
      lastApplied: 31,
    },
    replicaId: 'services-p1-r1',
    role: 'leader',
    buildRemoteReadAuthorityWitness() {
      return {
        appliedIndex: 31,
        commitIndex: 31,
        observedAtMs: 1700000000500,
        partitionId: 'services-p1',
        role: 'leader',
        servingNodeId: 'test-node',
        servingReplicaId: 'services-p1-r1',
        state: 'observed',
        term: 4,
      };
    },
    async executeLocalQuery() {
      return {
        rowSetComplete: true,
        rows: [{
          node_id: 'test-node',
          partition_id: 'services-p1',
          raft_role: 'leader',
          service_id: 'services-p1-r1',
          service_type: 'partition',
          status: 'active',
        }],
        success: true,
      };
    },
  };
  const realCdcService = {
    logger: {warn() {}, info() {}},
    nodeId: 'test-node',
    now: () => 1700000000500,
    partitionServicesProvider: () =>
      new Map([['services-p1', localLeaderPartitionService]]),
    systemTableCache: createMockSystemCache(),
    getPrimaryKeyField() {
      return 'service_id';
    },
    normalizeComparableCacheFieldValue(val) {
      return typeof val === 'number' ? val : null;
    },
    async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
      return executeAuthoritativeSystemTableRead(
        this,
        tableName,
        sql,
        params,
        options,
      );
    },
  };
  const engine = new SQLQueryEngine({
    cdcIntegrationService: realCdcService,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: {
      async deliver() {
        throw new Error('unexpected routed delivery');
      },
    },
    systemCache: createMockSystemCache(),
  });

  const result = await engine.executeQuery('SELECT * FROM services', [], {readAuthority});
  t.equal(result.success, true, 'real local-leader read should succeed');
  t.equal(result.rowSetComplete, true, 'real local-leader read should mark rowSetComplete');
  t.equal(result.readAuthorityWitness.role, 'leader', 'witness role should be leader');
  t.equal(result.readAuthorityWitness.appliedIndex, 31, 'witness appliedIndex should match leader');
  t.equal(result.readAuthorityWitness.commitIndex, 31, 'witness commitIndex should match leader');
  t.equal(result.readAuthorityWitness.term, 4, 'witness term should match leader');
  t.equal(result.readAuthorityWitnesses.length, 1, 'witness list should contain the serving leader witness');
  t.equal(
    result.authoritativeObservation.tableName,
    SYSTEM_TABLE_NAME.SERVICES,
    'authoritativeObservation should identify the table',
  );
  t.equal(
    result.authoritativeObservation.rowSetComplete,
    true,
    'authoritativeObservation should confirm rowSetComplete',
  );
  t.equal(
    result.authoritativeObservation.maxAppliedIndex,
    31,
    'authoritativeObservation should carry maxAppliedIndex from witness',
  );
  t.equal(
    result.authoritativeObservation.observedAtMs,
    1700000000500,
    'authoritativeObservation should carry observedAtMs from witness',
  );

  localLeaderPartitionService.buildRemoteReadAuthorityWitness = () => ({
    appliedIndex: 0,
    commitIndex: 0,
    observedAtMs: 1700000000500,
    partitionId: 'services-p1',
    role: 'leader',
    servingNodeId: 'test-node',
    servingReplicaId: 'services-p1-r1',
    state: 'observed',
    term: 0,
  });
  const unsealedResult = await engine.executeQuery(
    'SELECT * FROM services WHERE status = \'active\'',
    [], {readAuthority},
  );
  t.equal(
    unsealedResult.rowSetComplete,
    false,
    'zero-term witness must not seal rowSetComplete',
  );
  t.equal(
    unsealedResult.readAuthorityWitness,
    null,
    'zero-term witness must be rejected without synthesizing a fallback',
  );
  t.equal(
    unsealedResult.authoritativeObservation,
    null,
    'authoritativeObservation must remain null when witness is invalid',
  );

  // Restore valid leader witness and verify that omitted rowSetComplete or
  // non-empty failure collections never mint rowSetComplete: true or
  // authoritativeObservation.
  localLeaderPartitionService.buildRemoteReadAuthorityWitness = () => ({
    appliedIndex: 31,
    commitIndex: 31,
    observedAtMs: 1700000000500,
    partitionId: 'services-p1',
    role: 'leader',
    servingNodeId: 'test-node',
    servingReplicaId: 'services-p1-r1',
    state: 'observed',
    term: 4,
  });
  for (const incompletePayload of [
    {rows: [{service_id: 'services-p1-r1'}], success: true},
    {
      failedPartitions: ['services-p2'],
      rowSetComplete: true,
      rows: [{service_id: 'services-p1-r1'}],
      success: true,
    },
    {
      partitionErrors: [{partitionId: 'services-p2'}],
      rowSetComplete: true,
      rows: [{service_id: 'services-p1-r1'}],
      success: true,
    },
    {
      participantFailures: [{partitionId: 'services-p2'}],
      rowSetComplete: true,
      rows: [{service_id: 'services-p1-r1'}],
      success: true,
    },
  ]) {
    localLeaderPartitionService.executeLocalQuery = async () =>
      incompletePayload;
    const probeOut = await executeAuthoritativeSystemTableRead(
      realCdcService,
      SYSTEM_TABLE_NAME.SERVICES,
      'SELECT * FROM services',
      [],
      {readAuthority},
    );
    t.equal(probeOut.rowSetComplete, false);
    t.equal(probeOut.authoritativeObservation, null);
  }
});

test('QueryExecutorBase.executeSelect preserves participant rowSetComplete, readAuthorityWitness, and authoritativeObservation across admin envelope', async (t) => {
  const {QueryExecutor} = await import(
    '../../src/query/query-executor.js'
  );
  const {SQLParser} = await import('../../src/query/sql-parser.js');
  const {createAdminQueryResultMessageEnvelope} = await import(
    '../../src/admin/admin-query-result-message-envelope.js'
  );
  const witness = {
    appliedIndex: 12,
    commitIndex: 12,
    observedAtMs: 1700000000000,
    partitionId: 'services-p1',
    role: 'leader',
    servingNodeId: 'node-2',
    servingReplicaId: 'services-p1-r2',
    state: 'observed',
    term: 4,
  };
  const authoritativeObservation = {
    appliedIndex: 12,
    commitIndex: 12,
    observedAtMs: 1700000000000,
    partitionId: 'services-p1',
    rowSetComplete: true,
    scope: 'complete_table',
    servingNodeId: 'node-2',
    servingReplicaId: 'services-p1-r2',
    tableName: 'services',
    term: 4,
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: {},
    nodeId: 'node-1',
    nowFn: () => 1700000000000,
    systemCache: createMockSystemCache(),
  });
  executor.executeOnPartitions = async () => [{
    authoritativeObservation,
    partitionId: 'services-p1',
    readAuthorityWitness: witness,
    rowSetComplete: true,
    rows: [{
      node_id: 'node-2',
      partition_id: 'services-p1',
      raft_role: 'leader',
      service_id: 'services-p1-r2',
      service_type: 'partition',
      status: 'active',
    }],
    success: true,
  }];
  const routed = await executor.executeSelect(
    new SQLParser('SELECT * FROM services').parse(),
    ['services-p1'],
  );
  const envelope = createAdminQueryResultMessageEnvelope('q-routed', routed);
  t.equal(routed.rowSetComplete, true);
  t.same(routed.readAuthorityWitness, witness);
  t.same(routed.authoritativeObservation, authoritativeObservation);
  t.equal(envelope.rowSetComplete, true);
  t.same(envelope.readAuthorityWitness, witness);
  t.same(envelope.authoritativeObservation, authoritativeObservation);
});
