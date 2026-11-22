// The port's current authority observation (observeCurrentAuthority): the
// raft core as it is at the call, for a decision that must not rest on the
// status of the last completed core entry - readStatus answers that one
// while a core turn is pending (amendment A7.1) and, with delivered inbound,
// drives that inbound first. It reads and never drives: the core's status,
// whether the core holds a Ready, and the runtime owner's own fields - the
// group's inbound queue and its tick backlog among them - no step, drain,
// Ready, persistence, application, announcement, recorded observation,
// reconstruction or replacement, whether or not a turn is pending or inbound
// is queued. The runtime owner hands in its state and its one core entry
// point; nothing here keeps state but the tick backlog it counts for it.

import {deepFreeze} from './raft-operation-port.js';
import {
  RAFT_AUTHORITY_OBSERVATION,
  RAFT_AUTHORITY_UNSETTLED_REASON,
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {participationObservation} from './raft-rs-participation-gate.js';
import {
  HEALTHY,
  NO_LEADER,
  RECOVERY_REQUIRED,
  ROLE,
  ROLE_LEADER,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';
import {currentTermApplied} from './raft-rs-status-observation.js';

const CORE_STATUS = 'status';
const CORE_HAS_READY = 'has_ready';
const NO_TERM = '0';

/**
 * A tick asked for while a turn is pending waits behind that turn, and the
 * core's clock stands still until it runs: the group's tick backlog counts
 * the ticks queued and not yet started (the observation's tickBacklog). The
 * runtime owner wraps the work of every tick it enqueues with this.
 * @param {Object} group - The runtime group.
 * @param {boolean} isTick - Whether the command is a tick.
 * @param {Function} work - The command's turn work.
 * @return {Function} The work to enqueue.
 */
function countedTick(group, isTick, work) {
  if (!isTick) return work;
  group.queuedTicks += 1;
  return () => {
    group.queuedTicks -= 1;
    return work();
  };
}

// Whether an envelope delivered to the group and queued, not yet stepped,
// carries a term above the core's.
function higherTermQueued(inbound, term) {
  const coreTerm = BigInt(term);
  return inbound.some((envelope) =>
    BigInt(envelope.message?.term ?? NO_TERM) > coreTerm);
}

/**
 * Why a core that leads is not reported LEADER, or null when it is. Each
 * reason is a fact the process holds and the core does not yet have:
 * - HIGHER_TERM_INBOUND: an envelope of a higher term waits in the group's
 *   own inbound: the successor's (stepped, the core follows its term) or a
 *   candidate's or pre-candidate's, which a leader in its lease ignores -
 *   counted all the same: the read cannot tell them apart without stepping.
 * - CLOCK_BEHIND: a tick waits behind the pending turn: the core has not
 *   seen that time, so check-quorum, the bound on a deposed leader, has not
 *   run on it. Any backlog counts: a lag of one tick already lets the core's
 *   lease outlive the one raft defines, and a healthy leader's backlog lasts
 *   only while a turn pends.
 * - OWN_TERM_UNAPPLIED: it has not applied an entry of its own term and a
 *   turn is pending or the core holds a Ready (its term-start entry may not
 *   yet be durable).
 * @param {Object} group - The runtime group.
 * @param {Object} facts - {status, ownTermApplied, settled}.
 * @return {string|null} A RAFT_AUTHORITY_UNSETTLED_REASON, or null.
 */
function leaderUnsettledReason(group, {status, ownTermApplied, settled}) {
  if (higherTermQueued(group.inbound, status.term)) {
    return RAFT_AUTHORITY_UNSETTLED_REASON.HIGHER_TERM_INBOUND;
  }
  if (group.queuedTicks > 0) return RAFT_AUTHORITY_UNSETTLED_REASON.CLOCK_BEHIND;
  return ownTermApplied || settled ? null :
    RAFT_AUTHORITY_UNSETTLED_REASON.OWN_TERM_UNAPPLIED;
}

/**
 * The core's authority facts at one synchronous read, never recorded and
 * never published to the native status observer. Per field, against what a
 * turn in progress may not yet have made durable:
 * - term, commitIndex and the leader a non-leader names: the core's
 *   in-memory values, never behind its durable record. A higher term the
 *   core already knows is the conservative answer for a receiver that
 *   refuses unless it leads; a commit index is a quorum fact whether or not
 *   this replica has persisted it.
 * - appliedIndex, appliedTerm: the runtime's own, advanced in the same
 *   synchronous run as the SQLite transaction that applied the entries: the
 *   position of the rows this replica's connection reads.
 * - role LEADER: raft-rs asserts the whole log is persisted when a replica
 *   becomes leader (raft-0.7.0 src/raft.rs:1207-1214); only its term-start
 *   entry may not be. A core that leads is reported LEADER only when no
 *   reason of leaderUnsettledReason holds; otherwise its role and the leader
 *   it names are NOT_SETTLED, unsettledReason names why, and
 *   currentTermApplied is false (true only with role LEADER).
 * - tickBacklog: the ticks queued behind the pending turn, not yet given to
 *   the core.
 * @param {Object} group - The runtime group.
 * @param {Object} read - {status, readyHeld, runtimeHealth,
 *   runtimeGeneration} as the runtime owner read them.
 * @return {Object} The frozen observation.
 */
function shapeAuthorityObservation(group, read) {
  const {status, readyHeld} = read;
  const turnPending = group.tail !== null;
  const role = ROLE[status.raftState];
  const ownTermApplied = currentTermApplied(status, group.appliedTerm);
  const settled = !turnPending && !readyHeld;
  const unsettledReason = role !== ROLE_LEADER ? null :
    leaderUnsettledReason(group, {status, ownTermApplied, settled});
  const roleSettled = unsettledReason === null;
  const leaderPeerId = status.lead === NO_LEADER ? null : String(status.lead);
  return deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    groupId: group.groupId,
    replicaIdentity: group.replicaIdentity,
    peerId: group.peerId,
    settled,
    turnPending,
    readyHeld,
    inboundQueued: group.inbound.length,
    tickBacklog: group.queuedTicks,
    role: roleSettled ? role : RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
    unsettledReason,
    term: Number(status.term),
    leaderPeerId: roleSettled ? leaderPeerId :
      RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED,
    commitIndex: Number(status.commit),
    appliedIndex: participationObservation(group.gate, group.appliedIndex)
      .appliedIndex,
    appliedTerm: Number(group.appliedTerm),
    currentTermApplied: roleSettled && ownTermApplied,
    lifecycleIncarnation: group.lifecycleIncarnation,
    runtimeGeneration: read.runtimeGeneration,
    runtimeHealth: read.runtimeHealth,
    groupHealth: group.health,
  });
}

