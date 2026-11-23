import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
  buildControlPlaneReadAuthority,
} from '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  executeAuthoritativeSystemTableRead,
} from '../../src/cdc/cdc-integration-service-authoritative-read-flow.js';
import {
  METADATA_AUTHORITY_REFRESH_OUTCOME,
  refreshTableRoutingMetadataFromAuthority,
} from '../../src/query/sql-query-engine-metadata-authority-refresh.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {TABLES} from '../../src/constants/index.js';

function createLeaderWitness(partitionId, servingNodeId, servingReplicaId) {
  return Object.freeze({
    state: 'observed',
    partitionId,
    servingNodeId,
    servingReplicaId,
    role: 'leader',
    term: 2,
    appliedIndex: 10,
    commitIndex: 10,
    observedAtMs: 1700000000000,
    leaderRead: Object.freeze({kind: 'leader_required'}),
  });
}

test('buildControlPlaneReadAuthority forbids any_replica fallback when leaderMode is REQUIRED', (t) => {
  const requiredDefault = buildControlPlaneReadAuthority({
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    localReadConsistency: CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
    replicaFallbackConsistency: CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  });
  t.equal(
    requiredDefault.localReadConsistency,
    CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
    'REQUIRED leader reads clamp localReadConsistency to local_leader',
  );
  t.equal(
    requiredDefault.replicaFallbackConsistency,
    null,
    'REQUIRED leader reads never allow any_replica follower fallback',
  );

  const requiredExplicitLocalLeader = buildControlPlaneReadAuthority({
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    localReadConsistency: CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
    replicaFallbackConsistency: CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  });
  t.equal(
    requiredExplicitLocalLeader.replicaFallbackConsistency,
    CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
    'REQUIRED leader reads preserve explicit local_leader fallback setting',
  );

  const anyLeader = buildControlPlaneReadAuthority({
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.ANY,
    replicaFallbackConsistency: CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  });
  t.equal(
    anyLeader.replicaFallbackConsistency,
    CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
    'non-REQUIRED reads retain any_replica fallback',
  );
  t.end();
});

test('leaderMode REQUIRED routes past a non-empty local follower so cold-table metadata refresh returns TABLE_NOT_FOUND', async (t) => {
  let followerQueryCount = 0;
  const followerReplica = {
    partitionId: 'services-p1',
    replicaId: 'services-p1-r2',
    role: 'follower',
    getRole: () => 'follower',
    executeLocalQuery: async () => {
      followerQueryCount += 1;
      return {
        success: true,
        rows: [{replica_id: 'r1', service_type: 'partition'}],
        rowSetComplete: true,
      };
    },
    buildRemoteReadAuthorityWitness: () => ({
      state: 'observed',
      partitionId: 'services-p1',
      servingNodeId: 'node-2',
      servingReplicaId: 'services-p1-r2',
      role: 'follower',
      term: 2,
      appliedIndex: 10,
      commitIndex: 10,
      observedAtMs: 1700000000000,
    }),
  };

  const remotePartitionsQueried = [];
  const cdc = {
    nodeId: 'node-2',
    logger: {warn() {}, info() {}, debug() {}, error() {}},
    getPrimaryKeyField: () => 'replica_id',
    partitionServicesProvider: () => new Map([['services-p1-r2', followerReplica]]),
    sqlQueryEngine: {
      queryExecutor: {
        executeOnPartition: async (partitionId) => {
          remotePartitionsQueried.push(partitionId);
          return {
            success: true,
            rows: partitionId === 'services-p1' ?
              [{replica_id: 'r1', service_type: 'partition'}] :
              [],
            rowSetComplete: true,
            readAuthorityWitness: createLeaderWitness(
              partitionId,
              'node-1',
              `${partitionId}-r1`,
            ),
          };
        },
      },
    },
    async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
      return executeAuthoritativeSystemTableRead(this, tableName, sql, params, options);
    },
  };

  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-2',
    getCdcIntegrationService: () => cdc,
  });

  const servicesRead = await gateway.readAuthoritativeRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_type = \'partition\'',
    [],
    {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    },
  );
  t.equal(followerQueryCount, 0, 'local follower must not be queried for leaderMode REQUIRED');
  t.equal(servicesRead.success, true);
  t.equal(servicesRead.localReadHit, false);
  t.equal(servicesRead.localReplicaFallbackHit, false);
  t.equal(servicesRead.rowSetComplete, true);
  t.equal(servicesRead.readAuthorityWitness?.role, 'leader');
  t.equal(servicesRead.readAuthorityWitness?.servingNodeId, 'node-1');

  const engine = {
    controlPlaneSystemTableGateway: gateway,
    cdcIntegrationService: cdc,
    systemCache: {getAll: () => [], get: () => null},
    getTableInfo: () => null,
    getTablePartitions: () => [],
  };
  const refreshOutcome = await refreshTableRoutingMetadataFromAuthority(
    engine,
    'history',
  );
  t.equal(
    refreshOutcome.outcome,
    METADATA_AUTHORITY_REFRESH_OUTCOME.ABSENT,
    'missing cold table returns ABSENT rather than ROUTING_METADATA_UNAVAILABLE',
  );
  t.equal(
    refreshOutcome.failure?.errorCode,
    QUERY_ERROR_CODE.TABLE_NOT_FOUND,
  );
  t.equal(followerQueryCount, 0, 'cold-table metadata refresh never reads local follower');
  t.ok(
    remotePartitionsQueried.includes('services-p1'),
    'services-p1 read routes to the authoritative leader',
  );
});

test('leaderMode REQUIRED routes to owner RPC if a local leader steps down before witness capture', async (t) => {
  const demotedReplica = {
    partitionId: 'services-p1',
    replicaId: 'services-p1-r2',
    role: 'leader',
    getRole: () => 'leader',
    executeLocalQuery: async () => ({
      success: true,
      rows: [{replica_id: 'r1', service_type: 'partition'}],
      rowSetComplete: true,
    }),
    // Stepped down before witness capture -> reports follower -> witness rejected
    buildRemoteReadAuthorityWitness: () => ({
      state: 'observed',
      partitionId: 'services-p1',
      servingNodeId: 'node-2',
      servingReplicaId: 'services-p1-r2',
      role: 'follower',
      term: 3,
      appliedIndex: 10,
      commitIndex: 10,
      observedAtMs: 1700000000000,
    }),
  };

  let ownerRpcCalled = false;
  const cdc = {
    nodeId: 'node-2',
    logger: {warn() {}, info() {}, debug() {}, error() {}},
    getPrimaryKeyField: () => 'replica_id',
    partitionServicesProvider: () => new Map([['services-p1-r2', demotedReplica]]),
    sqlQueryEngine: {
      queryExecutor: {
        executeOnPartition: async (partitionId) => {
          ownerRpcCalled = true;
          return {
            success: true,
            rows: [{replica_id: 'r1', service_type: 'partition'}],
            rowSetComplete: true,
            readAuthorityWitness: createLeaderWitness(
              partitionId,
              'node-3',
              'services-p1-r3',
            ),
          };
        },
      },
    },
    async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
      return executeAuthoritativeSystemTableRead(this, tableName, sql, params, options);
    },
  };

  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-2',
    getCdcIntegrationService: () => cdc,
  });

  const result = await gateway.readAuthoritativeRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_type = \'partition\'',
    [],
    {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    },
  );
  t.equal(ownerRpcCalled, true, 'un-witnessed local read must fall through to owner RPC');
  t.equal(result.success, true);
  t.equal(result.rowSetComplete, true);
  t.equal(result.readAuthorityWitness?.servingNodeId, 'node-3');
});
