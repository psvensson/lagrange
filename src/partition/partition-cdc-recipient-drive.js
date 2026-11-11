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
// so a lane has at most one delivery in flight per group.

import {CDC_COVERAGE_STATE, cdcCommitWaitIdentity, observeCdcCoverage} from
  '../cdc/cdc-delivery-outcome.js';
import {beginCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {PARTITION_SERVICE_DEFAULT} from './partition-service-constants.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_RECIPIENT_PASS as PASS,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE,
  PARTITION_CDC_RECIPIENT_WAIT as WAIT} from
  './partition-cdc-obligation-constants.js';
import {readOwedCdcTail} from './partition-cdc-obligation-ledger.js';
import {OBLIGATION_RETRY_DISPOSITION, laneIsCurrent} from './partition-cdc-obligation-lane.js';
import {cdcRecipientInvocation, laneRecipients, receiptGroupOf, recipientAttached,
  recipientKeyOf, unconfirmedRecipientError} from
  './partition-cdc-obligation-progress.js';
import {eventOf, lowerCursor, positionAfter, positionOf, selectRecipientVector,
  settledWithoutDelivery} from
  './partition-cdc-obligation-vector.js';

// One recipient's tenure-local drive state. scanThrough is the owed tail
// captured when its scan began: a scan stays finite while rows keep arriving
// (the rows beyond it belong to the next scan). scanAfter is its provisional
// scan position: rows shipped past a vector that was only provisionally
// accepted, so that later metadata still reaches the recipient; at the
// captured tail the scan returns to the cursor. retryDelayMs /
// consecutiveBackpressure are this recipient's own backoff.
function recipientDriveOf(recipient) {
  recipient.drive ??= {
    running: false, rerun: false, resumeOnCleanup: false,
    scanAfter: null, scanThrough: null, inFlight: null,
    retryDelayMs: PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS,
    consecutiveBackpressure: 0, lastRetryDisposition: null, dueAtMs: null,
    state: RECIPIENT_STATE.CONFIRMED, position: null, since: null, lastPass: null,
  };
  return recipient.drive;
}

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

/**
 * The frontier: the lowest cursor of the lane's recipients, or null while
 * any recipient's cursor is unknown (or there is none).
 * @param {Object} lane - The delivery lane.
 * @return {Object|null} {logIndex, ordinal}, or null.
 */
function recipientFrontier(lane) {
  const recipients = laneRecipients(lane);
  if (recipients.length === 0) return null;
  return recipients.reduce((frontier, {recipient}) =>
    frontier === undefined ? recipient.cursor : lowerCursor(frontier, recipient.cursor),
  undefined);
}

function confirmRecipient(recipient, last) {
  const drive = recipient.drive;
  if (drive.scanAfter !== null) {
    // Inside a provisional scan a committed vector lies above an unconfirmed
    // one: the cursor waits; the scan returns to it and ships this again.
    drive.scanAfter = last;
    return;
  }
  recipient.cursor = last;
  drive.state = RECIPIENT_STATE.CONFIRMED;
  drive.position = null;
  drive.since = null;
  drive.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  drive.consecutiveBackpressure = 0;
}

// The scan reached its captured tail. Rows owed beyond it belong to the next
// scan: a drained recipient runs once more for them; a provisional scan
// returns to the cursor on this recipient's own retry.
function endRecipientScan(delivery, recipient, ops) {
  const drive = recipient.drive;
  const through = drive.scanThrough;
  drive.scanThrough = null;
  if (drive.scanAfter === null) {
    const tail = readOwedCdcTail(delivery.owner.db);
    if (tail !== null && (through === null || positionAfter(tail, through))) drive.rerun = true;
    return PASS.DRAINED;
  }
  drive.scanAfter = null;
  ops.scheduleRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.TRANSIENT_FAILURE, drive);
  return PASS.PROVISIONAL;
}

// A delivery that ended without a committed or provisional answer over its
// vector: the recipient is unconfirmed, with the error that says why.
function unconfirmedAttempt(custody, error) {
  return {state: CDC_COVERAGE_STATE.UNCOVERED, error, custody};
}

