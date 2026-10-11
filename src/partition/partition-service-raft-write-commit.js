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
import {
  buildPartitionWriteLeadershipRefusal,
  buildPartitionWriteProposalRefusal,
  buildRejectedProposedWriteAnswer,
  isWriteOutcomeUnknown,
} from './partition-write-kernel.js';
import {PARTITION_LEADERSHIP_TRANSFER_MESSAGE} from
  './partition-service-leadership-transfer.js';
import {isPartitionReserved} from './partition-participant-transaction-store.js';
import {PARTICIPANT_TRANSACTION_LOG_MSG} from
  './partition-participant-transaction-constants.js';

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_WRITE_COMMIT_MODE,
  RaftRole,
  WRITE_PHASE_FIELD_APPLY_WRITE_MS,
  WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  resolvePartitionWriteCommitMode,
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
const WRITE_DEFERRAL_BUDGET_WAIT = Object.freeze({
  wait: 'PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_DEFER_BUDGET_MS',
  awaited: 'the consensus port admits the deferred proposal',
});
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

// One proposal of a write to consensus. A write already released (or
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
      logger: service.logger,
      spentWait: WRITE_DEFERRAL_BUDGET_WAIT,
      scope: {partitionId: service.partitionId, entryId: entry.entryId},
    });
}

// A write still deferred when its budget runs out is not a failure of the
// write: the pending commit is released and the router retries it later. A
// parked write's re-admission keeps the answer on its hand-off, set before
// the release, so the waiting execution answers it.
function portWriteDeferral(service, entryId, admission, handoff) {
  const deferral = new Error(WRITE_DEFERRAL_MESSAGE[admission]);
  const answer = {
    ...buildPartitionWriteFailureResult(deferral, service.partitionId),
    deferRetry: true,
  };
  handoff.answer = answer;
  service.rejectCommittedWrite(entryId, deferral);
  return answer;
}

// --- reserved writers (TX1 design 7, decision X) ---

// Per partition service, by entryId: every write this replica is executing
// (its hand-off: {entry, proposal, answer}), and those parked unproposed
// while a prepared participant transaction reserves the partition. A parked
// write stays pending in the proposal queue under its own commit deadline,
// so it is bounded by the queue's capacity and released like any pending
// write (its deadline, leadership loss, shutdown).
const WRITE_HANDOFFS = new WeakMap();
const PARKED_WRITES = new WeakMap();

function perService(registry, service) {
  let entries = registry.get(service);
  if (entries === undefined) {
    entries = new Map();
    registry.set(service, entries);
  }
  return entries;
}

function forgetWriteHandoff(service, entryId, handoff) {
  if (WRITE_HANDOFFS.get(service)?.get(entryId) === handoff) {
    WRITE_HANDOFFS.get(service).delete(entryId);
  }
  if (PARKED_WRITES.get(service)?.get(entryId) === handoff) {
    PARKED_WRITES.get(service).delete(entryId);
  }
}

// The cause of an unknown outcome stays with the write kernel's answer (no
// hop carries it): the leader logs it with the entry here, where it answers,
// at warn - a failure path, emitted at the default level, so the cause (the
// environmental code and the host's SQLite text among them) is observable.
function withLoggedUnknownCause(service, answer) {
  if (isWriteOutcomeUnknown(answer)) {
    service.logger.warn(PARTITION_SERVICE_LOG_MSG.WRITE_OUTCOME_UNKNOWN_CAUSE, {
      partitionId: service.partitionId,
      entryId: answer.entryId,
      cause: answer.cause,
    });
  }
  return answer;
}

// The answer of a write whose pending answer was rejected (the only failures
// that reach it; the side effects of a committed write never do): a
// proposal the port refused is answered with the port's typed outcome; a
// write the release answered carries the release's typed answer (its
// proposal state); any other rejection - its own committed apply failed
// environmentally, or its committed command was not recognised - leaves an
// entry that may be in the log, answered by the write kernel as an unknown
// outcome.
function unansweredWriteResult(service, proposal, error, entryId) {
  if (proposal.state === WRITE_PROPOSAL.REFUSED) {
    return withLoggedUnknownCause(service, buildPartitionWriteProposalRefusal(
      proposal.error, error, {partitionId: service.partitionId, entryId}));
  }
  if (error?.code === PROPOSAL_QUEUE_RELEASED_CODE) {
    return {...error.answer, partitionId: service.partitionId};
  }
  return withLoggedUnknownCause(service, buildRejectedProposedWriteAnswer(
    error, {partitionId: service.partitionId, entryId}));
}

