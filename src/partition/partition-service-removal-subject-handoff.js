/**
 * Owner contract:
 * Owner: the removal subject's leadership at the node effect owner - what a
 * partition replica does about its own leadership while its own services row
 * retires it (REMOVING, REMOVED, deleted, or a claimed failed-create row).
 * The universal removal leadership rule (2026-11-11) end to end: a replica
 * is never the leader that removes itself. The rebalancer's removal
 * leadership gate holds the removal's dispatch while the subject leads; this
 * owner holds the rule after the removal began, when the subject holds
 * leadership or gains it (an election it wins, a transfer that lands on it).
 * Rule: the subject never proposes its own RemoveNode (the reconcile of its
 * own row proposes nothing). While it leads, it hands leadership to a live
 * surviving voter by one named transfer through the partition's one
 * transfer issuer (requestLeadershipTransfer), the transferee chosen by the
 * removal transferee rule (raft-removal-transferee-rule.js) from the
 * leader's own facts; the survivor that then leads proposes the RemoveNode
 * from the retiring row it holds (the row-driven deferred retirement, re-
 * driven on its LEADER event).
 * Named states (REMOVAL_SUBJECT_HANDOFF_STATE): NOT_RETIRING; FOLLOWING
 * (retiring, does not lead: nothing to do); TRANSFER_REQUESTED (a named
 * transfer is running); TRANSFER_REFUSED (the port refused it); and
 * NO_TRANSFEREE (no eligible survivor: a single-voter group, a joint
 * configuration, no live caught-up voter).
 * Wakes: the own row turning retiring; this replica's LEADER, LEADER_CHANGE
 * and MEMBERSHIP_CHANGED events (a transfer that landed, a voter admitted, a
 * joint configuration left); APPLIED_PROGRESS while NO_TRANSFEREE (a new
 * leader's voters have answered it once its first entry applied); and the group's leadership-transfer window -
 * raft-rs aborts a transfer one election timeout after its leader accepted
 * it, with no event, so the window (the abort's bound, maximised over the
 * group's replicas) is the one clock that ends TRANSFER_REQUESTED,
 * TRANSFER_REFUSED and a NO_TRANSFEREE among live voters. A transferee whose
 * transfer ran out or was refused is passed over while another exists. A
 * NO_TRANSFEREE with no other voter at all waits on MEMBERSHIP_CHANGED only:
 * the last voter of a group is never removed by a removal (the port refuses
 * it, REMOVES_LAST_VOTER); a group retirement retires it by its durable
 * workflow record, and a sole founder whose create failed retires its own
 * never-created group at the node's removal owner
 * (node/replica-removal-sole-founder.js).
 * Second line, at the raft owner: the leader's port refuses a change that
 * removes the leader itself (REMOVES_LEADER), and a leader that
 * applied its own removal anyway steps down (raft-rs-runtime-owner.js).
 */
import {chooseLeaderRemovalTransferee} from
  '../raft/raft-removal-transferee-rule.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {turnChainValue} from '../raft/raft-rs-turn-answer.js';
import {leadershipTransferWindowMaxMsOf} from
  './partition-service-raft-membership-administration.js';

const REMOVAL_SUBJECT_HANDOFF_STATE = Object.freeze({
  NOT_RETIRING: 'not_retiring',
  FOLLOWING: 'retiring_following',
  TRANSFER_REQUESTED: 'retiring_transfer_requested',
  TRANSFER_REFUSED: 'retiring_transfer_refused',
  NO_TRANSFEREE: 'retiring_no_transferee',
});
const STATE = REMOVAL_SUBJECT_HANDOFF_STATE;

const REMOVAL_SUBJECT_HANDOFF_LOG_MSG = Object.freeze({
  TRANSFER: 'Retiring partition replica leads: handing leadership to a ' +
    'surviving voter before its removal',
  WAIT: 'Retiring partition replica leads with no eligible transferee: its ' +
    'removal waits',
});

function handoffOf(service) {
  service.removalSubjectHandoff ??= {state: STATE.NOT_RETIRING,
    transfereeId: null, excludedId: null, timer: null, generation: 0};
  return service.removalSubjectHandoff;
}

function clearWindow(handoff) {
  if (handoff.timer !== null) {
    clearTimeout(handoff.timer);
    handoff.timer = null;
  }
}

function armWindow(service, handoff) {
  const windowMs = leadershipTransferWindowMaxMsOf(service);
  if (windowMs === null) {
    return;
  }
  const generation = handoff.generation;
  handoff.timer = setTimeout(() => {
    handoff.timer = null;
    if (handoff.generation === generation) {
      // The transfer this window bounded ran out: its transferee is passed
      // over while another survivor is eligible.
      handoff.excludedId = handoff.transfereeId ?? handoff.excludedId;
      driveRemovalSubjectHandoff(service);
    }
  }, windowMs);
  handoff.timer.unref?.();
}

function settleTransferAnswer(service, handoff, generation, answer) {
  if (handoff.generation !== generation ||
      handoff.state !== STATE.TRANSFER_REQUESTED) {
    return;
  }
  if (answer?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    handoff.state = STATE.TRANSFER_REFUSED;
    handoff.excludedId = handoff.transfereeId;
    handoff.transfereeId = null;
  }
}

