import {resolveTimeSource} from '../time/time-source.js';
import {createRaftOperationPort, deepFreeze} from './raft-operation-port.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION,
} from './raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from './raft-committed-membership-constants.js';
import {bootstrapOfRequest} from './raft-rs-bootstrap-membership.js';
import {committedMembershipRefusal} from
  './raft-rs-committed-membership-read.js';
import {participationGateClosed} from './raft-rs-participation-gate.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from './raft-rs-ready-loop-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  './raft-provider-contract-constants.js';
import {RaftRsPeerIdentityRegistry} from './raft-rs-peer-identity.js';
import {
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';
import {
  RUNTIME_COMMAND,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';
import {
  decodeCommittedProposal,
  encodeProposal,
} from './raft-rs-proposal-codec.js';
import {normalizedTransferRequest} from './raft-rs-leadership-transfer.js';
import {RaftRsReplicaLifecycleOwner} from
  './raft-rs-replica-lifecycle-owner.js';
import {registerPeerIdentityReservationOwner} from
  './raft-rs-membership-administration.js';
import {
  CORE_OK,
  CORE_REFUSED,
  createRuntimeDispatcher,
  verifyRaftRsBinding,
} from './raft-rs-runtime-owner.js';

const EVENTS = new Set([
  RAFT_EVENT.LEADER,
  RAFT_EVENT.FOLLOWER,
  RAFT_EVENT.CANDIDATE,
  RAFT_EVENT.COMMIT,
  RAFT_EVENT.LEADER_CHANGE,
  RAFT_EVENT.TERM_CHANGE,
  RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE,
  RAFT_EVENT.MEMBERSHIP_CHANGED,
  RAFT_EVENT.GATE_OPENED,
  RAFT_EVENT.CONF_CHANGE_APPLIED,
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

// The one containment boundary between the runtime owner and every caller of
// a port - the partition, and the port's own timers: a throw the runtime owner
// did not type (synchronously, or as the rejection of the work it returned)
// becomes that group's typed host failure, recorded by the runtime owner, so
// nothing is rethrown into a caller or a timer.
function containRuntimeThrow(dispatcher, work) {
  let result;
  try {
    result = work();
  } catch (error) {
    return dispatcher.containUnexpectedThrow(error);
  }
  return result && typeof result.then === 'function' ?
    result.then(undefined, dispatcher.containUnexpectedThrow) : result;
}

// {change} in the core's ConfChangeV2 shape, or {refusal} naming how the
// request missed the canonical {type, replicaIdentity} shape.
function normalizedConfChange(change, registry) {
  if (Array.isArray(change?.changes)) {
    return {change: deepFreeze({...change, changes: change.changes.map(
      (item) => deepFreeze({...item}))})};
  }
  const changeType = {
    [RAFT_MEMBERSHIP_OPERATION.ADD_PEER]: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
    [RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER]:
      RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE,
    [RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER]:
      RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
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
  // The bootstrap peer ids are address hints: each is reserved so the
  // replica can name and reach it. The configuration the group opens from is
  // the bootstrap membership's alone (an absent one is refused typed).
  const bootstrapPeerIds = required(
    request, RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS);
  for (const identity of bootstrapPeerIds) {
    registry.registerReplica(identity);
  }
  const bootstrap = bootstrapOfRequest({
    membership: request[RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_MEMBERSHIP],
    registry,
    peerId,
  });
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
  let schedulingRequested = false;
  const emit = (eventName, ...args) => {
    rearmOnGateOpened(eventName);
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
    bootstrap,
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
    // operation the port is asked for, inside the same containment.
    admitScheduledEntry: (work) => dispatch(work),
    emit,
  }) : null;

  // Every entry into the runtime: admitted by the lifecycle owner, refused
  // once the port is closed, and contained (containRuntimeThrow).
  function dispatch(work) {
    return lifecycle.execute(() => {
      if (closed || dispatcher === null) {
        return deepFreeze({
          outcome: CORE_REFUSED, reason: RUNTIME_REASON.CLOSED});
      }
      return containRuntimeThrow(dispatcher, work);
    });
  }
  const execute = (command) => dispatch(() => dispatcher.execute(command));
  const enqueueStep = (envelope) =>
    dispatch(() => dispatcher.enqueueStep(envelope));
  const stopScheduling = () => {
    schedulingRequested = false;
    if (timer !== null) {
      timers.clearInterval(timer);
      timer = null;
    }
    return coreOk('scheduling-stopped');
  };
  // The scheduled tick is a contained port operation: it answers typed and
  // never throws into its timer.
  const scheduleTicks = () => {
    stopScheduling();
    timer = timers.setInterval(() => execute({type: 'tick'}), tickIntervalMs);
    timer.unref?.();
  };
  // Scheduling starts only while the participation gate is open (O1 gate):
  // asked while it is closed, the start is refused typed and remembered, and
  // the runtime owner's GATE_OPENED re-arms it in the drain that opened the
  // gate.
  const startScheduling = () => dispatch(() => {
    if (!dispatcher.participationGateOpen()) {
      schedulingRequested = true;
      return participationGateClosed();
    }
    scheduleTicks();
    return coreOk('scheduling-started');
  });
  function rearmOnGateOpened(eventName) {
    if (eventName === RAFT_EVENT.GATE_OPENED && schedulingRequested &&
        !closed) {
      schedulingRequested = false;
      scheduleTicks();
    }
  }
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
    proposeConfChange: (change) => dispatch(() => {
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
    // One named request shape ({successor, replicaIdentity?}); the target
    // is resolved through this replica's own registry, and a request that
    // misses the shape or names an unreserved identity is refused typed.
    transferLeadership: (transferRequest) => dispatch(() => {
      const normalized = normalizedTransferRequest(transferRequest, registry);
      return normalized.refusal === undefined ? dispatcher.execute({
        type: RUNTIME_COMMAND.TRANSFER_LEADERSHIP,
        transfer: normalized.command,
      }) : normalized.refusal;
    }),
    probePeerProgress: (peerAddress) => execute({
      type: RUNTIME_COMMAND.PROBE_PEER_PROGRESS, peerAddress,
    }),
    tick: () => execute({type: 'tick'}),
    campaign: () => execute({type: 'campaign'}),
    readStatus: () => execute({type: 'read-status'}),
    // The committed configuration as frozen data ({purpose} is a
    // COMMITTED_MEMBERSHIP_READ_PURPOSE; a bootstrap read by default).
    [RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]: (readRequest) => {
      const answered = execute({
        type: RUNTIME_COMMAND.READ_COMMITTED_MEMBERSHIP,
        purpose: readRequest?.purpose ??
          COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
      });
      return answered?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ||
        answered?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED ?
        answered :
        committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.HELD);
    },
    configureTick: (nextTiming) => dispatch(() => {
      const command = typeof nextTiming === 'number' ?
        {tickIntervalMs: nextTiming} : nextTiming;
      const wasScheduling = timer !== null;
      if (Number.isFinite(command?.tickIntervalMs) &&
          command.tickIntervalMs > 0) {
        tickIntervalMs = command.tickIntervalMs;
      }
      dispatcher.configureTiming(command || {});
      if (wasScheduling) {
        scheduleTicks();
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

// The runtime owner is private to this constructor (the operation-boundary
// audit), so the binding verdict a dry run reports is passed through here: a
// digest and load check that returns a state and never dispatches.
export {createRaftRsOperationPort, verifyRaftRsBinding};
