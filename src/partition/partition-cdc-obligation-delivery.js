import {driveOutcome, flushOutcome, createCdcObligationLane, laneOf, laneIsCurrent, clearTimer, resetCdcObligationLane,
  takeBatch, groupsOfMembers, keysOf, restoreBatch, addToBatch, batchExceedsBoundsForEvent,
  isBackpressureError, resolveDeliveryRetryDisposition, disarmDeliveryRetry,
  computeRetryDelayMs, OBLIGATION_RETRY_STATE, IDLE_OBLIGATION_RETRY,
  OBLIGATION_RETRY_DISPOSITION, narrowShipWindow, widenShipWindow} from
  './partition-cdc-obligation-lane.js';
// The obligation lane of the CDC delivery owner (TX1 design revision 10,
// section 8.3 point 5; owner ruling 2026-10-11): on the leader it drives owed
// obligations of the durable ledger (partition-cdc-obligation-ledger.js) to
// current subscribers in log order, one ordered range per wave
// (partition-cdc-obligation-range.js), batches acknowledgements under count/byte
// bounds and flush deadline, and proposes each batch as CDC_DELIVERED to mark
// events delivered on every replica. Uncommitted events stay owed in the ledger
// so crashes redeliver (consumers deduplicate) and new tenures start from ledger.
// The proposer is registered at load by partition-cdc-obligation.js via
// registerCdcAcknowledgementProposer; until registered a flush returns a typed
// PROPOSER_UNAVAILABLE outcome and the batch stays pending (R11).

import {CDC_PIPELINE_METRIC} from '../constants/cdc-lifecycle-constants.js';
import {PARTITION_SERVICE_DEFAULT, PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_TYPE} from './partition-service-constants.js';
import {admitCommittedCommand} from './partition-committed-command-admission.js';
import {isWriteOutcomeUnknown} from './partition-write-kernel.js';
import {CDC_COVERAGE_STATE} from '../cdc/cdc-delivery-outcome.js';
import {beginCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {SHIP_RANGE_STATE, advanceScanCursor, composeCdcShipRange, eventsOfShipRange,
  hasOwedWorkBeyondScan, isShipRangeAlreadyAcknowledged, scanReachedTail} from
  './partition-cdc-obligation-range.js';
import {cdcObligationCoverage, cdcProgressCurrent, cdcSubscriberInvocation, nextCdcSubscriber,
  observeCdcSubscriber, prepareCdcObligationProgress, recordUncoveredSubscriberHint,
  releaseContendedPropagationOwners, throwUncoveredObligationError} from
  './partition-cdc-obligation-progress.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND, PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_FAILURE_CODE as CODE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE as FLUSH, PARTITION_CDC_OBLIGATION_LOG_MSG as LOG_MSG,
  PARTITION_CDC_OBLIGATION_ORIGIN as ORIGIN, PARTITION_CDC_OBLIGATION_REASON as REASON} from
  './partition-cdc-obligation-constants.js';
import {acknowledgedEventBytesOf, buildCdcAcknowledgementCommand, isCdcPositionReclaimed,
  readCdcObligationProgress, readOwedCdcHead, readOwedCdcObligations} from
  './partition-cdc-obligation-ledger.js';

// The one acknowledgement proposer (see the header): (service, command) ->
// Promise<write answer>, the write commit owner's.
let acknowledgementProposer = null;

const DRIVE_PRECONDITION_MET = 'ready';
/**
 * Register the proposer a flush hands its CDC_DELIVERED command to.
 * @param {Function|null} propose - (service, command) -> Promise<answer>.
 * @return {Function|null} The proposer registered before.
 */
function registerCdcAcknowledgementProposer(propose) {
  const previous = acknowledgementProposer;
  acknowledgementProposer = typeof propose === PARTITION_SERVICE_TYPE.FUNCTION ?
    propose : null;
  return previous;
}

function trackOnOwner(owner, promise) {
  if (typeof owner.trackPendingCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION) {
    owner.trackPendingCDCEvent(promise);
  }
  return promise;
}

/**
 * The ledger committed these events delivered (the CDC_DELIVERED applied):
 * they are no longer pending here, nor is any position the ledger's compact
 * progress reclaimed. Only identities already read from this ledger into
 * lane.pending may be reconciled this way; the prefix proves no new identity.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Array<string>} eventKeys - The acknowledged keys.
 * @param {Object|null} [progress] - The ledger's compact progress
 *   ({throughLogIndex, throughOrdinal}) after the application, or null.
 */
