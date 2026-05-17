import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  buildPublicationActiveGateHandoffContract,
  hasPublicationActiveGateOwnerReconcileSignal,
  projectPublicationActiveGateHandoffToOwnerCohort,
  resolvePublicationActiveGateMembershipPublicationTarget,
  selectPublicationActiveGateHandoffContract,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';

const TEST_PUBLICATION_EPOCH = 7;
const TEST_NODE_1 = 'node-1';
const TEST_NODE_2 = 'node-2';
const TEST_NODE_3 = 'node-3';
const TEST_NODE_4 = 'node-4';
const TEST_NODE_5 = 'node-5';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_PUBLICATION_REVISION = 70;
const TEST_SNAPSHOT_COVERAGE_REVISION = 71;
const TEST_SNAPSHOT_COVERAGE_UNAVAILABLE = 'unavailable';
const TEST_STALE_SNAPSHOT_REVISION_STATE = 'stale';
const TEST_ACTIVE_GATE_BUDGET = Object.freeze({
  state: 'available',
  activeGateState: 'timed_out',
});
const TEST_RECOVERY_WAIT_NODE_IDS = Object.freeze([TEST_NODE_5]);
const TEST_SEED_PUBLISHED_NODE_IDS = Object.freeze([TEST_NODE_1]);
const TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS = Object.freeze([
  TEST_NODE_2,
  TEST_NODE_3,
  TEST_NODE_4,
  TEST_NODE_5,
]);
const TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS = Object.freeze([
  TEST_NODE_1,
  TEST_NODE_2,
  TEST_NODE_3,
  TEST_NODE_4,
  TEST_NODE_5,
]);

test('publication active-gate handoff contract schedules owner reconcile from one decision table',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      nodeRows: [
        {node_id: TEST_NODE_1},
        {node_id: TEST_NODE_2},
        {node_id: TEST_NODE_3},
      ],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2, TEST_NODE_3],
      },
    });

    t.match(contract, {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
      publishedActiveNodeIds: [TEST_NODE_1],
      missingPublishedNodeIds: [TEST_NODE_2, TEST_NODE_3],
      pendingRecoveryNodeIds: [],
      pendingReconcileNodeIds: [TEST_NODE_2, TEST_NODE_3],
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_PENDING,
        targetNodeIds: [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3],
        durablePublication: {
          publicationEpoch: TEST_PUBLICATION_EPOCH,
          nodeIds: [TEST_NODE_1],
          missingNodeIds: [TEST_NODE_2, TEST_NODE_3],
        },
        missingProofReasons: [
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
            .DURABLE_PUBLICATION_INCOMPLETE,
        ],
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
    });
  });

test('publication active-gate handoff preserves nested selected missing publication evidence',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIds: [...TEST_SEED_PUBLISHED_NODE_IDS],
        activeGateProgress: {
          selectedPublishedActiveNodeIds: [
            ...TEST_SEED_PUBLISHED_NODE_IDS,
          ],
          selectedMissingPublishedNodeIds: [
            ...TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS,
          ],
        },
      },
    });

    t.match(contract, {
      expectedNodeIds: [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
      publishedActiveNodeIds: [...TEST_SEED_PUBLISHED_NODE_IDS],
      missingPublishedNodeIds: [
        ...TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS,
      ],
      pendingReconcileNodeIds: [
        ...TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS,
      ],
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_PENDING,
        targetNodeIds: [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
        durablePublication: {
          nodeIds: [...TEST_SEED_PUBLISHED_NODE_IDS],
          missingNodeIds: [
            ...TEST_SELECTED_MISSING_PUBLICATION_NODE_IDS,
          ],
        },
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
    });
  });

