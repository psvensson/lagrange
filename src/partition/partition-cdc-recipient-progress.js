// Recipient progress of the CDC obligation lane (design note S3.11): the one
// owner of what each recipient's named state pins in the ledger and of the one
// path by which a recipient the ledger reclaimed past comes back. The model is
// a Raft follower's Progress (Probe / Replicate / Snapshot): a follower too far
// behind is sent a snapshot, the leader keeps its log from the snapshot's index
// so replication resumes right after the install, and a failed snapshot
// returns the follower to Probe.
//
// Two positions per recipient, never mixed:
// - cursor: the ledger position through which THIS recipient holds a committed
//   receipt of its own (null: none yet). It moves only in confirmRecipient.
//   Rows acknowledged without the recipient never move it.
// - hold: a re-list hold {position, sinceMs}: the ledger's newest position as
//   of the moment the range the recipient answered with a gap was shipped
//   (for a released recipient it is pinned when the offer is shipped, so that
//   nothing passes it before the answer). Every image the recipient opens
//   after it received that range is at or beyond the position: what lies at
//   or below it is the image's and no longer pinned, and nothing after it is
//   acknowledged while the hold stands. The rows committed during the image
//   are retained and shipped after the install, so one image suffices.
//
// State                  | holds the frontier at | left by
// NEVER_SHIPPED          | cursor (the floor)    | its first shipped vector
// SUBSCRIBER_UNCONFIRMED | cursor                | a receipt; a gap; release
// CONFIRMED              | cursor                | the next shipped vector
// POSITION_GAP           | hold                  | a receipt; release
// RELIST_OFFERED         | hold                  | a gap; a receipt; any other
//                        |                       | end of the offer (release)
// MUST_RELIST            | nothing (released)    | its next contact (an offer)
// DETACHED               | nothing               | lifecycle evidence ACTIVE
//
// Releases (PARTITION_CDC_RECIPIENT_RELEASE), each returning the recipient to
// MUST_RELIST and the rows it pinned to the frontier of the others:
// - LAG_WITHOUT_RECEIPT: a recipient more than RELIST_LAG_ROWS owed rows
//   behind its cursor, at least one of whose deliveries ended without a
//   committed receipt since its last one (refused, unknown, timed out at its
//   invocation budget, or only provisionally accepted). A count of ended
//   deliveries, not the drive's state when it is sampled, and no clock. Lag
//   alone is a backlog: a recipient nothing was shipped to (NEVER_SHIPPED),
//   or whose deliveries are all in flight or confirmed, is never released.
// - OFFER_UNANSWERED: the delivery that carried a re-list offer ended without
//   a gap or a receipt (a dead recipient pins rows only while one offer is in
//   flight, at most one invocation budget).
// - HOLD_LAG_EXCEEDED / HOLD_EXPIRED: a re-list hold pinned more than
//   RELIST_LAG_ROWS owed rows, or stood longer than RELIST_HOLD_DEADLINE_MS
//   (read when the frontier is computed; no timer). The image was too slow for
//   the write rate: the next contact offers again, at a newer position.
// No committed change is lost by a release: a released recipient's next
// contact is always an offer whose range it answers with a gap unless its
// cache already holds everything up to the ledger's newest event.
import {PARTITION_SERVICE_DEFAULT} from './partition-service-constants.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_RECIPIENT_RELEASE as RELEASE,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE} from
  './partition-cdc-obligation-constants.js';
import {countOwedCdcObligationsAfter, readCdcLedgerNewest} from
  './partition-cdc-obligation-ledger.js';
import {lowerCursor, positionAfter, positionOf} from './partition-cdc-obligation-vector.js';

const RECIPIENT_PROGRESS_LOG_MSG = Object.freeze({
  RELEASED: 'CDC recipient released to MUST_RELIST: what it pinned is reclaimed; its next ' +
    'contact offers it a re-list',
  OFFERED: 'CDC recipient offered a re-list: the ledger is held from its newest position',
});

// What the lane's frontier is (diagnostics; the position itself is
// recipientFrontier's answer).
const PARTITION_CDC_FRONTIER_STATE = Object.freeze({
  NO_RECIPIENTS: 'no_recipients',
  // A recipient that holds the frontier has confirmed nothing yet.
  UNCONFIRMED: 'unconfirmed',
  HELD: 'held',
  // Recipients exist and every one is MUST_RELIST or DETACHED.
  UNHELD: 'unheld',
});

