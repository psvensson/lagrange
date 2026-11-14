// State and retry policy of the CDC obligation delivery lane. The delivery
// owner still drives subscribers, arms timers, and proposes acknowledgements;
// these helpers only maintain its tenure-local state and bounded batches.

import {PARTITION_SERVICE_DEFAULT} from './partition-service-constants.js';
import {CDC_COMPLETION} from '../cdc/cdc-delivery-outcome.js';
import {releaseContendedPropagationOwners} from './partition-cdc-obligation-progress.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND} from './partition-cdc-obligation-constants.js';
import {acknowledgedEventBytesOf, cdcObligationEventKeyDigest,
  emptyAcknowledgedBytes} from './partition-cdc-obligation-ledger.js';

const OBLIGATION_RETRY_STATE = Object.freeze({IDLE: 'idle', ARMED: 'armed'});
const IDLE_OBLIGATION_RETRY = Object.freeze({state: OBLIGATION_RETRY_STATE.IDLE, handle: null});

const OBLIGATION_RETRY_DISPOSITION = Object.freeze({
  PAGE_YIELDED: 'page_yielded', TRANSIENT_FAILURE: 'transient_failure',
  BACKPRESSURE: 'backpressure', NO_PENDING_WORK: 'no_pending_work',
  STALE_LIFETIME: 'stale_lifetime',
});
const HINTED_BACKPRESSURE_MAX_DELAY_MS = 250;

function emptyBatch() {
  return {groups: new Map(), events: 0, bytes: emptyAcknowledgedBytes(),
    firstAcknowledgedAt: null};
}

// The shipping window (quest cdc-obligation-range-shipping, record S-1): how
// many rows the next shipped range may hold, one integer owned by the tenure
// in [1, ACK_BATCH_MAX_EVENTS]. It starts at one whole ledger entry per wave
// (the lane's behaviour before ranges), doubles after a range reached
// committed coverage while the window was what cut it, and halves after a
// range that was attempted and left uncovered, so one member that can never
// be applied, or a range too slow for a recipient's attempt budget, cannot
// hold the rows ahead of it. A refusal that attempted nothing (typed
// backpressure) and provisional coverage leave it unchanged. It arms no timer
// and adds no delay.
function widenShipWindow(lane) {
  lane.shipWindow = Math.min(BOUND.ACK_BATCH_MAX_EVENTS, lane.shipWindow * 2);
}

function narrowShipWindow(lane) {
  lane.shipWindow = Math.max(1, Math.floor(lane.shipWindow / 2));
}

function createCdcObligationLane(tenure = null) {
  return {
    tenure, inFlight: false, rerun: false, scan: null, currentObligation: null,
    hydratedThroughLogIndex: 0, shipWindow: 1,
    pending: new Map(), commands: new Map(), batch: emptyBatch(),
    contendedPropagationOwners: new Map(),
    flushTimer: null, retryTimer: IDLE_OBLIGATION_RETRY,
    retryDelayMs: PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS,
    consecutiveBackpressure: 0, sliceTurnReady: false,
    held: null, lastDrive: null, lastFlush: null,
  };
}

function currentTenureOf(owner) {
  return owner.isLeader && !owner.isShutdown ? owner.leadershipTenure ?? null : null;
}

function laneOf(delivery) {
  const tenure = currentTenureOf(delivery.owner);
  if (delivery.obligationLane.tenure !== tenure) resetCdcObligationLane(delivery);
  return delivery.obligationLane;
}

function laneIsCurrent(delivery, lane) {
  return lane.tenure !== null && delivery.obligationLane === lane &&
    currentTenureOf(delivery.owner) === lane.tenure;
}

function clearTimer(owner, handle) {
  if (handle !== null) owner.timeSource.clearTimeout(handle);
}

function resetCdcObligationLane(delivery) {
  const lane = delivery.obligationLane;
  const tenure = currentTenureOf(delivery.owner);
  if (lane.tenure === tenure && !delivery.owner.isShutdown) return;
  clearTimer(delivery.owner, lane.flushTimer);
  clearTimer(delivery.owner, lane.retryTimer.handle);
  releaseContendedPropagationOwners(lane);
  delivery.activeCdcInvocation?.retire();
  delivery.obligationLane = createCdcObligationLane(tenure);
}

function takeBatch(lane) {
  const members = [...lane.batch.groups.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([logIndex, grouped]) => grouped
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((member) => ({...member, logIndex})));
  lane.batch = emptyBatch();
  return {groups: groupsOfMembers(members), members};
}

function groupsOfMembers(members) {
  const groups = [];
  for (const member of members) {
    let group = groups.at(-1);
    if (group?.logIndex !== member.logIndex) {
      group = {logIndex: member.logIndex, events: []};
      groups.push(group);
    }
    group.events.push({ordinal: member.ordinal,
      eventKeyDigest: cdcObligationEventKeyDigest(member.eventKey)});
  }
  return groups;
}

function keysOf(groups) {
  return groups.flatMap((group) => group.events);
}

function restoreBatch(lane, members) {
  for (const member of members) addToBatch(lane, member);
}

