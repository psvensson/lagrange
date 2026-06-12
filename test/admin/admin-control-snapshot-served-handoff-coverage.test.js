import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';

// CL-022 guard: the serve-time active-gate handoff rebuild
// (resolveSharedControlSnapshot -> attachControlSnapshotObservationActiveGateHandoff)
// receives controlPlaneDiagnostics.activeNodeViews in the serialized summary
// dialect (effectiveNodeIds / publishedNodeIds / ...). The catchup fence reads
// only the resolver-shaped *ActiveNodeIds keys; without translation the served
// contract can never prove snapshot coverage and permanently denies runtime
// promotion (state=degraded / published_active_coverage_incomplete), which
// blocks the mode=load load-readiness admission gate.

const LOCAL_NODE_ID = 'node-seed';
const CLUSTER_NODE_IDS = Object.freeze([
  'node-seed',
  'node-j1',
  'node-j2',
  'node-j3',
  'node-j4',
]);
const PUBLICATION_EPOCH = 4;
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
const HANDOFF_STATE_DEGRADED = 'degraded';
const HANDOFF_REASON_COVERAGE_INCOMPLETE =
  'published_active_coverage_incomplete';

function buildServedLocalSnapshot() {
  return {
    nodeId: LOCAL_NODE_ID,
    capturedAt: 1,
    nodes: [...CLUSTER_NODE_IDS],
    publishedNodes: [...CLUSTER_NODE_IDS],
    projectedNodes: [...CLUSTER_NODE_IDS],
    suspectedOrTransitioningNodes: [],
    controlPlaneDiagnostics: {
      // The serialized summary dialect exactly as buildLocalControlSnapshot
      // writes it (keys drop the "Active" infix).
      activeNodeViews: {
        authoritativeSource: 'published_membership',
        authoritativeNodeIds: [...CLUSTER_NODE_IDS],
        projectedServingNodeIds: [...CLUSTER_NODE_IDS],
        locallyEligibleNodeIds: [...CLUSTER_NODE_IDS],
        suspectedOrTransitioningNodeIds: [],
        membershipFreeze: null,
        effectiveSource: 'published_membership',
        effectiveNodeIds: [...CLUSTER_NODE_IDS],
        projectedNodeIds: [...CLUSTER_NODE_IDS],
        publishedNodeIds: [...CLUSTER_NODE_IDS],
        publishedMembershipAvailable: true,
      },
      publicationConvergence: {
        publicationStatus: PUBLICATION_STATUS_PUBLISHED,
        publicationEpoch: PUBLICATION_EPOCH,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
        publishedActiveNodeIds: [...CLUSTER_NODE_IDS],
        missingPublishedNodeIds: [],
        pendingAckNodeIds: [],
        priorityPartitionSummary: {
          satisfied: true,
          totalSpreadGap: 0,
          blockedPartitionCount: 0,
        },
      },
      readinessByNodeId: {},
    },
  };
}

test('served control snapshot handoff proves snapshot coverage from the summary dialect',
  async (t) => {
    const adminControlSnapshot = new AdminControlSnapshot({
      nodeId: LOCAL_NODE_ID,
      controlPlaneSnapshotOwner: {
        resolveControlSnapshot: async (localSnapshot) => localSnapshot,
      },
    });

    const served = await adminControlSnapshot.resolveSharedControlSnapshot(
      buildServedLocalSnapshot(),
      {},
    );
    const handoff = served?.controlPlaneDiagnostics?.publicationActiveGateHandoff;
    t.ok(handoff, 'served snapshot carries a rebuilt active-gate handoff');

    const fenceCoverage = handoff?.activeGateCatchupFence?.snapshotCoverage;
    t.equal(
      fenceCoverage?.available,
      true,
      'fence snapshot-coverage evidence is available from the summary dialect',
    );
    t.equal(
      fenceCoverage?.covered,
      true,
      'fence snapshot-coverage evidence covers the expected nodes',
    );
    t.equal(
      fenceCoverage?.missingNodeCount,
      0,
      'fence snapshot-coverage evidence has no missing nodes',
    );
    t.equal(
      handoff?.runtimePromotionAllowed,
      true,
      'served handoff allows runtime promotion when truth is fully green',
    );
    t.not(
      handoff?.state,
      HANDOFF_STATE_DEGRADED,
      'served handoff is not degraded',
    );
    t.not(
      handoff?.reasonCode,
      HANDOFF_REASON_COVERAGE_INCOMPLETE,
      'served handoff does not alias a fence denial as coverage-incomplete',
    );
  });

test('served handoff rebuild keeps resolver-shaped activeNodeViews intact',
  async (t) => {
    const adminControlSnapshot = new AdminControlSnapshot({
      nodeId: LOCAL_NODE_ID,
      controlPlaneSnapshotOwner: {
        resolveControlSnapshot: async (localSnapshot) => localSnapshot,
      },
    });
    const localSnapshot = buildServedLocalSnapshot();
    // A resolver-shaped record (canonical keys already present) must win over
    // any summary keys: the translation must not clobber canonical fields.
    localSnapshot.controlPlaneDiagnostics.activeNodeViews = {
      ...localSnapshot.controlPlaneDiagnostics.activeNodeViews,
      effectiveActiveNodeIds: [...CLUSTER_NODE_IDS],
      effectiveNodeIds: [],
    };

    const served = await adminControlSnapshot.resolveSharedControlSnapshot(
      localSnapshot,
      {},
    );
    const fenceCoverage = served?.controlPlaneDiagnostics
      ?.publicationActiveGateHandoff?.activeGateCatchupFence?.snapshotCoverage;
    t.equal(
      fenceCoverage?.covered,
      true,
      'canonical effectiveActiveNodeIds keep coverage provable',
    );
  });
