// The range one drive step of the CDC obligation lane ships (quest
// cdc-obligation-range-shipping; records S-1, S-2 and S-5, design decisions 1
// and 2, and the class repair of record 5: S-12 the shipping unit, S-13 the
// one cut authority). It is composed fresh from the ledger at every step, in
// one synchronous span, and nothing of it is retained: no ledger read is held
// across an await and no payload survives between attempts.
//
// 1. Pre-pass, row by row from the scan cursor, over positions only: a row
//    pending acknowledgement is skipped, a row at or below the hydrated index
//    is acknowledged without delivery, acknowledgement backpressure (the
//    batch bounds, or the retained-delivered bound for a row that is not the
//    lowest owed one) ends the pass, any other row is READY.
// 2. Cut: the run of consecutive READY rows from the first one, taken unit by
//    unit (below). The first unit is always taken, so nothing is refused or
//    dropped. A further unit joins unless the run ended before it (a row
//    pending acknowledgement, or the entry of the scan's captured tail or of
//    the pinned cell's cap was the last one read), the retained-delivered
//    bound is reached counting the rows already taken as the pending
//    acknowledgements they become, the byte bound would be passed with it,
//    or the shipping window would.
// 3. Payload read of the chosen positions only.
//
// THE SHIPPING UNIT (S-12). The lane never cuts inside a unit.
// - An entry (the rows of one log index) whose owed rows together hold at
//   most SHIP_MAX_BYTES ships whole: its consecutive READY rows are one unit.
//   A vector therefore never ends on an ordinal while a later READY sibling
//   stays behind: an incoming row of equal version is accepted by the cache
//   merge, so a strict prefix would move a recipient that holds the entry
//   back to an earlier ordinal's value.
// - An entry whose owed rows together hold more ships as the lane before
//   ranges shipped every entry: each READY row is a unit that travels alone,
//   one ordinal per vector in ordinal order. A vector thus holds at most
//   SHIP_MAX_BYTES, or one ordinal.
// What decides between the two is the summed payload bytes of the rows of
// that log index the ledger still owes, read with the positions. That is
// durable, replicated state: nothing of the lane enters (pending
// acknowledgements, the hydrated index, the window, the pin, the cursor), so
// every composition, a composition after a handshake and one by a new tenure
// decide alike over the same ledger. It changes only when a CDC_DELIVERED
// commits for rows of the entry, and only from "per ordinal" to "whole": the
// rows that left can never be shipped again, and the READY rows that remain
// are then one unit. A recipient that holds one of them is handed that
// ordinal again together with every later one, never an earlier ordinal.
// A row pending acknowledgement between READY siblings ends the unit before
// it (it must not be delivered again); the lane produces that only for an
// entry that began per ordinal, was passed with provisional coverage and
// became whole.
//
// ONE CUT AUTHORITY (S-13). shipUnitsFrom owns the unit boundaries and is the
// only place that ends a range by position: the run ends at a row that is not
// READY, and the captured tail and the pinned cap end it with the entry they
// lie in, which is read whole (a cap that lies inside a unit therefore never
// yields the cell's range, and the cell is discarded). The retained-delivered
// bound, the byte bound and the window (cutBefore) are asked of whole units
// it hands out; no cut site decides alone. The retained-delivered bound is
// therefore passed by at most one unit's further rows, and the lowest owed
// row, which is exempt from it, carries its whole unit.
//
// While the lane's progress cell holds leaf coverage the composition is capped
// at the cell's last position, so the identical vector is presented again and
// covered leaves are not sent again; when the capped composition is no longer
// the cell's range (the window fell below it, its rows were acknowledged
// meanwhile, or its last position no longer ends a unit) the cell is
// discarded and the range is composed without the cap.

import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND, PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_OBLIGATION_EVENT_FIELD as FIELD} from './partition-cdc-obligation-constants.js';
import {countRetainedDeliveredCdcObligations, isCdcPositionReclaimed, readCdcObligationProgress,
  readOwedCdcHead, readOwedCdcObligationPositions, readOwedCdcObligations, readOwedCdcTail} from
  './partition-cdc-obligation-ledger.js';
import {cdcProgressHoldsCoverage} from './partition-cdc-obligation-progress.js';

