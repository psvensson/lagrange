import t from 'tap';
import {
  NodeJoiningReadySignalReadiness,
} from '../../src/bootstrap/node-joining-ready-signal-readiness.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  isTerminalStep,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  createTimeoutTestCoordinator,
} from '../rebalancer/timeout-test-coordinator.js';
import {
  isLedgerQuorumConcentratedPartition,
} from '../../src/rebalancer/operation-ledger-hold-policy.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  isRetryableControlPlaneError,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  buildStartupAuthoritySnapshotFromPlanningAnswer,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

function createReadySignalOwner({formationBarrier, heartbeatCalls}) {
  const owner = Object.create(NodeJoiningReadySignalReadiness.prototype);
  owner.nodeId = 'joining-node';
  owner.config = {
    readySignalMaxAttempts: 1,
    readySignalRetryDelayMs: 1,
    readySignalRetryMaxDelayMs: 1,
    readySignalRetryBackoffMultiplier: 1,
  };
  owner.logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  owner.sleep = async () => {};
  owner.awaitCdcSubscriptionsForReadiness = async () => {};
  owner.runBackgroundCdcCatchupAfterSubscription = () => {};
  owner.awaitLocalQueryTransportReadinessForReadySignal = async () => {};
  owner.awaitMetadataPublicationReadinessForReadySignal = async () => {};
  owner.awaitOperationLedgerFormationBarrier = async () => {
    await formationBarrier.promise;
  };
  owner.getNodeCapabilities = () => [];
  owner.heartbeatService = {
    sendHeartbeat: async () => {
      heartbeatCalls.push('heartbeat');
    },
  };
  return owner;
}

const LEDGER_PARTITION_ID = 'replica_operations-p1';
const SEED_NODE_ID = 'seed-node';
const JOINER_1_NODE_ID = 'joining-node';
const JOINER_2_NODE_ID = 'joining-node-2';
const JOINER_3_NODE_ID = 'joining-node-3';
const JOINER_4_NODE_ID = 'joining-node-4';
const JOINER_NODE_IDS = Object.freeze([
  JOINER_1_NODE_ID,
  JOINER_2_NODE_ID,
  JOINER_3_NODE_ID,
  JOINER_4_NODE_ID,
]);

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function applyRow(cache, tableName, record) {
  cache.applySystemTableChange(tableName, 'INSERT', record);
}

function buildFormationCache() {
  const cache = new SystemTableCache();
  const now = Date.now();
  for (const [nodeId, connectionState] of [
    [SEED_NODE_ID, 'ready'],
    [JOINER_1_NODE_ID, 'connected'],
    [JOINER_2_NODE_ID, 'connected'],
    [JOINER_3_NODE_ID, 'connected'],
    [JOINER_4_NODE_ID, 'connected'],
  ]) {
    applyRow(cache, 'nodes', {
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE,
      connection_state: connectionState,
      last_heartbeat: now,
      ready_lease_expires_at:
        nodeId === SEED_NODE_ID ? now + 60000 : null,
    });
  }
  applyRow(cache, 'partitions', {
    partition_id: LEDGER_PARTITION_ID,
    table_id: 'replica_operations',
    replica_count: 3,
  });
  for (const [index, raftRole] of [
    [1, 'leader'],
    [2, 'follower'],
    [3, 'follower'],
  ]) {
    applyRow(cache, 'services', {
      service_id: `${LEDGER_PARTITION_ID}-r${index}`,
      replica_id: `${LEDGER_PARTITION_ID}-r${index}`,
      partition_id: LEDGER_PARTITION_ID,
      node_id: SEED_NODE_ID,
      service_type: REBALANCER_ENTITY_TYPE.PARTITION,
      status: ReplicaStatus.ACTIVE,
      raft_role: raftRole,
    });
  }
  return cache;
}

