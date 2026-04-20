/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {BOOTSTRAP_READINESS_STAGE} from '../../src/bootstrap/bootstrap-readiness-ladder.js';
import {LIFECYCLE_REASON} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {STARTUP_RECOVERY_STAGE} from '../../src/bootstrap/startup-recovery-coordinator.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createEmptySystemTableCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

function createSatisfiedControlPlaneReadinessService() {
  const diagnostics = Object.freeze({
    publicationEpoch: 1,
    status: 'PUBLISHED',
    priorityPartitionSummary: Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: 5,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    }),
  });
  return {
    async getMembershipPublicationDiagnostics() {
      return diagnostics;
    },
    getMembershipPublicationDiagnosticsSync() {
      return diagnostics;
    },
  };
}

function createMutableControlPlaneReadinessService(initialDiagnostics) {
  let diagnostics = initialDiagnostics;
  return {
    setDiagnostics(nextDiagnostics) {
      diagnostics = nextDiagnostics;
    },
    async getMembershipPublicationDiagnostics() {
      return diagnostics;
    },
    getMembershipPublicationDiagnosticsSync() {
      return diagnostics;
    },
  };
}

function createPriorityRecoveryAuthorityControlPlaneReadinessService() {
  return {
    getPriorityControlPlaneRecoveryHealthSync() {
      return {
        healthy: false,
        reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        details: {
          recoveryProtocolState: 'publication_pending',
          priorityRecoveryReasonCodes: [
            CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
            CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
          ],
          targetParticipation: {
            nodeId: 'seed-node-1',
            state: 'recovery_pending_publish',
          },
        },
      };
    },
    getStartupAuthoritySnapshotSync() {
      return {
        state: 'seed_locally_ready_unpublished',
        ready: false,
        authorityAvailable: true,
        publication: {
          observationState: 'unpublished',
        },
        priorityPartition: {
          state: 'available',
          summary: {
            satisfied: false,
            missingPartitionIds: ['replica_operations-p1'],
          },
        },
        recoveryProtocol: {
          state: 'known',
          value: 'publication_pending',
        },
        targetParticipationDetail: {
          state: 'available',
          participation: {
            nodeId: 'seed-node-1',
            state: 'recovery_pending_publish',
          },
        },
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        canonicalStartupNodeIds: ['seed-node-1'],
        failure: {
          state: 'none',
        },
        publicationObservationState: 'unpublished',
      };
    },
    getMembershipPublicationDiagnosticsSync() {
      return {
        publicationEpoch: 14,
        status: 'ACK_PENDING',
      };
    },
  };
}

test('BootstrapAPI - readiness stays gated until startup dependencies and stable window complete',
  async (t) => {
    initializeTestEnvironment();

    const bootstrapService = {
      phase: BOOTSTRAP_PHASE.INFRASTRUCTURE,
    };

    const readinessCache = {
      get() {
        return null;
      },
      filter() {
        return [];
      },
      find() {
        return null;
      },
      getReadyNodes() {
        return [];
      },
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'partition-1',
            table_name: TABLES.NODES,
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{
            group_id: 'mg-1',
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [
            {
              service_id: 'partition-1-leader',
              service_type: SERVICE_TYPE.PARTITION,
              partition_id: 'partition-1',
              node_id: 'seed-node-1',
              address: 'seed-node-1/partition/partition-1-leader',
              raft_role: RAFT_ROLE.LEADER,
              status: SERVICE_STATUS.ACTIVE,
            },
            {
              service_id: 'mg-1-leader',
              service_type: SERVICE_TYPE.MESSAGE_GROUP,
              group_id: 'mg-1',
              node_id: 'seed-node-1',
              address: 'seed-node-1/message-group/mg-1-leader',
              raft_role: RAFT_ROLE.LEADER,
              status: SERVICE_STATUS.ACTIVE,
            },
          ];
        }
        return [];
      },
    };

    let nowMs = 1000;
    const readinessState = new BootstrapReadinessState({
      readyStableWindowMs: 50,
      demotionFailureThreshold: 2,
      now: () => nowMs,
      retryAfterMs: 250,
    });

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: readinessCache,
      bootstrapService,
      readinessState,
      controlPlaneReadinessService: createSatisfiedControlPlaneReadinessService(),
    });

    await api.initialize(0, {listen: false});

    let response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should stay unavailable while bootstrap phase is incomplete');
    let body = JSON.parse(response.body);
    t.ok(body.reasons.includes('BOOTSTRAP_PHASE_INCOMPLETE'),
      'should expose bootstrap-phase blocker while startup incomplete');

    bootstrapService.phase = BOOTSTRAP_PHASE.COMPLETE;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should remain unavailable while SQL engine is missing');
    body = JSON.parse(response.body);
    t.ok(body.reasons.includes(BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE),
      'should expose SQL engine blocker before routing is available');

    api.setSqlQueryEngine({executeQuery: async () => ({success: true})});
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should remain unavailable while runtime wiring is incomplete');
    body = JSON.parse(response.body);
    t.ok(body.reasons.includes(BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY),
      'should expose runtime-wiring blocker before message router is present');

    api.messageRouter = {};
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should require sustained success window before promotion');
    body = JSON.parse(response.body);
    t.ok(body.reasons.includes('READINESS_STABLE_WINDOW_PENDING'),
      'should report stable-window pending before promotion threshold elapses');

    nowMs += 60;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 200,
      'readyz should promote after sustained success window elapses');
    body = JSON.parse(response.body);
    t.equal(body.ready, true, 'readyz should expose ready=true after promotion');

    await api.shutdown();
  });

