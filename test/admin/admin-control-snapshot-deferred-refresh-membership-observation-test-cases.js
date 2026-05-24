import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneSnapshotOwner,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../../src/control-plane/control-plane-error-classification.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';
import './admin-control-snapshot-deferred-refresh-membership-authoritative-publication-test-cases.js';

const TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const TEST_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED =
  'write_deferred';
const TEST_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_ENQUEUED =
  'owner_recovery_wait_enqueued';
const TEST_MEMBERSHIP_PUBLICATION_HANDOFF_REASON =
  'admin_control_snapshot_publication_handoff';
const TEST_MEMBERSHIP_PUBLICATION_HANDOFF_FIELD =
  'publicationActiveGateHandoff';
const TEST_MEMBERSHIP_PUBLICATION_PUBLISHED_ACTIVE_NODE_IDS_FIELD =
  'publishedActiveNodeIds';

test('AdminControlSnapshot repair-deferred trigger refreshes after visible owner publication',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    let latestPublicationReadOptions = null;
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS,
          ],
        },
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PARTIAL_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[2],
          ],
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            locallyEligibleNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            recoveryActiveNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            missingPublishedRecoveryActiveNodeIds: [
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[2],
            ],
          },
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            _publicationActiveGateHandoff,
            options = {},
          ) {
            reconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          async reconcileClusterMembership(options = {}) {
            reconcileOptions = options;
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          async getLatestClusterPublication(options = {}) {
            latestPublicationReadOptions = options;
            return {
              publicationId:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
              publicationKind:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
              publicationEpoch:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
              status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              publishedActiveNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
              ],
              requiredAckNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
              ],
              acknowledgedNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
              ],
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        return staleSnapshot;
      }
      if (
        options.allowAuthoritativeReadinessRefresh !==
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH
      ) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH_ERROR,
        );
      }
      const observedPublication =
        await snapshot.ensureMembershipPublicationObservation({
          preferAuthoritativeRead:
            options.preferAuthoritativePublicationRead === true,
        });
      return {
        nodes: [...observedPublication.publishedActiveNodeIds],
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationEpoch: observedPublication.publicationEpoch,
            status: observedPublication.status,
            publishedActiveNodeIds: [
              ...observedPublication.publishedActiveNodeIds,
            ],
          },
        },
      };
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      reconcileOptions.reconcileAuthoritativeMembershipPublication,
      true,
      'repair-deferred trigger should keep explicit owner-command intent',
    );
    t.equal(
      buildOptions.length,
      2,
      'a visible owner outcome should get one bounded authoritative snapshot rebuild',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      'the visible owner outcome should improve returned snapshot coverage',
    );
    t.same(
      latestPublicationReadOptions,
      {
        preferAuthoritativeRead:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
        readProfile:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
      },
      'the bounded rebuild should use authoritative publication reads',
    );
    t.equal(
      buildOptions[1].allowAuthoritativeReadinessRefresh,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH,
      'the bounded rebuild should not reopen authoritative readiness refresh',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'the returned publication convergence should display the awaited owner outcome',
    );
  });

test('AdminControlSnapshot retains flat coverage refresh when visible owner publication drains handoff',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const pendingHandoff = {
      schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
      state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
      reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
      nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      expectedNodeIds: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
      ],
      publishedActiveNodeIds: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_FLAT_PUBLISHED_NODE_IDS,
      ],
      pendingReconcileCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_FLAT_PENDING_COUNT,
      pendingReconcileNodeIds: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_FLAT_PENDING_NODE_IDS,
      ],
      runtimePromotionAllowed:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
    };
    const refreshedHandoff = {
      ...pendingHandoff,
      state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_COMPLETE,
      reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_COMPLETE,
      nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_ADMIT_ACTIVE_GATE,
      publishedActiveNodeIds: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
      ],
      pendingReconcileCount:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CLEARED_PENDING_COUNT,
      pendingReconcileNodeIds: [],
      runtimePromotionAllowed:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_TRUE,
    };
    const staleSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_FLAT_COVERAGE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: pendingHandoff,
        activeGateOwnerCohort: pendingHandoff,
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_FLAT_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_FLAT_PENDING_NODE_IDS,
          ],
        },
      },
    };
    const refreshedSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_FLAT_COVERAGE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: refreshedHandoff,
        activeGateOwnerCohort: refreshedHandoff,
        publicationConvergence: {
          publicationEpoch:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
          ],
          missingPublishedNodeIds: [],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            _publicationActiveGateHandoff,
            options = {},
          ) {
            reconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NODE_IDS,
                ],
              },
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return refreshedSnapshot;
    };

    const triggeredSnapshot =
      await snapshot.triggerMembershipPublicationHandoffOwnerCommand(
        staleSnapshot,
        {},
      );
    const refreshResult =
      await snapshot.prepareVisibleMembershipPublicationHandoffRefresh(
        triggeredSnapshot,
        {},
      );

    t.equal(
      reconcileOptions.reconcileAuthoritativeMembershipPublication,
      true,
      'visible owner handoff should come from the narrow owner command',
    );
    t.equal(
      buildOptions.length,
      1,
      'visible owner handoff should perform one bounded refresh',
    );
    t.same(
      refreshResult.snapshot.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_FLAT_COVERAGE_NODE_IDS],
      'the retained refresh should not require node coverage to increase',
    );
    t.equal(
      refreshResult.refreshed,
      true,
      'flat coverage refresh should be retained when handoff evidence improves',
    );
    t.match(
      refreshResult.snapshot.controlPlaneDiagnostics
        .publicationActiveGateHandoff,
      {
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CLEARED_PENDING_COUNT,
        pendingReconcileNodeIds: [],
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_TRUE,
      },
      'the retained refresh should carry drained owner reconcile evidence',
    );
    t.match(
      refreshResult.snapshot.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'the retained refresh should preserve the visible owner outcome',
    );
  });

