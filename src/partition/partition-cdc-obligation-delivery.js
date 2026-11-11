import {driveOutcome, flushOutcome, createCdcObligationLane, laneOf, laneIsCurrent, clearTimer,
  resetCdcObligationLane, takeBatch, groupsOfMembers, keysOf, restoreBatch, addToBatch,
  batchExceedsBoundsForEvent, isBackpressureError, resolveDeliveryRetryDisposition,
  disarmDeliveryRetry, computeRetryDelayMs, drivePrecondition, OBLIGATION_RETRY_STATE,
  IDLE_OBLIGATION_RETRY, OBLIGATION_RETRY_DISPOSITION} from
  './partition-cdc-obligation-lane.js';
// The obligation lane of the CDC delivery owner (TX1 design revision 10,
// section 8.3 point 5; owner ruling 2026-10-11): on the leader it drives owed
// obligations of the durable ledger (partition-cdc-obligation-ledger.js) to
// every current recipient in log order, as bounded vectors of owed rows
// (range shipping; partition-cdc-obligation-vector.js), each recipient at its
// own pace (recipient isolation; partition-cdc-recipient-drive.js). It
// acknowledges the rows at or below the lowest recipient cursor, batches
// those acknowledgements under count/byte bounds and flush deadline, and
// proposes each batch as CDC_DELIVERED to mark events delivered on every
// replica. Uncommitted events stay owed in the ledger so crashes redeliver
// (consumers deduplicate) and new tenures start from the ledger: recipient
// cursors are volatile, and the delivered flag is the one durable progress.
// The proposer is registered at load by partition-cdc-obligation.js via
// registerCdcAcknowledgementProposer; until registered a flush returns a typed
// PROPOSER_UNAVAILABLE outcome and the batch stays pending (R11).

import {CDC_PIPELINE_METRIC} from '../constants/cdc-lifecycle-constants.js';
import {PARTITION_SERVICE_DEFAULT, PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_TYPE} from './partition-service-constants.js';
import {admitCommittedCommand} from './partition-committed-command-admission.js';
import {isWriteOutcomeUnknown} from './partition-write-kernel.js';
import {laneRecipients, recipientKeyOf, reobserveLaneRecipients, syncSubscriberBranches} from
  './partition-cdc-obligation-progress.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND, PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_FAILURE_CODE as CODE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE as FLUSH, PARTITION_CDC_OBLIGATION_LOG_MSG as LOG_MSG,
  PARTITION_CDC_OBLIGATION_ORIGIN as ORIGIN, PARTITION_CDC_OBLIGATION_REASON as REASON,
  PARTITION_CDC_RECIPIENT_PASS as PASS} from
  './partition-cdc-obligation-constants.js';
import {acknowledgedEventBytesOf, buildCdcAcknowledgementCommand, isCdcPositionReclaimed,
  readCdcObligationProgress, readOwedCdcHead, readOwedCdcObligations, readOwedCdcTail} from
  './partition-cdc-obligation-ledger.js';
import {eventOf, positionOf, readRetainedDeliveredGauge, retainedDeliveredBackpressured} from
  './partition-cdc-obligation-vector.js';
import {recipientDiagnosticsOf, recipientsBehindOwedTail, retireHydratedDeliveries,
  startRecipientDrives, wakeRecipient} from
  './partition-cdc-recipient-drive.js';
import {frontierStateOf, recipientFrontier} from './partition-cdc-recipient-progress.js';
import {lifecycleQuestionDue, releaseStalledRecipients, requestRecipientLifecycle} from
  './partition-cdc-recipient-lifecycle.js';
import {ThrottledDiagnosticsLine} from '../diagnostics/throttled-diagnostics-line.js';
import {forgetReDerived, isQuarantinedObligation, isTerminalAcknowledgementRefusal,
  resolveAcknowledgementRefusal} from './partition-cdc-acknowledgement-refusal.js';