test('publication active-gate handoff reconcile target includes expected non-recovery handoff nodes',
  async (t) => {
    const target = resolvePublicationActiveGateMembershipPublicationTarget({
      publicationActiveGateHandoff: {
        expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
        pendingReconcileNodeIds: [TEST_NODE_2],
        pendingRecoveryNodeIds: [...TEST_RECOVERY_WAIT_NODE_IDS],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
      activeGateOwnerCohort: {
        expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
        pendingReconcileNodeIds: [TEST_NODE_2],
        pendingRecoveryNodeIds: [...TEST_RECOVERY_WAIT_NODE_IDS],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [
          TEST_NODE_2,
          TEST_NODE_3,
          TEST_NODE_4,
          TEST_NODE_5,
        ],
        membershipLifecycleSummary: {
          projectedServingNodeIds: [
            TEST_NODE_1,
            TEST_NODE_2,
            TEST_NODE_3,
            TEST_NODE_4,
            TEST_NODE_5,
          ],
          locallyEligibleNodeIds: [
            TEST_NODE_1,
            TEST_NODE_2,
            TEST_NODE_3,
            TEST_NODE_4,
            TEST_NODE_5,
          ],
          recoveryActiveNodeIds: [
            TEST_NODE_1,
            TEST_NODE_2,
            TEST_NODE_3,
            TEST_NODE_4,
            TEST_NODE_5,
          ],
          missingPublishedRecoveryActiveNodeIds: [
            TEST_NODE_2,
            TEST_NODE_3,
            TEST_NODE_4,
            TEST_NODE_5,
          ],
        },
      },
    });

    t.same(
      target.publishedActiveNodeIds,
      [TEST_NODE_1, TEST_NODE_2, TEST_NODE_3, TEST_NODE_4],
      'owner reconcile target should widen to the canonical expected non-recovery handoff cohort',
    );
    t.same(
      target.pendingReconcileNodeIds,
      [TEST_NODE_2],
      'pending reconcile diagnostics should keep the selected handoff projection',
    );
  });

test('publication active-gate selector preserves full convergence target when owner cohort narrows progress',
  async (t) => {
    const selectedHandoff = selectPublicationActiveGateHandoffContract({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [
          TEST_NODE_2,
          TEST_NODE_3,
          TEST_NODE_4,
          TEST_NODE_5,
        ],
      },
      activeGateOwnerCohort: {
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
        reasonCode:
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2],
        pendingReconcileNodeIds: [TEST_NODE_2],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
    });
    const target =
      resolvePublicationActiveGateMembershipPublicationTarget(
        selectedHandoff,
      );

    t.same(
      target.publishedActiveNodeIds,
      [...TEST_SELECTED_HANDOFF_EXPECTED_NODE_IDS],
      'selected owner handoff should publish the full convergence cohort, not only the current narrowed cohort',
    );
    t.same(
      target.pendingReconcileNodeIds,
      [TEST_NODE_2],
      'selected owner handoff should preserve the current progress subset for diagnostics',
    );
  });

test('publication active-gate handoff keeps recovery-pending nodes out of reconcile',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2],
      },
      readinessByNodeId: {
        [TEST_NODE_2]: {
          reasonCodes: [
            CONTROL_PLANE_READINESS_REASON
              .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
          ],
        },
      },
    });

    t.match(contract, {
      pendingRecoveryNodeIds: [TEST_NODE_2],
      pendingReconcileNodeIds: [],
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    });
  });

test('publication active-gate handoff projection preserves the legacy owner cohort surface',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        publishedActiveNodeIds: [TEST_NODE_1],
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [TEST_NODE_1],
        missingPublishedNodeIds: [TEST_NODE_2],
      },
    });
    const ownerCohort = projectPublicationActiveGateHandoffToOwnerCohort(
      contract,
      {
        readyLeaseNodeIds: [TEST_NODE_1],
        activeGateBudget: TEST_ACTIVE_GATE_BUDGET,
      },
    );

    t.match(ownerCohort, {
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      topologyEpoch: TEST_PUBLICATION_EPOCH,
      readyLeaseNodeIds: [TEST_NODE_1],
      pendingReconcileNodeIds: [TEST_NODE_2],
      activeGateBudget: TEST_ACTIVE_GATE_BUDGET,
    });
    t.equal(
      hasPublicationActiveGateOwnerReconcileSignal({
        publicationActiveGateHandoff: contract,
      }),
      true,
    );
  });

