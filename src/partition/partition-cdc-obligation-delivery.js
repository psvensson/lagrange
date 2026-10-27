// The obligation lane of the CDC delivery owner (TX1 design revision 10,
// section 8.3 point 5; owner ruling 2026-10-11): on the leader it drives owed
// obligations of the durable ledger (partition-cdc-obligation-ledger.js) to
// current subscribers in log order, batches acknowledgements under count/byte
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
import {CDC_COMPLETION, CDC_COVERAGE_STATE} from '../cdc/cdc-delivery-outcome.js';
import {beginCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {cdcObligationCoverage, cdcProgressCurrent, cdcSubscriberInvocation, nextCdcSubscriber,
  observeCdcSubscriber, prepareCdcObligationProgress} from './partition-cdc-obligation-progress.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND, PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_EVENT_FIELD as FIELD, PARTITION_CDC_OBLIGATION_FAILURE_CODE as CODE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE as FLUSH, PARTITION_CDC_OBLIGATION_LOG_MSG as LOG_MSG,
  PARTITION_CDC_OBLIGATION_ORIGIN as ORIGIN, PARTITION_CDC_OBLIGATION_REASON as REASON} from
  './partition-cdc-obligation-constants.js';
import {acknowledgedEventBytesOf, buildCdcAcknowledgementCommand, cdcObligationEventKeyDigest,
  countRetainedDeliveredCdcObligations, emptyAcknowledgedBytes, isCdcPositionReclaimed,
  readCdcObligationProgress, readOwedCdcHead, readOwedCdcObligations, readOwedCdcTail} from
  './partition-cdc-obligation-ledger.js';

// The one acknowledgement proposer (see the header): (service, command) ->
// Promise<write answer>, the write commit owner's.
let acknowledgementProposer = null;

const OBLIGATION_RETRY_STATE = Object.freeze({IDLE: 'idle', ARMED: 'armed'});
const IDLE_OBLIGATION_RETRY = Object.freeze({state: OBLIGATION_RETRY_STATE.IDLE, handle: null});
const OBLIGATION_DRIVE_STEP = Object.freeze({READY: 'ready', PENDING: 'pending_acknowledgement'});
const OBLIGATION_RETRY_DISPOSITION = Object.freeze({
  PAGE_YIELDED: 'page_yielded', TRANSIENT_FAILURE: 'transient_failure',
  BACKPRESSURE: 'backpressure', NO_PENDING_WORK: 'no_pending_work',
  STALE_LIFETIME: 'stale_lifetime',
});

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

function emptyBatch() {
  return {groups: new Map(), events: 0, bytes: emptyAcknowledgedBytes(),
    firstAcknowledgedAt: null};
}

/**
 * The lane's state, held by one CDC delivery owner instance.
 * @return {Object} A fresh lane.
 */