test('BootstrapAPI - readyz demotes immediately when priority recovery regresses',
  async (t) => {
    initializeTestEnvironment();

    const readinessCache = {
      get() {
        return null;
      },
      filter() {
        return [];
      },
      find() {
        return null;
      },
      getReadyNodes() {
        return [];
      },
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'partition-1',
            table_name: TABLES.NODES,
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{
            group_id: 'mg-1',
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'partition-1-leader',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'partition-1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/partition/partition-1-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          }];
        }
        return [];
      },
    };

    const readinessState = new BootstrapReadinessState({
      readyStableWindowMs: 0,
      demotionFailureThreshold: 2,
      now: () => Date.now(),
      retryAfterMs: 250,
    });
    const controlPlaneReadinessService = createMutableControlPlaneReadinessService({
      publicationEpoch: 4,
      status: 'PUBLISHED',
      priorityPartitionSummary: {
        satisfied: true,
        requiredDistinctNodeCount: 3,
        readyEligibleNodeCount: 3,
        totalPriorityPartitionCount: 5,
        missingPartitionIds: [],
        blockedPartitions: [],
      },
    });
    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: readinessCache,
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
      },
      readinessState,
      sqlQueryEngine: {executeQuery: async () => ({success: true})},
      controlPlaneReadinessService,
      messageRouter: {},
    });
    await api.initialize(0, {listen: false});

    let response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 200,
      'readyz should start healthy while priority spread is satisfied');

    controlPlaneReadinessService.setDiagnostics({
      publicationEpoch: 5,
      status: 'PUBLISHED',
      priorityPartitionSummary: {
        satisfied: false,
        requiredDistinctNodeCount: 3,
        readyEligibleNodeCount: 5,
        totalPriorityPartitionCount: 7,
        missingPartitionIds: [
          'replica_operations-p1',
        ],
        blockedPartitions: [
          {
            partitionId: 'replica_operations-p1',
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          },
        ],
      },
    });

    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should demote immediately when priority recovery becomes pending');
    const body = JSON.parse(response.body);
    t.ok(
      body.reasons.includes(LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING),
      'readyz should expose priority recovery blocker on first regressed probe',
    );

    await api.shutdown();
  });