function settleAcknowledgedObligations(delivery, eventKeys, progress = null) {
  const lane = laneOf(delivery);
  for (const eventKey of eventKeys) lane.pending.delete(eventKey);
  for (const [eventKey, position] of lane.pending) {
    if (isCdcPositionReclaimed(position, progress)) lane.pending.delete(eventKey);
  }
  for (const [entryId, pending] of lane.commands) {
    if (pending.members.every(({eventKey}) => !lane.pending.has(eventKey))) {
      lane.commands.delete(entryId);
    }
  }
  if (laneIsCurrent(delivery, lane)) {
    drainPendingHydratedObligations(delivery, lane);
    trackOnOwner(delivery.owner, driveCdcObligations(delivery, REASON.AFTER_FLUSH));
  }
}

// --- the acknowledgement batch ---

function stampOf(owner) {
  return {timestamp: owner.hlcClock.now().toString(),
    proposedBy: owner.replicaId, proposedAt: owner.timeSource.now()};
}

function armFlushDeadline(delivery) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  if (lane.flushTimer !== null || lane.held !== null || owner.isShutdown) return;
  lane.flushTimer = owner.timeSource.setTimeout(() => {
    lane.flushTimer = null;
    if (!laneIsCurrent(delivery, lane)) return;
    trackOnOwner(owner, flushCdcAcknowledgements(delivery, REASON.FLUSH_DEADLINE));
  }, BOUND.ACK_FLUSH_DEADLINE_MS);
}

function flushFullBatchBeforeAdd(delivery, lane, addedBytes) {
  if (!batchExceedsBoundsForEvent(lane, addedBytes)) return true;
  const reason = lane.batch.events >= BOUND.ACK_BATCH_MAX_EVENTS ?
    REASON.BATCH_EVENTS_BOUND : REASON.BATCH_BYTES_BOUND;
  trackOnOwner(delivery.owner, flushCdcAcknowledgements(delivery, reason));
  if (!batchExceedsBoundsForEvent(lane, addedBytes)) return true;
  scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE);
  return false;
}

function acknowledgeDelivered(delivery, obligation) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  if (lane.pending.has(obligation.eventKey) ||
      isCdcPositionReclaimed(obligation, readCdcObligationProgress(owner.db))) {
    return true;
  }
  const addedBytes = acknowledgedEventBytesOf(obligation.eventKey,
    obligation.logIndex, obligation.ordinal, !lane.batch.groups.has(obligation.logIndex));
  if (!flushFullBatchBeforeAdd(delivery, lane, addedBytes)) return false;
  lane.pending.set(obligation.eventKey,
    {logIndex: obligation.logIndex, ordinal: obligation.ordinal});
  addToBatch(lane, obligation);
  lane.batch.firstAcknowledgedAt ??= owner.timeSource.now();
  if (lane.batch.events >= BOUND.ACK_BATCH_MAX_EVENTS) {
    trackOnOwner(owner, flushCdcAcknowledgements(delivery, REASON.BATCH_EVENTS_BOUND));
    return true;
  }
  armFlushDeadline(delivery);
  return true;
}

function logFlushRefusal(owner, groups, fields) {
  owner.logger.warn(LOG_MSG.ACKNOWLEDGEMENTS_REFUSED, {
    partitionId: owner.partitionId, groups: groups.length,
    events: keysOf(groups).length, ...fields});
}

/**
 * Propose the pending acknowledgements as one CDC_DELIVERED command. The
 * batch is taken whole; what the answer decides: committed (the apply settled
 * the keys), an unknown outcome (the keys stay pending until the ledger
 * decides, at this tenure's end at the latest), a typed refusal (the keys are
 * forgotten here and stay owed in the ledger, redelivered by the next drive).
 * @param {Object} delivery - The CDC delivery owner.
 * @param {string} reason - A PARTITION_CDC_OBLIGATION_REASON.
 * @return {Promise<Object>} {state: a PARTITION_CDC_OBLIGATION_FLUSH_STATE,
 *   ...}.
 */
