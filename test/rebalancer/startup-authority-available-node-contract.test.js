import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  buildNodeRegistrationRow,
} from '../../src/bootstrap/shared/node-registration-owner-row-builder.js';
import {
  NODE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';

const NOW_MS = 1000;
const READY_LEASE_EXPIRES_AT_MS = 5000;

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'seed-node'},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createCache(overrides = {}) {
  const rows = {
    nodes: overrides.nodes || [
      {node_id: 'seed-node', status: 'active', ready_lease_expires_at: Date.now() + 60000},
      {node_id: 'node-2', status: 'active', ready_lease_expires_at: Date.now() + 60000},
      {node_id: 'node-3', status: 'active', ready_lease_expires_at: Date.now() + 60000},
    ],
    partitions: overrides.partitions || [
      {partition_id: 'control_plane_publications-p1', table_id: 'control_plane_publications'},
    ],
    services: overrides.services || [],
    tables: overrides.tables || [],
    replica_operations: overrides.replica_operations || [],
    node_endpoints: overrides.node_endpoints || [],
    service_endpoints: overrides.service_endpoints || [],
  };
  const listeners = new Set();
  return {
    get(tableName, key) {
      const values = rows[tableName] || [];
      return values.find((row) =>
        row.partition_id === key ||
        row.node_id === key ||
        row.service_id === key,
      ) || null;
    },
    getAll(tableName) {
      return rows[tableName] || [];
    },
    filter(tableName, predicate) {
      return (rows[tableName] || []).filter(predicate);
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    notify(tableName, row) {
      for (const listener of listeners) {
        listener(tableName, 'UPDATE', row, null);
      }
    },
  };
}

test('UnifiedRebalancer uses readiness-owned startup cohort for startup-sensitive system partition availability', async (t) => {
  initEnv();
  const cache = createCache();
  const rebalancer = new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              nodeId === 'seed-node',
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
              nodeId === 'seed-node',
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: true,
          canonicalStartupNodeIds: ['seed-node', 'node-2', 'node-3'],
        };
      },
    },
  });

  t.same(
    rebalancer.getAvailableNodes().map((node) => node.node_id).sort(),
    ['seed-node'],
    'startup authority should constrain the cohort without treating remote unready peers as placement-ready',
  );
  t.end();
});

