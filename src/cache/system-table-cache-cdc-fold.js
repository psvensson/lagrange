// The cache's CDC merge rule as pure functions: what one CDC event makes of
// one key's row. SystemTableCache.applySystemTableChange decides every
// CDC-merge row through foldCdcEventOntoRow (its authoritative and image
// modes override only their own branches), so a consumer that needs the row
// an event leaves (the node-ready trigger's predecessor) folds with the same
// function and never instantiates a cache to compute it.
import {COLUMN} from '../constants/index.js';
import {CACHE_CDC_OPERATIONS} from './cache-constants.js';
import {
  buildDeletedRowTombstoneSource,
  foldStaleRowBackfill,
  isDeleteSupersededByExistingRecord,
  isStaleForExistingRecord,
  mergeRecords,
} from './system-table-cache-row-merge.js';
import {versionStampsOf, writeSupersedesTombstone} from
  './system-table-cache-tombstone-store.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';

const CDC_ROW_FOLD_STATE = Object.freeze({
  // No row was held: the event's row (an UPDATE/UPSERT on a missing key too).
  INSERTED: 'inserted',
  // An INSERT over a held row: the event's row replaces it.
  REPLACED: 'replaced',
  // An UPDATE/UPSERT over a held row: the merged row.
  MERGED: 'merged',
  // An older version: it only backfilled fields the row lacked.
  STALE_BACKFILLED: 'stale_backfilled',
  // An older version that changes nothing.
  STALE_IGNORED: 'stale_ignored',
  // A DELETE of the held row.
  DELETED: 'deleted',
  // A DELETE older than the held row: the row stays.
  DELETE_SUPERSEDED: 'delete_superseded',
  // A DELETE of a key with no row (the cache leaves a tombstone).
  DELETE_ABSENT: 'delete_absent',
});

// The states in which the incoming version is the key's version now.
const ACCEPTED_FOLD_STATES = new Set([CDC_ROW_FOLD_STATE.INSERTED,
  CDC_ROW_FOLD_STATE.REPLACED, CDC_ROW_FOLD_STATE.MERGED,
  CDC_ROW_FOLD_STATE.DELETED]);

function cdcRowFoldOutcome(state, row, backfilledFields = []) {
  return Object.freeze({state, row, accepted: ACCEPTED_FOLD_STATES.has(state),
    backfilledFields});
}

/**
 * Fold one CDC event onto the row a key holds (CDC-merge semantics).
 * @param {string} tableName - The system table.
 * @param {Object|null} existing - The key's row, null when it holds none.
 * @param {string} operation - INSERT, UPDATE, UPSERT or DELETE.
 * @param {Object} data - The event's row (a DELETE's predicate).
 * @param {number} [sameEntryOrder] - compareSameEntryPositions of the
 *   event against the key's applied version (never negative here: an older
 *   version of the same entry is refused before any fold).
 * @return {Object} Frozen {state, row (null when none), accepted,
 *   backfilledFields}.
 */
function foldCdcEventOntoRow(tableName, existing, operation, data,
  sameEntryOrder = 0) {
  if (operation === CACHE_CDC_OPERATIONS.DELETE) {
    if (existing === null) return cdcRowFoldOutcome(CDC_ROW_FOLD_STATE.DELETE_ABSENT, null);
    return isDeleteSupersededByExistingRecord(tableName, existing, data,
      sameEntryOrder) ?
      cdcRowFoldOutcome(CDC_ROW_FOLD_STATE.DELETE_SUPERSEDED, existing) :
      cdcRowFoldOutcome(CDC_ROW_FOLD_STATE.DELETED, null);
  }
  if (existing === null) {
    return cdcRowFoldOutcome(CDC_ROW_FOLD_STATE.INSERTED, fastJsonClone(data));
  }
  if (isStaleForExistingRecord(tableName, existing, data, sameEntryOrder)) {
    const stale = foldStaleRowBackfill(tableName, existing, data);
    return cdcRowFoldOutcome(stale.applied ? CDC_ROW_FOLD_STATE.STALE_BACKFILLED :
      CDC_ROW_FOLD_STATE.STALE_IGNORED, stale.record, stale.backfilledFields);
  }
  return operation === CACHE_CDC_OPERATIONS.INSERT ?
    cdcRowFoldOutcome(CDC_ROW_FOLD_STATE.REPLACED, fastJsonClone(data)) :
    cdcRowFoldOutcome(CDC_ROW_FOLD_STATE.MERGED,
      mergeRecords(tableName, existing, data));
}

/**
 * The source entry position of one event: its origin HLC and source
 * partition, log index and ordinal, or null when it carries none.
 * @param {Object} data - The event's row.
 * @param {Object} options - {sourcePartition, sourceLogIndex, sourceOrdinal}.
 * @return {Object|null}
 */
