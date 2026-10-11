// The obligation lane of the CDC delivery owner (TX1 design revision 10,
// section 8.3 point 5; owner ruling 2026-10-11): on the leader it
// drives the owed obligations of the durable ledger
// (partition-cdc-obligation-ledger.js) to every current subscriber in log
// order, batches the acknowledgements it receives - grouped by the committed
// entry that owes each event, under a count bound, a byte bound and a flush
// deadline - and proposes each batch as one CDC_DELIVERED committed command
// whose application marks those events delivered on every replica. An event
// is acknowledged when every current subscriber's handler resolved for it;
// nothing else marks an event delivered. An acknowledged event whose
// CDC_DELIVERED has not committed stays owed in the ledger: a crash before
// that commit redelivers it (same identity; the consumer de-duplicates), and
// never loses it. A new leadership tenure, and a restart, start from the
// ledger alone.
//
// Composition: this lane is imported by the CDC delivery owner
// (partition-cdc-delivery.js), which the partition service's shared module
// imports, and the write commit owner (partition-service-raft-write-commit.js)
// imports that shared module - so the lane cannot import the proposer without
// a cycle. The committed-entry CDC hook (partition-cdc-obligation.js), loaded
// with the partition's application chain, registers the proposer once at load
// (registerCdcAcknowledgementProposer); until one is registered a flush is a
// typed PROPOSER_UNAVAILABLE outcome and the batch stays pending (R11).

import {
  CDC_PIPELINE_METRIC,
} from '../constants/cdc-lifecycle-constants.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_TYPE,
} from './partition-service-constants.js';
import {admitCommittedCommand} from './partition-committed-command-admission.js';
import {isWriteOutcomeUnknown} from './partition-write-kernel.js';
import {isProvisionalCdcOutcome} from '../cdc/cdc-delivery-outcome.js';
import {
  PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_EVENT_FIELD as FIELD,
  PARTITION_CDC_OBLIGATION_FAILURE_CODE as CODE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE as FLUSH,
  PARTITION_CDC_OBLIGATION_LOG_MSG as LOG_MSG,
  PARTITION_CDC_OBLIGATION_ORIGIN as ORIGIN,
  PARTITION_CDC_OBLIGATION_REASON as REASON,
} from './partition-cdc-obligation-constants.js';
import {
  acknowledgedEventBytesOf,
  buildCdcAcknowledgementCommand,
  cdcObligationEventKeyDigest,
  emptyAcknowledgedBytes,
  readOwedCdcObligations,
  readOwedCdcTail,
} from './partition-cdc-obligation-ledger.js';

// The one acknowledgement proposer (see the header): (service, command) ->
// Promise<write answer>, the write commit owner's.
let acknowledgementProposer = null;

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
    tenure,
    inFlight: false,
    rerun: false,
    scan: null,
    // eventKey -> {logIndex, ordinal}: acknowledged here, flag not yet
    // committed (in the batch or in a proposed CDC_DELIVERED). Never
    // redelivered by this tenure; cleared when a tenure or the replica ends.
    pending: new Map(),
    commands: new Map(),
    batch: emptyBatch(),
    flushTimer: null,
    retryTimer: null,
    retryDelayMs: PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS,
    // The code the last flush was refused with before it was proposed; no
    // deadline is armed again until a new acknowledgement arrives.
    held: null,
    lastDrive: null,
    lastFlush: null,
  };
}

function currentTenureOf(owner) {
  return owner.isLeader && !owner.isShutdown ? owner.leadershipTenure ?? null : null;
}

function laneOf(delivery) {
  const tenure = currentTenureOf(delivery.owner);
  if (delivery.obligationLane.tenure !== tenure) {
    resetCdcObligationLane(delivery);
  }
  return delivery.obligationLane;
}

function laneIsCurrent(delivery, lane) {
  return lane.tenure !== null && delivery.obligationLane === lane &&
    currentTenureOf(delivery.owner) === lane.tenure;
}

function clearTimer(owner, handle) {
  if (handle !== null) {
    owner.timeSource.clearTimeout(handle);
  }
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
  if (lane.tenure === tenure && !delivery.owner.isShutdown) {
    return;
  }
  clearTimer(delivery.owner, lane.flushTimer);
  clearTimer(delivery.owner, lane.retryTimer);
  delivery.obligationLane = createCdcObligationLane(tenure);
}

/**
 * The ledger committed these events delivered (the CDC_DELIVERED applied):
 * they are no longer pending here.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Array<string>} eventKeys - The acknowledged keys.
 */
function settleAcknowledgedObligations(delivery, eventKeys) {
  const lane = laneOf(delivery);
  for (const eventKey of eventKeys) {
    lane.pending.delete(eventKey);
  }
  for (const [entryId, pending] of lane.commands) {
    if (pending.eventKeys.every((key) => !lane.pending.has(key))) {
      lane.commands.delete(entryId);
    }
  }
  if (laneIsCurrent(delivery, lane)) {
    trackOnOwner(delivery.owner, driveCdcObligations(delivery, REASON.AFTER_FLUSH));
  }
}

function eventOf(obligation, sequenceNumber) {
  return {
    ...JSON.parse(obligation.eventJson),
    [FIELD.EVENT_KEY]: obligation.eventKey,
    [FIELD.ENTRY_ID]: obligation.entryId,
    [FIELD.LOG_INDEX]: obligation.logIndex,
    [FIELD.ORDINAL]: obligation.ordinal,
    sourceLogIndex: obligation.logIndex,
    sourceOrdinal: obligation.ordinal,
    sequenceNumber,
  };
}

// --- the acknowledgement batch ---

function stampOf(owner) {
  return {
    timestamp: owner.hlcClock.now().toString(),
    proposedBy: owner.replicaId,
    proposedAt: owner.timeSource.now(),
  };
}

// The batch as the pinned form wants it: groups by ascending log index, each
// group's keys by ascending ordinal. The batch is left empty.
function takeBatch(lane) {
  const members = [...lane.batch.groups.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([logIndex, grouped]) => grouped
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((member) => ({...member, logIndex})));
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
  lane.batch = emptyBatch();
  return {groups, members};
}

function keysOf(groups) {
  return groups.flatMap((group) => group.events);
}

function armFlushDeadline(delivery) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  if (lane.flushTimer !== null || lane.held !== null || owner.isShutdown) {
    return;
  }
  lane.flushTimer = owner.timeSource.setTimeout(() => {
    lane.flushTimer = null;
    if (!laneIsCurrent(delivery, lane)) return;
    trackOnOwner(owner, flushCdcAcknowledgements(delivery, REASON.FLUSH_DEADLINE));
  }, BOUND.ACK_FLUSH_DEADLINE_MS);
}

// Put a taken batch back (a flush refused before it was proposed): the keys
// stay pending and are proposed again with the next acknowledgements.
function restoreBatch(lane, members) {
  for (const member of members) {
    addToBatch(lane, member);
  }
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
    obligation.logIndex, obligation.ordinal,
    !lane.batch.groups.has(obligation.logIndex));
  if (lane.batch.events > 0 &&
      lane.batch.bytes + addedBytes > BOUND.ACK_BATCH_MAX_BYTES) {
    trackOnOwner(owner,
      flushCdcAcknowledgements(delivery, REASON.BATCH_BYTES_BOUND));
  }
  lane.pending.set(obligation.eventKey,
    {logIndex: obligation.logIndex, ordinal: obligation.ordinal});
  addToBatch(lane, obligation);
  if (lane.batch.firstAcknowledgedAt === null) {
    lane.batch.firstAcknowledgedAt = owner.timeSource.now();
  }
  if (lane.batch.events >= BOUND.ACK_BATCH_MAX_EVENTS) {
    trackOnOwner(owner,
      flushCdcAcknowledgements(delivery, REASON.BATCH_EVENTS_BOUND));
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
    partitionId: owner.partitionId,
    groups: groups.length,
    events: keysOf(groups).length,
    ...fields,
  });
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
  if (lane.batch.events === 0) {
    return flushOutcome(lane, FLUSH.EMPTY, {reason});
  }
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
  const command = buildCdcAcknowledgementCommand(owner.partitionId, groups,
    stampOf(owner));
  const admission = admitCommittedCommand(command,
    {origin: ORIGIN.CDC_DELIVERY_OWNER});
  if (!admission.admitted) {
    lane.held = admission.code;
    restoreBatch(lane, members);
    logFlushRefusal(owner, groups, {failureCode: admission.code, proposed: false});
    return flushOutcome(lane, FLUSH.REFUSED,
      {reason, events: eventKeys.length, failureCode: admission.code, proposed: false});
  }
  const pending = {command: Object.freeze(command), eventKeys, groups,
    inFlight: false};
  lane.commands.set(command.entryId, pending);
  return proposePendingAcknowledgement(delivery, lane, pending, reason);
}

