import {
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
  CONTROL_PLANE_FAILURE_REASON,
  getControlPlaneFailureSummary,
  isRetryableControlPlaneError,
} from './control-plane-error-classification.js';
import {isControlPlanePublicationsWriteLeader} from './control-plane-publications-leadership.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  hasPublicationActiveGateOwnerReconcileSignal,
  resolvePublicationActiveGateMembershipPublicationTarget,
} from './publication-active-gate-handoff-contract.js';
import {
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
  MEMBERSHIP_PUBLICATION_STATUS,
} from './membership-publication-row-contract.js';
import {normalizeNodeIdList, normalizePositiveInteger} from './membership-publication-row-helpers.js';
import {
  buildPublicationReadOptions,
  hasExplicitMembershipPublicationTarget,
} from './membership-publication-planning-evidence.js';
import {MEMBERSHIP_PUBLICATION_WRITE_HOLD} from
  './membership-publication-reconcile-write.js';
import {
  CONTROL_PLANE_CONVERGENCE_FIELD,
  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION,
  buildControlPlaneConvergenceOutcome,
  buildCriticalControlPlaneConvergenceOptions,
  buildCriticalConvergenceErrorOutcome,
} from './membership-publication-control-plane-convergence.js';
import {
  MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT,
  buildMembershipPublicationOwnerRecoveryWaitConvergence,
  requireMembershipPublicationOwnerRecoveryWait,
  resolveMembershipPublicationOwnerRecoveryWait,
} from './membership-publication-owner-recovery-wait.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DEFERRED_WRITE_REQUEUE,
  isActiveGateMembershipPublicationHandoffRetryAccepted,
  resolveActiveGateMembershipPublicationDeferredReasonCode,
  resolveActiveGateMembershipPublicationHandoffRetryAfterMs,
} from './membership-publication-active-gate-deferred-outcome.js';
import {requestOwedPriorityCensus} from
  './membership-publication-coordinator-reconcile-helpers.js';
import {SnapshotService} from './snapshot-service.js';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_SCHEMA_VERSION = 1;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON = 'active_gate_handoff_owner_reconcile';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_READ_PROFILE = 'diagnostics';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_VISIBLE_WRITE_ATTEMPTS = 2;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_TEXT = '';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS = true;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS = Object.freeze([]);
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW = null;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME = Object.freeze({});
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME = Object.freeze({
  NO_CHANGE: 'no_change',
  PRESSURE_DEFERRED: 'pressure_deferred',
  PUBLISHED_VISIBLE: 'published_visible',
  TARGET_BLOCKED: 'target_blocked',
  WRITE_DEFERRED: 'write_deferred',
});
// What the durable owner answers about a reconcile's publication row: it
// covers the handoff target, it does not (yet), or it could not be read.
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_VISIBILITY = Object.freeze({
  VISIBLE: 'visible',
  NOT_VISIBLE: 'not_visible',
  UNAVAILABLE: 'unavailable',
});
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DURABLE_READ_ANSWERED = 'answered';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD = Object.freeze({
  DEFER_NESTED_PRIORITY_RECOVERY_PLANNING: 'deferNestedPriorityRecoveryPlanning',
  PUBLICATION_ROW: 'publicationRow',
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLISHED_MEMBERSHIP_OBSERVATION: 'publishedMembershipObservation',
});
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD =
  Object.freeze({
    ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
    ALLOW_EMPTY_PRELOADED_ROWS: 'allowEmptyPreloadedRows',
    DEFER_NESTED_PRIORITY_RECOVERY_PLANNING: 'deferNestedPriorityRecoveryPlanning',
    LATEST_PUBLISHED_PUBLICATION_ROW: 'latestPublishedPublicationRow',
    LATEST_PUBLICATION_ROW: 'latestPublicationRow',
    NODE_ENDPOINT_ROWS: 'nodeEndpointRows',
    NODE_ROWS: 'nodeRows',
    PARTITION_ROWS: 'partitionRows',
    PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
    PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
    READ_PROFILE: 'readProfile',
    READINESS_ENTRIES: 'readinessEntries',
    REPLICA_OPERATION_ROWS: 'replicaOperationRows',
    REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
    SERVICE_ROWS: 'serviceRows',
  });
