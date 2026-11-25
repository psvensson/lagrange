// The port's current authority observation (observeCurrentAuthority) and
// Raft-owned clock obligation controller:
// 1. Initial solo-founder deferral (term === 1, role === LEADER, solo 1-voter
//    committed confState, gateOpen !== false) is an explicit, narrowly
//    permitted state owned by the Raft operation-port / runtime lifecycle
//    contract.
// 2. Leaving that state - via committed membership installation
//    (voters + learners + learnersNext > 1 or joint outgoing voters),
//    observing term > 1, role !== LEADER, gateOpen === false, or reconstructing/reopening an
//    RF2/RF3 replica from durable storage - creates a mandatory clock
//    obligation (clockRequired: true) and automatically arms the periodic
//    scheduler once scheduling has been requested on the replica.
// 3. Closing, retirement, or an owner-defined hold cleanly ends the clock
//    obligation and clears the periodic timer.
// 4. A replica requiring consensus time (clockRequired === true) cannot report
//    settled current leader authority while its required clock is unowned,
//    stopped, or failed to arm.

import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';
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
  USABLE,
} from './raft-rs-runtime-owner-constants.js';
import {currentTermApplied} from './raft-rs-status-observation.js';

const CORE_STATUS = 'status';
const CORE_HAS_READY = 'has_ready';
const NO_TERM = '0';
const INITIAL_FOUNDER_TERM = 1;
const SINGLE_REPLICA_COUNT = 1;
const ZERO_COUNT = 0;
const CLOCK_GAP_NONE = 'none';
const READ_CLOCK_OBLIGATION_TOKEN = Symbol('raft-rs.read-clock-obligation');

const RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON = Object.freeze({
  REQUIRED_CLOCK_STOPPED: 'required-clock-stopped',
  CLOCK_UNOWNED: 'required-clock-unowned',
  CLOCK_ARM_FAILED: 'required-clock-arm-failed',
});

const RAFT_CLOCK_OBLIGATION_STATE = Object.freeze({
  ARMED: 'armed',
  DEFERRED_SOLO_FOUNDER: 'deferred-solo-founder',
  STOPPED: 'stopped',
  UNOWNED: 'unowned',
  ARM_FAILED: 'arm-failed',
  UNMANAGED: 'unmanaged',
  CLOSED: 'closed',
});

const DEFAULT_UNMANAGED_CLOCK_OBSERVATION = deepFreeze({
  clockRequired: false,
  clockArmed: false,
  isScheduling: false,
  schedulingRequested: false,
  deferredSoloFounder: false,
  clockMode: RAFT_CLOCK_OBLIGATION_STATE.UNMANAGED,
  clockGap: CLOCK_GAP_NONE,
});

const UNUSABLE_CLOCK_FACTS = Object.freeze({
  usable: false,
  multiMember: false,
  soloVoter: false,
  gateOpen: false,
  role: STATE_ABSENT,
  term: ZERO_COUNT,
  peerCount: ZERO_COUNT,
});

function arrayLength(value) {
  return Array.isArray(value) ? value.length : ZERO_COUNT;
}

function hasMultiMemberConfState(confState) {
  if (!confState || typeof confState !== 'object') {
    return false;
  }
  const voterCount = arrayLength(confState.voters);
  const outgoingCount = arrayLength(confState.votersOutgoing);
  const learnerCount = arrayLength(confState.learners);
  const nextLearnerCount = arrayLength(confState.learnersNext);
  return (
    voterCount + learnerCount + nextLearnerCount > SINGLE_REPLICA_COUNT ||
    outgoingCount > ZERO_COUNT
  );
}

function isSoloSingleVoterConfState(confState) {
  if (!confState || typeof confState !== 'object') {
    return false;
  }
  const voterCount = arrayLength(confState.voters);
  const outgoingCount = arrayLength(confState.votersOutgoing);
  const learnerCount = arrayLength(confState.learners);
  const nextLearnerCount = arrayLength(confState.learnersNext);
  return (
    voterCount === SINGLE_REPLICA_COUNT &&
    outgoingCount === ZERO_COUNT &&
    learnerCount === ZERO_COUNT &&
    nextLearnerCount === ZERO_COUNT
  );
}

