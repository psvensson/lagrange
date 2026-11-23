import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  installAuthoritativeReplicaLifecycleInLane,
} from './replica-state-machine-recovery.js';
import {
  buildReplicaLifecycleMutationPredicateFromRow,
  durableRowVersion,
  isReplicaLifecycleMutationPredicate,
  rowMatchesReplicaLifecyclePredicate,
} from
  './replica-state-machine-lifecycle-observation.js';
import {
  runActivationEffectSection,
  runSerializedReplicaMutation,
} from
  './replica-state-machine-serialization.js';
import {pendingTurn, turnChainValue} from '../raft/raft-rs-turn-answer.js';
import {isPartitionRegistrationEvidence} from
  '../partition/partition-service-row-owner.js';
import {REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED} from
  './replica-state-machine-constants.js';

const REGISTERED_REPLICA_POINT_READ_SQL =
  'SELECT * FROM services WHERE service_id = ?';
const REGISTERED_REPLICA_ACTIVATION_REASON = 'registered_runtime_ready';
const REGISTERED_REPLICA_ACTIVATION_EVIDENCE_OPTION =
  'registrationEvidence';
const REPLICA_REGISTERED_ACTIVATION_ERROR_CODE = Object.freeze({
  AUTHORITY_UNAVAILABLE: 'REPLICA_ACTIVATION_AUTHORITY_UNAVAILABLE',
  DURABILITY_DEFERRED: 'REPLICA_ACTIVATION_DURABILITY_DEFERRED',
  HANDLER_NOT_REGISTERED: REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED,
  SOURCE_CHANGED: 'REPLICA_ACTIVATION_SOURCE_CHANGED',
});