function createCdcObligationLane(tenure = null) {
  return {
    tenure, inFlight: false, rerun: false, scan: null, currentObligation: null,
    // eventKey -> {logIndex, ordinal}: acknowledged here, flag not yet
    // committed (in the batch or in a proposed CDC_DELIVERED). Never
    // redelivered by this tenure; cleared when a tenure or the replica ends.
    pending: new Map(), commands: new Map(), batch: emptyBatch(),
    flushTimer: null, retryTimer: IDLE_OBLIGATION_RETRY,
    retryDelayMs: PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS,
    // The code the last flush was refused with before it was proposed; no
    // deadline is armed again until a new acknowledgement arrives.
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

function trackOnOwner(owner, promise) {
  if (typeof owner.trackPendingCDCEvent === PARTITION_SERVICE_TYPE.FUNCTION) {
    owner.trackPendingCDCEvent(promise);
  }
  return promise;
}

/**
 * Forget every acknowledgement in flight: a tenure or the replica ended, or
 * the ledger decided. The ledger stays the authority for what is owed.
 * @param {Object} delivery - The CDC delivery owner.
 */
function resetCdcObligationLane(delivery) {
  const lane = delivery.obligationLane;
  const tenure = currentTenureOf(delivery.owner);
  if (lane.tenure === tenure && !delivery.owner.isShutdown) return;
  clearTimer(delivery.owner, lane.flushTimer);
  clearTimer(delivery.owner, lane.retryTimer.handle);
  delivery.activeCdcInvocation?.retire();
  delivery.obligationLane = createCdcObligationLane(tenure);
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
    trackOnOwner(delivery.owner, driveCdcObligations(delivery, REASON.AFTER_FLUSH));
  }
}

function eventOf(obligation, sequenceNumber) {
  const event = {
    ...JSON.parse(obligation.eventJson),
    [FIELD.EVENT_KEY]: obligation.eventKey, [FIELD.ENTRY_ID]: obligation.entryId,
    [FIELD.LOG_INDEX]: obligation.logIndex, [FIELD.ORDINAL]: obligation.ordinal,
    sourceLogIndex: obligation.logIndex, sourceOrdinal: obligation.ordinal,
    sequenceNumber,
  };
  return Object.freeze({...event, ...captureCdcEvents([event])[0]});
}

// --- the acknowledgement batch ---

function stampOf(owner) {
  return {timestamp: owner.hlcClock.now().toString(),
    proposedBy: owner.replicaId, proposedAt: owner.timeSource.now()};
}

// The batch as the pinned form wants it: groups by ascending log index, each
// group's keys by ascending ordinal. The batch is left empty.
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

// Put a taken batch back (a flush refused before it was proposed): the keys
// stay pending and are proposed again with the next acknowledgements.
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

// One acknowledged event enters the batch under its entry; a batch at either
// bound is proposed at once, otherwise by the deadline.
function acknowledgeDelivered(delivery, obligation) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  const addedBytes = acknowledgedEventBytesOf(obligation.eventKey,
    obligation.logIndex, obligation.ordinal, !lane.batch.groups.has(obligation.logIndex));
  if (lane.batch.events > 0 && lane.batch.bytes + addedBytes > BOUND.ACK_BATCH_MAX_BYTES) {
    trackOnOwner(owner, flushCdcAcknowledgements(delivery, REASON.BATCH_BYTES_BOUND));
  }
  lane.pending.set(obligation.eventKey,
    {logIndex: obligation.logIndex, ordinal: obligation.ordinal});
  addToBatch(lane, obligation);
  lane.batch.firstAcknowledgedAt ??= owner.timeSource.now();
  if (lane.batch.events >= BOUND.ACK_BATCH_MAX_EVENTS) {
    trackOnOwner(owner, flushCdcAcknowledgements(delivery, REASON.BATCH_EVENTS_BOUND));
    return;
  }
  armFlushDeadline(delivery);
}

function flushOutcome(lane, state, fields) {
  lane.lastFlush = Object.freeze({state, ...fields});
  return lane.lastFlush;
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
  clearTimer(owner, lane.flushTimer);
  lane.flushTimer = null;
  if (lane.batch.events === 0) return flushOutcome(lane, FLUSH.EMPTY, {reason});
  if (lane.commands.size >= BOUND.ACK_MAX_OUTSTANDING_BATCHES) {
    return flushOutcome(lane, FLUSH.BACKPRESSURE, {reason});
  }
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
  if (laneIsCurrent(delivery, lane) && lane.batch.events > 0) {
    await flushCdcAcknowledgements(delivery, REASON.DELIVERY_RETRY);
  }
}

// --- the drive ---

function driveOutcome(lane, state, fields) {
  lane.lastDrive = Object.freeze({state, ...fields});
  return lane.lastDrive;
}

function errorBackpressureReason(error) {
  const cause = error.cause;
  if (error.reason !== undefined && error.reason !== null) return error.reason;
  return cause ? (cause.reason ?? cause.error) : undefined;
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
  if (resetDelay) lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
}

function computeRetryDelayMs(lane, error, disposition) {
  if (disposition === OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED) {
    lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  }
  const rawHint = error?.retryAfterMs;
  const hasHint = Number.isFinite(rawHint) && rawHint > 0;
  const delayMs = Math.min(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
    Math.max(1, hasHint ? Math.floor(rawHint) : lane.retryDelayMs));
  return {delayMs, advanceBackoff: !hasHint &&
    disposition === OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE};
}

function scheduleDeliveryRetry(delivery, error = null, explicitDisposition = null) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  const disposition = resolveDeliveryRetryDisposition(delivery, lane, error, explicitDisposition);
  lane.lastRetryDisposition = disposition;
  if (disposition === OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME ||
      disposition === OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK) {
    if (disposition === OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME) lane.currentObligation = null;
    disarmDeliveryRetry(owner, lane, disposition === OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
    return 0;
  }
  const {delayMs, advanceBackoff} = computeRetryDelayMs(lane, error, disposition);
  if (lane.retryTimer.state === OBLIGATION_RETRY_STATE.ARMED || owner.isShutdown) return delayMs;
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
  lane.retryTimer = {state: OBLIGATION_RETRY_STATE.ARMED, handle};
  return delayMs;
}

