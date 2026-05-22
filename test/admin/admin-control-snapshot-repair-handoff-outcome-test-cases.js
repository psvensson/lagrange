import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneSnapshotOwner,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceReplayFixture,
  replayTopologyConvergenceFixture,
} from '../../src/diagnostics/topology-convergence-graph.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';

const TEST_DEFER_INLINE_OWNER_COMMAND_FIELD = 'deferInlineOwnerCommand';
const TEST_DEFERRED_SKIP_PUBLICATION_WRITE_READBACK = true;
const TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD =
  'publicationActiveGateHandoff';
const TEST_PUBLISHED_ACTIVE_NODE_IDS_FIELD = 'publishedActiveNodeIds';
const TEST_ALLOW_EMPTY_PRELOADED_ROWS_FIELD = 'allowEmptyPreloadedRows';
const TEST_NODE_ROWS_FIELD = 'nodeRows';
const TEST_OWNER_QUEUE_STOPPED_REASON = 'owner_queue_stopped';
const TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON = 'selected_timeout';
const TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_DIVISOR = 2;
const TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS = 16000;

test('AdminControlSnapshot surfaces handoff owner outcome when repair is not selected',
  async (t) => {
    let observedHandoff = null;
    const localSnapshot = {
      nodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
      ],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: {
          schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
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
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication(
            publicationActiveGateHandoff,
          ) {
            observedHandoff = publicationActiveGateHandoff;
            return {
              schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: false,
      triggerCodes: [],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });

    const result = await snapshot.resolveLocalControlSnapshot();

    t.match(
      observedHandoff,
      {
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
      },
      'active-gate owner reconcile signals should trigger the membership publication owner even without repair',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'representative publication convergence should surface the owner command outcome',
    );
  });

test('AdminControlSnapshot defers snapshot-query handoff owner commands to the owner queue',
  async (t) => {
    let inlineReconcileCalled = false;
    let enqueueReason = null;
    let enqueuedContext = null;
    const publicationActiveGateHandoff = {
      schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
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
    };
    const localSnapshot = {
      nodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
      ],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff,
        activeGateOwnerCohort: publicationActiveGateHandoff,
        publicationConvergence: {
          publicationEpoch:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication() {
            inlineReconcileCalled = true;
            throw new Error(
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR,
            );
          },
          enqueueClusterMembershipReconcile(reason, context = {}) {
            enqueueReason = reason;
            enqueuedContext = context;
            return true;
          },
        },
      },
    });

    const result = await snapshot.triggerMembershipPublicationHandoffOwnerCommand(
      localSnapshot,
      {
        [TEST_DEFER_INLINE_OWNER_COMMAND_FIELD]: true,
      },
    );

    t.equal(
      inlineReconcileCalled,
      false,
      'snapshot-query owner command should not await inline publication reconcile',
    );
    t.equal(
      enqueueReason,
      'admin_control_snapshot_publication_handoff',
      'snapshot-query owner command should enqueue the canonical handoff reason',
    );
    t.same(
      enqueuedContext[TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD]
        ?.pendingReconcileNodeIds,
      [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
      ],
      'snapshot-query owner command should carry the active-gate handoff contract',
    );
    t.equal(
      Object.hasOwn(enqueuedContext, TEST_PUBLISHED_ACTIVE_NODE_IDS_FIELD),
      false,
      'snapshot-query owner command should let the owner derive the handoff target',
    );
    t.equal(
      Object.hasOwn(enqueuedContext, TEST_ALLOW_EMPTY_PRELOADED_ROWS_FIELD),
      false,
      'snapshot-query owner command should not force empty authoritative reads',
    );
    t.equal(
      Object.hasOwn(enqueuedContext, TEST_NODE_ROWS_FIELD),
      false,
      'snapshot-query owner command should not preload empty membership rows',
    );
    t.equal(
      enqueuedContext.skipPublicationWriteReadback,
      TEST_DEFERRED_SKIP_PUBLICATION_WRITE_READBACK,
      'snapshot-query owner command should avoid immediate durable readback',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        enqueued: true,
        reasonCode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
        controlPlaneConvergence: {
          convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
          pressureOutcome:
            CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
        },
        target: {
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
      },
      'snapshot-query owner command should return a structured deferred outcome',
    );
  });