test('UnifiedRebalancer admits remote startup-authority targets for priority control-plane provisioning', async (t) => {
  initEnv();
  const seedNode = {
    node_id: 'seed-node',
    status: NODE_STATE.ACTIVE,
    connection_state: STATE.READY,
    ready_lease_expires_at: READY_LEASE_EXPIRES_AT_MS,
    last_heartbeat: NOW_MS,
  };
  const registrationRow = buildNodeRegistrationRow({
    nodeId: 'node-2',
    nodeAddress: 'node-2:8080',
    nodeCapabilities: [],
    now: NOW_MS,
  });
  const joiningReadyNode = {
    ...registrationRow,
    connection_state: STATE.READY,
    ready_lease_expires_at: READY_LEASE_EXPIRES_AT_MS,
  };
  const disconnectedJoiner = {
    ...buildNodeRegistrationRow({
      nodeId: 'node-3',
      nodeAddress: 'node-3:8080',
      nodeCapabilities: [],
      now: NOW_MS,
    }),
    connection_state: STATE.DISCONNECTED,
  };
  const nodeRows = [
    seedNode,
    joiningReadyNode,
    disconnectedJoiner,
  ];
  const serviceRows = [
    {
      service_id: 'seed-partition-service',
      node_id: 'seed-node',
      service_type: SERVICE_TYPE.PARTITION,
      status: SERVICE_STATUS.ACTIVE,
      address: 'seed-node/partition/control-plane-publications-p1',
    },
    {
      service_id: 'node-2-partition-service',
      node_id: 'node-2',
      service_type: SERVICE_TYPE.PARTITION,
      status: SERVICE_STATUS.ACTIVE,
      address: 'node-2/partition/control-plane-publications-p1',
    },
  ];
  const nodeEndpointRows = [
    {
      endpoint_id: 'seed-node-ws',
      node_id: 'seed-node',
      transport_type: 'ws',
      status: SERVICE_STATUS.ACTIVE,
      address: 'ws://seed-node:8082',
    },
  ];
  const cache = createCache({
    nodes: nodeRows,
    services: serviceRows,
    node_endpoints: nodeEndpointRows,
  });
  const routerStateByNodeId = new Map([
    ['seed-node', STATE.CONNECTED],
    ['node-2', STATE.CONNECTED],
    ['node-3', STATE.DISCONNECTED],
  ]);
  const messageRouter = {
    getConnectionState: (nodeId) =>
      routerStateByNodeId.get(nodeId) || STATE.DISCONNECTED,
    isOutboundQueueAvailable: () => true,
    getConnectedNodes: () => [...routerStateByNodeId.entries()]
      .filter(([, state]) => state === STATE.CONNECTED)
      .map(([nodeId]) => nodeId),
    getQueryDataPlaneTransportReadiness: () => ({ready: true}),
  };
  let readinessNowMs = NOW_MS;
  let planningCandidate = {
    publicationEpoch: 17,
    publicationStatus: 'ACK_PENDING',
    publicationObservationState: 'establishing',
    publishedActiveNodeIds: ['seed-node'],
    projectedServingNodeIds: ['seed-node'],
    locallyEligibleNodeIds: ['seed-node'],
    recoveryActiveNodeIds: ['seed-node'],
    recoveryActiveNodeSource: 'locally_eligible_projection',
    requiredAckNodeIds: ['seed-node'],
    acknowledgedNodeIds: ['seed-node'],
    pendingAckNodeIds: [],
    pendingAckCount: 0,
    recoveryProtocolState: 'priority_spread_pending',
    priorityPartitionSummary: {
      satisfied: false,
    },
    priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
    membershipLifecycleSummary: {
      formationPlacementNodeIds: [],
    },
  };
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter,
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics() {
        return {
          currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
          reasonCode: null,
          enteredAt: '2026-07-18T00:00:00.000Z',
          recentTransitions: [],
        };
      },
    },
    membershipPublicationService: {
      deriveClusterMembershipCandidateSync() {
        return planningCandidate;
      },
    },
    now: () => readinessNowMs,
  });
  const candidateOptions = {
    publisherNodeId: 'seed-node',
    latestPublicationRow: {
      publication_epoch: 17,
      status: 'ACK_PENDING',
      published_active_node_ids: ['seed-node'],
      required_ack_node_ids: ['seed-node'],
      acknowledged_node_ids: ['seed-node'],
    },
    latestPublishedPublicationRow: {
      publication_epoch: 16,
      status: 'PUBLISHED',
      published_active_node_ids: ['seed-node'],
      required_ack_node_ids: ['seed-node'],
      acknowledged_node_ids: ['seed-node'],
    },
    nodeRows,
    nodeEndpointRows,
    serviceRows,
    connectedNodeIds: messageRouter.getConnectedNodes(),
    priorityPartitionSummary: {
      satisfied: false,
    },
    nowMs: NOW_MS,
  };
  const readinessEntries = nodeRows.map((nodeRow) =>
    readinessService.getNodeReadinessSync(nodeRow.node_id),
  );
  const joiningReadiness = readinessEntries.find(
    (entry) => entry.nodeId === 'node-2',
  );
  t.equal(
    joiningReadiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
    ],
    false,
    'the real readiness owner keeps the JOINING+READY row outside healthy membership',
  );
  t.equal(
    joiningReadiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ],
    true,
    'the real readiness owner grants only recovery eligibility from live transport and service evidence',
  );
  planningCandidate = deriveMembershipPublicationCandidate({
    ...candidateOptions,
    readinessEntries,
  });
  cache.notify(TABLES.NODES, joiningReadyNode);
  t.same(
    planningCandidate.membershipLifecycleSummary.formationPlacementNodeIds,
    ['node-2'],
    'the publication candidate places the real recovery-eligible joiner in the formation lane',
  );
  const startupAuthority =
    readinessService.getStartupAuthoritySnapshotSync('seed-node', NOW_MS);
  t.equal(
    startupAuthority.authorityAvailable,
    true,
    'the real readiness owner produces available startup authority',
  );
  t.same(
    startupAuthority.canonicalStartupNodeIds,
    ['node-2', 'seed-node'],
    'startup authority alone adds the formation joiner to the canonical startup cohort',
  );
  const rebalancer = new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter,
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: readinessService,
  });

  t.same(
    rebalancer.getAvailableNodes().map((node) => node.node_id).sort(),
    ['node-2', 'seed-node'],
    'the real formation cohort can receive the first priority control-plane replica',
  );
  t.equal(
    await rebalancer.isNodeReady('node-2'),
    true,
    'pre-execution readiness consumes the same real startup-authority answer',
  );
  t.equal(
    await rebalancer.getNodeReadinessSkipReason('node-2'),
    null,
    'the formation target is executable instead of node_not_ready/repair_ineligible',
  );
  routerStateByNodeId.set('node-2', STATE.DISCONNECTED);
  readinessNowMs += 1;
  cache.notify(TABLES.NODES, joiningReadyNode);
  const withdrawnReadinessEntries = nodeRows.map((nodeRow) =>
    readinessService.getNodeReadinessSync(nodeRow.node_id),
  );
  const withdrawnJoiningReadiness = withdrawnReadinessEntries.find(
    (entry) => entry.nodeId === 'node-2',
  );
  t.equal(
    withdrawnJoiningReadiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ],
    false,
    'the real readiness owner withdraws recovery eligibility with live transport',
  );
  planningCandidate = deriveMembershipPublicationCandidate({
    ...candidateOptions,
    connectedNodeIds: messageRouter.getConnectedNodes(),
    readinessEntries: withdrawnReadinessEntries,
  });
  readinessNowMs += 1;
  cache.notify(TABLES.NODES, joiningReadyNode);
  t.same(
    planningCandidate.membershipLifecycleSummary.formationPlacementNodeIds,
    [],
    'live-transport withdrawal removes the joiner from the real formation candidate',
  );
  t.equal(
    await rebalancer.isNodeReady('node-2'),
    false,
    'live-transport withdrawal fails closed at pre-execution',
  );
  routerStateByNodeId.set('node-2', STATE.CONNECTED);
  readinessNowMs += 1;
  cache.notify(TABLES.NODES, joiningReadyNode);
  t.equal(
    await rebalancer.isNodeReady('node-2'),
    false,
    'transport restoration cannot revive a JOINING target after formation authority withdrew it',
  );
  t.end();
});

