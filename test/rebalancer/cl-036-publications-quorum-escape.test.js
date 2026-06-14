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

// CL-036: control_plane_publications-p1 spread recovery wedged under rolling
// restart because the critical-topology settling gate counted any
// recovery-pending ACTIVE node as unready and — unlike every OTHER priority
// partition — publications was UNCONDITIONALLY excluded from the quorum escape.
// A node's readiness dimension is itself gated on priority recovery completing,
// which needs the spread (circular). The fix gates the exclusion on
// shouldRequireFullControlPlanePublicationEndpointVisibility(): strict all-node
// requirement only while a publication is OPEN or recovery is ACTIVE; once the
// latest publication is PUBLISHED and recovery is inactive, publications may
// spread on a healthy quorum like the other priority partitions.

const SEED = 'seed-node';
const NODE_B = 'node-2';
const NODE_C = 'node-3';
const PARTITION_ID = 'control_plane_publications-p1';
const TABLE_ID = 'control_plane_publications';
const READY = 60000;
const STALE = -60000;

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({node: {id: SEED}, logging: {level: 'error'}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function nodeRow(nodeId, leaseOffsetMs) {
  return {
    node_id: nodeId,
    status: 'active',
    ready_lease_expires_at: Date.now() + leaseOffsetMs,
  };
}

// Quorum (2 of 3) is ready; NODE_C is an ACTIVE-but-recovery-pending node —
// exactly the run4 shape (the node briefly reached ready then regressed).
const nodeEndpoint = (nodeId) => ({
  node_id: nodeId,
  transport_type: 'ws',
  status: 'active',
});
const serviceEndpoint = (nodeId) => ({
  node_id: nodeId,
  service_id: 'sys-postgres-wire',
  health_status: 'healthy',
});

function createCache() {
  const rows = {
    nodes: [nodeRow(SEED, READY), nodeRow(NODE_B, READY), nodeRow(NODE_C, STALE)],
    partitions: [{partition_id: PARTITION_ID, table_id: TABLE_ID}],
    // Endpoint visibility is complete (the run4 wedge blocker was exclusively
    // node_ready_lease_incomplete, not endpoint visibility) so the test isolates
    // the readiness-quorum gate the fix targets.
    node_endpoints: [nodeEndpoint(SEED), nodeEndpoint(NODE_B), nodeEndpoint(NODE_C)],
    service_endpoints: [
      serviceEndpoint(SEED),
      serviceEndpoint(NODE_B),
      serviceEndpoint(NODE_C),
    ],
    services: [],
    tables: [],
    replica_operations: [],
  };
  return {
    get: (t, key) =>
      (rows[t] || []).find((r) => r.partition_id === key || r.node_id === key) ||
      null,
    getAll: (t) => rows[t] || [],
    filter: (t, p) => (rows[t] || []).filter(p),
  };
}

function createReadinessService(cache) {
  return {
    getNodeReadinessSync(nodeId) {
      const row = cache.get('nodes', nodeId);
      const ready =
        row !== null &&
        Number(row.ready_lease_expires_at) > Date.now() &&
        row.status === 'active';
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: ready,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
            ready,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: ready,
        },
        reasons: [],
      };
    },
    getStartupAuthoritySnapshotSync() {
      return {
        authorityAvailable: true,
        canonicalStartupNodeIds: [SEED, NODE_B, NODE_C],
      };
    },
  };
}

function createRebalancer() {
  const cache = createCache();
  return new UnifiedRebalancer({
    entityId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: SEED,
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
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
    },
    sqlQueryEngine: {executeQuery: async () => ({success: true, rows: []})},
    controlPlaneReadinessService: createReadinessService(cache),
  });
}

// Drive shouldRequireFullControlPlanePublicationEndpointVisibility() through its
// real inputs (publication status + recovery-active + trim overflow) so the test
// exercises the actual predicate the fix wires in, not a stub.
function withPublicationState(rebalancer, {publicationStatus, recoveryActive}) {
  rebalancer.getLatestMembershipPublicationRow = () => ({
    status: publicationStatus,
  });
  rebalancer.isPriorityControlPlaneRecoveryActive = () => recoveryActive;
  rebalancer.hasControlPlanePublicationTrimOverflow = () => false;
  return rebalancer;
}

test('CL-036 publications spread proceeds on quorum once the publication is PUBLISHED and recovery is inactive', async (t) => {
  initEnv();
  const rebalancer = withPublicationState(createRebalancer(), {
    publicationStatus: 'PUBLISHED',
    recoveryActive: false,
  });

  t.equal(
    rebalancer.getCriticalSystemTopologySettlingBlocker(),
    null,
    'a recovery-pending node must NOT block publications spread once a healthy ' +
      'quorum is ready and the publication is closed (breaks the circular wedge)',
  );
  t.end();
});

test('CL-036 publications spread STILL blocks while a publication is OPEN (membership authority in flux)', async (t) => {
  initEnv();
  const rebalancer = withPublicationState(createRebalancer(), {
    publicationStatus: 'OPEN',
    recoveryActive: false,
  });

  const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
  t.ok(blocker, 'open publication keeps the strict all-node gate');
  t.equal(
    blocker.reason,
    'node_ready_lease_incomplete',
    'still gated on the unready node while the publication is open',
  );
  t.end();
});

test('CL-036 publications spread STILL blocks while priority recovery is active', async (t) => {
  initEnv();
  const rebalancer = withPublicationState(createRebalancer(), {
    publicationStatus: 'PUBLISHED',
    recoveryActive: true,
  });

  const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
  t.ok(blocker, 'active recovery keeps the strict all-node gate');
  t.equal(
    blocker.reason,
    'node_ready_lease_incomplete',
    'still gated on the unready node while recovery is active (not over-relaxed)',
  );
  t.end();
});