async function flushCdcAcknowledgements(delivery, reason) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  if (lane.batch.events === 0) {
    clearTimer(owner, lane.flushTimer);
    lane.flushTimer = null;
    return flushOutcome(lane, FLUSH.EMPTY, {reason});
  }
  if (lane.commands.size >= BOUND.ACK_MAX_OUTSTANDING_BATCHES) {
    armFlushDeadline(delivery);
    return flushOutcome(lane, FLUSH.BACKPRESSURE, {reason});
  }
  clearTimer(owner, lane.flushTimer);
  lane.flushTimer = null;
  const {groups, members} = takeBatch(lane);
  const eventKeys = members.map((member) => member.eventKey);
  if (owner.isShutdown) {
    settleAcknowledgedObligations(delivery, eventKeys);
    return flushOutcome(lane, FLUSH.SHUTDOWN, {reason, events: eventKeys.length});
  }
  if (!laneIsCurrent(delivery, lane)) {
    settleAcknowledgedObligations(delivery, eventKeys);
    owner.logger.debug(LOG_MSG.ACKNOWLEDGEMENTS_DROPPED_NOT_LEADER, {
      partitionId: owner.partitionId, events: eventKeys.length});
    return flushOutcome(lane, FLUSH.NOT_LEADER, {reason, events: eventKeys.length});
  }
  if (acknowledgementProposer === null) {
    lane.held = null;
    restoreBatch(lane, members);
    scheduleDeliveryRetry(delivery, null);
    owner.logger.warn(LOG_MSG.PROPOSER_UNAVAILABLE, {
      partitionId: owner.partitionId, events: eventKeys.length});
    return flushOutcome(lane, FLUSH.PROPOSER_UNAVAILABLE,
      {reason, events: eventKeys.length, failureCode: CODE.PROPOSER_UNAVAILABLE});
  }
  const command = buildCdcAcknowledgementCommand(owner.partitionId, groups, stampOf(owner));
  const admission = admitCommittedCommand(command, {origin: ORIGIN.CDC_DELIVERY_OWNER});
  if (!admission.admitted) {
    lane.held = admission.code;
    restoreBatch(lane, members);
    logFlushRefusal(owner, groups, {failureCode: admission.code, proposed: false});
    return flushOutcome(lane, FLUSH.REFUSED,
      {reason, events: eventKeys.length, failureCode: admission.code, proposed: false});
  }
  const pending = {command: Object.freeze(command), members, groups, inFlight: false};
  lane.commands.set(command.entryId, pending);
  return proposePendingAcknowledgement(delivery, lane, pending, reason);
}

async function proposePendingAcknowledgement(delivery, lane, pending, reason) {
  const {owner} = delivery;
  const {command, members, groups} = pending;
  const eventKeys = members.map(({eventKey}) => eventKey);
  if (pending.inFlight || !laneIsCurrent(delivery, lane)) {
    return Object.freeze({state: FLUSH.IN_FLIGHT, reason});
  }
  if (reconcilePendingAcknowledgement(delivery, lane, pending)) {
    return flushOutcome(lane, FLUSH.RECONCILED,
      {reason, events: eventKeys.length, entryId: command.entryId});
  }
  pending.inFlight = true;
  owner.logger.debug(LOG_MSG.ACKNOWLEDGEMENTS_PROPOSED, {
    partitionId: owner.partitionId, entryId: command.entryId, reason,
    groups: groups.length, events: eventKeys.length});
  let answer;
  try {
    answer = await acknowledgementProposer(owner, command);
  } catch (error) {
    // The proposer owner normally returns a typed UNKNOWN. An exceptional
    // failure is still uncertainty, never permission to forget the command.
    if (laneIsCurrent(delivery, lane)) scheduleDeliveryRetry(delivery, error);
    return flushOutcome(lane, FLUSH.OUTCOME_UNKNOWN, {reason,
      events: eventKeys.length, entryId: command.entryId});
  } finally {
    pending.inFlight = false;
  }
  if (!laneIsCurrent(delivery, lane)) {
    return flushOutcome(lane, FLUSH.NOT_LEADER, {reason, events: eventKeys.length});
  }
  if (answer?.success === true) {
    settleAcknowledgedObligations(delivery, eventKeys);
    return flushOutcome(lane, FLUSH.COMMITTED,
      {reason, events: eventKeys.length, entryId: command.entryId,
        logIndex: answer.logIndex ?? null});
  }
  return handleAcknowledgementRefusal(delivery, lane, pending, answer, reason);
}

function acknowledgementFailureIsTerminal(failureCode) {
  return [CODE.UNKNOWN_EVENT, CODE.ENTRY_MISMATCH, CODE.POSITION_MISMATCH,
    CODE.BYTES_INVALID, CODE.IDENTITY_MISMATCH].includes(failureCode);
}

