import fs from 'node:fs';
import Database from 'better-sqlite3';
import {REPLICA_DB_PRAGMA} from '../storage/storage-constants.js';
import {LIFECYCLE_BIRTH, LIFECYCLE_ERROR, REPLICA_DATABASE_CREATION} from
  './raft-rs-replica-lifecycle-constants.js';
import {resolveTimeSource} from '../time/time-source.js';
import {
  runRaftApplySlice,
  runRaftProtocolActivity,
} from '../diagnostics/raft-formation-attribution.js';
import {createRaftOperationPort, deepFreeze} from './raft-operation-port.js';
import {
  continueTurn,
  pendingTurn,
  settledTurn,
  turnChainValue,
} from './raft-rs-turn-answer.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
} from './raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from './raft-committed-membership-constants.js';
import {bootstrapOfRequest} from './raft-rs-bootstrap-membership.js';
import {consumeOriginalAllocationOpening} from './raft-rs-original-allocation-preparation.js';
import {captureOriginalRaftRsTiming} from './raft-rs-runtime-tuning.js';
import {committedMembershipRefusal, normalizeCommittedLearnerRead,
  unavailableLearnerAction} from
  './raft-rs-committed-membership-read.js';
import {encodeCommittedAdmissionContext, encodeCommittedLearnerAdmission} from
  './raft-rs-committed-membership-context.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from './raft-rs-ready-loop-constants.js';