function buildOwnerDerivedStartupAuthoritySnapshot() {
  const now = 1000;
  const planningAnswer = deriveMembershipPublicationCandidate({
    publisherNodeId: SEED_NODE_ID,
    sourceTopologyEpoch: 1,
    sourceSnapshotVersion: 1,
    nowMs: now,
    latestPublicationRow: {
      publication_epoch: 1,
      status: 'PUBLISHED',
      published_active_node_ids: [SEED_NODE_ID],
      required_ack_node_ids: [SEED_NODE_ID],
      acknowledged_node_ids: [SEED_NODE_ID],
      priority_partition_summary: {
        satisfied: false,
        missingPartitionIds: [LEDGER_PARTITION_ID],
      },
    },
    nodeRows: [
      {
        node_id: SEED_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        connection_state: 'ready',
        last_heartbeat: now,
        ready_lease_expires_at: now + 60000,
      },
      {
        node_id: JOINER_1_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        connection_state: 'connected',
        last_heartbeat: now,
        ready_lease_expires_at: null,
      },
      {
        node_id: JOINER_2_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        connection_state: 'connected',
        last_heartbeat: now,
        ready_lease_expires_at: null,
      },
      {
        node_id: JOINER_3_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        connection_state: 'connected',
        last_heartbeat: now,
        ready_lease_expires_at: null,
      },
      {
        node_id: JOINER_4_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        connection_state: 'connected',
        last_heartbeat: now,
        ready_lease_expires_at: null,
      },
    ],
    readinessEntries: [],
    connectedNodeIds: JOINER_NODE_IDS,
  });
  return {
    planningAnswer,
    startupAuthority:
      buildStartupAuthoritySnapshotFromPlanningAnswer(planningAnswer),
  };
}

function buildFormationBarrierOwner({
  cache,
  coordinator = null,
  sleep,
  now,
  startupMode = STARTUP_JOIN_MODE.FRESH_JOIN,
  startupAuthority: providedStartupAuthority = null,
}) {
  NodeService.getInstance().setSystemCacheProxy(cache);
  const owner = Object.create(NodeJoiningReadySignalReadiness.prototype);
  owner.nodeId = JOINER_1_NODE_ID;
  owner.startupMode = startupMode;
  owner.config = {
    priorityPlacementFormationDiscoveryMs: 0,
    priorityPlacementFormationPollMs: 1,
    priorityPlacementFormationTimeoutMs: 100,
    heartbeatIntervalMs: 10,
  };
  owner.now = now;
  owner.sleep = sleep;
  owner.logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  owner.messageRouter = {
    getConnectionState: () => 'connected',
  };
  const {startupAuthority: defaultStartupAuthority} =
    buildOwnerDerivedStartupAuthoritySnapshot();
  const startupAuthority =
    providedStartupAuthority || defaultStartupAuthority;
  const readinessService =
    coordinator?.controlPlaneReadinessService || {};
  readinessService.getStartupAuthoritySnapshotSync = () => startupAuthority;
  owner.rebalanceCoordinator = coordinator || {
    controlPlaneReadinessService: readinessService,
  };
  owner.getNodeCapabilities = () => ['partition_replica'];
  owner.sendControlPlaneNodeStateUpdate = async () => {};
  return owner;
}

function currentLedgerReplicas(cache) {
  return cache.filter(
    'services',
    (row) => row.partition_id === LEDGER_PARTITION_ID,
  );
}

