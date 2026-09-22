import {resolveTimeSource} from '../time/time-source.js';
import {createRaftOperationPort, deepFreeze} from './raft-operation-port.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_OPERATION,
} from './raft-operation-port-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  './raft-provider-contract-constants.js';
import {RaftRsPeerIdentityRegistry} from './raft-rs-peer-identity.js';
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

function bytesOf(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }
  return new Uint8Array(Buffer.from(JSON.stringify(value)));
}

function tickIntervalOf(timing) {
  if (Number.isFinite(timing.tickIntervalMs) && timing.tickIntervalMs > 0) {
    return timing.tickIntervalMs;
  }
  return Math.max(1, Math.floor(
    timing.heartbeatMs / HEARTBEAT_TICK_DIVISOR));
}

function normalizedConfChange(change, registry) {
  if (Array.isArray(change?.changes)) {
    return deepFreeze({...change, changes: change.changes.map((item) =>
      deepFreeze({...item}))});
  }
  const changeType = {
    [RAFT_MEMBERSHIP_OPERATION.ADD_PEER]: 0,
    [RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER]: 1,
    [RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER]: 2,
  }[change?.type];
  const nodeId = registry.raftPeerIdOf(change?.replicaIdentity);
  if (changeType === undefined || nodeId === null) {
    return null;
  }
  return deepFreeze({
    transition: 0,
    changes: [deepFreeze({changeType, nodeId})],
  });
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
  const dispatcher = lifecycle.active ? createRuntimeDispatcher({
    database,
    groupId,
    replicaIdentity,
    peerId,
    voters,
    timing,
    sendToPeer: required(
      request, RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER),
    resolvePeerAddress: (raftPeerId) => {
      const identity = registry.replicaIdentityOf(raftPeerId);
      if (identity === null) {
        throw new Error(`unknown raft-rs peer identity ${raftPeerId}`);
      }
      return resolvePeerAddress(identity);
    },
    resolvePeerIdentity: (raftPeerId) => {
      const identity = registry.replicaIdentityOf(raftPeerId);
      if (identity === null) {
        throw new Error(`unknown raft-rs peer identity ${raftPeerId}`);
      }
      return identity;
    },
    applyCommittedEntry: required(
      request, RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY),
    applyTransactionRolledBack:
      request[RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK],
    emit,
  }) : null;
  const timers = resolveTimeSource(
    request[RAFT_PARTITION_NODE_REQUEST.SUBSTRATE] || {});
  let tickIntervalMs = tickIntervalOf(timing);
  let timer = null;
  let closed = false;

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
    propose: (value) => execute({type: 'propose', bytes: bytesOf(value)}),
    proposeConfChange: (change) => lifecycle.execute(() => {
      if (closed || dispatcher === null) {
        return deepFreeze({outcome: CORE_REFUSED, reason: 'closed'});
      }
      const normalized = normalizedConfChange(change, registry);
      return normalized === null ? deepFreeze({
        outcome: CORE_REFUSED,
        reason: 'unknown-membership-change',
        phase: 'membership-admission',
        retryable: false,
        recoveryRequired: false,
      }) : dispatcher.execute({
        type: 'propose-conf-change', change: normalized,
      });
    }),
    probePeerProgress: (peerAddress) => lifecycle.execute(async () => {
      if (closed || dispatcher === null) {
        return deepFreeze({outcome: CORE_REFUSED, reason: 'closed'});
      }
      const status = await Promise.resolve(
        dispatcher.execute({type: 'read-status'}),
      );
      if (status?.outcome !== CORE_OK) {
        return status;
      }
      const matchIndex = status?.followerProgress?.[peerAddress];
      if (Number.isFinite(matchIndex)) {
        return coreOk('progress-observed', {matchIndex});
      }
      return dispatcher.execute({type: 'tick'});
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