function handleAcknowledgementRefusal(delivery, lane, pending, answer, reason) {
  const {owner} = delivery;
  const {command, members, groups} = pending;
  const eventKeys = members.map(({eventKey}) => eventKey);
  const uncertain = isWriteOutcomeUnknown(answer);
  const failureCode = answer?.failureCode ?? null;
  if (failureCode === CODE.IDENTITY_COMPACTED &&
      reconcilePendingAcknowledgement(delivery, lane, pending)) {
    return flushOutcome(lane, FLUSH.RECONCILED,
      {reason, events: eventKeys.length, entryId: command.entryId, failureCode});
  }
  if (acknowledgementFailureIsTerminal(failureCode)) lane.held = failureCode;
  else scheduleDeliveryRetry(delivery, answer);
  logFlushRefusal(owner, groups, {failureCode, proposed: true});
  return flushOutcome(lane, uncertain ? FLUSH.OUTCOME_UNKNOWN : FLUSH.REFUSED,
    {reason, events: eventKeys.length, entryId: command.entryId, failureCode, proposed: true});
}

// Prefix reconciliation belongs to this lane's known pending identities,
// never to a new exact-event acknowledgement. Keep any uncovered members in
// their own bounded replacement batch, without combining outstanding batches.
function reconcilePendingAcknowledgement(delivery, lane, pending) {
  const progress = readCdcObligationProgress(delivery.owner.db);
  const members = pending.members.filter((member) => !isCdcPositionReclaimed(member, progress));
  if (members.length === pending.members.length) return false;
  lane.commands.delete(pending.command.entryId);
  if (members.length > 0) {
    const groups = groupsOfMembers(members);
    const command = Object.freeze(buildCdcAcknowledgementCommand(
      delivery.owner.partitionId, groups, stampOf(delivery.owner)));
    lane.commands.set(command.entryId, {command, members, groups, inFlight: false});
    scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED);
  }
  settleAcknowledgedObligations(delivery, [], progress);
  return true;
}

async function retryAcknowledgements(delivery, lane) {
  for (const pending of [...lane.commands.values()]) {
    if (!laneIsCurrent(delivery, lane) || lane.held !== null) return;
    if (!pending.inFlight) {
      await proposePendingAcknowledgement(delivery, lane, pending, REASON.DELIVERY_RETRY);
    }
  }
  if (laneIsCurrent(delivery, lane)) {
    drainPendingHydratedObligations(delivery, lane);
  }
  if (laneIsCurrent(delivery, lane) && lane.batch.events > 0 && lane.flushTimer === null) {
    await flushCdcAcknowledgements(delivery, REASON.DELIVERY_RETRY);
  }
}

// --- the drive ---

function scheduleDeliveryRetry(delivery, error = null, explicitDisposition = null) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  const disposition = resolveDeliveryRetryDisposition(delivery, lane, error, explicitDisposition);
  lane.lastRetryDisposition = disposition;
  if (disposition === OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME ||
      disposition === OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK) {
    if (disposition === OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME) lane.currentObligation = null;
    releaseContendedPropagationOwners(lane);
    disarmDeliveryRetry(owner, lane, disposition === OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
    return 0;
  }
  const {delayMs, advanceBackoff} = computeRetryDelayMs(lane, error, disposition);
  if (owner.isShutdown) return delayMs;
  const now = owner.timeSource.now();
  const dueAtMs = now + delayMs;
  if (lane.retryTimer.state === OBLIGATION_RETRY_STATE.ARMED) {
    if (dueAtMs >= (lane.retryTimer.dueAtMs ?? Infinity)) return delayMs;
    clearTimer(owner, lane.retryTimer.handle);
  }
  if (advanceBackoff) {
    lane.retryDelayMs = Math.min(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
      lane.retryDelayMs * 2);
  }
  const handle = owner.timeSource.setTimeout(() => {
    lane.retryTimer = IDLE_OBLIGATION_RETRY;
    if (!laneIsCurrent(delivery, lane)) return;
    trackOnOwner(owner, (async () => {
      await retryAcknowledgements(delivery, lane);
      if (laneIsCurrent(delivery, lane)) await driveCdcObligations(delivery, REASON.DELIVERY_RETRY);
    })());
  }, delayMs);
  lane.retryTimer = {state: OBLIGATION_RETRY_STATE.ARMED, handle, delayMs, dueAtMs};
  return delayMs;
}

function wakeContendedLaneForSliceTurn(delivery, lane) {
  if (!laneIsCurrent(delivery, lane) || delivery.owner.isShutdown) return;
  lane.consecutiveBackpressure = 0;
  lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  const retryArmed = lane.retryTimer.state === OBLIGATION_RETRY_STATE.ARMED;
  lane.sliceTurnReady = !retryArmed;
  if (retryArmed) {
    scheduleDeliveryRetry(delivery, {retryAfterMs: 1}, OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED);
  }
}