test('AdminControlSnapshot reports rejected deferred handoff owner queue admission',
  async (t) => {
    let inlineReconcileCalled = false;
    const publicationActiveGateHandoff = {
      schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
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
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication() {
            inlineReconcileCalled = true;
          },
          enqueueClusterMembershipReconcile() {
            this.lastControlPlaneConvergenceQueueOutcome = {
              convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
              pressureOutcome:
                CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
              reasonCode: TEST_OWNER_QUEUE_STOPPED_REASON,
            };
            return false;
          },
        },
      },
    });

    const result = await snapshot.triggerMembershipPublicationHandoffOwnerCommand(
      {
        controlPlaneDiagnostics: {
          publicationActiveGateHandoff,
          activeGateOwnerCohort: publicationActiveGateHandoff,
          publicationConvergence: {
            publicationEpoch:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
            status:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          },
        },
      },
      {
        [TEST_DEFER_INLINE_OWNER_COMMAND_FIELD]: true,
      },
    );

    t.equal(
      inlineReconcileCalled,
      false,
      'rejected deferred owner admission should still avoid inline reconcile',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        enqueued: false,
        reasonCode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_SERVICE_UNAVAILABLE,
        controlPlaneConvergence: {
          convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
          pressureOutcome:
            CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
          reasonCode: TEST_OWNER_QUEUE_STOPPED_REASON,
        },
      },
      'deferred owner command should not report enqueued when the owner queue rejects admission',
    );
  });

test('AdminControlSnapshot queues handoff reconcile when awaited owner reconcile is pressure-deferred',
  async (t) => {
    let enqueuedContext = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileClusterMembership() {
            throw new Error(ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR);
          },
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            enqueuedContext = context;
          },
        },
      },
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
        enqueued: true,
      },
      'pressure-deferred fallback reconcile should return a structured queued owner outcome',
    );
    t.match(
      enqueuedContext,
      {
        preferAuthoritativeRead: true,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        allowPendingVisibility: true,
        allowPressureDefer: false,
        readProfile:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        allowEmptyPreloadedRows:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
        disableNestedPriorityRecoveryPlanning:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_DISABLE_NESTED_PRIORITY_RECOVERY,
        nodeRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        nodeEndpointRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        serviceRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        partitionRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        replicaOperationRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        readinessEntries: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        skipPublicationWriteReadback:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'pressure-deferred awaited reconcile should still enqueue the canonical owner catch-up context',
    );
    t.equal(
      enqueuedContext.readProfile,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
      'queued handoff reconcile should preserve diagnostics read intent',
    );
  });

test('AdminControlSnapshot queues handoff reconcile through SQL storage admission readiness owner',
  async (t) => {
    let enqueuedContext = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {},
      sqlQueryEngine: {
        rebalanceCoordinator: {
          storageAdmissionService: {
            controlPlaneReadinessService: {
              membershipPublicationService: {
                enqueueClusterMembershipReconcile(_reason, context = {}) {
                  enqueuedContext = context;
                },
              },
            },
          },
        },
      },
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
        enqueued: true,
      },
      'storage-admission runtime owner fallback should return the queued handoff outcome',
    );
    t.match(
      enqueuedContext,
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
      },
      'storage-admission runtime owner fallback should enqueue the canonical handoff target',
    );
  });

test('AdminControlSnapshot returns handoff service-unavailable outcome when runtime owner is absent',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {},
      sqlQueryEngine: {},
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_SERVICE_UNAVAILABLE,
        enqueued: false,
        target: {
          reconcileRequired: true,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
        },
      },
      'missing runtime owner should still return a structured handoff outcome',
    );
  });

test('AdminControlSnapshot surfaces handoff command errors as structured outcomes',
  async (t) => {
    const commandError =
      new Error(ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR);
    commandError.retryAfterMs =
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS;
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
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication() {
            throw commandError;
          },
        },
      },
    });

    const triggeredSnapshot =
      await snapshot.triggerMembershipPublicationHandoffOwnerCommand(
        staleSnapshot,
      );

    t.match(
      triggeredSnapshot.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_COMMAND_ERROR,
        retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS,
      },
      'trigger-only command failures should stay visible in publication convergence diagnostics',
    );
  });