test('BootstrapAPI - readyz blocks on local query transport readiness before promotion',
  async (t) => {
    initializeTestEnvironment();

    const readinessCache = {
      get() {
        return null;
      },
      filter() {
        return [];
      },
      find() {
        return null;
      },
      getReadyNodes() {
        return [];
      },
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'partition-1',
            table_name: TABLES.NODES,
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{
            group_id: 'mg-1',
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'partition-1-leader',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'partition-1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/partition/partition-1-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          }];
        }
        return [];
      },
    };

    let nowMs = 1000;
    let localTransportReady = false;
    const readinessState = new BootstrapReadinessState({
      readyStableWindowMs: 50,
      demotionFailureThreshold: 2,
      now: () => nowMs,
      retryAfterMs: 250,
    });

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: readinessCache,
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
      },
      readinessState,
      sqlQueryEngine: {executeQuery: async () => ({success: true})},
      controlPlaneReadinessService: createSatisfiedControlPlaneReadinessService(),
      messageRouter: {
        getQueryDataPlaneTransportReadiness() {
          return localTransportReady ?
            {ready: true, state: 'ready'} :
            {
              ready: false,
              state: 'deferred',
              reason: 'Query/data-plane message-group transport is not configured',
              retryAfterMs: 75,
            };
        },
      },
    });

    await api.initialize(0, {listen: false});

    let response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should stay unavailable while local query transport is deferred');
    let body = JSON.parse(response.body);
    t.ok(
      body.reasons.includes(LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY),
      'readyz should expose the local query transport blocker',
    );

    localTransportReady = true;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should still honor the stable window after transport recovers');
    body = JSON.parse(response.body);
    t.ok(
      body.reasons.includes(LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING),
      'readyz should move from transport gating into the stable window',
    );

    nowMs += 60;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 200,
      'readyz should promote once local query transport is ready and the stable window elapses');
    body = JSON.parse(response.body);
    t.equal(body.ready, true, 'readyz should expose ready=true after promotion');

    await api.shutdown();
  });

test('BootstrapAPI - readyz treats unknown local query transport state as not ready',
  async (t) => {
    initializeTestEnvironment();

    const readinessCache = {
      get() {
        return null;
      },
      filter() {
        return [];
      },
      find() {
        return null;
      },
      getReadyNodes() {
        return [];
      },
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'partition-1',
            table_name: TABLES.NODES,
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{
            group_id: 'mg-1',
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'partition-1-leader',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'partition-1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/partition/partition-1-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          }];
        }
        return [];
      },
    };

    let nowMs = 1000;
    let localTransportState = 'unknown';
    const readinessState = new BootstrapReadinessState({
      readyStableWindowMs: 50,
      demotionFailureThreshold: 2,
      now: () => nowMs,
      retryAfterMs: 250,
    });

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: readinessCache,
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
      },
      readinessState,
      sqlQueryEngine: {executeQuery: async () => ({success: true})},
      controlPlaneReadinessService: createSatisfiedControlPlaneReadinessService(),
      messageRouter: {
        getQueryDataPlaneTransportReadiness() {
          if (localTransportState === 'ready') {
            return {ready: true, state: 'ready'};
          }
          if (localTransportState === 'deferred') {
            return {
              ready: false,
              state: 'deferred',
              reason: 'Query/data-plane message-group transport is not configured',
              retryAfterMs: 75,
            };
          }
          return {
            state: 'unknown',
          };
        },
      },
    });

    await api.initialize(0, {listen: false});

    let response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should stay unavailable while local query transport readiness is unknown');
    let body = JSON.parse(response.body);
    t.ok(
      body.reasons.includes(LIFECYCLE_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY),
      'readyz should block on unknown local query transport state',
    );

    localTransportState = 'ready';
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 503,
      'readyz should still honor the stable window after transport becomes explicitly ready');
    body = JSON.parse(response.body);
    t.ok(
      body.reasons.includes(LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING),
      'readyz should move into the stable window once explicit transport readiness arrives',
    );

    nowMs += 60;
    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 200,
      'readyz should promote only after explicit local query transport readiness and stable-window completion');

    await api.shutdown();
  });

test('BootstrapAPI - transitions probes to draining non-ready state during shutdown',
  async (t) => {
    initializeTestEnvironment();

    const drainDeadlineMs = Date.now() + 5000;
    const readySnapshot = {
      ready: true,
      phase: 'TRAFFIC_READY',
      state: 'join_ready',
      reasons: [],
      retryAfterMs: 0,
      timestamp: Date.now(),
      draining: false,
      drainDeadlineMs: null,
    };
    const drainingSnapshot = {
      ready: false,
      phase: 'DEGRADED',
      state: 'degraded',
      reasons: ['NODE_DRAINING'],
      retryAfterMs: 100,
      timestamp: Date.now(),
      draining: true,
      drainDeadlineMs,
    };
    let draining = false;
    const readinessState = {
      evaluate() {
        return draining ? drainingSnapshot : readySnapshot;
      },
      getSnapshot() {
        return draining ? drainingSnapshot : readySnapshot;
      },
      beginDrain() {
        draining = true;
        return drainingSnapshot;
      },
      recordProbeResult() {},
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-drain',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
      },
      readinessState,
      messageRouter: {},
      sqlQueryEngine: {executeQuery: async () => ({success: true})},
    });

    await api.initialize(0, {listen: false});

    let response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(response.statusCode, 200,
      'readyz should be healthy before draining signal');

    api.markDraining({
      drainDeadlineMs,
      reasonCode: 'NODE_DRAINING',
    });

    response = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    const body = JSON.parse(response.body);
    t.equal(response.statusCode, 503,
      'readyz should become non-ready after draining signal');
    t.equal(body.draining, true,
      'readyz payload should expose draining=true during shutdown');
    t.equal(body.drainDeadlineMs, drainDeadlineMs,
      'readyz payload should include drain deadline');
    t.ok(body.reasons.includes('NODE_DRAINING'),
      'readyz payload should include node-draining reason');

    await api.shutdown();
  });

