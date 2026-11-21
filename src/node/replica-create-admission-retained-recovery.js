import {readStateField} from '../utils/state-field-read.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
} from './replica-create-admission-owner.js';
import {buildFailedCreateCleanupToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {validateBootstrapMembershipStamp} from '../raft/raft-committed-membership-stamp.js';
import {
  ReplicaOperationField, ReplicaOperationMessageType,
} from '../rebalancer/replica-operation-constants.js';
import {
  OPERATION_METADATA_KEY, ReplicaStatus,
  getOperationMetadataObject, getOperationMetadataStringArray,
} from '../rebalancer/replica-status.js';

const RETAINED_CREATE_BOOTSTRAP_UNRESOLVED = 'RETAINED_CREATE_BOOTSTRAP_UNRESOLVED';
const EMPTY_ADMISSION_STEPS_HISTORY = Object.freeze([]);

function parseAdmissionStepsHistory(row) {
  if (Array.isArray(row?.steps_history)) return row.steps_history;
  if (typeof row?.steps_history !== 'string') {
    return EMPTY_ADMISSION_STEPS_HISTORY;
  }
  try {
    const parsed = JSON.parse(row.steps_history);
    return Array.isArray(parsed) ? parsed : EMPTY_ADMISSION_STEPS_HISTORY;
  } catch (_error) {
    return EMPTY_ADMISSION_STEPS_HISTORY;
  }
}

function buildRetainedCreateRequest(row, evidence) {
  const stepsHistory = parseAdmissionStepsHistory(row);
  const bootstrap = getOperationMetadataObject(
    stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP,
  );
  if (!validateBootstrapMembershipStamp(bootstrap).valid) {
    // The exact durable attempt remains the debt. A missing original is
    // not a transient read error and cannot authorize a replacement stamp.
    const error = new Error(`Original CREATE bootstrap is unresolved for ${row.operation_id}`);
    error.code = RETAINED_CREATE_BOOTSTRAP_UNRESOLVED;
    throw error;
  }
  const request = {
    [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.CREATE_REPLICA,
    [ReplicaOperationField.OPERATION_ID]: row.operation_id,
    [ReplicaOperationField.OPERATION_TYPE]: row.type,
    [ReplicaOperationField.ENTITY_TYPE]: row.entity_type,
    [ReplicaOperationField.ENTITY_ID]: row.entity_id,
    [ReplicaOperationField.PARTITION_ID]: row.partition_id,
    [ReplicaOperationField.REPLICA_ID]: row.replica_id,
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: bootstrap,
    [ReplicaOperationField.CREATE_ADMISSION_TOKEN]: evidence.admissionToken,
    [ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT]:
      evidence.workflowUpdatedAt,
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN]:
      evidence.attemptToken,
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ]: evidence.attemptSeq,
    createAdmissionEvidence: evidence,
  };
  const replicaIds = getOperationMetadataStringArray(
    stepsHistory,
    OPERATION_METADATA_KEY.REPLICA_IDS,
  );
  const metadata = [
    [ReplicaOperationField.BOOTSTRAP_TABLE_METADATA,
      OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA],
    [ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA,
      OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA],
  ];
  if (replicaIds.length > 0) {
    request[ReplicaOperationField.REPLICA_IDS] = replicaIds;
  }
  for (const [field, key] of metadata) {
    const value = getOperationMetadataObject(stepsHistory, key);
    if (value) request[field] = value;
  }
  return request;
}

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
  {reconcileLifecycle},
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
    if (!await handler.resumeRetainedReplicaCreateActivation(reconciled.evidence)) {
      await handler.handleCreateReplica(buildRetainedCreateRequest(row, reconciled.evidence));
    }
  });
}

async function recoverRetainedCreateAdmissionRows(
  handler,
  owner,
  rows,
  {reconcileLifecycle, onFailure},
) {
  const deferredOperationIds = [];
  for (const row of rows) {
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
    try {
      await recoverRetainedCreateAdmissionRow(handler, owner, row, {
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