function buildRealLedgerPlanner(cache, trackedOperations) {
  const provider = {
    systemTableCache: cache,
    getAvailableNodes: () => cache.getAll('nodes'),
    getCurrentReplicas: () => currentLedgerReplicas(cache),
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () =>
      [...trackedOperations.values()].filter(
        (operation) =>
          !isTerminalStep(operation.type, operation.workflow_step),
      ),
    getTopologyBlockingInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    getPartitionDescriptorEpochEvidence: () => null,
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
  return new MovePlanner({
    entityId: LEDGER_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: provider,
  });
}

async function executeLedgerFormationTick({
  cache,
  coordinator,
  executionState,
  planner,
  events,
}) {
  if (executionState.pendingOperation) {
    await coordinator.completeOperation(
      executionState.pendingOperation.operation,
    );
    executionState.pendingOperation = null;
    return;
  }
  const replicas = currentLedgerReplicas(cache);
  const targetState = await planner.calculateTargetState(replicas, {
    targetReplicaCount: 3,
    placementConstraints: {
      spreadAcrossNodes: true,
    },
  });
  const moves = planner.calculateMoves(replicas, targetState);
  const move = moves[0] || null;
  if (!move) {
    throw new Error(
      `Expected a real ledger formation move, got ${JSON.stringify(moves)}`,
    );
  }
  const operation = await coordinator.createOperation({
    type: move.type,
    partitionId: LEDGER_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    entityId: LEDGER_PARTITION_ID,
    nodeId: move.nodeId,
    replicaId:
      move.type === REBALANCER_MOVE_TYPE.ADD ?
        `${LEDGER_PARTITION_ID}-r4` :
        move.replicaId,
    sourceNodeId: move.sourceNodeId,
  });

  const sourceReplicaId = move.sourceReplicaId || move.replicaId;
  if (move.type === REBALANCER_MOVE_TYPE.REPLACE) {
    const sourceRow = cache.get('services', sourceReplicaId);
    cache.applySystemTableChange('services', 'UPDATE', {
      ...sourceRow,
      node_id: move.nodeId,
    });
  } else if (move.type === REBALANCER_MOVE_TYPE.ADD) {
    const targetReplicaId = operation.replicaId;
    applyRow(cache, 'services', {
      service_id: targetReplicaId,
      replica_id: targetReplicaId,
      partition_id: LEDGER_PARTITION_ID,
      node_id: move.nodeId,
      service_type: REBALANCER_ENTITY_TYPE.PARTITION,
      status: ReplicaStatus.ACTIVE,
      raft_role: 'follower',
    });
  } else if (move.type === REBALANCER_MOVE_TYPE.REMOVE) {
    cache.applySystemTableChange('services', 'DELETE', {
      service_id: sourceReplicaId,
    });
  } else {
    throw new Error(`Unexpected ledger formation move ${move.type}`);
  }
  events.push({
    type: move.type,
    targetNodeId: move.nodeId,
    operationId: operation.operationId,
    concentratedAfterPhysicalMove:
      isLedgerQuorumConcentratedPartition(cache, LEDGER_PARTITION_ID),
    terminalAtPhysicalSpread: isTerminalStep(
      operation.type,
      operation.workflowStep,
    ),
    joinersPublicReady: cache
      .filter('nodes', (node) => node.node_id !== SEED_NODE_ID)
      .some((node) => Number.isFinite(node.ready_lease_expires_at)),
  });
  executionState.pendingOperation = {move, operation};
}

t.test(
  'production membership and startup-authority owners include connected ' +
    'pre-lease joiners only in the open priority-recovery cohort',
  async (t) => {
    const {planningAnswer, startupAuthority} =
      buildOwnerDerivedStartupAuthoritySnapshot();

    t.same(
      planningAnswer.projectionDiagnostics.livenessFallbackIncludedNodeIds,
      [...JOINER_NODE_IDS, SEED_NODE_ID].sort(),
      'fresh active+connected registration rows enter the bounded recovery projection',
    );
    t.equal(
      startupAuthority.authorityAvailable,
      true,
      'the canonical startup owner remains available while priority spread is pending',
    );
    t.same(
      startupAuthority.canonicalStartupNodeIds,
      [...JOINER_NODE_IDS, SEED_NODE_ID].sort(),
      'the barrier and priority rebalancer consume the same owner-authored cohort',
    );
    t.notOk(
      startupAuthority.ready,
      'owner-derived startup recovery does not imply public readiness',
    );
  },
);

t.test(
  'an engaged formation barrier renews CONNECTED liveness across the ' +
    'projection expiry window without publishing a READY lease',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    let now = 0;
    const livenessPublications = [];
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async (delayMs) => {
        now += delayMs;
      },
    });
    owner.config.priorityPlacementFormationPollMs = 30000;
    owner.config.priorityPlacementFormationTimeoutMs = 120000;
    owner.config.heartbeatIntervalMs = 10000;
    owner.sendControlPlaneNodeStateUpdate = async (publication) => {
      livenessPublications.push(publication);
    };
    owner.getOperationLedgerFormationBarrierSnapshot = async () => ({
      now,
      partitionId: LEDGER_PARTITION_ID,
      targetReplicaCount: 3,
      observedVoterCount: 3,
      observationComplete: true,
      spreadProofComplete: true,
      concentrated: now < 90000,
      spreadConcentrated: now < 90000,
      authoritativePlacementComplete: true,
      authoritativePlacementConcentrated: now < 90000,
      authoritativePlacementDistinctNodeCount: now < 90000 ? 2 : 3,
      authoritativePlacementObservedVoterCount: 3,
      authoritativePlacementSource: 'owner_rpc_lane',
      operationObservationComplete: now >= 90000,
      operationObservationState: now >= 90000 ? 'present' : null,
      inFlightOperationCount: now >= 90000 ? 0 : null,
      candidateNodeIds: Object.freeze([
        SEED_NODE_ID,
        ...JOINER_NODE_IDS,
      ]),
      preReadyCandidateNodeIds: Object.freeze([...JOINER_NODE_IDS]),
    });

    try {
      await owner.awaitOperationLedgerFormationBarrier();

      t.same(
        livenessPublications.map((publication) => publication.heartbeatAt),
        [0, 30000, 60000],
        'the waiting owner refreshes liveness throughout a barrier longer than the 60-second projection grace',
      );
      t.ok(
        livenessPublications.every(
          (publication) =>
            publication.state === 'connected' &&
            publication.heartbeatOnly === true &&
            publication.readyLeaseExpiresAt === undefined &&
            publication.nodeStatePublicationMode ===
              CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
        ),
        'formation publications stay on the critical liveness lane without carrying a ready lease',
      );

      const lastHeartbeatAt =
        livenessPublications[livenessPublications.length - 1].heartbeatAt;
      const remotePlanningAnswer = deriveMembershipPublicationCandidate({
        publisherNodeId: JOINER_4_NODE_ID,
        sourceTopologyEpoch: 1,
        sourceSnapshotVersion: 2,
        nowMs: now,
        latestPublicationRow: {
          publication_epoch: 1,
          status: 'PUBLISHED',
          published_active_node_ids: [SEED_NODE_ID],
          required_ack_node_ids: [SEED_NODE_ID],
          acknowledged_node_ids: [SEED_NODE_ID],
          priority_partition_summary: {
            satisfied: false,
            missingPartitionIds: [LEDGER_PARTITION_ID],
          },
        },
        nodeRows: [
          {
            node_id: SEED_NODE_ID,
            status: ReplicaStatus.ACTIVE,
            connection_state: 'ready',
            last_heartbeat: now,
            ready_lease_expires_at: now + 60000,
          },
          {
            node_id: JOINER_1_NODE_ID,
            status: ReplicaStatus.ACTIVE,
            connection_state: 'connected',
            last_heartbeat: lastHeartbeatAt,
            ready_lease_expires_at: null,
          },
          {
            node_id: JOINER_4_NODE_ID,
            status: ReplicaStatus.ACTIVE,
            connection_state: 'connected',
            last_heartbeat: now,
            ready_lease_expires_at: null,
          },
        ],
        readinessEntries: [],
        connectedNodeIds: [SEED_NODE_ID, JOINER_4_NODE_ID],
      });
      const remoteStartupAuthority =
        buildStartupAuthoritySnapshotFromPlanningAnswer(
          remotePlanningAnswer,
        );

      t.ok(
        remoteStartupAuthority.canonicalStartupNodeIds.includes(
          JOINER_1_NODE_ID,
        ),
        'a later remote ledger owner retains the refreshed pre-ready joiner in its canonical recovery cohort',
      );
    } finally {
      NodeService.resetInstance();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

t.test(
  'join finalization keeps the public ready lease closed until the operation ' +
    'ledger formation barrier releases',
  async (t) => {
    const formationBarrier = deferred();
    const heartbeatCalls = [];
    const owner = createReadySignalOwner({
      formationBarrier,
      heartbeatCalls,
    });

    const readySignal = owner.signalReadyForReplicas();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      heartbeatCalls.length,
      0,
      'the ACTIVE/ready heartbeat is not published while ledger placement is concentrated',
    );

    formationBarrier.resolve();
    await readySignal;

    t.equal(
      heartbeatCalls.length,
      1,
      'the normal heartbeat publication resumes after ledger concentration closes',
    );
  },
);

