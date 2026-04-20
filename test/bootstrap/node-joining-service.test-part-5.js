/**
 * Tests for Node Joining Service.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
  JoiningPhase,
} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReplicaHandlerSetup} from '../../src/bootstrap/shared/replica-handler-setup.js';
import {ControlPlaneSetup} from '../../src/bootstrap/shared/control-plane-setup.js';
import {
  PARTITION_SERVICE_ACTIVATION_ERROR,
} from '../../src/bootstrap/shared/partition-service-activation.js';
import {
  ControlPlaneKernelIngress,
} from '../../src/control-plane/control-plane-kernel-ingress.js';
import {
  JOIN_CHECKPOINT,
  JoinSessionStore,
} from '../../src/bootstrap/join-session-store.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
} from '../../src/bootstrap/node-joining-constants.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
  JOIN_PLAN_SEGMENT,
} from '../../src/bootstrap/bootstrap-constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  JOIN_PROMOTION_STATE,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
} from '../../src/bootstrap/join-promotion-state-owner.js';
import {WORK_CLASS} from '../../src/runtime/work-class-scheduler.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {
  CDC_OPERATION,
  COLUMN,
  ENDPOINT_STATUS,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {CDC_EVENT} from '../../src/cdc/cdc-constants.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {URL} from 'url';
import {EventEmitter} from 'events';

const DEFAULT_SEED_WS_ADDRESS =
  `ws://localhost:${8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET}`;
const NODES_ROUTING_PARTITION_ID = 'nodes-p1';
const REMOTE_CANONICAL_LEADER_NODE_ID = 'seed-node-1';
const REPORTER_FORWARD_NODE_ID = 'joiner-reporter-publication-mode';
const REPORTER_FORWARD_NODE_ADDRESS = 'ws://localhost:19103';
const REPORTER_FORWARD_SEED_ADDRESS = 'http://localhost:8080';
const REPORTER_FORWARD_HEARTBEAT_AT = 4242;
const REPORTER_FORWARD_READY_LEASE_AT = 8484;
const REPORTER_FORWARD_TARGET_ADDRESS = 'seed-node-1/message-group/mg-1-r3';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('NodeJoiningService - canonical readiness accepts local kernel ingress',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-local-ingress',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        groupId: 'mg-1',
        peerAddresses: ['seed-node/message-group/mg-1-r1'],
      },
    };
    service.messageRouter = {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    };
    service.messageGroupServices.set('mg-local-r1', {
      groupId: 'mg-1',
      unifiedAddress:
        'joining-node-local-ingress/message-group/mg-local-r1',
      isLeaderReplica: () => true,
      isMetadataIngressReady: () => true,
    });

    const snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({
        systemTableCache: new SystemTableCache(),
        tableName: TABLES.SERVICES,
      });

    t.equal(
      snapshot.controlPlaneTargetAddress,
      'joining-node-local-ingress/message-group/mg-local-r1',
      'local kernel ingress should be preferred for readiness checks',
    );
    t.equal(
      snapshot.routingReady,
      true,
      'local control-plane ingress should satisfy routing readiness',
    );
  },
);

test('NodeJoiningService - canonical readiness snapshot tracks active required node IDs',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-required-node-ids',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    const cache = new SystemTableCache();

    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.STATUS]: 'active',
    });
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'joining-node-required-node-ids',
      [COLUMN.STATUS]: 'active',
    });

    const snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({
        systemTableCache: cache,
        tableName: TABLES.SERVICES,
      });

    t.same(
      snapshot.requiredNodeIds.sort(),
      ['joining-node-required-node-ids', 'seed-node'],
      'canonical readiness snapshot should retain active node diagnostics',
    );
  });

test('NodeJoiningService - canonical readiness snapshot uses bootstrap topology metadata when cache is incomplete',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-topology-meta',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.bootstrapResponse = {
      currentEpoch: {
        epoch: 7,
        assignments: {},
        proposedBy: 'seed-node',
        timestamp: '1740000000000:1:seed-node',
      },
      topologySnapshotMeta: {
        topologyEpoch: 7,
        activeNodeIds: ['seed-node', 'joining-node-topology-meta'],
        hydrationTables: CACHE_HYDRATION_TABLES,
        tableRowCounts: {
          [TABLES.NODES]: 2,
        },
      },
      systemTableSnapshots: {
        nodes: [
          {[COLUMN.NODE_ID]: 'seed-node', [COLUMN.STATUS]: 'active'},
          {[COLUMN.NODE_ID]: 'joining-node-topology-meta', [COLUMN.STATUS]: 'active'},
        ],
      },
    };

    const snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({
        systemTableCache: new SystemTableCache(),
        tableName: TABLES.SERVICES,
      });

    t.same(
      snapshot.requiredNodeIds.sort(),
      ['joining-node-topology-meta', 'seed-node'],
      'required-node diagnostics should fall back to bootstrap topology metadata',
    );
    t.equal(
      snapshot.topologySnapshotEpoch,
      7,
      'snapshot diagnostics should include the bootstrap topology epoch',
    );
    t.equal(
      snapshot.appliedTopologyEpoch,
      0,
      'snapshot diagnostics should include the locally applied topology epoch',
    );
    t.equal(
      snapshot.snapshotRevision,
      7,
      'snapshot diagnostics should surface the bootstrap topology revision',
    );
    t.equal(
      snapshot.snapshotResumeToken,
      'control-plane-revision:topology_epoch:7',
      'snapshot diagnostics should expose the bootstrap resume token',
    );
  });

test('NodeJoiningService - canonical readiness snapshot surfaces behind revisions when topology metadata regresses',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-topology-regression',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.systemCacheHydrated = true;
    service.bootstrapTopologySnapshotHydratedAtMs = 1000;
    service.bootstrapTopologySnapshotMeta = {
      topologyEpoch: 7,
      activeNodeIds: ['seed-node', 'joining-node-topology-regression'],
    };

    const firstSnapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({
        systemTableCache: new SystemTableCache(),
        tableName: TABLES.SERVICES,
      });

    service.bootstrapTopologySnapshotMeta = {
      topologyEpoch: 6,
      activeNodeIds: ['seed-node', 'joining-node-topology-regression'],
    };

    const regressedSnapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({
        systemTableCache: new SystemTableCache(),
        tableName: TABLES.SERVICES,
      });

    t.equal(
      firstSnapshot.snapshotRevisionState,
      'current',
      'first observed snapshot should establish the current revision baseline',
    );
    t.equal(
      regressedSnapshot.snapshotRevisionState,
      'behind',
      'regressed topology metadata should surface an explicit behind-revision state',
    );
    t.equal(
      regressedSnapshot.snapshotExpectedMinimumRevision,
      7,
      'regressed snapshot diagnostics should preserve the required minimum revision',
    );
    t.equal(
      regressedSnapshot.snapshotRevisionGap,
      1,
      'regressed snapshot diagnostics should expose the missing revision gap',
    );
  });

test('NodeJoiningService - canonical join timeout preserves topology diagnostics',
  async (t) => {
    initializeTestEnvironment();

    let now = 0;
    const errorEvents = [];
    const service = new NodeJoiningService({
      nodeId: 'joining-node-join-gate-3',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      now: () => now,
      sleep: async (delayMs = 0) => {
        now += delayMs;
      },
      config: {
        joinReadinessTimeoutMs: 20,
        joinReadinessPollIntervalMs: 5,
      },
    });
    service.systemCacheHydrated = true;
    service.logger = {
      debug() {},
      info() {},
      warn() {},
      error(message, context) {
        errorEvents.push({message, context});
      },
    };
    service.joinReadinessSnapshotProvider = async () => ({
      routingReady: true,
      topologyReady: false,
      requiredSchemaVersion: '1740589945123:7:seed-1',
      appliedSchemaVersion: '1740589945123:7:seed-1',
      missingLeaders: {
        [TABLES.NODE_ENDPOINTS]: ['seed-node'],
      },
      inFlightReplicaOperations: 1,
      inFlightReplicaOperationDetails: [{
        operationId: 'op-1',
        type: 'MOVE_REPLICA',
        partitionId: 'services-p1',
        replicaId: 'services-p1-r2',
        sourceNodeId: 'seed-node',
        targetNodeId: 'joining-node-join-gate-3',
        status: 'pending',
        workflowStep: 'ASSIGNED',
        completedAt: null,
      }],
      missingNodeEndpointNodeIds: ['joining-node-join-gate-3'],
      missingPostgresWireNodeIds: ['seed-node'],
    });

    let thrownError = null;
    try {
      await service.joinReadinessEvaluator
        .waitForCanonicalJoinReadinessConvergence();
    } catch (error) {
      thrownError = error;
    }

    t.equal(thrownError?.code, 'JOIN_READINESS_TIMEOUT',
      'timeout should surface the canonical join readiness error code');
    t.same(
      thrownError?.joinReadiness?.missingNodeEndpointNodeIds,
      ['joining-node-join-gate-3'],
      'timeout should retain missing websocket endpoint diagnostics',
    );
    t.same(
      thrownError?.joinReadiness?.missingPostgresWireNodeIds,
      ['seed-node'],
      'timeout should retain missing postgres-wire diagnostics',
    );
    t.equal(
      thrownError?.joinReadiness?.inFlightReplicaOperations,
      1,
      'timeout should retain in-flight replica operation counts',
    );
    t.equal(
      thrownError?.joinReadiness?.timeoutKind,
      'no_progress',
      'timeout should classify stagnant readiness as no_progress',
    );
    t.same(
      thrownError?.joinReadiness?.inFlightReplicaOperationDetails,
      [{
        operationId: 'op-1',
        type: 'MOVE_REPLICA',
        partitionId: 'services-p1',
        replicaId: 'services-p1-r2',
        sourceNodeId: 'seed-node',
        targetNodeId: 'joining-node-join-gate-3',
        status: 'pending',
        workflowStep: 'ASSIGNED',
        completedAt: null,
      }],
      'timeout should retain in-flight replica operation details',
    );
    t.same(
      errorEvents.at(-1)?.context?.missingNodeEndpointNodeIds,
      ['joining-node-join-gate-3'],
      'timeout log should include missing websocket endpoint diagnostics',
    );
    t.same(
      errorEvents.at(-1)?.context?.missingPostgresWireNodeIds,
      ['seed-node'],
      'timeout log should include missing postgres-wire diagnostics',
    );
    t.equal(
      errorEvents.at(-1)?.context?.timeoutKind,
      'no_progress',
      'timeout log should classify stagnant readiness explicitly',
    );
  });

test('NodeJoiningService - canonical readiness blocked log includes control-plane diagnostics',
  async (t) => {
    initializeTestEnvironment();

    let now = 0;
    const warnEvents = [];
    const service = new NodeJoiningService({
      nodeId: 'joining-node-join-gate-blocked',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      now: () => now,
      sleep: async (delayMs = 0) => {
        now += delayMs;
      },
      config: {
        joinReadinessTimeoutMs: 6,
        joinReadinessPollIntervalMs: 2,
      },
    });
    service.systemCacheHydrated = true;
    service.logger = {
      debug() {},
      info() {},
      warn(message, context) {
        warnEvents.push({message, context});
      },
      error() {},
    };
    service.joinReadinessSnapshotProvider = async () => ({
      routingReady: false,
      topologyReady: false,
      requiredSchemaVersion: '1740589945123:7:seed-1',
      appliedSchemaVersion: '1740589945123:7:seed-1',
      missingNodeEndpointNodeIds: ['joining-node-join-gate-blocked'],
      missingPostgresWireNodeIds: ['seed-node'],
      controlPlaneTargetAddress: 'seed-node/message-group/mg-1-r1',
      controlPlaneTargetCandidates: [
        'joining-node-join-gate-blocked/message-group/mg-local-r1',
        'seed-node/message-group/mg-1-r1',
      ],
      controlPlaneTargetConnectionStates: {
        'joining-node-join-gate-blocked/message-group/mg-local-r1': 'self',
        'seed-node/message-group/mg-1-r1': STATE.DISCONNECTED,
      },
    });

    try {
      await service.joinReadinessEvaluator
        .waitForCanonicalJoinReadinessConvergence();
    } catch (_error) {
      // Expected timeout for the blocked readiness snapshot.
    }

    t.equal(
      warnEvents[0]?.message,
      JOINING_LOG_MSG.CANONICAL_READINESS_BLOCKED,
      'blocked canonical readiness should emit a progress log',
    );
    t.same(
      warnEvents[0]?.context?.reasons,
      ['routing_not_ready', 'topology_not_ready'],
      'blocked progress log should classify the current readiness reasons',
    );
    t.equal(
      warnEvents[0]?.context?.controlPlaneTargetAddress,
      'seed-node/message-group/mg-1-r1',
      'blocked progress log should include the selected control-plane target',
    );
    t.same(
      warnEvents[0]?.context?.controlPlaneTargetCandidates,
      [
        'joining-node-join-gate-blocked/message-group/mg-local-r1',
        'seed-node/message-group/mg-1-r1',
      ],
      'blocked progress log should include all target candidates',
    );
  });

test('NodeJoiningService - canonical readiness treats self target as unreachable until local query transport is ready',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-self-transport-gate',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          state: 'deferred',
          reason: 'Query/data-plane message-group transport is not configured',
          retryAfterMs: 100,
        };
      },
    };

    t.equal(
      service.joinReadinessEvaluator.isControlPlaneAddressReachable(
        'joining-node-self-transport-gate/message-group/mg-local-r1',
      ),
      false,
      'self target should stay ineligible while local query transport is deferred',
    );

    service.messageRouter.getQueryDataPlaneTransportReadiness = () => ({
      ready: true,
      state: 'ready',
    });

    t.equal(
      service.joinReadinessEvaluator.isControlPlaneAddressReachable(
        'joining-node-self-transport-gate/message-group/mg-local-r1',
      ),
      true,
      'self target should become reachable once local query transport is ready',
    );
    t.same(
      service.joinReadinessEvaluator.resolveControlPlaneTargetConnectionStates([
        'joining-node-self-transport-gate/message-group/mg-local-r1',
      ]),
      {
        'joining-node-self-transport-gate/message-group/mg-local-r1': 'self',
      },
      'diagnostics should report self once the local query transport is ready',
    );
  });

test('NodeJoiningService - canonical join readiness repairs endpoint visibility',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-join-gate-repair',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      sleep: async () => {},
      config: {
        joinReadinessTimeoutMs: 20,
        joinReadinessPollIntervalMs: 1,
      },
    });
    const cache = new SystemTableCache();
    const repairCalls = [];

    service.systemCacheHydrated = true;
    service.cdcIntegrationService = {sqlQueryEngine: {}};
    service.getMissingSystemServiceLeaders = () => ({});
    service.getBlockingSystemServiceLeaders = (missing) => missing;
    service.joinReadinessSnapshotProvider = async () => {
      return {
        ...service.joinReadinessEvaluator
          .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache}),
        routingReady: true,
        requiredSchemaVersion: '1740589945123:7:seed-1',
        appliedSchemaVersion: '1740589945123:7:seed-1',
      };
    };
    service.backfillPropagatedCacheTablesFromAuthoritativeState = async (tableNames) => {
      repairCalls.push(Array.isArray(tableNames) ? [...tableNames] : []);
      cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
        [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-join-gate-repair',
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
        [COLUMN.NODE_ID]: 'joining-node-join-gate-repair',
        health_status: 'healthy',
        [COLUMN.UPDATED_AT]: 3,
      });
    };

    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'joining-node-join-gate-repair',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'ep-joining-node-join-gate-repair-ws',
      [COLUMN.NODE_ID]: 'joining-node-join-gate-repair',
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.UPDATED_AT]: 2,
    });

    await service.joinReadinessEvaluator
      .waitForCanonicalJoinReadinessConvergence();

    t.equal(
      repairCalls.length,
      1,
      'canonical readiness should trigger one authoritative repair backfill',
    );
    t.ok(
      repairCalls[0].includes(TABLES.SERVICE_ENDPOINTS),
      'repair backfill should refresh service_endpoints visibility',
    );
    t.ok(
      repairCalls[0].includes(TABLES.NODE_ENDPOINTS),
      'repair backfill should include discovery-critical node endpoints',
    );
  });

test('NodeJoiningService - canonical join readiness snapshot waits for endpoint visibility',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-endpoint-gate',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    const cache = new SystemTableCache();

    service.getMissingSystemServiceLeaders = () => ({});
    service.getBlockingSystemServiceLeaders = (missing) => missing;

    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'joining-node-endpoint-gate',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });

    let snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
    t.equal(snapshot.topologyReady, false, 'topology should fail closed without endpoints');
    t.same(
      snapshot.missingNodeEndpointNodeIds,
      ['joining-node-endpoint-gate'],
      'topology should require websocket node endpoints for the joining node',
    );
    t.same(
      snapshot.missingPostgresWireNodeIds,
      ['joining-node-endpoint-gate'],
      'topology should require postgres-wire endpoints for the joining node',
    );

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'ep-joining-node-endpoint-gate-ws',
      [COLUMN.NODE_ID]: 'joining-node-endpoint-gate',
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
    });

    snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
    t.equal(snapshot.topologyReady, false, 'topology should wait for every active postgres endpoint');
    t.same(
      snapshot.missingPostgresWireNodeIds,
      ['joining-node-endpoint-gate'],
      'topology should identify nodes missing postgres-wire visibility',
    );

    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-endpoint-gate',
      [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
      [COLUMN.NODE_ID]: 'joining-node-endpoint-gate',
      health_status: 'healthy',
    });

    snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
    t.equal(snapshot.topologyReady, true, 'topology should become ready once endpoint visibility converges');
  });

test('NodeJoiningService - authoritative cache backfill closes the CDC blind window',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;
    const queriedTables = [];

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-backfill-gate',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });
      service.getMissingSystemServiceLeaders = () => ({});
      service.getBlockingSystemServiceLeaders = (missing) => missing;

      cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
        [COLUMN.NODE_ID]: 'seed-node',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      });
      cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
        [COLUMN.NODE_ID]: 'joining-node-backfill-gate',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      });
      cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
        [COLUMN.ENDPOINT_ID]: 'ep-seed-node-ws',
        [COLUMN.NODE_ID]: 'seed-node',
        [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
        [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
        [COLUMN.UPDATED_AT]: 2,
      });
      cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
        [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
        [COLUMN.NODE_ID]: 'seed-node',
        health_status: 'healthy',
        [COLUMN.UPDATED_AT]: 2,
      });

      service.cdcIntegrationService = {
        sqlQueryEngine: {
          executeQuery: async (sql) => {
            const tableName = sql.replace(/^SELECT \* FROM /, '');
            queriedTables.push(tableName);
            switch (tableName) {
            case TABLES.NODES:
              return {
                success: true,
                rows: cache.getAll(TABLES.NODES),
              };
            case TABLES.NODE_ENDPOINTS:
              return {
                success: true,
                rows: [
                  ...cache.getAll(TABLES.NODE_ENDPOINTS),
                  {
                    [COLUMN.ENDPOINT_ID]: 'ep-joining-node-backfill-gate-ws',
                    [COLUMN.NODE_ID]: 'joining-node-backfill-gate',
                    [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
                    [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
                    [COLUMN.UPDATED_AT]: 3,
                  },
                ],
              };
            case TABLES.SERVICE_ENDPOINTS:
              return {
                success: true,
                rows: [
                  ...cache.getAll(TABLES.SERVICE_ENDPOINTS),
                  {
                    [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-backfill-gate',
                    [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
                    [COLUMN.NODE_ID]: 'joining-node-backfill-gate',
                    health_status: 'healthy',
                    [COLUMN.UPDATED_AT]: 3,
                  },
                ],
              };
            default:
              return {success: true, rows: []};
            }
          },
        },
      };

      let snapshot = service.joinReadinessEvaluator
        .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
      t.equal(snapshot.topologyReady, false,
        'topology should fail before authoritative backfill restores missed rows');
      t.same(
        snapshot.missingNodeEndpointNodeIds,
        ['joining-node-backfill-gate'],
        'joining node websocket endpoint should be missing before backfill',
      );
      t.same(
        snapshot.missingPostgresWireNodeIds,
        ['joining-node-backfill-gate'],
        'joining node postgres-wire endpoint should be missing before backfill',
      );

      await service.backfillPropagatedCacheTablesFromAuthoritativeState();

      snapshot = service.joinReadinessEvaluator
        .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
      t.equal(snapshot.topologyReady, true,
        'topology should converge after authoritative backfill restores missed rows');
      t.ok(
        queriedTables.includes(TABLES.NODE_ENDPOINTS),
        'backfill should query node_endpoints authoritatively',
      );
      t.ok(
        queriedTables.includes(TABLES.SERVICE_ENDPOINTS),
        'backfill should query service_endpoints authoritatively',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - authoritative backfill merges divergent replica snapshots',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-replica-merge',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      const incompleteSeedRows = [
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-replica-merge',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'joining-node-replica-merge',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 10,
        },
      ];
      const replicaRowsA = [
        ...incompleteSeedRows,
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'seed-node',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 11,
        },
      ];
      const replicaRowsB = [
        ...incompleteSeedRows,
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-peer-node',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'peer-node',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 12,
        },
      ];

      service.messageRouter = {
        async deliver(address, payload) {
          t.equal(payload.type, 'QUERY', 'replica fanout should issue partition queries');
          t.equal(
            payload.sql,
            `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
            'replica fanout should query the propagated table directly',
          );
          if (address === 'seed/partition/service_endpoints-p1-r1') {
            return {
              acknowledged: true,
              success: true,
              rows: replicaRowsA,
            };
          }
          if (address === 'seed/partition/service_endpoints-p1-r2') {
            return {
              acknowledged: true,
              success: true,
              rows: replicaRowsB,
            };
          }
          throw new Error(`unexpected address ${address}`);
        },
      };

      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (sql === `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`) {
              return {
                success: true,
                rows: incompleteSeedRows,
              };
            }
            return {success: true, rows: []};
          },
          getTablePartitions(tableName) {
            if (tableName === TABLES.SERVICE_ENDPOINTS) {
              return [{partition_id: 'service_endpoints-p1'}];
            }
            return [];
          },
          queryExecutor: {
            getRoutablePartitionServices(partitionId) {
              if (partitionId !== 'service_endpoints-p1') {
                return [];
              }
              return [
                {
                  service_id: 'service_endpoints-p1-r1',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r1',
                },
                {
                  service_id: 'service_endpoints-p1-r2',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r2',
                },
              ];
            },
          },
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState();

      const endpointRows = cache.getAll(TABLES.SERVICE_ENDPOINTS);
      t.same(
        endpointRows
          .filter((row) => row.service_id === META_SERVICE_ID.POSTGRES_WIRE)
          .map((row) => row.node_id)
          .sort(),
        ['joining-node-replica-merge', 'peer-node', 'seed-node'],
        'replica fanout merge should recover rows hidden by a stale routed read',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - authoritative backfill canonicalizes ' +
  'control-plane publication rows before cache apply',
async (t) => {
  initializeTestEnvironment();

  const cache = new SystemTableCache();
  const originalGetNodeService = NodeService.getInstance;

  try {
    NodeService.getInstance = () => ({
      getSystemTableCache() {
        return cache;
      },
    });

    const service = new NodeJoiningService({
      nodeId: 'joining-node-publication-backfill',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.cdcIntegrationService = {
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (sql === `SELECT * FROM ${TABLES.CONTROL_PLANE_PUBLICATIONS}`) {
            return {
              success: true,
              rows: [{
                publicationId: 'publication-backfill-1',
                publicationKind: 'cluster_membership',
                publicationEpoch: 9,
                publisherNodeId: 'seed-node',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                requiredAckNodeIds: ['node-a', 'node-b'],
                acknowledgedNodeIds: ['node-a'],
                status: 'ack_pending',
                updatedAt: 25,
              }],
            };
          }
          return {success: true, rows: []};
        },
        getTablePartitions() {
          return [];
        },
        queryExecutor: {},
      },
    };

    await service.backfillPropagatedCacheTablesFromAuthoritativeState([
      TABLES.CONTROL_PLANE_PUBLICATIONS,
    ]);

    t.same(
      cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS),
      [{
        publication_id: 'publication-backfill-1',
        publication_kind: 'cluster_membership',
        publication_epoch: 9,
        publisher_node_id: 'seed-node',
        source_topology_epoch: null,
        source_snapshot_version: null,
        published_active_node_ids: ['node-a', 'node-b'],
        required_ack_node_ids: ['node-a', 'node-b'],
        acknowledged_node_ids: ['node-a'],
        priority_partition_summary: null,
        membership_lifecycle_summary: null,
        status: 'ACK_PENDING',
        reason_code: '',
        created_at: null,
        updated_at: 25,
        published_at: null,
        closed_at: null,
        transition_history: [],
      }],
      'authoritative backfill should persist publication rows in canonical cache shape',
    );
  } finally {
    NodeService.getInstance = originalGetNodeService;
  }
});

test(
  'NodeJoiningService - authoritative backfill preserves bootstrap snapshot rows',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-bootstrap-snapshot',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      const bootstrapSnapshotRows = [
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'seed-node',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 10,
        },
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-peer-node',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'peer-node',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 20,
        },
      ];
      service.bootstrapResponse = {
        systemTableSnapshots: {
          [TABLES.SERVICE_ENDPOINTS]: bootstrapSnapshotRows,
        },
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (sql === `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`) {
              return {
                success: true,
                rows: [bootstrapSnapshotRows[0]],
              };
            }
            return {success: true, rows: []};
          },
          getTablePartitions() {
            return [];
          },
          queryExecutor: {},
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState();

      const endpointRows = cache.getAll(TABLES.SERVICE_ENDPOINTS);
      t.same(
        endpointRows
          .filter((row) => row.service_id === META_SERVICE_ID.POSTGRES_WIRE)
          .map((row) => row.node_id)
          .sort(),
        ['peer-node', 'seed-node'],
        'bootstrap snapshot rows should survive a stale routed backfill query',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  },
);

test(
  'NodeJoiningService - blocking authoritative backfill prefers bootstrap snapshot over immediate live reread',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-snapshot-first',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      service.bootstrapResponse = {
        systemTableSnapshots: {
          [TABLES.SERVICE_ENDPOINTS]: [
            {
              [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
              [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
              [COLUMN.NODE_ID]: 'seed-node',
              health_status: 'healthy',
              [COLUMN.UPDATED_AT]: 10,
            },
          ],
        },
      };

      let routedReadCount = 0;
      const replicaDeliveries = [];
      service.messageRouter = {
        getOutboundPressureSummary() {
          return {
            backpressured: false,
            saturatedNodeCount: 0,
            totalPending: 0,
            maxPendingUtilization: 0,
          };
        },
        async deliver(address, payload, options) {
          replicaDeliveries.push({address, payload, options});
          return {
            acknowledged: true,
            success: true,
            rows: [],
          };
        },
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery() {
            routedReadCount += 1;
            return {
              success: true,
              rows: [],
            };
          },
          getTablePartitions() {
            return [{partition_id: 'service_endpoints-p1'}];
          },
          queryExecutor: {
            getRoutablePartitionServices() {
              return [
                {
                  service_id: 'service_endpoints-p1-r1',
                  partition_id: 'service_endpoints-p1',
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r1',
                },
              ];
            },
          },
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState([
        TABLES.SERVICE_ENDPOINTS,
      ]);

      t.equal(
        routedReadCount,
        0,
        'blocking backfill should not immediately reread a table already covered by bootstrap snapshot',
      );
      t.equal(
        replicaDeliveries.length,
        0,
        'blocking backfill should not fan out to replicas when bootstrap snapshot already covers the table',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  },
);

test('NodeJoiningService - authoritative backfill coalesces concurrent identical requests',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-backfill-single-flight',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      let executeCount = 0;
      let releaseQuery = null;
      const queryGate = new Promise((resolve) => {
        releaseQuery = resolve;
      });
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql) {
            executeCount += 1;
            t.equal(
              sql,
              `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
              'single-flight test should query the requested propagated table',
            );
            await queryGate;
            return {
              success: true,
              rows: [],
            };
          },
          getTablePartitions() {
            return [];
          },
          queryExecutor: {},
        },
      };

      const firstBackfill = service
        .backfillPropagatedCacheTablesFromAuthoritativeState([
          TABLES.SERVICE_ENDPOINTS,
        ]);
      const secondBackfill = service
        .backfillPropagatedCacheTablesFromAuthoritativeState([
          TABLES.SERVICE_ENDPOINTS,
        ]);

      await new Promise((resolve) => setTimeout(resolve, 0));

      t.equal(
        executeCount,
        1,
        'concurrent identical backfill requests should share one in-flight owner path',
      );

      releaseQuery();
      await Promise.all([firstBackfill, secondBackfill]);
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });
