// The range one drive step of the CDC obligation lane ships (quest
// cdc-obligation-range-shipping, records S-1 and S-2, design decisions 1 and
// 2). It is composed fresh from the ledger at every step, in one synchronous
// span, and nothing of it is retained: no ledger read is held across an await
// and no payload survives between attempts.
//
// 1. Pre-pass, row by row from the scan cursor, over positions only: a row
//    pending acknowledgement is skipped, a row at or below the hydrated index
//    is acknowledged without delivery, acknowledgement backpressure ends the
//    pass, any other row is READY. Every row it passes is a visited row of
//    the drive's quantum (DRIVE_PAGE_ROWS), as it was when the lane visited
//    one row at a time: a pass never passes more rows than its quantum has left.
// 2. Cut: the maximal run of consecutive READY rows from the first one, ended
//    only by the captured tail, a row that is not READY (a hole, or the
//    retained-delivered bound counted over the rows already taken), the byte
//    bound or the lane's shipping window. The byte bound and the window cut at
//    ledger-entry boundaries: the READY ordinals of one log index travel
//    together, and the first entry is always taken whole, so an entry above a
//    bound ships alone and nothing is refused, split or dropped.
// 3. Payload read of the chosen positions only.
//
// While the lane's progress cell holds leaf coverage the composition is capped
// at the cell's last position, so the identical vector is presented again and
// covered leaves are not sent again; when the capped composition is no longer
// the cell's range (the window fell below it, or its rows were acknowledged
// meanwhile) the cell is discarded and the range is composed without the cap.

import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND, PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_EVENT_FIELD as FIELD} from './partition-cdc-obligation-constants.js';
import {countRetainedDeliveredCdcObligations, isCdcPositionReclaimed, readCdcObligationProgress,
  readOwedCdcHead, readOwedCdcObligationPositions, readOwedCdcObligations, readOwedCdcTail} from
  './partition-cdc-obligation-ledger.js';
import {cdcProgressHoldsCoverage} from './partition-cdc-obligation-progress.js';

// What one composition ended as (R07): a range to ship, nothing READY up to
// the captured tail, the drive's visit quantum spent on rows that needed no
// delivery, or the lane's acknowledgement backpressure.
const SHIP_RANGE_STATE = Object.freeze({
  READY: 'ready',
  DRAINED: 'drained',
  QUANTUM_SPENT: 'visit_quantum_spent',
  ACKNOWLEDGEMENT_BACKPRESSURE: DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE,
});

// What ended a run of READY rows. Only WINDOW widens the shipping window.
const SHIP_RANGE_CUT = Object.freeze({
  TAIL: 'captured_tail',
  NOT_READY: 'row_not_ready',
  BYTES: 'byte_bound',
  WINDOW: 'ship_window',
});

// What the pre-pass decides for one row.
const PRE_PASS_STEP = Object.freeze({
  READY: 'ready',
  PENDING: 'pending_acknowledgement',
  BACKPRESSURE: 'acknowledgement_backpressure',
});
const DRAINED_RANGE = Object.freeze({state: SHIP_RANGE_STATE.DRAINED});
const QUANTUM_SPENT_RANGE = Object.freeze({state: SHIP_RANGE_STATE.QUANTUM_SPENT});
const BACKPRESSURED_RANGE = Object.freeze({state: SHIP_RANGE_STATE.ACKNOWLEDGEMENT_BACKPRESSURE});

function positionOf(row) {
  return {logIndex: row.logIndex, ordinal: row.ordinal};
}

function samePosition(left, right) {
  return left.logIndex === right.logIndex && left.ordinal === right.ordinal;
}

function isBefore(left, right) {
  return left.logIndex < right.logIndex ||
    (left.logIndex === right.logIndex && left.ordinal < right.ordinal);
}

function advanceScanCursor(lane, row) {
  if (lane.scan !== null) {
    lane.scan.cursor = positionOf(row);
  }
}

function hasOwedWorkBeyondScan(owner, scan) {
  const tail = readOwedCdcTail(owner.db);
  if (tail === null) return false;
  if (scan.through === null) return true;
  return isBefore(scan.through, tail);
}

function scanReachedTail(scan) {
  return scan.cursor?.logIndex === scan.through?.logIndex &&
    scan.cursor?.ordinal === scan.through?.ordinal;
}

function openScan(owner, lane) {
  lane.scan ??= {cursor: null, through: readOwedCdcTail(owner.db), provisional: false};
  lane.scan.through ??= readOwedCdcTail(owner.db);
  return lane.scan;
}