// Ship one composed range to every current subscriber as one ordered vector.
// It is covered when every branch answered for exactly this vector; a refusal
// (a subscriber not ready, a handler that threw, a member that cannot be
// built) leaves every row owed and stops the drive here, so order is kept.
async function deliverShipRange(delivery, lane, range, subscribers, context) {
  const events = eventsOfShipRange(range.obligations,
    () => delivery.nextCDCEventSequenceNumber());
  const cell = prepareCdcObligationProgress(delivery, lane, events, subscribers,
    range.windowCut);
  const hintState = {retryAfterMs: null, backpressured: false};
  for (let visited = 0; visited < subscribers.length; visited += 1) {
    const branch = nextCdcSubscriber(cell);
    const scoped = cdcSubscriberInvocation(delivery, lane, cell, branch, context, events,
      () => wakeContendedLaneForSliceTurn(delivery, lane));
    scoped.assertCurrent();
    if (branch.coverage.state !== CDC_COVERAGE_STATE.UNCOVERED) continue;
    const answer = await delivery.deliverCDCEventToSubscriber(branch.wrapper, events, scoped);
    scoped.assertCurrent();
    observeCdcSubscriber(branch, answer, events);
    if (branch.coverage.state === CDC_COVERAGE_STATE.UNCOVERED) {
      recordUncoveredSubscriberHint(hintState, answer);
    }
  }
  context.assertCurrent();
  const current = cdcProgressCurrent(delivery, lane, cell);
  const state = cdcObligationCoverage(cell);
  if (!current || state === CDC_COVERAGE_STATE.UNCOVERED) {
    throwUncoveredObligationError(lane, current, hintState);
  }
  lane.currentObligation = null;
  return {state, events, windowCut: cell.windowCut};
}

function drivePrecondition(delivery, lane, reason) {
  const {owner} = delivery;
  const state = owner.isShutdown || !owner.db ? DRIVE.SHUTDOWN :
    !laneIsCurrent(delivery, lane) ? DRIVE.NOT_LEADER :
      owner.cdcSubscribers.size === 0 ? DRIVE.NO_SUBSCRIBERS : DRIVE_PRECONDITION_MET;
  return state === DRIVE_PRECONDITION_MET ? {subscribers: [...owner.cdcSubscribers]} :
    {outcome: driveOutcome(lane, state, {reason, delivered: 0})};
}

// The lane is held at the head of `obligations` (the range it could not
// cover). A failure that is not typed backpressure was an attempt, so the
// shipping window halves; backpressure attempted nothing and leaves it.
function handleDeliveryFailure(delivery, lane, obligations, reason, delivered, error) {
  if (!laneIsCurrent(delivery, lane)) {
    return driveOutcome(lane, DRIVE.NOT_LEADER, {reason, delivered});
  }
  const {owner} = delivery;
  const [head] = obligations;
  owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
  const retryDelayMs = scheduleDeliveryRetry(delivery, error);
  if (lane.lastRetryDisposition === OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE) {
    narrowShipWindow(lane);
  }
  const logDetails = {
    partitionId: owner.partitionId,
    eventKey: head.eventKey,
    logIndex: head.logIndex,
    rows: obligations.length,
    error: error?.message ?? String(error),
    retryDelayMs,
    delivered,
  };
  if (isBackpressureError(error)) {
    owner.logger.debug?.(LOG_MSG.DELIVERY_HELD, logDetails);
  } else {
    owner.logger.warn(LOG_MSG.DELIVERY_HELD, logDetails);
  }
  return driveOutcome(lane, DRIVE.HELD_BY_SUBSCRIBER,
    {reason, delivered, eventKey: head.eventKey, rows: obligations.length, retryDelayMs});
}

// The pass ends on the lane's acknowledgement backpressure: before a range
// (the pre-pass found it at the first row) or inside a covered one, whose
// rows from the refused one on stay owed (`fields.unacknowledged` counts them).
function acknowledgementBackpressureOutcome(delivery, lane, reason, delivered, fields = {}) {
  releaseContendedPropagationOwners(lane);
  scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE);
  return driveOutcome(lane, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE, {reason, delivered, ...fields});
}

// Every member of a covered range is counted and emitted in order, each
// before its own acknowledgement. Acknowledgement is per row, in order, and
// stops at the first row the batch refuses: how many rows it took.
function acknowledgeShippedRange(delivery, obligations, events) {
  const {owner} = delivery;
  let acknowledged = 0;
  let accepting = true;
  obligations.forEach((obligation, index) => {
    owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
    owner.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, events[index]);
    accepting = accepting && acknowledgeDelivered(delivery, obligation);
    if (accepting) acknowledged += 1;
  });
  return acknowledged;
}

