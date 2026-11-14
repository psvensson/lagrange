// The row a system table cache would hold for one key after a sequence of
// changes, answered by the cache owner from its own state without applying
// them (quest cdc-obligation-range-shipping, supersession record 4, S-11).
//
// The changes run, in order, through the cache's own applySystemTableChange
// on a private cache that starts from a copy of exactly the state that method
// reads for the key, and reads the owner's clock. Nothing is decided here: no
// merge, fence or staleness rule is restated. Nothing in the owner changes:
// its rows, tombstones, authoritative marks, observation and version records
// are only read, the private cache has no listener and leaves no timer.
//
// State applySystemTableChange reads for (tableName, key) in CDC-merge mode,
// each copied below:
// - the row (tables);
// - the key's delete tombstone (tombstoneStore: write fence, tombstone
//   record, expiry against the clock);
// - the table's last authoritative observation and its cause
//   (lastAuthoritativeObservedAtMsByTableName, ...CauseIdByTableName: the
//   authoritative-absence fence of a key that is not present);
// - the table and key mutation versions (mutationVersionByTableName,
//   mutationVersionByTableKey: recordTableMutation, tombstone eviction);
// - the key's CDC observation (lastCdcObservationByTableName);
// - the table's revision watermark (tableRevisionWatermarks);
// - the time source (the same object, so time-dependent fences and tombstone
//   expiry answer as they would in the owner).
// The listener sets are not copied: the private cache notifies nobody.

function copyMapEntry(source, target, entryKey) {
  if (source.has(entryKey)) {
    const value = source.get(entryKey);
    target.set(entryKey, value && typeof value === 'object' ? {...value} : value);
  }
}

function copyKeyState(cache, copy, tableName, key) {
  const row = cache.tables.get(tableName).get(key);
  if (row !== undefined) {
    copy.tables.get(tableName).set(key, cache.deepClone(row));
  }
  cache.tombstoneStore.copyKeyTo(copy.tombstoneStore, tableName, key);
  copyMapEntry(cache.lastAuthoritativeObservedAtMsByTableName,
    copy.lastAuthoritativeObservedAtMsByTableName, tableName);
  copyMapEntry(cache.lastAuthoritativeObservedCauseIdByTableName,
    copy.lastAuthoritativeObservedCauseIdByTableName, tableName);
  copyMapEntry(cache.mutationVersionByTableName, copy.mutationVersionByTableName, tableName);
  copyMapEntry(cache.tableRevisionWatermarks, copy.tableRevisionWatermarks, tableName);
  copyMapEntry(cache.mutationVersionByTableKey.get(tableName),
    copy.mutationVersionByTableKey.get(tableName), key);
  copyMapEntry(cache.lastCdcObservationByTableName.get(tableName),
    copy.lastCdcObservationByTableName.get(tableName), key);
}

/**
 * The rows `cache` would hold for `key` after each of `changes`, applied in
 * order: element i is the row after changes 0..i (null when the cache would
 * hold no row). Changes that address another key do not bear on the answer.
 * @param {Object} cache - The system table cache (the owner).
 * @param {string} tableName - A system table.
 * @param {string} key - The row key.
 * @param {Array<{operation: string, data: Object}>} changes - CDC changes.
 * @return {Array<Object|null>} One row (or null) per change.
 */
function previewSystemTableCacheRowAfterEachChange(cache, tableName, key, changes) {
  cache.validateTableName(tableName);
  const copy = new cache.constructor({timeSource: cache.timeSource});
  copyKeyState(cache, copy, tableName, key);
  const rows = copy.tables.get(tableName);
  return changes.map((change) => {
    copy.applySystemTableChange(tableName, change.operation, change.data);
    const row = rows.get(key);
    return row === undefined ? null : copy.deepClone(row);
  });
}

export {previewSystemTableCacheRowAfterEachChange};