async function proposePendingAcknowledgement(delivery, lane, pending, reason) {
  const {owner} = delivery;
  const {command, eventKeys, groups} = pending;
  if (pending.inFlight || !laneIsCurrent(delivery, lane)) {
    return Object.freeze({state: FLUSH.IN_FLIGHT, reason});
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
  return handleAcknowledgementRefusal(
    delivery, lane, pending, answer, reason);
}

function acknowledgementFailureIsTerminal(failureCode) {
  return [CODE.UNKNOWN_EVENT, CODE.ENTRY_MISMATCH, CODE.POSITION_MISMATCH,
    CODE.BYTES_INVALID, CODE.IDENTITY_MISMATCH].includes(failureCode);
}

function handleAcknowledgementRefusal(delivery, lane, pending, answer, reason) {
  const {owner} = delivery;
  const {command, eventKeys, groups} = pending;
  const uncertain = isWriteOutcomeUnknown(answer);
  const failureCode = answer?.failureCode ?? null;
  if (acknowledgementFailureIsTerminal(failureCode)) {
    lane.held = failureCode;
  } else {
    scheduleDeliveryRetry(delivery, answer);
  }
  logFlushRefusal(owner, groups, {failureCode, proposed: true});
  return flushOutcome(lane, uncertain ? FLUSH.OUTCOME_UNKNOWN : FLUSH.REFUSED,
    {reason, events: eventKeys.length, entryId: command.entryId, failureCode,
      proposed: true});
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

function scheduleDeliveryRetry(delivery, error) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  const hinted = Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0 ?
    Math.floor(error.retryAfterMs) : lane.retryDelayMs;
  const delayMs = Math.min(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
    Math.max(1, hinted));
  if (lane.retryTimer !== null || owner.isShutdown) {
    return delayMs;
  }
  lane.retryDelayMs = Math.min(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
    lane.retryDelayMs * 2);
  lane.retryTimer = owner.timeSource.setTimeout(() => {
    lane.retryTimer = null;
    if (!laneIsCurrent(delivery, lane)) return;
    trackOnOwner(owner, (async () => {
      await retryAcknowledgements(delivery, lane);
      if (laneIsCurrent(delivery, lane)) {
        await driveCdcObligations(delivery, REASON.DELIVERY_RETRY);
      }
    })());
  }, delayMs);
  return delayMs;
}

// Deliver one owed obligation to every current subscriber; acknowledged when
// each handler resolved. A refusal (a subscriber not ready, a handler that
// threw) leaves it owed and stops the drive here, so order is kept.
async function deliverObligation(delivery, lane, obligation, subscribers) {
  const {owner} = delivery;
  const event = eventOf(obligation, delivery.nextCDCEventSequenceNumber());
  let provisional = false;
  for (const subscriber of subscribers) {
    if (!laneIsCurrent(delivery, lane)) return false;
    const answer = await delivery.deliverCDCEventToSubscriber(subscriber, event);
    if (!laneIsCurrent(delivery, lane)) return false;
    if (owner.cdcSubscribers.size !== subscribers.length ||
        subscribers.some((current) => !owner.cdcSubscribers.has(current))) {
      throw new Error('cdc_subscriber_set_changed');
    }
    provisional ||= isProvisionalCdcOutcome(answer, [event]);
  }
  if (provisional) return DRIVE.PROVISIONAL;
  owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
  owner.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, event);
  acknowledgeDelivered(delivery, obligation);
  return true;
}

function drivePrecondition(delivery, lane, reason) {
  const {owner} = delivery;
  if (owner.isShutdown || !owner.db) {
    return {outcome: driveOutcome(lane, DRIVE.SHUTDOWN, {reason, delivered: 0})};
  }
  if (!laneIsCurrent(delivery, lane)) {
    return {outcome: driveOutcome(lane, DRIVE.NOT_LEADER, {reason, delivered: 0})};
  }
  const subscribers = [...owner.cdcSubscribers];
  return subscribers.length === 0 ?
    {outcome: driveOutcome(lane, DRIVE.NO_SUBSCRIBERS, {reason, delivered: 0})} :
    {subscribers};
}