function matchesInitialSoloFounderFacts(facts) {
  return (
    facts.gateOpen !== false &&
    facts.soloVoter === true &&
    facts.role === ROLE_LEADER &&
    facts.term === INITIAL_FOUNDER_TERM
  );
}

function matchesPreCampaignSoloFounderFacts(facts) {
  return (
    facts.gateOpen !== false &&
    facts.soloVoter === true &&
    facts.term === ZERO_COUNT
  );
}

function hasExitedInitialSoloFounderFacts(facts, founderLeaderObserved) {
  if (facts.multiMember === true || facts.gateOpen === false) {
    return true;
  }
  if (Number.isFinite(facts.term) && facts.term > INITIAL_FOUNDER_TERM) {
    return true;
  }
  return founderLeaderObserved && facts.role !== ROLE_LEADER;
}

function hasEnteredNewLeaderTenure(facts, stoppedWhileLeadingTerm, hasEverScheduled) {
  if (stoppedWhileLeadingTerm === null || !hasEverScheduled) {
    return false;
  }
  return (
    facts.role === ROLE_LEADER &&
    Number.isFinite(facts.term) &&
    facts.term > stoppedWhileLeadingTerm
  );
}

function normalizeArmErrorMessage(error) {
  const detail = typeof error?.message === 'string' && error.message.length > 0 ?
    error.message :
    String(error || '');
  return detail.length > 0 ?
    detail :
    RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON.CLOCK_ARM_FAILED;
}

function buildSettledStatusFacts(status) {
  if (!status || status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    return UNUSABLE_CLOCK_FACTS;
  }
  return {
    usable: status.groupHealth === USABLE && status.runtimeHealth === HEALTHY,
    multiMember: hasMultiMemberConfState(status.confState),
    soloVoter: isSoloSingleVoterConfState(status.confState),
    gateOpen: status.gateOpen !== false,
    role: readStateField(status.role),
    term: Number(status.term),
    peerCount: Number.isFinite(status.peerCount) ? status.peerCount : ZERO_COUNT,
  };
}

function buildAuthorityGroupFacts(group, rawStatus) {
  const usable = !group.closed && group.reseedHold === null &&
    group.health === USABLE;
  const confState = group.statusObservation?.confState;
  const role = readStateField(ROLE[rawStatus?.raftState]);
  const term = Number(rawStatus?.term);
  const peerCount = confState ?
    Math.max(ZERO_COUNT, arrayLength(confState.voters) +
      arrayLength(confState.learners) - SINGLE_REPLICA_COUNT) :
    ZERO_COUNT;
  return {
    usable,
    multiMember: hasMultiMemberConfState(confState),
    soloVoter: isSoloSingleVoterConfState(confState),
    gateOpen: group.gateOpen !== false,
    role,
    term,
    peerCount,
  };
}

function buildGroupStatusObservationFacts(group) {
  const observation = group?.statusObservation;
  if (!group || group.closed || group.reseedHold !== null ||
      group.health !== USABLE || !observation ||
      observation.runtimeHealth !== HEALTHY) {
    return UNUSABLE_CLOCK_FACTS;
  }
  return buildAuthorityGroupFacts(group, observation.status);
}

function selectClockTimerGap({
  clockRequired,
  clockArmed,
  manualHarnessMode,
  lastArmError,
  schedulingRequested,
  hasEverScheduled,
}) {
  if (!clockRequired || clockArmed || manualHarnessMode) {
    return CLOCK_GAP_NONE;
  }
  if (lastArmError !== null || schedulingRequested || hasEverScheduled) {
    return RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON.REQUIRED_CLOCK_STOPPED;
  }
  return RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON.CLOCK_UNOWNED;
}

function selectClockObligationMode({
  active,
  clockArmed,
  clockRequired,
  inSoloFounderDeferral,
  lastArmError,
  manualHarnessMode,
  hasEverScheduled,
  schedulingRequested,
}) {
  if (!active) {
    return RAFT_CLOCK_OBLIGATION_STATE.CLOSED;
  }
  if (clockArmed) {
    return RAFT_CLOCK_OBLIGATION_STATE.ARMED;
  }
  if (!clockRequired && inSoloFounderDeferral) {
    return RAFT_CLOCK_OBLIGATION_STATE.DEFERRED_SOLO_FOUNDER;
  }
  if (lastArmError !== null) {
    return RAFT_CLOCK_OBLIGATION_STATE.ARM_FAILED;
  }
  if (manualHarnessMode) {
    return RAFT_CLOCK_OBLIGATION_STATE.UNMANAGED;
  }
  return hasEverScheduled || schedulingRequested ?
    RAFT_CLOCK_OBLIGATION_STATE.STOPPED :
    RAFT_CLOCK_OBLIGATION_STATE.UNOWNED;
}