test('AdminControlSnapshot distinguishes critical convergence defer from ordinary repair defer',
  async (t) => {
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
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication() {
            return {
              schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
              enqueued: false,
              target: {
                reconcileRequired: true,
              },
              [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_CONVERGENCE]: {
                convergenceClass:
                  CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
                pressureOutcome:
                  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME
                    .CRITICAL_DEFERRED,
                operation:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OWNER_WAKE,
                retryAfterMs:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_COMMAND_RETRY_AFTER_MS,
              },
            };
          },
        },
      },
    });

    const triggeredSnapshot =
      await snapshot.triggerMembershipPublicationHandoffOwnerCommand(
        staleSnapshot,
      );

    t.match(
      triggeredSnapshot.controlPlaneDiagnostics,
      {
        criticalConvergenceDeferred:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_DEFERRED,
        ordinaryRepairDeferred:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED,
        controlPlaneConvergence: {
          convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
          pressureOutcome:
            CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED,
          operation: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OWNER_WAKE,
        },
        publicationConvergence: {
          criticalConvergenceDeferred:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_DEFERRED,
          ordinaryRepairDeferred:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED,
        },
        activeGateOwnerCohort: {
          criticalConvergenceDeferred:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_DEFERRED,
          ordinaryRepairDeferred:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_NOT_DEFERRED,
        },
      },
      'critical convergence defer should stay distinct from ordinary repair deferral',
    );
  });

test('AdminControlSnapshot handoff reconcile defers when publication readback is unavailable',
  async (t) => {
    let publicationReadbackAttempts = 0;
    const upsertedRows = [];
    const publicationOwner = {
      async listPublications() {
        return [
          {
            publication_id:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID,
            publication_kind:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
            publication_epoch:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
            status:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
            published_active_node_ids: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
            required_ack_node_ids: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
            acknowledged_node_ids: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
          },
        ];
      },
      async getPublication() {
        publicationReadbackAttempts += 1;
        throw new Error(ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READBACK_FAILURE);
      },
      async upsertPublication(row) {
        upsertedRows.push(row);
        return row;
      },
    };
    const membershipPublicationService =
      new MembershipPublicationCoordinator({
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
        controlPlanePublicationsOwner: publicationOwner,
        systemTableCache: {
          getAll() {
            return [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS];
          },
        },
        now: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      });
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService,
      },
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.equal(
      publicationReadbackAttempts > 0,
      true,
      'handoff catch-up should attempt diagnostics readback before reporting success',
    );
    t.equal(
      upsertedRows.length,
      0,
      'handoff catch-up should not report or patch a write when durable readback is unavailable',
    );
    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        publicationRow: null,
        enqueued: true,
        controlPlaneConvergence: {
          convergenceClass:
            CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
          pressureOutcome:
            CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
        },
      },
      'the awaited handoff reconcile should return a structured critical defer without carrying an unverified publication row',
    );
  });

test('AdminControlSnapshot queues handoff reconcile when awaited owner reconcile returns a stale target',
  async (t) => {
    let enqueuedContext = null;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileClusterMembership() {
            return {
              publicationRow: {
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
              },
            };
          },
          enqueueClusterMembershipReconcile(_reason, context = {}) {
            enqueuedContext = context;
          },
        },
      },
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      });

    t.match(
      publicationOutcome,
      {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        publicationRow: null,
        enqueued: true,
        controlPlaneConvergence: {
          convergenceClass:
            CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
          pressureOutcome:
            CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
        },
      },
      'stale awaited reconcile rows should return a structured critical defer instead of a completed handoff',
    );
    t.match(
      enqueuedContext,
      {
        preferAuthoritativeRead: true,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        allowPendingVisibility: true,
        allowPressureDefer: false,
        readProfile:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        allowEmptyPreloadedRows:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
        disableNestedPriorityRecoveryPlanning:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_DISABLE_NESTED_PRIORITY_RECOVERY,
        nodeRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        nodeEndpointRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        serviceRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        partitionRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        replicaOperationRows: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        readinessEntries: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_EMPTY_ROWS,
        skipPublicationWriteReadback:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
      },
      'stale awaited reconcile rows should requeue the canonical owner catch-up context',
    );
  });

