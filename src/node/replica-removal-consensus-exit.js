/**
 * Owner contract:
 * Owner: when a replica being removed leaves consensus (owner ruling F2,
 * 2026-09-26). One rule for every removal, REMOVE and REPLACE alike: a
 * replica being removed keeps participating in consensus - stepping, acking,
 * voting - until the committed configuration no longer names it, and only
 * then may its port retire. Its own RemoveNode commits in a configuration
 * that still counts it (in a two-voter group it cannot commit without its
 * ack), so a port retired earlier can cost the group its quorum.
 * Inputs: the replica's tracked partition service (its operation port: the
 * MEMBERSHIP_CHANGED and GATE_OPENED events and the committed-membership
 * witness read) and its replica identity.
 * Canonical output: a frozen {reason} (REPLICA_CONSENSUS_EXIT_REASON) once
 * the port may retire:
 *   REMOVAL_APPLIED    the replica's own applied configuration no longer
 *                      names it, read after its participation gate opened
 *                      (below the gate its absence is a lag, not a removal);
 *   GROUP_UNAVAILABLE  the port answers typed that the group is not
 *                      available to it (held, closed, retired);
 *   NO_CONSENSUS_PORT  the service has no port (no events) to participate
 *                      through;
 *   BACKSTOP           the bounded wait elapsed (a removal nobody proposed,
 *                      or an applied removal this replica never learned):
 *                      an ALARM, never a normal exit (owner decision
 *                      2026-10-04); the answer carries the last witness read
 *                      (lastObservation) and the caller logs it at ERROR;
 *   RELEASED           the caller released the wait (node shutdown);
 *   GROUP_RETIRED      never produced by this wait: the exit of a replica
 *                      whose whole group retired as a unit at a verified
 *                      durable workflow transition (amendment of ruling F2,
 *                      owner decision 2026-10-04; the caller never waits).
 * Prohibited: no services row is read as membership, and no removal kind is
 * told apart from another (a group retired as a unit never enters the wait).
 */
import {PARTITION_REPLICA_MEMBERSHIP_STATE} from
  '../partition/partition-replica-membership-constants.js';
import {readPartitionReplicaMembership} from
  '../partition/partition-service-raft-membership-administration.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {GROUP_RETIREMENT_REASON} from
  '../partition/group-retirement-evidence.js';

const REPLICA_CONSENSUS_EXIT_REASON = Object.freeze({
  REMOVAL_APPLIED: 'own-removal-applied',
  GROUP_UNAVAILABLE: 'consensus-group-unavailable',
  NO_CONSENSUS_PORT: 'no-consensus-port',
  BACKSTOP: 'removal-commit-backstop-elapsed',
  RELEASED: 'consensus-exit-wait-released',
  GROUP_RETIRED: GROUP_RETIREMENT_REASON,
});
// The events after which the replica's own configuration may no longer name
// it: an applied configuration change, and its gate opening (the read below
// the gate never counts an absence).
const EXIT_WAKE_EVENTS = Object.freeze([
  RAFT_EVENT.MEMBERSHIP_CHANGED,
  RAFT_EVENT.GATE_OPENED,
]);
const FUNCTION_TYPE = 'function';
const ABORT_EVENT = 'abort';

/**
 * The exit one witness read of the replica's own configuration allows, or
 * null while the replica must keep participating.
 * @param {Object} observation - readPartitionReplicaMembership's answer.
 * @return {string|null} A REPLICA_CONSENSUS_EXIT_REASON, or null.
 */
function consensusExitOf(observation) {
  if (observation.state === PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE) {
    return REPLICA_CONSENSUS_EXIT_REASON.GROUP_UNAVAILABLE;
  }
  if (observation.state === PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER ||
      observation.gateOpen !== true) {
    return null;
  }
  return REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED;
}

/**
 * Wait until the replica being removed may retire its port.
 * @param {Object|null} service - The replica's tracked partition service.
 * @param {Object} options
 * @param {string} options.replicaId - The replica being removed.
 * @param {number} options.backstopMs - The bound on the wait.
 * @param {AbortSignal} [options.signal] - Releases the wait.
 * @return {Promise<Object>} Frozen {reason}.
 */
function awaitReplicaConsensusExit(service, {replicaId, backstopMs, signal}) {
  // The read itself goes through the partition's one witness read (which
  // answers UNAVAILABLE for a port without the committed read).
  const port = service?.raft;
  if (typeof port?.subscribe !== FUNCTION_TYPE) {
    return Promise.resolve(Object.freeze({
      reason: REPLICA_CONSENSUS_EXIT_REASON.NO_CONSENSUS_PORT}));
  }
  return new Promise((resolve) => {
    let settled = false;
    const unsubscribers = [];
    let timer = null;
    // The last witness read: on BACKSTOP it says why no exit event came.
    let lastObservation = null;
    const onAbort = () => finish(REPLICA_CONSENSUS_EXIT_REASON.RELEASED);
    function finish(reason) {
      if (settled) {
        return;
      }
      settled = true;
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      clearTimeout(timer);
      signal?.removeEventListener?.(ABORT_EVENT, onAbort);
      resolve(Object.freeze(reason === REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP ?
        {reason, lastObservation} : {reason}));
    }
    // A read outside the port's own drain (never re-entered from inside the
    // event that woke it); a read that throws means the port cannot answer.
    const check = () => queueMicrotask(() => {
      if (settled) {
        return;
      }
      readPartitionReplicaMembership(service, replicaId).then(
        (observation) => {
          lastObservation = Object.freeze({state: observation?.state ?? null,
            gateOpen: observation?.gateOpen ?? null});
          const reason = consensusExitOf(observation);
          if (reason !== null) {
            finish(reason);
          }
        },
        () => finish(REPLICA_CONSENSUS_EXIT_REASON.GROUP_UNAVAILABLE));
    });
    if (signal?.aborted) {
      finish(REPLICA_CONSENSUS_EXIT_REASON.RELEASED);
      return;
    }
    signal?.addEventListener?.(ABORT_EVENT, onAbort, {once: true});
    for (const eventName of EXIT_WAKE_EVENTS) {
      const unsubscribe = port.subscribe(eventName, check);
      if (typeof unsubscribe === FUNCTION_TYPE) {
        unsubscribers.push(unsubscribe);
      }
    }
    timer = setTimeout(
      () => finish(REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP), backstopMs);
    timer.unref?.();
    check();
  });
}

export {REPLICA_CONSENSUS_EXIT_REASON, awaitReplicaConsensusExit};
