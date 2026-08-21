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
  buildControlSnapshotHandoffRetryOptions,
} from '../../src/admin/admin-control-snapshot-publication-handoff.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';
import {
  registerAdminControlSnapshotRepairHandoffForcedRepairFallbackTestCases,
} from './admin-control-snapshot-repair-handoff-forced-repair-fallback-test-cases.js';
import {
  registerAdminControlSnapshotRepairHandoffReplayOutcomeTestCases,
} from './admin-control-snapshot-repair-handoff-replay-outcome-test-cases.js';

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
const TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS = 16000;

test('AdminControlSnapshot preserves bounded retry for accepted owner reconcile handoff',
  (t) => {
    const retryOptions = buildControlSnapshotHandoffRetryOptions(
      {
        controlPlaneDiagnostics: {
          membershipPublicationHandoffOutcome: {
            state:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
            reasonCode:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_ENQUEUED_REASON,
            enqueued: true,
            controlPlaneConvergence: {
              retryAfterMs:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
            },
          },
        },
      },
      {
        repair: {
          retryAfterMs: TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS,
        },
      },
    );

    t.match(
      retryOptions,
      {
        retryAfterMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
        repair: {
          retryAfterMs:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
        },
      },
      'accepted owner-reconcile enqueue should remain a bounded handoff retry',
    );
    t.end();
  });

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
            throw new Error(
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_ERROR,
            );
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
        retryAfterMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
      },
      'pressure-deferred fallback reconcile should return a structured queued owner outcome',
    );
    t.match(
      enqueuedContext,
      {
        readSource: 'authoritative_preferred',
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
        readProfile:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        allowEmptyPreloadedRows:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
        deferNestedPriorityRecoveryPlanning:
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
        retryAfterMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
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
        retryAfterMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
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
              [ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_CONVERGENCE]: {
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

test('AdminControlSnapshot projects deferred repair coverage from active-gate handoff nodes',
  async (t) => {
    let repairOptions = null;
    const handoffNodeIds = [
      ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
        .ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS,
    ];
    const publicationActiveGateHandoff = {
      schemaVersion:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
      state:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
      reasonCode:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
      nextAction: TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
      expectedNodeIds: handoffNodeIds,
      publishedActiveNodeIds: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      ],
      pendingRecoveryCount: handoffNodeIds.length - 1,
      pendingRecoveryNodeIds: handoffNodeIds.slice(1),
    };
    const localSnapshot = {
      nodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      ],
      controlPlaneDiagnostics: {
        publicationActiveGateHandoff,
        activeGateOwnerCohort: publicationActiveGateHandoff,
        publicationConvergence: {
          publicationActiveGateHandoff,
        },
      },
    };
    const repairFailure = {
      applied: false,
      skipped: false,
      failedTables: [TABLES.NODES],
      errors: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL,
      ],
      causeChain: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE,
      ],
      retryAfterMs:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    };
    const snapshot = new AdminControlSnapshot({
      nodeId:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => localSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: true,
          missingNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS,
          ],
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
      queryTimeoutMs:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
    });

    t.equal(
      repairOptions?.queryTimeoutMs,
      ACTIVE_GATE_SNAPSHOT_TEST_STATE
        .ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
      'forced repair should still reserve caller time before deferred handoff projection',
    );
    t.same(
      result.nodes,
      handoffNodeIds.sort((left, right) => left.localeCompare(right)),
      'deferred repair should project active-gate handoff nodes as metric-moving coverage',
    );
    t.match(
      result,
      {
        snapshotObservation: {
          state:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
          nextAction:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          reasonCodes: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
            TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON,
          ],
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
          },
        },
      },
      'selected-source timeout should become a bounded deferred handoff projection',
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
        throw new Error(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READBACK_FAILURE,
        );
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
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
                    .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
                ],
                required_ack_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
                    .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
                ],
                acknowledged_node_ids: [
                  ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
                    .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
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
        readSource: 'authoritative_preferred',
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
        readProfile:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
        allowEmptyPreloadedRows:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
        deferNestedPriorityRecoveryPlanning:
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
        readSource: 'authoritative_preferred',
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

registerAdminControlSnapshotRepairHandoffForcedRepairFallbackTestCases();
registerAdminControlSnapshotRepairHandoffReplayOutcomeTestCases();