function requestTransfer(service, handoff, status, transferee) {
  handoff.state = STATE.TRANSFER_REQUESTED;
  handoff.transfereeId = transferee.id;
  const generation = handoff.generation;
  service.logger.info(REMOVAL_SUBJECT_HANDOFF_LOG_MSG.TRANSFER, {
    partitionId: service.partitionId, replicaId: service.replicaId,
    term: status.term, transfereeReplicaId: transferee.id,
    excludedReplicaId: handoff.excludedId});
  armWindow(service, handoff);
  Promise.resolve(turnChainValue(service.requestLeadershipTransfer({
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
    replicaIdentity: transferee.id,
  }))).then((answer) => settleTransferAnswer(service, handoff, generation,
    answer), (error) => settleTransferAnswer(service, handoff, generation,
    {outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, reason: error?.message}));
}

function waitForTransferee(service, handoff, status) {
  handoff.state = STATE.NO_TRANSFEREE;
  handoff.transfereeId = null;
  service.logger.warn(REMOVAL_SUBJECT_HANDOFF_LOG_MSG.WAIT, {
    partitionId: service.partitionId, replicaId: service.replicaId,
    term: status.term, voterCount: status.voterCount});
  // Live voters may become eligible without a membership event (a voter
  // answers this leader, catches up); a lone voter waits for an admission.
  if (status.voterCount > 1) {
    armWindow(service, handoff);
  }
}

/**
 * Re-evaluate the retiring replica's leadership: hand it on when this
 * replica leads, nothing otherwise.
 * @param {Object} service - The partition service.
 */
function driveRemovalSubjectHandoff(service) {
  const handoff = handoffOf(service);
  if (handoff.state === STATE.NOT_RETIRING || service.isShutdown === true ||
      !service.raft) {
    return;
  }
  const status = service.raft.readStatus();
  if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
      status.role !== RAFT_ROLE.LEADER) {
    handoff.generation += 1;
    clearWindow(handoff);
    handoff.state = STATE.FOLLOWING;
    handoff.transfereeId = null;
    return;
  }
  // A running transfer is never retargeted: raft-rs ignores a repeat to the
  // same transferee and restarts the clock for another; its window ends it.
  if (handoff.state === STATE.TRANSFER_REQUESTED && handoff.timer !== null) {
    return;
  }
  handoff.generation += 1;
  clearWindow(handoff);
  const transferee = chooseLeaderRemovalTransferee(status,
    handoff.excludedId);
  if (transferee === null) {
    waitForTransferee(service, handoff, status);
  } else {
    requestTransfer(service, handoff, status, transferee);
  }
}

/**
 * The replica's own services row retires it: from now on it hands on any
 * leadership it holds or gains, and never proposes its own removal.
 * @param {Object} service - The partition service.
 */
function observeRemovalSubjectRetiring(service) {
  const handoff = handoffOf(service);
  if (handoff.state === STATE.NOT_RETIRING) {
    handoff.state = STATE.FOLLOWING;
  }
  driveRemovalSubjectHandoff(service);
}

/**
 * The replica's own services row no longer retires it (the removal did not
 * go ahead and its row returned to a serving status).
 * @param {Object} service - The partition service.
 */
function observeRemovalSubjectRetained(service) {
  const handoff = handoffOf(service);
  handoff.generation += 1;
  clearWindow(handoff);
  handoff.state = STATE.NOT_RETIRING;
  handoff.transfereeId = null;
  handoff.excludedId = null;
}

/**
 * Wake the owner on the events that end its waits.
 * @param {Object} service - The partition service (its port is open).
 */
function subscribeRemovalSubjectHandoff(service) {
  // Each wake re-evaluates on the next microtask, outside the port's own
  // event emission (as the deferred-retirement re-drive does).
  const drive = () => queueMicrotask(() => driveRemovalSubjectHandoff(service));
  service.raft.subscribe(RAFT_EVENT.LEADER, drive);
  service.raft.subscribe(RAFT_EVENT.LEADER_CHANGE, drive);
  service.raft.subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, drive);
  // A new leader's progress starts at zero: the first applied entry of its
  // term is the event by which its voters have answered it.
  service.raft.subscribe(RAFT_EVENT.APPLIED_PROGRESS, () => {
    if (handoffOf(service).state === STATE.NO_TRANSFEREE) {
      drive();
    }
  });
}

/**
 * Shutdown: the window is released with the replica.
 * @param {Object} service - The partition service.
 */
function releaseRemovalSubjectHandoff(service) {
  if (service.removalSubjectHandoff) {
    service.removalSubjectHandoff.generation += 1;
    clearWindow(service.removalSubjectHandoff);
  }
}

/**
 * @param {Object} service - The partition service.
 * @return {string} The owner's named state.
 */
function removalSubjectHandoffStateOf(service) {
  return handoffOf(service).state;
}

export {
  REMOVAL_SUBJECT_HANDOFF_STATE,
  observeRemovalSubjectRetained,
  observeRemovalSubjectRetiring,
  releaseRemovalSubjectHandoff,
  removalSubjectHandoffStateOf,
  subscribeRemovalSubjectHandoff,
};