// A provisional range is left owed and passed. A committed one is
// acknowledged; the scan cursor never moves past a row it could not
// acknowledge, so that row and the rows after it are shipped again in order.
function recordShippedRange(delivery, lane, range, shipped, reason, delivered) {
  const {obligations} = range;
  if (shipped.state === CDC_COVERAGE_STATE.PROVISIONAL) {
    if (lane.scan !== null) lane.scan.provisional = true;
    advanceScanCursor(lane, obligations.at(-1));
    return {delivered: 0, visited: obligations.length};
  }
  const acknowledged = acknowledgeShippedRange(delivery, obligations, shipped.events);
  lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  lane.consecutiveBackpressure = 0;
  if (shipped.windowCut) widenShipWindow(lane);
  if (acknowledged > 0) advanceScanCursor(lane, obligations[acknowledged - 1]);
  if (acknowledged < obligations.length) {
    return {outcome: acknowledgementBackpressureOutcome(delivery, lane, reason,
      delivered + acknowledged, {unacknowledged: obligations.length - acknowledged})};
  }
  return {delivered: acknowledged, visited: obligations.length};
}

// A range whose delivery threw: when every row was acknowledged meanwhile (a
// hydration handshake retired the invocation) the scan passes it; otherwise
// the lane is held at it.
function settleShipRangeFailure(delivery, lane, range, reason, delivered, error) {
  const {obligations} = range;
  if (isShipRangeAlreadyAcknowledged(delivery, lane, obligations)) {
    advanceScanCursor(lane, obligations.at(-1));
    return {delivered: 0, visited: 0};
  }
  return {outcome: handleDeliveryFailure(delivery, lane, obligations, reason, delivered, error)};
}

async function driveShipRange(delivery, lane, range, subscribers, reason, delivered, context) {
  try {
    const shipped = await deliverShipRange(delivery, lane, range, subscribers, context);
    return recordShippedRange(delivery, lane, range, shipped, reason, delivered);
  } catch (error) {
    return settleShipRangeFailure(delivery, lane, range, reason, delivered, error);
  }
}

function yieldPageOutcome(delivery, lane, scan, reason, delivered, yieldedOnContention) {
  if (yieldedOnContention && !scan.provisional) scan.through = null;
  const disposition = delivered > 0 || !scan.provisional ?
    OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED : OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE;
  const hint = yieldedOnContention && disposition === OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED ?
    {retryAfterMs: 10} : null;
  const retryDelayMs = scheduleDeliveryRetry(delivery, hint, disposition);
  return driveOutcome(lane, DRIVE.PAGE_YIELDED, {reason, delivered, retryDelayMs});
}

function hasUnproposedCommand(lane) {
  for (const pending of lane.commands.values()) {
    if (!pending.inFlight) return true;
  }
  return false;
}

function finalizeDrainedScan(delivery, lane, scan) {
  const {owner} = delivery;
  const noInFlightAck = lane.pending.size === 0 && lane.commands.size === 0;
  if (hasOwedWorkBeyondScan(owner, scan) || (noInFlightAck && readOwedCdcHead(owner.db) !== null)) {
    lane.rerun = true;
    return;
  }
  if (lane.rerun) return;
  releaseContendedPropagationOwners(lane);
  if (!hasUnproposedCommand(lane)) {
    scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
  }
}

function drivePageFinished(
  delivery, lane, visited, reason, delivered, yieldedOnContention = false) {
  const scan = lane.scan;
  const moreWorkAfterContention = yieldedOnContention &&
    (hasOwedWorkBeyondScan(delivery.owner, scan) || lane.rerun);
  if (((visited >= BOUND.DRIVE_PAGE_ROWS || yieldedOnContention) && !scanReachedTail(scan)) ||
      moreWorkAfterContention) {
    if (moreWorkAfterContention) lane.rerun = false;
    return yieldPageOutcome(delivery, lane, scan, reason, delivered, yieldedOnContention);
  }
  lane.scan = null;
  if (scan.provisional) {
    const retryDelayMs = scheduleDeliveryRetry(
      delivery, null, OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE);
    return driveOutcome(lane, DRIVE.PROVISIONAL, {reason, delivered, retryDelayMs});
  }
  lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  lane.consecutiveBackpressure = 0;
  finalizeDrainedScan(delivery, lane, scan);
  return driveOutcome(lane, DRIVE.DRAINED, {reason, delivered});
}