// A backpressured drive (ACKNOWLEDGEMENT_BACKPRESSURE: its own acknowledgement
// lane is full; HELD_BY_SUBSCRIBER with a backpressure error: one recipient
// deferred while the others keep shipping) is logged by this line: the step,
// the recipient it concerns with its cursor (how far that recipient lags the
// owed tail), the lane's queue sizes and the owed head and tail, at most once
// a second per step for the whole node, on the console sink only (the
// obligations being held may be the logs table's own).
const BACKPRESSURE_LINE_WINDOW_MS = 1000;
const backpressureLine = new ThrottledDiagnosticsLine({
  message: LOG_MSG.DELIVERY_BACKPRESSURED,
  windowMs: BACKPRESSURE_LINE_WINDOW_MS,
  maxField: 'maxRetryDelayMs',
});

/**
 * @param {Object} owner - The partition service owning the obligation lane.
 * @param {Object} lane - The delivery lane.
 * @param {Object} obligation - The obligation the drive stopped at.
 * @param {Object} held - {step, retryDelayMs, error, recipient?,
 *   recipientCursor?}: the recipient the hold concerns (absent for the
 *   lane's own acknowledgement backpressure) and its cursor.
 * @return {void}
 */
function reportObligationBackpressure(owner, lane, obligation, held) {
  backpressureLine.report(held.step, held.retryDelayMs, () => {
    const head = readOwedCdcHead(owner.db);
    const tail = readOwedCdcTail(owner.db);
    return {
      partitionId: owner.partitionId,
      logIndex: obligation.logIndex,
      ordinal: obligation.ordinal,
      step: held.step,
      recipient: held.recipient ?? null,
      recipientCursorLogIndex: held.recipientCursor?.logIndex ?? null,
      error: held.error === null ? null : String(held.error),
      retryDelayMs: held.retryDelayMs,
      pendingAcknowledgements: lane.pending.size,
      outstandingAcknowledgementBatches: lane.commands.size,
      acknowledgementHeld: lane.held,
      owedHeadLogIndex: head === null ? null : head.logIndex,
      owedTailLogIndex: tail === null ? null : tail.logIndex,
    };
  });
}

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
  // A settled key is either delivered (no longer owed) or forgotten and owed
  // again: the acknowledgement scan starts over from the ledger's owed head.
  lane.acknowledgedThrough = null;
  for (const eventKey of eventKeys) {
    forgetReDerived(lane, lane.pending.get(eventKey));
    lane.pending.delete(eventKey);
  }
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
    logFlushRefusal(owner, groups, {failureCode: admission.code, proposed: false});
    const resolved = resolveRefusal(delivery, lane, {members, entryId: null,
      failureCode: admission.code, refusal: {}, proposed: false});
    return flushOutcome(lane, FLUSH.REFUSED, {reason, events: eventKeys.length,
      failureCode: admission.code, proposed: false, resolution: resolved.outcome});
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

