/**
 * Control snapshot building for the admin WebSocket API.
 *
 * This module owns all control-snapshot diagnostics: leader summary,
 * voter counts, replica operation summary, and CDC telemetry. The parent
 * AdminWebSocketAPI instantiates one AdminControlSnapshot and delegates
 * all control-snapshot-related calls to it.
 *
 * Single-use helpers that exist only for control-snapshot logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */
import {NUM, TABLES, TYPEOF} from '../constants/index.js';
import {normalizeControlPlanePublicationRow} from '../control-plane/system-row-normalizers.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../control-plane/control-plane-error-classification.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  resolvePublicationActiveGateMembershipPublicationTarget,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {AdminControlSnapshotPart5} from './admin-control-snapshot-class-part-5.js';
// ── file-local constants ────────────────────────────────────────────────────
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: '',
  READY: 'ready',
  UPDATEDAT: 'updatedAt',
  UPDATED_AT: 'updated_at',
  UNKNOWN_ERROR: 'unknown_error',
  PUBLISHED: 'PUBLISHED',
  NODEID: 'nodeId',
  ID: 'id',
  NAME: 'name',
  CAPTUREDAT: 'capturedAt',
  SOURCELEADERNODEID: 'sourceLeaderNodeId',
  DECISIONTIMESTAMP: 'decisionTimestamp',
  FAILEDAT: 'failedAt',
  NEXTATTEMPTAT: 'nextAttemptAt',
  TABLEID: 'tableId',
  TABLE_NAME: 'table_name',
  TABLENAME: 'tableName',
  PARTITIONSTATE: 'partitionState',
  REPLICAID: 'replicaId',
  RAFTROLE: 'raftRole',
  STATUS: 'status',
  ADDRESS: 'address',
});
const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS = 'diagnostics';
const MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS = Object.freeze({
  preferAuthoritativeRead: true,
});
const MEMBERSHIP_PUBLICATION_RECONCILE_REASON =
  'admin_control_snapshot_publication_handoff';
const MEMBERSHIP_PUBLICATION_HANDOFF_ALLOW_PRESSURE_DEFER = false;
const MEMBERSHIP_PUBLICATION_HANDOFF_SKIP_WRITE_READBACK = false;
const MEMBERSHIP_PUBLICATION_HANDOFF_DEFERRED_SKIP_WRITE_READBACK = true;
const MEMBERSHIP_PUBLICATION_HANDOFF_ALLOW_EMPTY_PRELOADED_ROWS = true;
const MEMBERSHIP_PUBLICATION_HANDOFF_DISABLE_NESTED_PRIORITY_RECOVERY = true;
const MEMBERSHIP_PUBLICATION_HANDOFF_EMPTY_ROWS = Object.freeze([]);
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_SCHEMA_VERSION = 1;
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_SCHEMA_VERSION = 1;
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_QUEUE_BOUND = NUM.ONE;
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_RETRY_AFTER_MS =
  NUM.THOUSAND;
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_OWNER_KEY =
  'membership-publication:cluster_membership';
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_OPERATION =
  'active_gate_handoff';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE = Object.freeze({
  WRITE_DEFERRED: 'write_deferred',
  TARGET_BLOCKED: 'target_blocked',
  NO_CHANGE: 'no_change',
});
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_COMMAND_ERROR =
  'owner_reconcile_error';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_ENQUEUED =
  'owner_reconcile_enqueued';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_SERVICE_UNAVAILABLE =
  'owner_reconcile_service_unavailable';
const MEMBERSHIP_PUBLICATION_SERVICE_FIELD = 'membershipPublicationService';
const MEMBERSHIP_PUBLICATION_LAST_QUEUE_OUTCOME_FIELD =
  'lastControlPlaneConvergenceQueueOutcome';
