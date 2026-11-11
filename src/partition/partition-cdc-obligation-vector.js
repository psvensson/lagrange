// Range shipping of the CDC obligation lane: which owed rows one delivery
// ships to one recipient as one vector. The ledger stays the owner of debt
// and order; this module only reads one bounded page after the recipient's
// position and bounds the vector taken from it. The bounds are scheduling
// bounds (they refuse nothing: a vector always holds at least one row, so a
// row above SHIP_MAX_BYTES ships alone).

import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_EVENT_FIELD as FIELD} from
  './partition-cdc-obligation-constants.js';
import {countRetainedDeliveredCdcObligations, readOwedCdcHead, readOwedCdcObligations} from
  './partition-cdc-obligation-ledger.js';

const EVENT_JSON_ENCODING = 'utf8';

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

function positionOf(obligation) {
  return {logIndex: obligation.logIndex, ordinal: obligation.ordinal};
}

function samePosition(left, right) {
  return left.logIndex === right.logIndex && left.ordinal === right.ordinal;
}

function positionAfter(left, right) {
  return left.logIndex > right.logIndex ||
    (left.logIndex === right.logIndex && left.ordinal > right.ordinal);
}

// The lower of two cursors; an unknown cursor (null) is below every position.
function lowerCursor(left, right) {
  if (left === null || right === null) return null;
  return positionAfter(left, right) ? right : left;
}

/**
 * What decision D1's retained-delivered rule reads, once per page: the
 * lowest owed row and the delivered rows retained above it.
 * @param {Object} owner - The partition service.
 * @return {Object} {head, retained}.
 */
function readRetainedDeliveredGauge(owner) {
  return {head: readOwedCdcHead(owner.db),
    retained: countRetainedDeliveredCdcObligations(owner.db, BOUND.RETAINED_DELIVERED_MAX)};
}

// Acknowledging past the lowest owed row keeps every delivered row above it
// in the ledger (decision D1 reclaims only below it), so the lane does that
// only while those retained rows and its own pending acknowledgements stay
// under RETAINED_DELIVERED_MAX; the lowest owed row itself is always
// acknowledgeable.
function retainedDeliveredBackpressured(gauge, lane, obligation) {
  if (gauge.head === null || samePosition(gauge.head, obligation)) return false;
  return lane.pending.size + gauge.retained >= BOUND.RETAINED_DELIVERED_MAX;
}

function shippedBytesOf(obligation) {
  return Buffer.byteLength(obligation.eventJson, EVENT_JSON_ENCODING);
}

// A row every recipient is already done with: its acknowledgement is pending
// (it was at or below the frontier), or a hydration image covers it.
function settledWithoutDelivery(lane, obligation) {
  return lane.pending.has(obligation.eventKey) ||
    obligation.logIndex <= (lane.hydratedThroughLogIndex || 0);
}

function boundRecipientVector(lane, rows) {
  const vector = [rows[0]];
  let bytes = shippedBytesOf(rows[0]);
  for (let index = 1; index < rows.length; index += 1) {
    bytes += shippedBytesOf(rows[index]);
    if (bytes > BOUND.SHIP_MAX_BYTES || settledWithoutDelivery(lane, rows[index])) break;
    vector.push(rows[index]);
  }
  return vector;
}

/**
 * The vector one delivery ships to one recipient: the owed rows after its
 * position (its provisional scan position, else its cursor, else the ledger
 * head), within the shipping bounds. Rows that need no delivery are stepped
 * over; outside a provisional scan the cursor moves over them (they are
 * below what this recipient still has to confirm).
 * @param {Object} owner - The partition service.
 * @param {Object} lane - The delivery lane.
 * @param {Object} recipient - The recipient ({cursor, drive}).
 * @return {Array<Object>} The vector, in log order; empty when nothing after
 *   the position is owed.
 */
function selectRecipientVector(owner, lane, recipient) {
  const {drive} = recipient;
  for (;;) {
    const after = drive.scanAfter === null ? recipient.cursor : drive.scanAfter;
    const page = readOwedCdcObligations(owner.db, {after: after ?? undefined,
      through: drive.scanThrough ?? undefined, limit: BOUND.SHIP_MAX_EVENTS});
    if (page.length === 0) return page;
    let settled = 0;
    while (settled < page.length && settledWithoutDelivery(lane, page[settled])) settled += 1;
    if (settled === 0) return boundRecipientVector(lane, page);
    const steppedOver = positionOf(page[settled - 1]);
    if (drive.scanAfter === null) recipient.cursor = steppedOver;
    else drive.scanAfter = steppedOver;
    if (settled < page.length) return boundRecipientVector(lane, page.slice(settled));
  }
}

export {eventOf, lowerCursor, positionAfter, positionOf, readRetainedDeliveredGauge,
  retainedDeliveredBackpressured, selectRecipientVector, settledWithoutDelivery};
