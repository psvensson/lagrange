// A node's owner of the snapshot-install EPISODE of its replicas (quest
// partition-checkpoint-epoch-generation; the hand-over coverage model in the
// quest record is the design). The replica handler owns the node's local
// services; while one of them is under an install it is this owner's, and
// nothing else opens, registers, unregisters or deletes it except through a
// claim.
//
// One record per replica, for the episode only (no record, or an ended one:
// the existing owners own the replica exactly as without this module):
//   receiving         the offer was admitted; the replica runs and serves
//   installing        its shutdown or its install step is running
//   recreate_pending  stopped, the install settled: this owner brings it
//                     back, or holds
// The episode is taken when the offer is admitted, synchronously, bound to
// the service the handler tracks as running: a second offer answers
// INSTALLING in every state, and an offer for a replica with a removal in
// progress, or whose tracked service is not that running service, is refused.
//
// Custody. The episode mints one custody token. The handler's registry
// (TrackedServiceRegistry.set/delete) and setLocalReplica's `service` field
// refuse, by throwing REPLICA_UNDER_INSTALL_EPISODE, a write for the replica
// that does not present it; the installer requires it at the swap. It is void
// the moment the episode ends.
//
// Ends. The recreation succeeding (running); a refusal before the shutdown
// (not_stopped: the replica never stopped); or a CLAIM by another owner at
// its own durable fact: the removal once REMOVING is durable, the failure of
// the create that owns the replica, the cleanup owner under a current token,
// the handler's stop. A claim is synchronous on the record, voids the
// custody, aborts a receive through its signal and cancels the retry timer;
// the claimant then waits `episode_step_settle`: the ONE step in flight (a
// service shutdown, an install, or a factory open including the release of
// what it opened) settling. That wait is bounded by the step (R13) and
// visible in the diagnostics while it lasts.
//
// Holds. A live episode that may not open now says why, and who clears it
// (REPLICA_SNAPSHOT_INSTALL_HOLD). An accepted REMOVE holds the episode by
// its operation id from acceptance until its task ends; its durable REMOVING
// row is the claim, and a deferred, failed or thrown write just lifts the
// hold, so the replica returns. A hold only another owner clears is retried
// on a doubling backoff. Every hold and end is one typed log line;
// readDiagnostics is the visible state (getStats().snapshotInstalls).

import {releaseReplicaRuntime, releaseReplicaCleanupDebt} from './replica-runtime-cleanup-custody.js';
import {RAFT_SNAPSHOT_RECREATION_STATE as RECREATION} from
  '../raft/snapshot-catchup-constants.js';
import {RAFT_SNAPSHOT_OFFER_RECEIVER as RECEIVER} from
  '../raft/snapshot-offer-router.js';
import {snapshotImageAdmitsReceiver} from
  '../raft/snapshot-receiver-admission.js';
import {buildReplacementServiceOptions} from
  '../partition/partition-reopen-options.js';
import {PARTITION_SERVICE_ERROR_CODE} from
  '../partition/partition-service-constants.js';

import {observeRecreateAfterInstallAdmission} from
  './replica-recreate-after-install-admission.js';
import {
  REPLICA_RECREATE_ADMISSION as ADMISSION,
  REPLICA_RECREATE_ADMISSION_REASON as REASON,
  REPLICA_RECREATE_ATTEMPT as ATTEMPT,
  REPLICA_RECREATE_HOLD_BACKOFF_MAX_MS as HOLD_BACKOFF_MAX_MS,
  REPLICA_RECREATE_RETRY_BOUND_MS as RETRY_BOUND_MS,
  REPLICA_RECREATE_TRIGGER as TRIGGER,
  REPLICA_SNAPSHOT_INSTALL_CLAIM as CLAIM,
  REPLICA_SNAPSHOT_INSTALL_ERROR_CODE as ERROR_CODE,
  REPLICA_SNAPSHOT_INSTALL_EVENT as EVENT,
  REPLICA_SNAPSHOT_INSTALL_HOLD as HOLD,
  REPLICA_SNAPSHOT_INSTALL_LOG_MSG as LOG_MSG,
  REPLICA_SNAPSHOT_INSTALL_STATE as STATE,
  REPLICA_SNAPSHOT_INSTALL_WAIT as WAIT,
  REPLICA_SNAPSHOT_OFFER_REFUSAL as REFUSAL,
} from './replica-snapshot-install-constants.js';
import {
  REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED,
  REPLICA_STATE_MACHINE_EVENT,
} from './replica-state-machine-constants.js';