test('AdminControlSnapshot keeps handoff reconcile outcomes out of publication observation reads',
  async (t) => {
    let latestPublicationReadAttempted = false;
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      nowFn: () => ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_NOW_MS,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileClusterMembership() {
            return {
              publicationRow: {
                publication_id:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                publication_kind:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                publication_epoch:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                status:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
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
          async getLatestClusterPublication() {
            latestPublicationReadAttempted = true;
            return {
              publication_id:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_STALE_PUBLICATION_ID,
              publication_kind:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
              publication_epoch:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
              status:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
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

    await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff(
      {
        schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
        publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        missingPublishedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        runtimePromotionAllowed:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RUNTIME_PROMOTION_ALLOWED_FALSE,
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      },
    );

    const observedPublication =
      await snapshot.ensureMembershipPublicationObservation({
        preferAuthoritativeRead:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_READ,
      });

    t.equal(
      latestPublicationReadAttempted,
      true,
      'authoritative publication observation should stay on the publication read path',
    );
    t.notMatch(
      observedPublication,
      {
        publicationEpoch:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
        status:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_STATUS,
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
      },
      'handoff reconcile outcomes should not become publication observation truth',
    );
  });

test('AdminControlSnapshot repair-deferred shared owner emits retry action after attempted repair',
  async (t) => {
    let repairOptions = null;
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CACHE_STALE_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return {
        applied: false,
        failedTables: [TABLES.SERVICES],
        causeChain: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_BACKPRESSURE_CAUSE,
        ],
        retryAfterMs: TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS,
        localQueryTransport: {
          state:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_QUERY_TRANSPORT_READY_STATE,
          ready: true,
        },
        errors: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_DEGRADED_ERROR,
        ],
      };
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
      queryTimeoutMs:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
    });

    t.equal(
      repairOptions?.queryTimeoutMs,
      Math.floor(
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS /
          TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_DIVISOR,
      ),
      'non-forced repair should reserve caller query time for the deferred snapshot response',
    );
    t.match(
      result,
      {
        snapshotObservation: {
          state: 'deferred_refresh',
          contractState: 'deferred',
          nextAction: 'retry',
          reasonCodes: ['cache_stale_watermark'],
          retryAfterMs: TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS,
          refreshState: 'deferred',
        },
        observationMode: 'repair_deferred',
        adminObservation: {
          sharedOwnerResolved: true,
          repair: {
            deferred: true,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_DEFERRED,
        },
      },
      'attempted repair deferral should expose a legal retry action instead of wait-only stale evidence',
    );
  });

test('AdminControlSnapshot reserves caller query timeout for authoritative repair',
  async (t) => {
    let repairOptions = null;
    const localSnapshot = {
      nodes: ['node-1'],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: 'node-1',
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return {
        applied: true,
      };
    };

    await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
    });

    t.equal(
      repairOptions?.queryTimeoutMs,
      Math.floor(
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS /
          TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_DIVISOR,
      ),
      'authoritative snapshot repair should leave caller query budget for the snapshot response',
    );
  });

test('AdminControlSnapshot forced participant repair failure preserves the local snapshot',
  async (t) => {
    const buildOptions = [];
    let sharedOwnerRepairCalls = 0;
    const localSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
        error: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
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
          hasCoverageGap: true,
          missingNodeIds: ['node-4', 'node-5'],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
      repairFailure;

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      1,
      'participant failure should preserve the already built local snapshot',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after a deferred participant failure',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      'deferred participant failure should keep metric-moving snapshot coverage',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: ['discovery_node_coverage_gap'],
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'forced participant failure should become a structured deferred owner observation',
    );
  });

test('AdminControlSnapshot forced participant repair failure returns a usable fallback snapshot',
  async (t) => {
    const buildOptions = [];
    let evaluationCalls = 0;
    let repairOptions = null;
    let sharedOwnerRepairCalls = 0;
    const emptySelectedSourceSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const fallbackSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
        error: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (
        buildOptions.length > 1 &&
        (
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
          ] === true ||
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
          ] === true ||
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
          ] === true
        )
      ) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      return buildOptions.length === 1 ?
        emptySelectedSourceSnapshot :
        fallbackSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => {
      evaluationCalls += 1;
      return {
        shouldRepair: true,
        triggerCodes: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
        ],
        nodeCoverage: {
          ...(evaluationCalls > 1 ?
            {
              sharedMetadata: {
                referencedNodeIds: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS,
                ],
              },
            } :
            {}),
          activeProjection: {
            hasCoverageGap: true,
            missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
          },
        },
      };
    };
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return repairFailure;
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      2,
      'participant repair failure should try one local fallback when the selected source snapshot has no usable coverage',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should exit the forced repair path before reading the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should not schedule another authoritative repair while repair is deferred',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
      ],
      false,
      'fallback should avoid the failed authoritative publication read path',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_READINESS_REFRESH
      ],
      false,
      'fallback should not reopen readiness refresh',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_RECONCILE_AUTHORITATIVE_PUBLICATION
      ],
      false,
      'fallback should not reconcile publication while repair is deferred',
    );
    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced repair should reserve caller query time for returning the fallback snapshot',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after fallback deferral',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
        (left, right) => left.localeCompare(right),
      ),
      'deferred participant failure should project service-discovery references above two-of-five',
    );
    t.same(
      result.projectedNodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
        (left, right) => left.localeCompare(right),
      ),
      'deferred participant failure should expose projected fallback coverage',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
          ],
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'connection-closed participant repair failure should become a structured deferred snapshot',
    );
  });