t.test(
  'real placement and coordinator owners use one ledger REPLACE then ' +
    'expand-drain before the join barrier permits public readiness',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    const fixture = createTimeoutTestCoordinator();
    fixture.coordinator.systemTableCache = cache;
    // The priority surplus REMOVE placement fence only admits the drain when
    // the strict owner-RPC services lane proves current placement, so the
    // authoritative owner answers from the live formation cache.
    const gateway = fixture.coordinator.controlPlaneSystemTableGateway;
    const baseReadAuthoritativeRows =
      gateway.readAuthoritativeRows.bind(gateway);
    gateway.readAuthoritativeRows = async (tableName, sql, params, options) => {
      if (
        tableName === 'services' &&
        options?.authoritativeReadMode ===
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED
      ) {
        return {
          success: true,
          source: 'owner_rpc_lane',
          rows: currentLedgerReplicas(cache),
        };
      }
      return baseReadAuthoritativeRows(tableName, sql, params, options);
    };
    const planner = buildRealLedgerPlanner(
      cache,
      fixture.trackedOperations,
    );
    const events = [];
    const executionState = {pendingOperation: null};
    let now = 1000;
    const owner = buildFormationBarrierOwner({
      cache,
      coordinator: fixture.coordinator,
      now: () => now,
      sleep: async (delayMs) => {
        await executeLedgerFormationTick({
          cache,
          coordinator: fixture.coordinator,
          executionState,
          planner,
          events,
        });
        now += delayMs;
      },
    });

    try {
      await owner.awaitOperationLedgerFormationBarrier();

      t.equal(
        events.length,
        3,
        'the concentrated 3/0/0 shape uses REPLACE, ADD, then safe REMOVE',
      );
      t.same(
        events.map((event) => event.type),
        [
          REBALANCER_MOVE_TYPE.REPLACE,
          REBALANCER_MOVE_TYPE.ADD,
          REBALANCER_MOVE_TYPE.REMOVE,
        ],
        'the real owners avoid a second exclusive ledger REPLACE',
      );
      t.equal(
        events[1].concentratedAfterPhysicalMove,
        true,
        'the unchanged four-voter quorum floor keeps 2-1-1 concentrated',
      );
      t.equal(
        events[2].concentratedAfterPhysicalMove,
        false,
        'standalone-safe REMOVE releases concentration at 1-1-1',
      );
      t.notOk(
        events.some((event) => event.terminalAtPhysicalSpread),
        'the regression preserves production DELETE-before-terminal ordering',
      );
      t.notOk(
        events.some((event) => event.joinersPublicReady),
        'no joiner exposes a ready lease while formation work is running',
      );
      const spreadNodeIds = new Set(
        currentLedgerReplicas(cache).map((row) => row.node_id),
      );
      t.equal(
        spreadNodeIds.size,
        3,
        'the actual services rows finish at one ledger voter per node',
      );
      t.ok(
        spreadNodeIds.has(SEED_NODE_ID),
        'the count-neutral cure keeps one ledger voter on the seed',
      );
      t.equal(
        [...fixture.trackedOperations.values()].filter(
          (operation) =>
            !isTerminalStep(operation.type, operation.workflow_step),
        ).length,
        0,
        'all durable coordinator operations are terminal before release',
      );
    } finally {
      await fixture.coordinator.shutdown();
      NodeService.resetInstance();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

t.test(
  'an intentionally two-node cohort bypasses the three-voter formation ' +
    'barrier instead of deadlocking join readiness',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    for (const nodeId of JOINER_NODE_IDS.slice(1)) {
      cache.applySystemTableChange('nodes', 'DELETE', {node_id: nodeId});
    }
    let now = 2000;
    let sleepCalls = 0;
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async (delayMs) => {
        sleepCalls++;
        now += delayMs;
      },
    });

    try {
      await owner.awaitOperationLedgerFormationBarrier();
      t.equal(
        sleepCalls,
        0,
        'discovery expiry bypasses immediately when fewer than three live startup-authority nodes exist',
      );
    } finally {
      NodeService.resetInstance();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

t.test(
  'sequential third-node growth bypasses the cold-wave barrier when the other ' +
    'two nodes already have public ready leases',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    const now = Date.now();
    for (const nodeId of JOINER_NODE_IDS.slice(1)) {
      cache.applySystemTableChange('nodes', 'UPDATE', {
        ...cache.get('nodes', nodeId),
        ready_lease_expires_at: now + 60000,
      });
    }
    let sleepCalls = 0;
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async () => {
        sleepCalls++;
      },
    });

    try {
      await owner.awaitOperationLedgerFormationBarrier();
      t.equal(
        sleepCalls,
        0,
        'one pre-ready joiner retains the ordinary ready-then-rebalance growth path',
      );
    } finally {
      NodeService.resetInstance();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

t.test(
  'durable rejoin bypasses a cold-formation cohort made solely from two ' +
    'temporarily pre-ready canonical peers',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    const createOwner = (startupMode) => {
      let now = 2500;
      let snapshotCalls = 0;
      const owner = buildFormationBarrierOwner({
        cache,
        startupMode,
        now: () => now,
        sleep: async (delayMs) => {
          now += delayMs;
        },
      });
      owner.config.priorityPlacementFormationTimeoutMs = 2;
      owner.getOperationLedgerFormationBarrierSnapshot = async () => {
        snapshotCalls++;
        return Object.freeze({
          now,
          partitionId: LEDGER_PARTITION_ID,
          targetReplicaCount: 3,
          observedVoterCount: 2,
          observationComplete: false,
          spreadProofComplete: false,
          concentrated: null,
          spreadConcentrated: null,
          authoritativePlacementComplete: false,
          authoritativePlacementConcentrated: null,
          authoritativePlacementDistinctNodeCount: 0,
          authoritativePlacementObservedVoterCount: 0,
          authoritativePlacementSource: null,
          operationObservationComplete: false,
          operationObservationState: null,
          inFlightOperationCount: null,
          candidateNodeIds: Object.freeze([
            JOINER_1_NODE_ID,
            JOINER_2_NODE_ID,
            JOINER_3_NODE_ID,
          ]),
          preReadyCandidateNodeIds: Object.freeze([
            JOINER_2_NODE_ID,
            JOINER_3_NODE_ID,
          ]),
        });
      };
      return {
        owner,
        getSnapshotCalls: () => snapshotCalls,
      };
    };

    try {
      const durable = createOwner(STARTUP_JOIN_MODE.DURABLE_REJOIN);
      const durableError = await durable.owner
        .awaitOperationLedgerFormationBarrier()
        .then(() => null, (error) => error);

      t.equal(
        durableError,
        null,
        'durable reentry does not inherit cold-formation waiting from peer ready-lease quarantine',
      );
      t.equal(
        durable.getSnapshotCalls(),
        0,
        'durable reentry is classified before polling formation evidence',
      );

      for (const startupMode of [
        STARTUP_JOIN_MODE.FRESH_JOIN,
        'unsupported_mode',
      ]) {
        const formation = createOwner(startupMode);
        const formationError = await formation.owner
          .awaitOperationLedgerFormationBarrier()
          .then(() => null, (error) => error);
        t.match(
          formationError,
          {code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT'},
          `${startupMode} remains fail-closed on the same incomplete ledger snapshot`,
        );
        t.ok(
          formation.getSnapshotCalls() > 0,
          `${startupMode} still consumes formation evidence`,
        );
      }
    } finally {
      NodeService.resetInstance();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

t.test(
  'a feasible cold-formation cohort fails closed and remains resumable when ' +
    'ledger voter observation is incomplete',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    cache.applySystemTableChange('services', 'DELETE', {
      service_id: `${LEDGER_PARTITION_ID}-r3`,
    });
    let now = 3000;
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async (delayMs) => {
        now += delayMs;
      },
    });
    owner.config.priorityPlacementFormationTimeoutMs = 3;

    try {
      const error = await owner
        .awaitOperationLedgerFormationBarrier()
        .then(() => null, (failure) => failure);
      t.match(
        error,
        {
          code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT',
          retryable: true,
          deferRetry: true,
        },
        'a partial cache cannot be interpreted as spread completion',
      );
      t.equal(
        isRetryableControlPlaneError(error),
        true,
        'the join resume owner preserves the cold-formation cohort after a transient timeout',
      );
    } finally {
      NodeService.resetInstance();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

for (const authoritativePlacementCase of [
  {
    name: 'full distinct owner placement',
    rows: [
      [1, SEED_NODE_ID],
      [2, JOINER_2_NODE_ID],
      [3, JOINER_3_NODE_ID],
    ],
    source: 'owner_rpc_lane',
    releases: true,
  },
  {
    name: 'full distinct owner placement over a stale concentrated cache',
    rows: [
      [1, SEED_NODE_ID],
      [2, JOINER_2_NODE_ID],
      [3, JOINER_3_NODE_ID],
    ],
    source: 'owner_rpc_lane',
    localCacheComplete: true,
    releases: true,
  },
  {
    name: 'partial owner placement',
    rows: [
      [1, SEED_NODE_ID],
      [2, JOINER_2_NODE_ID],
    ],
    source: 'owner_rpc_lane',
    releases: false,
  },
  {
    name: 'partial owner placement with a stale cached target of two',
    rows: [
      [1, SEED_NODE_ID],
      [2, JOINER_2_NODE_ID],
    ],
    source: 'owner_rpc_lane',
    localTargetReplicaCount: 2,
    releases: false,
  },
  {
    name: 'concentrated owner placement',
    rows: [
      [1, SEED_NODE_ID],
      [2, JOINER_2_NODE_ID],
      [3, JOINER_2_NODE_ID],
    ],
    source: 'owner_rpc_lane',
    releases: false,
  },
  {
    name: 'SQL fallback placement source',
    rows: [
      [1, SEED_NODE_ID],
      [2, JOINER_2_NODE_ID],
      [3, JOINER_3_NODE_ID],
    ],
    source: 'sql_query_engine',
    releases: false,
  },
  {
    name: 'cache-only placement source',
    rows: [
      [1, SEED_NODE_ID],
      [2, JOINER_2_NODE_ID],
      [3, JOINER_3_NODE_ID],
    ],
    source: 'local_cdc_cache',
    releases: false,
  },
]) {
  t.test(
    `a lagging local ledger cache handles ${authoritativePlacementCase.name} ` +
      'without splitting the join cohort',
    async (t) => {
      initializeEnvironment();
      const cache = buildFormationCache();
      cache.applySystemTableChange('services', 'UPDATE', {
        ...cache.get('services', `${LEDGER_PARTITION_ID}-r2`),
        node_id: JOINER_2_NODE_ID,
      });
      if (authoritativePlacementCase.localCacheComplete !== true) {
        cache.applySystemTableChange('services', 'DELETE', {
          service_id: `${LEDGER_PARTITION_ID}-r3`,
        });
      }
      if (authoritativePlacementCase.localTargetReplicaCount) {
        cache.applySystemTableChange('partitions', 'UPDATE', {
          ...cache.get('partitions', LEDGER_PARTITION_ID),
          replica_count:
            authoritativePlacementCase.localTargetReplicaCount,
        });
      }
      let operationReadCount = 0;
      let placementReadCount = 0;
      const placementReadOptions = [];
      const authoritativeRows = authoritativePlacementCase.rows.map(
        ([index, nodeId]) => ({
          service_id: `${LEDGER_PARTITION_ID}-r${index}`,
          replica_id: `${LEDGER_PARTITION_ID}-r${index}`,
          partition_id: LEDGER_PARTITION_ID,
          node_id: nodeId,
          service_type: REBALANCER_ENTITY_TYPE.PARTITION,
          status: ReplicaStatus.ACTIVE,
          raft_role: index === 1 ? 'leader' : 'follower',
        }),
      );
      const coordinator = {
        controlPlaneReadinessService: {
          getAuthoritativeControlPlaneView: () => ({
            canRead: () => true,
            readRows: async (_tableName, _sql, _params, options) => {
              placementReadCount++;
              placementReadOptions.push(options);
              return {
                success: true,
                source: authoritativePlacementCase.source,
                rows: authoritativeRows,
              };
            },
          }),
        },
        getEntityAuthoritativeOperationObservation: async () => {
          operationReadCount++;
          return {
            state: 'present',
            operations: [{
              operation_id: 'terminal-ledger-replace',
              type: REBALANCER_MOVE_TYPE.REPLACE,
              workflow_step: 'REMOVED',
              status: 'removed',
            }],
            deferredOutcome: null,
          };
        },
      };
      let sleepCalls = 0;
      let now = 4000;
      const owner = buildFormationBarrierOwner({
        cache,
        coordinator,
        now: () => now,
        sleep: async (delayMs) => {
          sleepCalls++;
          now += delayMs;
        },
      });
      owner.config.priorityPlacementFormationTimeoutMs = 3;

      try {
        const error = await owner
          .awaitOperationLedgerFormationBarrier()
          .then(() => null, (failure) => failure);
        t.equal(
          cache.filter(
            'services',
            (row) => row.partition_id === LEDGER_PARTITION_ID,
          ).length,
          authoritativePlacementCase.localCacheComplete === true ? 3 : 2,
          'the local cache remains stale in the selected failure direction',
        );
        t.ok(
          placementReadCount >= 1,
          'the lagging cache consumes the authoritative services owner',
        );
        t.match(
          placementReadOptions[0],
          {
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
            allowSqlFallback: false,
            preferOwnerRpcReadLeader: true,
          },
          'placement recovery is leader-pinned and cannot use SQL fallback',
        );
        if (authoritativePlacementCase.releases) {
          t.equal(error, null, 'full distinct owner placement releases');
          t.equal(
            operationReadCount,
            1,
            'release still consumes the authoritative operation owner',
          );
          t.equal(
            sleepCalls,
            1,
            'owner evidence releases on the first drain poll',
          );
        } else {
          t.match(
            error,
            {code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT'},
            'non-authoritative or unsafe placement evidence fails closed',
          );
          t.equal(
            operationReadCount,
            0,
            'operation drain is not queried before placement is proven',
          );
        }
      } finally {
        NodeService.resetInstance();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    },
  );
}

t.test(
  'pre-lease startup-authority targetability remains closed for ordinary ' +
    'partitions',
  async (t) => {
    const rebalancer = Object.create(UnifiedRebalancer.prototype);
    rebalancer.isControlPlanePriorityPartition = () => false;

    t.equal(
      rebalancer.isStartupAuthorityControlPlanePlacementEligibleNode(
        {
          node_id: JOINER_1_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          connection_state: 'connected',
          ready_lease_expires_at: null,
        },
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      ),
      false,
      'the startup-authority grace cannot escape the priority partition classifier',
    );
  },
);