// The frontier when the lane has recipients and none holds it: the whole
// ledger may be acknowledged with no receipt. Every such recipient is
// MUST_RELIST (its next contact is a re-list offer at the newest position) or
// DETACHED (it returns as a new recipient with no cursor), so each passes
// through an image at or beyond everything reclaimed meanwhile.
const UNHELD_FRONTIER = Object.freeze({logIndex: Number.MAX_SAFE_INTEGER,
  ordinal: Number.MAX_SAFE_INTEGER});

const OUTSIDE_FRONTIER = Object.freeze(new Set([RECIPIENT_STATE.DETACHED,
  RECIPIENT_STATE.MUST_RELIST]));

// One recipient's tenure-local drive state. scanThrough is the owed tail
// captured when its scan began: a scan stays finite while rows keep arriving.
// scanAfter is its provisional scan position (rows shipped past a vector that
// was only provisionally accepted). retryDelayMs / consecutiveBackpressure are
// this recipient's own backoff. shipped / receipts count its vectors and its
// committed receipts; unconfirmedEnds counts its deliveries that ended with
// no committed receipt since its last one (the release rule's evidence);
// releases counts its releases per reason (diagnostics).
function recipientDriveOf(recipient) {
  recipient.drive ??= {
    running: false, resumeOnCleanup: false,
    scanAfter: null, scanThrough: null, inFlight: null,
    retryDelayMs: PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS,
    consecutiveBackpressure: 0, lastRetryDisposition: null, dueAtMs: null,
    state: RECIPIENT_STATE.NEVER_SHIPPED, position: null, since: null, lastPass: null,
    detachReason: null, lifecycleRead: null, positionProbe: null,
    hold: null, shippedAtNewest: null, shipped: 0, receipts: 0, unconfirmedEnds: 0,
    relistOffers: 0,
    releases: {}, lastRelease: null,
  };
  return recipient.drive;
}

function holdsFrontier(recipient) {
  return !OUTSIDE_FRONTIER.has(recipientDriveOf(recipient).state);
}

/**
 * The position a recipient holds the frontier at, which is also the position
 * it is shipped after: its re-list hold while it has one, else its cursor
 * (null: nothing confirmed, the ledger's floor).
 * @param {Object} recipient - The recipient.
 * @return {Object|null} {logIndex, ordinal}, or null.
 */
function heldPositionOf(recipient) {
  const {hold} = recipientDriveOf(recipient);
  return hold === null ? recipient.cursor : hold.position;
}

/**
 * The frontier: the lowest held position of the recipients that hold it, or
 * null while any of them has confirmed nothing (or the lane has no
 * recipient); UNHELD_FRONTIER when it has recipients and none holds it.
 * @param {Array<Object>} all - The lane's {branch, recipient} pairs.
 * @return {Object|null} {logIndex, ordinal}, or null.
 */
function recipientFrontier(all) {
  const holders = all.filter(({recipient}) => holdsFrontier(recipient));
  if (holders.length === 0) return all.length === 0 ? null : UNHELD_FRONTIER;
  return holders.reduce((frontier, {recipient}) =>
    frontier === undefined ? heldPositionOf(recipient) :
      lowerCursor(frontier, heldPositionOf(recipient)), undefined);
}

function frontierStateOf(all) {
  if (all.length === 0) return PARTITION_CDC_FRONTIER_STATE.NO_RECIPIENTS;
  const frontier = recipientFrontier(all);
  if (frontier === UNHELD_FRONTIER) return PARTITION_CDC_FRONTIER_STATE.UNHELD;
  return frontier === null ? PARTITION_CDC_FRONTIER_STATE.UNCONFIRMED :
    PARTITION_CDC_FRONTIER_STATE.HELD;
}

// The states a shipped vector moves to "shipped, no committed receipt yet".
// A re-lister (POSITION_GAP, RELIST_OFFERED) and a released or detached
// recipient keep their state until an answer or a release changes it.
const AWAITING_FIRST_ANSWER = Object.freeze(new Set([RECIPIENT_STATE.NEVER_SHIPPED,
  RECIPIENT_STATE.CONFIRMED]));

/**
 * A vector was shipped to the recipient: it is unconfirmed at the vector's
 * first row (`since` is kept from the first such moment) until a committed
 * receipt moves its cursor.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} recipient - The recipient.
 * @param {Array<Object>} vector - The shipped vector.
 * @return {void}
 */