function createPortClockObligationController({
  deferElection,
  joiningExistingGroup,
  bootstrapPeerIds,
  lifecycle,
  timers,
  getTickIntervalMs,
  setTickIntervalMs,
  runScheduledTick,
  readSettledStatus,
  emit,
}) {
  const bootstrapSingleFounder =
    joiningExistingGroup !== true &&
    arrayLength(bootstrapPeerIds) === SINGLE_REPLICA_COUNT;
  let timer = null;
  let closed = false;
  let heldForReseed = false;
  let clockManaged = deferElection !== true;
  let schedulingRequested = false;
  let hasEverScheduled = false;
  let founderLeaderObserved = false;
  let founderDeferralLatchedOut =
    !bootstrapSingleFounder || deferElection !== true;
  let stoppedWhileLeadingTerm = null;
  let lastArmError = null;
  let manualTicks = ZERO_COUNT;
  let boundGroup = null;
  const armListeners = new Set();

  function readCurrentFacts() {
    return boundGroup !== null ?
      buildGroupStatusObservationFacts(boundGroup) :
      buildSettledStatusFacts(readSettledStatus());
  }

  function isActiveAndOpen() {
    return !closed && !heldForReseed && lifecycle.active === true;
  }

  function clearTickTimer() {
    if (timer !== null) {
      timers.clearInterval(timer);
      timer = null;
    }
  }

  function notifyClockArmed(facts) {
    const payload = deepFreeze({
      peerCount: facts?.peerCount ?? ZERO_COUNT,
      clockRequired: true,
      clockArmed: true,
    });
    for (const listener of [...armListeners]) {
      listener(payload);
    }
  }

  function latchFromFacts(facts) {
    if (!facts?.usable) {
      return;
    }
    if (matchesInitialSoloFounderFacts(facts)) {
      founderLeaderObserved = true;
    }
    if (hasExitedInitialSoloFounderFacts(facts, founderLeaderObserved)) {
      founderDeferralLatchedOut = true;
    }
    if (hasEnteredNewLeaderTenure(facts, stoppedWhileLeadingTerm, hasEverScheduled)) {
      stoppedWhileLeadingTerm = null;
      schedulingRequested = true;
    }
  }

  function isInitialSoloFounderDeferralState(facts) {
    if (founderDeferralLatchedOut || !bootstrapSingleFounder || !facts?.usable) {
      return false;
    }
    return matchesInitialSoloFounderFacts(facts);
  }

  function isPreCampaignSoloFounder(facts) {
    if (
      founderDeferralLatchedOut ||
      !bootstrapSingleFounder ||
      founderLeaderObserved ||
      !facts?.usable
    ) {
      return false;
    }
    return matchesPreCampaignSoloFounderFacts(facts);
  }

  function isClockRequiredForFacts(facts) {
    if (!isActiveAndOpen() || !facts?.usable) {
      return false;
    }
    return !isInitialSoloFounderDeferralState(facts) &&
      !isPreCampaignSoloFounder(facts);
  }

  function isManualHarnessMode() {
    return (
      deferElection === true &&
      !clockManaged &&
      lastArmError === null &&
      manualTicks > ZERO_COUNT
    );
  }

  function snapshotFromFacts(facts) {
    const open = isActiveAndOpen();
    const active = open && Boolean(facts?.usable);
    const soloFounderNow = isInitialSoloFounderDeferralState(facts);
    const inSoloFounderDeferral = soloFounderNow || isPreCampaignSoloFounder(facts);
    const clockRequired = active && !inSoloFounderDeferral;
    const clockArmed = open && timer !== null && lastArmError === null;
    const deferredSoloFounder = active && schedulingRequested && soloFounderNow;
    const manualHarnessMode = isManualHarnessMode();
    const clockGap = selectClockTimerGap({
      clockRequired,
      clockArmed,
      manualHarnessMode,
      lastArmError,
      schedulingRequested,
      hasEverScheduled,
    });
    const clockMode = selectClockObligationMode({
      active,
      clockArmed,
      clockRequired,
      inSoloFounderDeferral,
      lastArmError,
      manualHarnessMode,
      hasEverScheduled,
      schedulingRequested,
    });
    return deepFreeze({
      clockRequired,
      clockArmed,
      isScheduling: clockArmed,
      schedulingRequested,
      deferredSoloFounder,
      clockMode,
      clockGap,
    });
  }

  function invokeTimerRegistration() {
    let createdTimer = null;
    let armError = null;
    try {
      createdTimer = timers.setInterval(() => {
        if (!isActiveAndOpen()) {
          clearTickTimer();
          return;
        }
        runScheduledTick();
      }, getTickIntervalMs());
    } catch (error) {
      armError = normalizeArmErrorMessage(error);
    }
    return {createdTimer, armError};
  }

  function armPeriodicTimer(facts) {
    clearTickTimer();
    if (!isActiveAndOpen() || !schedulingRequested) {
      return false;
    }
    const {createdTimer, armError} = invokeTimerRegistration();
    if (armError !== null) {
      lastArmError = armError;
      timer = null;
      return false;
    }
    if (createdTimer === null || createdTimer === undefined) {
      lastArmError = RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON.CLOCK_ARM_FAILED;
      timer = null;
      return false;
    }
    if (!isActiveAndOpen() || !schedulingRequested) {
      timers.clearInterval(createdTimer);
      timer = null;
      return false;
    }
    lastArmError = null;
    timer = createdTimer;
    timer.unref?.();
    notifyClockArmed(facts);
    return true;
  }

  function reconcile() {
    if (!isActiveAndOpen()) {
      clearTickTimer();
      return snapshotFromFacts(null);
    }
    const facts = readCurrentFacts();
    latchFromFacts(facts);
    if (!facts.usable) {
      clearTickTimer();
      return snapshotFromFacts(facts);
    }
    const required = isClockRequiredForFacts(facts);
    if (required && schedulingRequested && timer === null && lastArmError === null) {
      armPeriodicTimer(facts);
    }
    return snapshotFromFacts(facts);
  }

  function requestStartScheduling() {
    clockManaged = true;
    schedulingRequested = true;
    hasEverScheduled = true;
    stoppedWhileLeadingTerm = null;
    lastArmError = null;
    if (!isActiveAndOpen()) {
      clearTickTimer();
      return snapshotFromFacts(null);
    }
    const facts = readCurrentFacts();
    latchFromFacts(facts);
    if (!isInitialSoloFounderDeferralState(facts)) {
      founderDeferralLatchedOut = true;
    }
    if (isClockRequiredForFacts(facts)) {
      armPeriodicTimer(facts);
    } else {
      clearTickTimer();
    }
    return snapshotFromFacts(facts);
  }

  function requestStopScheduling() {
    clockManaged = true;
    schedulingRequested = false;
    const facts = readCurrentFacts();
    latchFromFacts(facts);
    if (facts.usable && Number.isFinite(facts.term)) {
      stoppedWhileLeadingTerm = facts.term;
    }
    clearTickTimer();
    return snapshotFromFacts(facts);
  }

  function shouldArmOrRearmTimer(facts, {intervalChanged, rearmTimer}) {
    if (!isActiveAndOpen() || !facts.usable || !isClockRequiredForFacts(facts)) {
      return false;
    }
    if (timer !== null) {
      return intervalChanged || rearmTimer === true;
    }
    return schedulingRequested && (rearmTimer === true || lastArmError === null);
  }

  function updateTickIntervalMs(nextTickIntervalMs, {rearmTimer = false} = {}) {
    const previousTickIntervalMs = getTickIntervalMs();
    const intervalChanged = nextTickIntervalMs !== previousTickIntervalMs;
    setTickIntervalMs(nextTickIntervalMs);
    if (rearmTimer === true) {
      clockManaged = true;
      schedulingRequested = true;
      hasEverScheduled = true;
    }
    const facts = readCurrentFacts();
    latchFromFacts(facts);
    if (shouldArmOrRearmTimer(facts, {intervalChanged, rearmTimer})) {
      lastArmError = null;
      armPeriodicTimer(facts);
    }
    return snapshotFromFacts(facts);
  }

  function observeFromAuthority(group, rawStatus) {
    boundGroup = group;
    const facts = buildAuthorityGroupFacts(group, rawStatus);
    latchFromFacts(facts);
    return snapshotFromFacts(facts);
  }

  function recordManualTick() {
    manualTicks += SINGLE_REPLICA_COUNT;
    return reconcile();
  }

  function markHeldForReseed() {
    heldForReseed = true;
    schedulingRequested = false;
    clearTickTimer();
  }

  function closeController() {
    closed = true;
    schedulingRequested = false;
    clearTickTimer();
    armListeners.clear();
  }

  function onClockArmed(listener) {
    if (!listener) {
      return () => false;
    }
    armListeners.add(listener);
    return () => armListeners.delete(listener);
  }

  const controller = Object.freeze({
    reconcile,
    requestStartScheduling,
    requestStopScheduling,
    updateTickIntervalMs,
    observeFromAuthority,
    recordManualTick,
    markHeldForReseed,
    close: closeController,
    onClockArmed,
    readSnapshot: () => reconcile(),
    isScheduling: () => isActiveAndOpen() && timer !== null && lastArmError === null,
    bindGroup: (group) => {
      boundGroup = group;
    },
  });
  if (typeof emit === 'function') {
    emit.clockController = controller;
  }
  return controller;
}

