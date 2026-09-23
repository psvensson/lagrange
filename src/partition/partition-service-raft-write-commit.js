import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {assertRaftOperationSucceeded} from '../raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from
  '../raft/raft-operation-port-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../raft/raft-rs-durable-store-constants.js';

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  WRITE_PHASE_FIELD_APPLY_WRITE_MS,
  WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  runRetryableControlPlaneWrite,
} = PARTITION_SERVICE_SHARED;

// The port's typed deferral while a user session holds the partition's
// connection (nothing entered the core; the group stays usable), as the
// retryable result the canonical retry owner re-runs.
async function proposeUnlessDeferred(service, entry) {
  const proposed = await service.raft.propose(entry);
  const deferred = proposed?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
    proposed.recoveryRequired === false &&
    proposed.reason === RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN;
  return deferred ? {
    success: false,
    deferRetry: true,
    admission: RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN,
  } : proposed;
}

function deferredByUserTransaction(result) {
  return result?.deferRetry === true &&
    result.admission === RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN;
}

// One proposal, proposed again on the replica's own clock while a user
// session defers it, within the deferral budget.
function proposeWithinDeferralBudget(service, entry) {
  return runRetryableControlPlaneWrite(
    () => proposeUnlessDeferred(service, entry), {
      timeoutMs:
        PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_DEFER_BUDGET_MS,
      baseDelayMs:
        PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_RETRY_INTERVAL_MS,
      maxDelayMs:
        PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_RETRY_MAX_DELAY_MS,
      now: () => service.timeSource.now(),
      sleep: (delayMs) => new Promise(
        (resolve) => service.timeSource.setTimeout(resolve, delayMs)),
    });
}

// A write still deferred when its budget runs out is not a failure of the
// write: the pending commit is released and the router retries it later.
function userTransactionWriteDeferral(service, entryId) {
  const deferral = new Error(
    PARTITION_SERVICE_ERROR_MSG.WRITE_DEFERRED_USER_TRANSACTION_OPEN);
  service.rejectCommittedWrite(entryId, deferral);
  return {
    ...buildPartitionWriteFailureResult(deferral, service.partitionId),
    deferRetry: true,
  };
}

async function executePartitionRaftWriteCommit(service, options) {
  const {
    entry,
    entryKey,
    phaseTimings,
    applyStartMs,
  } = options;
  let commitPromise;
  try {
    // Registered before the proposal: a lone leader commits and applies its
    // own proposal inside propose(), and the application resolves this
    // pending write with the committed entry's index and witness.
    commitPromise = service.waitForCommittedWrite(entry.entryId);
  } catch (error) {
    service.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return buildPartitionWriteFailureResult(error, service.partitionId);
  }
  commitPromise.catch(() => {});
  const raftCommandDispatchStartMs = service.timeSource.now();
  try {
    const proposed = await proposeWithinDeferralBudget(service, entry);
    if (deferredByUserTransaction(proposed)) {
      service.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return userTransactionWriteDeferral(service, entry.entryId);
    }
    assertRaftOperationSucceeded(proposed);
  } catch (error) {
    service.rejectCommittedWrite(entry.entryId, error);
    service.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
      partitionId: service.partitionId,
      error: error.message,
    });
  }
  service.recordWritePhaseDuration(
    phaseTimings,
    WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
    raftCommandDispatchStartMs,
  );
  try {
    const result = await commitPromise;
    // A committed statement that failed is the write's outcome: reported as
    // the failure it is, with no replay marker and no write side effects.
    if (result?.success !== true) {
      service.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return result;
    }
    const acknowledgedResult = {
      ...result,
      acceptingNodeId: service.nodeId,
      acknowledgedAtMs: service.timeSource.now(),
    };
    const sideEffectPlan = buildPartitionWriteSideEffectPlan(
      entry,
      acknowledgedResult,
    );
    await service.applyWriteSideEffectPlan({
      entry,
      entryKey,
      result: acknowledgedResult,
      sideEffectPlan: {
        ...sideEffectPlan,
        emitCdcEntry: null,
      },
      commitPromise: null,
    });
    service.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return acknowledgedResult;
  } catch (error) {
    service.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return {
      success: false,
      error: error.message,
      partitionId: service.partitionId,
    };
  }
}

function startPartitionRaftWriteCommit(service, options) {
  const {
    promise: outcomePromise,
    resolve: resolveOutcome,
    reject: rejectOutcome,
  } = Promise.withResolvers();
  service.setPendingCommittedWriteOutcome(
    options.entry.entryId,
    outcomePromise,
  );
  executePartitionRaftWriteCommit(service, options).then(
    resolveOutcome,
    rejectOutcome,
  );
  return outcomePromise;
}

export {startPartitionRaftWriteCommit};
