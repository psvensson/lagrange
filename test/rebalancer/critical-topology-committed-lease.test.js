import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  SERVE_ELIGIBILITY_STATE,
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
} from '../../src/control-plane/serve-eligibility-owner.js';
import {withRegisteredIncarnations} from
  '../test-helpers/endpoint-incarnation-fixture.js';
import {partialReadinessFake} from '../helpers/readiness-service-fixture.js';
import {createSystemTableCacheFixture} from './system-table-cache-fixture.js';

const SEED_NODE_ID = 'seed-node';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const SYSTEM_PARTITION_ID = 'control_plane_publications-p1';
const NON_PRIORITY_SYSTEM_PARTITION_ID = 'services-p1';
const SEMANTIC_NOW_MS = 100_000;
const COMMITTED_EPOCH = Object.freeze({
  publicationEpoch: 1,
  publicationId: 'committed-lease-witness',
  readAtMs: SEMANTIC_NOW_MS,
});

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: SEED_NODE_ID},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createNodeRow(nodeId, leaseOffsetMs = 60000) {
  return {
    node_id: nodeId,
    status: 'active',
    ready_lease_expires_at: Date.now() + leaseOffsetMs,
  };
}

function createNodeEndpoint(nodeId) {
  return {
    endpoint_id: `${nodeId}-ws`,
    node_id: nodeId,
    transport_type: 'ws',
    status: 'active',
  };
}

function createCache(options = {}) {
  const nodes = options.nodes || [
    createNodeRow(SEED_NODE_ID),
    createNodeRow(NODE_B),
    createNodeRow(NODE_C),
  ];
  const endpoints = options.nodeEndpoints || [
    createNodeEndpoint(SEED_NODE_ID),
    createNodeEndpoint(NODE_B),
    createNodeEndpoint(NODE_C),
  ];
  const replicaOperations = options.replicaOperations || [];
  const rows = withRegisteredIncarnations({
    nodes,
    partitions: [
      {partition_id: SYSTEM_PARTITION_ID, table_id: 'control_plane_publications'},
      {partition_id: NON_PRIORITY_SYSTEM_PARTITION_ID, table_id: 'services'},
    ],
    node_endpoints: endpoints,
    services: [],
    tables: [],
    replica_operations: replicaOperations,
  });
  return createSystemTableCacheFixture(rows);
}

function createRebalancer(overrides = {}) {
  const cache = overrides.cache || createCache();
  const partitionId = overrides.partitionId || SYSTEM_PARTITION_ID;
  const committedNodeRows = overrides.committedNodeRows || cache.getAll('nodes');
  const rebalancer = new UnifiedRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    nowFn: overrides.nowFn,
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({minReplicaCount: 3, targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [SEED_NODE_ID, NODE_B, NODE_C],
    },
    rebalanceCoordinator: overrides.rebalanceCoordinator || {
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
      getAuthoritativeOperationsByEntity:
        overrides.getAuthoritativeOperationsByEntity || (async () => []),
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    // The one fixture completer: members the fake does not state answer as
    // absent ones did, on the rebalancer's clock.
    controlPlaneReadinessService: partialReadinessFake({
      // This fixture substitutes the committed reader, not its lease decision.
      answerCommittedNodes() {
        return {
          state: SERVE_ELIGIBILITY_STATE.READY,
          epoch: COMMITTED_EPOCH,
          nodeRows: committedNodeRows,
        };
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: true,
          canonicalStartupNodeIds: [SEED_NODE_ID, NODE_B, NODE_C],
        };
      },
      ...overrides.controlPlaneReadinessService,
    }, overrides.nowFn),
  });
  return rebalancer;
}

