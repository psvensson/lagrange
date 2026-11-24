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
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
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
import {
  committedMembershipRefusal,
  normalizeCommittedLearnerRead,
  unavailableLearnerAction,
} from './raft-rs-committed-membership-read.js';
import {encodeCommittedLearnerAdmission} from
  './raft-rs-committed-membership-context.js';
import {normalizedConfChange} from './raft-rs-conf-change-refusal-answer.js';
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
  registerRuntimeLifecycle,
  unregisterRuntimeLifecycle,
} from './raft-rs-replica-lifecycle-owner.js';
import {registerPeerIdentityReservationOwner} from
  './raft-rs-membership-administration.js';
import {reportRaftRsRuntimeFault} from './raft-rs-runtime-fault-log.js';
import {
  RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON,
  RAFT_CLOCK_OBLIGATION_STATE,
  READ_CLOCK_OBLIGATION_TOKEN,
  createPortClockObligationController,
  hasMultiMemberConfState,
  isPortScheduling,
  readPortClockObligation,
  reconcilePortClockObligation,
} from './raft-rs-current-authority.js';
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
  RAFT_EVENT.APPLIED_PROGRESS,
  RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE,
  RAFT_EVENT.MEMBERSHIP_CHANGED,
  RAFT_EVENT.GATE_OPENED,
  RAFT_EVENT.CONF_CHANGE_APPLIED,
  RAFT_EVENT.STATUS_CHANGED,
]);
const EVENT_ALIAS = Object.freeze({
  'term-change': RAFT_EVENT.TERM_CHANGE,
  'leader-change': RAFT_EVENT.LEADER_CHANGE,
});
const HEARTBEAT_TICK_DIVISOR = 3;
const ALREADY_CLOSED = 'already-closed';
const CLOSED_WITHOUT_RUNTIME = 'closed-without-runtime';
const TIMING_CONFIGURED = 'timing-configured';
const TIMING_PENDING_RECREATION = 'timing-pending-recreation';
const TURN_RESULT_FIELD = 'result';
const TIMING_TURN_OUTCOME = Object.freeze({
  PENDING: 'pending',
  UNAVAILABLE: 'unavailable',
});
const TIMING_TURN_REASON = Object.freeze({
  PENDING: 'turn-pending',
  MISSING_RESULT: 'missing-turn-result',
  INVALID_REPORT: 'invalid-configure-tick-report',
  UNAVAILABLE: 'configure-tick-unavailable',
  REFUSED: 'turn-refused',
});

function isRecordObject(value) {
  return value !== null && typeof value === 'object';
}

function normalizeNonEmptyString(value, defaultValue) {
  return typeof value === 'string' && value.length > 0 ? value : defaultValue;
}

function buildConfigureTickSnapshotFields(safe) {
  return {
    createdCoreTiming: safe.createdCoreTiming || null,
    createdCoreTuning: safe.createdCoreTuning || null,
    requested: safe.requested || null,
    effective: safe.effective || null,
    discrepancies: Array.isArray(safe.discrepancies) ? safe.discrepancies : [],
    configuredForFutureReplicas: safe.configuredForFutureReplicas || null,
  };
}

function formatConfigureTickReport(report) {
  const safe = isRecordObject(report) ? report : {};
  const applied = safe.appliedToExistingCore === true;
  return coreOk(
    applied ? TIMING_CONFIGURED : TIMING_PENDING_RECREATION,
    {
      appliedToExistingCore: applied,
      pendingRecreation: safe.pendingRecreation === true,
      ...buildConfigureTickSnapshotFields(safe),
    },
  );
}

function readPortEffectiveRaftTiming(port) {
  const turn = port?.configureTick?.();
  return turn?.settled === true &&
    turn.result?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    turn.result?.createdCoreTuning ?
    turn.result :
    null;
}

function buildUnwrappedTurn(ok, outcome, reason, report = null) {
  return {ok, outcome, reason, report};
}

function isDirectConfigureTickReport(value) {
  return isRecordObject(value) && (
    typeof value.appliedToExistingCore === 'boolean' ||
    isRecordObject(value.createdCoreTuning)
  );
}

function unwrapCoreOkResultObject(result) {
  const reason = normalizeNonEmptyString(result.reason, TIMING_CONFIGURED);
  if (!Object.hasOwn(result, TURN_RESULT_FIELD)) {
    return buildUnwrappedTurn(true, result.outcome, reason, result);
  }
  return isRecordObject(result.result) ?
    buildUnwrappedTurn(true, result.outcome, reason, result.result) :
    buildUnwrappedTurn(false, result.outcome, TIMING_TURN_REASON.MISSING_RESULT);
}