// What one composition ended as (R07): a range to ship, nothing READY up to
// the captured tail, or the lane's acknowledgement backpressure.
const SHIP_RANGE_STATE = Object.freeze({
  READY: 'ready',
  DRAINED: 'drained',
  ACKNOWLEDGEMENT_BACKPRESSURE: DRIVE.ACKNOWLEDGEMENT_BACKPRESSURE,
});

// What ended a run of READY rows. Only WINDOW widens the shipping window.
const SHIP_RANGE_CUT = Object.freeze({
  TAIL: 'captured_tail',
  PINNED_CAP: 'pinned_cap',
  NOT_READY: 'row_not_ready',
  RETAINED_DELIVERED: 'retained_delivered_bound',
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
// up to `through` is READY, or the backpressured range when the pass ends here.
function firstReadyRow(delivery, lane, through, acknowledge) {
  const {owner} = delivery;
  for (;;) {
    const [row] = readOwedCdcObligationPositions(owner.db,
      {after: openScan(owner, lane).cursor, through, limit: 1});
    if (!row) return DRAINED_RANGE;
    const step = resolvePrePassStep(delivery, lane, row, acknowledge);
    if (step === PRE_PASS_STEP.BACKPRESSURE) return BACKPRESSURED_RANGE;
    if (step === PRE_PASS_STEP.READY) return {state: SHIP_RANGE_STATE.READY, row};
    advanceScanCursor(lane, row);
  }
}

// The owed positions after `after` up to `through`, in log order, read in
// pages.
function* owedPositionsAfter(db, after, through, pageRows) {
  let from = after;
  for (;;) {
    const page = readOwedCdcObligationPositions(db, {after: from, through, limit: pageRows});
    yield* page;
    if (page.length < pageRows) return;
    from = positionOf(page.at(-1));
  }
}

// The ledger entries from the one `first` belongs to through the one
// `through` belongs to, each with every row it still owes, in log order:
// {rows, bytes}, `bytes` the summed payload bytes of those owed rows (what
// decides how the entry ships, see the header).
function* owedEntriesFrom(db, first, through, pageRows) {
  let entry = null;
  for (const row of owedPositionsAfter(db, {logIndex: first.logIndex, ordinal: -1},
    {logIndex: through.logIndex, ordinal: Number.MAX_SAFE_INTEGER}, pageRows)) {
    if (entry !== null && row.logIndex !== entry.rows[0].logIndex) {
      yield entry;
      entry = null;
    }
    entry ??= {rows: [], bytes: 0};
    entry.rows.push(row);
    entry.bytes += row.eventBytes;
  }
  if (entry !== null) yield entry;
}

// The units of one entry in the READY run that begins at `first`: its rows
// before `first` were passed by the scan; a row pending acknowledgement ends
// the run (`runEnded`). An entry that fits the byte bound gives one unit, its
// consecutive READY rows; one that exceeds it gives one unit per READY row,
// each travelling alone.
function unitsOfEntry(lane, entry, first) {
  const alone = entry.bytes > BOUND.SHIP_MAX_BYTES;
  const units = [];
  for (const row of entry.rows) {
    if (isBefore(row, first)) continue;
    if (lane.pending.has(row.eventKey)) return {units, runEnded: true};
    if (alone || units.length === 0) units.push({rows: [], bytes: 0, alone});
    units.at(-1).rows.push(row);
    units.at(-1).bytes += row.eventBytes;
  }
  return {units, runEnded: false};
}

// THE ONE CUT AUTHORITY (S-13): the shipping units of the READY run that
// begins at `first`, in ledger order, each {rows, bytes, alone}; its return
// value is what ended the run. It owns the unit boundaries, and it alone ends
// a run by position: at a row that is not READY, and with the entry the
// captured tail or the pinned cap lies in (`end`: {through, cut}). That entry
// is read whole like every other, so neither ever ends a run inside a unit.
function* shipUnitsFrom(db, lane, first, end, pageRows) {
  for (const entry of owedEntriesFrom(db, first, end.through, pageRows)) {
    const {units, runEnded} = unitsOfEntry(lane, entry, first);
    yield* units;
    if (runEnded) return SHIP_RANGE_CUT.NOT_READY;
  }
  return end.cut;
}

// Which bound holds the next unit back, or null when it joins the range. The
// first unit always joins. The retained-delivered bound is asked where a unit
// begins, counting the rows already taken into this range as the pending
// acknowledgements they become (the pre-pass of one row at a time counted
// them the same way); such a unit is above the hydrated index and never holds
// the lowest owed row, because the first READY row precedes it, and the
// acknowledgement batch bounds were judged at the first row and nothing in
// this synchronous span moves them. A unit that travels alone has no company
// (the byte bound made it one): it joins no range, and a range that holds one
// is full. The byte bound is asked before the window, so WINDOW means the
// window alone held the unit back.
function cutBefore(lane, range, unit, retainedDelivered) {
  if (range.rows.length === 0) return null;
  if (lane.pending.size + range.rows.length + retainedDelivered() >=
      BOUND.RETAINED_DELIVERED_MAX) {
    return SHIP_RANGE_CUT.RETAINED_DELIVERED;
  }
  if (range.full) return SHIP_RANGE_CUT.BYTES;
  if (unit.alone || range.bytes + unit.bytes > BOUND.SHIP_MAX_BYTES) {
    return SHIP_RANGE_CUT.BYTES;
  }
  return range.rows.length + unit.rows.length > lane.shipWindow ? SHIP_RANGE_CUT.WINDOW : null;
}

// The run of consecutive READY rows from `first`, taken unit by unit until a
// bound holds the next unit back or the run ends: {rows, cut}. One page of
// positions usually holds what the window takes, the unit that shows the
// window cut, and the row that ends that unit's entry.
function cutReadyRun(owner, lane, first, end) {
  const range = {rows: [], bytes: 0, full: false};
  let retained = null;
  const retainedDelivered = () => {
    retained ??= countRetainedDeliveredCdcObligations(owner.db, BOUND.RETAINED_DELIVERED_MAX);
    return retained;
  };
  const units = shipUnitsFrom(owner.db, lane, first, end, lane.shipWindow + 2);
  for (;;) {
    const {done, value} = units.next();
    if (done) return {rows: range.rows, cut: value};
    const cut = cutBefore(lane, range, value, retainedDelivered);
    if (cut !== null) return {rows: range.rows, cut};
    range.rows.push(...value.rows);
    range.bytes += value.bytes;
    range.full = value.alone;
  }
}

// The cell whose range the lane presents again unchanged, or null.
function pinnedCellOf(lane) {
  const cell = lane.currentObligation;
  return cell !== null && cdcProgressHoldsCoverage(cell) ? cell : null;
}

// Where this composition's scan ends: the pinned cell's last position while
// it lies before the scan's captured tail, otherwise that tail.
function scanEndOf(scan, pinned) {
  return pinned !== null && isBefore(pinned.last, scan.through) ?
    {through: pinned.last, cut: SHIP_RANGE_CUT.PINNED_CAP} :
    {through: scan.through, cut: SHIP_RANGE_CUT.TAIL};
}

function composeThrough(delivery, lane, acknowledge, pinned) {
  const scan = openScan(delivery.owner, lane);
  if (scan.through === null) return DRAINED_RANGE;
  const end = scanEndOf(scan, pinned);
  const first = firstReadyRow(delivery, lane, end.through, acknowledge);
  if (first.state !== SHIP_RANGE_STATE.READY) return first;
  return {state: SHIP_RANGE_STATE.READY,
    ...cutReadyRun(delivery.owner, lane, first.row, end)};
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

/**
 * Compose the range this drive step ships (see the header). Leading rows that
 * need no delivery are passed (the scan cursor moves over them) and hydrated
 * ones acknowledged through `acknowledge`.
 * @param {Object} delivery - The CDC delivery owner.
 * @param {Object} lane - Its current obligation lane.
 * @param {Function} acknowledge - (delivery, obligation) -> boolean, the
 *   lane's acknowledgement of a row that needs no delivery.
 * @return {Object} {state: a SHIP_RANGE_STATE}; when READY also
 *   {obligations, windowCut}: the owed rows with their payloads, in log
 *   order, and whether the shipping window was what cut the run.
 */
function composeCdcShipRange(delivery, lane, acknowledge) {
  for (;;) {
    const pinned = pinnedCellOf(lane);
    const range = composeThrough(delivery, lane, acknowledge, pinned);
    if (range.state === SHIP_RANGE_STATE.ACKNOWLEDGEMENT_BACKPRESSURE) return range;
    if (pinned === null || isRangeOfCell(range, pinned)) {
      return range.state === SHIP_RANGE_STATE.DRAINED ? range : Object.freeze({
        state: SHIP_RANGE_STATE.READY,
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
