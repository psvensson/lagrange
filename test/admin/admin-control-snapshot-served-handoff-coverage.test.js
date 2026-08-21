import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';

// CL-022 guard: the serve-time active-gate handoff rebuild
// (resolveSharedControlSnapshot -> attachControlSnapshotObservationActiveGateHandoff)
// receives the same canonical *ActiveNodeIds record written into
// controlPlaneDiagnostics.activeNodeViews. A second serialized field dialect
// previously required a translation here and allowed writer/reader drift to
// permanently deny runtime promotion.

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
      // The canonical summary shape written by buildLocalControlSnapshot.
      activeNodeViews: {
        authoritativeSource: 'published_membership',
        authoritativeActiveNodeIds: [...CLUSTER_NODE_IDS],
        projectedServingNodeIds: [...CLUSTER_NODE_IDS],
        locallyEligibleNodeIds: [...CLUSTER_NODE_IDS],
        suspectedOrTransitioningNodeIds: [],
        membershipFreeze: null,
        effectiveSource: 'published_membership',
        effectiveActiveNodeIds: [...CLUSTER_NODE_IDS],
        projectedActiveNodeIds: [...CLUSTER_NODE_IDS],
        publishedActiveNodeIds: [...CLUSTER_NODE_IDS],
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

test('served control snapshot handoff proves coverage from the canonical node view',
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
      'fence snapshot-coverage evidence is available from the canonical view',
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

test('served handoff ignores the retired short node-set field dialect',
  async (t) => {
    const adminControlSnapshot = new AdminControlSnapshot({
      nodeId: LOCAL_NODE_ID,
      controlPlaneSnapshotOwner: {
        resolveControlSnapshot: async (localSnapshot) => localSnapshot,
      },
    });
    const localSnapshot = buildServedLocalSnapshot();
    // Retired short names must not silently become a second coverage input.
    localSnapshot.controlPlaneDiagnostics.activeNodeViews = {
      ...localSnapshot.controlPlaneDiagnostics.activeNodeViews,
      effectiveActiveNodeIds: [],
      effectiveNodeIds: [...CLUSTER_NODE_IDS],
    };

    const served = await adminControlSnapshot.resolveSharedControlSnapshot(
      localSnapshot,
      {},
    );
    const fenceCoverage = served?.controlPlaneDiagnostics
      ?.publicationActiveGateHandoff?.activeGateCatchupFence?.snapshotCoverage;
    t.equal(
      fenceCoverage?.covered,
      false,
      'only canonical effectiveActiveNodeIds can prove coverage',
    );
  });