function unwrapSettledTurnAnswer(turn) {
  let unwrapped;
  if (!turn.settled) {
    unwrapped = buildUnwrappedTurn(false, TIMING_TURN_OUTCOME.PENDING, TIMING_TURN_REASON.PENDING);
  } else if (!isRecordObject(turn.result)) {
    unwrapped = buildUnwrappedTurn(
      false, TIMING_TURN_OUTCOME.UNAVAILABLE, TIMING_TURN_REASON.MISSING_RESULT);
  } else if (turn.result.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    unwrapped = buildUnwrappedTurn(
      false,
      normalizeNonEmptyString(turn.result.outcome, TIMING_TURN_OUTCOME.UNAVAILABLE),
      normalizeNonEmptyString(turn.result.reason, TIMING_TURN_REASON.REFUSED),
    );
  } else {
    unwrapped = unwrapCoreOkResultObject(turn.result);
  }
  return unwrapped;
}

function unwrapOutcomeTurnAnswer(turn) {
  let unwrapped;
  if (turn.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    unwrapped = buildUnwrappedTurn(
      false, turn.outcome, normalizeNonEmptyString(turn.reason, TIMING_TURN_REASON.REFUSED));
  } else if (isRecordObject(turn.result)) {
    unwrapped = buildUnwrappedTurn(
      true, turn.outcome, normalizeNonEmptyString(turn.reason, TIMING_CONFIGURED), turn.result);
  } else if (!Object.hasOwn(turn, TURN_RESULT_FIELD) && isDirectConfigureTickReport(turn)) {
    unwrapped = buildUnwrappedTurn(
      true, turn.outcome, normalizeNonEmptyString(turn.reason, TIMING_CONFIGURED), turn);
  } else {
    unwrapped = buildUnwrappedTurn(false, turn.outcome, TIMING_TURN_REASON.MISSING_RESULT);
  }
  return unwrapped;
}

function unwrapConfigureTickTurn(turn) {
  let unwrapped;
  if (!isRecordObject(turn)) {
    unwrapped = buildUnwrappedTurn(
      false, TIMING_TURN_OUTCOME.UNAVAILABLE, TIMING_TURN_REASON.UNAVAILABLE);
  } else if (typeof turn.settled === 'boolean') {
    unwrapped = unwrapSettledTurnAnswer(turn);
  } else if (typeof turn.outcome === 'string') {
    unwrapped = unwrapOutcomeTurnAnswer(turn);
  } else if (isDirectConfigureTickReport(turn)) {
    unwrapped = buildUnwrappedTurn(
      true,
      RAFT_OPERATION_OUTCOME.CORE_OK,
      normalizeNonEmptyString(turn.reason, TIMING_CONFIGURED),
      turn,
    );
  } else {
    unwrapped = buildUnwrappedTurn(
      false, TIMING_TURN_OUTCOME.UNAVAILABLE, TIMING_TURN_REASON.INVALID_REPORT);
  }
  return unwrapped;
}

function buildPortTickApplyOutcome(applied, unwrapped, logExtra) {
  return {
    applied,
    appliedToExistingCore: applied,
    outcome: unwrapped.outcome,
    reason: unwrapped.reason,
    logExtra,
  };
}

function resolvePortTickApplyOutcome(replica, unwrapped, params) {
  let resolved;
  if (!unwrapped.ok) {
    resolved = buildPortTickApplyOutcome(false, unwrapped, null);
  } else if (unwrapped.report?.appliedToExistingCore === false) {
    resolved = buildPortTickApplyOutcome(false, unwrapped, {
      appliedToExistingCore: false,
      pendingRecreation: true,
      createdCoreTuning: unwrapped.report.createdCoreTuning || null,
    });
  } else {
    const tickChanged =
      params.hasTickInterval &&
      params.tickIntervalMs !== params.previousTickIntervalMs;
    const tickRuntimeApplied =
      !tickChanged ||
      unwrapped.report?.appliedToExistingCore === true ||
      replica.applyRuntimeTickInterval(params.tickIntervalMs);
    resolved = buildPortTickApplyOutcome(
      tickRuntimeApplied,
      unwrapped,
      {tickRuntimeApplied},
    );
  }
  return resolved;
}

function applyPortRaftTimingConfig(replica, params) {
  const timingArg = {
    heartbeatMs: params.heartbeatMs,
    electionMinMs: params.electionMinMs,
    electionMaxMs: params.electionMaxMs,
    rearmTimer: params.rearmTimer,
  };
  if (params.hasTickInterval) {
    timingArg.tickIntervalMs = params.tickIntervalMs;
  }
  const turn = replica.raft?.configureTick?.(timingArg);
  return resolvePortTickApplyOutcome(
    replica,
    unwrapConfigureTickTurn(turn),
    params,
  );
}

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