// Deliver one vector to one recipient under that recipient's own invocation.
async function deliverVectorToRecipient(delivery, lane, target, vector, ops) {
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
  markUnconfirmed(delivery, recipient, vector);
  try {
    const scoped = cdcRecipientInvocation(context, isCurrent, branch, recipient,
      () => ops.recipientsObserved(delivery, lane, target));
    const answer = await delivery.deliverCdcVectorToSubscriber(branch.wrapper, events, scoped);
    scoped.assertCurrent();
    const {state} = observeCdcCoverage(answer, events, receiptGroupOf(branch, recipient));
    return state === CDC_COVERAGE_STATE.UNCOVERED ?
      unconfirmedAttempt(custody, unconfirmedRecipientError(answer)) : {state, custody};
  } catch (error) {
    return unconfirmedAttempt(custody, error);
  } finally {
    context.finish();
    drive.inFlight = null;
  }
}

// A vector shipped to a recipient has no committed receipt yet: the recipient
// is SUBSCRIBER_UNCONFIRMED at the vector's first row from the moment it is
// shipped (`since` is kept from the first such moment) until a committed
// receipt moves its cursor. The state is not terminal.
function markUnconfirmed(delivery, recipient, vector) {
  const drive = recipient.drive;
  drive.state = RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED;
  // Inside a provisional scan the unconfirmed position stays the row after
  // the cursor, not the row the scan has reached.
  if (drive.scanAfter === null) drive.position = positionOf(vector[0]);
  drive.since ??= delivery.owner.timeSource.now();
}

// The recipient answered without a committed receipt (or not at all within
// its invocation): it stays unconfirmed and its own retry is armed. Nothing
// else waits for it.
function holdRecipient(delivery, lane, target, attempt, vector, ops) {
  markUnconfirmed(delivery, target.recipient, vector);
  ops.recipientHeld(delivery, lane, target, vector[0], attempt.error);
  // Raw work still open: its actual local cleanup wakes this recipient at
  // once (the backoff is its other wake).
  if (attempt.custody.activeCdcInvocation) target.recipient.drive.resumeOnCleanup = true;
  return PASS.HELD;
}

