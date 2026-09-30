import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {assertRaftOperationSucceeded} from '../raft/raft-operation-port.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../raft/raft-rs-durable-store-constants.js';
import {
  PROPOSAL_QUEUE_PROPOSAL_STATE,
  PROPOSAL_QUEUE_RELEASED_CODE,
} from './proposal-queue-constants.js';
import {buildPartitionWriteProposalRefusal} from './partition-write-kernel.js';
import {PARTITION_LEADERSHIP_TRANSFER_MESSAGE} from
  './partition-service-leadership-transfer.js';

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  WRITE_PHASE_FIELD_APPLY_WRITE_MS,
  WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  runRetryableControlPlaneWrite,
} = PARTITION_SERVICE_SHARED;

// What became of a write's proposal: the port accepted it (its answer is the
// application's), the port refused it (the port's outcome as an error), or
// it was never made (the write was released before it was handed to
// consensus, and the release answered it).
const WRITE_PROPOSAL = Object.freeze({
  ACCEPTED: 'accepted',
  REFUSED: 'refused',
  NOT_MADE: 'not-made',
});
const PROPOSAL_ACCEPTED = Object.freeze({state: WRITE_PROPOSAL.ACCEPTED});
const PROPOSAL_NOT_MADE = Object.freeze({state: WRITE_PROPOSAL.NOT_MADE});

// The port's typed deferrals of a proposal - retryable host failures that
// left the group usable, with nothing entered into consensus - and what a
// write still deferred when its budget runs out is answered with: a user
// session holding the partition's connection, or a leadership transfer the
// leader accepted (the core drops proposals until the transfer completes,
// which releases the pending write as leadership lost, or aborts within one
// election timeout).
const WRITE_DEFERRAL_MESSAGE = Object.freeze({
  [RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN]:
    PARTITION_SERVICE_ERROR_MSG.WRITE_DEFERRED_USER_TRANSACTION_OPEN,
  [RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_IN_PROGRESS]:
    PARTITION_LEADERSHIP_TRANSFER_MESSAGE.WRITE_DEFERRED,
});

function portDeferralOf(proposed) {
  return proposed?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
    proposed.recoveryRequired === false &&
    Object.hasOwn(WRITE_DEFERRAL_MESSAGE, proposed.reason) ?
    proposed.reason : null;
}

// One hand-off of a write to consensus. A write already released (or
// answered) is never handed over. A typed deferral of the port leaves the
// write queued, as the retryable result the canonical retry owner re-runs.
async function proposeUnlessDeferred(service, entry) {
  if (!service.markCommittedWriteProposal(entry.entryId,
    PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED)) {
    return PROPOSAL_NOT_MADE;
  }
  const proposed = await service.raft.propose(entry);
  const admission = portDeferralOf(proposed);
  if (admission === null) {
    return proposed;
  }
  service.markCommittedWriteProposal(entry.entryId,
    PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED);
  return {success: false, deferRetry: true, admission};
}

function deferredByPort(result) {
  return result?.deferRetry === true &&
    Object.hasOwn(WRITE_DEFERRAL_MESSAGE, result.admission);
}

// One proposal, proposed again on the replica's own clock while the port
// defers it, within the deferral budget.
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
function portWriteDeferral(service, entryId, admission) {
  const deferral = new Error(WRITE_DEFERRAL_MESSAGE[admission]);
  service.rejectCommittedWrite(entryId, deferral);
  return {
    ...buildPartitionWriteFailureResult(deferral, service.partitionId),
    deferRetry: true,
  };
}

// The answer of a write whose pending answer was rejected: a proposal the
// port refused is answered with the port's typed outcome; a write the
// release answered carries the release's typed answer (its proposal state);
// any other rejection is the write's failure.
function unansweredWriteResult(service, proposal, error, entryId) {
  if (proposal.state === WRITE_PROPOSAL.REFUSED) {
    return buildPartitionWriteProposalRefusal(proposal.error, error,
      {partitionId: service.partitionId, entryId});
  }
  if (error?.code === PROPOSAL_QUEUE_RELEASED_CODE) {
    return {...error.answer, partitionId: service.partitionId};
  }
  return buildPartitionWriteFailureResult(error, service.partitionId);
}

async function executePartitionRaftWriteCommit(service, options) {
  const {
    entry,
    phaseTimings,
    applyStartMs,
  } = options;
  let commitPromise;
  try {
    // Registered before the proposal: a lone leader commits and applies its
    // own proposal inside propose(), and the application resolves this
    // pending write with the committed entry's index and witness. A proposal
    // queue at capacity refuses it (backpressure) before anything is
    // proposed.
    commitPromise = service.waitForCommittedWrite(entry.entryId);
  } catch (error) {
    service.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return buildPartitionWriteProposalRefusal(error, null,
      {partitionId: service.partitionId, entryId: entry.entryId});
  }
  commitPromise.catch(() => {});
  const raftCommandDispatchStartMs = service.timeSource.now();
  // A proposal the port refused is the write's own failure: when the pending
  // write was released without an answer (a group that failed inside the
  // proposal announces that it no longer leads, which releases it first),
  // the answer names the port's outcome; an answer the application gave
  // stands.
  let proposal = PROPOSAL_ACCEPTED;
  try {
    const proposed = await proposeWithinDeferralBudget(service, entry);
    if (proposed === PROPOSAL_NOT_MADE) {
      proposal = PROPOSAL_NOT_MADE;
    } else if (deferredByPort(proposed)) {
      service.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return portWriteDeferral(service, entry.entryId, proposed.admission);
    } else {
      assertRaftOperationSucceeded(proposed);
    }
  } catch (error) {
    proposal = Object.freeze({state: WRITE_PROPOSAL.REFUSED, error});
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
    return unansweredWriteResult(service, proposal, error, entry.entryId);
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