test('publication active-gate handoff completes only when durable publication covers the expected cohort',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [],
      },
    });

    t.match(contract, {
      missingPublishedNodeIds: [],
      pendingReconcileNodeIds: [],
      runtimePromotionAllowed: true,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE,
      reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.COMPLETE,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.ADMIT_ACTIVE_GATE,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED,
        catchupState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_READY,
        promotionState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED,
        durablePublication: {
          publicationEpoch: TEST_PUBLICATION_EPOCH,
          publicationRevision: TEST_PUBLICATION_REVISION,
        },
        snapshotCoverage: {
          revision: TEST_SNAPSHOT_COVERAGE_REVISION,
          coveredNodeCount: 2,
        },
        missingProofReasons: [],
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .PROMOTE_ACTIVE_GATE,
        promotionAllowed: true,
      },
    });
  });

test('publication active-gate catch-up fence keeps seed-only publication pending while active targets are present',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1],
      },
    });

    t.match(contract.activeGateCatchupFence, {
      state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_PENDING,
      targetNodeIds: [TEST_NODE_1, TEST_NODE_2],
      presence: {
        complete: true,
        presentNodeIds: [TEST_NODE_1, TEST_NODE_2],
      },
      durablePublication: {
        nodeIds: [TEST_NODE_1],
        missingNodeIds: [TEST_NODE_2],
      },
      missingProofReasons: [
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
          .DURABLE_PUBLICATION_INCOMPLETE,
      ],
      nextLegalAction:
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      promotionAllowed: false,
    });
    t.equal(contract.runtimePromotionAllowed, false);
  });

test('publication active-gate catch-up fence denies durable publication without snapshot coverage',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [],
      },
    });

    t.match(contract, {
      runtimePromotionAllowed: false,
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
          .PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED,
        catchupState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_READY,
        promotionState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED,
        targetNodeIds: [TEST_NODE_1, TEST_NODE_2],
        durablePublication: {
          publicationEpoch: TEST_PUBLICATION_EPOCH,
          publicationRevision: TEST_PUBLICATION_REVISION,
          covered: true,
        },
        snapshotCoverage: {
          state:
            TEST_SNAPSHOT_COVERAGE_UNAVAILABLE,
          covered: false,
        },
        missingProofReasons: [
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
            .SNAPSHOT_COVERAGE_UNAVAILABLE,
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
            .TARGET_PRESENCE_INCOMPLETE,
        ],
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .OBSERVE_SNAPSHOT_COVERAGE,
        promotionAllowed: false,
      },
    });
  });

test('publication active-gate catch-up fence never promotes stale snapshot coverage',
  async (t) => {
    const contract = buildPublicationActiveGateHandoffContract({
      expectedNodeIds: [TEST_NODE_1, TEST_NODE_2],
      activeNodeViews: {
        effectiveActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        snapshotCoverageRevision: TEST_SNAPSHOT_COVERAGE_REVISION,
        snapshotRevisionState: TEST_STALE_SNAPSHOT_REVISION_STATE,
      },
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        status: TEST_PUBLICATION_STATUS_PUBLISHED,
        publicationRevision: TEST_PUBLICATION_REVISION,
        publishedActiveNodeIds: [TEST_NODE_1, TEST_NODE_2],
        missingPublishedNodeIds: [],
      },
    });

    t.match(contract, {
      runtimePromotionAllowed: false,
      activeGateCatchupFence: {
        state:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_BLOCKED,
        catchupState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_READY,
        promotionState:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED,
        snapshotCoverage: {
          stale: true,
          revision: TEST_SNAPSHOT_COVERAGE_REVISION,
        },
        missingProofReasons: [
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
            .SNAPSHOT_COVERAGE_STALE,
        ],
        nextLegalAction:
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION
            .REFRESH_SNAPSHOT_COVERAGE,
        promotionAllowed: false,
      },
    });
  });