// The side effects of a committed write (its split or merge mirror delta,
// its size update and split evaluation) run after its commit and are not its
// answer: a failure of one is logged with the entry for its owner, and the
// write is answered as the committed write it is (a re-delivery under its
// entryId is answered from its outcome row).
async function applyCommittedWriteSideEffects(service, entry,
  acknowledgedResult) {
  const sideEffectPlan = buildPartitionWriteSideEffectPlan(
    entry,
    acknowledgedResult,
  );
  try {
    await service.applyWriteSideEffectPlan({
      entry,
      result: acknowledgedResult,
      sideEffectPlan: {
        ...sideEffectPlan,
        emitCdcEntry: null,
      },
      commitPromise: null,
    });
  } catch (sideEffectError) {
    service.logger.warn(
      PARTITION_SERVICE_LOG_MSG.COMMITTED_WRITE_SIDE_EFFECT_FAILED, {
        partitionId: service.partitionId,
        entryId: entry.entryId,
        error: sideEffectError?.message || String(sideEffectError),
      });
  }
}

/**
 * Hand a write to consensus within the port's deferral budget. Records on
 * the hand-off what became of its proposal (refused by the port, or never
 * made because the write was already released); answers the write itself
 * when the port kept deferring it.
 * @param {Object} service - The partition.
 * @param {Object} handoff - {entry, proposal, answer}.
 * @return {Promise<Object|null>} The deferral answer, or null.
 */
async function handOffToConsensus(service, handoff) {
  const {entry} = handoff;
  try {
    const proposed = await proposeWithinDeferralBudget(service, entry);
    if (proposed === PROPOSAL_NOT_MADE) {
      handoff.proposal = PROPOSAL_NOT_MADE;
    } else if (deferredByPort(proposed)) {
      return portWriteDeferral(service, entry.entryId, proposed.admission, handoff);
    } else {
      assertRaftOperationSucceeded(proposed);
    }
  } catch (error) {
    handoff.proposal = Object.freeze({state: WRITE_PROPOSAL.REFUSED, error});
    service.rejectCommittedWrite(entry.entryId, error);
    service.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
      partitionId: service.partitionId,
      error: error.message,
    });
  }
  return null;
}

// Park a write unproposed until the reservation's decision applies.
function parkReservedWrite(service, handoff) {
  perService(PARKED_WRITES, service).set(handoff.entry.entryId, handoff);
  service.logger.debug(PARTICIPANT_TRANSACTION_LOG_MSG.WRITE_PARKED, {
    partitionId: service.partitionId, entryId: handoff.entry.entryId});
}

/**
 * Re-admit every write parked while the partition was reserved (the
 * decision's post-commit effect, design 7): each is handed to consensus
 * through the same proposal path; a write already released (its deadline,
 * leadership loss) is never proposed (the proposal queue refuses to mark
 * it). Their answers stay with their waiting executions.
 * @param {Object} service - The partition.
 * @return {number} How many parked writes were re-admitted.
 */
function readmitReservedWrites(service) {
  const parked = PARKED_WRITES.get(service);
  if (parked === undefined || parked.size === 0) {
    return 0;
  }
  const handoffs = [...parked.values()];
  parked.clear();
  for (const handoff of handoffs) {
    void handOffToConsensus(service, handoff);
  }
  return handoffs.length;
}

/**
 * Park again a write this replica proposed that met a reservation when it
 * applied (consumed without effect, its entry key unsettled): it stays
 * pending under the same entryId and is re-proposed by the decision's
 * re-admission. False when this replica executes no such write (the proposer
 * is elsewhere, or its write was already answered or released).
 * @param {Object} service - The partition.
 * @param {string} entryId - The reserved write's entryId.
 * @return {boolean} Whether it was parked again.
 */
