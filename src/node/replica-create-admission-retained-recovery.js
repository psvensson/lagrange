import {readStateField} from '../utils/state-field-read.js';
import {CDC_OPERATION, SERVICE_TYPE, TABLES} from '../constants/index.js';
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
const retainedBootstrapWakeByHandler = new WeakMap();

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

function originalBootstrapFromHistory(stepsHistory) {
  const bootstrap = getOperationMetadataObject(
    stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP,
  );
  return validateBootstrapMembershipStamp(bootstrap).valid ? bootstrap : null;
}

function buildRetainedCreateRequest(row, evidence) {
  const stepsHistory = parseAdmissionStepsHistory(row);
  const bootstrap = originalBootstrapFromHistory(stepsHistory);
  if (bootstrap === null) {
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

function retainedBootstrapPublicationMayClear(table, published, retained) {
  if (table === TABLES.REPLICA_OPERATIONS) {
    return published?.operation_id === retained.operation_id &&
      published.target_node_id === retained.target_node_id &&
      published.replica_id === retained.replica_id &&
      published.create_admission_token === retained.create_admission_token &&
      (isClosedOrCompletedRow(published) ||
        originalBootstrapFromHistory(parseAdmissionStepsHistory(published)) !== null);
  }
  return table === TABLES.SERVICES && published?.service_id === retained.replica_id &&
    published.replica_id === retained.replica_id &&
    published.service_type === SERVICE_TYPE.PARTITION &&
    published.partition_id === retained.partition_id &&
    published.node_id === retained.target_node_id &&
    published.created_at === retained.create_admission_replica_created_at &&
    published.create_attempt_token === retained.create_admission_attempt_token &&
    (published.status === ReplicaStatus.ACTIVE || published.status === ReplicaStatus.FAILED);
}

function queueRetainedBootstrapWake(handler, state) {
  if (handler.shuttingDown || state.scheduled) return;
  state.scheduled = true;
  const afterCurrentRecovery = () => {
    state.scheduled = false;
    if (!handler.shuttingDown && state.rows.size > 0) {
      return handler.startReplicaCreateAdmissionRecovery();
    }
  };
  // Publish wakeups as hints to the existing owner. Its recovery task owns the
  // authoritative read, retry and shutdown join after the current scan.
  Promise.resolve(handler.replicaCreateAdmissionRecoveryTask)
    .then(afterCurrentRecovery, afterCurrentRecovery)
    .catch(() => {
      // startReplicaCreateAdmissionRecovery reports and owns its own failures.
    });
}

function retainBootstrapWake(handler, row) {
  const cache = handler.systemTableCache;
  if (typeof cache?.onCacheChange !== 'function' ||
      typeof cache.offCacheChange !== 'function') return;
  let state = retainedBootstrapWakeByHandler.get(handler);
  if (!state) {
    state = {rows: new Map(), scheduled: false};
    state.listener = (table, operation, published) => {
      if (operation === CDC_OPERATION.DELETE ||
          (table !== TABLES.REPLICA_OPERATIONS && table !== TABLES.SERVICES)) return;
      if ([...state.rows.values()].some((retained) =>
        retainedBootstrapPublicationMayClear(table, published, retained))) {
        queueRetainedBootstrapWake(handler, state);
      }
    };
    cache.onCacheChange(state.listener);
    retainedBootstrapWakeByHandler.set(handler, state);
  }
  const previous = state.rows.get(row.operation_id);
  if (previous?.create_admission_attempt_token === row.create_admission_attempt_token) return;
  state.rows.set(row.operation_id, {
    operation_id: row.operation_id,
    partition_id: row.partition_id,
    replica_id: row.replica_id,
    target_node_id: row.target_node_id,
    create_admission_token: row.create_admission_token,
    create_admission_attempt_token: row.create_admission_attempt_token,
    create_admission_replica_created_at: row.create_admission_replica_created_at,
  });
  // A publication that raced the initial authoritative scan is already
  // projected. Check that level once on parking, never on a repeated miss.
  if ([TABLES.REPLICA_OPERATIONS, TABLES.SERVICES].some((table) =>
    retainedBootstrapPublicationMayClear(table,
      cache.get(table, table === TABLES.REPLICA_OPERATIONS ? row.operation_id : row.replica_id),
      row))) {
    queueRetainedBootstrapWake(handler, state);
  }
}

function disarmRetainedBootstrapWake(handler, operationId) {
  const state = retainedBootstrapWakeByHandler.get(handler);
  if (!state) return;
  state.rows.delete(operationId);
  if (state.rows.size === 0) stopRetainedBootstrapWake(handler);
}

function stopRetainedBootstrapWake(handler) {
  const state = retainedBootstrapWakeByHandler.get(handler);
  if (!state) return;
  retainedBootstrapWakeByHandler.delete(handler);
  handler.systemTableCache.offCacheChange(state.listener);
  state.rows.clear();
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
    if (reconciled.evidence.operationTerminal) {
      // The exact operation is terminal and cannot start CREATE again.
      // Confirmed lifecycle absence lets its existing admission owner close.
      if (!reconciled.row && !await owner.close(reconciled.evidence)) {
        throw deferredProgressError(row.operation_id);
      }
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
      disarmRetainedBootstrapWake(handler, row.operation_id);
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
      disarmRetainedBootstrapWake(handler, row.operation_id);
    } catch (error) {
      handler.throwIfShuttingDown();
      if (isSupersededAdmissionError(error)) {
        disarmRetainedBootstrapWake(handler, row.operation_id);
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
      if (error?.code === RETAINED_CREATE_BOOTSTRAP_UNRESOLVED) {
        retainBootstrapWake(handler, row);
        onFailure?.(row, error);
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
  stopRetainedBootstrapWake,
};