/**
 * One group's current authority observation. A runtime or group that cannot
 * be read answers the hold it stands in, as the runtime owner names it,
 * without starting the work that ends it.
 * @param {Object} group - The runtime group.
 * @param {Object} runtime - The runtime owner's {runtimeHealth,
 *   runtimeGeneration, invokeCoreAt, runtimeRecoveryOutcome,
 *   recoveryOutcome}.
 * @return {Object} The frozen observation, or the typed hold.
 */
function observeCurrentAuthority(group, runtime) {
  const {runtimeHealth, runtimeGeneration, invokeCoreAt} = runtime;
  if (runtimeHealth !== HEALTHY) return runtime.runtimeRecoveryOutcome(group);
  if (group.reseedHold !== null) return group.reseedHold;
  if (group.health === RECOVERY_REQUIRED) {
    return runtime.recoveryOutcome(group, RUNTIME_REASON.RECOVERY_DEFERRED);
  }
  const status = invokeCoreAt(group, runtimeGeneration, CORE_STATUS);
  if (!status.ok) return status.result;
  const readyHeld = invokeCoreAt(group, runtimeGeneration, CORE_HAS_READY);
  if (!readyHeld.ok) return readyHeld.result;
  return shapeAuthorityObservation(group, {status: status.value,
    readyHeld: readyHeld.value, runtimeHealth, runtimeGeneration});
}

export {countedTick, observeCurrentAuthority};