function reparkReservedWrite(service, entryId) {
  const handoff = WRITE_HANDOFFS.get(service)?.get(entryId);
  if (handoff === undefined || !service.markCommittedWriteProposal(entryId,
    PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED)) {
    return false;
  }
  parkReservedWrite(service, handoff);
  return true;
}

async function executePartitionRaftWriteCommit(service, options) {
  const handoff = {entry: options.entry, proposal: PROPOSAL_ACCEPTED,
    answer: null};
  perService(WRITE_HANDOFFS, service).set(options.entry.entryId, handoff);
  try {
    return await executeHandedOffWriteCommit(service, options, handoff);
  } finally {
    forgetWriteHandoff(service, options.entry.entryId, handoff);
  }
}

async function executeHandedOffWriteCommit(service, options, handoff) {
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
  // A proposal the port refused is answered by the port's outcome, as the
  // write kernel types it (a host failure or a core failure while proposing
  // is an unknown outcome; a core refusal was not proposed): when the
  // pending write was released without an answer (a group that failed inside
  // the proposal announces that it no longer leads, which releases it
  // first), the answer names the port's outcome; an answer the application
  // gave stands. A write parked while the partition is reserved is handed
  // over by the decision's re-admission instead, or released unproposed.
  if (options.park === true) {
    parkReservedWrite(service, handoff);
  } else {
    const deferral = await handOffToConsensus(service, handoff);
    if (deferral !== null) {
      service.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_APPLY_WRITE_MS,
        applyStartMs,
      );
      return deferral;
    }
  }
  service.recordWritePhaseDuration(
    phaseTimings,
    WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
    raftCommandDispatchStartMs,
  );
  let result;
  try {
    result = await commitPromise;
  } catch (error) {
    service.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );
    return handoff.answer ??
      unansweredWriteResult(service, handoff.proposal, error, entry.entryId);
  }
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
  await applyCommittedWriteSideEffects(service, entry, acknowledgedResult);
  service.recordWritePhaseDuration(
    phaseTimings,
    WRITE_PHASE_FIELD_APPLY_WRITE_MS,
    applyStartMs,
  );
  return acknowledgedResult;
}

/**
 * The write kernel's leadership refusal of a proposal on this replica, or
 * null when it may propose: only the consensus leader proposes, and a group
 * held by its host failure proposes nothing.
 * @param {Object} service - The partition.
 * @return {Object|null} The typed refusal (nothing proposed), or null.
 */
function partitionWriteLeadershipRefusalOf(service) {
  const consensusStatus = service.raft.readStatus();
  const commitMode = resolvePartitionWriteCommitMode({
    replicaIds: service.replicaIds,
    raftState: consensusStatus.role,
    raftLeaderState: RaftRole.LEADER,
    hasKnownRemoteLeader: service.hasKnownRemoteLeaderWitness(),
  });
  return commitMode === PARTITION_WRITE_COMMIT_MODE.REJECTED ?
    buildPartitionWriteLeadershipRefusal(consensusStatus, service.partitionId) :
    null;
}

/**
 * Commit an admitted write on the leader's request path (applyWrite, after
 * its settled-answer check): while a prepared participant transaction
 * reserves the partition the write is parked unproposed under its own commit
 * deadline and re-admitted by the decision's apply (design 7, decision X);
 * otherwise a write this replica may not propose is refused, typed, and any
 * other is proposed once through the port.
 * @param {Object} service - The partition.
 * @param {Object} options - {entry, phaseTimings, applyStartMs}.
 * @return {Promise<Object>} The write's answer.
 */
function startAdmittedPartitionWrite(service, options) {
  if (isPartitionReserved(service.db)) {
    return startPartitionRaftWriteCommit(service, {...options, park: true});
  }
  const refusal = partitionWriteLeadershipRefusalOf(service);
  if (refusal === null) {
    return startPartitionRaftWriteCommit(service, options);
  }
  service.recordWritePhaseDuration(options.phaseTimings,
    WRITE_PHASE_FIELD_APPLY_WRITE_MS, options.applyStartMs);
  return refusal;
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

export {
  partitionWriteLeadershipRefusalOf,
  readmitReservedWrites,
  reparkReservedWrite,
  startAdmittedPartitionWrite,
  startPartitionRaftWriteCommit,
};
