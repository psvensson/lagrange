// Recipient isolation of the CDC obligation lane: every recipient (a
// subscriber, or one target group of its propagation) has its own
// single-flight drive, its own delivery invocation and its own retry state.
// A drive ships the owed rows after its recipient's cursor as bounded vectors,
// one at a time and in log order, and advances the cursor on a committed
// receipt. A recipient that does not answer delays only itself: the others
// keep shipping. The lane acknowledges rows only at or below the lowest
// cursor (the frontier), so the durable delivered prefix (decision D1) never
// passes a row a current recipient has not confirmed.
//
// Bound: a recipient has at most one vector in flight (single-flight drive,
// and one invocation custody slot per recipient that is released only by
// actual local cleanup), so a partition's lane has at most one delivery in
// flight per recipient, each bounded by SHIP_MAX_EVENTS / SHIP_MAX_BYTES. A
// lane has one propagation subscriber (the partition refuses a second), and
// its recipients name distinct groups (partition-cdc-obligation-progress.js),
// so a lane has at most one delivery in flight per group. What a recipient's
// state pins and how a released one returns: partition-cdc-recipient-progress.js.

import {CDC_COMPLETION, CDC_COVERAGE_STATE, cdcCommitWaitIdentity, observeCdcCoverage} from
  '../cdc/cdc-delivery-outcome.js';
import {beginCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_RECIPIENT_PASS as PASS,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE,
  PARTITION_CDC_RECIPIENT_WAIT as WAIT} from
  './partition-cdc-obligation-constants.js';
import {readCdcLedgerNewest, readOwedCdcTail} from './partition-cdc-obligation-ledger.js';
import {OBLIGATION_RETRY_DISPOSITION, laneIsCurrent} from './partition-cdc-obligation-lane.js';
import {cdcRecipientInvocation, laneRecipients, receiptGroupOf, recipientAttached,
  recipientKeyOf, unconfirmedRecipientError} from
  './partition-cdc-obligation-progress.js';
import {eventOf, isPositionProbe, positionAfter, positionOf, selectRecipientVector,
  settledWithoutDelivery, sourceRangeOf} from
  './partition-cdc-obligation-vector.js';
import {confirmRecipient, heldPositionOf, offerRelist, recipientDriveOf, recordGapAnswer,
  recordShipped, recordUnconfirmedEnd, relistDiagnosticsOf, settleRelistOffer} from
  './partition-cdc-recipient-progress.js';

// The custody slot of one recipient's delivery invocation. It belongs to the
// delivery owner, not the lane: a retired delivery keeps it until its actual
// local cleanup, also across a tenure change.
function custodyOf(delivery, key) {
  let custody = delivery.recipientCustody.get(key);
  if (!custody) {
    custody = {owner: delivery.owner, activeCdcInvocation: null};
    delivery.recipientCustody.set(key, custody);
  }
  return custody;
}

// The scan reached its captured tail. Rows owed beyond it belong to the next
// scan (the drive runs on while its recipient is behind the owed tail); a
// provisional scan returns to the cursor on this recipient's own retry.
function endRecipientScan(delivery, recipient, ops) {
  const drive = recipient.drive;
  drive.scanThrough = null;
  if (drive.scanAfter === null) return PASS.DRAINED;
  drive.scanAfter = null;
  ops.scheduleRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE, drive);
  return PASS.PROVISIONAL;
}

// A delivery that ended without a committed or provisional answer over its
// vector: the recipient is unconfirmed, with the error that says why.
function unconfirmedAttempt(custody, error) {
  return {state: CDC_COVERAGE_STATE.UNCOVERED, error, custody};
}

// Where a confirmed attempt moves the recipient's cursor: the vector's last
// row, or for an already-applied answer of the same source incarnation the
// position its group's log committed through, when that is higher.
function confirmedThrough(attempt, vector, sourceRange) {
  const last = positionOf(vector.at(-1));
  if (attempt.state !== CDC_COVERAGE_STATE.ALREADY_APPLIED ||
      attempt.coverage.incarnation !== sourceRange.incarnation) return last;
  return positionAfter(attempt.coverage.appliedThrough, last) ?
    attempt.coverage.appliedThrough : last;
}