// A record with no attempt or step in flight, no retry timer, no reason yet.
const NOTHING_IN_FLIGHT = null;
const NO_RETRY_TIMER = null;
const NO_REASON = 'none';
// An attempt nothing interrupted.
const NOT_INTERRUPTED = null;
// The owner while it listens to no lifecycle transition.
const NOT_LISTENING = null;
// A replica with no live episode needs no custody.
const NO_CUSTODY = null;
// The install outcome of an episode whose install completed, or has not
// answered yet.
const NO_INSTALL_OUTCOME = null;
// The row status of a refusal decided without reading the row.
const NO_ROW_STATUS = 'none';
// The create identity the create path stamps on a replica's service object
// (replica-handler-create-methods.js); a replacement is the same create.
const CREATE_IDENTITY_FIELDS = Object.freeze([
  'createAdmissionOperationId',
  'createAdmissionToken',
  'createAttemptToken',
]);
const STOPPED_STATES = Object.freeze([STATE.INSTALLING, STATE.RECREATE_PENDING]);
// The hold each lifecycle admission reason leaves a pending recreation in.
// Total over the admission's reasons (R07); the admitted ones hold nothing.
const ADMISSION_HOLDS = Object.freeze({
  [REASON.ROW_ACTIVE]: HOLD.NONE,
  [REASON.ROW_SYNCING]: HOLD.NONE,
  [REASON.ROW_UNOBSERVABLE]: HOLD.LIFECYCLE_UNOBSERVABLE,
  [REASON.ROW_BEFORE_SYNCING]: HOLD.ROW_BEFORE_SYNCING,
  [REASON.ROW_REMOVAL_IN_PROGRESS]: HOLD.AWAITING_REMOVAL_OWNER,
  [REASON.ROW_FAILED]: HOLD.AWAITING_CLEANUP_OWNER,
  [REASON.ROW_CLEANUP_OWNED]: HOLD.AWAITING_CLEANUP_OWNER,
  [REASON.ROW_ABSENT]: HOLD.AWAITING_CLEANUP_OWNER,
  [REASON.ROW_NOT_THIS_REPLICA]: HOLD.AWAITING_CLEANUP_OWNER,
  [REASON.ROW_STATUS_UNKNOWN]: HOLD.AWAITING_CLEANUP_OWNER,
});
// The holds only another owner clears: retried on the doubling backoff.
const BACKOFF_HOLDS = Object.freeze([HOLD.AWAITING_REMOVAL_OWNER,
  HOLD.AWAITING_CLEANUP_OWNER, HOLD.OPEN_REFUSED_INSTALL_CONFLICT]);
const ADMISSION_ATTEMPTS = Object.freeze([ATTEMPT.ADMISSION_HELD,
  ATTEMPT.ADMISSION_REFUSED]);
const BACKOFF_FACTOR = 2;

function attemptAnswer(outcome, reason = NO_REASON, service = undefined) {
  return {outcome, reason, service};
}

function refusedAdmission(reason) {
  return Object.freeze({decision: ADMISSION.REFUSED, reason,
    rowStatus: NO_ROW_STATUS, admitted: false});
}

// The hold an attempt that did not bring the replica back leaves.
function holdAfter(answer) {
  if (answer.outcome === ATTEMPT.HELD_FOR_REMOVAL) return HOLD.REMOVAL_PENDING;
  if (answer.outcome === ATTEMPT.OPEN_REFUSED_INSTALL_CONFLICT) {
    return HOLD.OPEN_REFUSED_INSTALL_CONFLICT;
  }
  return ADMISSION_ATTEMPTS.includes(answer.outcome) ?
    ADMISSION_HOLDS[answer.reason] : HOLD.NONE;
}

function recordDiagnostics(record) {
  return Object.freeze({
    replicaId: record.replicaId,
    partitionId: record.partitionId,
    state: record.state,
    hold: record.live && record.removalOperations.size > 0 ?
      HOLD.REMOVAL_PENDING : record.hold,
    claim: record.claim,
    wait: record.wait,
    attempts: record.attempts,
    lastTrigger: record.lastTrigger,
    lastAttempt: record.lastAttempt,
    lastReason: record.lastReason,
    removalOperations: record.removalOperations.size,
    retryBoundMs: record.backoffMs,
    install: record.install,
    releaseFailure: record.releaseFailure,
    startedAtMs: record.startedAtMs,
    lastAttemptAtMs: record.lastAttemptAtMs,
  });
}