// Delivering past the lowest owed row keeps every delivered row above it in
// the ledger (decision D1 reclaims only below it), so the lane does that only
// while those retained rows and its own pending acknowledgements stay under
// RETAINED_DELIVERED_MAX; the lowest owed row itself is always deliverable,
// and a scan stopped here restarts from it (lane.scan cleared).
function retainedDeliveredBackpressured(owner, lane, obligation) {
  const head = readOwedCdcHead(owner.db);
  if (head === null || samePosition(head, obligation)) {
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

// The pre-pass of one row. `acknowledge` is the lane's acknowledgement of a
// row that needs no delivery: (delivery, obligation) -> whether it was taken.
function resolvePrePassStep(delivery, lane, obligation, acknowledge) {
  if (lane.pending.has(obligation.eventKey)) {
    return PRE_PASS_STEP.PENDING;
  }
  if (obligation.logIndex <= (lane.hydratedThroughLogIndex || 0)) {
    if (acknowledgementBackpressured(delivery.owner, lane, obligation) ||
        !acknowledge(delivery, obligation)) {
      return PRE_PASS_STEP.BACKPRESSURE;
    }
    return PRE_PASS_STEP.PENDING;
  }
  if (acknowledgementBackpressured(delivery.owner, lane, obligation)) {
    return PRE_PASS_STEP.BACKPRESSURE;
  }
  return PRE_PASS_STEP.READY;
}

// The first READY row after the scan cursor, one position read per row so
// each row is judged as the ledger and the lane stand after the previous
// row's acknowledgement: {state: READY, row}, the drained range when nothing
// up to `through` is READY, the backpressured range when the pass ends here,
// or the quantum-spent range once `visit.passed` rows were passed over
// (`visit` = {passed, quantum}, counted across the compositions of one step).
function firstReadyRow(delivery, lane, through, acknowledge, visit) {
  const {owner} = delivery;
  for (;;) {
    if (visit.passed >= visit.quantum) return QUANTUM_SPENT_RANGE;
    const [row] = readOwedCdcObligationPositions(owner.db,
      {after: openScan(owner, lane).cursor, through, limit: 1});
    if (!row) return DRAINED_RANGE;
    const step = resolvePrePassStep(delivery, lane, row, acknowledge);
    if (step === PRE_PASS_STEP.BACKPRESSURE) return BACKPRESSURED_RANGE;
    if (step === PRE_PASS_STEP.READY) return {state: SHIP_RANGE_STATE.READY, row};
    advanceScanCursor(lane, row);
    visit.passed += 1;
  }
}

// The owed positions after `first` up to `through`, in log order, read in
// pages sized by the window: the cut usually needs one page.
function* owedPositionsAfter(db, first, through, pageRows) {
  let after = positionOf(first);
  for (;;) {
    const page = readOwedCdcObligationPositions(db, {after, through, limit: pageRows});
    yield* page;
    if (page.length < pageRows) return;
    after = positionOf(page.at(-1));
  }
}

// Whether a row after the first READY one continues the run: it is not
// pending, and the retained-delivered bound is not reached counting the rows
// already taken into this range as the pending acknowledgements they become
// (the pre-pass of one row at a time counted them the same way). Such a row is
// above the hydrated index and never the lowest owed row, because the first
// READY row precedes it; the acknowledgement batch bounds were judged at the
// first row and nothing in this synchronous span moves them.
function continuesRun(lane, row, taken, retainedDelivered) {
  return !lane.pending.has(row.eventKey) &&
    lane.pending.size + taken + retainedDelivered() < BOUND.RETAINED_DELIVERED_MAX;
}

// Whether the next whole entry joins the range, or which bound cuts before
// it. The first entry always joins. The byte bound is asked first, so WINDOW
// means the window alone held the entry back.
function entryVerdict(range, entry, windowRows) {
  if (range.rows.length === 0) return null;
  if (range.bytes + entry.bytes > BOUND.SHIP_MAX_BYTES) return SHIP_RANGE_CUT.BYTES;
  return range.rows.length + entry.rows.length > windowRows ? SHIP_RANGE_CUT.WINDOW : null;
}

function takeEntry(range, entry, windowRows) {
  const cut = entryVerdict(range, entry, windowRows);
  if (cut !== null) return cut;
  range.rows.push(...entry.rows);
  range.bytes += entry.bytes;
  return null;
}

// The maximal run of consecutive READY rows from `first`, cut at whole-entry
// boundaries by the byte bound and the window: {rows, cut}.
function cutReadyRun(owner, lane, first, through) {
  const windowRows = lane.shipWindow;
  const range = {rows: [], bytes: 0};
  let entry = {rows: [first], bytes: first.eventBytes};
  let retained = null;
  const retainedDelivered = () => {
    retained ??= countRetainedDeliveredCdcObligations(owner.db, BOUND.RETAINED_DELIVERED_MAX);
    return retained;
  };
  // The run ended for `reason` after the entry in hand; that entry still
  // joins unless a bound cuts before it.
  const endedBy = (reason) => {
    const cut = takeEntry(range, entry, windowRows) ?? reason;
    return {rows: range.rows, cut};
  };
  for (const row of owedPositionsAfter(owner.db, first, through, windowRows + 1)) {
    if (!continuesRun(lane, row, range.rows.length + entry.rows.length, retainedDelivered)) {
      return endedBy(SHIP_RANGE_CUT.NOT_READY);
    }
    if (row.logIndex === entry.rows[0].logIndex) {
      entry.rows.push(row);
      entry.bytes += row.eventBytes;
      continue;
    }
    const cut = takeEntry(range, entry, windowRows);
    if (cut !== null) return {rows: range.rows, cut};
    entry = {rows: [row], bytes: row.eventBytes};
  }
  return endedBy(SHIP_RANGE_CUT.TAIL);
}

// The cell whose range the lane presents again unchanged, or null.
function pinnedCellOf(lane) {
  const cell = lane.currentObligation;
  return cell !== null && cdcProgressHoldsCoverage(cell) ? cell : null;
}

function composeThrough(delivery, lane, acknowledge, pinned, visit) {
  const scan = openScan(delivery.owner, lane);
  if (scan.through === null) return DRAINED_RANGE;
  const through = pinned !== null && isBefore(pinned.last, scan.through) ?
    pinned.last : scan.through;
  const first = firstReadyRow(delivery, lane, through, acknowledge, visit);
  if (first.state !== SHIP_RANGE_STATE.READY) return first;
  return {state: SHIP_RANGE_STATE.READY,
    ...cutReadyRun(delivery.owner, lane, first.row, through)};
}

function isRangeOfCell(range, cell) {
  return range.state === SHIP_RANGE_STATE.READY && range.rows.length === cell.rows &&
    samePosition(range.rows[0], cell.first) && samePosition(range.rows.at(-1), cell.last);
}

function readRangePayloads(db, rows) {
  const [first] = rows;
  return readOwedCdcObligations(db, {
    after: {logIndex: first.logIndex, ordinal: first.ordinal - 1},
    through: positionOf(rows.at(-1)), limit: rows.length});
}

// A composition that ships nothing ends the step (and never discards a pinned
// cell) on backpressure or a spent quantum; a drained one does when it was
// not capped by a pinned cell.
function endsStepWithoutRange(range, pinned) {
  return range.state === SHIP_RANGE_STATE.ACKNOWLEDGEMENT_BACKPRESSURE ||
    range.state === SHIP_RANGE_STATE.QUANTUM_SPENT ||
    (range.state === SHIP_RANGE_STATE.DRAINED && pinned === null);
}

/**
 * Compose the range this drive step ships (see the header). Leading rows that
 * need no delivery are passed (the scan cursor moves over them) and hydrated
 * ones acknowledged through `acknowledge`; at most `quantum` rows are passed.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - Its current obligation lane.
 * @param {Function} acknowledge - (delivery, obligation) -> boolean, the
 *   lane's acknowledgement of a row that needs no delivery.
 * @param {number} quantum - The visited rows the drive pass has left.
 * @return {Object} {state: a SHIP_RANGE_STATE, passed}: how the composition
 *   ended and how many rows it passed over; when READY also {obligations,
 *   windowCut}: the owed rows with their payloads, in log order, and whether
 *   the shipping window was what cut the run.
 */
function composeCdcShipRange(delivery, lane, acknowledge, quantum) {
  const visit = {passed: 0, quantum};
  for (;;) {
    const pinned = pinnedCellOf(lane);
    const range = composeThrough(delivery, lane, acknowledge, pinned, visit);
    if (endsStepWithoutRange(range, pinned)) {
      return Object.freeze({state: range.state, passed: visit.passed});
    }
    if (pinned === null || isRangeOfCell(range, pinned)) {
      return Object.freeze({
        state: SHIP_RANGE_STATE.READY, passed: visit.passed,
        obligations: readRangePayloads(delivery.owner.db, range.rows),
        windowCut: range.cut === SHIP_RANGE_CUT.WINDOW});
    }
    lane.currentObligation = null;
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

/**
 * The vector a range ships: one event per owed row, in log order, each with
 * its own obligation identity and its own sequence number.
 * @param {Array<Object>} obligations - The range's owed rows with payloads.
 * @param {Function} nextSequenceNumber - () -> the next stream sequence number.
 * @return {Array<Object>} The frozen, dense vector.
 */
function eventsOfShipRange(obligations, nextSequenceNumber) {
  return Object.freeze(obligations.map((obligation) =>
    eventOf(obligation, nextSequenceNumber())));
}

/**
 * Whether every row of a range needs no delivery any more: pending
 * acknowledgement, at or below the hydrated index, or within the ledger's
 * reclaimed prefix.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - Its current obligation lane.
 * @param {Array<Object>} obligations - The range's owed rows.
 * @return {boolean} Whether the whole range is already acknowledged.
 */
function isShipRangeAlreadyAcknowledged(delivery, lane, obligations) {
  const {db} = delivery.owner;
  const progress = db ? readCdcObligationProgress(db) : null;
  const hydratedThrough = lane.hydratedThroughLogIndex || 0;
  return obligations.every((obligation) => lane.pending.has(obligation.eventKey) ||
    obligation.logIndex <= hydratedThrough || isCdcPositionReclaimed(obligation, progress));
}

export {SHIP_RANGE_STATE, advanceScanCursor, composeCdcShipRange, eventsOfShipRange,
  hasOwedWorkBeyondScan, isShipRangeAlreadyAcknowledged, scanReachedTail};