function selectLatestActiveGateMembershipPublicationRow(rows = [], options = {}) {
  const expectedStatus =
    typeof options.status === 'string' ?
      options.status.toUpperCase() :
      null;
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
      }
      return normalizeControlPlanePublicationRow(
        row[
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.PUBLICATION_ROW
        ] || row,
      );
    })
    .filter((row) =>
      row &&
      (expectedStatus === null || row.status === expectedStatus) &&
      (
        row.publicationId ||
        row.publicationEpoch ||
        // normalizeControlPlanePublicationRow decodes status to a string.
        row.status.length > 0 ||
        normalizeNodeIdList(row.publishedActiveNodeIds).length > 0
      ),
    );
  if (normalizedRows.length === 0) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
  }
  normalizedRows.sort((left, right) => {
    const epochDelta =
      (right.publicationEpoch || 0) -
      (left.publicationEpoch || 0);
    if (epochDelta !== 0) {
      return epochDelta;
    }
    return (
      (right.updatedAt || right.publishedAt || 0) -
      (left.updatedAt || left.publishedAt || 0)
    );
  });
  return normalizedRows[0] ||
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
}
function buildActiveGateMembershipPublicationPublishedBaselineRow(target) {
  const handoffContract =
    target?.handoffContract && typeof target.handoffContract === 'object' ?
      target.handoffContract :
      null;
  const publishedActiveNodeIds = normalizeNodeIdList(
    handoffContract?.publishedActiveNodeIds,
  );
  if (publishedActiveNodeIds.length === 0) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
  }
  const publicationEpoch = normalizePositiveInteger(
    handoffContract?.publicationEpoch,
    1,
  );
  return {
    publication_kind: MEMBERSHIP_PUBLICATION_KIND,
    publication_epoch: publicationEpoch,
    status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
    published_active_node_ids: [...publishedActiveNodeIds],
    required_ack_node_ids: [...publishedActiveNodeIds],
    acknowledged_node_ids: [...publishedActiveNodeIds],
  };
}
function resolveActiveGateMembershipPublicationLatestRow(
  publicationActiveGateHandoff,
  target,
  options = {},
) {
  if (
    !publicationActiveGateHandoff ||
    typeof publicationActiveGateHandoff !== 'object' ||
    Array.isArray(publicationActiveGateHandoff)
  ) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
  }
  const publicationConvergence =
    publicationActiveGateHandoff[
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLICATION_CONVERGENCE
    ];
  return selectLatestActiveGateMembershipPublicationRow([
    options[
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
        .LATEST_PUBLICATION_ROW
    ],
    publicationActiveGateHandoff[
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLISHED_MEMBERSHIP_OBSERVATION
    ],
    publicationConvergence,
    publicationConvergence?.[
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLISHED_MEMBERSHIP_OBSERVATION
    ],
    buildActiveGateMembershipPublicationPublishedBaselineRow(target),
  ]);
}
function resolveActiveGateMembershipPublicationLatestPublishedRow(
  publicationActiveGateHandoff,
  target,
  options = {},
) {
  const publicationConvergence =
    publicationActiveGateHandoff[
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLICATION_CONVERGENCE
    ];
  return selectLatestActiveGateMembershipPublicationRow(
    [
      options[
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .LATEST_PUBLISHED_PUBLICATION_ROW
      ],
      publicationActiveGateHandoff[
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
          .PUBLISHED_MEMBERSHIP_OBSERVATION
      ],
      publicationConvergence?.[
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
          .PUBLISHED_MEMBERSHIP_OBSERVATION
      ],
      buildActiveGateMembershipPublicationPublishedBaselineRow(target),
    ],
    {status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED},
  );
}
function resolveActiveGateMembershipPublicationPreloadedRows(
  options,
  fieldName,
) {
  const rows = options[fieldName];
  return Array.isArray(rows) ?
    rows :
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS;
}
function activeGateMembershipPublicationNodeListContainsAll(
  observedValues,
  targetValues,
) {
  const observedNodeIds = new Set(normalizeNodeIdList(observedValues));
  return normalizeNodeIdList(targetValues).every((nodeId) =>
    observedNodeIds.has(nodeId),
  );
}
function isActiveGateMembershipPublicationRowVisibleForTarget(
  publicationRow,
  target,
) {
  const normalizedRow = normalizeControlPlanePublicationRow(publicationRow);
  const targetPublishedNodeIds = normalizeNodeIdList(
    target?.publishedActiveNodeIds,
  );
  if (
    targetPublishedNodeIds.length === 0 ||
    normalizedRow.status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED
  ) {
    return false;
  }
  return (
    activeGateMembershipPublicationNodeListContainsAll(
      normalizedRow.publishedActiveNodeIds,
      targetPublishedNodeIds,
    ) &&
    activeGateMembershipPublicationNodeListContainsAll(
      normalizedRow.requiredAckNodeIds,
      target?.requiredAckNodeIds,
    ) &&
    activeGateMembershipPublicationNodeListContainsAll(
      normalizedRow.acknowledgedNodeIds,
      target?.acknowledgedNodeIds,
    )
  );
}
// The publication row a reconcile reports is the durable owner's (a settled
// write); a candidate is never reported as a publication row.
function resolveActiveGateMembershipPublicationReconcileOutcomeRow(
  reconcileOutcome,
) {
  const publicationRow = reconcileOutcome?.publicationRow;
  return publicationRow && typeof publicationRow === 'object' &&
    normalizeControlPlanePublicationRow(publicationRow).publicationId ?
    normalizeControlPlanePublicationRow(publicationRow) :
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME;
}
function isActiveGateMembershipPublicationWriteHeld(reconcileOutcome) {
  return reconcileOutcome?.publicationWriteHold ===
    MEMBERSHIP_PUBLICATION_WRITE_HOLD.AWAITING_DURABLE_OWNER;
}
function buildActiveGateMembershipPublicationReconcileContext({
  publicationActiveGateHandoff,
  target,
  options,
}) {
  const latestPublicationRow =
    resolveActiveGateMembershipPublicationLatestRow(
      publicationActiveGateHandoff,
      target,
      options,
    );
  const latestPublishedPublicationRow =
    resolveActiveGateMembershipPublicationLatestPublishedRow(
      publicationActiveGateHandoff,
      target,
      options,
    );
  return {
    ...options,
    readSource:
      MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .PUBLISHED_ACTIVE_NODE_IDS]: [...target.publishedActiveNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .REQUIRED_ACK_NODE_IDS]: [...target.requiredAckNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ACKNOWLEDGED_NODE_IDS]: [...target.acknowledgedNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_EMPTY_PRELOADED_ROWS]:
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.READ_PROFILE]:
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_READ_PROFILE,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .DEFER_NESTED_PRIORITY_RECOVERY_PLANNING]: true,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.NODE_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.NODE_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .NODE_ENDPOINT_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .NODE_ENDPOINT_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.SERVICE_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .SERVICE_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PARTITION_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .PARTITION_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .REPLICA_OPERATION_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .REPLICA_OPERATION_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .READINESS_ENTRIES]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .READINESS_ENTRIES,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .PUBLICATION_ACTIVE_GATE_HANDOFF]: publicationActiveGateHandoff,
    ...(latestPublicationRow ?
      {
        [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .LATEST_PUBLICATION_ROW]: latestPublicationRow,
      } :
      {}),
    ...(latestPublishedPublicationRow ?
      {
        [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .LATEST_PUBLISHED_PUBLICATION_ROW]: latestPublishedPublicationRow,
      } :
      {}),
  };
}
function buildActiveGateMembershipPublicationReconcileOutcome(
  state,
  options = {},
) {
  const publicationRow =
    options.publicationRow && typeof options.publicationRow === 'object' ?
      normalizeControlPlanePublicationRow(options.publicationRow) :
      null;
  return Object.freeze({
    schemaVersion: ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_SCHEMA_VERSION,
    state,
    target: options.target || null,
    publicationRow,
    enqueued: options.enqueued === true,
    ownerRecoveryWait:
      requireMembershipPublicationOwnerRecoveryWait(options.ownerRecoveryWait),
    ...(Number.isFinite(options.retryAfterMs) && options.retryAfterMs > 0 ?
      {retryAfterMs: Math.floor(options.retryAfterMs)} :
      {}),
    ...(typeof options.reasonCode === 'string' &&
      options.reasonCode.length > 0 ?
      {reasonCode: options.reasonCode} :
      {}),
    ...(options.controlPlaneConvergence &&
      typeof options.controlPlaneConvergence === 'object' ?
      {
        [CONTROL_PLANE_CONVERGENCE_FIELD
          .CONTROL_PLANE_CONVERGENCE]: Object.freeze({
          ...options.controlPlaneConvergence,
        }),
        [CONTROL_PLANE_CONVERGENCE_FIELD
          .CONTROL_PLANE_CONVERGENCE_CLASS]:
          options.controlPlaneConvergence.convergenceClass,
        [CONTROL_PLANE_CONVERGENCE_FIELD
          .CONTROL_PLANE_PRESSURE_OUTCOME]:
          options.controlPlaneConvergence.pressureOutcome,
      } :
      {}),
  });
}
// The deferred re-run's context: the durable row a settled write reported
// is its latest row; an unsettled write reports none, and the re-run reads
// the durable owner.
function buildActiveGateMembershipPublicationDeferredContext(
  context,
  reconcileOutcome = ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME,
) {
  const publicationRow = resolveActiveGateMembershipPublicationReconcileOutcomeRow(
    reconcileOutcome,
  );
  return publicationRow ===
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME ?
    context :
    {
      ...context,
      [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
        .LATEST_PUBLICATION_ROW]: publicationRow,
    };
}
function shouldRouteActiveGateMembershipPublicationReconcile(options = {}) {
  return hasExplicitMembershipPublicationTarget(options) !== true &&
    hasPublicationActiveGateOwnerReconcileSignal(
      options[
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF
      ],
    ) === true;
}
function resolveActiveGateMembershipPublicationErrorOutcome(error) {
  const failureSummary = getControlPlaneFailureSummary(error);
  if (
    failureSummary.primaryReason === CONTROL_PLANE_FAILURE_REASON
      .PRESSURE_DEGRADED
  ) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
      .PRESSURE_DEFERRED;
  }
  if (isRetryableControlPlaneError(error)) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED;
  }
  return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_TEXT;
}
async function drainActiveGateMembershipPublicationSnapshotQueue() {
  const queuePressureDetected = SnapshotService.isQueuePressureDetected();
  const drainedCount = await SnapshotService.drainQueueForSnapshot();
  return queuePressureDetected === true || drainedCount > 0;
}
function activeGateMembershipPublicationVisibility(state, row = null) {
  return Object.freeze({state, row});
}
/**
 * Whether the durable owner's row for a publication covers the handoff
 * target: VISIBLE {row}, NOT_VISIBLE, or UNAVAILABLE (the durable owner did
 * not answer; nothing is concluded about the row).
 * @return {Promise<{state: string, row: Object|null}>}
 */