import {
  RAFT_COMMITTED_ENTRY_APPLY_MODE,
  RAFT_OPERATION_PORT_REQUEST,
} from './raft-operation-port-request.js';
import {RaftRsPeerIdentityRegistry} from './raft-rs-peer-identity.js';
import {
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';
import {
  RUNTIME_COMMAND,
  RUNTIME_PHASE,
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
  birthReplicaLifecycle,
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

const REPLICA_DATABASE_MEMORY = ':memory:';
const EXCLUSIVE_CREATE_FLAGS = 'wx';
const FILE_EXISTS_CODE = 'EEXIST';

// Acquire a new name exclusively. An existing empty/truncated file is not
// new; inability to acquire or open never authorizes a lifecycle birth.
function acquireReplicaDatabaseFile(dbPath) {
  if (dbPath === REPLICA_DATABASE_MEMORY) return REPLICA_DATABASE_CREATION.NEW;
  try {
    fs.closeSync(fs.openSync(dbPath, EXCLUSIVE_CREATE_FLAGS));
    return REPLICA_DATABASE_CREATION.NEW;
  } catch (error) {
    if (error.code === FILE_EXISTS_CODE) return REPLICA_DATABASE_CREATION.EXISTING;
    throw error;
  }
}

/**
 * Construct storage before application DDL. The service takes custody of the
 * exact native handle synchronously at acquisition, before pragmas or birth.
 * Its existing failed-open cleanup retains that handle if close fails.
 * @param {Object} request - Path, identity, fileMustExist, takeDatabaseCustody.
 * @return {Object} Frozen {db, creation}; custody stays with the named service.
 */
function openRaftRsReplicaDatabase({dbPath, groupId, replicaIdentity,
  fileMustExist = false, takeDatabaseCustody}) {
  if (typeof takeDatabaseCustody !== 'function') {
    throw new TypeError(LIFECYCLE_ERROR.DATABASE_CUSTODY_REQUIRED);
  }
  const creation = fileMustExist ? REPLICA_DATABASE_CREATION.EXISTING :
    acquireReplicaDatabaseFile(dbPath);
  const db = new Database(dbPath, {fileMustExist: dbPath !== REPLICA_DATABASE_MEMORY});
  takeDatabaseCustody(db);
  db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
  const birth = birthReplicaLifecycle({db, groupId, replicaIdentity, creation});
  if (birth === LIFECYCLE_BIRTH.UNPROVEN) {
    throw Object.assign(new Error(birth), {code: birth});
  }
  return Object.freeze({db, creation: birth === LIFECYCLE_BIRTH.BORN ?
    REPLICA_DATABASE_CREATION.NEW : REPLICA_DATABASE_CREATION.EXISTING});
}

const EVENTS = new Set([
  RAFT_EVENT.LEADER,
  RAFT_EVENT.FOLLOWER,
  RAFT_EVENT.CANDIDATE,
  RAFT_EVENT.LEADER_CHANGE,
  RAFT_EVENT.TERM_CHANGE,
  RAFT_EVENT.APPLIED_PROGRESS,
  RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE,
  RAFT_EVENT.MEMBERSHIP_CHANGED,
  RAFT_EVENT.GATE_OPENED,
  RAFT_EVENT.CONF_CHANGE_APPLIED,
  RAFT_EVENT.VOTER_LIVENESS_CHANGED,
]);
const EVENT_ALIAS = Object.freeze({
  'term-change': RAFT_EVENT.TERM_CHANGE,
  'leader-change': RAFT_EVENT.LEADER_CHANGE,
});
const HEARTBEAT_TICK_DIVISOR = 3;
const ALREADY_CLOSED = 'already-closed';
const CLOSED_WITHOUT_RUNTIME = 'closed-without-runtime';

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

// The group's committed-entry application runs inside the SQLite
// transaction that advances the applied state: the group declares it
// synchronous once, here where it registers it, and a missing or other
// declaration refuses the port before anything opens. The refusal runs
// before the original-allocation capability is consumed
// (resolveOriginalNativeEntry), so a refused registration spends no opening.
function requireSynchronousApplication(request) {
  if (request[RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY_MODE] ===
      RAFT_COMMITTED_ENTRY_APPLY_MODE.SYNCHRONOUS) {
    return;
  }
  const refused = deepFreeze({
    outcome: CORE_REFUSED,
    reason: RUNTIME_REASON.COMMITTED_ENTRY_APPLY_MODE_NOT_SYNCHRONOUS,
    phase: RUNTIME_PHASE.PORT_REGISTRATION,
    retryable: false,
    recoveryRequired: false,
  });
  throw Object.assign(new Error(refused.reason), {consensus: refused});
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
// `work` answers the runtime's turn (raft-rs-turn-answer.js); so does the
// containment.
function containRuntimeThrow(dispatcher, work) {
  let turn;
  try {
    turn = work();
  } catch (error) {
    return settledTurn(dispatcher.containUnexpectedThrow(error));
  }
  return turn.settled ? turn : pendingTurn(
    turn.pending.then(undefined, dispatcher.containUnexpectedThrow));
}

const ADMITTING_CHANGE_TYPES = Object.freeze(new Set([
  RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
  RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
]));

// {change} in the core's ConfChangeV2 shape, or {refusal} naming how the
// request missed the canonical {type, replicaIdentity, nodeId?} shape. An ADD
// commits its admission context {replicaIdentity, peerId, nodeId}: the node
// the peer is admitted on is a fact of the committed log, applied by every
// replica, so no replica ever looks the peer's node up elsewhere.
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
  const admits = ADMITTING_CHANGE_TYPES.has(changeType);
  if (admits && (typeof change.nodeId !== 'string' ||
      change.nodeId.length === 0)) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.WITHOUT_NODE_ID};
  }
  const peerId = registry.raftPeerIdOf(change.replicaIdentity);
  if (peerId === null) {
    return {refusal: RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED};
  }
  return {change: deepFreeze({
    transition: 0,
    changes: [deepFreeze({changeType, nodeId: peerId})],
    ...(admits ? {context: encodeCommittedAdmissionContext({
      replicaIdentity: change.replicaIdentity, peerId,
      nodeId: change.nodeId})} : {}),
  })};
}

/**
 * How the runtime resolves a raft peer id through this replica's registry:
 * one reservation read gives the peer's identity and committed node, and an
 * address exists only for a reserved identity (the runtime records an
 * unreserved peer's delivery as that peer's own outcome). The host
 * addresses the peer from its committed node (null where this replica holds
 * none), never from a lookup of its own.
 * @param {RaftRsPeerIdentityRegistry} registry - This replica's registry.
 * @param {Function} hostAddress - (replicaIdentity, nodeId) => address.
 * @return {Object} {resolvePeerIdentity, addressOfPeer, resolvePeerAddress,
 *   resolvePeerNodeId}.
 */