// A terminal refusal is resolved by its owner (named outcome and clearing
// event, partition-cdc-acknowledgement-refusal.js); the lane drives again.
function resolveRefusal(delivery, lane, refused) {
  return resolveAcknowledgementRefusal(delivery, lane, refused,
    () => trackOnOwner(delivery.owner, driveCdcObligations(delivery, REASON.AFTER_FLUSH)));
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
  logFlushRefusal(owner, groups, {failureCode, proposed: true});
  const fields = {reason, events: eventKeys.length, entryId: command.entryId, failureCode,
    proposed: true};
  if (uncertain || !isTerminalAcknowledgementRefusal(failureCode)) {
    scheduleDeliveryRetry(delivery, answer);
    return flushOutcome(lane, uncertain ? FLUSH.OUTCOME_UNKNOWN : FLUSH.REFUSED, fields);
  }
  const {outcome} = resolveRefusal(delivery, lane, {members, entryId: command.entryId,
    failureCode, refusal: answer, proposed: true});
  return flushOutcome(lane, FLUSH.REFUSED, {...fields, resolution: outcome});
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

// `state` is the retry state the delay belongs to: one recipient's drive, or
// (absent) the lane's own, which is the acknowledgement batch's. The lane has
// one timer: the earliest absolute due time wins.
function scheduleDeliveryRetry(delivery, error = null, explicitDisposition = null,
  state = null) {
  const lane = laneOf(delivery);
  const {owner} = delivery;
  const retryState = state ?? lane;
  const disposition = resolveDeliveryRetryDisposition(delivery, lane, error, explicitDisposition);
  lane.lastRetryDisposition = disposition;
  retryState.lastRetryDisposition = disposition;
  if (disposition === OBLIGATION_RETRY_DISPOSITION.STALE_LIFETIME ||
      disposition === OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK) {
    disarmDeliveryRetry(owner, lane, disposition === OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
    return 0;
  }
  const {delayMs, advanceBackoff} = computeRetryDelayMs(retryState, error, disposition);
  if (owner.isShutdown) return delayMs;
  const now = owner.timeSource.now();
  const dueAtMs = now + delayMs;
  if (state !== null) state.dueAtMs = dueAtMs;
  if (advanceBackoff) {
    retryState.retryDelayMs = Math.min(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
      retryState.retryDelayMs * 2);
  }
  armLaneRetryTimer(delivery, lane, delayMs, dueAtMs);
  return delayMs;
}

// The lane's one retry timer: an armed timer due no later is kept, an armed
// later one is replaced.
function armLaneRetryTimer(delivery, lane, delayMs, dueAtMs) {
  const {owner} = delivery;
  if (lane.retryTimer.state === OBLIGATION_RETRY_STATE.ARMED) {
    if (dueAtMs >= (lane.retryTimer.dueAtMs ?? Infinity)) return;
    clearTimer(owner, lane.retryTimer.handle);
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
}

// A recipient has no committed receipt for the vector it was shipped: its own
// retry is armed (its state, not the lane's) and the hold is logged with the
// recipient it concerns. `target` is absent only for a direct caller.
function handleDeliveryFailure(delivery, lane, obligation, reason, delivered, error,
  target = null) {
  if (!laneIsCurrent(delivery, lane)) {
    return driveOutcome(lane, DRIVE.NOT_LEADER, {reason, delivered});
  }
  const {owner} = delivery;
  owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
  const drive = target === null ? null : target.recipient.drive;
  const retryDelayMs = scheduleDeliveryRetry(delivery, error, null, drive);
  const recipient = target === null ? null : recipientKeyOf(target.branch, target.recipient);
  const logDetails = {
    partitionId: owner.partitionId,
    recipient,
    recipientState: drive === null ? null : drive.state,
    eventKey: obligation.eventKey,
    logIndex: obligation.logIndex,
    ordinal: obligation.ordinal,
    error: error?.message ?? String(error),
    retryDelayMs,
    delivered,
  };
  if (isBackpressureError(error)) {
    owner.logger.debug?.(LOG_MSG.DELIVERY_HELD, logDetails);
    reportObligationBackpressure(owner, lane, obligation,
      {step: DRIVE.HELD_BY_SUBSCRIBER, retryDelayMs, error, recipient,
        recipientCursor: target === null ? null : target.recipient.cursor});
  } else {
    owner.logger.warn(LOG_MSG.DELIVERY_HELD, logDetails);
  }
  return driveOutcome(lane, DRIVE.HELD_BY_SUBSCRIBER,
    {reason, delivered, recipient, eventKey: obligation.eventKey, retryDelayMs});
}

// What the recipient drives ask of the lane.
const RECIPIENT_OPS = Object.freeze({
  scheduleRetry: scheduleDeliveryRetry,
  armRetryAt: (delivery, lane, dueAtMs) => {
    const delayMs = Math.max(1, dueAtMs - delivery.owner.timeSource.now());
    armLaneRetryTimer(delivery, lane, delayMs, dueAtMs);
  },
  track: (delivery, drive) => trackOnOwner(delivery.owner, drive),
  frontierMoved: acknowledgeFrontier,
  recipientHeld: (delivery, lane, target, obligation, error) => {
    const outcome = handleDeliveryFailure(delivery, lane, obligation, REASON.DELIVERY_RETRY, 0,
      error, target);
    // A held target group the sender's cache no longer names (or one too far
    // behind) is asked about at its lifecycle owner: only its evidence may
    // detach it.
    if (lifecycleQuestionDue(target)) {
      requestRecipientLifecycle(delivery, lane, target, RECIPIENT_OPS);
    }
    return outcome;
  },
  // The sender's cache changed a recipient-domain table: the recipient set is
  // observed again (coalesced to one drive per turn), and a group it newly
  // names - or a detached one it names again - is contacted.
  recipientDomainChanged: (delivery, lane) => {
    if (lane.recipientDomainWake || !laneIsCurrent(delivery, lane)) return;
    lane.recipientDomainWake = true;
    queueMicrotask(() => {
      lane.recipientDomainWake = false;
      if (!laneIsCurrent(delivery, lane)) return;
      for (const target of laneRecipients(lane)) {
        if (lifecycleQuestionDue(target)) {
          requestRecipientLifecycle(delivery, lane, target, RECIPIENT_OPS);
        }
      }
      trackOnOwner(delivery.owner, driveCdcObligations(delivery, REASON.RECIPIENT_DOMAIN_CHANGED));
    });
  },
  // The recipient set was observed (again): a recipient it left behind the
  // owed tail - a new group, a released propagation's primary - is started.
  // A held one keeps its backoff: another recipient's delivery never wakes it.
  recipientsObserved: (delivery, lane) => {
    reobserveLaneRecipients(lane);
    startRecipientDrives(delivery, lane, joinAwaitedDrives(lane), RECIPIENT_OPS);
  },
  // A delivery's actual local cleanup released a custody slot: the recipient
  // that ended on it starts at once (past its backoff: the raw work it was
  // refused for is gone), and any recipient of the current lane that waited
  // for that slot (a successor tenure's) is started.
  resumeAfterCleanup: (delivery, lane, target) => {
    const {drive} = target.recipient;
    if (drive?.resumeOnCleanup && !drive.running) {
      drive.resumeOnCleanup = false;
      wakeRecipient(delivery, lane, target, joinAwaitedDrives(lane), RECIPIENT_OPS);
    }
    const current = delivery.obligationLane;
    if (laneIsCurrent(delivery, current)) {
      startRecipientDrives(delivery, current, joinAwaitedDrives(current), RECIPIENT_OPS);
    }
  },
  driveFailed: (delivery, error) => delivery.owner.logger.error(LOG_MSG.DRIVE_FAILED, {
    partitionId: delivery.owner.partitionId, error: error?.message ?? String(error)}),
});

// The highest position the lane may acknowledge through: the frontier (the
// lowest recipient cursor), or a hydration image's applied index when that
// is higher (its rows are acknowledged without delivery).
function acknowledgeableThrough(lane) {
  const frontier = recipientFrontier(laneRecipients(lane));
  const hydrated = lane.hydratedThroughLogIndex || 0;
  if (hydrated <= 0 || (frontier !== null && frontier.logIndex > hydrated)) return frontier;
  return {logIndex: hydrated, ordinal: Number.MAX_SAFE_INTEGER};
}

// Acknowledge, in log order, every owed row at or below the frontier: only
// such a row has a committed receipt from every current recipient. A row the
// acknowledgement batch cannot take (its bounds, a held command, decision
// D1's retained-delivered bound) stops here; it stays owed and unpending and
// this runs again after the next flush or retry. Delivery is not held back
// by it: recipients keep shipping, bounded by OWED_MAX_EVENTS.
function blockAcknowledgement(owner, lane, row, unacknowledged) {
  lane.acknowledgementBlocked = true;
  lane.driveUnacknowledged = unacknowledged;
  reportObligationBackpressure(owner, lane, row,
    {step: DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE, retryDelayMs: null, error: null});
}

function acknowledgeFrontier(delivery, lane) {
  const {owner} = delivery;
  lane.acknowledgementBlocked = false;
  lane.driveUnacknowledged = 0;
  // The recipient set is observed again first: a group the topology owner
  // newly requires holds the frontier until it confirmed, and is started. A
  // recipient whose progress says so is released (it re-lists on return).
  RECIPIENT_OPS.recipientsObserved(delivery, lane);
  releaseStalledRecipients(delivery, lane, RECIPIENT_OPS);
  const through = acknowledgeableThrough(lane);
  if (through === null || !owner.db) return;
  const gauge = readRetainedDeliveredGauge(owner);
  for (;;) {
    const rows = readOwedCdcObligations(owner.db, {after: lane.acknowledgedThrough ?? undefined,
      through, limit: BOUND.ACK_BATCH_MAX_EVENTS});
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!lane.pending.has(row.eventKey) && !isQuarantinedObligation(lane, row)) {
        if (lane.held !== null || retainedDeliveredBackpressured(gauge, lane, row) ||
            !acknowledgeDelivered(delivery, row)) {
          blockAcknowledgement(owner, lane, row, rows.length - index);
          return;
        }
        lane.driveDelivered += 1;
        owner.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
        owner.emit(PARTITION_SERVICE_EVENT.CDC_EVENT,
          eventOf(row, delivery.nextCDCEventSequenceNumber()));
      }
      lane.acknowledgedThrough = positionOf(row);
    }
    if (rows.length < BOUND.ACK_BATCH_MAX_EVENTS) return;
  }
}

function hasUnproposedCommand(lane) {
  for (const pending of lane.commands.values()) {
    if (!pending.inFlight) return true;
  }
  return false;
}

// What the lane's recipients ended as, in one named state: one recipient
// held, provisional or still running does not hide the others' progress
// (delivered counts the rows that crossed the frontier during this drive).
// The state derives from the ledger: DRAINED (which disarms the lane's retry)
// is reachable only when no recipient is behind the owed tail, and a
// recipient behind it that no named wait holds is started here, so no path
// can leave owed rows with nothing armed to deliver them.
function recipientDriveOutcome(delivery, lane, reason, delivered) {
  const fields = {reason, delivered, unacknowledged: lane.driveUnacknowledged};
  if (!laneIsCurrent(delivery, lane)) {
    return driveOutcome(lane, delivery.owner.isShutdown ? DRIVE.SHUTDOWN : DRIVE.NOT_LEADER,
      fields);
  }
  const behind = recipientsBehindOwedTail(delivery, lane);
  if (behind.some(({wait}) => wait === null)) {
    startRecipientDrives(delivery, lane, joinAwaitedDrives(lane), RECIPIENT_OPS);
    return driveOutcome(lane, DRIVE.JOINED_IN_FLIGHT, fields);
  }
  const targets = laneRecipients(lane);
  const idle = targets.filter(({recipient}) => !recipient.drive.running);
  const ended = (...passes) => idle.filter(({recipient}) =>
    passes.includes(recipient.drive.lastPass));
  const held = ended(PASS.HELD, PASS.FAILED);
  if (held.length > 0) {
    return driveOutcome(lane, DRIVE.HELD_BY_SUBSCRIBER, {...fields,
      retryDelayMs: lane.retryTimer.delayMs ?? null,
      unconfirmed: held.map(({branch, recipient}) => Object.freeze({
        subscriber: recipientKeyOf(branch, recipient), position: recipient.drive.position}))});
  }
  if (ended(PASS.PROVISIONAL).length > 0) {
    return driveOutcome(lane, DRIVE.PROVISIONAL,
      {...fields, retryDelayMs: lane.retryTimer.delayMs ?? null});
  }
  if (idle.length < targets.length || ended(PASS.CLEANUP_PENDING).length > 0) {
    return driveOutcome(lane, DRIVE.JOINED_IN_FLIGHT, fields);
  }
  if (ended(PASS.PAGE_YIELDED).length > 0) {
    return driveOutcome(lane, DRIVE.PAGE_YIELDED,
      {...fields, retryDelayMs: lane.retryTimer.delayMs ?? null});
  }
  if (lane.acknowledgementBlocked) {
    const retryDelayMs =
      scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.BACKPRESSURE);
    return driveOutcome(lane, DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE, {...fields, retryDelayMs});
  }
  if (behind.length > 0) return driveOutcome(lane, DRIVE.JOINED_IN_FLIGHT, fields);
  lane.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  lane.consecutiveBackpressure = 0;
  if (!hasUnproposedCommand(lane)) {
    scheduleDeliveryRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.NO_PENDING_WORK);
  }
  return driveOutcome(lane, DRIVE.DRAINED, fields);
}

