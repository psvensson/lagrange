// A partition leader's snapshot catch-up driver. The consensus runtime
// notifies ONCE that a follower needs a snapshot (raft-rs holds that peer in
// its Snapshot state and sends it nothing but heartbeats until the snapshot
// is acknowledged or reported failed; the vendored binding exposes no
// failure report). This owner keeps one record per notified follower, hands
// each decision to the dispatcher seam (service.onSnapshotCatchupNeeded,
// set by bootstrap/shared/snapshot-catchup-wiring.js) with an abort signal
// and a progress observer, records the typed outcome, and asks again while
// the follower stays behind its snapshot boundary:
//   - the next sweep, when the dispatcher answered that the follower node's
//     one transfer slot was busy (another partition's transfer to that node);
//   - on a named event, when the last dispatch otherwise did not serve: a
//     newer checkpoint generation exists, or this leader's checkpoint
//     identity changed; and on the declared bound since it settled;
//   - on its own, longer bound when the last dispatch SERVED: a served
//     follower is shutting down, installing and reopening, and is not
//     offered the image again unless the leader's progress for it never
//     arrives.
// A dispatch in flight that reports no progress for the idle bound is
// aborted through its signal and settles typed, so an unanswered peer cannot
// hold the record or its node's transfer slot (R13). The record closes when
// the leader's own progress for the follower is at or past the boundary,
// when the committed configuration no longer names the follower, when
// leadership is lost, or when the service shuts down (an in-flight dispatch
// is aborted in both of the last two). Every dispatch
// outcome other than served or slot-busy is one typed log line, and the
// records are the leader's visible stall state. One sweep rides the
// service's existing 1s sweep and reads the consensus status only while a
// record exists.

import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {PEER_ADDRESS_STATUS} from '../raft/raft-rs-runtime-owner-constants.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME as DISPATCH,
} from '../raft/snapshot-catchup-constants.js';
import {
  buildSnapshotCatchupIdentityFromCache,
  resolveFollowerNodeId,
  snapshotCheckpointIdentityKey,
} from '../raft/snapshot-catchup.js';
import {listCheckpointGenerations} from '../raft/snapshot-checkpoint-store.js';
import {resolveReplicaCheckpointsRoot as checkpointsRootOf} from
  '../raft/snapshot-install.js';

import {createPartitionSnapshotOutcomeLog} from './partition-snapshot-outcome-log.js';
import {
  PARTITION_SNAPSHOT_CATCHUP_CLOSE as CLOSE,
  PARTITION_SNAPSHOT_CATCHUP_DISPATCH_IDLE_BOUND_MS as IDLE_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_DRIVER_OUTCOME as DRIVER,
  PARTITION_SNAPSHOT_CATCHUP_REASK_BOUND_MS as REASK_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_SERVED_REASK_BOUND_MS as SERVED_REASK_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_SWEEP_OUTCOME as SWEEP,
  PARTITION_SNAPSHOT_CATCHUP_TRIGGER as TRIGGER,
  PARTITION_SNAPSHOT_NO_OUTCOME_REASON as NO_REASON,
  PARTITION_SNAPSHOT_PROGRESS_EVENT as EVENT,
  PARTITION_SNAPSHOT_PROGRESS_LOG_MSG as LOG_MSG,
} from './partition-snapshot-progress-constants.js';

// The newest generation index of a checkpoints root holding none.
const NO_GENERATION = -1;
// A record's settle facts before its first dispatch settles, and the named
// non-decisions of the sweep's two per-record questions.
const IDENTITY_UNREAD = 'identity_unread';
const STILL_BEHIND = 'still_behind';
const NO_TRIGGER = 'no_trigger';
// The replica identity of a follower whose address names none.
const IDENTITY_UNRESOLVED = 'follower_identity_unresolved';
const OUTCOME_FIELD_TYPE = 'string';
// PartitionService's onSnapshotCatchupNeeded while no dispatcher is wired
// (partition-service-core-base.js normalizes the option to a function or this).
const NO_DISPATCHER = null;
// A record with no dispatch in flight.
const NOT_IN_FLIGHT = null;
// Outcomes that are not reported as a failure to serve: served, and the
// follower node's slot being busy (the ordinary queueing of several
// partitions behind one node, retried on the next sweep).
const UNREPORTED_OUTCOMES = Object.freeze([DISPATCH.SERVED, DISPATCH.ALREADY_IN_FLIGHT]);

function sweepResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

// The dispatcher's typed result, or the driver's own typed outcome for a
// seam that answered none.
function typedDispatchResult(result) {
  return typeof result?.outcome === OUTCOME_FIELD_TYPE ? result :
    Object.freeze({outcome: DRIVER.RESULT_UNTYPED});
}

function dispatchReason(result) {
  if (result.outcome === DISPATCH.TRANSFER_ABORTED) {
    return result.transfer.reason;
  }
  if (result.outcome === DISPATCH.CHECKPOINT_CREATION_FAILED) {
    return result.creation.outcome;
  }
  return NO_REASON;
}

function newestGenerationIndex(service) {
  const generations = listCheckpointGenerations(
    checkpointsRootOf(service.dbPath));
  return generations.length > 0 ?
    generations[generations.length - 1] : NO_GENERATION;
}

function identityKeyOf(service) {
  return snapshotCheckpointIdentityKey(buildSnapshotCatchupIdentityFromCache({
    partitionId: service.partitionId,
    tableName: service.tableName,
    systemTableCache: service.systemTableCache,
  }));
}

function replicaIdentityOf(followerAddress) {
  const follower = resolveFollowerNodeId(followerAddress);
  return follower.resolved ? follower.replicaIdentity : IDENTITY_UNRESOLVED;
}

// Whether the follower is past its snapshot boundary by the leader's own
// progress for it, has left the committed configuration, or is still behind.
// The status's peers ARE the configuration's voters and learners: the
// follower has departed when none of them carries its replica identity. A
// configured peer whose identity this replica never reserved might be it, so
// departure is not read while one exists; a peer's address plays no part.
function closeReason(record, status) {
  const peer = status.peers.find(
    ({replicaIdentity}) => replicaIdentity === record.replicaIdentity);
  if (!peer) {
    return status.peers.some(({addressStatus}) =>
      addressStatus === PEER_ADDRESS_STATUS.UNRESERVED) ?
      STILL_BEHIND : CLOSE.NOT_IN_CONFIGURATION;
  }
  const matched = status.followerProgress[peer.replicaIdentity];
  return Number.isFinite(matched) && matched >= record.decision.leaderBoundary ?
    CLOSE.PAST_BOUNDARY : STILL_BEHIND;
}

function reaskTrigger(service, record, nowMs) {
  const elapsedMs = nowMs - record.settledAtMs;
  if (record.lastOutcome === DISPATCH.SERVED) {
    return elapsedMs >= SERVED_REASK_BOUND_MS ?
      TRIGGER.SERVED_BOUND_ELAPSED : NO_TRIGGER;
  }
  if (record.lastOutcome === DISPATCH.ALREADY_IN_FLIGHT) {
    return TRIGGER.FOLLOWER_NODE_SLOT_BUSY;
  }
  if (elapsedMs >= REASK_BOUND_MS) {
    return TRIGGER.BOUND_ELAPSED;
  }
  if (newestGenerationIndex(service) > record.newestGenerationAtSettle) {
    return TRIGGER.NEWER_CHECKPOINT_GENERATION;
  }
  return identityKeyOf(service) === record.identityKeyAtSettle ?
    NO_TRIGGER : TRIGGER.IDENTITY_CHANGED;
}

function followerDiagnostics(record) {
  return Object.freeze({
    followerAddress: record.followerAddress,
    leaderBoundary: record.decision.leaderBoundary,
    attempts: record.attempts,
    inFlight: record.flight !== NOT_IN_FLIGHT,
    firstRequestedAtMs: record.firstRequestedAtMs,
    lastTrigger: record.lastTrigger,
    lastOutcome: record.lastOutcome,
    lastReason: record.lastReason,
    settledAtMs: record.settledAtMs,
  });
}

/**
 * @param {Object} options
 * @param {Object} options.service - The owning PartitionService.
 * @return {Object} Frozen {dispatch(decision), sweep(nowMs), shutdown(),
 *   readDiagnostics()}.
 */