test('AdminControlSnapshot thrown forced repair connection failure preserves a metric-moving fallback',
  async (t) => {
    const buildOptions = [];
    let repairOptions = null;
    let sharedOwnerRepairCalls = 0;
    const localSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = new Error(
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL,
    );
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      if (
        options[
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
        ] === true ||
        options[
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
        ] === true ||
        options[
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
        ] === true
      ) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      throw repairFailure;
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      2,
      'thrown forced repair failure should retry once from the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should exit forced repair before reading the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should not allow another authoritative repair while repair is deferred',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
      ],
      false,
      'fallback should not repeat the failed authoritative publication read',
    );
    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced thrown repair should reserve caller query time for the local fallback',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after the thrown participant failure',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      'thrown participant failure should keep snapshot coverage above two-of-five',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
          ],
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'thrown connection-closed repair failure should become a structured deferred snapshot',
    );
  });

test('AdminControlSnapshot forced repair uses projected fallback coverage under query pressure',
  async (t) => {
    const buildOptions = [];
    const projectedFallbackSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
      projectedNodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
        error: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return projectedFallbackSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
      repairFailure;

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      1,
      'projected fallback coverage should preserve the already built local snapshot',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
        (left, right) => left.localeCompare(right),
      ),
      'deferred repair should promote projected fallback coverage above two-of-five',
    );
    t.same(
      result.projectedNodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
        (left, right) => left.localeCompare(right),
      ),
      'deferred repair should keep projected fallback coverage visible to probes',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'projected forced repair pressure should become a structured deferred snapshot',
    );
  });

test('AdminControlSnapshot forced publication read failure preserves a metric-moving local fallback',
  async (t) => {
    const buildOptions = [];
    let repairOptions = null;
    let sharedOwnerRepairCalls = 0;
    const localSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
        error: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      if (
        options[
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
        ] === true ||
        options[
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
        ] === true ||
        options[
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
        ] === true
      ) {
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
        );
      }
      return localSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: ['node-4', 'node-5'],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return repairFailure;
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      2,
      'forced publication read failure should retry once from the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should exit forced repair before retrying the local cache',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
      ],
      false,
      'fallback should not allow another authoritative repair while repair is deferred',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
      ],
      false,
      'fallback should not repeat the failed authoritative publication read',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_READINESS_REFRESH
      ],
      false,
      'fallback should not open a readiness refresh side path',
    );
    t.equal(
      buildOptions[1][
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_RECONCILE_AUTHORITATIVE_PUBLICATION
      ],
      false,
      'fallback should not reconcile publication while repair is deferred',
    );
    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced pre-snapshot repair should reserve caller query time for the local fallback',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after the fallback is marked deferred',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      'deferred forced repair should keep the metric-moving local fallback',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
        },
      },
      'forced publication read repair failure should become a structured deferred owner observation',
    );
  });

