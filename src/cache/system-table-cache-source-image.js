// The install of a complete leader image of one source table into this
// node's cache (CDC Stage 3 re-list): the one step that turns a staged image
// into cache state. In ONE synchronous span it (1) asks the source-order cell
// whether the image may still be installed (the cell it was begun against,
// in a compatible incarnation, and not already at or past the image's applied
// index), (2) swaps the table to the image - every image row replaces its
// key's row, every cached row the image lacks is removed - and (3) records
// the image's position. So no event interleaves between rows and position,
// and nothing of an unfinished image is ever visible: until this span runs,
// readers see the old rows and the cell stays gapped.
//
// A swap, not a merge: the image is the table after every source entry at or
// below its applied index P, and the cell is below P (else the image is
// SUPERSEDED), so every ranged state the cache holds is older than the image. A
// row deleted at or before P is therefore removed even if the cache touched it
// while the image was fetched; nothing at or before P can resurrect. Rows an
// unranged path wrote that are newer than P are replaced too: their entries
// lie above P, so their ranges are not refused by the cell and apply again.
import {resolveSystemCacheRowKey} from './system-cache-key-descriptor.js';
import {CACHE_CDC_OPERATIONS} from './cache-constants.js';
import {areAuthoritativeSystemTableCacheRowsEqual} from
  './system-table-cache-authoritative-reconciliation.js';
import {SOURCE_IMAGE_ADMISSION} from './system-table-cache-source-order.js';
import {recordAuthoritativeTableObservation} from './system-table-cache-cdc-observation.js';

const SOURCE_IMAGE_CAUSE_ID = 'cdc-source-image';

function stageImage(cache, tableName, rows) {
  const current = cache.tables.get(tableName);
  const table = new Map();
  const changes = [];
  for (const row of rows) {
    const key = resolveSystemCacheRowKey(tableName, row);
    if (key === undefined || table.has(key)) throw new Error(SOURCE_IMAGE_CAUSE_ID);
    const captured = cache.deepClone(row);
    table.set(key, captured);
    if (!current.has(key) ||
        !areAuthoritativeSystemTableCacheRowsEqual(tableName, current.get(key), row)) {
      changes.push({key, operation: CACHE_CDC_OPERATIONS.UPSERT, record: captured});
    }
  }
  const upserted = changes.length;
  for (const [key, record] of current) {
    if (!table.has(key)) changes.push({key, operation: CACHE_CDC_OPERATIONS.DELETE, record});
  }
  return {table, changes, upserted, deleted: changes.length - upserted};
}

function publishImageBasis(cache, image, staged) {
  const {tableName} = image;
  cache.tables.set(tableName, staged.table);
  cache.tombstoneStore.clearTable(tableName);
  cache.lastCdcObservationByTableName.get(tableName).clear();
  cache.lastAuthoritativeObservedAtMsByTableName.delete(tableName);
  cache.lastAuthoritativeObservedCauseIdByTableName.delete(tableName);
  cache.tableRevisionWatermarks.delete(tableName);
  recordAuthoritativeTableObservation(cache, tableName, null, {
    term: image.witness?.term ?? null, appliedIndex: image.appliedIndex,
    commitIndex: image.witness?.commitIndex ?? null,
    servingNodeId: image.witness?.servingNodeId ?? null, partitionId: image.sourcePartition,
  });
  for (const change of staged.changes) {
    change.metadata = Object.freeze({causeId: SOURCE_IMAGE_CAUSE_ID,
      tableMutationRevision: cache.recordTableMutation(tableName, change.key), originHlc: null});
  }
  if (staged.changes.length > 0) {
    cache.lastAppliedAtMsByTableName.set(tableName, cache.timeSource.now());
    cache.lastAppliedCauseIdByTableName.set(tableName, SOURCE_IMAGE_CAUSE_ID);
  }
}

function announceImage(cache, tableName, staged) {
  for (const {operation, record, metadata} of staged.changes) {
    const snapshot = cache.deepClone(record);
    cache.notifyApplyListeners(tableName, operation, snapshot, metadata);
    cache.notifyListeners(tableName, operation, snapshot, metadata);
  }
}

/**
 * Install a complete image, or decide it cannot be installed.
 * @param {Object} cache - The node's SystemTableCache.
 * @param {Object} token - SystemTableCacheSourceOrder.beginImage's token.
 * @param {Object} image - {sourcePartition, tableName, incarnation,
 *   appliedIndex, rows (canonical, one per key)}.
 * @return {Object} {admission (a SOURCE_IMAGE_ADMISSION), upserted, deleted,
 *   cell (the cell after the span)}.
 */
function installSourceImage(cache, token, image) {
  const {sourcePartition, tableName, incarnation, appliedIndex, rows} = image;
  const staged = stageImage(cache, tableName, rows);
  const admission = cache.sourceOrder.admitImage(token, image);
  if (admission !== SOURCE_IMAGE_ADMISSION.INSTALL) {
    return {admission, upserted: 0, deleted: 0,
      cell: cache.sourceOrder.positionOf(sourcePartition)};
  }
  // No externally callable listener runs until the complete map, deletion
  // fences, per-key evidence and source prefix all describe this image.
  publishImageBasis(cache, image, staged);
  const cell = cache.sourceOrder.recordListedPosition({sourcePartition, tableName, incarnation,
    appliedIndex});
  announceImage(cache, tableName, staged);
  return {admission, upserted: staged.upserted, deleted: staged.deleted, cell};
}

export {installSourceImage};