// Who a recipient is, as its progress transitions are logged.
function recipientNameOf({branch, recipient}) {
  return {recipient: recipientKeyOf(branch, recipient),
    groupId: receiptGroupOf(branch, recipient)};
}

// Deliver one vector to one recipient under that recipient's own invocation.
async function deliverVectorToRecipient(delivery, lane, target, vector, sourceRange, ops) {
  const {branch, recipient} = target;
  const drive = recipient.drive;
  const custody = custodyOf(delivery, recipientKeyOf(branch, recipient));
  const isCurrent = () => laneIsCurrent(delivery, lane) &&
    recipientAttached(delivery, lane, branch, recipient);
  const events = Object.freeze(vector.map((obligation) =>
    eventOf(obligation, delivery.nextCDCEventSequenceNumber())));
  let context;
  try {
    context = beginCdcDeliveryInvocation(custody, isCurrent,
      () => ops.resumeAfterCleanup(delivery, lane, target));
  } catch (error) {
    return unconfirmedAttempt(custody, error);
  }
  drive.inFlight = Object.freeze({digest: cdcCommitWaitIdentity(events),
    first: positionOf(vector[0]), last: positionOf(vector.at(-1))});
  recordShipped(delivery, recipient, vector);
  try {
    const scoped = cdcRecipientInvocation(context, isCurrent, branch, recipient, {
      recipientsObserved: () => ops.recipientsObserved(delivery, lane, target),
      recipientDomainChanged: () => ops.recipientDomainChanged(delivery, lane),
    }, sourceRange);
    const answer = await delivery.deliverCdcVectorToSubscriber(branch.wrapper, events, scoped);
    scoped.assertCurrent();
    const coverage = observeCdcCoverage(answer, events, receiptGroupOf(branch, recipient));
    return coverage.state === CDC_COVERAGE_STATE.UNCOVERED ?
      unconfirmedAttempt(custody, unconfirmedRecipientError(answer)) :
      {state: coverage.state, coverage, custody};
  } catch (error) {
    return unconfirmedAttempt(custody, error);
  } finally {
    context.finish();
    drive.inFlight = null;
  }
}

// The recipient answered without a committed receipt (or not at all within
// its invocation): it stays unconfirmed and its own retry is armed. Nothing
// else waits for it.
function holdRecipient(delivery, lane, target, attempt, vector, ops) {
  // An offer of a re-list that neither a gap nor a receipt answered is
  // withdrawn before the hold is reported: the rows it retained are released.
  if (settleRelistOffer(delivery, target.recipient, recipientNameOf(target))) {
    ops.frontierMoved(delivery, lane);
  }
  ops.recipientHeld(delivery, lane, target, vector[0], attempt.error);
  // Raw work still open: its actual local cleanup wakes this recipient at
  // once (the backoff is its other wake).
  if (attempt.custody.activeCdcInvocation) target.recipient.drive.resumeOnCleanup = true;
  return PASS.HELD;
}

// Ship the next vector after the recipient's position. Returns the pass's
// end, or null while the pass continues.
async function shipNextVector(delivery, lane, target, ops, pass) {
  try {
    return await shipVectorAfterPosition(delivery, lane, target, ops, pass);
  } finally {
    // Whatever ended this delivery, an offer it carried that is still
    // unanswered does not keep its hold.
    if (settleRelistOffer(delivery, target.recipient, recipientNameOf(target)) &&
        laneIsCurrent(delivery, lane)) ops.frontierMoved(delivery, lane);
  }
}

