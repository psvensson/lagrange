import {resolveTimeSource} from '../time/time-source.js';
import {
  runRaftApplySlice,
  runRaftProtocolActivity,
} from '../diagnostics/raft-formation-attribution.js';
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
import {RAFT_RS_CONF_CHANGE_TYPE} from './raft-rs-ready-loop-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  './raft-operation-port-request.js';
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
import {normalizeMembershipTransition} from
  './raft-rs-membership-transition.js';
import {
  RaftRsReplicaLifecycleOwner,
  registerRuntimeLifecycle,
  unregisterRuntimeLifecycle,
} from './raft-rs-replica-lifecycle-owner.js';
import {registerPeerIdentityReservationOwner} from
  './raft-rs-membership-administration.js';
import {reportRaftRsRuntimeFault} from './raft-rs-runtime-fault-log.js';
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
  const groupId = required(request, RAFT_OPERATION_PORT_REQUEST.GROUP_ID);
  const replicaIdentity = required(
    request, RAFT_OPERATION_PORT_REQUEST.PEER_ID);
  const database = required(
    request, RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE);
  const timing = required(request, RAFT_OPERATION_PORT_REQUEST.TIMING);
  const resolvePeerAddress = required(
    request, RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS);
  const registry = new RaftRsPeerIdentityRegistry(database);
  const peerId = registry.registerReplica(replicaIdentity);
  // The bootstrap peer ids are address hints: each is reserved so the
  // replica can name and reach it. The configuration the group opens from is
  // the bootstrap membership's alone (an absent one is refused typed).
  const bootstrapPeerIds = required(
    request, RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS);
  for (const identity of bootstrapPeerIds) {
    registry.registerReplica(identity);
  }
  const bootstrap = bootstrapOfRequest({
    membership: request[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP],
    registry,
    peerId,
    joiningExistingGroup:
      request[RAFT_OPERATION_PORT_REQUEST.JOINING_EXISTING_GROUP],
    identityExisted: request[RAFT_OPERATION_PORT_REQUEST.IDENTITY_EXISTED],
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
  const emit = (eventName, ...args) => {
    for (const listener of listeners.get(eventName) || []) {
      listener(...args.map((value) => deepFreeze(value)));
    }
  };
  const identityRecorded =
    request[RAFT_OPERATION_PORT_REQUEST.IDENTITY_RECORDED];
  const identityRecordPending = typeof identityRecorded?.then === 'function';
  const timers = resolveTimeSource(
    request[RAFT_OPERATION_PORT_REQUEST.SUBSTRATE] || {});
  let tickIntervalMs = tickIntervalOf(timing);
  let timer = null;
  let closed = false;
  const dispatcher = lifecycle.active ? createRuntimeDispatcher({
    database,
    groupId,
    replicaIdentity,
    lifecycleIncarnation: lifecycle.incarnation,
    peerId,
    bootstrap,
    identityRecordPending,
    timing,
    timers,
    sendToPeer: required(
      request, RAFT_OPERATION_PORT_REQUEST.SEND_TO_PEER),
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
      request, RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY)),
    applyTransactionRolledBack:
      request[RAFT_OPERATION_PORT_REQUEST.APPLY_TRANSACTION_ROLLED_BACK],
    // Each committed entry's whole SQLite commit+apply transaction is the
    // formation-attribution apply slice; injected, so the runtime owner's
    // import closure stays free of diagnostics (restore-path fence).
    runApplySlice: runRaftApplySlice,
    // A core entry the runtime schedules itself (the drain of delivered
    // inbound) is admitted by this replica's lifecycle owner like every
    // operation the port is asked for, inside the same containment.
    admitScheduledEntry: (work) => protocolTurn(work),
    holdForReseed: () => holdForReseed(),
    reportFault: reportRaftRsRuntimeFault,
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
  // A protocol turn (tick, delivered envelope, inbound drain, proposal,
  // campaign, transfer, probe) is consensus protocol work for formation
  // attribution; status and membership reads stay with their caller.
  function protocolTurn(work) {
    return runRaftProtocolActivity(() => dispatch(work));
  }
  const execute = (command) => dispatch(() => dispatcher.execute(command));
  const executeTurn = (command) =>
    protocolTurn(() => dispatcher.execute(command));
  const enqueueStep = (envelope) =>
    protocolTurn(() => dispatcher.enqueueStep(envelope));
  function clearTickTimer() {
    if (timer !== null) {
      timers.clearInterval(timer);
      timer = null;
    }
  }
  const stopScheduling = () => {
    clearTickTimer();
    return coreOk('scheduling-stopped');
  };
  // A group whose own history was proven lost - by the local-log guard, or
  // at its opening by the open-time rule - is held for a reseed by its
  // lifecycle owner (durable, survives a restart) and its ticks stop.
  function holdForReseed() {
    clearTickTimer();
    return lifecycle.holdForReseed();
  }
  // The scheduled tick is a contained port operation: it answers typed and
  // never throws into its timer.
  const scheduleTicks = () => {
    stopScheduling();
    timer = timers.setInterval(() => executeTurn({type: 'tick'}),
      tickIntervalMs);
    timer.unref?.();
  };
  // Scheduling ticks the group from the moment it is asked for, whether or
  // not the participation gate is open: the gate (O1) is enforced where a
  // tick could campaign - the runtime owner enters the core with a gated
  // group's tick only while its core is not promotable (a learner), which
  // raft-rs never campaigns - so a gated replica's election timer, and the
  // check-quorum lease it bounds, keeps running instead of freezing.
  const startScheduling = () => dispatch(() => {
    scheduleTicks();
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
    propose: (value) => executeTurn({
      type: 'propose', bytes: encodeProposal(value),
    }),
    proposeConfChange: (change) => protocolTurn(() => {
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
    transferLeadership: (transferRequest) => protocolTurn(() => {
      const normalized = normalizedTransferRequest(transferRequest, registry);
      return normalized.refusal === undefined ? dispatcher.execute({
        type: RUNTIME_COMMAND.TRANSFER_LEADERSHIP,
        transfer: normalized.command,
      }) : normalized.refusal;
    }),
    probePeerProgress: (peerAddress) => executeTurn({
      type: RUNTIME_COMMAND.PROBE_PEER_PROGRESS, peerAddress,
    }),
    tick: () => executeTurn({type: 'tick'}),
    campaign: () => executeTurn({type: 'campaign'}),
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
    [RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION]: (request) =>
      protocolTurn(() => {
        const normalized = normalizeMembershipTransition(request, registry);
        return normalized.refusal ?? dispatcher.execute({
          type: RUNTIME_COMMAND.PROPOSE_MEMBERSHIP_TRANSITION,
          transition: normalized.command,
        });
      }),
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
      unregisterRuntimeLifecycle(port, lifecycle);
      unregisterMembershipOwner();
      return result;
    },
  });
  registerRuntimeLifecycle(port, lifecycle);
  // The release of a pending identity record is its acknowledgement alone:
  // resolved, the gate may open; rejected (the fact never became durable),
  // nothing is released and the host closes the port.
  if (identityRecordPending && dispatcher !== null) {
    Promise.resolve(identityRecorded).then(
      () => dispatch(() => dispatcher.recordIdentity()),
      () => undefined).catch(() => undefined);
  }
  if (request[RAFT_OPERATION_PORT_REQUEST.DEFER_ELECTION] !== true &&
      lifecycle.active) {
    startScheduling();
  }
  return port;
}

// The runtime owner is private to this constructor (the operation-boundary
// audit), so the binding verdict a dry run reports is passed through here: a
// digest and load check that returns a state and never dispatches.
export {createRaftRsOperationPort, verifyRaftRsBinding};