function subscribePortEvent(listeners, eventName, listener) {
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
}

function readCommittedLearnerActionFromPort(execute, groupId, readRequest) {
  const normalized = normalizeCommittedLearnerRead(readRequest, groupId);
  if (normalized.refusal) return normalized.refusal;
  const answered = execute({
    type: RUNTIME_COMMAND.READ_COMMITTED_MEMBERSHIP,
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.LEARNER_ACTION,
    query: normalized.query,
  });
  const bounded = (result) => result?.kind ? result : unavailableLearnerAction();
  return turnChainValue(continueTurn(answered,
    (result) => settledTurn(bounded(result))));
}

function isCommittedOrRefusedMembershipAnswer(committed) {
  const kind = committed?.kind;
  return kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ||
    kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED;
}

function applyConfigureTickToClock(clockController, dispatcher, tickIntervalMs, nextTiming) {
  const command = typeof nextTiming === 'number' ?
    {tickIntervalMs: nextTiming} : (nextTiming || {});
  const report = dispatcher.configureTiming(command);
  if (report?.appliedToExistingCore === true) {
    const nextMs = Number.isFinite(command?.tickIntervalMs) && command.tickIntervalMs > 0 ?
      command.tickIntervalMs : tickIntervalMs;
    clockController.updateTickIntervalMs(nextMs, {
      rearmTimer: command?.rearmTimer === true,
    });
  }
  return settledTurn(formatConfigureTickReport(report));
}