/**
 * @param {Object} handler - The node's replica handler (localServices,
 *   localReplicas, createPartitionService, replaceLocalReplicaService,
 *   getTrackedService, hasInProgressReplicaRemoval, pendingRuntimeShutdowns,
 *   replicaStateMachine, registerOperationTask, timeSource, logger).
 * @return {Object} The owner.
 */
function createReplicaSnapshotInstallOwner(handler) {
  // The latest episode of each replica, live or ended.
  const records = new Map();
  // Each service this owner stopped, to the replacement that runs in its
  // place: what a caller still holding the stopped object continues with.
  const successors = new WeakMap();
  let transitionListener = NOT_LISTENING;

  const isStopped = (record) => record.live &&
    STOPPED_STATES.includes(record.state);
  const now = () => handler.timeSource.now();
  const liveRecordOf = (replicaId) => {
    const record = records.get(replicaId);
    return record?.live === true ? record : undefined;
  };

  // The lifecycle admission, with the facts every caller logs.
  const observeAdmission = (replica) => observeRecreateAfterInstallAdmission(
    handler, {replicaId: replica.replicaId, partitionId: replica.partitionId});

  const clearRetry = (record) => {
    if (record.retryTimer !== NO_RETRY_TIMER) {
      handler.timeSource.clearTimeout(record.retryTimer);
      record.retryTimer = NO_RETRY_TIMER;
    }
  };

  // The replica's lifecycle transitions wake its pending recreation; the
  // owner listens only while a record is pending.
  const listenWhilePending = () => {
    const pending = [...records.values()].some(
      (record) => record.live && record.state === STATE.RECREATE_PENDING);
    if (pending && transitionListener === NOT_LISTENING) {
      transitionListener = ({replicaId}) => {
        const record = liveRecordOf(replicaId);
        if (record?.state === STATE.RECREATE_PENDING) {
          run(record, TRIGGER.LIFECYCLE_TRANSITION);
        }
      };
      handler.replicaStateMachine.on(
        REPLICA_STATE_MACHINE_EVENT.STATE_TRANSITION, transitionListener);
    } else if (!pending && transitionListener !== NOT_LISTENING) {
      handler.replicaStateMachine.off(
        REPLICA_STATE_MACHINE_EVENT.STATE_TRANSITION, transitionListener);
      transitionListener = NOT_LISTENING;
    }
  };

  // The episode ends: its custody is void from here, its receive (if any) is
  // aborted through its signal, and nothing of it is retried.
  const end = (record, state, claim = CLAIM.NONE) => {
    clearRetry(record);
    record.live = false;
    record.state = state;
    record.claim = claim;
    record.hold = HOLD.NONE;
    record.abort.abort();
    record.settleEnded();
    listenWhilePending();
    handler.logger.info(claim === CLAIM.NONE ? LOG_MSG.RECREATION_ENDED :
      LOG_MSG.EPISODE_CLAIMED, {event: claim === CLAIM.NONE ?
      EVENT.RECREATION : EVENT.EPISODE_CLAIMED,
    nodeId: handler.nodeId, ...recordDiagnostics(record)});
  };

  // An episode that ends before its shutdown step: the replica never
  // stopped. Answers the refusal its asker reports.
  const endNotStopped = (record, admission) => {
    end(record, STATE.NOT_STOPPED);
    return admission;
  };

  const stayPending = (record, hold) => {
    record.state = STATE.RECREATE_PENDING;
    record.backoffMs = BACKOFF_HOLDS.includes(hold) && hold === record.hold ?
      Math.min(record.backoffMs * BACKOFF_FACTOR, HOLD_BACKOFF_MAX_MS) :
      RETRY_BOUND_MS;
    record.hold = hold;
    listenWhilePending();
    handler.logger.warn(LOG_MSG.RECREATION_PENDING, {event: EVENT.RECREATION,
      nodeId: handler.nodeId, ...recordDiagnostics(record)});
    clearRetry(record);
    // Held for a removal: the removal's claim or its lifted hold is the next
    // event, not a timer.
    if (hold === HOLD.REMOVAL_PENDING) return;
    record.retryTimer = handler.timeSource.setTimeout(() => {
      record.retryTimer = NO_RETRY_TIMER;
      run(record, TRIGGER.BOUND_ELAPSED);
    }, record.backoffMs);
    record.retryTimer.unref?.();
  };

  // What stops an attempt, re-read after every await: the episode was
  // claimed (its custody is void), or an accepted removal holds it.
  const interruptionOf = (record) => {
    if (!record.live) return ATTEMPT.EPISODE_CLAIMED;
    return record.removalOperations.size > 0 ?
      ATTEMPT.HELD_FOR_REMOVAL : NOT_INTERRUPTED;
  };

  // What an attempt opened and may not register is closed here. A release
  // that throws stays in the handler's custody of unreleased runtimes, which
  // retries it and refuses a new create of the replica meanwhile.
  const releaseProduct = async (record, replacement) => {
    try {
      await releaseReplicaRuntime(handler, replacement, record.replicaId, record.partitionId);
    } catch (error) {
      // Episode settlement is quiescence only. The host retains the exact
      // release failure; removal must separately prove physical closure.
      record.releaseFailure = error;
    }
  };

  const openReplacement = async (record) => {
    let replacement;
    try {
      // Opened by this handler, so retired through its lifecycle owner: an
      // ACTIVE written for the replacement is bound to its exact transport
      // handler (the create path opens its replica the same way).
      replacement = await handler.createPartitionService({
        ...record.serviceOptions,
        resolveHandlerRetirementLane: () => handler.replicaStateMachine});
    } catch (error) {
      return attemptAnswer(error.code ===
          PARTITION_SERVICE_ERROR_CODE.SNAPSHOT_INSTALL_STATE_CONFLICT ?
        ATTEMPT.OPEN_REFUSED_INSTALL_CONFLICT : ATTEMPT.CREATE_THREW,
      error.message);
    }
    // The episode may have been claimed or held while the replica opened:
    // a replacement nobody may register is closed here, never left running.
    const interruption = interruptionOf(record);
    if (interruption !== NOT_INTERRUPTED) {
      await releaseProduct(record, replacement);
      return attemptAnswer(interruption);
    }
    try {
      for (const field of CREATE_IDENTITY_FIELDS) {
        replacement[field] = record.previous[field];
      }
      // The serving fence a removal raised is irreversible: the replacement
      // carries it.
      if (record.previous.removalServingAdmissionFenced === true) {
        replacement.fenceServingAdmissionForRemoval();
      }
      handler.replaceLocalReplicaService(record.replicaId, replacement,
        record.custody);
    } catch (error) {
      await releaseProduct(record, replacement);
      return attemptAnswer(ATTEMPT.REGISTER_THREW, error.message);
    }
    return attemptAnswer(ATTEMPT.RECREATED, NO_REASON, replacement);
  };

  const attempt = async (record) => {
    let interruption = interruptionOf(record);
    if (interruption !== NOT_INTERRUPTED) return attemptAnswer(interruption);
    try {
      await releaseReplicaRuntime(handler, record.previous, record.replicaId, record.partitionId);
    } catch (error) {
      return attemptAnswer(ATTEMPT.PREVIOUS_SERVICE_NOT_RELEASED, error.message);
    }
    interruption = interruptionOf(record);
    if (interruption !== NOT_INTERRUPTED) return attemptAnswer(interruption);
    // A prior unpublished product may still own the database even after its
    // episode step settled. The existing retry must release it before opening.
    try {
      await releaseReplicaCleanupDebt(handler, record.replicaId, record.partitionId);
    } catch (error) {
      return attemptAnswer(ATTEMPT.RUNTIME_RELEASE_DEFERRED, error.code);
    }
    interruption = interruptionOf(record);
    if (interruption !== NOT_INTERRUPTED) return attemptAnswer(interruption);
    const admission = await observeAdmission(record);
    interruption = interruptionOf(record);
    if (interruption !== NOT_INTERRUPTED) return attemptAnswer(interruption);
    if (admission.decision === ADMISSION.REFUSED) {
      return attemptAnswer(ATTEMPT.ADMISSION_REFUSED, admission.reason);
    }
    if (admission.decision === ADMISSION.HELD) {
      return attemptAnswer(ATTEMPT.ADMISSION_HELD, admission.reason);
    }
    return openReplacement(record);
  };

  // One attempt at a time per record; a wake-up during one coalesces onto
  // it. Never rejects: a throw of the attempt itself is a typed outcome.
  function run(record, trigger) {
    if (record.attemptInFlight !== NOTHING_IN_FLIGHT) {
      return record.attemptInFlight;
    }
    if (!isStopped(record)) {
      return Promise.resolve(attemptAnswer(record.lastAttempt, record.lastReason));
    }
    clearRetry(record);
    record.attempts += 1;
    record.lastTrigger = trigger;
    const settled = attempt(record).catch((error) =>
      attemptAnswer(ATTEMPT.ATTEMPT_FAULTED, error.message)).then((answer) => {
      record.attemptInFlight = NOTHING_IN_FLIGHT;
      record.lastAttempt = answer.outcome;
      record.lastReason = answer.reason;
      record.lastAttemptAtMs = now();
      // Claimed while the attempt ran: the claimant has the replica.
      if (!record.live) return answer;
      if (answer.outcome === ATTEMPT.RECREATED) {
        successors.set(record.previous, answer.service);
        record.previous = answer.service;
        end(record, STATE.RUNNING);
      } else if (answer.outcome === ATTEMPT.HELD_FOR_REMOVAL &&
          record.removalOperations.size === 0) {
        // The hold was lifted while this attempt was ending: asked again now.
        record.state = STATE.RECREATE_PENDING;
        run(record, TRIGGER.HOLD_LIFTED);
      } else {
        stayPending(record, holdAfter(answer));
      }
      return answer;
    });
    record.attemptInFlight = handler.registerOperationTask(settled);
    return record.attemptInFlight;
  }

  // The recreation owner's answer to the orchestration, from a record.
  const recreationOf = (record, answer) => {
    if (record.state === STATE.RUNNING) {
      return Object.freeze({state: RECREATION.RUNNING, service: record.previous});
    }
    return Object.freeze({
      state: isStopped(record) ? RECREATION.PENDING : RECREATION.RELEASED,
      record: record.state, claim: record.claim, attempt: answer.outcome,
      reason: answer.reason});
  };

  // The synchronous exclusion of an offer: no live episode, no removal in
  // progress, and `service` is the running service the handler tracks.
  const exclusionRefusalOf = (service) => {
    if (liveRecordOf(service.replicaId) !== undefined) return REFUSAL.EPISODE_LIVE;
    if (handler.hasInProgressReplicaRemoval(service.replicaId)) {
      return REFUSAL.REMOVAL_IN_PROGRESS;
    }
    return handler.localServices.get(service.replicaId) === service &&
      service.isShutdown !== true ? NOT_INTERRUPTED : REFUSAL.NOT_TRACKED_RUNNING;
  };

  const openEpisode = (service) => {
    const {promise: ended, resolve: settleEnded} = Promise.withResolvers();
    const record = {
      replicaId: service.replicaId, partitionId: service.partitionId,
      previous: service,
      serviceOptions: buildReplacementServiceOptions(service),
      live: true, state: STATE.RECEIVING, hold: HOLD.NONE, claim: CLAIM.NONE,
      wait: WAIT.NONE, attempts: 0, startedAtMs: now(),
      lastTrigger: NO_REASON, lastAttempt: ATTEMPT.NOT_ATTEMPTED,
      lastReason: NO_REASON, lastAttemptAtMs: 0, backoffMs: RETRY_BOUND_MS,
      retryTimer: NO_RETRY_TIMER, attemptInFlight: NOTHING_IN_FLIGHT,
      stepInFlight: NOTHING_IN_FLIGHT, claimSettled: NOTHING_IN_FLIGHT,
      removalOperations: new Set(), abort: new AbortController(),
      install: NO_INSTALL_OUTCOME, releaseFailure: null, ended, settleEnded,
    };
    record.custody = Object.freeze({replicaId: record.replicaId,
      isHeld: () => record.live});
    records.set(record.replicaId, record);
    return record;
  };

  const logOfferRefusal = (service, admission) => {
    handler.logger.warn(LOG_MSG.OFFER_NOT_ADMITTED, {
      event: EVENT.OFFER_NOT_ADMITTED, nodeId: handler.nodeId,
      replicaId: service.replicaId, partitionId: service.partitionId,
      decision: admission.decision, reason: admission.reason,
      rowStatus: admission.rowStatus});
    return admission;
  };

  // A claim: synchronous on the record; the promise is the claimant's
  // `episode_step_settle` wait.
  const claimRecord = (record, claim) => {
    const inFlight = [record.stepInFlight, record.attemptInFlight].filter(
      (flight) => flight !== NOTHING_IN_FLIGHT);
    end(record, STATE.CLAIMED, claim);
    record.wait = WAIT.EPISODE_STEP_SETTLE;
    record.claimSettled = Promise.allSettled(inFlight).then(() => {
      record.wait = WAIT.NONE;
    });
    return record.claimSettled;
  };

  // Claim the replica's live episode (if any) and wait for the step in
  // flight of its latest episode, claimed now or earlier by another owner.
  const claimAndSettle = (replicaId, claim) => {
    const record = records.get(replicaId);
    if (record === undefined) return Promise.resolve();
    if (record.live) return claimRecord(record, claim);
    return record.claimSettled === NOTHING_IN_FLIGHT ?
      Promise.resolve() : record.claimSettled;
  };

  // The record that has a service stopped right now.
  const stoppedRecordOf = (service) => [...records.values()].find(
    (record) => record.previous === service && isStopped(record));

  const continuationOf = (service) => {
    let current = service;
    while (successors.has(current)) {
      current = successors.get(current);
    }
    return current;
  };

  // The running service in place of `service`, waiting (to the deadline)
  // while this owner has it stopped. A replica that was claimed, or is not
  // back at the deadline, is a typed refusal: its caller does not continue.
  const settledContinuationOf = async (service, deadlineAtMs) => {
    const current = continuationOf(service);
    const record = stoppedRecordOf(current);
    if (record === undefined) return current;
    let timer;
    const expired = new Promise((resolve) => {
      timer = handler.timeSource.setTimeout(resolve,
        Math.max(0, deadlineAtMs - now()));
    });
    await Promise.race([record.ended, expired]);
    handler.timeSource.clearTimeout(timer);
    if (record.state !== STATE.RUNNING) {
      throw Object.assign(new Error(
        `Replica ${record.replicaId} stopped for a snapshot install is not ` +
        `running (${record.state}, ${record.lastAttempt})`),
      {code: ERROR_CODE.REPLICA_NOT_BACK_FROM_INSTALL,
        errorCode: ERROR_CODE.REPLICA_NOT_BACK_FROM_INSTALL,
        recreation: recordDiagnostics(record)});
    }
    return continuationOf(current);
  };

  // The orchestration's seam for the episode `service` is bound to.
  const episodeSeam = (service, record) => {
    const held = () => record.previous === service && record.live;
    return Object.freeze({
      // The receive is aborted through this signal when the episode ends.
      signal: record.abort.signal,
      // Presented to the installer, which requires it at the swap.
      custody: record.custody,
      // Immediately before the shutdown: the episode is still this
      // service's, no removal holds it, the lifecycle admits a recreate, the
      // received image names this replica, and the service is still the
      // running one the handler tracks. Admitted: receiving -> installing,
      // here, synchronously. Any refusal ends the episode with the replica
      // untouched and running.
      async admit(descriptor) {
        if (!held()) return refusedAdmission(REFUSAL.EPISODE_CLAIMED);
        const admission = await observeAdmission(service);
        if (!held()) return refusedAdmission(REFUSAL.EPISODE_CLAIMED);
        if (record.removalOperations.size > 0) {
          return endNotStopped(record, refusedAdmission(REFUSAL.REMOVAL_PENDING));
        }
        if (!admission.admitted) return endNotStopped(record, admission);
        if (!snapshotImageAdmitsReceiver(descriptor, service.replicaId)) {
          return endNotStopped(record,
            refusedAdmission(REFUSAL.IMAGE_OMITS_REPLICA));
        }
        if (handler.localServices.get(service.replicaId) !== service ||
            service.isShutdown === true) {
          return endNotStopped(record,
            refusedAdmission(REFUSAL.NOT_TRACKED_RUNNING));
        }
        record.state = STATE.INSTALLING;
        return admission;
      },
      // The receive ended without a complete image: the episode ends, the
      // replica never stopped.
      receiveFailed() {
        if (held()) end(record, STATE.NOT_STOPPED);
      },
      // One step of the stopped replica (its shutdown, its install): what a
      // claimant waits for.
      step(runStep) {
        const settled = runStep();
        const flight = settled.then(() => {}, () => {}).then(() => {
          if (record.stepInFlight === flight) {
            record.stepInFlight = NOTHING_IN_FLIGHT;
          }
        });
        record.stepInFlight = flight;
        return settled;
      },
      // Every path after the shutdown step hands the stopped replica back
      // here, once. Never throws.
      async recreate() {
        if (!held()) {
          return recreationOf(record, attemptAnswer(ATTEMPT.EPISODE_CLAIMED));
        }
        record.state = STATE.RECREATE_PENDING;
        return recreationOf(record, await run(record, TRIGGER.INSTALL_SETTLED));
      },
    });
  };

  return Object.freeze({
    /**
     * This node's replica of an offered raft group (= partition id): the
     * running service, or INSTALLING while the replica is under an install
     * episode (in any state), AMBIGUOUS with more than one running replica
     * of the group, or ABSENT.
     * @param {string} raftGroupId
     * @return {Object} Frozen {state: RAFT_SNAPSHOT_OFFER_RECEIVER, service?}.
     */
    resolveReceiver(raftGroupId) {
      for (const record of records.values()) {
        if (record.partitionId === raftGroupId && record.live) {
          return Object.freeze({state: RECEIVER.INSTALLING,
            replicaId: record.replicaId});
        }
      }
      const running = [...handler.localServices.values()].filter((service) =>
        service && service.partitionId === raftGroupId &&
        service.isShutdown !== true);
      // The offer names a group, not a replica: with two running replicas
      // of it on this node nothing says which one it is for.
      if (running.length > 1) return Object.freeze({state: RECEIVER.AMBIGUOUS});
      return running.length === 1 ?
        Object.freeze({state: RECEIVER.RUNNING, service: running[0]}) :
        Object.freeze({state: RECEIVER.ABSENT});
    },
    /**
     * The admission of an offer, before anything is received. The episode is
     * taken here, synchronously, bound to `service` as the handler's tracked
     * running service; the replica's lifecycle must then admit recreating it
     * after an install. A refusal is one typed line; no episode remains.
     * @param {Object} service - The running local replica service.
     * @return {Promise<Object>} The frozen admission.
     */
    async admitOffer(service) {
      const excluded = exclusionRefusalOf(service);
      if (excluded !== NOT_INTERRUPTED) {
        return logOfferRefusal(service, refusedAdmission(excluded));
      }
      const record = openEpisode(service);
      let admission;
      try {
        admission = await observeAdmission(service);
      } catch (error) {
        if (record.live) end(record, STATE.NOT_STOPPED);
        records.delete(record.replicaId);
        throw error;
      }
      if (!record.live) {
        return logOfferRefusal(service, refusedAdmission(REFUSAL.EPISODE_CLAIMED));
      }
      if (admission.admitted && record.removalOperations.size === 0) {
        return admission;
      }
      end(record, STATE.NOT_STOPPED);
      records.delete(record.replicaId);
      return logOfferRefusal(service, admission.admitted ?
        refusedAdmission(REFUSAL.REMOVAL_PENDING) : admission);
    },
    /**
     * The orchestration's seam for the episode an admitted offer took.
     * @param {Object} service - The service the offer was admitted for.
     * @return {Object} {signal, custody, admit(descriptor), receiveFailed(),
     *   step(run), recreate()}.
     */
    episodeFor(service) {
      return episodeSeam(service, records.get(service.replicaId));
    },
    /**
     * The custody a registry or tracked-service write for the replica must
     * present: its live episode's, or NO_CUSTODY (null) when it has none.
     * @param {string} replicaId
     * @return {Object|null}
     */
    custodyOf(replicaId) {
      return liveRecordOf(replicaId)?.custody ?? NO_CUSTODY;
    },
    /**
     * The service a tracked-service write may name without custody: the one
     * the replica's live episode is bound to (naming it changes nothing).
     * @param {string} replicaId
     * @return {Object|null}
     */
    boundServiceOf(replicaId) {
      return liveRecordOf(replicaId)?.previous ?? NO_CUSTODY;
    },
    /**
     * An accepted REMOVE holds the replica's episode: nothing is opened, an
     * open in flight is released, until every holding operation lifted. The
     * hold is keyed by operation id. Synchronous.
     * @param {string} replicaId
     * @param {string} operationId - The REMOVE operation.
     * @return {Function} lift() - idempotent; the last one resumes the
     *   recreation when the episode is still live.
     */
    holdForRemoval(replicaId, operationId) {
      const record = liveRecordOf(replicaId);
      if (record === undefined) return () => {};
      record.removalOperations.add(operationId);
      clearRetry(record);
      handler.logger.warn(LOG_MSG.EPISODE_HELD, {event: EVENT.EPISODE_HELD,
        nodeId: handler.nodeId, operationId, ...recordDiagnostics(record)});
      return () => {
        if (!record.removalOperations.delete(operationId)) return;
        if (record.removalOperations.size === 0 && record.live &&
            record.state === STATE.RECREATE_PENDING) {
          run(record, TRIGGER.HOLD_LIFTED);
        }
      };
    },
    /**
     * The removal's claim. Precondition (the caller's): the replica's
     * REMOVING row is durable. Answers, after `episode_step_settle`, the
     * service the handler tracks: the one this removal acts on.
     * @param {string} replicaId
     * @return {Promise<Object|null>}
     */
    async claimForRemoval(replicaId) {
      await claimAndSettle(replicaId, CLAIM.REMOVAL);
      return handler.getTrackedService(replicaId);
    },
    /**
     * The cleanup owner's claim. Precondition (the caller's): a current
     * durable cleanup token for the replica.
     * @param {string} replicaId
     * @return {Promise<void>}
     */
    claimForCleanup(replicaId) {
      return claimAndSettle(replicaId, CLAIM.CLEANUP);
    },
    /**
     * The claim of a failing create. Precondition: the create owns the
     * replica, that is, the service it holds (followed through every
     * install) is the one the episode is bound to. Answers, after
     * `episode_step_settle`, the service the failure fences.
     * @param {string} replicaId
     * @param {Object|null|undefined} service - The service the create holds.
     * @return {Promise<Object|null|undefined>}
     */
    async claimForCreateFailure(replicaId, service) {
      const current = service ? continuationOf(service) : service;
      if (records.get(replicaId)?.previous === current) {
        await claimAndSettle(replicaId, CLAIM.CREATE_FAILURE);
      }
      return current;
    },
    /**
     * The service a caller that waited continues with: the replacement
     * running in place of a service this owner stopped (followed through
     * every later install), or the service itself when it was never stopped
     * or is not back yet.
     * @param {Object} service
     * @return {Object}
     */
    continuationOf,
    /**
     * A create's activation of its replica, over an install that may stop
     * the replica around it. The lifecycle lane serializes an ACTIVE write
     * with the retirement of the service's transport handler, so an install
     * that got there first refuses the activation typed; this waits for the
     * replica's return (to the deadline) and activates the replacement. Any
     * other refusal, a claimed replica and the deadline are thrown.
     * @param {Object} service - The service the create holds.
     * @param {number} deadlineAtMs - The create's own deadline.
     * @param {Function} activate - async (service) => the ACTIVE write.
     * @return {Promise<Object>} The service that was activated.
     */
    async activateContinuation(service, deadlineAtMs, activate) {
      for (;;) {
        const current = await settledContinuationOf(service, deadlineAtMs);
        try {
          await activate(current);
          return current;
        } catch (error) {
          const stoppedByInstall = stoppedRecordOf(current) !== undefined ||
            successors.has(current);
          if (error?.code !== REPLICA_ACTIVATION_HANDLER_NOT_REGISTERED ||
              !stoppedByInstall) {
            throw error;
          }
        }
      }
    },
    /**
     * The install outcome of an episode that did not end installed and
     * recreated, kept on the record (it outlives the stopped service object
     * and the install marker).
     * @param {Object} service - The service the offer was admitted for.
     * @param {Object} outcome - The frozen typed summary.
     * @return {void}
     */
    recordInstallOutcome(service, outcome) {
      const record = records.get(service.replicaId);
      if (record !== undefined && (record.previous === service ||
          record.previous === continuationOf(service))) {
        record.install = outcome;
      }
    },
    /**
     * The handler is stopping: it claims every live episode. Resolves after
     * each one's `episode_step_settle`.
     * @return {Promise<void>}
     */
    async shutdown() {
      await Promise.all([...records.values()].map((record) =>
        claimAndSettle(record.replicaId, CLAIM.HANDLER_STOP)));
    },
    readDiagnostics() {
      return Object.freeze({replicas: Object.freeze(
        [...records.values()].map(recordDiagnostics))});
    },
  });
}

export {createReplicaSnapshotInstallOwner};