function recordShipped(delivery, recipient, vector) {
  const drive = recipient.drive;
  drive.shipped += 1;
  // Where a gap answer to this vector pins the re-list hold: an image opened
  // after the recipient received it is at or beyond this position.
  drive.shippedAtNewest = positionOf(readCdcLedgerNewest(delivery.owner.db));
  if (AWAITING_FIRST_ANSWER.has(drive.state)) {
    drive.state = RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED;
  }
  // Inside a provisional scan the unconfirmed position stays the row after
  // the cursor, not the row the scan has reached.
  if (drive.scanAfter === null) drive.position = positionOf(vector[0]);
  drive.since ??= delivery.owner.timeSource.now();
}

/**
 * The recipient answered that it has not applied the range's predecessor: it
 * re-lists (the Snapshot state). A recipient that holds the frontier now
 * holds it at a re-list hold: the newest position as of the shipped range,
 * which its image covers; an offered one keeps the hold its offer pinned. A
 * recipient released while its delivery ran stays released.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} recipient - The recipient.
 * @return {boolean} Whether a hold was pinned (the frontier may have moved).
 */
function recordGapAnswer(delivery, recipient) {
  if (!holdsFrontier(recipient)) return false;
  const drive = recipient.drive;
  drive.state = RECIPIENT_STATE.POSITION_GAP;
  if (drive.hold !== null) return false;
  drive.hold = Object.freeze({position: drive.shippedAtNewest,
    sinceMs: delivery.owner.timeSource.now()});
  return true;
}

/**
 * A committed (or already-applied) receipt confirms the recipient through
 * `last`: the one place its cursor moves. An already-applied answer may
 * confirm beyond the vector (its group's log committed through `last`). A
 * recipient that confirms holds the frontier at its cursor again: a re-list
 * hold dissolves into it, and a released recipient is back.
 * @param {Object} recipient - The recipient.
 * @param {Object} last - The position confirmed through.
 * @return {void}
 */
function confirmRecipient(recipient, last) {
  const drive = recipient.drive;
  if (drive.scanAfter !== null) {
    // Inside a provisional scan a committed vector lies above an unconfirmed
    // one: the cursor waits; the scan returns to it and ships this again.
    drive.scanAfter = last;
    return;
  }
  recipient.cursor = recipient.cursor === null || positionAfter(last, recipient.cursor) ?
    last : recipient.cursor;
  drive.receipts += 1;
  drive.unconfirmedEnds = 0;
  drive.hold = null;
  drive.state = RECIPIENT_STATE.CONFIRMED;
  drive.position = null;
  drive.since = null;
  drive.retryDelayMs = PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
  drive.consecutiveBackpressure = 0;
}

/**
 * A recipient whose propagation binding was released starts again: nothing
 * it confirmed under the old binding counts, and nothing was shipped to it
 * under the next one yet. A detached one starts as a new recipient.
 * @param {Object} recipient - The released binding's primary recipient.
 * @return {void}
 */
function restartRecipient(recipient) {
  recipient.cursor = null;
  const {drive} = recipient;
  if (drive === null) return;
  if (drive.state === RECIPIENT_STATE.DETACHED) {
    recipient.drive = null;
    return;
  }
  Object.assign(drive, {state: RECIPIENT_STATE.NEVER_SHIPPED, hold: null, unconfirmedEnds: 0,
    shipped: 0, receipts: 0});
}

/**
 * Offer a released recipient its re-list: pin the hold at the ledger's
 * newest position before anything is shipped to it. From here nothing after
 * that position is acknowledged without the recipient until it confirms or
 * the hold is released.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} recipient - The recipient; it is MUST_RELIST.
 * @param {Object} name - Who it is ({recipient, groupId}; logged).
 * @return {boolean} Whether a hold was pinned (the ledger has an event).
 */
function offerRelist(delivery, recipient, name) {
  const {owner} = delivery;
  const newest = readCdcLedgerNewest(owner.db);
  if (newest === null) return false;
  const drive = recipient.drive;
  drive.hold = Object.freeze({position: positionOf(newest), sinceMs: owner.timeSource.now()});
  drive.state = RECIPIENT_STATE.RELIST_OFFERED;
  drive.relistOffers += 1;
  owner.logger.debug?.(RECIPIENT_PROGRESS_LOG_MSG.OFFERED, {partitionId: owner.partitionId,
    ...name, cursor: recipient.cursor, hold: drive.hold.position});
  return true;
}

// A release that says the recipient could not use what was retained for it
// is an operator's line; an unanswered offer repeats on a dead recipient's
// every retry and is a debug line (its count is in the lane diagnostics).
const QUIET_RELEASES = Object.freeze(new Set([RELEASE.OFFER_UNANSWERED]));