test('AdminControlSnapshot repair-deferred trigger preserves original snapshot after owner outcome',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      publishedNodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      projectedNodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publicationStatus: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            _publicationActiveGateHandoff,
            options = {},
          ) {
            reconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          async reconcileClusterMembership(options = {}) {
            reconcileOptions = options;
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        return staleSnapshot;
      }
      throw new Error(ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_CATCHUP_REBUILD_ERROR);
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      reconcileOptions.reconcileAuthoritativeMembershipPublication,
      true,
      'repair-deferred trigger should keep explicit owner-command intent',
    );
    t.equal(
      buildOptions.length,
      2,
      'repair-deferred trigger should try one bounded rebuild after visible owner outcome',
    );
    t.same(
      result.nodes,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      'the returned deferred snapshot should preserve the original observed coverage',
    );
    t.same(
      result.controlPlaneDiagnostics.publicationConvergence
        .publishedActiveNodeIds,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS],
      'the returned publication convergence should not convert an owner outcome into publication truth',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'the returned publication convergence should surface the owner outcome',
    );
  });

test('AdminControlSnapshot repair-deferred trigger queues owner reconcile without rebuild after pressure defers',
  async (t) => {
    const buildOptions = [];
    const reconcileOptions = [];
    const enqueuedContexts = [];
    let latestPublicationReadAttempted = false;
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            locallyEligibleNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            recoveryActiveNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
            missingPublishedRecoveryActiveNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
            ],
          },
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileClusterMembership(options = {}) {
            reconcileOptions.push(options);
            if (reconcileOptions.length === 1) {
              throw new Error(ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR);
            }
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                published_active_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                ],
              },
            };
          },
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            enqueuedContexts.push(context);
          },
          async getLatestClusterPublication() {
            latestPublicationReadAttempted = true;
            return {
              publication_id:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID,
              publication_kind:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
              publication_epoch:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
              status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
              published_active_node_ids: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              required_ack_node_ids: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
              acknowledged_node_ids: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
              ],
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        return staleSnapshot;
      }
      const observedPublication =
        await snapshot.ensureMembershipPublicationObservation({
          preferAuthoritativeRead:
            options.preferAuthoritativePublicationRead === true,
          reconcileAuthoritativeMembershipPublication:
            options.reconcileAuthoritativeMembershipPublication === true,
          publicationActiveGateHandoff:
            options.publicationActiveGateHandoff,
        });
      return {
        nodes: [...observedPublication.publishedActiveNodeIds],
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationEpoch: observedPublication.publicationEpoch,
            status: observedPublication.status,
            publishedActiveNodeIds: [
              ...observedPublication.publishedActiveNodeIds,
            ],
          },
        },
      };
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      reconcileOptions.length,
      0,
      'trigger-only fallback should not run broad reconcileClusterMembership directly',
    );
    t.match(
      enqueuedContexts[0],
      {
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        readProfile:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        skipPublicationWriteReadback:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'the pressure-deferred direct attempt should still enqueue the owner catch-up target',
    );
    t.equal(
      buildOptions.length,
      1,
      'the pressure-deferred trigger-only path should not rebuild the snapshot',
    );
    t.equal(
      latestPublicationReadAttempted,
      false,
      'the trigger-only path should not run publication observation reads',
    );
    t.same(
      result.nodes,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      'the returned deferred snapshot should keep the original snapshot coverage',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
        enqueued: true,
      },
      'the returned deferred snapshot should surface the queued owner outcome',
    );
  });