test('AdminControlSnapshot forced query timeout preserves metric-moving local snapshot',
  async (t) => {
    const buildOptions = [];
    let sharedOwnerRepairCalls = 0;
    let repairOptions = null;
    const localSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE],
      retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      localQueryTransport: {
        state: 'ready',
        ready: true,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
      serviceDiscovery: {
        async ensureAuthoritativeDiscoveryCacheRepair() {
          sharedOwnerRepairCalls += 1;
          throw new Error('shared owner force repair should stay deferred');
        },
      },
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
          hasCoverageGap: true,
          missingNodeIds: ['node-4', 'node-5'],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
      repairOptions = options;
      return repairFailure;
    };

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      buildOptions.length,
      1,
      'query timeout should preserve the already built local snapshot',
    );
    t.equal(
      sharedOwnerRepairCalls,
      0,
      'the shared snapshot owner should not retry force repair after a deferred query timeout',
    );
    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced repair should reserve caller query time for returning the metric-moving local snapshot',
    );
    t.same(
      result.nodes,
      [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
      'deferred query timeout should keep metric-moving snapshot coverage',
    );
    t.match(
      result,
      {
        observationMode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
        snapshotObservation: {
          state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          contractState:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
          nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
            TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON,
          ],
          retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        },
        adminObservation: {
          repair: {
            forced: true,
            deferred: true,
            applied: false,
          },
        },
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred: true,
          publicationActiveGateHandoff: {
            pendingRecoveryNodeIds: [
              ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
            ],
            pendingRecoveryCount: 1,
            runtimePromotionAllowed: false,
            state:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
            reasonCode:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
            nextAction:
              TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
          },
        },
      },
      'forced query timeout should become a structured deferred owner observation',
    );
  });

test('AdminControlSnapshot forced repair deferral triggers handoff owner command before returning',
  async (t) => {
    const buildOptions = [];
    let reconcileOptions = null;
    const publicationActiveGateHandoff = {
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
    };
    const localSnapshot = {
      nodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
      ],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff,
        activeGateOwnerCohort: publicationActiveGateHandoff,
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
    const fallbackSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff,
        activeGateOwnerCohort: publicationActiveGateHandoff,
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
    const catchupSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationEpoch:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
          status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
        },
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL],
      causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE],
      retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      localQueryTransport: {
        state: 'ready',
        ready: true,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
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
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      if (buildOptions.length === 1) {
        return localSnapshot;
      }
      return buildOptions.length === 2 ? fallbackSnapshot : catchupSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
      repairFailure;

    const result = await snapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
      queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.match(
      reconcileOptions,
      {
        reconcileAuthoritativeMembershipPublication:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE,
      },
      'forced repair deferral should trigger the owner command before returning',
    );
    t.equal(
      buildOptions.length,
      2,
      'a non-progressing forced-deferral owner outcome should not rebuild the snapshot from lower-level coverage deltas',
    );
    t.match(
      buildOptions[1],
      {
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        preferAuthoritativePublicationRead: true,
        allowAuthoritativeReadinessRefresh:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH,
        reconcileAuthoritativeMembershipPublication: false,
        publicationActiveGateHandoff,
      },
      'forced-deferral should issue one bounded publication-owner refresh attempt without treating it as progressed truth',
    );
    t.same(
      result.nodes,
      [...localSnapshot.nodes],
      'without owner outcome progress, forced-deferral should keep the current local coverage instead of promoting partial refresh results',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      },
      'forced repair deferral should surface the owner outcome in publication convergence',
    );
  });