function recordUncoveredSubscriberHint(state, answer) {
  const hint = answer?.retryAfterMs;
  if (Number.isFinite(hint) && hint > 0) {
    state.retryAfterMs = state.retryAfterMs === null ? hint : Math.min(state.retryAfterMs, hint);
  }
  if (answer?.error === CDC_COMPLETION.BACKPRESSURE ||
      answer?.reason === CDC_COMPLETION.BACKPRESSURE) state.backpressured = true;
}

function throwUncoveredObligationError(lane, current, state) {
  if (!current) lane.currentObligation = null;
  const error = new Error(CDC_COMPLETION.UNKNOWN);
  error.deferRetry = true;
  if (state.retryAfterMs !== null) error.retryAfterMs = state.retryAfterMs;
  if (state.backpressured) error.reason = CDC_COMPLETION.BACKPRESSURE;
  throw error;
}

// Deliver one owed obligation to every current subscriber; acknowledged when
// each handler resolved. A refusal (a subscriber not ready, a handler that
// threw) leaves it owed and stops the drive here, so order is kept.
async function deliverObligation(delivery, lane, obligation, subscribers, context) {
  const {owner} = delivery;
  const event = eventOf(obligation, delivery.nextCDCEventSequenceNumber());
  const cell = prepareCdcObligationProgress(delivery, lane, event, subscribers);
  const hintState = {retryAfterMs: null, backpressured: false};
  for (let visited = 0; visited < subscribers.length; visited += 1) {
    const branch = nextCdcSubscriber(cell);
    const scoped = cdcSubscriberInvocation(delivery, lane, cell, branch, context, event);
    scoped.assertCurrent();
    if (branch.coverage.state !== CDC_COVERAGE_STATE.UNCOVERED) continue;
    const answer = await delivery.deliverCDCEventToSubscriber(branch.wrapper, event, scoped);
    scoped.assertCurrent();
    observeCdcSubscriber(branch, answer, event);
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
  if (state === CDC_COVERAGE_STATE.PROVISIONAL) return state;
  owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
  owner.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, event);
  acknowledgeDelivered(delivery, obligation);
  return state;
}

function drivePrecondition(delivery, lane, reason) {
  const {owner} = delivery;
  const state = owner.isShutdown || !owner.db ? DRIVE.SHUTDOWN :
    !laneIsCurrent(delivery, lane) ? DRIVE.NOT_LEADER :
      owner.cdcSubscribers.size === 0 ? DRIVE.NO_SUBSCRIBERS : OBLIGATION_DRIVE_STEP.READY;
  return state === OBLIGATION_DRIVE_STEP.READY ? {subscribers: [...owner.cdcSubscribers]} :
    {outcome: driveOutcome(lane, state, {reason, delivered: 0})};
}

function drivePage(owner, lane) {
  lane.scan ??= {cursor: null, through: readOwedCdcTail(owner.db), provisional: false};
  lane.scan.through ??= readOwedCdcTail(owner.db);
  return lane.scan.through === null ? [] : readOwedCdcObligations(owner.db,
    {after: lane.scan.cursor ?? undefined, through: lane.scan.through, limit: 1});
}

// Delivering past the lowest owed row keeps every delivered row above it in
// the ledger (decision D1 reclaims only below it), so the lane does that only
// while those retained rows and its own pending acknowledgements stay under
// RETAINED_DELIVERED_MAX; the lowest owed row itself is always deliverable,
// and a scan stopped here restarts from it (lane.scan cleared).
function retainedDeliveredBackpressured(owner, lane, obligation) {
  const head = readOwedCdcHead(owner.db);
  if (head === null || (head.logIndex === obligation.logIndex &&
      head.ordinal === obligation.ordinal)) {
    return false;
  }
  return lane.pending.size + countRetainedDeliveredCdcObligations(owner.db,
    BOUND.RETAINED_DELIVERED_MAX) >= BOUND.RETAINED_DELIVERED_MAX;
}

function acknowledgementBackpressured(owner, lane, obligation) {
  if (lane.held !== null || lane.commands.size >= BOUND.ACK_MAX_OUTSTANDING_BATCHES) return true;
  if (!retainedDeliveredBackpressured(owner, lane, obligation)) return false;
  lane.scan = null;
  return true;
}

function obligationCursor(obligation) {
  return {logIndex: obligation.logIndex, ordinal: obligation.ordinal};
}