async function driveOnce(delivery, lane, reason) {
  const precondition = drivePrecondition(delivery, lane, reason);
  if (precondition.outcome) return precondition.outcome;
  const subscribersCurrent = captureSubscriberCurrentness(delivery, precondition.subscribers);
  let delivered = 0;
  let visited = 0;
  let yieldedOnContention = false;
  while (visited < BOUND.DRIVE_PAGE_ROWS) {
    const context = beginCdcDeliveryInvocation(delivery,
      () => laneIsCurrent(delivery, lane) && subscribersCurrent(),
      () => resumeAfterCdcCleanup(delivery));
    let stepContended = false;
    try {
      const range = composeCdcShipRange(delivery, lane, acknowledgeDelivered,
        BOUND.DRIVE_PAGE_ROWS - visited);
      visited += range.passed;
      if (range.state === SHIP_RANGE_STATE.ACKNOWLEDGEMENT_BACKPRESSURE) {
        return acknowledgementBackpressureOutcome(delivery, lane, reason, delivered);
      }
      if (range.state !== SHIP_RANGE_STATE.READY) break;
      const result = await driveShipRange(delivery, lane, range,
        precondition.subscribers, reason, delivered, context);
      if (result.outcome) return result.outcome;
      visited += result.visited;
      delivered += result.delivered;
      stepContended = context.isContended?.() === true &&
        (delivered > 0 || lane.scan?.provisional === true);
    } finally {
      context.finish();
    }
    if (delivery.activeCdcInvocation) {
      lane.rerun = true;
      return driveOutcome(lane, DRIVE.JOINED_IN_FLIGHT, {reason, delivered});
    }
    if (stepContended) {
      yieldedOnContention = true;
      break;
    }
  }
  return drivePageFinished(delivery, lane, visited, reason, delivered, yieldedOnContention);
}

function captureSubscriberCurrentness(delivery, subscribers) {
  const {owner} = delivery;
  const lifetimes = subscribers.map((wrapper) => {
    const subscriber = delivery.getCDCSubscriberSource(wrapper);
    const state = owner.cdcSubscriberStates?.get(subscriber);
    return {wrapper, subscriber, state, epoch: state?.subscriptionEpoch};
  });
  return () => owner.cdcSubscribers.size === lifetimes.length && lifetimes.every((entry) =>
    owner.cdcSubscribers.has(entry.wrapper) &&
    owner.cdcSubscriberStates?.get(entry.subscriber) === entry.state &&
    entry.state?.subscriptionEpoch === entry.epoch);
}

function resumeAfterCdcCleanup(delivery) {
  const lane = delivery.obligationLane;
  if (!lane.inFlight && lane.rerun && laneIsCurrent(delivery, lane)) {
    lane.rerun = false;
    scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED);
  }
}

function canContinueDrainedPass(delivery, lane, outcome) {
  return outcome.state === DRIVE.DRAINED && lane.rerun &&
    !delivery.activeCdcInvocation && laneIsCurrent(delivery, lane);
}

async function runSingleFlightDrivePasses(delivery, lane, reason) {
  let outcome;
  let totalDelivered = 0;
  do {
    lane.rerun = false;
    outcome = await driveOnce(delivery, lane, reason);
    totalDelivered += outcome.delivered ?? 0;
  } while (canContinueDrainedPass(delivery, lane, outcome));
  if (lane.rerun && laneIsCurrent(delivery, lane)) {
    lane.rerun = false;
    scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED);
  }
  return totalDelivered === (outcome.delivered ?? 0) ?
    outcome : driveOutcome(lane, outcome.state, {...outcome, delivered: totalDelivered});
}

/**
 * Deliver every owed obligation of the ledger to the current subscribers, in
 * log order, on the leader; single-flight (a drive requested while one runs
 * joins it, and the running drive runs once more). Each acknowledged event
 * enters the acknowledgement batch.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {string} reason - A PARTITION_CDC_OBLIGATION_REASON.
 * @return {Promise<Object>} {state: a PARTITION_CDC_OBLIGATION_DRIVE_STATE,
 *   delivered, ...}.
 */
async function driveCdcObligations(delivery, reason) {
  const lane = laneOf(delivery);
  if (lane.inFlight || delivery.activeCdcInvocation) {
    lane.rerun = true;
    return Object.freeze({state: DRIVE.JOINED_IN_FLIGHT, reason});
  }
  lane.inFlight = true;
  try {
    return await runSingleFlightDrivePasses(delivery, lane, reason);
  } catch (error) {
    delivery.owner.logger.error(LOG_MSG.DRIVE_FAILED, {
      partitionId: delivery.owner.partitionId, reason,
      error: error?.message ?? String(error)});
    throw error;
  } finally {
    lane.inFlight = false;
  }
}