function peerResolutionOf(registry, hostAddress) {
  const resolvePeerIdentity = (raftPeerId) => registry.resolvePeer(raftPeerId);
  // The address of a peer already resolved (resolvePeerIdentity's answer).
  const addressOfPeer = (peer, raftPeerId) => {
    if (peer.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED) {
      throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.unreserved(raftPeerId));
    }
    return hostAddress(peer.replicaIdentity, peer.nodeId);
  };
  return {
    resolvePeerIdentity,
    addressOfPeer,
    resolvePeerAddress: (raftPeerId) =>
      addressOfPeer(resolvePeerIdentity(raftPeerId), raftPeerId),
    resolvePeerNodeId: (replicaIdentity) =>
      registry.committedNodeIdOf(replicaIdentity),
  };
}

function resolveOriginalNativeEntry(request, nativeInputs) {
  if (!Object.hasOwn(
    request, RAFT_OPERATION_PORT_REQUEST.ORIGINAL_ALLOCATION_OPENING,
  )) {
    return null;
  }
  return consumeOriginalAllocationOpening(
    request[RAFT_OPERATION_PORT_REQUEST.ORIGINAL_ALLOCATION_OPENING],
    nativeInputs,
  );
}

function closeDispatcher(dispatcher, lifecycle) {
  if (dispatcher === null) {
    return coreOk(CLOSED_WITHOUT_RUNTIME);
  }
  // The close is synchronous work: its admitted turn, or the admission's
  // refusal, settles in this run.
  return lifecycle.active ?
    lifecycle.execute(() =>
      settledTurn(dispatcher.close({enterCore: true}))).result :
    dispatcher.close({enterCore: false});
}

function finalizePortOpen({
  port,
  lifecycle,
  dispatcher,
  identityRecordPending,
  identityRecorded,
  dispatch,
  deferElection,
  startScheduling,
}) {
  registerRuntimeLifecycle(port, lifecycle);
  // The release of a pending identity record is its acknowledgement alone:
  // resolved, the gate may open; rejected (the fact never became durable),
  // nothing is released and the host closes the port.
  if (identityRecordPending && dispatcher !== null) {
    Promise.resolve(identityRecorded).then(
      () => turnChainValue(dispatch(() => dispatcher.recordIdentity())),
      () => undefined).catch(() => undefined);
  }
  if (deferElection !== true && lifecycle.active) {
    startScheduling();
  }
  return port;
}

