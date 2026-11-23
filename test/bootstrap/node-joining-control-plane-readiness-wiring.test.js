import {test} from '../../src/test-helpers/tap.js';
import {
  StartupRuntimeSurfaceOwner,
} from '../../src/bootstrap/shared/startup-runtime-surface-owner.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const USER_PARTITION = 'tbl-158d72a693768b167f58caab324339b7-p1';
const USER_TABLE = 'warehouse';
const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const TX_ID = 'a'.repeat(32);

function createUserPartitionCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.TABLES, CDC_OPERATION.INSERT, {
    table_id: USER_TABLE,
    table_name: USER_TABLE,
    schema_version: 1,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    partition_id: USER_PARTITION,
    table_id: USER_TABLE,
    table_name: USER_TABLE,
    leader_node_id: NODE_2,
    state: 'normal',
  });
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    service_id: `${USER_PARTITION}-r1`,
    replica_id: `${USER_PARTITION}-r1`,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: USER_PARTITION,
    node_id: NODE_1,
    address: `${NODE_1}/partition/${USER_PARTITION}`,
    status: SERVICE_STATUS.ACTIVE,
  });
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    service_id: `${USER_PARTITION}-r2`,
    replica_id: `${USER_PARTITION}-r2`,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: USER_PARTITION,
    node_id: NODE_2,
    address: `${NODE_2}/partition/${USER_PARTITION}`,
    status: SERVICE_STATUS.ACTIVE,
  });
  return cache;
}

test('StartupRuntimeSurfaceOwner binds rebalanceCoordinator onto early ' +
  'cdcIntegrationService.sqlQueryEngine when control plane initializes', async (t) => {
  const cache = new SystemTableCache();
  const earlyEngine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: {nodeId: NODE_1, deliver: async () => null},
    nodeId: NODE_1,
    rebalanceCoordinator: null,
    controlPlaneReadinessService: null,
    migrationAutoWire: false,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true,
  });
  t.teardown(async () => {
    await earlyEngine.shutdown();
  });

  t.equal(earlyEngine.controlPlaneReadinessService, null,
    'precondition: early join engine starts without controlPlaneReadinessService');
  t.equal(earlyEngine.queryExecutor.controlPlaneReadinessService, null,
    'precondition: early join QueryExecutor starts without controlPlaneReadinessService');

  const readinessService = createCommittedServeEligibilityOwner();
  const rebalanceCoordinator = {
    id: 'rebalance-coordinator-join',
    controlPlaneReadinessService: readinessService,
  };
  const joinOwner = {
    sqlQueryEngine: null,
    cdcIntegrationService: {sqlQueryEngine: earlyEngine},
    rebalanceCoordinator,
  };
  const surfaceOwner = new StartupRuntimeSurfaceOwner({
    delegates: {
      getOwner: () => joinOwner,
      getTablePolicyService: () => null,
      getRebalanceCoordinator: () => joinOwner.rebalanceCoordinator,
      getMessageGroupServices: () => new Map(),
      getPartitionServices: () => new Map(),
    },
  });

  surfaceOwner.bindControlPlaneServices();

  t.equal(earlyEngine.rebalanceCoordinator, rebalanceCoordinator,
    'early join SQLQueryEngine must receive rebalanceCoordinator upon bindControlPlaneServices');
  t.equal(earlyEngine.controlPlaneReadinessService, readinessService,
    'early join SQLQueryEngine must receive controlPlaneReadinessService upon bindControlPlaneServices');
  t.equal(earlyEngine.queryExecutor.controlPlaneReadinessService, readinessService,
    'early join QueryExecutor must receive controlPlaneReadinessService upon bindControlPlaneServices');
});

test('NodeJoiningService wires readiness and topology owner onto early ' +
  'cdcIntegrationService.sqlQueryEngine during join infrastructure setup', async (t) => {
  const cache = new SystemTableCache();
  NodeService.resetInstance();
  const nodeService = NodeService.getInstance();
  nodeService.systemTableCache = cache;
  t.teardown(() => {
    NodeService.resetInstance();
  });

  const joiningService = new NodeJoiningService({
    nodeId: NODE_1,
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeAddress: '127.0.0.1:9001',
    seedNodeAddress: '127.0.0.1:9002',
    dataDir: '/tmp/lagrange-join-readiness-wiring-test',
  });
  joiningService.seedNodeId = NODE_2;
  joiningService.messageRouter = {
    nodeId: NODE_1,
    deliver: async () => null,
    getConnectionState: () => 'connected',
    getConnectedNodes: () => [NODE_2],
  };
  const cdcIntegrationService = joiningService.createCdcIntegrationService();
  const earlyEngine = cdcIntegrationService.sqlQueryEngine;
  t.teardown(async () => {
    await earlyEngine.shutdown();
  });

  t.ok(earlyEngine.queryExecutor.bootstrapTopologySnapshotOwner,
    'early join SQLQueryEngine must have bootstrapTopologySnapshotOwner wired');

  const readinessService = createCommittedServeEligibilityOwner();
  joiningService.rebalanceCoordinator = {
    controlPlaneReadinessService: readinessService,
  };
  joiningService.runtimeSurfaceOwner.bindControlPlaneServices();

  t.equal(earlyEngine.controlPlaneReadinessService, readinessService,
    'NodeJoiningService bindControlPlaneServices must propagate controlPlaneReadinessService');
  t.equal(earlyEngine.queryExecutor.controlPlaneReadinessService, readinessService,
    'NodeJoiningService QueryExecutor must receive controlPlaneReadinessService');
});

