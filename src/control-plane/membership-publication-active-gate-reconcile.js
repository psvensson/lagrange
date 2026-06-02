import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
  CONTROL_PLANE_FAILURE_REASON,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from './control-plane-error-classification.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  hasPublicationActiveGateOwnerReconcileSignal,
  resolvePublicationActiveGateMembershipPublicationTarget,
} from './publication-active-gate-handoff-contract.js';
import {MEMBERSHIP_PUBLICATION_KIND, MEMBERSHIP_PUBLICATION_STATUS, normalizeNodeIdList, normalizePositiveInteger} from './membership-publication-coordinator-stage-1.js';
import {
  buildMembershipPublicationRow,
  buildPublicationReadOptions,
  hasExplicitMembershipPublicationTarget,
} from './membership-publication-coordinator-stage-2.js';
import {
  CONTROL_PLANE_CONVERGENCE_FIELD,
  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION,
  buildControlPlaneConvergenceOutcome,
  buildCriticalControlPlaneConvergenceOptions,
  buildCriticalConvergenceErrorOutcome,
  normalizeControlPlaneConvergenceRetryAfterMs,
} from './membership-publication-control-plane-convergence.js';
import {SnapshotService} from './snapshot-service.js';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_SCHEMA_VERSION = 1;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON = 'active_gate_handoff_owner_reconcile';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_READ_PROFILE = 'diagnostics';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_VISIBLE_WRITE_ATTEMPTS = NUM.TWO;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_TEXT = '';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS = true;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DEFERRED_SKIP_WRITE_READBACK = true;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_SKIP_CACHE_WAIT = true;
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
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_WRITE_DEFERRED_FRAGMENTS = Object.freeze(['readback']);
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD = Object.freeze({
  DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING: 'disableNestedPriorityRecoveryPlanning',
  PUBLICATION_ROW: 'publicationRow',
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLISHED_MEMBERSHIP_OBSERVATION: 'publishedMembershipObservation',
});
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD =
  Object.freeze({
    ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
    ALLOW_EMPTY_PRELOADED_ROWS: 'allowEmptyPreloadedRows',
    ALLOW_PENDING_VISIBILITY: 'allowPendingVisibility',
    ALLOW_PRESSURE_DEFER: 'allowPressureDefer',
    DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING: 'disableNestedPriorityRecoveryPlanning',
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
    SKIP_CACHE_WAIT: 'skipCacheWait',
    SERVICE_ROWS: 'serviceRows',
    SKIP_PUBLICATION_WRITE_READBACK: 'skipPublicationWriteReadback',
  });
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_VISIBILITY_CONTEXT =
  Object.freeze({
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .SKIP_CACHE_WAIT]: ACTIVE_GATE_MEMBERSHIP_PUBLICATION_SKIP_CACHE_WAIT,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .SKIP_PUBLICATION_WRITE_READBACK]: false,
  });