function createRaftRsOperationPort(request) {
  const groupId = required(request, RAFT_OPERATION_PORT_REQUEST.GROUP_ID);
  const replicaIdentity = required(
    request, RAFT_OPERATION_PORT_REQUEST.PEER_ID);
  const database = required(
    request, RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE);
  const suppliedTiming = required(request, RAFT_OPERATION_PORT_REQUEST.TIMING);
  const resolvePeerAddress = required(
    request, RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS);
  required(request, RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY);
  requireSynchronousApplication(request);
  // Capture the actual native inputs once: original admission validates what
  // construction will use, not a later read of a callback-bearing request.
  const bootstrapPeerIds = required(
    request, RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS);
  const membership = request[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP];
  const joiningExistingGroup = request[RAFT_OPERATION_PORT_REQUEST.JOINING_EXISTING_GROUP];
  const identityExisted = request[RAFT_OPERATION_PORT_REQUEST.IDENTITY_EXISTED];
  // Original-mode permission precedes registry/lifecycle constructors and
  // writable formatting. Ordinary authority remains with its existing caller.
  const assertOriginalNativeEntry = resolveOriginalNativeEntry(request, {
    [RAFT_OPERATION_PORT_REQUEST.GROUP_ID]: groupId,
    [RAFT_OPERATION_PORT_REQUEST.PEER_ID]: replicaIdentity,
    [RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE]: database,
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS]: bootstrapPeerIds,
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: membership,
    [RAFT_OPERATION_PORT_REQUEST.JOINING_EXISTING_GROUP]: joiningExistingGroup,
    [RAFT_OPERATION_PORT_REQUEST.IDENTITY_EXISTED]: identityExisted,
  });
  // Resolve callback-bearing timing while the consumed attempt can still
  // refuse. Native creation receives owned scalar data, not getters to run
  // after the last original-authority check. Ordinary timing is unchanged.
  const timing = assertOriginalNativeEntry === null ? suppliedTiming :
    captureOriginalRaftRsTiming(suppliedTiming);
  const registry = new RaftRsPeerIdentityRegistry(database);
  const peerId = registry.registerReplica(replicaIdentity);
  // The bootstrap peer ids are address hints: each is reserved so the
  // replica can name and reach it. The configuration the group opens from is
  // the bootstrap membership's alone (an absent one is refused typed).
  for (const identity of bootstrapPeerIds) {
    registry.registerReplica(identity);
  }
  const bootstrap = bootstrapOfRequest({
    membership,
    registry,
    peerId,
    joiningExistingGroup,
    identityExisted,
  });
  const lifecycle = new RaftRsReplicaLifecycleOwner({
    db: database, groupId, peerId, replicaIdentity,
  });
  const listeners = new Map();
  const emit = (eventName, ...args) => {
    for (const listener of listeners.get(eventName) || []) {
      listener(...args.map((value) => deepFreeze(value)));
    }
  };
  const identityRecorded =
    request[RAFT_OPERATION_PORT_REQUEST.IDENTITY_RECORDED];
  // The host's acknowledgement of the opening's prior-existence fact: absent,
  // or the promise of that write (RAFT_OPERATION_PORT_REQUEST).
  const identityRecordPending = identityRecorded !== undefined;
  const timers = resolveTimeSource(
    request[RAFT_OPERATION_PORT_REQUEST.SUBSTRATE] || {});
  let tickIntervalMs = tickIntervalOf(timing);
  let timer = null;
  let closed = false;
  const lifecycleIncarnation = lifecycle.incarnation;
  const dispatcherOptions = lifecycle.active ? {
    database,
    groupId,
    replicaIdentity,
    lifecycleIncarnation,
    readOpeningHistory: () => lifecycle.openingHistory(lifecycleIncarnation),
    recordOpeningHistory: () => lifecycle.recordOpeningHistory(lifecycleIncarnation),
    peerId,
    bootstrap,
    identityRecordPending,
    timing,
    timers,
    sendToPeer: required(
      request, RAFT_OPERATION_PORT_REQUEST.SEND_TO_PEER),
    ...peerResolutionOf(registry, resolvePeerAddress),
    applyCommittedEntry: committedEntryApplication(required(
      request, RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY)),
    applyCommittedMembershipContext: (context, position) => {
      registry.reserveCommittedReplica(context.replicaIdentity, context.peerId);
      // Every committed context carries the node (D-C3: one shape).
      registry.recordCommittedNodeId(context.replicaIdentity, context.nodeId);
      if (context.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER) {
        registry.recordCommittedLearnerAdmission(context.replicaIdentity,
          encodeCommittedLearnerAdmission({groupId, ...position, context}));
      }
    },
    readLearnerOriginEvidence: (replicaIdentity) =>
      registry.learnerOriginEvidence(replicaIdentity),
    applyTransactionRolledBack:
      request[RAFT_OPERATION_PORT_REQUEST.APPLY_TRANSACTION_ROLLED_BACK],
    snapshotCatchupNeeded:
      request[RAFT_OPERATION_PORT_REQUEST.SNAPSHOT_CATCHUP_NEEDED],
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
  } : null;
  // Resolve every request callback before this final same-turn check. Moving
  // it above argument construction permits a reentrant getter to revoke the
  // attempt and still enter native creation. Already opened work is separate.
  assertOriginalNativeEntry?.(lifecycle.incarnation);
  const dispatcher = dispatcherOptions === null ? null :
    createRuntimeDispatcher(dispatcherOptions);

  // Every entry into the runtime: admitted by the lifecycle owner, refused
  // once the port is closed, and contained (containRuntimeThrow). It answers
  // the runtime's turn, and each port operation hands its caller that turn
  // as is (raft-rs-turn-answer.js): {settled: true, result} when the work
  // completed within the call, {settled: false, pending} when it waits.
  function dispatch(work) {
    return lifecycle.execute(() => {
      if (closed || dispatcher === null) {
        return settledTurn(deepFreeze({
          outcome: CORE_REFUSED, reason: RUNTIME_REASON.CLOSED}));
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
    protocolTurn(() => settledTurn(dispatcher.enqueueStep(envelope)));
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
    return settledTurn(coreOk('scheduling-started'));
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
      }) : settledTurn(deepFreeze({
        outcome: CORE_REFUSED,
        reason: normalized.refusal,
        phase: 'membership-admission',
        retryable: false,
        recoveryRequired: false,
      }));
    }),
    // One named request shape ({successor, replicaIdentity?}); the target
    // is resolved through this replica's own registry, and a request that
    // misses the shape or names an unreserved identity is refused typed.
    transferLeadership: (transferRequest) => protocolTurn(() => {
      const normalized = normalizedTransferRequest(transferRequest, registry);
      return normalized.refusal === undefined ? dispatcher.execute({
        type: RUNTIME_COMMAND.TRANSFER_LEADERSHIP,
        transfer: normalized.command,
      }) : settledTurn(normalized.refusal);
    }),
    probePeerProgress: (replicaIdentity) => executeTurn({
      type: RUNTIME_COMMAND.PROBE_PEER_PROGRESS, replicaIdentity,
    }),
    tick: () => executeTurn({type: 'tick'}),
    campaign: () => executeTurn({type: 'campaign'}),
    // A status read never waits (the runtime's readStatusNow): its turn
    // settles in this run, and the status is answered as is.
    readStatus: () => execute({type: 'read-status'}).result,
    // This replica's role and term from the same observation a status read
    // answers from, without resolving any peer: {outcome: CORE_OK, role,
    // term}, or the status read's own failure. Settles in this run.
    readRoleAndTerm: () =>
      execute({type: RUNTIME_COMMAND.READ_ROLE_AND_TERM}).result,
    // The committed configuration as frozen data ({purpose} is a
    // COMMITTED_MEMBERSHIP_READ_PURPOSE; a bootstrap read by default).
    [RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]: (readRequest) => {
      if (readRequest?.purpose === COMMITTED_MEMBERSHIP_READ_PURPOSE.LEARNER_ACTION) {
        const normalized = normalizeCommittedLearnerRead(readRequest, groupId);
        if (normalized.refusal) return normalized.refusal;
        const answered = execute({type: RUNTIME_COMMAND.READ_COMMITTED_MEMBERSHIP,
          purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.LEARNER_ACTION, query: normalized.query});
        const bounded = (result) => result?.kind ? result : unavailableLearnerAction();
        return turnChainValue(continueTurn(answered,
          (result) => settledTurn(bounded(result))));
      }
      // A bootstrap read answers at once: a read still waiting on the group
      // is the group held.
      const answered = execute({
        type: RUNTIME_COMMAND.READ_COMMITTED_MEMBERSHIP,
        purpose: readRequest?.purpose ??
          COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
      });
      const committed = answered.settled ? answered.result : null;
      return committed?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ||
        committed?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED ?
        committed :
        committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.HELD);
    },
    [RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION]: (request, admitExecution) =>
      protocolTurn(() => {
        const normalized = normalizeMembershipTransition(request, registry, admitExecution);
        return normalized.refusal ? settledTurn(normalized.refusal) :
          dispatcher.execute({
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
      return settledTurn(coreOk('timing-configured'));
    }),
    startScheduling,
    stopScheduling,
    close,
  });
  // Publish only after construction succeeds. A refused opening must never
  // replace a live same-name owner: unregistering after overwrite would lose
  // that owner's entry rather than restore it. The port's exact close releases
  // only the callback it actually published.
  const unregisterMembershipOwner = lifecycle.active ? registerPeerIdentityReservationOwner({
    groupId,
    localReplicaIdentity: replicaIdentity,
    reserve: (joiningReplicaIdentity) =>
      registry.registerReplica(joiningReplicaIdentity),
  }) : null;
  function close() {
    if (closed) {
      return coreOk(ALREADY_CLOSED);
    }
    closed = true;
    stopScheduling();
    listeners.clear();
    const result = closeDispatcher(dispatcher, lifecycle);
    unregisterRuntimeLifecycle(port, lifecycle);
    if (unregisterMembershipOwner !== null) unregisterMembershipOwner();
    return result;
  }
  return finalizePortOpen({
    port,
    lifecycle,
    dispatcher,
    identityRecordPending,
    identityRecorded,
    dispatch,
    deferElection: request[RAFT_OPERATION_PORT_REQUEST.DEFER_ELECTION],
    startScheduling,
  });
}

// The runtime owner is private to this constructor (the operation-boundary
// audit), so the binding verdict a dry run reports is passed through here: a
// digest and load check that returns a state and never dispatches.
export {createRaftRsOperationPort, openRaftRsReplicaDatabase,
  peerResolutionOf, verifyRaftRsBinding};