test('TX1 post-admission settlement (COMMIT/ROLLBACK/TRANSACTION_OUTCOME) to user ' +
  'partitions is not blocked by unavailable or deferred readiness during DURABLE_REJOIN, ' +
  'while BEGIN/PREPARE still enforce serve eligibility', async (t) => {
  const cache = createUserPartitionCache();
  const deliveredOps = [];
  const messageRouter = {
    nodeId: NODE_1,
    getConnectionState: () => 'connected',
    getConnectedNodes: () => [NODE_2],
    async deliver(address, request) {
      deliveredOps.push({address, operation: request.operation});
      const base = {
        operation: request.operation,
        partitionId: USER_PARTITION,
        transactionId: request.transactionId,
        participantId: request.participantId,
        success: true,
        durable: true,
      };
      if (request.operation === QUERY_OPERATION.COMMIT) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          ...base,
          state: 'COMMITTED',
          outcome: 'COMMITTED',
        });
      }
      if (request.operation === QUERY_OPERATION.ROLLBACK) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          ...base,
          state: 'ROLLED_BACK',
          outcome: 'NOT_COMMITTED',
        });
      }
      return buildDeliveryEnvelope({acknowledged: true}, {
        ...base,
        state: 'COMMITTED',
        outcome: 'COMMITTED',
      });
    },
  };

  // Sub-case 1: controlPlaneReadinessService denies controlPlaneRecoveryEligible
  // (e.g. nodes-p1 / control_plane_publications-p1 paused waiting on sql_transactions-p1).
  const denyingReadiness = {
    getControlPlaneParticipationSync: () => ({
      eligible: false,
      failedDimensions: Object.freeze([
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      ]),
      reasonCodes: Object.freeze(['completed_record_absent']),
      snapshot: null,
      summary: null,
    }),
    answerServeEligibility: () => ({
      state: 'ineligible',
      eligible: false,
      reason: 'not_ready',
    }),
  };

  for (const [label, readinessService] of [
    ['deferred controlPlaneRecoveryEligible', denyingReadiness],
    ['null controlPlaneReadinessService', null],
  ]) {
    deliveredOps.length = 0;
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter,
      nodeId: NODE_1,
      controlPlaneReadinessService: readinessService,
      defaultRoutingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      migrationAutoWire: false,
      autoStartDistributedTransactionRecovery: false,
      unrefRetryDelayTimers: true,
    });
    engine.queryExecutor.queryTimeoutMs = 150;
    engine.queryExecutor.maxRetries = 1;
    t.teardown(async () => {
      await engine.shutdown();
    });

    for (const op of [
      QUERY_OPERATION.COMMIT,
      QUERY_OPERATION.ROLLBACK,
      QUERY_OPERATION.TRANSACTION_OUTCOME,
    ]) {
      const answer = await engine.deliverTransactionOperation(
        'release-session',
        USER_PARTITION,
        op,
        {
          transactionId: TX_ID,
          participantId: `${TX_ID}:${USER_PARTITION}`,
          commitMode: 'TWO_PHASE_COMMIT',
          transactionEpoch: 1,
          decision: op === QUERY_OPERATION.ROLLBACK ? 'ROLLBACK' : 'COMMIT',
          decisionDigest: 'd'.repeat(64),
          decisionText: '{}',
        },
      );
      t.equal(answer.success, true,
        `${label}: post-admission ${op} must deliver to user partition leader`);
    }

    // Admission operations (BEGIN / PREPARE) must STILL fail closed when serve-ineligible!
    await t.rejects(
      engine.deliverTransactionOperation(
        'client-session',
        USER_PARTITION,
        QUERY_OPERATION.BEGIN,
        {
          transactionId: TX_ID,
          participantId: `${TX_ID}:${USER_PARTITION}`,
          commitMode: 'TWO_PHASE_COMMIT',
          transactionEpoch: 1,
        },
      ),
      `${label}: BEGIN must remain gated by serve eligibility`,
    );
    await t.rejects(
      engine.deliverTransactionOperation(
        'client-session',
        USER_PARTITION,
        QUERY_OPERATION.PREPARE,
        {
          transactionId: TX_ID,
          participantId: `${TX_ID}:${USER_PARTITION}`,
          commitMode: 'TWO_PHASE_COMMIT',
          transactionEpoch: 1,
        },
      ),
      `${label}: PREPARE must remain gated by serve eligibility`,
    );
  }
});