async function shipVectorAfterPosition(delivery, lane, target, ops, pass) {
  const {branch, recipient} = target;
  if (!laneIsCurrent(delivery, lane) ||
      !recipientAttached(delivery, lane, branch, recipient) ||
      recipient.drive.state === RECIPIENT_STATE.DETACHED) return PASS.STOPPED;
  // A released recipient's contact is a re-list offer: the hold is pinned
  // before anything is shipped (a provisional scan ships what it began).
  if (recipient.drive.state === RECIPIENT_STATE.MUST_RELIST &&
      recipient.drive.scanAfter === null) {
    offerRelist(delivery, recipient, recipientNameOf(target));
  }
  const vector = selectRecipientVector(delivery.owner, lane, recipient,
    heldPositionOf(recipient));
  if (vector.length === 0) return endRecipientScan(delivery, recipient, ops);
  if (pass.visited > 0 && pass.visited + vector.length > BOUND.DRIVE_PAGE_ROWS) {
    ops.scheduleRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED,
      recipient.drive);
    return PASS.PAGE_YIELDED;
  }
  // A primary recipient's receipt confirms it only under the propagation it
  // was shipped under: a release meanwhile dropped recipients that never
  // confirmed, so the vector is shipped again under the binding observed now.
  const releases = branch.releases;
  const sourceRange = sourceRangeOf(delivery.owner, vector);
  const attempt = await deliverVectorToRecipient(delivery, lane, target, vector, sourceRange,
    ops);
  pass.visited += vector.length;
  const last = positionOf(vector.at(-1));
  // A typed gap is the recipient saying it is there and re-lists: it is
  // recorded whatever else ends this delivery, and what its image covers is
  // no longer pinned.
  if (attempt.error?.reason === CDC_COMPLETION.POSITION_GAP &&
      recordGapAnswer(delivery, recipient)) ops.frontierMoved(delivery, lane);
  if (recipient.drive.state === RECIPIENT_STATE.DETACHED) {
    // Detached on lifecycle evidence while its delivery ran: a late receipt
    // does not bring a retired group back into the frontier.
    return PASS.STOPPED;
  }
  if (branch.releases !== releases) {
    if (!laneIsCurrent(delivery, lane)) return PASS.STOPPED;
  } else if (attempt.state === CDC_COVERAGE_STATE.COMMITTED ||
      attempt.state === CDC_COVERAGE_STATE.ALREADY_APPLIED) {
    confirmRecipient(recipient, confirmedThrough(attempt, vector, sourceRange));
    ops.frontierMoved(delivery, lane);
  } else if (attempt.state === CDC_COVERAGE_STATE.PROVISIONAL) {
    recordUnconfirmedEnd(recipient);
    recipient.drive.scanAfter = last;
  } else if (!laneIsCurrent(delivery, lane)) {
    return PASS.STOPPED;
  } else if (isPositionProbe(recipient, vector) ||
      !vector.some((obligation) => settledWithoutDelivery(lane, obligation))) {
    recordUnconfirmedEnd(recipient);
    return holdRecipient(delivery, lane, target, attempt, vector, ops);
  }
  // (A delivery that ended while part of its vector was settled elsewhere -
  // a hydration image, a committed acknowledgement - is not a recipient
  // failure: the next read steps over those rows and ships the rest.)
  if (!attempt.custody.activeCdcInvocation) return null;
  // The delivery's raw work is still open: this recipient resumes when its
  // custody is released by actual local cleanup.
  recipient.drive.resumeOnCleanup = true;
  return PASS.CLEANUP_PENDING;
}

async function driveRecipientPass(delivery, lane, target, ops) {
  const {recipient} = target;
  const pass = {visited: 0};
  recipient.drive.scanThrough ??= readOwedCdcTail(delivery.owner.db);
  for (;;) {
    const end = await shipNextVector(delivery, lane, target, ops, pass);
    if (end !== null) return end;
  }
}

// A drive ends only on a named wait: it runs another pass while its
// recipient is behind the owed tail (rows that arrived during the pass, the
// rest of a vector whose cleanup closed meanwhile) and nothing holds it. A
// cleanup that closed while the drive was still running is the event its
// hold waited for: the drive continues past its backoff.
function passContinues(delivery, lane, target) {
  const {branch, recipient} = target;
  const {drive} = recipient;
  if (drive.lastPass === PASS.STOPPED || !laneIsCurrent(delivery, lane) ||
      !recipientAttached(delivery, lane, branch, recipient)) return false;
  if (custodyOccupied(delivery, target)) return false;
  if (drive.resumeOnCleanup) {
    drive.resumeOnCleanup = false;
    return true;
  }
  const {owner} = delivery;
  return idleRecipientWait(delivery, target, readLedgerView(owner.db),
    owner.timeSource.now()) === null;
}

