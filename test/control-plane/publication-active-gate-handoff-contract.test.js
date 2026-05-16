import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  buildPublicationActiveGateHandoffContract,
  hasPublicationActiveGateOwnerReconcileSignal,
  projectPublicationActiveGateHandoffToOwnerCohort,
  resolvePublicationActiveGateMembershipPublicationTarget,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';

const TEST_PUBLICATION_EPOCH = 7;
const TEST_NODE_1 = 'node-1';
const TEST_NODE_2 = 'node-2';
const TEST_NODE_3 = 'node-3';
const TEST_NODE_4 = 'node-4';
const TEST_NODE_5 = 'node-5';
const TEST_ACTIVE_GATE_BUDGET = Object.freeze({
  state: 'available',
  activeGateState: 'timed_out',
});
const TEST_RECOVERY_WAIT_NODE_IDS = Object.freeze([TEST_NODE_5]);

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
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
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
    });
  });