// A drive started while a caller awaits (a newly observed target recipient)
// joins every awaiting caller.
function joinAwaitedDrives(lane) {
  return {push: (drive) => {
    for (const group of lane.awaitedDrives) group.push(drive);
  }};
}

/**
 * Deliver every owed obligation of the ledger to every current recipient, in
 * log order per recipient, on the leader. Each recipient has its own
 * single-flight drive: this starts the idle ones (a running one runs once
 * more), awaits the drives it started and acknowledges the rows at or below
 * the frontier. Each acknowledged event enters the acknowledgement batch.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {string} reason - A PARTITION_CDC_OBLIGATION_REASON.
 * @return {Promise<Object>} {state: a PARTITION_CDC_OBLIGATION_DRIVE_STATE,
 *   delivered (rows acknowledged at the frontier), unacknowledged (rows at
 *   or below the frontier the acknowledgement batch held back; still owed),
 *   ...}.
 */
async function driveCdcObligations(delivery, reason) {
  const lane = laneOf(delivery);
  const refused = drivePrecondition(delivery, lane, reason);
  if (refused !== null) return refused;
  syncSubscriberBranches(delivery, lane);
  const deliveredBefore = lane.driveDelivered;
  const group = [];
  lane.awaitedDrives.add(group);
  try {
    acknowledgeFrontier(delivery, lane);
    startRecipientDrives(delivery, lane, group, RECIPIENT_OPS);
    for (let index = 0; index < group.length; index += 1) {
      await group[index];
      // A recipient observed meanwhile (a newly required group) is driven
      // before this drive answers.
      if (index === group.length - 1 && laneIsCurrent(delivery, lane)) {
        reobserveLaneRecipients(lane);
        startRecipientDrives(delivery, lane, group, RECIPIENT_OPS);
      }
    }
  } catch (error) {
    RECIPIENT_OPS.driveFailed(delivery, error);
    throw error;
  } finally {
    lane.awaitedDrives.delete(group);
  }
  return recipientDriveOutcome(delivery, lane, reason, lane.driveDelivered - deliveredBefore);
}