/**
 * Run one recipient's single-flight drive: passes repeat until the recipient
 * reaches the owed tail or a named wait holds it. It never rejects; a pass
 * that throws ends the drive as FAILED, on this recipient's own retry.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {Object} target - {branch, recipient}.
 * @param {Object} ops - The lane's operations (retry, acknowledgement, log).
 * @return {Promise<void>}
 */
async function runRecipientDrive(delivery, lane, target, ops) {
  const drive = target.recipient.drive;
  drive.running = true;
  drive.dueAtMs = null;
  try {
    do {
      // The recipient set is observed before each pass: a released
      // propagation's primary, a new group or a group whose route changed is
      // started (this drive itself runs on with what remains attached).
      ops.recipientsObserved(delivery, lane);
      drive.lastPass = await driveRecipientPass(delivery, lane, target, ops);
      // A scan continues (with its captured tail) only across a page yield
      // or inside a provisional scan; any other end starts a new scan.
      if (drive.lastPass !== PASS.PAGE_YIELDED && drive.scanAfter === null) {
        drive.scanThrough = null;
      }
    } while (passContinues(delivery, lane, target));
  } catch (error) {
    // A failed pass is a named wait on this recipient's own retry, never a
    // silent stop with rows owed.
    drive.lastPass = PASS.FAILED;
    ops.driveFailed(delivery, error);
    ops.scheduleRetry(delivery, error, OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE, drive);
  } finally {
    drive.running = false;
  }
}

// A pass that ended on this recipient's own retry: its due time wakes it.
const BACKOFF_PASSES = Object.freeze(new Set([PASS.HELD, PASS.PROVISIONAL, PASS.PAGE_YIELDED,
  PASS.FAILED]));

// Whether a recipient still has something to confirm: the ledger holds a row
// above its cursor (or it has none): an owed row, or the position probe (the
// newest row, when what lies above the cursor was acknowledged without it).
// A DETACHED recipient is owed nothing.
function behindOwedTail(recipient, ledger) {
  if (recipientDriveOf(recipient).state === RECIPIENT_STATE.DETACHED) return false;
  if (ledger.newest === null) return false;
  return recipient.cursor === null || positionAfter(ledger.newest, recipient.cursor);
}

// What the waits read of the ledger: its newest row (owed or delivered).
function readLedgerView(db) {
  if (!db) return {newest: null};
  const newest = readCdcLedgerNewest(db);
  return {newest: newest === null ? null : positionOf(newest)};
}

/**
 * The named wait that holds an idle recipient, or null when it must be
 * started now: it is behind the owed tail and nothing else will wake it.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} target - {branch, recipient}.
 * @param {Object|null} tail - The ledger's owed tail.
 * @param {number} nowMs - The owner's clock.
 * @return {string|null} A PARTITION_CDC_RECIPIENT_WAIT, or null.
 */
function recipientWait(delivery, target, ledger, nowMs) {
  return recipientDriveOf(target.recipient).running ? WAIT.RUNNING :
    idleRecipientWait(delivery, target, ledger, nowMs);
}

function custodyOccupied(delivery, {branch, recipient}) {
  return Boolean(delivery.recipientCustody.get(recipientKeyOf(branch, recipient))
    ?.activeCdcInvocation);
}

// The wait of a recipient whose drive is not (or no longer) running a pass.
function idleRecipientWait(delivery, target, ledger, nowMs) {
  const {recipient} = target;
  const {drive} = recipient;
  if (custodyOccupied(delivery, target)) return WAIT.CLEANUP;
  if (BACKOFF_PASSES.has(drive.lastPass) && drive.dueAtMs !== null && drive.dueAtMs > nowMs) {
    return WAIT.BACKOFF;
  }
  return behindOwedTail(recipient, ledger) ? null : WAIT.CAUGHT_UP;
}