function createPartitionSnapshotCatchupDriver(options) {
  const {service} = options;
  const followers = new Map();
  // Set once by shutdown: the driver's lifetime is its service's (R13).
  let stopped = false;
  const outcomeLog = createPartitionSnapshotOutcomeLog({
    service,
    event: EVENT.CATCHUP_DISPATCH_OUTCOME,
    message: LOG_MSG.CATCHUP_DISPATCH_OUTCOME,
  });

  const recordOf = (decision) => {
    const existing = followers.get(decision.followerAddress);
    if (existing) {
      return existing;
    }
    const record = {
      followerAddress: decision.followerAddress,
      replicaIdentity: replicaIdentityOf(decision.followerAddress),
      decision,
      attempts: 0,
      flight: NOT_IN_FLIGHT,
      firstRequestedAtMs: service.timeSource.now(),
      lastTrigger: NO_TRIGGER,
      lastOutcome: DRIVER.IN_FLIGHT,
      lastReason: NO_REASON,
      settledAtMs: 0,
      newestGenerationAtSettle: NO_GENERATION,
      identityKeyAtSettle: IDENTITY_UNREAD,
    };
    followers.set(record.followerAddress, record);
    return record;
  };

  const settle = (record, result) => {
    record.flight = NOT_IN_FLIGHT;
    record.settledAtMs = service.timeSource.now();
    record.lastOutcome = result.outcome;
    record.lastReason = dispatchReason(result);
    record.newestGenerationAtSettle = newestGenerationIndex(service);
    record.identityKeyAtSettle = identityKeyOf(service);
    if (!UNREPORTED_OUTCOMES.includes(result.outcome)) {
      outcomeLog.report(record.followerAddress, {
        followerAddress: record.followerAddress,
        outcome: result.outcome,
        reason: record.lastReason,
        trigger: record.lastTrigger,
        attempts: record.attempts,
        leaderBoundary: record.decision.leaderBoundary,
      });
    }
    return result;
  };

  // What one flight answered. A flight the sweep already took out of the
  // record (aborted for silence, or abandoned with leadership) settles
  // nothing when its dispatcher finally answers.
  const settleFlight = (record, flight, answered) => {
    const result = typedDispatchResult(answered);
    return record.flight === flight ? settle(record, result) : result;
  };

  // Recording the settlement itself failed (the checkpoints root or the log
  // could not be read or written): the record still leaves flight, typed, so
  // the bound re-asks it; the notifier's dropped promise never rejects.
  const settleUnrecorded = (record, flight, error) => {
    if (record.flight === flight) {
      record.flight = NOT_IN_FLIGHT;
      record.settledAtMs = service.timeSource.now();
      record.lastOutcome = DRIVER.DISPATCH_FAULTED;
    }
    return Object.freeze({outcome: DRIVER.DISPATCH_FAULTED, detail: error?.message});
  };

  // The seam is called in the caller's turn (the runtime's notification is
  // synchronous); what it answers, or throws, settles the record later. The
  // service holds the seam as a function or, while no dispatcher is wired,
  // as its constructor's NO_DISPATCHER.
  const askDispatcher = (decision, flight) => {
    const seam = service.onSnapshotCatchupNeeded;
    if (seam === NO_DISPATCHER) {
      return Promise.resolve(Object.freeze({outcome: DRIVER.DISPATCHER_UNWIRED}));
    }
    try {
      return Promise.resolve(seam(decision, Object.freeze({
        signal: flight.controller.signal,
        onProgress: () => {
          flight.lastProgressAtMs = service.timeSource.now();
        },
      })));
    } catch (error) {
      return Promise.resolve(Object.freeze(
        {outcome: DRIVER.DISPATCH_FAULTED, detail: error?.message}));
    }
  };

  const dispatch = (decision, trigger) => {
    if (stopped) {
      return Promise.resolve(Object.freeze({outcome: DRIVER.SERVICE_SHUT_DOWN}));
    }
    const record = recordOf(decision);
    if (record.flight !== NOT_IN_FLIGHT) {
      return record.flight.answer;
    }
    const flight = {controller: new AbortController(),
      lastProgressAtMs: service.timeSource.now(), answer: NOT_IN_FLIGHT};
    record.decision = decision;
    record.attempts += 1;
    record.lastTrigger = trigger;
    record.lastOutcome = DRIVER.IN_FLIGHT;
    record.flight = flight;
    flight.answer = askDispatcher(decision, flight).then(
      (answered) => settleFlight(record, flight, answered),
      (error) => settleFlight(record, flight, Object.freeze(
        {outcome: DRIVER.DISPATCH_FAULTED, detail: error?.message})))
      .catch((error) => settleUnrecorded(record, flight, error));
    return flight.answer;
  };

  // Tells the dispatcher of the record's flight to stop and takes the flight
  // out of the record: the dial or transfer ends on the signal, the
  // dispatcher closes its channel and frees the follower node's slot.
  const abortFlight = (record) => {
    const {controller} = record.flight;
    record.flight = NOT_IN_FLIGHT;
    controller.abort();
  };

  const close = (record, reason) => {
    followers.delete(record.followerAddress);
    service.logger.info(LOG_MSG.CATCHUP_SETTLED, {
      event: EVENT.CATCHUP_SETTLED,
      partitionId: service.partitionId,
      followerAddress: record.followerAddress,
      reason,
      attempts: record.attempts,
      lastOutcome: record.lastOutcome,
      lastReason: record.lastReason,
    });
  };

  const sweepInFlight = (record, nowMs) => {
    if (nowMs - record.flight.lastProgressAtMs < IDLE_BOUND_MS) {
      return;
    }
    abortFlight(record);
    settle(record, Object.freeze({outcome: DRIVER.DISPATCH_UNANSWERED}));
  };

  const sweepRecords = (nowMs) => {
    if (service.isShutdown || service.role !== RAFT_ROLE.LEADER) {
      for (const record of [...followers.values()]) {
        if (record.flight !== NOT_IN_FLIGHT) abortFlight(record);
        close(record, CLOSE.LEADERSHIP_LOST);
      }
      return sweepResult(SWEEP.NOT_LEADER);
    }
    const status = service.raft.readStatus();
    if (status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
      return sweepResult(SWEEP.STATUS_UNAVAILABLE, {statusOutcome: status.outcome});
    }
    const reasked = [];
    for (const record of [...followers.values()]) {
      if (record.flight !== NOT_IN_FLIGHT) {
        sweepInFlight(record, nowMs);
        continue;
      }
      const closing = closeReason(record, status);
      if (closing !== STILL_BEHIND) {
        close(record, closing);
        continue;
      }
      const trigger = reaskTrigger(service, record, nowMs);
      if (trigger !== NO_TRIGGER) {
        reasked.push(Object.freeze({followerAddress: record.followerAddress, trigger}));
        dispatch(record.decision, trigger);
      }
    }
    return sweepResult(SWEEP.SWEPT, {reasked: Object.freeze(reasked)});
  };

  return Object.freeze({
    /**
     * The runtime's notification for one follower. Coalesces onto a dispatch
     * already in flight for that follower.
     * @param {Object} decision - The typed install_snapshot decision.
     * @return {Promise<Object>} The typed dispatch result.
     */
    dispatch(decision) {
      return dispatch(decision, TRIGGER.RUNTIME_NOTIFICATION);
    },
    /**
     * One re-ask sweep. Never rejects.
     * @param {number} nowMs - Sweep timestamp.
     * @return {Promise<Object>} Typed frozen sweep result.
     */
    async sweep(nowMs) {
      if (followers.size === 0) {
        return sweepResult(SWEEP.NO_FOLLOWER_RECORD);
      }
      try {
        return sweepRecords(nowMs);
      } catch (error) {
        return sweepResult(SWEEP.SWEEP_FAILED, {detail: error?.message});
      }
    },
    /**
     * The service is shutting down: every dispatch in flight is aborted
     * through its signal (its dispatcher closes its channel and frees the
     * follower node's transfer slot), every record is closed, and a later
     * notification is refused typed. The sweep that owns the idle bound
     * stops with the service, so nothing else would end a flight.
     * @return {void}
     */
    shutdown() {
      stopped = true;
      for (const record of [...followers.values()]) {
        if (record.flight !== NOT_IN_FLIGHT) abortFlight(record);
        close(record, CLOSE.SERVICE_SHUT_DOWN);
      }
    },
    readDiagnostics() {
      return Object.freeze({
        followers: Object.freeze([...followers.values()].map(followerDiagnostics)),
      });
    },
  });
}

export {createPartitionSnapshotCatchupDriver};
