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
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  resolvePublicationActiveGateMembershipPublicationTarget,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_COMMAND_ERROR,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_SERVICE_UNAVAILABLE,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_SERVICE_UNAVAILABLE,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE,
  buildMembershipPublicationHandoffControlPlaneConvergence,
  buildMembershipPublicationHandoffEnqueueOutcome,
  buildMembershipPublicationHandoffOutcome,
  isMembershipPublicationHandoffControlPlaneConvergence,
  resolveOwnerRecoveryWaitHandoffReasonCode,
} from './admin-control-membership-publication-handoff-outcomes.js';
import {AdminControlSnapshotPart5} from './admin-control-snapshot-class-part-5.js';
import {isRecoverableControlSnapshotPublicationReadError} from './admin-control-snapshot-repair-diagnostics.js';
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
const MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_OUTCOME = null;
const MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_ROW = null;
const MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_SERVICE = null;
const MEMBERSHIP_PUBLICATION_SERVICE_FIELD = 'membershipPublicationService';
const MEMBERSHIP_PUBLICATION_LAST_QUEUE_OUTCOME_FIELD =
  'lastControlPlaneConvergenceQueueOutcome';
const CONTROL_PLANE_READINESS_SERVICE_FIELD = 'controlPlaneReadinessService';
const REBALANCE_COORDINATOR_FIELD = 'rebalanceCoordinator';
const STORAGE_ADMISSION_SERVICE_FIELD = 'storageAdmissionService';
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
    return MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_ROW;
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
function isMembershipPublicationOwnerRecoveryWaitTarget(target = null) {
  return target &&
    typeof target === TYPEOF.OBJECT &&
    !Array.isArray(target) &&
    target.handoffContract?.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY &&
    (
      Number(target.pendingRecoveryCount) > NUM.ZERO ||
      Array.isArray(target.pendingRecoveryNodeIds) &&
        target.pendingRecoveryNodeIds.length > NUM.ZERO
    );
}
function buildOwnerRecoveryWaitReconcileOptions(options = {}) {
  const publicationActiveGateHandoff =
    options[
      MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF
    ];
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
    readinessService?.[MEMBERSHIP_PUBLICATION_SERVICE_FIELD] ||
    MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_SERVICE;
  return isMembershipPublicationService(membershipPublicationService) ?
    membershipPublicationService :
    MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_SERVICE;
}
async function maybeReconcileAuthoritativeMembershipPublication(
  membershipPublicationService,
  options = {},
) {
  if (
    options.reconcileAuthoritativeMembershipPublication !== true
  ) {
    return MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_OUTCOME;
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
    if (
      isMembershipPublicationOwnerRecoveryWaitTarget(
        membershipPublicationTarget,
      ) === true
    ) {
      if (!membershipPublicationService) {
        const recoveryWaitReason =
          MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_REASON_OWNER_RECOVERY_WAIT_SERVICE_UNAVAILABLE;
        return buildMembershipPublicationHandoffOutcome(
          MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.WRITE_DEFERRED,
          {
            target: membershipPublicationTarget,
            reasonCode: recoveryWaitReason,
            controlPlaneConvergence:
              buildMembershipPublicationHandoffControlPlaneConvergence({
                reasonCode: recoveryWaitReason,
              }),
          },
        );
      }
      const enqueueOutcome = enqueueMembershipPublicationReconcileFallback(
        membershipPublicationService,
        buildOwnerRecoveryWaitReconcileOptions(options),
      );
      return buildMembershipPublicationHandoffOutcome(
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE.WRITE_DEFERRED,
        {
          target: membershipPublicationTarget,
          enqueued: enqueueOutcome.accepted,
          reasonCode: resolveOwnerRecoveryWaitHandoffReasonCode(
            enqueueOutcome,
          ),
          controlPlaneConvergence:
            enqueueOutcome.controlPlaneConvergence,
        },
      );
    }
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
      MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_OUTCOME;
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
    return MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_OUTCOME;
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
  return MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_OUTCOME;
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
    return MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_ROW;
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
  return normalizedRows[NUM.ZERO] || MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_ROW;
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
    return MEMBERSHIP_PUBLICATION_HANDOFF_ABSENT_SERVICE;
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
      try {
        const publicationRow =
          await membershipPublicationService.getLatestClusterPublication(
            buildMembershipPublicationReadOptions({preferAuthoritativeRead}),
          );
        if (publicationRow) {
          return publicationRow;
        }
      } catch (error) {
        const errorMsg = String(error?.message || error || '').toLowerCase();
        const isTimeoutError = errorMsg.includes('timeout') || errorMsg.includes('timed out');
        const isConnectionError =
          errorMsg.includes('ehostunreach') ||
          errorMsg.includes('econnrefused') ||
          errorMsg.includes('econnreset') ||
          errorMsg.includes('socket hang up') ||
          errorMsg.includes('network error') ||
          errorMsg.includes('aborted') ||
          errorMsg.includes('closed');
        if (
          !isRecoverableControlSnapshotPublicationReadError(error) &&
          !isTimeoutError &&
          !isConnectionError
        ) {
          throw error;
        }
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
      try {
        const publicationRow =
          await membershipPublicationService.getLatestPublishedClusterPublication(
            buildMembershipPublicationReadOptions({
              preferAuthoritativeRead: options.preferAuthoritativeRead === true,
            }),
          );
        if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
          return publicationRow;
        }
      } catch (error) {
        const errorMsg = String(error?.message || error || '').toLowerCase();
        const isTimeoutError = errorMsg.includes('timeout') || errorMsg.includes('timed out');
        const isConnectionError =
          errorMsg.includes('ehostunreach') ||
          errorMsg.includes('econnrefused') ||
          errorMsg.includes('econnreset') ||
          errorMsg.includes('socket hang up') ||
          errorMsg.includes('network error') ||
          errorMsg.includes('aborted') ||
          errorMsg.includes('closed');
        if (
          !isRecoverableControlSnapshotPublicationReadError(error) &&
          !isTimeoutError &&
          !isConnectionError
        ) {
          throw error;
        }
      }
    }
    return resolveLatestMembershipPublicationRow(
      this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS),
      {status: ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED},
    );
  }
}
export {AdminControlSnapshotPart6};
