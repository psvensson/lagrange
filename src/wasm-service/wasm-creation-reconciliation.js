// Event admission belongs to the existing WASM lifecycle. The shared owner-key
// queue schedules work; startReplica/genesis retain all semantic decisions.
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {resolveTimeSource} from '../time/time-source.js';
import {WRITER_REASON} from './wasm-writer-profile.js';

const QUEUE_NAME = 'wasm-creation-reconciliation';
const UNSUBSCRIBE_FAILED = 'WASM creation reconciliation unsubscribe failed';
const STALE_WAKE = Object.freeze({started: false, reason: WRITER_REASON.SHUTDOWN});
const WAKE_EVENTS = Object.freeze([
  RAFT_EVENT.LEADER, RAFT_EVENT.FOLLOWER, RAFT_EVENT.CANDIDATE,
  RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.APPLIED_PROGRESS,
  RAFT_EVENT.MEMBERSHIP_CHANGED, RAFT_EVENT.GATE_OPENED,
]);

function isCurrent(entry) {
  const {owner, replica, port, creation} = entry;
  return entry.active && !owner.consensusClosing &&
    owner.ownsInitializedReplica(replica.serviceDefinitionId, replica) &&
    replica.raft === port && replica.consensusCreation === creation;
}

function runReconciliation(entry) {
  if (!isCurrent(entry)) return STALE_WAKE;
  // Publish custody before invoking any reentrant collaborator. Queue admission
  // already happened outside the native event stack; this is not a retry loop.
  const flight = Promise.resolve().then(async () => {
    if (!isCurrent(entry)) return STALE_WAKE;
    const result = await entry.owner.startReplica(entry.replica.serviceDefinitionId,
      entry.startOptions);
    return isCurrent(entry) ? result : STALE_WAKE;
  });
  entry.flight = flight;
  return flight.finally(() => {
    if (entry.flight === flight) entry.flight = null;
  });
}

function createWasmCreationReconcileQueue(owner) {
  const clock = resolveTimeSource(owner.dependencies);
  return new OwnerKeyReconcileQueue({name: QUEUE_NAME, now: () => clock.now(),
    reconcileFn: (_key, _reasons, entry) => runReconciliation(entry)});
}

/** Cancel future wakes; actual active work is joined by replica retirement. */
function stopWasmCreationReconciliation(replica) {
  const entry = replica.consensusReconciliation;
  if (!entry?.active) return;
  entry.active = false;
  // An old stop cannot discard a new instance's work at the same logical key.
  if (entry.owner.activeReplicas.get(replica.serviceDefinitionId) === replica) {
    entry.owner.creationReconcileQueue.discard(replica.replicaId);
  }
  const cleanupErrors = [];
  for (const unsubscribe of entry.unsubscribers) {
    try {
      unsubscribe();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  entry.unsubscribers.length = 0;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, UNSUBSCRIBE_FAILED);
}

/** Subscribe once per exact native lifetime, then let the initial START check
 * cover any event that preceded registration. Payloads never supply evidence. */
function bindWasmCreationReconciliation(owner, replica, startOptions) {
  const previous = replica.consensusReconciliation;
  if (previous?.active && previous.port === replica.raft) return;
  stopWasmCreationReconciliation(replica);
  const entry = {owner, replica, port: replica.raft, creation: replica.consensusCreation,
    active: true, flight: null, unsubscribers: [],
    startOptions: Object.freeze({handlerFunctionId: startOptions.handlerFunctionId,
      moduleVersion: startOptions.moduleVersion})};
  replica.consensusReconciliation = entry;
  try {
    for (const event of WAKE_EVENTS) {
      const wake = () => {
        if (event === RAFT_EVENT.APPLIED_PROGRESS) return;
        if (isCurrent(entry)) owner.creationReconcileQueue.enqueue(replica.replicaId, event, entry);
      };
      entry.unsubscribers.push(entry.port.subscribe(event, wake));
    }
  } catch (error) {
    try {
      stopWasmCreationReconciliation(replica);
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], UNSUBSCRIBE_FAILED);
    }
    throw error;
  }
}

export {createWasmCreationReconcileQueue, bindWasmCreationReconciliation,
  stopWasmCreationReconciliation};