/**
 * Release a recipient to MUST_RELIST: it holds nothing, and its next contact
 * is a re-list offer.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} recipient - The recipient.
 * @param {string} reason - A PARTITION_CDC_RECIPIENT_RELEASE.
 * @param {Object} [detail] - Who it is and what the decision read (logged).
 * @return {void}
 */
function releaseRecipient(delivery, recipient, reason, detail = {}) {
  const {owner} = delivery;
  const drive = recipient.drive;
  const fields = {partitionId: owner.partitionId, cursor: recipient.cursor, reason,
    state: drive.state,
    hold: drive.hold === null ? null : drive.hold.position, receipts: drive.receipts,
    bound: BOUND.RELIST_LAG_ROWS, ...detail};
  drive.state = RECIPIENT_STATE.MUST_RELIST;
  drive.hold = null;
  drive.releases[reason] = (drive.releases[reason] ?? 0) + 1;
  drive.lastRelease = Object.freeze({reason, atMs: owner.timeSource.now()});
  if (QUIET_RELEASES.has(reason)) owner.logger.debug?.(RECIPIENT_PROGRESS_LOG_MSG.RELEASED, fields);
  else owner.logger.warn(RECIPIENT_PROGRESS_LOG_MSG.RELEASED, fields);
}

/**
 * The delivery that carried a re-list offer ended: an offer no gap and no
 * receipt answered is withdrawn (the recipient did not show it is there).
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} recipient - The recipient.
 * @param {Object} name - Who it is ({recipient, groupId}; logged).
 * @return {boolean} Whether the offer was withdrawn (rows were released).
 */
function settleRelistOffer(delivery, recipient, name) {
  if (recipient.drive?.state !== RECIPIENT_STATE.RELIST_OFFERED) return false;
  releaseRecipient(delivery, recipient, RELEASE.OFFER_UNANSWERED, name);
  return true;
}

/**
 * A delivery to the recipient ended with no committed receipt (refused,
 * unknown, timed out, a gap, or only provisionally accepted): the release
 * rule's evidence that lag is not just a backlog.
 * @param {Object} recipient - The recipient.
 * @return {void}
 */
function recordUnconfirmedEnd(recipient) {
  recipient.drive.unconfirmedEnds += 1;
}

/**
 * Why a recipient that holds the frontier must be released now, or null.
 * Read whenever the frontier is computed.
 * @param {Object} owner - The partition service.
 * @param {Object} recipient - A recipient that holds the frontier and has
 *   been shipped to.
 * @param {number} nowMs - The owner's clock.
 * @return {Object|null} {reason, lagAtLeast}, or null.
 */
function releaseDueOf(owner, recipient, nowMs) {
  const drive = recipient.drive;
  // Lag alone is a backlog: only a delivery that ended unconfirmed since the
  // recipient's last receipt makes it evidence. A hold is bounded regardless.
  const unconfirmed = drive.unconfirmedEnds > 0;
  if (drive.hold === null && !unconfirmed) return null;
  const limit = BOUND.RELIST_LAG_ROWS + 1;
  const lagAtLeast = countOwedCdcObligationsAfter(owner.db, heldPositionOf(recipient), limit);
  const lagging = lagAtLeast > BOUND.RELIST_LAG_ROWS;
  if (drive.hold !== null) {
    if (lagging) return {reason: RELEASE.HOLD_LAG_EXCEEDED, lagAtLeast};
    return nowMs - drive.hold.sinceMs > BOUND.RELIST_HOLD_DEADLINE_MS ?
      {reason: RELEASE.HOLD_EXPIRED, lagAtLeast, heldMs: nowMs - drive.hold.sinceMs} : null;
  }
  return lagging ?
    {reason: RELEASE.LAG_WITHOUT_RECEIPT, lagAtLeast, unconfirmedEnds: drive.unconfirmedEnds} :
    null;
}

function relistDiagnosticsOf(drive) {
  return Object.freeze({hold: drive.hold, shipped: drive.shipped, receipts: drive.receipts,
    offers: drive.relistOffers, releases: Object.freeze({...drive.releases}),
    lastRelease: drive.lastRelease});
}

export {
  PARTITION_CDC_FRONTIER_STATE,
  confirmRecipient,
  frontierStateOf,
  heldPositionOf,
  holdsFrontier,
  offerRelist,
  recipientDriveOf,
  recipientFrontier,
  recordGapAnswer,
  recordShipped,
  recordUnconfirmedEnd,
  relistDiagnosticsOf,
  releaseDueOf,
  releaseRecipient,
  restartRecipient,
  settleRelistOffer,
};