test('AdminControlSnapshot forced repair failures preserve authoritative nodes query timeout replay evidence',
  async (t) => {
    const localSnapshot = {
      nodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID],
      controlPlaneDiagnostics: {
        publicationConvergence: null,
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_DETAIL],
      causeChain: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE,
      ],
      firstFailedParticipant: {
        failedTable: TABLES.NODES,
        participantNodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
        errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CODE,
        error: 'Query timeout after ' +
          `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS}ms`,
        retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: ['discovery_node_coverage_gap'],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
      repairFailure;

    const error = await t.rejects(
      snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      }),
    );

    t.equal(
      error.cause,
      repairFailure,
      'forced repair failure should retain the structured repair result',
    );
    t.equal(
      error.message,
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_PREFIX} ` +
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL,
      'forced repair failure should expose the nodes query timeout detail',
    );

    const selectedSnapshotError =
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_ERROR}; ` +
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_FAILURE_PREFIX} ` +
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID} on lane ` +
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_LANE}: ${error.message}`;
    const graph = buildTopologyConvergenceGraph({
      report: {
        scenarios: [
          {
            scenario: 'rolling-restart',
            publicationConvergence: {
              publicationStatus: 'UNKNOWN',
              pendingAckCount: 0,
              blockedNodeCount: 0,
              missingPublishedCount: 0,
              activeGate: {
                state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_TIMED_OUT_STATE,
                ready: false,
                progress: {
                  expectedNodeCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_EXPECTED_NODE_COUNT,
                  snapshotCoverageNodeCount:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_NODE_COUNT,
                  snapshotCoverageComplete: false,
                  selectedSnapshotNodeId:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
                  selectedSnapshotTimeoutMs:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
                  selectedSnapshotError,
                  readinessDelay: {
                    cause: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                    source: 'selectedSnapshotError',
                    recoverability:
                      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
                    error: selectedSnapshotError,
                  },
                },
              },
            },
            readinessFailure: {
              mode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_MODE_STARTUP,
              classCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
              recoverability: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
              terminalReason: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_TERMINAL_STALLED,
              cause: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
              source: 'selectedSnapshotError',
            },
          },
        ],
      },
    });
    const replayFixture = buildTopologyConvergenceReplayFixture(graph);
    const replayResult = replayTopologyConvergenceFixture(replayFixture);
    const activeGateWitness = graph.ownerWitnesses.find((witness) =>
      witness.edgeId === ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID,
    );
    const readinessWitness = graph.ownerWitnesses.find((witness) =>
      witness.edgeId === ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_EDGE_ID,
    );

    t.equal(
      replayResult.matches.preserved,
      true,
      'the replay fixture should preserve the owner-boundary classification',
    );
    t.match(
      replayFixture.publicationConvergence.activeGate.progress,
      {
        selectedSnapshotNodeId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
        selectedSnapshotTimeoutMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        selectedSnapshotSourceCause:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        forcedRepairSnapshotCause:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
        authoritativeControlSnapshotQueryCause:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_TIMEOUT_REASON,
        activeGateSnapshotOwnerEdge:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
      },
      'replay progress should separate selected-source, forced-repair, and authoritative-query causes',
    );
    t.same(
      activeGateWitness.reasons,
      [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_TIMED_OUT_REASON,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_TIMEOUT_REASON,
      ],
      'active-gate witness should identify the exact snapshot subcauses',
    );
    t.equal(
      readinessWitness.state,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_FRONTIER_DEFERRED,
      'readiness should remain downstream of active-gate no progress',
    );
    t.same(
      readinessWitness.reasons,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_INHERITED_REASON],
      'readiness should not become the owning cause while snapshot coverage is blocked',
    );
    t.equal(
      readinessWitness.source.supportPath,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SUPPORT_PATH_INHERITED,
      'readiness support should preserve inherited active-gate support path',
    );
    t.equal(
      replayFixture.expected.frontierState,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_FRONTIER_BLOCKED,
      'replay fixture should keep active-gate snapshot coverage as the blocked frontier',
    );
  });

test('Topology convergence replay separates authoritative nodes participant query pressure',
  async (t) => {
    const selectedSnapshotError =
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_ERROR}; ` +
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_FAILURE_PREFIX} ` +
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID} on lane ` +
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_LANE}: ` +
      `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_PREFIX} ` +
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_DETAIL;
    const graph = buildTopologyConvergenceGraph({
      report: {
        scenarios: [
          {
            scenario: 'rolling-restart',
            publicationConvergence: {
              publicationStatus: 'UNKNOWN',
              pendingAckCount: 0,
              blockedNodeCount: 0,
              missingPublishedCount: 0,
              activeGate: {
                state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_TIMED_OUT_STATE,
                ready: false,
                progress: {
                  expectedNodeCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_EXPECTED_NODE_COUNT,
                  snapshotCoverageNodeCount:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_NODE_COUNT,
                  snapshotCoverageComplete: false,
                  selectedSnapshotNodeId:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
                  selectedSnapshotTimeoutMs:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
                  selectedSnapshotError,
                  readinessDelay: {
                    cause: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                    source: 'selectedSnapshotError',
                    recoverability:
                      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
                    error: selectedSnapshotError,
                  },
                },
              },
            },
            readinessFailure: {
              mode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_MODE_STARTUP,
              classCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
              recoverability: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
              terminalReason: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_TERMINAL_STALLED,
              cause: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
              source: 'selectedSnapshotError',
            },
          },
        ],
      },
    });
    const replayFixture = buildTopologyConvergenceReplayFixture(graph);
    const replayResult = replayTopologyConvergenceFixture(replayFixture);
    const activeGateWitness = graph.ownerWitnesses.find((witness) =>
      witness.edgeId === ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID,
    );
    const readinessWitness = graph.ownerWitnesses.find((witness) =>
      witness.edgeId === ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_EDGE_ID,
    );

    t.equal(
      replayResult.matches.preserved,
      true,
      'participant-failure replay should preserve the owner-boundary classification',
    );
    t.match(
      replayFixture.publicationConvergence.activeGate.progress,
      {
        selectedSnapshotNodeId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
        selectedSnapshotTimeoutMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        selectedSnapshotSourceCause:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        forcedRepairSnapshotCause:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
        authoritativeControlSnapshotQueryCause:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_PRESSURE_REASON,
        activeGateSnapshotOwnerEdge:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
      },
      'participant-failure replay should keep authoritative nodes query pressure distinct from the forced repair stall',
    );
    t.same(
      activeGateWitness.reasons,
      [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_TIMED_OUT_REASON,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_PRESSURE_REASON,
      ],
      'active-gate witness should include authoritative nodes query pressure',
    );
    t.equal(
      readinessWitness.state,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_FRONTIER_DEFERRED,
      'readiness should stay downstream of active-gate no progress',
    );
    t.same(
      readinessWitness.reasons,
      [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_INHERITED_REASON],
      'readiness should remain inherited support evidence',
    );
  });

test('AdminControlSnapshot repair-deferred shared owner attempts publication catch-up before returning',
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
          status: 'OPEN',
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
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CACHE_STALE_TRIGGER,
      ],
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
      'repair-deferred degradation should perform a narrow publication-owner reconcile before rebuilding the snapshot view',
    );
    t.equal(
      buildOptions.length,
      1,
      'repair-deferred degradation should trigger the owner command without rebuilding the snapshot',
    );
    t.same(
      result.nodes,
      ['node-1'],
      'the returned deferred snapshot should keep the original snapshot view',
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
        controlPlaneDiagnostics: {
          ordinaryRepairDeferred:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_DEFERRED,
          publicationConvergence: {
            publicationEpoch: 1,
            status: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1'],
          },
        },
        observationMode: 'repair_deferred',
      },
      'the trigger-only deferred snapshot should keep the structured deferred retry outcome',
    );
  });

test('AdminControlSnapshot visible handoff refresh does not treat lower-level coverage changes as owner progress',
  async (t) => {
    const buildOptions = [];
    const publicationActiveGateHandoff = {
      state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
      reasonCode:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
      nextAction:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
      expectedNodeIds: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
      ],
      publishedActiveNodeIds: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
      ],
      pendingReconcileCount:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
      pendingReconcileNodeIds: [
        ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
      ],
    };
    const visibleOwnerOutcome = {
      state:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
      publicationRow: {
        publication_id:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
      },
    };
    const staleSnapshot = {
      nodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS[0],
      ],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff,
        activeGateOwnerCohort: publicationActiveGateHandoff,
        membershipPublicationHandoffOutcome: visibleOwnerOutcome,
        publicationConvergence: {
          publicationEpoch:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          membershipPublicationHandoffOutcome: visibleOwnerOutcome,
        },
      },
    };
    const refreshedSnapshot = {
      nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff: {
          ...publicationActiveGateHandoff,
          pendingReconcileCount: 0,
          pendingReconcileNodeIds: [],
        },
        activeGateOwnerCohort: {
          ...publicationActiveGateHandoff,
          pendingReconcileCount: 0,
          pendingReconcileNodeIds: [],
        },
        publicationConvergence: {
          publicationEpoch:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
          status:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async (options = {}) => {
      buildOptions.push(options);
      return buildOptions.length === 1 ? staleSnapshot : refreshedSnapshot;
    };
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => false;

    const result = await snapshot.resolveLocalControlSnapshot();

    t.equal(
      buildOptions.length,
      1,
      'without owner progress signals, visible handoff outcomes should not trigger a refresh rebuild',
    );
    t.same(
      result.nodes,
      [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS[0],
      ],
      'coverage-only refresh deltas should not be accepted as owner progress',
    );
    t.equal(
      result.controlPlaneDiagnostics.publicationConvergence.publicationEpoch,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
      'the stale snapshot publication epoch should be retained when owner outcome progress is absent',
    );
    t.equal(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome?.state,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
      'the retained snapshot should keep the deferred owner outcome instead of promoting stale coverage',
    );
  });