// Ship the next vector after the recipient's position. Returns the pass's
// end, or null while the pass continues.
async function shipNextVector(delivery, lane, target, ops, pass) {
  const {branch, recipient} = target;
  if (!laneIsCurrent(delivery, lane) ||
      !recipientAttached(delivery, lane, branch, recipient)) return PASS.STOPPED;
  const vector = selectRecipientVector(delivery.owner, lane, recipient);
  if (vector.length === 0) return endRecipientScan(delivery, recipient, ops);
  if (pass.visited > 0 && pass.visited + vector.length > BOUND.DRIVE_PAGE_ROWS) {
    ops.scheduleRetry(delivery, null, OBLIGATION_RETRY_DISPOSITION.PAGE_YIELDED,
      recipient.drive);
    return PASS.PAGE_YIELDED;
  }
  const attempt = await deliverVectorToRecipient(delivery, lane, target, vector, ops);
  pass.visited += vector.length;
  const last = positionOf(vector.at(-1));
  if (attempt.state === CDC_COVERAGE_STATE.COMMITTED) {
    confirmRecipient(recipient, last);
    ops.frontierMoved(delivery, lane);
  } else if (attempt.state === CDC_COVERAGE_STATE.PROVISIONAL) {
    recipient.drive.scanAfter = last;
  } else if (!laneIsCurrent(delivery, lane)) {
    return PASS.STOPPED;
  } else if (!vector.some((obligation) => settledWithoutDelivery(lane, obligation))) {
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

// A drive runs another pass when rows arrived during a pass that drained,
// and when the cleanup a pass ended on has already closed (the cleanup's own
// wake found the drive still running and left the resumption to it).
function passContinues(delivery, target) {
  const {branch, recipient} = target;
  const {drive} = recipient;
  if (drive.lastPass === PASS.DRAINED) return drive.rerun;
  if (drive.lastPass !== PASS.CLEANUP_PENDING ||
      custodyOf(delivery, recipientKeyOf(branch, recipient)).activeCdcInvocation) return false;
  drive.resumeOnCleanup = false;
  return true;
}

/**
 * Run one recipient's single-flight drive: passes repeat while new rows
 * arrived during a pass that drained. It never rejects; a pass that throws
 * (a ledger read on a closing partition) ends the drive as STOPPED.
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
      drive.rerun = false;
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
    } while (laneIsCurrent(delivery, lane) && passContinues(delivery, target));
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

// Whether a recipient still has owed rows to confirm: its cursor is unknown
// or below the ledger's owed tail.
function behindOwedTail(recipient, tail) {
  return tail !== null && (recipient.cursor === null || positionAfter(tail, recipient.cursor));
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
function recipientWait(delivery, target, tail, nowMs) {
  const {branch, recipient} = target;
  const drive = recipientDriveOf(recipient);
  if (drive.running) return WAIT.RUNNING;
  if (delivery.recipientCustody.get(recipientKeyOf(branch, recipient))?.activeCdcInvocation) {
    return WAIT.CLEANUP;
  }
  if (BACKOFF_PASSES.has(drive.lastPass) && drive.dueAtMs !== null && drive.dueAtMs > nowMs) {
    return WAIT.BACKOFF;
  }
  return behindOwedTail(recipient, tail) ? null : WAIT.CAUGHT_UP;
}

function startRecipientDrive(delivery, lane, target, group, ops) {
  group.push(ops.track(delivery, runRecipientDrive(delivery, lane, target, ops)));
}

/**
 * Start the drive of every idle recipient behind the owed tail that no named
 * wait holds; started drives join `group`. A recipient in backoff keeps its
 * own due time (the lane's retry timer is armed at it), so a wake costs a
 * refusing recipient nothing. On a wake (`rerunRunning`) a running drive is
 * asked to run once more for the rows that woke it.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - The delivery lane.
 * @param {Array<Promise>} group - The drives the caller awaits.
 * @param {Object} ops - The lane's operations.
 * @param {boolean} [rerunRunning] - Whether a running drive runs again.
 * @return {Array<string>} The recipients that stay in backoff.
 */
function startRecipientDrives(delivery, lane, group, ops, rerunRunning = true) {
  const {owner} = delivery;
  const tail = owner.db ? readOwedCdcTail(owner.db) : null;
  const nowMs = owner.timeSource.now();
  const backoff = [];
  const targets = laneRecipients(lane);
  // Only a drive that was running before this wake runs again for it (a
  // drive started meanwhile, by another recipient's observation, is new).
  const wasRunning = new Set(targets.filter(({recipient}) => recipient.drive?.running)
    .map(({recipient}) => recipient));
  for (const target of targets) {
    const wait = recipientWait(delivery, target, tail, nowMs);
    const {drive} = target.recipient;
    if (wait === null) startRecipientDrive(delivery, lane, target, group, ops);
    else if (wait === WAIT.RUNNING && rerunRunning && wasRunning.has(target.recipient)) {
      drive.rerun = true;
    } else if (wait === WAIT.BACKOFF) {
      ops.armRetryAt(delivery, lane, drive.dueAtMs);
      backoff.push(recipientKeyOf(target.branch, target.recipient));
    }
  }
  return backoff;
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
  const tail = owner.db ? readOwedCdcTail(owner.db) : null;
  const nowMs = owner.timeSource.now();
  return laneRecipients(lane)
    .filter(({recipient}) => behindOwedTail(recipient, tail))
    .map((target) => ({target, wait: recipientWait(delivery, target, tail, nowMs)}));
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
      running: drive.running, retryDueAtMs: drive.dueAtMs, lastPass: drive.lastPass});
  });
}

export {
  custodyOf,
  recipientDiagnosticsOf,
  recipientFrontier,
  recipientsBehindOwedTail,
  startRecipientDrives,
  wakeRecipient,
};