test('BootstrapAPI - bootstrap validation', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  // Test missing nodeId
  let response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for missing nodeId');
  let body = JSON.parse(response.body);
  t.ok(body.error.includes('nodeId'), 'error should mention nodeId');

  // Test invalid nodeId
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: 'invalid-uuid', nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for invalid nodeId');
  body = JSON.parse(response.body);
  t.ok(body.error.includes('UUID'), 'error should mention UUID');

  // Test missing nodeAddress
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: '550e8400-e29b-41d4-a716-446655440000'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for missing nodeAddress');
  body = JSON.parse(response.body);
  t.ok(body.error.includes('nodeAddress'), 'error should mention nodeAddress');

  await api.shutdown();
});

test('BootstrapAPI - liveness remains true while readiness degrades on repeated control writes',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      bootstrapService: {
        phase: BOOTSTRAP_PHASE.COMPLETE,
        messageRouter: {},
      },
      readinessState: new BootstrapReadinessState(),
      controlPlaneWriteHealthProvider: () => ({
        healthy: false,
        reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        details: {
          source: 'heartbeat_service',
          consecutiveFailures: 5,
          failureThreshold: 3,
        },
      }),
    });

    await api.initialize(0, {listen: false});
    api.setSqlQueryEngine({executeQuery: async () => ({success: true})});
    api.getLeaderReadinessStatusForProbe = () => ({ready: true});

    const liveResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/livez',
    });
    t.equal(liveResponse.statusCode, 200,
      'liveness should stay green despite control-plane write degradation');

    const readyResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/readyz',
    });
    t.equal(readyResponse.statusCode, 503,
      'readiness should degrade when control-plane write failures persist');
    const readyBody = JSON.parse(readyResponse.body);
    t.equal(readyBody.ready, false, 'readyz should expose degraded readiness');
    t.ok(
      Array.isArray(readyBody.reasons) &&
        readyBody.reasons.includes(LIFECYCLE_REASON.OBSERVABILITY_BACKLOG),
      'readiness should include structured control-plane degradation reason',
    );

    await api.shutdown();
  });

test('BootstrapAPI - bootstrap conflict detection', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache that tracks registered nodes
  const registeredNodes = new Map();
  const mockSystemTableCache = {
    get(tableName, key) {
      if (tableName === 'nodes') {
        return registeredNodes.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === 'nodes') {
        return Array.from(registeredNodes.values());
      }
      return [];
    },
    getReadyNodes() {
      return [];
    },
    // Helper to simulate node registration (via CDC in production)
    _registerNode(nodeId, nodeAddress) {
      registeredNodes.set(nodeId, {node_id: nodeId, node_address: nodeAddress});
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // First bootstrap should succeed
  const nodeId = '550e8400-e29b-41d4-a716-446655440000';
  let response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'first bootstrap should succeed');

  // Simulate the node being registered via CDC (in production this happens via system table)
  mockSystemTableCache._registerNode(nodeId, 'ws://localhost:9090');

  // Second bootstrap with same nodeId should fail
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9091'},
  });

  t.equal(response.statusCode, 409, 'duplicate nodeId should return 409');
  const body = JSON.parse(response.body);
  t.ok(body.error.includes('already registered'), 'error should mention already registered');

  // Bootstrap with seed node ID should fail
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: 'seed-node-1',
      nodeAddress: 'ws://localhost:9092',
    },
  });

  // seed-node-1 is not a valid UUID, so it should fail validation first
  t.equal(response.statusCode, 400, 'seed node ID should fail validation');

  await api.shutdown();
});

