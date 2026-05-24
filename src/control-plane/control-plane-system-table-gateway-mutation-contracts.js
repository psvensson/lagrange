import {NUM, TYPEOF} from '../constants/index.js';
import {getSchemaByTableName} from '../bootstrap/system-table-schemas-constants.js';
import {canonicalizeSystemTableRow} from './system-row-normalizers.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from './owner-contract-outcome.js';
import {
  OWNER_OUTCOME_FRESHNESS,
  OWNER_OUTCOME_STATE,
  buildOwnerOutcomeEnvelope,
} from './owner-outcome-contract.js';
import {buildControlPlaneWorkloadProfile} from './control-plane-workload-profile.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  normalizeControlPlaneSystemTableVisibilityState,
} from './control-plane-system-table-visibility-constants.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
} from './control-plane-error-classification.js';
import {PRESSURE_GOVERNOR_ACTION} from './pressure-governor.js';
import {
  CONTROL_PLANE_GATEWAY_OWNER_OUTCOME,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
} from './control-plane-system-table-gateway-constants.js';
import {
  normalizeDistinctStringArray,
} from './control-plane-system-table-gateway-normalizers.js';

function resolveMutationCompletionState(result = {}) {
  if (
    typeof result?.completionState === TYPEOF.STRING &&
    result.completionState.length > NUM.ZERO
  ) {
    return result.completionState;
  }
  if (
    typeof result?.visibilityState === TYPEOF.STRING &&
    result.visibilityState !==
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE
  ) {
    return CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY;
  }
  if (result?.success === false) {
    return result?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER ?
      CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED :
      result?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT ?
        CONTROL_PLANE_MUTATION_OUTCOME.REJECTED :
        CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY;
  }
  const affectedRows = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  return Number.isFinite(affectedRows) && affectedRows <= NUM.ZERO ?
    CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED :
    CONTROL_PLANE_MUTATION_OUTCOME.APPLIED;
}

function buildControlPlaneMutationIntent(
  operation,
  tableName,
  mutation = {},
) {
  return {
    ...mutation,
    operation,
    tableName,
  };
}

function canonicalizeControlPlaneMutation(
  mutation = {},
  operation,
  tableName,
) {
  const schema = tableName ? getSchemaByTableName(tableName) : null;
  const allowedColumns = schema && schema.columns ?
    new Set(schema.columns.map((c) => c.name)) :
    null;

  let row = mutation?.row;
  if (
    row &&
    typeof row === TYPEOF.OBJECT &&
    (operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT ||
      operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT)
  ) {
    const canonicalized = canonicalizeSystemTableRow(tableName, row);
    if (allowedColumns) {
      row = {};
      for (const [key, value] of Object.entries(canonicalized)) {
        if (allowedColumns.has(key) && typeof value !== TYPEOF.UNDEFINED) {
          row[key] = value;
        }
      }
    } else {
      row = canonicalized;
    }
  }

  let data = mutation?.data;
  if (
    data &&
    typeof data === TYPEOF.OBJECT &&
    operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE
  ) {
    const canonicalized = canonicalizeSystemTableRow(tableName, data);
    if (allowedColumns) {
      data = {};
      for (const [key, value] of Object.entries(canonicalized)) {
        if (allowedColumns.has(key) && typeof value !== TYPEOF.UNDEFINED) {
          data[key] = value;
        }
      }
    } else {
      data = canonicalized;
    }
  }

  let whereClause = mutation?.whereClause;
  if (
    whereClause &&
    typeof whereClause === TYPEOF.OBJECT &&
    (operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE ||
      operation === CONTROL_PLANE_MUTATION_OPERATION.DELETE)
  ) {
    const canonicalized = canonicalizeSystemTableRow(tableName, whereClause);
    if (allowedColumns) {
      whereClause = {};
      for (const [key, value] of Object.entries(canonicalized)) {
        if (allowedColumns.has(key) && typeof value !== TYPEOF.UNDEFINED) {
          whereClause[key] = value;
        }
      }
    } else {
      whereClause = canonicalized;
    }
  }

  return {
    ...mutation,
    operation,
    tableName,
    row,
    data,
    whereClause,
  };
}

function buildControlPlaneMutationOutcomeSnapshot(outcome, completionState) {
  return {
    outcome,
    completionState,
  };
}

