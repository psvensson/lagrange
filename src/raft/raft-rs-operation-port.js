import {resolveTimeSource} from '../time/time-source.js';
import {createRaftOperationPort, deepFreeze} from './raft-operation-port.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
} from './raft-operation-port-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  './raft-provider-contract-constants.js';
import {RaftRsPeerIdentityRegistry} from './raft-rs-peer-identity.js';
import {
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';
import {RUNTIME_COMMAND} from './raft-rs-runtime-owner-constants.js';
import {
  decodeCommittedProposal,
  encodeProposal,
} from './raft-rs-proposal-codec.js';
import {RaftRsReplicaLifecycleOwner} from
  './raft-rs-replica-lifecycle-owner.js';
import {registerPeerIdentityReservationOwner} from
  './raft-rs-membership-administration.js';
import {
  CORE_OK,
  CORE_REFUSED,
  createRuntimeDispatcher,
} from './raft-rs-runtime-owner.js';

const EVENTS = new Set([
  RAFT_EVENT.LEADER,
  RAFT_EVENT.FOLLOWER,
  RAFT_EVENT.CANDIDATE,
  RAFT_EVENT.COMMIT,
  RAFT_EVENT.LEADER_CHANGE,
  RAFT_EVENT.TERM_CHANGE,
  RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE,
]);
const EVENT_ALIAS = Object.freeze({
  'term-change': RAFT_EVENT.TERM_CHANGE,
  'leader-change': RAFT_EVENT.LEADER_CHANGE,
});
const HEARTBEAT_TICK_DIVISOR = 3;

function required(request, field) {
  const value = request?.[field];
  if (value === undefined || value === null) {
    throw new Error(`raft-rs partition request is missing ${field}`);
  }
  return value;
}

function coreOk(reason, fields = {}) {
  return deepFreeze({outcome: CORE_OK, reason, ...fields});
}

// The partition's application receives one frozen committed record: the
// command the port encoded, decoded by the same codec, and the entry's
// position and deferred-effect bag the runtime hands the application.
function committedEntryApplication(applyCommittedEntry) {
  return (bytes, {index, term, effects}) => applyCommittedEntry(Object.freeze({
    command: decodeCommittedProposal(bytes),
    index: Number(index),
    term: Number(term),
    effects,
  }));
}

function tickIntervalOf(timing) {
  if (Number.isFinite(timing.tickIntervalMs) && timing.tickIntervalMs > 0) {
    return timing.tickIntervalMs;
  }
  return Math.max(1, Math.floor(
    timing.heartbeatMs / HEARTBEAT_TICK_DIVISOR));
}

// {change} in the core's ConfChangeV2 shape, or {refusal} naming how the
// request missed the canonical {type, replicaIdentity} shape.
function normalizedConfChange(change, registry) {
  if (Array.isArray(change?.changes)) {
    return {change: deepFreeze({...change, changes: change.changes.map(
      (item) => deepFreeze({...item}))})};
  }
  const changeType = {
    [RAFT_MEMBERSHIP_OPERATION.ADD_PEER]: 0,
    [RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER]: 1,
    [RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER]: 2,
  }[change?.type];
  if (changeType === undefined) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.UNKNOWN_OPERATION};
  }
  if (typeof change.replicaIdentity !== 'string' ||
      change.replicaIdentity.length === 0) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_REPLICA_IDENTITY};
  }
  const nodeId = registry.raftPeerIdOf(change.replicaIdentity);
  if (nodeId === null) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED};
  }
  return {change: deepFreeze({
    transition: 0,
    changes: [deepFreeze({changeType, nodeId})],
  })};
}