test('BootstrapAPI - returns bootstrap not ready before touching cache', async (t) => {
  initializeTestEnvironment();

  const readinessSnapshot = {
    ready: false,
    state: 'bootstrapping',
    reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
    retryAfterMs: 350,
    timestamp: Date.now(),
  };
  const readinessState = {
    evaluate() {
      return readinessSnapshot;
    },
    getSnapshot() {
      return readinessSnapshot;
    },
    recordProbeResult() {},
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: null,
    bootstrapService: {
      phase: BOOTSTRAP_PHASE.INFRASTRUCTURE,
    },
    readinessState,
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440010',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 503,
    'should return 503 while bootstrap service is not complete');
  const body = JSON.parse(response.body);
  t.equal(body.error, BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
    'should return bootstrap not ready error');
  t.equal(body.code, BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    'should include bootstrap-not-ready pipeline code');
  t.equal(body.phase, BOOTSTRAP_PHASE.INFRASTRUCTURE,
    'should include current bootstrap phase');
  t.equal(body.retryAfterMs, 350,
    'should include retry hint while bootstrap is not ready');
  t.same(body.reasons, ['BOOTSTRAP_PHASE_INCOMPLETE'],
    'should include machine-readable blocker reasons');

  await api.shutdown();
});

test('BootstrapAPI - defers concurrent bootstrap requests when admission is saturated',
  async (t) => {
    initializeTestEnvironment();

    let releaseFirstRequest = null;
    const firstRequestGate = new Promise((resolve) => {
      releaseFirstRequest = resolve;
    });

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      maxConcurrentBootstrapRequests: 1,
      bootstrapAdmissionRetryAfterMs: 250,
    });

    api.waitForServiceLeaders = async () => ({ready: true});
    api.determineAndReserveMessageGroupAssignment = async (nodeId) => {
      if (nodeId === '550e8400-e29b-41d4-a716-446655440011') {
        await firstRequestGate;
      }
      return {
        strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-test',
      };
    };
    api.getCurrentEpoch = () => null;
    api.getClusterConfiguration = () => ({});
    api.getReadyNodes = () => [];
    api.getTablePolicies = () => ({});
    api.getLatencyTopologyHints = () => null;

    await api.initialize(0, {listen: false});

    const firstRequestPromise = api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440011',
        nodeAddress: 'ws://localhost:9091',
      },
    });

    for (let attempt = 0; attempt < 20; attempt++) {
      if (api.inFlightBootstrapRequestCount === 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    t.equal(api.inFlightBootstrapRequestCount, 1,
      'first bootstrap request should occupy the single admission slot');

    const deferredResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440012',
        nodeAddress: 'ws://localhost:9092',
      },
    });

    t.equal(deferredResponse.statusCode, 503,
      'concurrent bootstrap request should be deferred');
    const deferredBody = JSON.parse(deferredResponse.body);
    t.equal(
      deferredBody.error,
      BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      'deferred request should use the canonical bootstrap-not-ready error',
    );
    t.equal(
      deferredBody.code,
      BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      'deferred request should use the canonical bootstrap-not-ready code',
    );
    t.equal(
      deferredBody.retryAfterMs,
      250,
      'deferred request should include the configured retry hint',
    );
    t.ok(
      deferredBody.reasons.includes('JOIN_ADMISSION_BACKPRESSURED'),
      'deferred request should expose the admission backpressure reason',
    );

    releaseFirstRequest();
    const firstResponse = await firstRequestPromise;
    t.equal(firstResponse.statusCode, 200,
      'original bootstrap request should complete once the slot is released');
    t.equal(api.inFlightBootstrapRequestCount, 0,
      'bootstrap admission count should return to zero after completion');

    const subsequentResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440013',
        nodeAddress: 'ws://localhost:9093',
      },
    });
    t.equal(subsequentResponse.statusCode, 200,
      'later bootstrap requests should be admitted after the slot frees');

    await api.shutdown();
  });