function drivePage(owner, lane) {
  lane.scan ??= {cursor: null, through: readOwedCdcTail(owner.db), provisional: false};
  return lane.scan.through === null ? [] : readOwedCdcObligations(owner.db,
    {after: lane.scan.cursor ?? undefined, through: lane.scan.through,
      limit: BOUND.DRIVE_PAGE_ROWS});
}

function acknowledgementBackpressured(lane) {
  return lane.held !== null ||
    lane.commands.size >= BOUND.ACK_MAX_OUTSTANDING_BATCHES;
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
  reason, delivered) {
  if (acknowledgementBackpressured(lane)) {
    scheduleDeliveryRetry(delivery, null);
    return {outcome: driveOutcome(lane, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE,
      {reason, delivered})};
  }
  if (lane.pending.has(obligation.eventKey)) {
    lane.scan.cursor = obligationCursor(obligation);
    return {delivered: 0};
  }
  try {
    const result = await deliverObligation(delivery, lane, obligation, subscribers);
    if (!result) {
      return {outcome: driveOutcome(lane, DRIVE.NOT_LEADER, {reason, delivered})};
    }
    if (result === DRIVE.PROVISIONAL) lane.scan.provisional = true;
    lane.scan.cursor = obligationCursor(obligation);
    return {delivered: result === DRIVE.PROVISIONAL ? 0 : 1};
  } catch (error) {
    return {outcome: handleDeliveryFailure(
      delivery, lane, obligation, reason, delivered, error)};
  }
}

function drivePageFinished(delivery, lane, page, reason, delivered) {
  const scan = lane.scan;
  const reachedTail = scan.cursor?.logIndex === scan.through?.logIndex &&
    scan.cursor?.ordinal === scan.through?.ordinal;
  if (page.length >= BOUND.DRIVE_PAGE_ROWS && !reachedTail) {
    const retryDelayMs = scheduleDeliveryRetry(delivery, null);
    return driveOutcome(lane, DRIVE.PAGE_YIELDED, {reason, delivered, retryDelayMs});
  }
  lane.scan = null;
  if (scan.provisional) {
    const retryDelayMs = scheduleDeliveryRetry(delivery, null);
    return driveOutcome(lane, DRIVE.PROVISIONAL, {reason, delivered, retryDelayMs});
  }
  lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  return driveOutcome(lane, DRIVE.DRAINED, {reason, delivered});
}

async function driveOnce(delivery, lane, reason) {
  const {owner} = delivery;
  const precondition = drivePrecondition(delivery, lane, reason);
  if (precondition.outcome) return precondition.outcome;
  const page = drivePage(owner, lane);
  let delivered = 0;
  for (const obligation of page) {
    const result = await driveOneObligation(delivery, lane, obligation,
      precondition.subscribers, reason, delivered);
    if (result.outcome) return result.outcome;
    delivered += result.delivered;
  }
  return drivePageFinished(delivery, lane, page, reason, delivered);
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
  if (lane.inFlight) {
    lane.rerun = true;
    return Object.freeze({state: DRIVE.JOINED_IN_FLIGHT, reason});
  }
  lane.inFlight = true;
  try {
    const outcome = await driveOnce(delivery, lane, reason);
    if (lane.rerun && laneIsCurrent(delivery, lane)) {
      lane.rerun = false;
      scheduleDeliveryRetry(delivery, null);
    }
    return outcome;
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
    inFlight: lane.inFlight,
    pendingAcknowledgements: lane.pending.size,
    outstandingAcknowledgementBatches: lane.commands.size,
    batchEvents: lane.batch.events,
    batchBytes: lane.batch.bytes,
    batchGroups: lane.batch.groups.size,
    flushArmed: lane.flushTimer !== null,
    retryArmed: lane.retryTimer !== null,
    held: lane.held,
    proposerRegistered: acknowledgementProposer !== null,
    lastDrive: lane.lastDrive,
    lastFlush: lane.lastFlush,
  });
}

export {
  cdcObligationDiagnosticsOf,
  createCdcObligationLane,
  driveCdcObligations,
  flushCdcAcknowledgements,
  registerCdcAcknowledgementProposer,
  resetCdcObligationLane,
  settleAcknowledgedObligations,
};