test('UnifiedRebalancer does not use local startup bypass as placement readiness', async (t) => {
  initEnv();
  const cache = createCache();
  const rebalancer = new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    startupRecoveryCoordinator: {
      evaluate: () => ({
        shouldBypassLocalPriorityControlPlaneStartupReadiness: true,
      }),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: true,
          canonicalStartupNodeIds: ['seed-node', 'node-2', 'node-3'],
        };
      },
    },
  });

  t.same(
    rebalancer.getAvailableNodes().map((node) => node.node_id).sort(),
    [],
    'local startup bypass should not make an unready seed placement-ready',
  );
  t.end();
});

test('the live-transport veto routes through hasLiveTransportEvidence: its ' +
  'lowercasing fold is load-bearing at the placement-eligibility call site',
async (t) => {
  // Spec node-liveness-veto-consolidation, Task 4.2 red-on-revert. The switch
  // from the raw `getConnectionState(nodeId) !== STATE.CONNECTED` compare to
  // `!hasLiveTransportEvidence(...)` is a no-op over the canonical (lowercase)
  // live domain — so the ONLY input that distinguishes the atom from the old
  // inline term, proving the call now truly routes through it, is the
  // documented same-or-safer mixed-case fold: on a live router value of
  // 'Connected' the old raw compare VETOES the node (mixed case !== 'connected')
  // while the atom lowercases and admits it. This pins that the atom is the
  // live term, so reverting the src (restoring the raw compare) fails this test.
  initEnv();
  const cache = createCache();
  const rebalancer = new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      // Non-physical mixed-case value: the live transport machine only ever
      // emits lowercase CONNECTION_STATE, so this exercises the atom's fold,
      // never a real state — see live-transport-evidence-parity char test.
      getConnectionState: () => 'Connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: true,
          canonicalStartupNodeIds: ['seed-node', 'node-2'],
        };
      },
    },
  });

  // node-2 is a startup-authority peer, joining, cached-connected — the cached
  // conjunct passes, so the live-transport veto is the sole remaining gate.
  const node = {
    node_id: 'node-2',
    status: NODE_STATE.JOINING,
    connection_state: 'connected',
  };
  t.equal(
    rebalancer.isStartupAuthorityControlPlanePlacementEligibleNode(
      node,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ),
    true,
    'atom folds mixed-case live "Connected" to connected → node stays eligible ' +
      '(raw compare would veto it — red-on-revert)',
  );
  t.end();
});