test('BootstrapAPI - returns bootstrap-not-ready when control-plane dependencies are transiently unavailable',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
    });

    api.waitForServiceLeaders = async () => ({ready: true});
    api.determineAndReserveMessageGroupAssignment = async () => ({
      strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
      groupId: 'mg-test',
    });
    api.buildBootstrapTopologySnapshotEnvelope = () => ({
      systemTableSnapshots: {},
      topologySnapshotMeta: null,
    });
    api.getClusterConfiguration = () => ({});
    api.getReadyNodes = () => {
      throw new Error(
        'ControlPlaneSystemTableGateway requires cdcIntegrationService',
      );
    };
    api.getTablePolicies = () => ({});
    api.getLatencyTopologyHints = () => null;

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440013',
        nodeAddress: 'ws://localhost:9093',
      },
    });

    t.equal(response.statusCode, 503,
      'transient control-plane dependency gaps should defer bootstrap');
    const body = JSON.parse(response.body);
    t.equal(body.error, BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      'response should use the canonical bootstrap-not-ready error');
    t.equal(body.code, BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      'response should preserve the canonical bootstrap-not-ready code');
    t.equal(body.retryAfterMs, 1000,
      'response should include the bounded retry hint');
    t.ok(
      body.reasons.includes(
        BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
      ),
      'response should expose the control-plane dependency blocker',
    );

    await api.shutdown();
  });

test('BootstrapAPI - forwards durable rejoin startup mode to assignment',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
    });

    api.waitForServiceLeaders = async () => ({ready: true});
    let observedOptions = null;
    api.determineAndReserveMessageGroupAssignment = async (_nodeId, options) => {
      observedOptions = options;
      return {
        strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-test',
        replicaCount: 3,
      };
    };
    api.getCurrentEpoch = () => null;
    api.getClusterConfiguration = () => ({});
    api.getReadyNodes = () => [];
    api.getTablePolicies = () => ({});
    api.getLatencyTopologyHints = () => null;

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440111',
        nodeAddress: 'ws://localhost:9091',
        startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      },
    });

    t.equal(response.statusCode, 200);
    t.same(observedOptions, {
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
  });

test('BootstrapAPI - releases bootstrap admission slot after request failure',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      maxConcurrentBootstrapRequests: 1,
      bootstrapAdmissionRetryAfterMs: 250,
    });

    api.waitForServiceLeaders = async () => ({ready: true});
    let shouldFail = true;
    api.determineAndReserveMessageGroupAssignment = async () => {
      if (shouldFail) {
        throw new Error('simulated bootstrap failure');
      }
      return {
        strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-test',
      };
    };
    api.getCurrentEpoch = () => null;
    api.getClusterConfiguration = () => ({});
    api.getReadyNodes = () => [];
    api.getTablePolicies = () => ({});
    api.getLatencyTopologyHints = () => null;

    await api.initialize(0, {listen: false});

    const failedResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440014',
        nodeAddress: 'ws://localhost:9094',
      },
    });
    t.equal(failedResponse.statusCode, 500,
      'failing bootstrap request should still surface the underlying error');
    t.equal(api.inFlightBootstrapRequestCount, 0,
      'bootstrap admission slot should be released after failure');

    shouldFail = false;
    const recoveryResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440015',
        nodeAddress: 'ws://localhost:9095',
      },
    });
    t.equal(recoveryResponse.statusCode, 200,
      'subsequent bootstrap request should succeed after a failed request');

    await api.shutdown();
  });

test('BootstrapAPI - returns bootstrap not ready while partition leaders are still settling', async (t) => {
  initializeTestEnvironment();

  const mockSystemTableCache = {
    getAll(tableName) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'partition-1',
          table_name: 'nodes',
        }];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{
          group_id: 'mg-1',
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [{
          service_id: 'svc-1',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: 'partition-1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        }];
      }
      return [];
    },
    get() {
      return null;
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440000',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 503,
    'should block bootstrap admission while partition leader metadata is incomplete');
  const body = JSON.parse(response.body);
  t.equal(body.success, false, 'should return the canonical not-ready bootstrap envelope');
  t.equal(body.leaderReadiness.ready, false,
    'should expose degraded leader readiness in the bootstrap response');
  t.equal(body.leaderReadiness.missingPartitionLeaders[0], 'partition-1',
    'should report missing partition leader diagnostics');
  t.equal(body.leaderReadiness.missingMessageGroupLeaders[0], 'mg-1',
    'should report missing message-group leader diagnostics');

  await api.shutdown();
});