function activationError(code, replicaId, cause = null) {
  const error = new Error(`Replica activation ${code}: ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = true;
  if (cause) error.cause = cause;
  return error;
}

function preSubmissionAbortError(replicaId, cause = null) {
  return Object.assign(
    activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      replicaId,
      cause,
    ),
    {
      submitted: false,
      abortedBeforeSubmission: true,
      abortedAfterSubmission: false,
      outcomeUncertain: false,
    },
  );
}

function postSubmissionAbortError(replicaId, cause, outcomeUncertain) {
  return Object.assign(
    activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      replicaId,
      cause,
    ),
    {
      submitted: true,
      abortedBeforeSubmission: false,
      abortedAfterSubmission: true,
      outcomeUncertain: outcomeUncertain === true,
    },
  );
}

function extractActivationBudgetOptions(options = {}) {
  const writeOpts = options.writeOptions && typeof options.writeOptions === 'object' ?
    options.writeOptions : null;
  if (!writeOpts) {
    return {};
  }
  const budget = {};
  if (Number.isFinite(writeOpts.timeoutMs) && writeOpts.timeoutMs > 0) {
    budget.timeoutMs = Math.floor(writeOpts.timeoutMs);
  }
  if (Number.isFinite(writeOpts.deadlineMs)) {
    budget.deadlineMs = writeOpts.deadlineMs;
  }
  if (writeOpts.signal) {
    budget.signal = writeOpts.signal;
  }
  return budget;
}

function activationSignalOf(options = {}) {
  return options.writeOptions?.signal ?? null;
}

function throwIfAbortedBeforeSubmission(options) {
  const signal = activationSignalOf(options);
  if (signal?.aborted) {
    throw preSubmissionAbortError(options.replicaId, signal.reason || null);
  }
}

function matchesRegisteredReplicaIdentity(row, options) {
  return row?.service_id === options.replicaId &&
    row.service_type === SERVICE_TYPE.PARTITION &&
    row.partition_id === options.partitionId &&
    row.node_id === options.nodeId &&
    row.replica_id === options.replicaId &&
    row.group_id === null;
}

function durableReplicaIncarnation(row) {
  return Number.isSafeInteger(row?.[COLUMN.CREATED_AT]) ?
    row[COLUMN.CREATED_AT] :
    null;
}

function matchesRegisteredReplicaIncarnation(row, sourceRow, options) {
  const sourceIncarnation = durableReplicaIncarnation(sourceRow);
  return sourceIncarnation !== null &&
    matchesRegisteredReplicaIdentity(row, options) &&
    durableReplicaIncarnation(row) === sourceIncarnation;
}

function unavailableObservationCause(result) {
  if (!result) return null;
  if (result.error instanceof Error) {
    return result.error;
  }
  const detail = result.error ?? result.failureCode;
  if (!detail) return null;
  const cause = new Error(String(detail));
  const code = result.errorCode ?? result.failureCode;
  if (typeof code === 'string' && code.length > 0) {
    cause.code = code;
  }
  return cause;
}

async function observeRegisteredReplica(writer, replicaId, budgetOptions = {}) {
  try {
    const result = await readAuthoritativeControlPlaneRows(
      writer,
      TABLES.SERVICES,
      REGISTERED_REPLICA_POINT_READ_SQL,
      [replicaId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: 'critical',
        workClass: 'critical',
        ...budgetOptions,
      },
    );
    if (result?.success !== true || !Array.isArray(result.rows) ||
        result.rows.length > 1) {
      return Object.freeze({
        available: false,
        row: null,
        cause: unavailableObservationCause(result),
      });
    }
    return Object.freeze({
      available: true,
      row: result.rows.length === 1 ? result.rows[0] : null,
      cause: null,
    });
  } catch (error) {
    return Object.freeze({available: false, row: null, cause: error});
  }
}

function buildActivatedRow(sourceRow, sourceVersion) {
  // Registration evidence must name one replay-stable destination. Using the
  // caller's later wall clock minted a different ACTIVE generation on every
  // duplicate delivery, so a successful first application became
  // indistinguishable from a conflicting generation. The strict successor of
  // the exact registered generation is causal, monotonic and idempotent.
  const timestamp = sourceVersion.value + 1;
  return {
    ...sourceRow,
    status: SERVICE_STATUS.ACTIVE,
    state_entered_at: timestamp,
    previous_state: SERVICE_STATUS.STOPPED,
    trigger_reason: REGISTERED_REPLICA_ACTIVATION_REASON,
    error_message: null,
    updated_at: timestamp,
  };
}

// The destination is identified by identity, status and lifecycle generation
// only; role/heartbeat metadata may have advanced updated_at since.
function matchesActivatedGeneration(row, activatedRow) {
  return rowMatchesReplicaLifecyclePredicate(
    row,
    buildReplicaLifecycleMutationPredicateFromRow(activatedRow),
  );
}

async function observePostMutationActivation(
  options,
  sourceRow,
  sourceVersion,
  activatedRow,
  mutationError,
) {
  const observation = await observeRegisteredReplica(
    options.systemTableWriter,
    options.replicaId,
    extractActivationBudgetOptions(options),
  );
  const signal = activationSignalOf(options);
  if (signal?.aborted) {
    throw postSubmissionAbortError(
      options.replicaId,
      mutationError || signal.reason || null,
      true,
    );
  }
  if (!observation.available) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      options.replicaId,
      mutationError,
    );
  }
  if (matchesActivatedGeneration(observation.row, activatedRow)) {
    return activatedRow;
  }
  const unchangedStoppedSource = matchesRegisteredReplicaIncarnation(
    observation.row,
    sourceRow,
    options,
  ) &&
    observation.row.status === SERVICE_STATUS.STOPPED &&
    observation.row[sourceVersion.column] === sourceVersion.value;
  throw activationError(
    unchangedStoppedSource ?
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.DURABILITY_DEFERRED :
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
    options.replicaId,
    mutationError,
  );
}

async function persistRegisteredReplicaActivation(
  stateMachine,
  options,
  sourceRow,
  sourceVersion,
) {
  const activatedRow = buildActivatedRow(
    sourceRow,
    sourceVersion,
  );
  const lifecycleData = {
    status: activatedRow.status,
    state_entered_at: activatedRow.state_entered_at,
    previous_state: activatedRow.previous_state,
    trigger_reason: activatedRow.trigger_reason,
    error_message: activatedRow.error_message,
    updated_at: activatedRow.updated_at,
  };
  let mutationResult = null;
  let mutationError = null;
  const whereClause =
    buildReplicaLifecycleMutationPredicateFromRow(sourceRow);
  if (!isReplicaLifecycleMutationPredicate(whereClause)) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
      options.replicaId,
    );
  }
  throwIfAbortedBeforeSubmission(options);
  try {
    mutationResult = await options.systemTableWriter.updateSystemTableRow(
      TABLES.SERVICES,
      whereClause,
      lifecycleData,
      options.writeOptions,
    );
  } catch (error) {
    mutationError = error;
  }
  const applied = classifyControlPlaneMutationResult(mutationResult).applied;
  const signal = activationSignalOf(options);
  if (signal?.aborted) {
    throw postSubmissionAbortError(
      options.replicaId,
      mutationError || signal.reason || null,
      !applied,
    );
  }
  if (applied) {
    return activatedRow;
  }
  return observePostMutationActivation(
    options,
    sourceRow,
    sourceVersion,
    activatedRow,
    mutationError,
  );
}

function hasRegistrationEvidence(options) {
  return (
    Object.prototype.hasOwnProperty.call(
      options,
      REGISTERED_REPLICA_ACTIVATION_EVIDENCE_OPTION,
    ) &&
    options.registrationEvidence !== undefined
  );
}

function resolveRegistrationEvidence(options) {
  const evidence = options.registrationEvidence;
  if (!isPartitionRegistrationEvidence(evidence) ||
      !matchesRegisteredReplicaIdentity(evidence, options) ||
      evidence.status !== SERVICE_STATUS.STOPPED ||
      durableReplicaIncarnation(evidence) === null ||
      !durableRowVersion(evidence)) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
      options.replicaId,
    );
  }
  return evidence;
}

function isActivatableObservedSourceRow(sourceRow, options) {
  const observedIncarnation = durableReplicaIncarnation(sourceRow);
  if (!matchesRegisteredReplicaIdentity(sourceRow, options) ||
      observedIncarnation === null) {
    return false;
  }
  if (Number.isSafeInteger(options.expectedReplicaIncarnation) &&
      observedIncarnation !== options.expectedReplicaIncarnation) {
    return false;
  }
  return sourceRow.status === SERVICE_STATUS.ACTIVE ||
    (sourceRow.status === SERVICE_STATUS.STOPPED &&
      durableRowVersion(sourceRow));
}

function resolveObservedSourceRow(observation, options) {
  if (!observation.available) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.AUTHORITY_UNAVAILABLE,
      options.replicaId,
      observation.cause || null,
    );
  }
  const sourceRow = observation.row;
  if (!isActivatableObservedSourceRow(sourceRow, options)) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
      options.replicaId,
    );
  }
  return sourceRow;
}

async function resolveRegisteredReplicaSourceRow(options) {
  throwIfAbortedBeforeSubmission(options);
  if (hasRegistrationEvidence(options)) {
    return resolveRegistrationEvidence(options);
  }
  const observation = await observeRegisteredReplica(
    options.systemTableWriter,
    options.replicaId,
    extractActivationBudgetOptions(options),
  );
  throwIfAbortedBeforeSubmission(options);
  return resolveObservedSourceRow(observation, options);
}

// The activation effect boundary (owner decision N2): the exact handler of
// this replica generation must be registered at the moment the ACTIVE CAS is
// issued. It is checked here, inside the replica's lifecycle lane, with no
// await between the check and the CAS; the effect section opened right after
// makes handler retirement (retireReplicaHandler) wait for the CAS.
function requireEffectHandler(options) {
  if (typeof options.isEffectHandlerCurrent !== 'function' ||
      options.isEffectHandlerCurrent() !== true) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.HANDLER_NOT_REGISTERED,
      options.replicaId,
    );
  }
}

async function activateRegisteredReplicaInLane(stateMachine, options) {
  throwIfAbortedBeforeSubmission(options);
  const sourceRow = await resolveRegisteredReplicaSourceRow(options);
  // The check and the section opening are one synchronous step: retirement
  // cannot interleave before the ACTIVE CAS settles.
  const activatedRow = await runActivationEffectSection(
    stateMachine,
    options.replicaId,
    () => {
      throwIfAbortedBeforeSubmission(options);
      requireEffectHandler(options);
    },
    () => sourceRow.status === SERVICE_STATUS.ACTIVE ? sourceRow :
      persistRegisteredReplicaActivation(
        stateMachine,
        options,
        sourceRow,
        durableRowVersion(sourceRow),
      ),
  );
  const signal = activationSignalOf(options);
  if (signal?.aborted) {
    throw postSubmissionAbortError(options.replicaId, signal.reason || null, false);
  }
  if (!installAuthoritativeReplicaLifecycleInLane(
    stateMachine,
    options.replicaId,
    activatedRow,
  )) {
    throw activationError(
      REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED,
      options.replicaId,
    );
  }
  return activatedRow;
}

function activateRegisteredReplica(stateMachine, options = {}) {
  return turnChainValue(runSerializedReplicaMutation(
    stateMachine,
    options.replicaId,
    () => pendingTurn(activateRegisteredReplicaInLane(stateMachine, options)),
  ));
}

export {
  REPLICA_REGISTERED_ACTIVATION_ERROR_CODE,
  activateRegisteredReplica,
};