function handleDeliveryFailure(delivery, lane, obligation, reason, delivered, error) {
  if (!laneIsCurrent(delivery, lane)) {
    return driveOutcome(lane, DRIVE.NOT_LEADER, {reason, delivered});
  }
  const {owner} = delivery;
  owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
  const retryDelayMs = scheduleDeliveryRetry(delivery, error);
  owner.logger.warn(LOG_MSG.DELIVERY_HELD, {
    partitionId: owner.partitionId, eventKey: obligation.eventKey,
    logIndex: obligation.logIndex, error: error?.message ?? String(error),
    retryDelayMs, delivered});
  return driveOutcome(lane, DRIVE.HELD_BY_SUBSCRIBER,
    {reason, delivered, eventKey: obligation.eventKey, retryDelayMs});
}

async function driveOneObligation(delivery, lane, obligation, subscribers,
  reason, delivered, context) {
  const step = acknowledgementBackpressured(delivery.owner, lane, obligation) ?
    DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE :
    lane.pending.has(obligation.eventKey) ? OBLIGATION_DRIVE_STEP.PENDING :
      OBLIGATION_DRIVE_STEP.READY;
  if (step === DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE) {
    scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE);
    return {outcome: driveOutcome(lane, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE, {reason, delivered})};
  }
  if (step === OBLIGATION_DRIVE_STEP.PENDING) {
    lane.scan.cursor = obligationCursor(obligation);
    return {delivered: 0};
  }
  try {
    const result = await deliverObligation(delivery, lane, obligation, subscribers, context);
    if (result === CDC_COVERAGE_STATE.PROVISIONAL) lane.scan.provisional = true;
    else lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    lane.scan.cursor = obligationCursor(obligation);
    return {delivered: result === CDC_COVERAGE_STATE.PROVISIONAL ? 0 : 1};
  } catch (error) {
    return {outcome: handleDeliveryFailure(
      delivery, lane, obligation, reason, delivered, error)};
  }
}

function hasOwedWorkBeyondScan(owner, scan) {
  const tail = readOwedCdcTail(owner.db);
  if (tail === null) return false;
  if (scan.through === null) return true;
  return tail.logIndex > scan.through.logIndex ||
    (tail.logIndex === scan.through.logIndex && tail.ordinal > scan.through.ordinal);
}

function scanReachedTail(scan) {
  return scan.cursor?.logIndex === scan.through?.logIndex &&
    scan.cursor?.ordinal === scan.through?.ordinal;
}

function yieldPageOutcome(delivery, lane, scan, reason, delivered, yieldedOnContention) {
  if (yieldedOnContention && !scan.provisional) scan.through = null;
  const disposition = delivered > 0 || !scan.provisional ?
    OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED : OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE;
  const retryDelayMs = scheduleDeliveryRetry(delivery, null, disposition);
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
  } else if (!lane.rerun && !hasUnproposedCommand(lane)) {
    scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
  }
}

function drivePageFinished(
  delivery, lane, visited, reason, delivered, yieldedOnContention = false,
) {
  const scan = lane.scan;
  if ((visited >= BOUND.DRIVE_PAGE_ROWS || yieldedOnContention) && !scanReachedTail(scan)) {
    return yieldPageOutcome(delivery, lane, scan, reason, delivered, yieldedOnContention);
  }
  lane.scan = null;
  if (scan.provisional) {
    const retryDelayMs = scheduleDeliveryRetry(
      delivery, null, OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE);
    return driveOutcome(lane, DRIVE.PROVISIONAL, {reason, delivered, retryDelayMs});
  }
  lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  finalizeDrainedScan(delivery, lane, scan);
  return driveOutcome(lane, DRIVE.DRAINED, {reason, delivered});
}

async function driveOnce(delivery, lane, reason) {
  const {owner} = delivery;
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
      const [obligation] = drivePage(owner, lane);
      if (!obligation) break;
      visited += 1;
      const result = await driveOneObligation(delivery, lane, obligation,
        precondition.subscribers, reason, delivered, context);
      if (result.outcome) return result.outcome;
      delivered += result.delivered;
      stepContended = context.isContended?.() === true && delivered > 0;
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
    lastDrive: lane.lastDrive, lastFlush: lane.lastFlush,
  });
}

export {OBLIGATION_RETRY_DISPOSITION, cdcObligationDiagnosticsOf, createCdcObligationLane,
  driveCdcObligations, flushCdcAcknowledgements, registerCdcAcknowledgementProposer,
  resetCdcObligationLane, scheduleDeliveryRetry, settleAcknowledgedObligations};