function resolveControlPlaneMutationOutcomeSnapshot(result = {}) {
  const completionState = resolveMutationCompletionState(result);
  const affectedRows = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  if (result?.outcome) {
    return buildControlPlaneMutationOutcomeSnapshot(
      result.outcome,
      completionState,
    );
  }
  if (result?.success === false) {
    return buildControlPlaneMutationOutcomeSnapshot(
      result?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER ?
        CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED :
        result?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT ?
          CONTROL_PLANE_MUTATION_OUTCOME.REJECTED :
          CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
      completionState,
    );
  }
  if (
    typeof result?.visibilityState === TYPEOF.STRING &&
    result.visibilityState !==
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE
  ) {
    return buildControlPlaneMutationOutcomeSnapshot(
      CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
      completionState,
    );
  }
  if (Number.isFinite(affectedRows) && affectedRows <= NUM.ZERO) {
    return buildControlPlaneMutationOutcomeSnapshot(
      CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
      completionState,
    );
  }
  return buildControlPlaneMutationOutcomeSnapshot(
    CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    completionState,
  );
}

function resolveControlPlaneMutationContractOutcome(
  result = {},
  normalizedOutcome,
) {
  const visibilityState = normalizeControlPlaneSystemTableVisibilityState(
    result?.visibilityState,
    null,
  );
  if (
    visibilityState ===
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE
  ) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    });
  }
  if (
    visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY ||
    visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.AUTHORITATIVE_CONFIRMATION_PENDING
  ) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    });
  }
  if (
    normalizedOutcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ||
    normalizedOutcome === CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY
  ) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    });
  }
  if (normalizedOutcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.BLOCKED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
    });
  }
  if (result?.success === false) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.FAILED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
    });
  }
  return buildOwnerContractOutcome({
    contractState: OWNER_CONTRACT_STATE.READY,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
  });
}

function resolveControlPlaneMutationOutcomeFreshness(
  visibilityState,
  contractOutcome,
) {
  if (
    visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY ||
    visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE
        .AUTHORITATIVE_CONFIRMATION_PENDING ||
    visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE
  ) {
    return OWNER_OUTCOME_FRESHNESS.STALE;
  }
  if (contractOutcome.contractState === OWNER_CONTRACT_STATE.READY) {
    return OWNER_OUTCOME_FRESHNESS.FRESH;
  }
  if (
    contractOutcome.contractState === OWNER_CONTRACT_STATE.PENDING ||
    contractOutcome.contractState === OWNER_CONTRACT_STATE.DEFERRED
  ) {
    return OWNER_OUTCOME_FRESHNESS.STALE;
  }
  return OWNER_OUTCOME_FRESHNESS.UNKNOWN;
}

function resolveControlPlaneMutationOutcomeReasonCodes(result = {}) {
  const localReasonCodes = normalizeDistinctStringArray(result?.reasonCodes);
  if (localReasonCodes.length > NUM.ZERO) {
    return localReasonCodes;
  }
  const errorCode = getControlPlaneErrorCode(result?.error || result);
  if (typeof errorCode === TYPEOF.STRING && errorCode.length > NUM.ZERO) {
    return [errorCode];
  }
  const failureSummary = getControlPlaneFailureSummary(result?.error || result);
  if (
    typeof failureSummary?.primaryReason === TYPEOF.STRING &&
    failureSummary.primaryReason.length > NUM.ZERO
  ) {
    return [failureSummary.primaryReason];
  }
  return [];
}

function resolveControlPlaneWakeSource(result = {}, visibilityState) {
  if (typeof result?.wakeSource === TYPEOF.STRING && result.wakeSource.length > NUM.ZERO) {
    return result.wakeSource;
  }
  if (visibilityState === CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE) {
    return 'pressure_governor';
  }
  return 'retry_registry';
}

function resolveControlPlaneAttemptKey(result = {}) {
  if (typeof result?.attemptKey === TYPEOF.STRING && result.attemptKey.length > NUM.ZERO) {
    return result.attemptKey;
  }
  if (typeof result?.coalescingKey === TYPEOF.STRING && result.coalescingKey.length > NUM.ZERO) {
    return result.coalescingKey;
  }
  if (typeof result?.requestKey === TYPEOF.STRING && result.requestKey.length > NUM.ZERO) {
    return result.requestKey;
  }
  return 'unknown_attempt_key';
}

function resolveControlPlaneDeadline(result = {}) {
  if (Number.isFinite(result?.deadline)) {
    return result.deadline;
  }
  const retryAfter = Number.isFinite(result?.retryAfterMs) ?
    result.retryAfterMs :
    250;
  return Date.now() + Math.max(30000, retryAfter * 10);
}