function createRaftRsOperationPort(request) {
  const groupId = required(request, RAFT_PARTITION_NODE_REQUEST.GROUP_ID);
  const replicaIdentity = required(
    request, RAFT_PARTITION_NODE_REQUEST.PEER_ID);
  const database = required(
    request, RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE);
  const timing = required(request, RAFT_PARTITION_NODE_REQUEST.TIMING);
  const resolvePeerAddress = required(
    request, RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS);
  const registry = new RaftRsPeerIdentityRegistry(database);
  const peerId = registry.registerReplica(replicaIdentity);
  const voters = required(
    request, RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS)
    .map((identity) => registry.registerReplica(identity));
  const lifecycle = new RaftRsReplicaLifecycleOwner({
    db: database, groupId, peerId, replicaIdentity,
  });
  const unregisterMembershipOwner = registerPeerIdentityReservationOwner({
    groupId,
    localReplicaIdentity: replicaIdentity,
    reserve: (joiningReplicaIdentity) =>
      registry.registerReplica(joiningReplicaIdentity),
  });
  const listeners = new Map();
  const emit = (eventName, ...args) => {
    for (const listener of listeners.get(eventName) || []) {
      listener(...args.map((value) => deepFreeze(value)));
    }
  };
  const timers = resolveTimeSource(
    request[RAFT_PARTITION_NODE_REQUEST.SUBSTRATE] || {});
  let tickIntervalMs = tickIntervalOf(timing);
  let timer = null;
  let closed = false;
  const dispatcher = lifecycle.active ? createRuntimeDispatcher({
    database,
    groupId,
    replicaIdentity,
    peerId,
    voters,
    timing,
    timers,
    sendToPeer: required(
      request, RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER),
    // An address exists only for a reserved identity; the runtime records
    // an unreserved peer's delivery as that peer's own outcome.
    resolvePeerAddress: (raftPeerId) => {
      const identity = registry.resolveReplicaIdentity(raftPeerId);
      if (identity.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED) {
        throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.unreserved(raftPeerId));
      }
      return resolvePeerAddress(identity.replicaIdentity);
    },
    resolvePeerIdentity: (raftPeerId) =>
      registry.resolveReplicaIdentity(raftPeerId),
    applyCommittedEntry: committedEntryApplication(required(
      request, RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY)),
    applyTransactionRolledBack:
      request[RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK],
    // A core entry the runtime schedules itself (the drain of delivered
    // inbound) is admitted by this replica's lifecycle owner like every
    // operation the port is asked for.
    admitScheduledEntry: (work) => lifecycle.execute(() => (closed ?
      deepFreeze({outcome: CORE_REFUSED, reason: 'closed'}) : work())),
    emit,
  }) : null;

  const execute = (command) => lifecycle.execute(() => {
    if (closed || dispatcher === null) {
      return deepFreeze({outcome: CORE_REFUSED, reason: 'closed'});
    }
    return dispatcher.execute(command);
  });
  const enqueueStep = (envelope) => lifecycle.execute(() => {
    if (closed || dispatcher === null) {
      return deepFreeze({outcome: CORE_REFUSED, reason: 'closed'});
    }
    return dispatcher.enqueueStep(envelope);
  });
  const stopScheduling = () => {
    if (timer !== null) {
      timers.clearInterval(timer);
      timer = null;
    }
    return coreOk('scheduling-stopped');
  };
  const startScheduling = () => lifecycle.execute(() => {
    if (closed || dispatcher === null) {
      return deepFreeze({outcome: CORE_REFUSED, reason: 'closed'});
    }
    stopScheduling();
    timer = timers.setInterval(() => {
      const result = execute({type: 'tick'});
      if (result && typeof result.catch === 'function') {
        result.catch(() => undefined);
      }
    }, tickIntervalMs);
    timer.unref?.();
    return coreOk('scheduling-started');
  });
  const subscribe = (eventName, listener) => {
    const normalizedEventName = EVENT_ALIAS[eventName] || eventName;
    if (!EVENTS.has(normalizedEventName)) {
      throw new Error(`unknown raft-rs port event ${eventName}`);
    }
    if (typeof listener !== 'function') {
      throw new TypeError('raft-rs port listener must be a function');
    }
    const eventListeners = listeners.get(normalizedEventName) || new Set();
    eventListeners.add(listener);
    listeners.set(normalizedEventName, eventListeners);
    return Object.freeze(() => eventListeners.delete(listener));
  };
  const port = createRaftOperationPort({
    subscribe,
    step: enqueueStep,
    propose: (value) => execute({
      type: 'propose', bytes: encodeProposal(value),
    }),
    proposeConfChange: (change) => lifecycle.execute(() => {
      if (closed || dispatcher === null) {
        return deepFreeze({outcome: CORE_REFUSED, reason: 'closed'});
      }
      const normalized = normalizedConfChange(change, registry);
      return normalized.refusal === undefined ? dispatcher.execute({
        type: 'propose-conf-change', change: normalized.change,
      }) : deepFreeze({
        outcome: CORE_REFUSED,
        reason: normalized.refusal,
        phase: 'membership-admission',
        retryable: false,
        recoveryRequired: false,
      });
    }),
    probePeerProgress: (peerAddress) => execute({
      type: RUNTIME_COMMAND.PROBE_PEER_PROGRESS, peerAddress,
    }),
    tick: () => execute({type: 'tick'}),
    campaign: () => execute({type: 'campaign'}),
    readStatus: () => execute({type: 'read-status'}),
    configureTick: (nextTiming) => lifecycle.execute(() => {
      if (closed || dispatcher === null) {
        return deepFreeze({outcome: CORE_REFUSED, reason: 'closed'});
      }
      const command = typeof nextTiming === 'number' ?
        {tickIntervalMs: nextTiming} : nextTiming;
      const wasScheduling = timer !== null;
      if (Number.isFinite(command?.tickIntervalMs) &&
          command.tickIntervalMs > 0) {
        tickIntervalMs = command.tickIntervalMs;
      }
      dispatcher.configureTiming(command || {});
      if (wasScheduling) {
        stopScheduling();
        timer = timers.setInterval(() => {
          const result = execute({type: 'tick'});
          if (result && typeof result.catch === 'function') {
            result.catch(() => undefined);
          }
        }, tickIntervalMs);
        timer.unref?.();
      }
      return coreOk('timing-configured');
    }),
    startScheduling,
    stopScheduling,
    close: () => {
      if (closed) {
        return coreOk('already-closed');
      }
      closed = true;
      stopScheduling();
      listeners.clear();
      const result = dispatcher === null ?
        coreOk('closed-without-runtime') : lifecycle.active ?
          lifecycle.execute(() => dispatcher.close({enterCore: true})) :
          dispatcher.close({enterCore: false});
      lifecycle.unregister();
      unregisterMembershipOwner();
      return result;
    },
  });
  if (request[RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION] !== true &&
      lifecycle.active) {
    startScheduling();
  }
  return port;
}

export {createRaftRsOperationPort};