test('AdminControlSnapshot repair-deferred trigger keeps bounded handoff retry after rejected owner enqueue',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const staleSnapshot = {
      nodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            _publicationActiveGateHandoff,
            options = {},
          ) {
            reconcileOptions = options;
            return {
              schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
              target: {
                reconcileRequired: true,
              },
              publicationRow: null,
              enqueued: false,
              retryAfterMs:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
              controlPlaneConvergence: {
                schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
                convergenceClass:
                  CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
                pressureOutcome:
                  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME
                    .CRITICAL_REJECTED,
                operation:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OPERATION,
                retryAfterMs:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
              },
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return staleSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => ({
      applied: false,
      failedTables: [TABLES.SERVICES],
      causeChain: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_BACKPRESSURE_CAUSE,
      ],
      retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS,
      localQueryTransport: {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_QUERY_TRANSPORT_READY_STATE,
        ready: true,
      },
      errors: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_DEGRADED_ERROR,
      ],
    });

    const result = await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
    });

    t.equal(
      reconcileOptions.reconcileAuthoritativeMembershipPublication,
      true,
      'deferred owner retry should still come from the handoff owner command',
    );
    t.equal(
      buildOptions.length,
      1,
      'a rejected owner enqueue should not perform a visibility rebuild',
    );
    t.same(
      result.nodes,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0]],
      'the returned snapshot should keep the original coverage while retry remains pending',
    );
    t.same(
      result.controlPlaneDiagnostics.publicationConvergence
        .publishedActiveNodeIds,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS],
      'a deferred owner outcome should not widen publication truth',
    );
    t.match(
      result.snapshotObservation,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
        contractState:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
        retryAfterMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
      },
      'the returned repair-deferred observation should retain the bounded owner retry',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        enqueued: false,
        retryAfterMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
      },
      'the publication convergence diagnostics should retain the non-enqueued owner outcome',
    );
  });

test('AdminControlSnapshot no-attempt path still triggers publication owner command',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const staleSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: 'pending',
          reasonCode: 'owner_reconcile_pending',
          pendingReconcileCount: 1,
          pendingReconcileNodeIds: ['node-2'],
        },
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const catchupSnapshot = {
      nodes: ['node-1', 'node-2'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 2,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      controlPlaneReadinessService: {
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            reconcileOptions = context;
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return buildOptions.length === 1 ? staleSnapshot : catchupSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.match(
      reconcileOptions,
      {
        preferAuthoritativeRead: true,
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
        allowPendingVisibility: true,
        allowPressureDefer: false,
        readProfile:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        skipPublicationWriteReadback:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'repair-deferred no-attempt path should perform the narrow publication-owner reconcile',
    );
    t.equal(
      buildOptions.length,
      1,
      'the no-attempt trigger-only path should not rebuild the snapshot',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the returned deferred snapshot should keep the original snapshot',
    );
    t.match(
      result,
      {
        snapshotObservation: {
          state: 'stale_usable',
          contractState: 'pending',
          nextAction: 'wait',
        },
        observationMode: 'repair_deferred',
      },
      'the no-attempt deferred path should keep the shared-owner stale outcome',
    );
  });

test(ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_OPEN_PROGRESS_TEST_NAME, async (t) => {
  const buildOptions = [];
  let reconcileOptions = null;
  const staleSnapshot = {
    nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS],
    controlPlaneDiagnostics: {
      publicationConvergence: {
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS_OPEN,
        publicationStatus: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS_OPEN,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_RECENT_NODE_IDS,
        ],
        pendingAckNodeIds: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS[0],
        ],
        pendingAckCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_OPEN_PENDING_ACK_COUNT,
        activeGate: {
          progress: {
            publicationActiveGateHandoffState:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
            publicationActiveGateHandoffReasonCode:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
            publicationActiveGateHandoffNextAction:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
            publicationActiveGateHandoffRuntimePromotionAllowed:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
            publicationActiveGateHandoffPendingReconcileCount:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
            publicationActiveGateHandoffPendingReconcileNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
            ],
            selectedPublishedActiveNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
            selectedMissingPublishedNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
            ],
          },
        },
      },
    },
  };
  const snapshot = new AdminControlSnapshot({
    nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
    controlPlaneReadinessService: {
      membershipPublicationService: {
        enqueueClusterMembershipReconcile(_reason, context = {}) {
          reconcileOptions = context;
        },
      },
    },
  });
  snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
    controlSnapshot: snapshot,
  });
  snapshot.buildLocalControlSnapshot = async (options = {}) => {
    buildOptions.push(options);
    return staleSnapshot;
  };
  snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
  snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
    shouldRepair: true,
    triggerCodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CACHE_STALE_TRIGGER],
    nodeCoverage: {
      activeProjection: {
        hasCoverageGap: false,
      },
    },
  });

  const result = await snapshot.resolveLocalControlSnapshot();

  t.match(
    reconcileOptions,
    {
      publishedActiveNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      requiredAckNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      acknowledgedNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      allowPendingVisibility: true,
      allowPressureDefer:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED,
      readProfile:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
      skipPublicationWriteReadback:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
    },
    'OPEN publication flattened progress should enqueue only the selected owner reconcile cohort',
  );
  t.equal(
    buildOptions.length,
    1,
    'OPEN publication owner handoff should not rebuild until the owner outcome is visible',
  );
  t.same(
    result.nodes,
    [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS],
    'OPEN publication handoff should preserve the original snapshot coverage while reconcile waits',
  );
  t.match(
    result.controlPlaneDiagnostics.publicationConvergence,
    {
      status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS_OPEN,
      publicationStatus: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS_OPEN,
    },
    'OPEN publication handoff should not convert publication truth locally',
  );
  t.match(
    result.controlPlaneDiagnostics.publicationConvergence
      .membershipPublicationHandoffOutcome,
    {
      state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
      reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
      enqueued: true,
    },
    'OPEN publication handoff should surface a bounded queued owner outcome',
  );
});