/**
 * What the lane holds now (diagnostics).
 * @param {Object} delivery - The CDC delivery owner.
 * @return {Object} The lane's state, read-only.
 */
function cdcObligationDiagnosticsOf(delivery) {
  const lane = laneOf(delivery);
  const recipients = recipientDiagnosticsOf(lane);
  return Object.freeze({
    inFlight: recipients.some((recipient) => recipient.running),
    recipients: Object.freeze(recipients), frontier: recipientFrontier(laneRecipients(lane)),
    frontierState: frontierStateOf(laneRecipients(lane)),
    pendingAcknowledgements: lane.pending.size,
    outstandingAcknowledgementBatches: lane.commands.size,
    batchEvents: lane.batch.events, batchBytes: lane.batch.bytes,
    batchGroups: lane.batch.groups.size, flushArmed: lane.flushTimer !== null,
    retryArmed: lane.retryTimer.state === OBLIGATION_RETRY_STATE.ARMED,
    held: lane.held, quarantined: [...lane.quarantined.values()],
    proposerRegistered: acknowledgementProposer !== null,
    lastDrive: lane.lastDrive, lastFlush: lane.lastFlush,
  });
}

function acknowledgeHydratedObligationList(delivery, lane, obligations) {
  let acknowledged = 0;
  for (const obligation of obligations) {
    if (lane.pending.has(obligation.eventKey) || isQuarantinedObligation(lane, obligation)) {
      continue;
    }
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
  retireHydratedDeliveries(delivery, lane, throughLogIndex);
  const acknowledged = drainPendingHydratedObligations(delivery, lane);
  return Object.freeze({acknowledged});
}

export {OBLIGATION_RETRY_DISPOSITION, acknowledgeHydratedObligationsThrough,
  cdcObligationDiagnosticsOf, createCdcObligationLane,
  driveCdcObligations, flushCdcAcknowledgements, handleDeliveryFailure,
  registerCdcAcknowledgementProposer,
  resetCdcObligationLane, scheduleDeliveryRetry, settleAcknowledgedObligations};