function createCommittedLeaseRig(committedLease, cachedLease = SEMANTIC_NOW_MS + 1000) {
  let nowMs = SEMANTIC_NOW_MS;
  const nodes = [SEED_NODE_ID, NODE_B, NODE_C].map((nodeId) => ({
    node_id: nodeId,
    status: 'active',
    ready_lease_expires_at: nodeId === NODE_B ? cachedLease : SEMANTIC_NOW_MS + 1000,
  }));
  const cache = createCache({nodes});
  const committedNodeRows = cache.getAll('nodes').map((row) => ({...row}));
  const target = committedNodeRows.find((row) => row.node_id === NODE_B);
  target.ready_lease_expires_at = committedLease;
  const rebalancer = createRebalancer({
    cache,
    committedNodeRows,
    partitionId: NON_PRIORITY_SYSTEM_PARTITION_ID,
    nowFn: () => nowMs,
    controlPlaneReadinessService: {getStartupAuthoritySnapshotSync: () => null},
  });
  return {
    rebalancer,
    target,
    setNow: (value) => {
      nowMs = value;
    },
  };
}

function availableNodeIds(rebalancer) {
  return rebalancer.getAvailableNodes().map((node) => node.node_id).sort();
}

test('committed lease semantics reject coercible and non-integral timestamps at both consumers',
  (t) => {
    initEnv();
    let coercions = 0;
    const invalidLeases = [
      {name: 'fractional', value: SEMANTIC_NOW_MS + 0.5},
      {name: 'unsafe integer', value: Number.MAX_SAFE_INTEGER + 1},
      {name: 'array', value: [SEMANTIC_NOW_MS + 1000]},
      {name: 'coercible object', value: {valueOf() {
        coercions += 1;
        return SEMANTIC_NOW_MS + 1000;
      }}},
    ];
    for (const {name, value} of invalidLeases) {
      const {rebalancer} = createCommittedLeaseRig(value);
      t.same(availableNodeIds(rebalancer), [NODE_C, SEED_NODE_ID],
        `${name}: malformed committed lease cannot admit the node`);
      const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
      t.equal(blocker?.reason, 'node_ready_lease_incomplete',
        `${name}: malformed committed lease cannot settle critical topology`);
      t.same(blocker?.unreadyNodeIds, [NODE_B], `${name}: exact committed node is held`);
    }
    t.equal(coercions, 0, 'lease evidence never executes caller coercion');
    t.end();
  });

test('both lease consumers use committed evidence through expiry and a later committed renewal',
  (t) => {
    initEnv();
    const rig = createCommittedLeaseRig(SEMANTIC_NOW_MS + 1, SEMANTIC_NOW_MS - 1);
    const allNodeIds = [NODE_B, NODE_C, SEED_NODE_ID];
    t.same(availableNodeIds(rig.rebalancer), allNodeIds,
      'current committed lease admits despite an expired cache lease');
    t.equal(rig.rebalancer.getCriticalSystemTopologySettlingBlocker(), null,
      'current committed lease settles despite an expired cache lease');
    rig.setNow(SEMANTIC_NOW_MS + 1);
    t.same(availableNodeIds(rig.rebalancer), [NODE_C, SEED_NODE_ID],
      'the exact committed expiry stops placement without a cache event');
    t.equal(rig.rebalancer.getCriticalSystemTopologySettlingBlocker()?.reason,
      'node_ready_lease_incomplete', 'the same expiry stops critical settling');
    rig.target.ready_lease_expires_at = SEMANTIC_NOW_MS + 2;
    t.same(availableNodeIds(rig.rebalancer), allNodeIds,
      'a later committed renewal restores useful placement');
    t.equal(rig.rebalancer.getCriticalSystemTopologySettlingBlocker(), null,
      'the same committed renewal restores critical settling');
    const inverse = createCommittedLeaseRig(SEMANTIC_NOW_MS - 1);
    t.same(availableNodeIds(inverse.rebalancer), [NODE_C, SEED_NODE_ID],
      'fresh cached lease cannot rescue expired committed evidence');
    t.equal(inverse.rebalancer.getCriticalSystemTopologySettlingBlocker()?.reason,
      'node_ready_lease_incomplete', 'fresh cache cannot settle expired committed evidence');
    t.end();
  });