function selectLatestActiveGateMembershipPublicationRow(rows = [], options = {}) {
  const expectedStatus =
    typeof options.status === TYPEOF.STRING ?
      options.status.toUpperCase() :
      null;
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (!row || typeof row !== TYPEOF.OBJECT) {
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
        row.status ||
        normalizeNodeIdList(row.publishedActiveNodeIds).length > NUM.ZERO
      ),
    );
  if (normalizedRows.length === NUM.ZERO) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
  }
  normalizedRows.sort((left, right) => {
    const epochDelta =
      (right.publicationEpoch || NUM.ZERO) -
      (left.publicationEpoch || NUM.ZERO);
    if (epochDelta !== NUM.ZERO) {
      return epochDelta;
    }
    return (
      (right.updatedAt || right.publishedAt || NUM.ZERO) -
      (left.updatedAt || left.publishedAt || NUM.ZERO)
    );
  });
  return normalizedRows[NUM.ZERO] ||
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
}
function buildActiveGateMembershipPublicationPublishedBaselineRow(target) {
  const handoffContract =
    target?.handoffContract && typeof target.handoffContract === TYPEOF.OBJECT ?
      target.handoffContract :
      null;
  const publishedActiveNodeIds = normalizeNodeIdList(
    handoffContract?.publishedActiveNodeIds,
  );
  if (publishedActiveNodeIds.length === NUM.ZERO) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
  }
  const publicationEpoch = normalizePositiveInteger(
    handoffContract?.publicationEpoch,
    NUM.ONE,
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
    typeof publicationActiveGateHandoff !== TYPEOF.OBJECT ||
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
    targetPublishedNodeIds.length === NUM.ZERO ||
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
function buildActiveGateMembershipPublicationVisibleReadRows(
  reconcileOutcome,
  nowMs,
) {
  const candidate = reconcileOutcome?.candidate;
  const candidateRow =
    candidate && typeof candidate === TYPEOF.OBJECT ?
      buildMembershipPublicationRow({candidate, nowMs}) :
      null;
  const publicationRows = [
    reconcileOutcome?.publicationRow,
    candidateRow,
  ];
  const seenPublicationIds = new Set();
  return publicationRows.filter((publicationRow) => {
    const publicationId =
      normalizeControlPlanePublicationRow(publicationRow).publicationId;
    if (!publicationId || seenPublicationIds.has(publicationId)) {
      return false;
    }
    seenPublicationIds.add(publicationId);
    return true;
  });
}
function resolveActiveGateMembershipPublicationReconcileOutcomeRow(
  reconcileOutcome,
  nowMs,
) {
  const publicationRows = buildActiveGateMembershipPublicationVisibleReadRows(
    reconcileOutcome,
    nowMs,
  );
  return publicationRows.length > NUM.ZERO ?
    normalizeControlPlanePublicationRow(publicationRows[NUM.ZERO]) :
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME;
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
    preferAuthoritativeRead: true,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .PUBLISHED_ACTIVE_NODE_IDS]: [...target.publishedActiveNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .REQUIRED_ACK_NODE_IDS]: [...target.requiredAckNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ACKNOWLEDGED_NODE_IDS]: [...target.acknowledgedNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_PENDING_VISIBILITY]: true,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_PRESSURE_DEFER]: false,
    ...ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_VISIBILITY_CONTEXT,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_EMPTY_PRELOADED_ROWS]:
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.READ_PROFILE]:
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_READ_PROFILE,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING]: true,
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
    options.publicationRow && typeof options.publicationRow === TYPEOF.OBJECT ?
      normalizeControlPlanePublicationRow(options.publicationRow) :
      null;
  return Object.freeze({
    schemaVersion: ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_SCHEMA_VERSION,
    state,
    target: options.target || null,
    publicationRow,
    enqueued: options.enqueued === true,
    ...(Number.isFinite(options.retryAfterMs) && options.retryAfterMs > NUM.ZERO ?
      {retryAfterMs: Math.floor(options.retryAfterMs)} :
      {}),
    ...(typeof options.reasonCode === TYPEOF.STRING &&
      options.reasonCode.length > NUM.ZERO ?
      {reasonCode: options.reasonCode} :
      {}),
    ...(options.controlPlaneConvergence &&
      typeof options.controlPlaneConvergence === TYPEOF.OBJECT ?
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
function buildActiveGateMembershipPublicationDeferredContext(
  context,
  reconcileOutcome = ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME,
  nowMs = null,
) {
  const publicationRow = resolveActiveGateMembershipPublicationReconcileOutcomeRow(
    reconcileOutcome,
    nowMs,
  );
  const deferredContext = publicationRow ===
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_OUTCOME ?
    context :
    {
      ...context,
      [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
        .LATEST_PUBLICATION_ROW]: publicationRow,
    };
  return {
    ...deferredContext,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .SKIP_PUBLICATION_WRITE_READBACK]:
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_DEFERRED_SKIP_WRITE_READBACK,
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
  if (error?.activeGateMembershipPublicationReadbackFailed === true) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED;
  }
  const errorMessage = String(error?.message || error || '');
  if (
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_WRITE_DEFERRED_FRAGMENTS
      .some((fragment) => errorMessage.includes(fragment))
  ) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED;
  }
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
function isActiveGateMembershipPublicationHandoffRetryAccepted(
  rawEnqueueOutcome,
  controlPlaneConvergence,
) {
  return rawEnqueueOutcome === true ||
    controlPlaneConvergence?.pressureOutcome ===
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED;
}
function resolveActiveGateMembershipPublicationDeferredReasonCode(
  target,
  controlPlaneConvergence,
) {
  const convergenceReasonCode = controlPlaneConvergence?.reasonCode;
  if (
    typeof convergenceReasonCode === TYPEOF.STRING &&
    convergenceReasonCode.length > NUM.ZERO
  ) {
    return convergenceReasonCode;
  }
  const handoffReasonCode = target?.handoffContract?.reasonCode;
  return typeof handoffReasonCode === TYPEOF.STRING &&
    handoffReasonCode.length > NUM.ZERO ?
    handoffReasonCode :
    null;
}
function resolveActiveGateMembershipPublicationOwnerRecoveryOwnerKey(
  coordinator,
  target,
) {
  if (typeof coordinator?.buildOwnerKey === TYPEOF.FUNCTION) {
    const ownerKey = coordinator.buildOwnerKey();
    if (typeof ownerKey === TYPEOF.STRING && ownerKey.length > NUM.ZERO) {
      return ownerKey;
    }
  }
  const pendingRecoveryNodeIds = normalizeNodeIdList(
    target?.pendingRecoveryNodeIds,
  );
  return pendingRecoveryNodeIds[NUM.ZERO] ||
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_TEXT;
}
function resolveActiveGateMembershipPublicationOwnerRecoveryPressureOutcome(
  queueOutcome,
  enqueued,
) {
  const pressureOutcome = queueOutcome?.pressureOutcome;
  return typeof pressureOutcome === TYPEOF.STRING &&
    pressureOutcome.length > NUM.ZERO ?
    pressureOutcome :
    (
      enqueued === true ?
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED :
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED
    );
}
function buildActiveGateMembershipPublicationOwnerRecoveryWakeConvergence(
  coordinator,
  target,
  enqueued,
) {
  const queueOutcome =
    coordinator?.lastControlPlaneConvergenceQueueOutcome || null;
  return buildControlPlaneConvergenceOutcome({
    pressureOutcome:
      resolveActiveGateMembershipPublicationOwnerRecoveryPressureOutcome(
        queueOutcome,
        enqueued,
      ),
    ownerKey:
      resolveActiveGateMembershipPublicationOwnerRecoveryOwnerKey(
        coordinator,
        target,
      ),
    operation:
      CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.OWNER_RECOVERY_WAKE,
    queueOutcome: queueOutcome?.queueOutcome,
    reasonCode:
      resolveActiveGateMembershipPublicationDeferredReasonCode(
        target,
        queueOutcome,
      ),
    retryAfterMs: normalizeControlPlaneConvergenceRetryAfterMs(
      queueOutcome?.retryAfterMs ?? target?.handoffContract?.retryAfterMs,
    ),
    pressureReason: queueOutcome?.pressureReason,
  });
}
function isActiveGateMembershipPublicationOwnerRecoveryWaitTarget(
  target = null,
) {
  return target?.handoffContract?.nextAction ===
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY &&
    target.pendingRecoveryCount > NUM.ZERO;
}
async function drainActiveGateMembershipPublicationSnapshotQueue() {
  const queuePressureDetected = SnapshotService.isQueuePressureDetected();
  const drainedCount = await SnapshotService.drainQueueForSnapshot();
  return queuePressureDetected === true || drainedCount > NUM.ZERO;
}
async function readActiveGateMembershipPublicationVisibleRow(
  coordinator,
  publicationRow,
  target,
  context,
) {
  const normalizedPublicationRow =
    normalizeControlPlanePublicationRow(publicationRow);
  if (
    !normalizedPublicationRow.publicationId ||
    !coordinator.controlPlanePublicationsOwner ||
    typeof coordinator.controlPlanePublicationsOwner.getPublication !==
      TYPEOF.FUNCTION
  ) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
  }
  let durableRow = null;
  try {
    durableRow = await coordinator.controlPlanePublicationsOwner.getPublication(
      normalizedPublicationRow.publicationId,
      buildPublicationReadOptions({
        ...context,
        preferAuthoritativeRead: true,
      }),
    );
  } catch (error) {
    error.activeGateMembershipPublicationReadbackFailed = true;
    throw error;
  }
  return isActiveGateMembershipPublicationRowVisibleForTarget(
    durableRow,
    target,
  ) ?
    normalizeControlPlanePublicationRow(durableRow) :
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
}
async function readActiveGateMembershipPublicationVisibleReconcileRow(
  coordinator,
  reconcileOutcome,
  target,
  context,
) {
  const publicationRows =
    buildActiveGateMembershipPublicationVisibleReadRows(
      reconcileOutcome,
      coordinator.now(),
    );
  for (const publicationRow of publicationRows) {
    try {
      const visibleRow =
        await coordinator.readActiveGateMembershipPublicationVisibleRow(
          publicationRow,
          target,
          context,
        );
      if (visibleRow) {
        return visibleRow;
      }
    } catch (error) {
      error.activeGateMembershipPublicationReconcileOutcome =
        reconcileOutcome;
      throw error;
    }
  }
  return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ABSENT_ROW;
}
async function reconcileActiveGateMembershipPublication(
  coordinator,
  publicationActiveGateHandoff,
  options = {},
) {
  const target = resolvePublicationActiveGateMembershipPublicationTarget(
    publicationActiveGateHandoff,
  );
  if (target.reconcileRequired !== true) {
    const ownerRecoveryWait =
      isActiveGateMembershipPublicationOwnerRecoveryWaitTarget(target);
    const drainedSnapshotQueue = ownerRecoveryWait ?
      await drainActiveGateMembershipPublicationSnapshotQueue() :
      false;
    const rawEnqueueOutcome =
      ownerRecoveryWait &&
      typeof coordinator?.enqueueClusterMembershipReconcile ===
        TYPEOF.FUNCTION ?
        coordinator.enqueueClusterMembershipReconcile(
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
          {
            [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
              .PUBLICATION_ACTIVE_GATE_HANDOFF]: publicationActiveGateHandoff,
          },
        ) :
        false;
    const enqueued =
      drainedSnapshotQueue ||
      isActiveGateMembershipPublicationHandoffRetryAccepted(
        rawEnqueueOutcome,
        coordinator?.lastControlPlaneConvergenceQueueOutcome,
      );
    const controlPlaneConvergence = ownerRecoveryWait ?
      buildActiveGateMembershipPublicationOwnerRecoveryWakeConvergence(
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
      let visibilityAttempt = NUM.ZERO;
      visibilityAttempt <
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_VISIBLE_WRITE_ATTEMPTS;
      visibilityAttempt += NUM.ONE
    ) {
      try {
        reconcileOutcome = await coordinator.reconcileClusterMembership(context);
        lastReconcileOutcome = reconcileOutcome;
        const visibleRow =
          await coordinator.readActiveGateMembershipPublicationVisibleReconcileRow(
            reconcileOutcome,
            target,
            context,
          );
        if (visibleRow) {
          return buildActiveGateMembershipPublicationReconcileOutcome(
            ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
              .PUBLISHED_VISIBLE,
            {
              publicationRow: visibleRow,
              target,
              enqueued: drainedSnapshotQueue,
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
          visibilityAttempt + NUM.ONE >=
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
        coordinator.now(),
      );
    const deferredPublicationRow =
      resolveActiveGateMembershipPublicationReconcileOutcomeRow(
        reconcileOutcome,
        coordinator.now(),
      );
    const rawEnqueueOutcome = coordinator.enqueueClusterMembershipReconcile(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
      deferredContext,
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
    const deferredReconcileOutcome =
      error.activeGateMembershipPublicationReconcileOutcome ||
      lastReconcileOutcome;
    const deferredContext =
      buildActiveGateMembershipPublicationDeferredContext(
        context,
        deferredReconcileOutcome,
        coordinator.now(),
      );
    const deferredPublicationRow =
      resolveActiveGateMembershipPublicationReconcileOutcomeRow(
        deferredReconcileOutcome,
        coordinator.now(),
      );
    const rawEnqueueOutcome = coordinator.enqueueClusterMembershipReconcile(
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
      deferredContext,
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
        reasonCode:
          resolveActiveGateMembershipPublicationDeferredReasonCode(
            target,
            controlPlaneConvergence,
          ),
        retryAfterMs: normalizeControlPlaneConvergenceRetryAfterMs(
          getControlPlaneRetryAfterMs(error),
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