const CONTROL_PLANE_READINESS_SERVICE_FIELD = 'controlPlaneReadinessService';
const REBALANCE_COORDINATOR_FIELD = 'rebalanceCoordinator';
const STORAGE_ADMISSION_SERVICE_FIELD = 'storageAdmissionService';
const MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_FIELD = Object.freeze({
  CONTROL_PLANE_CONVERGENCE: 'controlPlaneConvergence',
  CONTROL_PLANE_CONVERGENCE_CLASS: 'controlPlaneConvergenceClass',
  CONTROL_PLANE_PRESSURE_OUTCOME: 'controlPlanePressureOutcome',
});
const MEMBERSHIP_PUBLICATION_RECONCILE_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  ALLOW_EMPTY_PRELOADED_ROWS: 'allowEmptyPreloadedRows',
  ALLOW_PENDING_VISIBILITY: 'allowPendingVisibility',
  ALLOW_PRESSURE_DEFER: 'allowPressureDefer',
  DEFER_INLINE_OWNER_COMMAND: 'deferInlineOwnerCommand',
  DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING:
    'disableNestedPriorityRecoveryPlanning',
  LATEST_PUBLICATION_ROW: 'latestPublicationRow',
  NODE_ENDPOINT_ROWS: 'nodeEndpointRows',
  NODE_ROWS: 'nodeRows',
  PARTITION_ROWS: 'partitionRows',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLISHED_MEMBERSHIP_OBSERVATION: 'publishedMembershipObservation',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  READ_PROFILE: 'readProfile',
  READINESS_ENTRIES: 'readinessEntries',
  REPLICA_OPERATION_ROWS: 'replicaOperationRows',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  SERVICE_ROWS: 'serviceRows',
  SKIP_PUBLICATION_WRITE_READBACK: 'skipPublicationWriteReadback',
});
function normalizeMembershipPublicationHandoffPressureOutcome(options = {}) {
  const pressureOutcome = options.pressureOutcome;
  return Object.values(CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME).includes(
    pressureOutcome,
  ) ?
    pressureOutcome :
    CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED;
}
function buildMembershipPublicationHandoffControlPlaneConvergence(
  options = {},
) {
  const retryAfterMs = Number.isFinite(options.retryAfterMs) &&
    options.retryAfterMs > NUM.ZERO ?
    Math.floor(options.retryAfterMs) :
    MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_RETRY_AFTER_MS;
  return Object.freeze({
    schemaVersion: MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_SCHEMA_VERSION,
    convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
    pressureOutcome: normalizeMembershipPublicationHandoffPressureOutcome(
      options,
    ),
    ownerKey: MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_OWNER_KEY,
    operation: MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_OPERATION,
    queueBound: MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_QUEUE_BOUND,
    retryAfterMs,
    ...(typeof options.reasonCode === TYPEOF.STRING &&
      options.reasonCode.length > NUM.ZERO ?
      {reasonCode: options.reasonCode} :
      {}),
  });
}
function buildMembershipPublicationHandoffOutcome(state, options = {}) {
  const controlPlaneConvergence =
    options.controlPlaneConvergence &&
      typeof options.controlPlaneConvergence === TYPEOF.OBJECT ?
      Object.freeze({...options.controlPlaneConvergence}) :
      null;
  return Object.freeze({
    schemaVersion: MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_SCHEMA_VERSION,
    state,
    target: options.target || null,
    publicationRow: null,
    enqueued: options.enqueued === true,
    ...(Number.isFinite(options.retryAfterMs) &&
      options.retryAfterMs > NUM.ZERO ?
      {retryAfterMs: Math.floor(options.retryAfterMs)} :
      {}),
    ...(typeof options.reasonCode === TYPEOF.STRING &&
      options.reasonCode.length > NUM.ZERO ?
      {reasonCode: options.reasonCode} :
      {}),
    ...(controlPlaneConvergence ?
      {
        [MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_FIELD
          .CONTROL_PLANE_CONVERGENCE]: controlPlaneConvergence,
        [MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_FIELD
          .CONTROL_PLANE_CONVERGENCE_CLASS]:
          controlPlaneConvergence.convergenceClass,
        [MEMBERSHIP_PUBLICATION_HANDOFF_CONVERGENCE_FIELD
          .CONTROL_PLANE_PRESSURE_OUTCOME]:
          controlPlaneConvergence.pressureOutcome,
      } :
      {}),
  });
}
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
function buildMembershipPublicationReadOptions(options = {}) {
  return options.preferAuthoritativeRead === true ?
    {
      preferAuthoritativeRead: true,
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
    } :
    {readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS};
}
function resolveMembershipPublicationHandoffLatestPublicationRow(value = null) {
  if (!value || typeof value !== TYPEOF.OBJECT || Array.isArray(value)) {
    return null;
  }
  return resolveLatestMembershipPublicationRow([
    value[
      MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLISHED_MEMBERSHIP_OBSERVATION
    ],
    value[MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.PUBLICATION_CONVERGENCE],
    value[MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.PUBLICATION_CONVERGENCE]?.[
      MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLISHED_MEMBERSHIP_OBSERVATION
    ],
  ]);
}
function buildMembershipPublicationReconcileOptions(options = {}) {
  const publicationActiveGateHandoff =
    options[
      MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF
    ];
  const membershipPublicationTarget =
    resolvePublicationActiveGateMembershipPublicationTarget(
      publicationActiveGateHandoff,
    );
  if (
    membershipPublicationTarget.reconcileRequired !== true
  ) {
    return MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS;
  }
  const latestPublicationRow =
    resolveMembershipPublicationHandoffLatestPublicationRow(
      publicationActiveGateHandoff,
    );
  const skipPublicationWriteReadback =
    shouldDeferInlineMembershipPublicationOwnerCommand(options) ?
      MEMBERSHIP_PUBLICATION_HANDOFF_DEFERRED_SKIP_WRITE_READBACK :
      MEMBERSHIP_PUBLICATION_HANDOFF_SKIP_WRITE_READBACK;
  return {
    ...MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS,
    ...(latestPublicationRow ?
      {
        [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.LATEST_PUBLICATION_ROW]:
          latestPublicationRow,
      } :
      {}),
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.PUBLISHED_ACTIVE_NODE_IDS]:
      membershipPublicationTarget.publishedActiveNodeIds,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.REQUIRED_ACK_NODE_IDS]:
      membershipPublicationTarget.requiredAckNodeIds,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ACKNOWLEDGED_NODE_IDS]:
      membershipPublicationTarget.acknowledgedNodeIds,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ALLOW_PENDING_VISIBILITY]:
      true,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ALLOW_PRESSURE_DEFER]:
      MEMBERSHIP_PUBLICATION_HANDOFF_ALLOW_PRESSURE_DEFER,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.READ_PROFILE]:
      MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ALLOW_EMPTY_PRELOADED_ROWS]:
      MEMBERSHIP_PUBLICATION_HANDOFF_ALLOW_EMPTY_PRELOADED_ROWS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
      .DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING]:
      MEMBERSHIP_PUBLICATION_HANDOFF_DISABLE_NESTED_PRIORITY_RECOVERY,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.NODE_ROWS]:
      MEMBERSHIP_PUBLICATION_HANDOFF_EMPTY_ROWS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.NODE_ENDPOINT_ROWS]:
      MEMBERSHIP_PUBLICATION_HANDOFF_EMPTY_ROWS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.SERVICE_ROWS]:
      MEMBERSHIP_PUBLICATION_HANDOFF_EMPTY_ROWS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.PARTITION_ROWS]:
      MEMBERSHIP_PUBLICATION_HANDOFF_EMPTY_ROWS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.REPLICA_OPERATION_ROWS]:
      MEMBERSHIP_PUBLICATION_HANDOFF_EMPTY_ROWS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.READINESS_ENTRIES]:
      MEMBERSHIP_PUBLICATION_HANDOFF_EMPTY_ROWS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.SKIP_PUBLICATION_WRITE_READBACK]:
      skipPublicationWriteReadback,
  };
}
function buildDeferredMembershipPublicationReconcileOptions(options = {}) {
  const publicationActiveGateHandoff =
    options[
      MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF
    ];
  const membershipPublicationTarget =
    resolvePublicationActiveGateMembershipPublicationTarget(
      publicationActiveGateHandoff,
    );
  if (
    membershipPublicationTarget.reconcileRequired !== true
  ) {
    return MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS;
  }
  const latestPublicationRow =
    resolveMembershipPublicationHandoffLatestPublicationRow(
      publicationActiveGateHandoff,
    );
  return {
    ...MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS,
    ...(latestPublicationRow ?
      {
        [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.LATEST_PUBLICATION_ROW]:
          latestPublicationRow,
      } :
      {}),
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF]:
      publicationActiveGateHandoff,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ALLOW_PENDING_VISIBILITY]:
      true,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.ALLOW_PRESSURE_DEFER]:
      MEMBERSHIP_PUBLICATION_HANDOFF_ALLOW_PRESSURE_DEFER,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.READ_PROFILE]:
      MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
      .DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING]:
      MEMBERSHIP_PUBLICATION_HANDOFF_DISABLE_NESTED_PRIORITY_RECOVERY,
    [MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.SKIP_PUBLICATION_WRITE_READBACK]:
      MEMBERSHIP_PUBLICATION_HANDOFF_DEFERRED_SKIP_WRITE_READBACK,
  };
}
function isMembershipPublicationHandoffControlPlaneConvergence(value) {
  return value && typeof value === TYPEOF.OBJECT && !Array.isArray(value) &&
    value.convergenceClass === CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL &&
    Object.values(CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME).includes(
      value.pressureOutcome,
    );
}
function buildMembershipPublicationHandoffEnqueueOutcome({
  rawEnqueueResult,
  queueConvergence = null,
  called = false,
} = {}) {
  const queueAdmitted =
    queueConvergence?.pressureOutcome ===
    CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED;
  const accepted = called === true &&
    (rawEnqueueResult !== false || queueAdmitted === true);
  const controlPlaneConvergence =
    queueConvergence ||
    buildMembershipPublicationHandoffControlPlaneConvergence({
      pressureOutcome: accepted ?
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED :
        CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
    });
  return Object.freeze({
    accepted,
    controlPlaneConvergence,
    reasonCode: accepted ?
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_ENQUEUED :
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_SERVICE_UNAVAILABLE,
  });
}
function enqueueMembershipPublicationReconcileFallback(
  membershipPublicationService,
  reconcileOptions,
) {
  if (
    !membershipPublicationService ||
    typeof membershipPublicationService.enqueueClusterMembershipReconcile !==
      TYPEOF.FUNCTION
  ) {
    return buildMembershipPublicationHandoffEnqueueOutcome();
  }
  const rawEnqueueResult =
    membershipPublicationService.enqueueClusterMembershipReconcile(
      MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
      reconcileOptions,
    );
  const queueConvergence =
    isMembershipPublicationHandoffControlPlaneConvergence(
      membershipPublicationService[
        MEMBERSHIP_PUBLICATION_LAST_QUEUE_OUTCOME_FIELD
      ],
    ) ?
      membershipPublicationService[
        MEMBERSHIP_PUBLICATION_LAST_QUEUE_OUTCOME_FIELD
      ] :
      null;
  return buildMembershipPublicationHandoffEnqueueOutcome({
    rawEnqueueResult,
    queueConvergence,
    called: true,
  });
}
function isMembershipPublicationService(value) {
  return value && typeof value === TYPEOF.OBJECT;
}
function shouldDeferInlineMembershipPublicationOwnerCommand(options = {}) {
  return options[
    MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.DEFER_INLINE_OWNER_COMMAND
  ] === true;
}
function resolveMembershipPublicationServiceFromReadinessService(
  readinessService,
) {
  const membershipPublicationService =
    readinessService?.[MEMBERSHIP_PUBLICATION_SERVICE_FIELD] || null;
  return isMembershipPublicationService(membershipPublicationService) ?
    membershipPublicationService :
    null;
}
async function maybeReconcileAuthoritativeMembershipPublication(
  membershipPublicationService,
  options = {},
) {
  if (
    options.reconcileAuthoritativeMembershipPublication !== true
  ) {
    return null;
  }
  const publicationActiveGateHandoff =
    options[
      MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF
    ];
  const membershipPublicationTarget =
    resolvePublicationActiveGateMembershipPublicationTarget(
      publicationActiveGateHandoff,
    );
  if (membershipPublicationTarget.reconcileRequired !== true) {
    const handoffState = membershipPublicationTarget.handoffContract?.state;
    const outcomeState =
      handoffState === PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE ?
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.NO_CHANGE :
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.TARGET_BLOCKED;
    return buildMembershipPublicationHandoffOutcome(
      outcomeState,
      {
        target: membershipPublicationTarget,
        enqueued: false,
      },
    );
  }
  if (!membershipPublicationService) {
    return membershipPublicationTarget.reconcileRequired === true ?
      buildMembershipPublicationHandoffOutcome(
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.WRITE_DEFERRED,
        {
          target: membershipPublicationTarget,
          reasonCode:
            MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_SERVICE_UNAVAILABLE,
          controlPlaneConvergence:
            buildMembershipPublicationHandoffControlPlaneConvergence(),
        },
      ) :
      null;
  }
  if (shouldDeferInlineMembershipPublicationOwnerCommand(options)) {
    const reconcileOptions =
      buildDeferredMembershipPublicationReconcileOptions(options);
    const enqueueOutcome =
      reconcileOptions !== MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS ?
      enqueueMembershipPublicationReconcileFallback(
        membershipPublicationService,
        reconcileOptions,
      ) :
      buildMembershipPublicationHandoffEnqueueOutcome();
    return buildMembershipPublicationHandoffOutcome(
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.WRITE_DEFERRED,
      {
        target: membershipPublicationTarget,
        enqueued: enqueueOutcome.accepted,
        reasonCode: enqueueOutcome.reasonCode,
        controlPlaneConvergence:
          enqueueOutcome.controlPlaneConvergence,
      },
    );
  }
  if (
    typeof membershipPublicationService.reconcileActiveGateMembershipPublication ===
      TYPEOF.FUNCTION
  ) {
    return await membershipPublicationService.reconcileActiveGateMembershipPublication(
      publicationActiveGateHandoff,
      options,
    );
  }
  const reconcileOptions = buildMembershipPublicationReconcileOptions(options);
  if (reconcileOptions === MEMBERSHIP_PUBLICATION_RECONCILE_OPTIONS) {
    return null;
  }
  const enqueueOutcome = enqueueMembershipPublicationReconcileFallback(
    membershipPublicationService,
    reconcileOptions,
  );
  if (enqueueOutcome.accepted === true) {
    return buildMembershipPublicationHandoffOutcome(
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.WRITE_DEFERRED,
      {
        target: membershipPublicationTarget,
        enqueued: true,
        reasonCode: enqueueOutcome.reasonCode,
        controlPlaneConvergence:
          enqueueOutcome.controlPlaneConvergence,
      },
    );
  }
  return null;
}
function buildMembershipPublicationHandoffCommandFailureOutcome(
  error,
  publicationActiveGateHandoff,
) {
  const membershipPublicationTarget =
    resolvePublicationActiveGateMembershipPublicationTarget(
      publicationActiveGateHandoff,
    );
  return membershipPublicationTarget.reconcileRequired === true ?
    buildMembershipPublicationHandoffOutcome(
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.WRITE_DEFERRED,
      {
        target: membershipPublicationTarget,
        reasonCode:
          MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_COMMAND_ERROR,
        retryAfterMs: Number(error?.retryAfterMs),
        controlPlaneConvergence:
          buildMembershipPublicationHandoffControlPlaneConvergence({
            retryAfterMs: Number(error?.retryAfterMs),
          }),
      },
    ) :
    null;
}
function resolvePublicationOrderingValue(row, keys = []) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return NUM.ZERO;
}
function isMembershipPublicationRow(row) {
  const normalizedRow = normalizeControlPlanePublicationRow(row);
  const publicationKind = String(
    normalizedRow.publicationKind || '',
  ).toLowerCase();
  return (
    publicationKind.length === NUM.ZERO ||
    publicationKind === MEMBERSHIP_PUBLICATION_KIND
  );
}
function resolveLatestMembershipPublicationRow(
  publicationRows = [],
  options = {},
) {
  const expectedStatus =
    typeof options.status === TYPEOF.STRING ?
      options.status.toUpperCase() :
      null;
  const normalizedRows = (Array.isArray(publicationRows) ? publicationRows : [])
    .filter((row) => row && typeof row === TYPEOF.OBJECT)
    .filter((row) => isMembershipPublicationRow(row))
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => {
      if (expectedStatus && row.status !== expectedStatus) {
        return false;
      }
      return Boolean(
        row.publicationId ||
        row.publicationEpoch ||
        row.status ||
        (Array.isArray(row.publishedActiveNodeIds) &&
          row.publishedActiveNodeIds.length > NUM.ZERO),
      );
    });
  if (normalizedRows.length === NUM.ZERO) {
    return null;
  }
  normalizedRows.sort((left, right) => {
    const publicationEpochDelta =
      resolvePublicationOrderingValue(right, [
        'publicationEpoch',
        'publication_epoch',
      ]) -
      resolvePublicationOrderingValue(left, [
        'publicationEpoch',
        'publication_epoch',
      ]);
    if (publicationEpochDelta !== NUM.ZERO) {
      return publicationEpochDelta;
    }
    const publishedAtDelta =
      resolvePublicationOrderingValue(right, ['publishedAt', 'published_at']) -
      resolvePublicationOrderingValue(left, ['publishedAt', 'published_at']);
    if (publishedAtDelta !== NUM.ZERO) {
      return publishedAtDelta;
    }
    return (
      resolvePublicationOrderingValue(right, [
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT,
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT,
      ]) -
      resolvePublicationOrderingValue(left, [
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT,
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT,
      ])
    );
  });
  return normalizedRows[NUM.ZERO] || null;
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart6 extends AdminControlSnapshotPart5 {
  resolveMembershipPublicationService() {
    const readinessServices = [
      this.controlPlaneReadinessService || null,
      this.sqlQueryEngine?.[CONTROL_PLANE_READINESS_SERVICE_FIELD] || null,
      this.sqlQueryEngine?.[REBALANCE_COORDINATOR_FIELD]?.[
        CONTROL_PLANE_READINESS_SERVICE_FIELD
      ] || null,
      this.sqlQueryEngine?.[REBALANCE_COORDINATOR_FIELD]?.[
        STORAGE_ADMISSION_SERVICE_FIELD
      ]?.[CONTROL_PLANE_READINESS_SERVICE_FIELD] || null,
    ];
    for (const readinessService of readinessServices) {
      const membershipPublicationService =
        resolveMembershipPublicationServiceFromReadinessService(
          readinessService,
        );
      if (membershipPublicationService) {
        return membershipPublicationService;
      }
    }
    return null;
  }
  async reconcileAuthoritativeMembershipPublicationFromHandoff(
    publicationActiveGateHandoff,
    options = {},
  ) {
    return await maybeReconcileAuthoritativeMembershipPublication(
      this.resolveMembershipPublicationService(),
      {
        ...options,
        reconcileAuthoritativeMembershipPublication: true,
        publicationActiveGateHandoff,
      },
    );
  }
  buildMembershipPublicationHandoffOwnerCommandErrorOutcome(
    error,
    publicationActiveGateHandoff,
  ) {
    return buildMembershipPublicationHandoffCommandFailureOutcome(
      error,
      publicationActiveGateHandoff,
    );
  }
  async ensureMembershipPublicationObservation(options = {}) {
    const readinessService = this.controlPlaneReadinessService || null;
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    const hasMembershipPublicationService =
      isMembershipPublicationService(membershipPublicationService);
    const preferAuthoritativeRead = options.preferAuthoritativeRead === true;
    if (
      !preferAuthoritativeRead &&
      typeof readinessService?.getLatestMembershipPublicationRowSync ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        readinessService.getLatestMembershipPublicationRowSync(null, {
          lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
        });
      if (publicationRow) {
        return publicationRow;
      }
    }
    if (
      typeof readinessService?.getLatestMembershipPublicationRow ===
      TYPEOF.FUNCTION
    ) {
      const publicationRow =
        await readinessService.getLatestMembershipPublicationRow(null, {
          lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
        });
      if (publicationRow) {
        return publicationRow;
      }
    }
    if (
      hasMembershipPublicationService &&
      !preferAuthoritativeRead &&
      typeof membershipPublicationService.getLatestClusterPublicationSync ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        membershipPublicationService.getLatestClusterPublicationSync();
      if (publicationRow) {
        return publicationRow;
      }
    }
    if (
      hasMembershipPublicationService &&
      typeof membershipPublicationService.getLatestClusterPublication ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        await membershipPublicationService.getLatestClusterPublication(
          buildMembershipPublicationReadOptions({preferAuthoritativeRead}),
        );
      if (publicationRow) {
        return publicationRow;
      }
    }
    return resolveLatestMembershipPublicationRow(
      this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS),
    );
  }
  async ensurePublishedMembershipObservation(
    fallbackPublication = null,
    options = {},
  ) {
    if (
      fallbackPublication &&
      typeof fallbackPublication === TYPEOF.OBJECT &&
      String(
        fallbackPublication.status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
      ).toUpperCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED
    ) {
      return fallbackPublication;
    }
    const readinessService = this.controlPlaneReadinessService || null;
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    const hasMembershipPublicationService =
      isMembershipPublicationService(membershipPublicationService);
    if (
      options.preferAuthoritativeRead !== true &&
      typeof readinessService?.getLatestPublishedMembershipPublicationRowSync ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        readinessService.getLatestPublishedMembershipPublicationRowSync({
          lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
        });
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    if (
      typeof readinessService?.getLatestPublishedMembershipPublicationRow ===
      TYPEOF.FUNCTION
    ) {
      const publicationRow =
        await readinessService.getLatestPublishedMembershipPublicationRow({
          lane: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
        });
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    if (
      hasMembershipPublicationService &&
      options.preferAuthoritativeRead !== true &&
      typeof membershipPublicationService.getLatestPublishedClusterPublicationSync ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        membershipPublicationService.getLatestPublishedClusterPublicationSync();
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    if (
      hasMembershipPublicationService &&
      typeof membershipPublicationService.getLatestPublishedClusterPublication ===
        TYPEOF.FUNCTION
    ) {
      const publicationRow =
        await membershipPublicationService.getLatestPublishedClusterPublication(
          buildMembershipPublicationReadOptions({
            preferAuthoritativeRead: options.preferAuthoritativeRead === true,
          }),
        );
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    return resolveLatestMembershipPublicationRow(
      this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS),
      {status: ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED},
    );
  }
}
export {AdminControlSnapshotPart6};
