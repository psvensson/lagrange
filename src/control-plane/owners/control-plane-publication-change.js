/**
 * The vocabulary of a control_plane_publications write (owner ruling
 * 2026-11-11, option B: a guarded write on a row revision).
 *
 * A publication row is written in exactly two ways, both by
 * ControlPlanePublicationsOwner:
 * - admitted: an insert that never replaces, at revision 1;
 * - changed: `change(durableRow)`, a pure function of the row read from the
 *   durable owner, written as a compare-and-set on the row's revision that
 *   sets only the columns the change moved plus revision + 1.
 *
 * Every write answers one typed outcome; none returns a row as persisted that
 * the durable owner did not confirm:
 * - COMMITTED {row}: this write landed (exactly one affected row, or the
 *   durable row is byte-for-byte what an unanswered write of this call set).
 * - ALREADY_APPLIED {row}: the durable row already holds the change (another
 *   writer applied it; for an admission, the row was already present).
 * - UNCHANGED {row}: the change asked for nothing on the row first read.
 * - REFUSED {reason, row?}: nothing of this write is applied, for the named
 *   reason (the change's own refusal, or the owner's).
 * - UNKNOWN {publicationId, writeKey, reason}: a write of this call was not
 *   answered and the durable owner could not be read: neither its effect nor
 *   its absence is established. The write under `writeKey` may still apply.
 */

import {serializeControlPlanePublicationRow} from
  '../system-row-normalizers.js';

const PUBLICATION_WRITE_OUTCOME = Object.freeze({
  COMMITTED: 'COMMITTED',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  UNCHANGED: 'UNCHANGED',
  REFUSED: 'REFUSED',
  UNKNOWN: 'UNKNOWN',
});

// Why the owner refused a write (a change function names its own reasons).
const PUBLICATION_WRITE_REFUSAL = Object.freeze({
  // The durable owner did not answer the read a change is computed from;
  // no write of this call is outstanding.
  AUTHORITATIVE_READ_UNAVAILABLE: 'authoritative_read_unavailable',
  // The row lost every compare-and-set round to other writers.
  CONTENTION_ROUNDS_SPENT: 'contention_rounds_spent',
  // There is no such row.
  PUBLICATION_ABSENT: 'publication_absent',
  // The row is present (an admission affected no row) but could not be read.
  PRESENT_ROW_UNREADABLE: 'present_row_unreadable',
  // The durable row carries no integer revision (NULL or unparseable).
  REVISION_UNREADABLE: 'revision_unreadable',
});

const PUBLICATION_WRITE_UNKNOWN_REASON = Object.freeze({
  // The unanswered write could not be confirmed: the read was unavailable.
  CONFIRMING_READ_UNAVAILABLE: 'confirming_read_unavailable',
  // The durable row still shows the base after every round: the unanswered
  // write has not applied yet and nothing says it will not.
  WRITE_UNRESOLVED: 'write_unresolved',
  // The write was answered by a torn-down writer on this node: nothing can
  // be read back or re-sent through it.
  WRITER_SHUT_DOWN: 'writer_shut_down',
});

// The refusals after which the writer still owes the change: nothing of it
// is applied and nothing about the row forbids it. Every other refusal is
// the row's (or the change's) final word on this change.
const RETAINED_REFUSALS = new Set([
  PUBLICATION_WRITE_REFUSAL.AUTHORITATIVE_READ_UNAVAILABLE,
  PUBLICATION_WRITE_REFUSAL.CONTENTION_ROUNDS_SPENT,
  PUBLICATION_WRITE_REFUSAL.PRESENT_ROW_UNREADABLE,
]);

const LANDED_OUTCOMES = new Set([
  PUBLICATION_WRITE_OUTCOME.COMMITTED,
  PUBLICATION_WRITE_OUTCOME.ALREADY_APPLIED,
]);

const SETTLED_OUTCOMES = new Set([
  ...LANDED_OUTCOMES,
  PUBLICATION_WRITE_OUTCOME.UNCHANGED,
]);

const PUBLICATION_ID_COLUMN = 'publication_id';
const PUBLICATION_REVISION_COLUMN = 'publication_revision';
const ADMISSION_REVISION = 1;
// The origin HLC is the delivery envelope's, never a column a change sets.
const UNWRITTEN_FIELDS = new Set([
  PUBLICATION_ID_COLUMN,
  PUBLICATION_REVISION_COLUMN,
  'updated_at_hlc',
]);

/** A change's answer that asks for nothing. */
const PUBLICATION_CHANGE_UNCHANGED = Object.freeze({
  publicationChange: 'unchanged',
});

const REFUSAL_MARK = Symbol('publication-change-refusal');

/**
 * A change's refusal of the row it was given.
 * @param {string} reason - The named reason.
 * @return {Object} The refusal.
 */