/**
 * What the lane holds now (diagnostics).
 * @param {Object} delivery - The CDC delivery owner.
 * @return {Object} The lane's state, read-only.
 */
function cdcObligationDiagnosticsOf(delivery) {
  const lane = laneOf(delivery);
  return Object.freeze({
    inFlight: lane.inFlight, pendingAcknowledgements: lane.pending.size,
    outstandingAcknowledgementBatches: lane.commands.size,
    batchEvents: lane.batch.events, batchBytes: lane.batch.bytes,
    batchGroups: lane.batch.groups.size, flushArmed: lane.flushTimer !== null,
    retryArmed: lane.retryTimer.state === OBLIGATION_RETRY_STATE.ARMED,
    held: lane.held, proposerRegistered: acknowledgementProposer !== null,
    shipWindow: lane.shipWindow, lastDrive: lane.lastDrive, lastFlush: lane.lastFlush,
  });
}

// A hydration image through `throughLogIndex` retires the range in flight only
// when it covers the whole range (its last position); a range that reaches
// above the image still owes its tail and keeps its invocation.
function retireHydratedInvocationAndResetIdleScan(delivery, lane, throughLogIndex) {
  const lastLogIndex = lane.currentObligation?.last.logIndex;
  if (lane.currentObligation === null ||
      (Number.isSafeInteger(lastLogIndex) && lastLogIndex <= throughLogIndex)) {
    lane.currentObligation = null;
    delivery.activeCdcInvocation?.retire();
  }
  if (!lane.inFlight) lane.scan = null;
}

function acknowledgeHydratedObligationList(delivery, lane, obligations) {
  let acknowledged = 0;
  for (const obligation of obligations) {
    if (lane.pending.has(obligation.eventKey)) continue;
    if (lane.commands.size >= BOUND.ACK_MAX_OUTSTANDING_BATCHES &&
        lane.batch.events >= BOUND.ACK_BATCH_MAX_EVENTS) {
      break;
    }
    if (!acknowledgeDelivered(delivery, obligation)) break;
    acknowledged += 1;
  }
  return acknowledged;
}

function drainPendingHydratedObligations(delivery, lane) {
  const throughLogIndex = lane.hydratedThroughLogIndex || 0;
  const {owner} = delivery;
  if (throughLogIndex <= 0 || owner.isShutdown || !owner.db || !laneIsCurrent(delivery, lane)) {
    return 0;
  }
  const obligations = readOwedCdcObligations(owner.db, {
    through: {logIndex: throughLogIndex, ordinal: Number.MAX_SAFE_INTEGER},
    limit: Number.MAX_SAFE_INTEGER,
  });
  if (obligations.length === 0) return 0;
  const acknowledged = acknowledgeHydratedObligationList(delivery, lane, obligations);
  if (lane.batch.events > 0 && lane.commands.size < BOUND.ACK_MAX_OUTSTANDING_BATCHES) {
    trackOnOwner(owner, flushCdcAcknowledgements(delivery, REASON.SUBSCRIPTION_HANDSHAKE));
  }
  return acknowledged;
}

function acknowledgeHydratedObligationsThrough(delivery, appliedIndex) {
  const throughLogIndex = Number(appliedIndex);
  if (!Number.isSafeInteger(throughLogIndex) || throughLogIndex <= 0) {
    return Object.freeze({acknowledged: 0});
  }
  const lane = laneOf(delivery);
  const {owner} = delivery;
  if (owner.isShutdown || !owner.db || !laneIsCurrent(delivery, lane)) {
    return Object.freeze({acknowledged: 0});
  }
  lane.hydratedThroughLogIndex = Math.max(lane.hydratedThroughLogIndex || 0, throughLogIndex);
  retireHydratedInvocationAndResetIdleScan(delivery, lane, throughLogIndex);
  const acknowledged = drainPendingHydratedObligations(delivery, lane);
  const remainingAfterHydration = readOwedCdcObligations(owner.db, {
    after: {logIndex: throughLogIndex, ordinal: Number.MAX_SAFE_INTEGER}, limit: 1,
  });
  if (remainingAfterHydration.length === 0) releaseContendedPropagationOwners(lane);
  return Object.freeze({acknowledged});
}

export {OBLIGATION_RETRY_DISPOSITION, acknowledgeHydratedObligationsThrough,
  cdcObligationDiagnosticsOf, createCdcObligationLane,
  driveCdcObligations, flushCdcAcknowledgements, handleDeliveryFailure,
  registerCdcAcknowledgementProposer,
  resetCdcObligationLane, scheduleDeliveryRetry, settleAcknowledgedObligations};