function entryPositionOf(data, options) {
  const hlc = data?.[COLUMN.UPDATED_AT_HLC];
  if (typeof hlc !== 'string' || hlc.length === 0 ||
      typeof options?.sourcePartition !== 'string' ||
      !Number.isSafeInteger(options?.sourceLogIndex) ||
      !Number.isSafeInteger(options?.sourceOrdinal)) return null;
  return Object.freeze({hlc, partition: options.sourcePartition,
    logIndex: options.sourceLogIndex, ordinal: options.sourceOrdinal,
    incarnation: options.sourceIncarnation, eventKey: options.eventKey});
}

/**
 * Order two versions of one source entry by source ordinal: nonzero only
 * when both positions name the same entry.
 * @param {Object|null|undefined} applied - The key's applied position.
 * @param {Object|null} incoming - The event's position.
 * @return {number} -1, 0 or 1.
 */
function compareSameEntryPositions(applied, incoming) {
  if (incoming === null || applied === undefined || applied === null ||
      applied.hlc !== incoming.hlc || applied.partition !== incoming.partition ||
      applied.incarnation !== incoming.incarnation ||
      applied.logIndex !== incoming.logIndex) {
    return 0;
  }
  return Math.sign(incoming.ordinal - applied.ordinal);
}

// The CDC tombstone a delete leaves on one key's image, by the tombstone
// store's own rules: a retained tombstone the delete does not supersede stays.
function nextCdcTombstone(tombstone, deleteSource) {
  return tombstone !== null && !writeSupersedesTombstone(deleteSource, tombstone) ?
    tombstone : versionStampsOf(deleteSource);
}

// Apply one visited event to its key's image; rejection leaves the sequence
// owner free to visit the next event with the resulting predecessor image.
function foldCdcEventIntoImage(tableName, image, event) {
  const incoming = entryPositionOf(event.data, event.source);
  const sameEntryOrder = compareSameEntryPositions(image.position, incoming);
  if (sameEntryOrder < 0) return;
  if (sameEntryOrder > 0) image.tombstone = null;
  const deletes = event.operation === CACHE_CDC_OPERATIONS.DELETE;
  if (!deletes && image.tombstone !== null) {
    if (!writeSupersedesTombstone(event.data, image.tombstone)) return;
    image.tombstone = null;
  }
  const folded = foldCdcEventOntoRow(tableName, image.row, event.operation,
    event.data, sameEntryOrder);
  if (folded.state === CDC_ROW_FOLD_STATE.DELETED) {
    image.tombstone = nextCdcTombstone(image.tombstone,
      buildDeletedRowTombstoneSource(image.row, event.data));
  } else if (folded.state === CDC_ROW_FOLD_STATE.DELETE_ABSENT) {
    image.tombstone = nextCdcTombstone(image.tombstone, event.data);
  }
  image.row = folded.row;
  if (incoming !== null && (folded.accepted ||
      folded.state === CDC_ROW_FOLD_STATE.DELETE_ABSENT)) {
    image.position = incoming;
  }
}

/**
 * Fold a sequence of CDC events (log order) onto keyed images, as the cache
 * applies them one by one: each event is first handed the row its key held
 * before it. An image is {row, position, tombstone}: the row, the key's
 * applied source position (same-entry order) and its CDC tombstone (a write
 * that does not supersede it is fenced), each decided by its owner's rule.
 * Cache-wide authoritative-absence fencing and tombstone expiry are not
 * part of a CDC fold.
 * @param {string} tableName - The system table.
 * @param {Array<Object>} events - {key, operation, data, source} in order;
 *   `source` is {sourcePartition, sourceLogIndex, sourceOrdinal}; an event
 *   whose key is null names no row and has none before it.
 * @param {Function} readRow - (key) => the row held before the sequence,
 *   or null.
 * @param {Function} visit - (event, rowBefore) => void, in order.
 */
function foldCdcEventsOntoRows(tableName, events, readRow, visit) {
  const images = new Map();
  for (const event of events) {
    if (event.key === null) {
      visit(event, null);
      continue;
    }
    if (!images.has(event.key)) {
      images.set(event.key, {row: readRow(event.key) ?? null, position: null,
        tombstone: null});
    }
    const image = images.get(event.key);
    visit(event, image.row === null ? null : fastJsonClone(image.row));
    foldCdcEventIntoImage(tableName, image, event);
  }
}

export {
  CDC_ROW_FOLD_STATE,
  cdcRowFoldOutcome,
  compareSameEntryPositions,
  entryPositionOf,
  foldCdcEventOntoRow,
  foldCdcEventsOntoRows,
};