function refusePublicationChange(reason) {
  return Object.freeze({[REFUSAL_MARK]: true, reason});
}

function isPublicationChangeRefusal(answer) {
  return answer?.[REFUSAL_MARK] === true;
}

function committed(row) {
  return Object.freeze({outcome: PUBLICATION_WRITE_OUTCOME.COMMITTED, row});
}

function alreadyApplied(row) {
  return Object.freeze({
    outcome: PUBLICATION_WRITE_OUTCOME.ALREADY_APPLIED, row});
}

function unchanged(row) {
  return Object.freeze({outcome: PUBLICATION_WRITE_OUTCOME.UNCHANGED, row});
}

function refused(reason, extra = {}) {
  return Object.freeze({
    outcome: PUBLICATION_WRITE_OUTCOME.REFUSED, reason, ...extra});
}

function unknown(publicationId, writeKey, reason, extra = {}) {
  return Object.freeze({outcome: PUBLICATION_WRITE_OUTCOME.UNKNOWN,
    publicationId, writeKey, reason, ...extra});
}

/**
 * Whether the write landed: the durable row holds it (COMMITTED or
 * ALREADY_APPLIED).
 * @param {Object} outcome - A typed write outcome.
 * @return {boolean}
 */
function isPublicationWriteLanded(outcome) {
  return LANDED_OUTCOMES.has(outcome?.outcome);
}

/**
 * Whether the outcome carries the confirmed durable row (landed, or the
 * change asked for nothing on it).
 * @param {Object} outcome - A typed write outcome.
 * @return {boolean}
 */
function isPublicationWriteSettled(outcome) {
  return SETTLED_OUTCOMES.has(outcome?.outcome);
}

/**
 * Whether the writer still owes the write: its outcome is unknown, or it was
 * refused for a reason that says nothing about the row (the read was
 * unavailable, the rounds were spent on contention).
 * @param {Object} outcome - A typed write outcome.
 * @return {boolean}
 */
function isPublicationWriteObligationRetained(outcome) {
  return outcome?.outcome === PUBLICATION_WRITE_OUTCOME.UNKNOWN ||
    (outcome?.outcome === PUBLICATION_WRITE_OUTCOME.REFUSED &&
      RETAINED_REFUSALS.has(outcome.reason));
}

/**
 * The durable row decoded for a change: its canonical columns, and its
 * revision as an integer (null when the stored value is not one).
 * @param {Object} storedRow - The row as the durable owner returned it.
 * @return {{row: Object, revision: number|null}}
 */
function decodeDurablePublicationRow(storedRow) {
  const row = serializeControlPlanePublicationRow(storedRow);
  const revision = Number.isInteger(row[PUBLICATION_REVISION_COLUMN]) &&
    row[PUBLICATION_REVISION_COLUMN] >= 0 ?
    row[PUBLICATION_REVISION_COLUMN] : null;
  return {row, revision};
}

function sameColumnValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * The columns a change moved: every column of `next` whose canonical value
 * differs from the base's. The key and the revision are never among them.
 * @param {Object} baseRow - The decoded durable row.
 * @param {Object} nextRow - The change's answer.
 * @return {Object} The changed columns and their next values.
 */
function changedPublicationColumns(baseRow, nextRow) {
  const next = serializeControlPlanePublicationRow(
    {...nextRow, [PUBLICATION_REVISION_COLUMN]:
      baseRow[PUBLICATION_REVISION_COLUMN]});
  const data = {};
  for (const column of Object.keys(next)) {
    if (!UNWRITTEN_FIELDS.has(column) &&
        !sameColumnValue(baseRow[column], next[column])) {
      data[column] = next[column];
    }
  }
  return data;
}

/**
 * Whether the durable row holds exactly what a write set: the revision the
 * write stamped and every column it wrote.
 * @param {Object} row - The decoded durable row.
 * @param {Object} data - The write's SET columns (revision included).
 * @return {boolean}
 */
function durableRowHoldsWrite(row, data) {
  return Object.keys(data).every((column) =>
    sameColumnValue(row[column], data[column]));
}

export {
  ADMISSION_REVISION,
  PUBLICATION_CHANGE_UNCHANGED,
  PUBLICATION_ID_COLUMN,
  PUBLICATION_REVISION_COLUMN,
  PUBLICATION_WRITE_OUTCOME,
  PUBLICATION_WRITE_REFUSAL,
  PUBLICATION_WRITE_UNKNOWN_REASON,
  alreadyApplied,
  changedPublicationColumns,
  committed,
  decodeDurablePublicationRow,
  durableRowHoldsWrite,
  isPublicationChangeRefusal,
  isPublicationWriteLanded,
  isPublicationWriteObligationRetained,
  isPublicationWriteSettled,
  refused,
  refusePublicationChange,
  unchanged,
  unknown,
};
