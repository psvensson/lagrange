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
// OBSOLETE), so every ranged state the cache holds is older than the image. A
// row deleted at or before P is therefore removed even if the cache touched it
// while the image was fetched; nothing at or before P can resurrect. Rows an
// unranged path wrote that are newer than P are replaced too: their entries
// lie above P, so their ranges are not refused by the cell and apply again.
import {resolveSystemCacheRowKey} from './system-cache-key-descriptor.js';
import {CACHE_CDC_OPERATIONS, SYSTEM_TABLE_CACHE_MUTATION_MODE} from './cache-constants.js';
import {areAuthoritativeSystemTableCacheRowsEqual} from
  './system-table-cache-authoritative-reconciliation.js';
import {SOURCE_IMAGE_ADMISSION} from './system-table-cache-cdc-observation.js';

const SOURCE_IMAGE_CAUSE_ID = 'cdc-source-image';

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
  const admission = cache.sourceOrder.admitImage(token, image);
  if (admission !== SOURCE_IMAGE_ADMISSION.INSTALL) {
    return {admission, upserted: 0, deleted: 0,
      cell: cache.sourceOrder.positionOf(sourcePartition)};
  }
  const table = cache.tables.get(tableName);
  const options = {causeId: SOURCE_IMAGE_CAUSE_ID,
    mutationMode: SYSTEM_TABLE_CACHE_MUTATION_MODE.SOURCE_IMAGE_REPLACEMENT};
  // The swap as one change list: every changed image row, then every cached
  // row the image lacks. An unchanged row is not re-applied (no mutation
  // generation, no wake).
  const imageKeys = new Set();
  const changes = [];
  for (const row of rows) {
    const key = resolveSystemCacheRowKey(tableName, row);
    imageKeys.add(key);
    const current = table.get(key);
    if (current !== undefined && areAuthoritativeSystemTableCacheRowsEqual(tableName, current,
      row)) continue;
    changes.push([CACHE_CDC_OPERATIONS.UPSERT, row]);
  }
  const upserted = changes.length;
  for (const [key, current] of [...table]) {
    if (!imageKeys.has(key)) changes.push([CACHE_CDC_OPERATIONS.DELETE, current]);
  }
  for (const [operation, row] of changes) {
    cache.applySystemTableChange(tableName, operation, row, options);
  }
  const deleted = changes.length - upserted;
  const cell = cache.sourceOrder.recordListedPosition({sourcePartition, tableName, incarnation,
    appliedIndex});
  return {admission, upserted, deleted, cell};
}

export {SOURCE_IMAGE_CAUSE_ID, installSourceImage};