function readPortClockObligation(port) {
  const turn = port?.configureTick?.(READ_CLOCK_OBLIGATION_TOKEN);
  return typeof turn?.result?.clockRequired === 'boolean' ? turn.result : null;
}

function reconcilePortClockObligation(port) {
  return readPortClockObligation(port);
}

function isPortScheduling(port) {
  return readPortClockObligation(port)?.clockArmed === true;
}

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
  group.emit?.clockController?.bindGroup(group);
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

function observeGroupClock(group, rawStatus) {
  const controller = group.emit?.clockController;
  if (!controller) {
    return DEFAULT_UNMANAGED_CLOCK_OBSERVATION;
  }
  return controller.observeFromAuthority(group, rawStatus);
}

/**
 * Why a core that leads is not reported LEADER, or null when it is.
 * @param {Object} group - The runtime group.
 * @param {Object} facts - {status, ownTermApplied, settled, clock}.
 * @return {string|null} A RAFT_AUTHORITY_UNSETTLED_REASON, or null.
 */
function leaderUnsettledReason(group, {status, ownTermApplied, settled, clock}) {
  if (higherTermQueued(group.inbound, status.term)) {
    return RAFT_AUTHORITY_UNSETTLED_REASON.HIGHER_TERM_INBOUND;
  }
  if (typeof clock?.clockGap === 'string' && clock.clockGap !== CLOCK_GAP_NONE) {
    return clock.clockGap;
  }
  if (group.queuedTicks > 0) return RAFT_AUTHORITY_UNSETTLED_REASON.CLOCK_BEHIND;
  return ownTermApplied || settled ? null :
    RAFT_AUTHORITY_UNSETTLED_REASON.OWN_TERM_UNAPPLIED;
}

/**
 * The core's authority facts at one synchronous read, never recorded and
 * never published to the native status observer.
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
  const clock = observeGroupClock(group, status);
  const unsettledReason = role !== ROLE_LEADER ? null :
    leaderUnsettledReason(group, {status, ownTermApplied, settled, clock});
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
    clockRequired: clock.clockRequired,
    clockArmed: clock.clockArmed,
    isScheduling: clock.isScheduling,
    schedulingRequested: clock.schedulingRequested,
    deferredSoloFounder: clock.deferredSoloFounder,
    clockMode: clock.clockMode,
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

export {
  RAFT_AUTHORITY_CLOCK_UNSETTLED_REASON,
  RAFT_CLOCK_OBLIGATION_STATE,
  READ_CLOCK_OBLIGATION_TOKEN,
  countedTick,
  createPortClockObligationController,
  hasMultiMemberConfState,
  isPortScheduling,
  observeCurrentAuthority,
  readPortClockObligation,
  reconcilePortClockObligation,
};