function startRecipientDrive(delivery, lane, target, group, ops) {
  group.push(ops.track(delivery, runRecipientDrive(delivery, lane, target, ops)));
}

/**
 * Start the drive of every idle recipient behind the owed tail that no named
 * wait holds; started drives join `group`. A recipient in backoff keeps its
 * own due time (the lane's retry timer is armed at it), so a wake costs a
 * refusing recipient nothing. A running drive needs no wake: it ends only at
 * the owed tail or on a named wait.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {Array<Promise>} group - The drives the caller awaits.
 * @param {Object} ops - The lane's operations.
 * @return {void}
 */
function startRecipientDrives(delivery, lane, group, ops) {
  const {owner} = delivery;
  const ledger = readLedgerView(owner.db);
  const nowMs = owner.timeSource.now();
  for (const target of laneRecipients(lane)) {
    const wait = recipientWait(delivery, target, ledger, nowMs);
    if (wait === null) startRecipientDrive(delivery, lane, target, group, ops);
    else if (wait === WAIT.BACKOFF) ops.armRetryAt(delivery, lane, target.recipient.drive.dueAtMs);
  }
}

/**
 * Wake one recipient now, past its backoff: the event that cleared its hold
 * (its delivery's actual local cleanup) happened.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {Object} target - {branch, recipient}.
 * @param {Array<Promise>} group - The drives the caller awaits.
 * @param {Object} ops - The lane's operations.
 * @return {boolean} Whether its drive was started.
 */
function wakeRecipient(delivery, lane, target, group, ops) {
  const {drive} = target.recipient;
  if (drive === null || drive.running || !laneIsCurrent(delivery, lane) ||
      !recipientAttached(delivery, lane, target.branch, target.recipient)) return false;
  drive.dueAtMs = null;
  startRecipientDrive(delivery, lane, target, group, ops);
  return true;
}

/**
 * Every recipient behind the owed tail, with the named wait that holds it
 * (null: none, so it must be started).
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @return {Array<Object>} {target, wait}.
 */
function recipientsBehindOwedTail(delivery, lane) {
  const {owner} = delivery;
  const ledger = readLedgerView(owner.db);
  const nowMs = owner.timeSource.now();
  return laneRecipients(lane)
    .filter(({recipient}) => behindOwedTail(recipient, ledger))
    .map((target) => ({target, wait: recipientWait(delivery, target, ledger, nowMs)}));
}

/**
 * A delivery whose vector holds a hydrated row is no longer the vector to
 * ship: its invocation is retired and its recipient reads again.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {number} throughLogIndex - The hydration image's applied index.
 * @return {void}
 */
function retireHydratedDeliveries(delivery, lane, throughLogIndex) {
  for (const {branch, recipient} of laneRecipients(lane)) {
    const inFlight = recipient.drive?.inFlight ?? null;
    if (inFlight !== null && inFlight.first.logIndex <= throughLogIndex) {
      custodyOf(delivery, recipientKeyOf(branch, recipient)).activeCdcInvocation?.retire();
    }
  }
}

/**
 * What each recipient is (diagnostics).
 * @param {Object} lane - The delivery lane.
 * @return {Array<Object>} One frozen record per recipient.
 */
function recipientDiagnosticsOf(lane) {
  return laneRecipients(lane).map(({branch, recipient}) => {
    const drive = recipientDriveOf(recipient);
    return Object.freeze({recipient: recipientKeyOf(branch, recipient),
      groupId: receiptGroupOf(branch, recipient), state: drive.state, position: drive.position,
      since: drive.since, cursor: recipient.cursor, inFlight: drive.inFlight !== null,
      running: drive.running, retryDueAtMs: drive.dueAtMs, lastPass: drive.lastPass,
      detachReason: drive.detachReason, relist: relistDiagnosticsOf(drive)});
  });
}

export {
  custodyOf,
  recipientDiagnosticsOf,
  recipientsBehindOwedTail,
  retireHydratedDeliveries,
  startRecipientDrives,
  wakeRecipient,
};