async function readActiveGateMembershipPublicationVisibleRow(
  coordinator,
  publicationRow,
  target,
  context,
) {
  const publicationId =
    normalizeControlPlanePublicationRow(publicationRow).publicationId;
  if (!publicationId || !coordinator.controlPlanePublicationsOwner) {
    return activeGateMembershipPublicationVisibility(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_VISIBILITY.NOT_VISIBLE);
  }
  const read =
    await coordinator.controlPlanePublicationsOwner.readDurablePublication(
      publicationId,
      buildPublicationReadOptions({
        ...context,
        readSource:
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
      }),
    );
  if (read?.state !== ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DURABLE_READ_ANSWERED) {
    return activeGateMembershipPublicationVisibility(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_VISIBILITY.UNAVAILABLE);
  }
  return read.storedRow &&
    isActiveGateMembershipPublicationRowVisibleForTarget(
      read.storedRow,
      target,
    ) ?
    activeGateMembershipPublicationVisibility(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_VISIBILITY.VISIBLE,
      normalizeControlPlanePublicationRow(read.storedRow)) :
    activeGateMembershipPublicationVisibility(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_VISIBILITY.NOT_VISIBLE);
}
// The visibility of the row a reconcile reported (a settled write's durable
// row); a reconcile that reported none has nothing visible.
async function readActiveGateMembershipPublicationVisibleReconcileRow(
  coordinator,
  reconcileOutcome,
  target,
  context,
) {
  const publicationRow =
    resolveActiveGateMembershipPublicationReconcileOutcomeRow(
      reconcileOutcome);
  if (publicationRow ===
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME) {
    return activeGateMembershipPublicationVisibility(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_VISIBILITY.NOT_VISIBLE);
  }
  return coordinator.readActiveGateMembershipPublicationVisibleRow(
    publicationRow,
    target,
    context,
  );
}
async function reconcileActiveGateMembershipPublication(
  coordinator,
  publicationActiveGateHandoff,
  options = {},
) {
  let target = resolvePublicationActiveGateMembershipPublicationTarget(
    publicationActiveGateHandoff,
  );
  if (
    target.reconcileRequired === true &&
    target.handoffContract?.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF
  ) {
    const isLeader = isControlPlanePublicationsWriteLeader(
      coordinator.systemTableCache,
      coordinator.nodeId,
      coordinator.cdcIntegrationService,
    );
    if (!isLeader) {
      target = Object.freeze({
        ...target,
        reconcileRequired: false,
      });
    }
  }
  if (target.reconcileRequired !== true) {
    // The owner-recovery wait never re-enqueues itself: see
    // membership-publication-owner-recovery-wait.js for what ends it.
    const ownerRecoveryWait =
      resolveMembershipPublicationOwnerRecoveryWait(target);
    const awaitingRecovery = ownerRecoveryWait ===
      MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.AWAITING_RECOVERY_PROGRESS;
    const enqueued = awaitingRecovery ?
      await drainActiveGateMembershipPublicationSnapshotQueue() :
      false;
    const controlPlaneConvergence = awaitingRecovery ?
      buildMembershipPublicationOwnerRecoveryWaitConvergence(
        coordinator,
        target,
        enqueued,
      ) :
      null;
    return buildActiveGateMembershipPublicationReconcileOutcome(
      target.handoffContract ?
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.TARGET_BLOCKED :
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.NO_CHANGE,
      {
        target,
        enqueued,
        reasonCode:
          resolveActiveGateMembershipPublicationDeferredReasonCode(
            target,
            controlPlaneConvergence,
          ),
        retryAfterMs: controlPlaneConvergence?.retryAfterMs,
        controlPlaneConvergence,
        ownerRecoveryWait,
      },
    );
  }
  const drainedSnapshotQueue =
    await drainActiveGateMembershipPublicationSnapshotQueue();
  const context = buildActiveGateMembershipPublicationReconcileContext({
    publicationActiveGateHandoff,
    target,
    options: buildCriticalControlPlaneConvergenceOptions(options, {
      ownerKey: coordinator.buildOwnerKey(),
      operation:
        CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.ACTIVE_GATE_HANDOFF,
    }),
  });
  let lastReconcileOutcome =
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME;
  try {
    let reconcileOutcome =
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME;
    for (
      let visibilityAttempt = 0;
      visibilityAttempt <
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_VISIBLE_WRITE_ATTEMPTS;
      visibilityAttempt += 1
    ) {
      try {
        reconcileOutcome = await coordinator.reconcileClusterMembership(context);
        lastReconcileOutcome = reconcileOutcome;
        if (isActiveGateMembershipPublicationWriteHeld(reconcileOutcome)) {
          // The write is still owed and its reconcile re-asks itself: no
          // second write here; the handoff defers.
          break;
        }
        const visibility =
          await coordinator.readActiveGateMembershipPublicationVisibleReconcileRow(
            reconcileOutcome,
            target,
            context,
          );
        if (visibility.state ===
            ACTIVE_GATE_MEMBERSHIP_PUBLICATION_VISIBILITY.UNAVAILABLE) {
          break;
        }
        if (visibility.state ===
            ACTIVE_GATE_MEMBERSHIP_PUBLICATION_VISIBILITY.VISIBLE) {
          // This reconcile planned without the census inputs: a row it
          // admitted states its census NOT_DERIVED, and the owner's full
          // reconcile is asked to derive it.
          requestOwedPriorityCensus(coordinator, visibility.row,
            {[ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
              .LATEST_PUBLICATION_ROW]: visibility.row});
          return buildActiveGateMembershipPublicationReconcileOutcome(
            ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
              .PUBLISHED_VISIBLE,
            {
              publicationRow: visibility.row,
              target,
              enqueued: drainedSnapshotQueue,
              ownerRecoveryWait:
                MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.NOT_WAITING,
              controlPlaneConvergence: buildControlPlaneConvergenceOutcome({
                pressureOutcome:
                  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
                ownerKey: coordinator.buildOwnerKey(),
                operation:
                  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION
                    .ACTIVE_GATE_HANDOFF,
              }),
            },
          );
        }
      } catch (error) {
        if (
          visibilityAttempt + 1 >=
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_VISIBLE_WRITE_ATTEMPTS
        ) {
          throw error;
        }
        const deferredOutcome =
          resolveActiveGateMembershipPublicationErrorOutcome(error);
        if (
          deferredOutcome !==
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED
        ) {
          throw error;
        }
      }
    }
    const deferredContext =
      buildActiveGateMembershipPublicationDeferredContext(
        context,
        reconcileOutcome,
      );
    const deferredPublicationRow =
      resolveActiveGateMembershipPublicationReconcileOutcomeRow(
        reconcileOutcome,
      );
    const rawEnqueueOutcome = coordinator.enqueueClusterMembershipReconcile(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
      deferredContext,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DEFERRED_WRITE_REQUEUE,
    );
    const controlPlaneConvergence =
      coordinator.lastControlPlaneConvergenceQueueOutcome ||
      buildControlPlaneConvergenceOutcome({
        pressureOutcome:
          CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED,
        ownerKey: coordinator.buildOwnerKey(),
        operation:
          CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.OWNER_RECOVERY_WAKE,
      });
    const enqueued =
      drainedSnapshotQueue ||
      isActiveGateMembershipPublicationHandoffRetryAccepted(
        rawEnqueueOutcome,
        controlPlaneConvergence,
      );
    return buildActiveGateMembershipPublicationReconcileOutcome(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED,
      {
        publicationRow: deferredPublicationRow ===
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME ?
          null :
          deferredPublicationRow,
        target,
        enqueued,
        ownerRecoveryWait:
          MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.NOT_WAITING,
        reasonCode:
          resolveActiveGateMembershipPublicationDeferredReasonCode(
            target,
            controlPlaneConvergence,
          ),
        retryAfterMs: controlPlaneConvergence.retryAfterMs,
        controlPlaneConvergence,
      },
    );
  } catch (error) {
    const deferredOutcome =
      resolveActiveGateMembershipPublicationErrorOutcome(error);
    if (!deferredOutcome) {
      throw error;
    }
    const deferredContext =
      buildActiveGateMembershipPublicationDeferredContext(
        context,
        lastReconcileOutcome,
      );
    const deferredPublicationRow =
      resolveActiveGateMembershipPublicationReconcileOutcomeRow(
        lastReconcileOutcome,
      );
    const rawEnqueueOutcome = coordinator.enqueueClusterMembershipReconcile(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
      deferredContext,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DEFERRED_WRITE_REQUEUE,
    );
    const queueOutcome =
      coordinator.lastControlPlaneConvergenceQueueOutcome || null;
    const controlPlaneConvergence =
      queueOutcome?.pressureOutcome ===
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED ||
      queueOutcome?.pressureOutcome ===
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED ?
        queueOutcome :
        buildCriticalConvergenceErrorOutcome(
          error,
          coordinator.buildOwnerKey(),
          CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.ACTIVE_GATE_HANDOFF,
        );
    const enqueued =
      drainedSnapshotQueue ||
      isActiveGateMembershipPublicationHandoffRetryAccepted(
        rawEnqueueOutcome,
        controlPlaneConvergence,
      );
    return buildActiveGateMembershipPublicationReconcileOutcome(
      deferredOutcome,
      {
        publicationRow: deferredPublicationRow ===
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME ?
          null :
          deferredPublicationRow,
        target,
        enqueued,
        ownerRecoveryWait:
          MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.NOT_WAITING,
        reasonCode:
          resolveActiveGateMembershipPublicationDeferredReasonCode(
            target,
            controlPlaneConvergence,
          ),
        retryAfterMs: resolveActiveGateMembershipPublicationHandoffRetryAfterMs(
          error,
          controlPlaneConvergence,
        ),
        controlPlaneConvergence,
      },
    );
  }
}
export {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD,
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  readActiveGateMembershipPublicationVisibleReconcileRow,
  readActiveGateMembershipPublicationVisibleRow,
  reconcileActiveGateMembershipPublication,
  shouldRouteActiveGateMembershipPublicationReconcile,
};