test('committed lease is necessary for placement but does not replace its readiness dimension',
  (t) => {
    initEnv();
    const {rebalancer} = createCommittedLeaseRig(SEMANTIC_NOW_MS + 1);
    rebalancer.controlPlaneReadinessService.getNodeReadinessSync = (nodeId) => ({
      nodeId,
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: nodeId !== NODE_B,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: nodeId !== NODE_B,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
      },
      reasons: [],
    });
    t.same(availableNodeIds(rebalancer), [NODE_C, SEED_NODE_ID],
      'a current lease does not overrule an explicit placement-readiness refusal');
    t.equal(rebalancer.getCriticalSystemTopologySettlingBlocker(), null,
      'critical settle consumes current committed leases without a circular serve requirement');
    t.end();
  });

test('critical topology requires a nonempty committed answer and never consults a fallback reader',
  (t) => {
    initEnv();
    let fallbackReads = 0;
    const replies = [
      {name: 'missing reader', reader: undefined},
      {name: 'missing answer', reader: () => null},
      {name: 'unknown answer', reader: () => ({state: 'unknown'})},
      {name: 'missing rows', reader: () => ({state: SERVE_ELIGIBILITY_STATE.READY})},
      {name: 'empty rows', reader: () => ({
        state: SERVE_ELIGIBILITY_STATE.READY, epoch: COMMITTED_EPOCH, nodeRows: [],
      })},
    ];
    for (const {name, reader} of replies) {
      const cache = createCache();
      const rebalancer = createRebalancer({
        cache,
        controlPlaneReadinessService: {
          answerCommittedNodes: reader,
          getServeEligibilityOwner() {
            fallbackReads += 1;
            return {answerCommittedNodes: () => ({
              state: SERVE_ELIGIBILITY_STATE.READY, nodeRows: cache.getAll('nodes'),
            })};
          },
        },
      });
      const getAll = cache.getAll.bind(cache);
      cache.getAll = (table) => {
        if (table === 'nodes') fallbackReads += 1;
        return getAll(table);
      };
      const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
      t.equal(blocker?.reason, 'unavailable', `${name} cannot settle critical topology`);
      if (name === 'empty rows') {
        t.equal(blocker?.epoch, COMMITTED_EPOCH, 'unavailability retains the observed epoch');
      }
      t.same(availableNodeIds(rebalancer), [], `${name} cannot admit placement`);
    }
    t.equal(fallbackReads, 0, 'neither cache nor a second reader substitutes missing evidence');
    t.end();
  });

test(
  'Attempt 3 (a): placeholder readiness for N but committed lease current -> settle blocker is null',
  async (t) => {
    initEnv();
    const rebalancer = createRebalancer({
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          const isNodeB = nodeId === NODE_B;
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: !isNodeB,
            },
            reasons: isNodeB ? ['placeholder_unready'] : [],
          };
        },
        getStartupAuthoritySnapshotSync() {
          return {
            authorityAvailable: true,
            canonicalStartupNodeIds: [SEED_NODE_ID, NODE_B, NODE_C],
          };
        },
      },
    });

    const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
    t.equal(
      blocker,
      null,
      'settle blocker is null when committed lease is current, ignoring placeholder readiness',
    );
    t.end();
  },
);

test(
  'Attempt 3 (b): cache REPLICA_OPERATIONS empty, owner read has one in-flight ADD -> blocker topology_operations_in_flight source authoritative',
  async (t) => {
    initEnv();
    const authoritativeOp = {
      operation_id: 'op-inflight-add-1',
      operationId: 'op-inflight-add-1',
      type: 'ADD',
      status: 'in_progress',
      workflow_step: 'replicating',
      workflowStep: 'replicating',
      entity_type: EntityType.PARTITION,
      entity_id: SYSTEM_PARTITION_ID,
      partition_id: SYSTEM_PARTITION_ID,
      partitionId: SYSTEM_PARTITION_ID,
      target_node_id: NODE_B,
      targetNodeId: NODE_B,
    };
    const cache = createCache({replicaOperations: []});
    const rebalancer = createRebalancer({
      cache,
      getAuthoritativeOperationsByEntity: async () => [authoritativeOp],
    });
    t.teardown(() => rebalancer.shutdown());

    const decision = await rebalancer.resolveTopologySettlingPlanningGateDecision();
    t.ok(decision, 'planning gate should produce a decision');
    t.equal(
      decision?.blocker?.reason,
      'topology_operations_in_flight',
      'blocker reason should be topology_operations_in_flight',
    );
    t.equal(
      decision?.blocker?.inFlightReplicaOperationsSource,
      'authoritative',
      'inFlightReplicaOperationsSource must be authoritative',
    );
    t.equal(
      decision?.blocker?.inFlightReplicaOperations,
      1,
      'inFlightReplicaOperations count should be 1',
    );
    t.end();
  },
);