function finalizePortOpen({
  port,
  lifecycle,
  dispatcher,
  clockController,
  identityRecordPending,
  identityRecorded,
  dispatch,
  deferElection,
  startScheduling,
}) {
  registerRuntimeLifecycle(port, lifecycle);
  clockController.reconcile();
  // The release of a pending identity record is its acknowledgement alone:
  // resolved, the gate may open; rejected (the fact never became durable),
  // nothing is released and the host closes the port.
  if (identityRecordPending && dispatcher !== null) {
    Promise.resolve(identityRecorded).then(
      () => turnChainValue(dispatch(() => dispatcher.recordIdentity())).finally(
        () => clockController.reconcile()),
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
  let clockController = null;
  const emit = (eventName, ...args) => {
    clockController?.reconcile();
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
    // An address exists only for a reserved identity; the runtime records
    // an unreserved peer's delivery as that peer's own outcome. The host
    // addresses the peer from its committed node (null where this replica
    // holds none), never from a lookup of its own.
    resolvePeerAddress: (raftPeerId) => {
      const identity = registry.resolveReplicaIdentity(raftPeerId);
      if (identity.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED) {
        throw new Error(RAFT_RS_PEER_IDENTITY_ERROR_MSG.unreserved(raftPeerId));
      }
      return resolvePeerAddress(identity.replicaIdentity,
        registry.committedNodeIdOf(identity.replicaIdentity));
    },
    resolvePeerIdentity: (raftPeerId) =>
      registry.resolveReplicaIdentity(raftPeerId),
    resolvePeerNodeId: (replicaIdentity) =>
      registry.committedNodeIdOf(replicaIdentity),
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
    hasListeners: (eventName) => (listeners.get(eventName)?.size ?? 0) > 0,
  } : null;
  // Resolve every request callback before this final same-turn check. Moving
  // it above argument construction permits a reentrant getter to revoke the
  // attempt and still enter native creation. Already opened work is separate.
  assertOriginalNativeEntry?.(lifecycle.incarnation);
  const dispatcher = dispatcherOptions === null ? null :
    createRuntimeDispatcher(dispatcherOptions);

  // Every entry into the runtime: admitted by the lifecycle owner, refused
  // once the port is closed, and contained (containRuntimeThrow).
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
    return runRaftProtocolActivity(() => {
      const turn = dispatch(work);
      if (turn.settled) {
        clockController?.reconcile();
        return turn;
      }
      return pendingTurn(turn.pending.finally(() => {
        clockController?.reconcile();
      }));
    });
  }
  const execute = (command) => dispatch(() => dispatcher.execute(command));
  const executeTurn = (command) =>
    protocolTurn(() => dispatcher.execute(command));
  const enqueueStep = (envelope) =>
    protocolTurn(() => settledTurn(dispatcher.enqueueStep(envelope)));
  const readSettledStatus = () =>
    closed || dispatcher === null ?
      null :
      dispatcher.execute({type: RUNTIME_COMMAND.READ_STATUS}).result;
  clockController = createPortClockObligationController({
    deferElection: request[RAFT_OPERATION_PORT_REQUEST.DEFER_ELECTION],
    joiningExistingGroup,
    bootstrapPeerIds,
    lifecycle,
    timers,
    getTickIntervalMs: () => tickIntervalMs,
    setTickIntervalMs: (nextMs) => {
      tickIntervalMs = nextMs;
    },
    runScheduledTick: () => executeTurn({type: 'tick'}),
    readSettledStatus,
    emit,
  });
  const stopScheduling = () =>
    coreOk('scheduling-stopped', clockController.requestStopScheduling());
  // A group whose own history was proven lost - by the local-log guard, or
  // at its opening by the open-time rule - is held for a reseed by its
  // lifecycle owner (durable, survives a restart) and its ticks stop.
  function holdForReseed() {
    clockController.markHeldForReseed();
    return lifecycle.holdForReseed();
  }
  const startScheduling = (options) => {
    clockController.onClockArmed(options?.onClockArmed);
    return dispatch(() =>
      settledTurn(coreOk('scheduling-started', clockController.requestStartScheduling())));
  };
  const subscribe = (eventName, listener) =>
    subscribePortEvent(listeners, eventName, listener);
  const port = createRaftOperationPort({
    subscribe,
    step: enqueueStep,
    propose: (value) => executeTurn({
      type: 'propose', bytes: encodeProposal(value),
    }),
    proposeConfChange: (change) => protocolTurn(() => {
      const normalized = normalizedConfChange(change, registry);
      return normalized.refusal === undefined ? dispatcher.execute({
        type: 'propose-conf-change',
        change: normalized.change,
        typedOperation: normalized.typedOperation,
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
    tick: () => {
      clockController.recordManualTick();
      return executeTurn({type: 'tick'});
    },
    campaign: () => executeTurn({type: 'campaign'}),
    // A status read never waits (the runtime's readStatusNow): returns the
    // owner's last settled immutable observation without entering the core.
    readStatus: () => execute({type: RUNTIME_COMMAND.READ_STATUS}).result,
    // The core as it is at this call, read and never driven (the runtime's
    // observeCurrentAuthority): no turn, nothing queued, nothing awaited.
    [RAFT_OPERATION.OBSERVE_CURRENT_AUTHORITY]: () =>
      dispatch(() => dispatcher.observeCurrentAuthority()).result,
    // The committed configuration as frozen data ({purpose} is a
    // COMMITTED_MEMBERSHIP_READ_PURPOSE; a bootstrap read by default).
    [RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]: (readRequest) => {
      if (readRequest?.purpose === COMMITTED_MEMBERSHIP_READ_PURPOSE.LEARNER_ACTION) {
        return readCommittedLearnerActionFromPort(execute, groupId, readRequest);
      }
      const answered = execute({
        type: RUNTIME_COMMAND.READ_COMMITTED_MEMBERSHIP,
        purpose: readRequest?.purpose ??
          COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP,
        replicaIdentity: readRequest?.replicaIdentity,
        peerId: readRequest?.peerId,
        includeRole: readRequest?.includeRole === true,
      });
      const committed = answered.settled ? answered.result : null;
      return isCommittedOrRefusedMembershipAnswer(committed) ?
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
    configureTick: (nextTiming) =>
      nextTiming === READ_CLOCK_OBLIGATION_TOKEN ?
        settledTurn(clockController.readSnapshot()) :
        dispatch(() =>
          applyConfigureTickToClock(clockController, dispatcher, tickIntervalMs, nextTiming)),
    startScheduling,
    stopScheduling,
    close,
  });
  // Publish only after construction succeeds. A refused opening must never
  // replace a live same-name owner: unregistering after overwrite would lose
  // that owner's entry rather than restore it. The port's exact close releases
  // only the callback it actually published.
  const unregisterMembershipOwner = registerPeerIdentityReservationOwner({
    groupId,
    localReplicaIdentity: replicaIdentity,
    reserve: (joiningReplicaIdentity) =>
      registry.registerReplica(joiningReplicaIdentity),
  });
  function close() {
    if (closed) {
      return coreOk(ALREADY_CLOSED);
    }
    closed = true;
    clockController.close();
    listeners.clear();
    const result = closeDispatcher(dispatcher, lifecycle);
    unregisterRuntimeLifecycle(port, lifecycle);
    unregisterMembershipOwner();
    return result;
  }
  return finalizePortOpen({
    port,
    lifecycle,
    dispatcher,
    clockController,
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
export {
  RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON,
  RAFT_CLOCK_OBLIGATION_STATE,
  applyPortRaftTimingConfig,
  createRaftRsOperationPort,
  hasMultiMemberConfState,
  isPortScheduling,
  readPortClockObligation,
  readPortEffectiveRaftTiming,
  reconcilePortClockObligation,
  verifyRaftRsBinding,
};