test('AdminControlSnapshot repair-unavailable path still triggers publication owner command',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const staleSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: 'pending',
          reasonCode: 'owner_reconcile_pending',
          pendingReconcileCount: 1,
          pendingReconcileNodeIds: ['node-2'],
        },
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const catchupSnapshot = {
      nodes: ['node-1', 'node-2'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 2,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      controlPlaneReadinessService: {
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            reconcileOptions = context;
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return buildOptions.length === 1 ? staleSnapshot : catchupSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => false;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.match(
      reconcileOptions,
      {
        publishedActiveNodeIds: ['node-1', 'node-2'],
        requiredAckNodeIds: ['node-1', 'node-2'],
        acknowledgedNodeIds: ['node-1', 'node-2'],
        readProfile:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        skipPublicationWriteReadback:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'repair-unavailable snapshots should still enqueue publication owner catch-up',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the repair-unavailable path should return the original trigger-only snapshot',
    );
  });

test('AdminControlSnapshot repair-deferred shared owner wakes recovery waits without publication catch-up',
  async (t) => {
    const buildOptions = [];
    let reconcileReason = null;
    let reconcileContext = null;
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state: 'pending',
          reasonCode: 'owner_reconcile_pending',
          nextAction: TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
          pendingRecoveryCount: 1,
          pendingRecoveryNodeIds: ['node-2'],
          pendingReconcileCount: 0,
          pendingReconcileNodeIds: [],
        },
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
      controlPlaneReadinessService: {
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(reason, context = {}) {
            reconcileReason = reason;
            reconcileContext = context;
            return true;
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['cache_stale_watermark'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      buildOptions.length,
      1,
      'wait_owner_recovery should not schedule a visibility rebuild from repair-deferred admin reads',
    );
    t.equal(
      reconcileReason,
      TEST_MEMBERSHIP_PUBLICATION_HANDOFF_REASON,
      'wait_owner_recovery should wake the selected owner command queue',
    );
    t.equal(
      Object.hasOwn(
        reconcileContext,
        TEST_MEMBERSHIP_PUBLICATION_PUBLISHED_ACTIVE_NODE_IDS_FIELD,
      ),
      false,
      'wait_owner_recovery should not carry explicit publication targets',
    );
    t.match(
      reconcileContext?.[TEST_MEMBERSHIP_PUBLICATION_HANDOFF_FIELD],
      {
        nextAction: TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
        pendingRecoveryNodeIds: ['node-2'],
        pendingReconcileNodeIds: [],
      },
      'wait_owner_recovery should preserve recovery debt on the handoff-only wake',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the deferred snapshot should stay on the original local snapshot',
    );
    t.match(
      result.controlPlaneDiagnostics.membershipPublicationHandoffOutcome,
      {
        state:
          TEST_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
        enqueued: true,
        reasonCode:
          TEST_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_ENQUEUED,
      },
      'the deferred snapshot should surface an actionable owner recovery wake',
    );
  });

test('AdminControlSnapshot repair-deferred shared owner skips publication catch-up without pending reconcile evidence',
  async (t) => {
    const buildOptions = [];
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch: 1,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1'],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => ({
      applied: false,
      failedTables: [TABLES.SERVICES],
      causeChain: ['control_plane_backpressure'],
      retryAfterMs: 12000,
      localQueryTransport: {
        state: 'ready',
        ready: true,
      },
      errors: ['control_plane_pressure_degraded'],
    });

    const result = await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
    });

    t.equal(
      buildOptions.length,
      1,
      'repair-deferred degradation should not run publication catch-up without owner-reconcile evidence',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the deferred snapshot should stay on the original local snapshot',
    );
    t.match(
      result,
      {
        snapshotObservation: {
          state: 'deferred_refresh',
          contractState: 'deferred',
          nextAction: 'retry',
          retryAfterMs: 12000,
        },
        observationMode: 'repair_deferred',
      },
      'the local deferred retry outcome should remain structured',
    );
  });
