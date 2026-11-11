import {readStateField} from '../utils/state-field-read.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
} from './replica-create-admission-owner.js';
import {buildFailedCreateCleanupToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';

function deferredProgressError(operationId) {
  const error = new Error(`CREATE admission progress deferred ${operationId}`);
  error.code = CREATE_ADMISSION_ERROR_CODE.DEFERRED;
  error.errorCode = CREATE_ADMISSION_ERROR_CODE.DEFERRED;
  error.deferRetry = true;
  return error;
}

// Direct replay and retained recovery consume the same authoritative
// lifecycle fact; timeout settlement need not wait for another startup scan.
async function reconcileCreateAdmissionProgress(owner, evidence, lifecycleStatus) {
  if (lifecycleStatus === ReplicaStatus.FAILED &&
      [CREATE_ADMISSION_STATE.ADMITTED, CREATE_ADMISSION_STATE.MATERIALIZED]
        .includes(evidence.admissionState)) {
    return owner.markProgress(evidence, CREATE_ADMISSION_STATE.FAILED);
  }
  if (evidence.admissionState === CREATE_ADMISSION_STATE.ADMITTED) {
    return owner.markMaterialized(evidence);
  }
  return evidence;
}

function isSupersededAdmissionError(error) {
  return error?.bootIncarnationSuperseded === true ||
    error?.code === CREATE_ADMISSION_ERROR_CODE.STALE;
}

function firstNonEmptyValue(first, second) {
  if (first) return first;
  return second || null;
}

function readCandidateIdentity(candidate) {
  const service = candidate?.service || null;
  return {
    attemptToken: firstNonEmptyValue(
      candidate?.createAttemptToken,
      service?.createAttemptToken,
    ),
    admissionToken: firstNonEmptyValue(
      candidate?.createAdmissionToken,
      service?.createAdmissionToken,
    ),
    operationId: firstNonEmptyValue(
      candidate?.createAdmissionOperationId,
      service?.createAdmissionOperationId,
    ),
  };
}

function matchesTaggedField(expected, actual) {
  if (!expected || !actual) return null;
  return expected === actual;
}

function runtimeMatchesSupersededAdmission(
  candidate,
  {operationId, admissionToken, attemptToken, partitionService},
) {
  if (!candidate) return false;
  if (
    partitionService &&
    (candidate === partitionService || candidate.service === partitionService)
  ) {
    return true;
  }
  const identity = readCandidateIdentity(candidate);
  const matched =
    matchesTaggedField(attemptToken, identity.attemptToken) ??
    matchesTaggedField(admissionToken, identity.admissionToken) ??
    matchesTaggedField(operationId, identity.operationId);
  return matched === true;
}

function resolveFencedServiceCandidate(
  partitionService,
  currentService,
  currentReplica,
  serviceMatches,
  replicaMatches,
) {
  if (partitionService) return partitionService;
  if (serviceMatches) return currentService;
  return replicaMatches ? currentReplica?.service || null : null;
}

async function fenceSupersededRuntimeIfPresent(
  handler,
  replicaId,
  partitionId,
  serviceToFence,
  error,
) {
  if (
    !serviceToFence ||
    typeof handler?.fenceFailedReplicaCreateRuntime !== 'function'
  ) {
    return;
  }
  await handler.fenceFailedReplicaCreateRuntime(
    replicaId,
    partitionId,
    serviceToFence,
    error,
  );
}

function readRegisteredService(handler, replicaId) {
  if (!replicaId) return null;
  return handler.localServices?.get?.(replicaId) || null;
}

function readRegisteredReplica(handler, replicaId) {
  if (!replicaId) return null;
  return handler.localReplicas?.get?.(replicaId) || null;
}

async function retireSupersededCreateAdmissionRuntime(handler, options = {}) {
  const {replicaId, partitionId, partitionService, error} = options;
  const currentService = readRegisteredService(handler, replicaId);
  const currentReplica = readRegisteredReplica(handler, replicaId);
  const serviceMatches = runtimeMatchesSupersededAdmission(
    currentService,
    options,
  );
  const replicaMatches = runtimeMatchesSupersededAdmission(
    currentReplica,
    options,
  );
  const serviceToFence = resolveFencedServiceCandidate(
    partitionService,
    currentService,
    currentReplica,
    serviceMatches,
    replicaMatches,
  );
  await fenceSupersededRuntimeIfPresent(
    handler,
    replicaId,
    partitionId,
    serviceToFence,
    error,
  );
}

function isClosedOrCompletedRow(row) {
  return row.create_admission_state === CREATE_ADMISSION_STATE.CLOSED ||
    (row.completed_at !== null && row.completed_at !== undefined);
}

async function takeOverRetainedRowOrRetire(owner, row, retireRowRuntime) {
  try {
    const evidence = await owner.takeoverRetained(row);
    if (!evidence && isClosedOrCompletedRow(row)) {
      await retireRowRuntime();
    }
    return evidence;
  } catch (error) {
    if (isSupersededAdmissionError(error)) {
      await retireRowRuntime(error);
      return null;
    }
    throw error;
  }
}

async function settleRetainedLifecycleProgress(
  owner,
  row,
  evidence,
  lifecycleStatus,
  retireRowRuntime,
) {
  const settledState = lifecycleStatus === ReplicaStatus.ACTIVE ?
    CREATE_ADMISSION_STATE.ACTIVE :
    CREATE_ADMISSION_STATE.FAILED;
  if (evidence.admissionState === settledState) {
    return;
  }
  let progressed = null;
  try {
    progressed = await owner.markProgress(evidence, settledState);
  } catch (error) {
    if (isSupersededAdmissionError(error)) {
      await retireRowRuntime(error);
      return;
    }
    throw error;
  }
  if (!progressed) {
    throw deferredProgressError(row.operation_id);
  }
}

async function claimRetainedTerminalFailedCreateRow(handler, reconciled) {
  if (
    reconciled.row?.status !== ReplicaStatus.FAILED ||
    reconciled.evidence?.operationTerminal !== true ||
    reconciled.row?.cleanup_token !== null ||
    typeof reconciled.evidence.attemptToken !== 'string' ||
    reconciled.evidence.attemptToken.length === 0 ||
    reconciled.row.create_attempt_token !== reconciled.evidence.attemptToken
  ) {
    return;
  }
  await handler.replicaStateMachine?.claimFailedCreateCleanup?.(
    reconciled.row,
    buildFailedCreateCleanupToken(reconciled.evidence.operationId),
  );
}

async function recoverRetainedCreateAdmissionRow(
  handler,
  owner,
  row,
  {buildRequest, reconcileLifecycle},
) {
  await owner.runExclusive(row.operation_id, async () => {
    handler.throwIfShuttingDown();
    const retireRowRuntime = (error = null) =>
      retireSupersededCreateAdmissionRuntime(handler, {
        replicaId: row.replica_id,
        partitionId: row.partition_id,
        operationId: row.operation_id,
        admissionToken: row.create_admission_token,
        attemptToken: row.create_admission_attempt_token,
        error,
      });
    const evidence = await takeOverRetainedRowOrRetire(
      owner,
      row,
      retireRowRuntime,
    );
    if (!evidence) return;
    const reconciled = await reconcileLifecycle(handler, evidence);
    const lifecycleStatus = readStateField(reconciled.row?.status);
    if (
      lifecycleStatus === ReplicaStatus.ACTIVE ||
      lifecycleStatus === ReplicaStatus.FAILED
    ) {
      await claimRetainedTerminalFailedCreateRow(handler, reconciled);
      await settleRetainedLifecycleProgress(
        owner,
        row,
        reconciled.evidence,
        lifecycleStatus,
        retireRowRuntime,
      );
      return;
    }
    await handler.handleCreateReplica(buildRequest(row, reconciled.evidence));
  });
}

function isSatisfiedCurrentBootActiveRow(handler, owner, row) {
  if (
    row?.create_admission_state !== CREATE_ADMISSION_STATE.ACTIVE ||
    owner?.ownerIncarnation === null ||
    Number(row.create_admission_owner_incarnation) !== owner.ownerIncarnation
  ) {
    return false;
  }
  const currentReplica = readRegisteredReplica(handler, row.replica_id);
  if (!handler.isReplicaCreateAlreadySatisfied(currentReplica)) {
    return false;
  }
  const matchOptions = {
    operationId: row.operation_id,
    admissionToken: row.create_admission_token,
    attemptToken: row.create_admission_attempt_token,
  };
  return (
    runtimeMatchesSupersededAdmission(currentReplica, matchOptions) ||
    runtimeMatchesSupersededAdmission(
      readRegisteredService(handler, row.replica_id),
      matchOptions,
    )
  );
}

// Recovery order of retained rows: closed retirements first, ACTIVE rows
// last, and within each class the open rows before the completed ones.
const RETAINED_RECOVERY_ROW_PRIORITY = Object.freeze({
  CLOSED: 0,
  OPEN: 1,
  OPEN_COMPLETED: 2,
  ACTIVE: 3,
  ACTIVE_COMPLETED: 4,
});

function retainedRecoveryRowPriority(row) {
  if (row?.create_admission_state === CREATE_ADMISSION_STATE.CLOSED) {
    return RETAINED_RECOVERY_ROW_PRIORITY.CLOSED;
  }
  const isCompleted =
    row?.completed_at !== null && row?.completed_at !== undefined;
  if (row?.create_admission_state !== CREATE_ADMISSION_STATE.ACTIVE) {
    return isCompleted ?
      RETAINED_RECOVERY_ROW_PRIORITY.OPEN_COMPLETED :
      RETAINED_RECOVERY_ROW_PRIORITY.OPEN;
  }
  return isCompleted ?
    RETAINED_RECOVERY_ROW_PRIORITY.ACTIVE_COMPLETED :
    RETAINED_RECOVERY_ROW_PRIORITY.ACTIVE;
}

async function recoverRetainedCreateAdmissionRows(
  handler,
  owner,
  rows,
  {buildRequest, reconcileLifecycle, onFailure},
) {
  const deferredOperationIds = [];
  const orderedRows = Array.isArray(rows) ?
    [...rows].sort(
      (left, right) =>
        retainedRecoveryRowPriority(left) - retainedRecoveryRowPriority(right),
    ) :
    [];
  for (const row of orderedRows) {
    handler.throwIfShuttingDown();
    if (row.create_admission_state === CREATE_ADMISSION_STATE.CLOSED) {
      await retireSupersededCreateAdmissionRuntime(handler, {
        replicaId: row.replica_id,
        partitionId: row.partition_id,
        operationId: row.operation_id,
        admissionToken: row.create_admission_token,
        attemptToken: row.create_admission_attempt_token,
      });
      continue;
    }
    if (isSatisfiedCurrentBootActiveRow(handler, owner, row)) {
      continue;
    }
    try {
      await recoverRetainedCreateAdmissionRow(handler, owner, row, {
        buildRequest,
        reconcileLifecycle,
      });
    } catch (error) {
      handler.throwIfShuttingDown();
      if (isSupersededAdmissionError(error)) {
        await retireSupersededCreateAdmissionRuntime(handler, {
          replicaId: row.replica_id,
          partitionId: row.partition_id,
          operationId: row.operation_id,
          admissionToken: row.create_admission_token,
          attemptToken: row.create_admission_attempt_token,
          error,
        });
        continue;
      }
      if (
        error?.deferRetry === true ||
        error?.code === CREATE_ADMISSION_ERROR_CODE.DEFERRED
      ) {
        deferredOperationIds.push(row.operation_id);
        continue;
      }
      onFailure?.(row, error);
    }
  }
  return deferredOperationIds;
}

export {
  reconcileCreateAdmissionProgress,
  isSupersededAdmissionError,
  recoverRetainedCreateAdmissionRow,
  recoverRetainedCreateAdmissionRows,
  retireSupersededCreateAdmissionRuntime,
};