function resolveControlPlaneTerminalEscalationBehavior(result = {}) {
  if (
    typeof result?.terminalEscalationBehavior === TYPEOF.STRING &&
    result.terminalEscalationBehavior.length > NUM.ZERO
  ) {
    return result.terminalEscalationBehavior;
  }
  if (
    typeof result?.terminalEscalationState === TYPEOF.STRING &&
    result.terminalEscalationState.length > NUM.ZERO
  ) {
    return result.terminalEscalationState;
  }
  return 'escalate';
}

function buildControlPlaneMutationOwnerOutcomeEnvelope(
  result = {},
  normalizedOutcome = null,
) {
  const outcomeSnapshot = resolveControlPlaneMutationOutcomeSnapshot(result);
  const resolvedOutcome =
    typeof normalizedOutcome === TYPEOF.STRING ?
      normalizedOutcome :
      outcomeSnapshot.outcome;
  const contractOutcome = resolveControlPlaneMutationContractOutcome(
    result,
    resolvedOutcome,
  );
  const visibilityState = normalizeControlPlaneSystemTableVisibilityState(
    result?.visibilityState,
    null,
  );
  const isDeferredOrBackpressured =
    contractOutcome.contractState === OWNER_CONTRACT_STATE.DEFERRED;

  const wakeSource = resolveControlPlaneWakeSource(result, visibilityState);
  const attemptKey = resolveControlPlaneAttemptKey(result);
  const maxProgressBound = Number.isFinite(result?.maxProgressBound) ?
    result.maxProgressBound :
    NUM.FIVE;
  const deadline = resolveControlPlaneDeadline(result);
  const terminalEscalationBehavior =
    resolveControlPlaneTerminalEscalationBehavior(result);

  const envelope = buildOwnerOutcomeEnvelope({
    owner: CONTROL_PLANE_GATEWAY_OWNER_OUTCOME.OWNER,
    boundary: CONTROL_PLANE_GATEWAY_OWNER_OUTCOME.BOUNDARY,
    state: contractOutcome.contractState,
    outcome: resolvedOutcome,
    reasonCodes: resolveControlPlaneMutationOutcomeReasonCodes(result),
    nextAction: contractOutcome.nextAction,
    freshness: resolveControlPlaneMutationOutcomeFreshness(
      visibilityState,
      contractOutcome,
    ),
    revision: Number.isFinite(result?.revision) ?
      result.revision :
      NUM.ZERO,
    retryAfterMs: getControlPlaneRetryAfterMs(result),
    terminal:
      contractOutcome.contractState === OWNER_OUTCOME_STATE.BLOCKED ||
      contractOutcome.contractState === OWNER_OUTCOME_STATE.FAILED,
    evidence: {
      completionState: outcomeSnapshot.completionState,
      visibilityState,
      success: result?.success === true,
      failureSummary: getControlPlaneFailureSummary(result?.error || result),
      wakeSource,
      attemptKey,
      maxProgressBound,
      deadline,
      terminalEscalationBehavior,
    },
  });

  if (isDeferredOrBackpressured) {
    return Object.freeze({
      ...envelope,
      wakeSource,
      attemptKey,
      maxProgressBound,
      deadline,
      terminalEscalationBehavior,
    });
  }

  return envelope;
}

function applyMutationWorkloadProfileDefaults(
  resolvedOptions = {},
  options = {},
) {
  if (
    typeof options?.workloadClass !== TYPEOF.STRING ||
    options.workloadClass.length === NUM.ZERO
  ) {
    return resolvedOptions;
  }
  const workloadProfile = buildControlPlaneWorkloadProfile(
    options.workloadClass,
  );
  const mergedResourceKeys = normalizeDistinctStringArray([
    ...(typeof options?.resourceKeys === TYPEOF.UNDEFINED ?
      workloadProfile.resourceKeys :
      []),
    ...(Array.isArray(resolvedOptions?.resourceKeys) ?
      resolvedOptions.resourceKeys :
      []),
  ]);
  return {
    ...resolvedOptions,
    workloadClass: workloadProfile.workloadClass,
    workClass:
      typeof options?.workClass === TYPEOF.UNDEFINED ?
        workloadProfile.workClass :
        resolvedOptions.workClass,
    allowPressureDefer:
      typeof options?.allowPressureDefer === TYPEOF.UNDEFINED ?
        workloadProfile.allowPressureDefer :
        resolvedOptions.allowPressureDefer,
    resourceKeys: mergedResourceKeys,
  };
}

export {
  applyMutationWorkloadProfileDefaults,
  buildControlPlaneMutationIntent,
  buildControlPlaneMutationOwnerOutcomeEnvelope,
  canonicalizeControlPlaneMutation,
  resolveControlPlaneMutationContractOutcome,
  resolveControlPlaneMutationOutcomeSnapshot,
  resolveMutationCompletionState,
};