function addToBatch(lane, obligation) {
  let members = lane.batch.groups.get(obligation.logIndex);
  const opensGroup = members === undefined;
  if (opensGroup) {
    members = [];
    lane.batch.groups.set(obligation.logIndex, members);
  }
  members.push({eventKey: obligation.eventKey, ordinal: obligation.ordinal});
  lane.batch.events += 1;
  lane.batch.bytes += acknowledgedEventBytesOf(obligation.eventKey,
    obligation.logIndex, obligation.ordinal, opensGroup);
}

function batchExceedsBoundsForEvent(lane, addedBytes) {
  return lane.batch.events >= BOUND.ACK_BATCH_MAX_EVENTS ||
    (lane.batch.events > 0 && lane.batch.bytes + addedBytes > BOUND.ACK_BATCH_MAX_BYTES);
}

function errorBackpressureReason(error) {
  const cause = error.cause;
  if (error.reason !== undefined && error.reason !== null) return error.reason;
  return cause ?
    (cause.reason ?? cause.error ?? cause.cause?.reason ?? cause.cause?.error) :
    undefined;
}

function isBackpressureError(error) {
  if (!error) return false;
  const hasHint = Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0;
  return hasHint || Boolean(error.ownerNotReady) ||
    errorBackpressureReason(error) === CDC_COMPLETION.BACKPRESSURE;
}

function resolveDeliveryRetryDisposition(delivery, lane, error = null, explicit = null) {
  const stale = !laneIsCurrent(delivery, lane) || delivery.owner.isShutdown ||
    Boolean(error?.stalePropagationLifetime);
  if (stale) return OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME;
  if (explicit !== null) return explicit;
  return isBackpressureError(error) ?
    OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE : OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE;
}

function disarmDeliveryRetry(owner, lane, resetDelay = true) {
  clearTimer(owner, lane.retryTimer.handle);
  lane.retryTimer = IDLE_OBLIGATION_RETRY;
  lane.consecutiveBackpressure = 0;
  lane.sliceTurnReady = false;
  if (resetDelay) lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
}

function resetYieldedRetryDelay(lane, disposition) {
  if (disposition === OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED) {
    lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    lane.consecutiveBackpressure = 0;
  }
}

function consumeRetryHintMs(lane, error) {
  if (lane.sliceTurnReady === true) {
    lane.sliceTurnReady = false;
    lane.consecutiveBackpressure = 0;
    lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    return 1;
  }
  return error?.retryAfterMs;
}

function computeRetryDelayMs(lane, error, disposition) {
  resetYieldedRetryDelay(lane, disposition);
  const sliceTurnWoken = lane.sliceTurnReady === true;
  const rawHint = consumeRetryHintMs(lane, error);
  const hasHint = Number.isFinite(rawHint) && rawHint > 0;
  const isBackpressure =
    disposition === OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE && !sliceTurnWoken;
  const isTransient = disposition === OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE;
  const initDelay = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  const maxDelay = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS;
  let advanceBackoff = false;
  let delayMs;
  if (isBackpressure && hasHint) {
    lane.consecutiveBackpressure = (lane.consecutiveBackpressure ?? 0) + 1;
    const isInitial = lane.consecutiveBackpressure <= 1;
    delayMs = Math.min(HINTED_BACKPRESSURE_MAX_DELAY_MS,
      Math.max(1, isInitial ? Math.floor(rawHint) : lane.retryDelayMs));
    lane.retryDelayMs = isInitial ? Math.max(delayMs, initDelay) :
      Math.min(HINTED_BACKPRESSURE_MAX_DELAY_MS, lane.retryDelayMs);
    advanceBackoff = true;
  } else if (hasHint) {
    lane.consecutiveBackpressure = 0;
    delayMs = Math.min(maxDelay, Math.max(1, Math.floor(rawHint)));
    lane.retryDelayMs = initDelay;
  } else if (isBackpressure) {
    lane.consecutiveBackpressure = (lane.consecutiveBackpressure ?? 0) + 1;
    delayMs = Math.min(HINTED_BACKPRESSURE_MAX_DELAY_MS, Math.max(1, lane.retryDelayMs));
    advanceBackoff = true;
  } else {
    lane.consecutiveBackpressure = 0;
    delayMs = Math.min(maxDelay, Math.max(1, lane.retryDelayMs));
    advanceBackoff = isTransient;
  }
  return {delayMs, advanceBackoff};
}

function flushOutcome(lane, state, fields) {
  lane.lastFlush = Object.freeze({state, ...fields});
  return lane.lastFlush;
}


function driveOutcome(lane, state, fields) {
  lane.lastDrive = Object.freeze({state, ...fields});
  return lane.lastDrive;
}


export {
  driveOutcome,
  flushOutcome,
  createCdcObligationLane,
  laneOf,
  laneIsCurrent,
  clearTimer,
  resetCdcObligationLane,
  takeBatch,
  groupsOfMembers,
  keysOf,
  restoreBatch,
  addToBatch,
  batchExceedsBoundsForEvent,
  isBackpressureError,
  resolveDeliveryRetryDisposition,
  disarmDeliveryRetry,
  computeRetryDelayMs,
  OBLIGATION_RETRY_STATE,
  IDLE_OBLIGATION_RETRY,
  OBLIGATION_RETRY_DISPOSITION,
  narrowShipWindow,
  widenShipWindow,
};