test(
  'Attempt 3 (c): owner read throws -> unavailable, not the cache blocker',
  async (t) => {
    initEnv();
    const cache = createCache({
      replicaOperations: [{
        operation_id: 'cached-op-1',
        type: 'ADD',
        status: 'in_progress',
        partition_id: SYSTEM_PARTITION_ID,
        target_node_id: NODE_B,
      }],
    });
    const rebalancer = createRebalancer({
      cache,
      getAuthoritativeOperationsByEntity: async () => {
        throw new Error('rpc leader read unavailable');
      },
    });
    t.teardown(() => rebalancer.shutdown());

    const decision = await rebalancer.resolveTopologySettlingPlanningGateDecision();
    t.ok(decision, 'planning gate should produce a decision on owner read failure');
    t.equal(
      decision?.blocker?.reason,
      'unavailable',
      'settle blocker answers unavailable when owner read throws, not cache blocker',
    );
    t.end();
  },
);

test(
  'Attempt 3 (d): local-serve PRIORITY_..._PENDING on a non-priority system partition -> no defer, interval unchanged',
  async (t) => {
    initEnv();
    const rebalancer = createRebalancer({
      partitionId: NON_PRIORITY_SYSTEM_PARTITION_ID,
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
            },
            reasons: [{code: 'priority_control_plane_recovery_pending'}],
          };
        },
        getStartupAuthoritySnapshotSync() {
          return {
            authorityAvailable: true,
            canonicalStartupNodeIds: [SEED_NODE_ID, NODE_B, NODE_C],
          };
        },
      },
    });

    t.equal(
      rebalancer.isControlPlanePriorityPartition(),
      false,
      'services partition is non-priority',
    );
    t.equal(
      rebalancer.isSystemPartitionEntity(),
      true,
      'services partition is a system partition',
    );

    const initialInterval = rebalancer.currentInterval;
    const localServeDecision = rebalancer.resolveLocalServePlanningGateDecision();
    t.equal(
      localServeDecision,
      null,
      'local-serve planning gate decision is null on non-priority system partition',
    );
    t.equal(
      rebalancer.currentInterval,
      initialInterval,
      'interval should be unchanged (no 75s defer)',
    );
    t.end();
  },
);

test(
  'Attempt 3 (e): unavailable answerCommittedNodes answers unavailable settle blocker and [] candidate rows without reading cache nodes',
  async (t) => {
    initEnv();
    let nodesCacheReads = 0;
    const baseCache = createCache();
    const cache = {
      ...baseCache,
      getAll(tableName) {
        if (tableName === 'nodes') {
          nodesCacheReads += 1;
        }
        return baseCache.getAll(tableName);
      },
    };
    const rebalancer = createRebalancer({
      cache,
      controlPlaneReadinessService: {
        answerCommittedNodes() {
          return {
            state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
            reason: SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE,
            epoch: null,
            retryAfterMs: 1000,
            nodeRows: [],
          };
        },
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
        getStartupAuthoritySnapshotSync() {
          return null;
        },
      },
    });

    nodesCacheReads = 0;
    const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
    t.equal(
      blocker?.reason,
      'unavailable',
      'settle blocker is unavailable when answerCommittedNodes is unavailable',
    );
    t.same(
      rebalancer.resolveAvailableNodeCandidateRows(),
      [],
      'resolveAvailableNodeCandidateRows returns [] when answerCommittedNodes is unavailable',
    );
    t.equal(
      nodesCacheReads,
      0,
      'does not fall back to systemTableCache.getAll("nodes")',
    );
    t.end();
  },
);
