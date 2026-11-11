// Same-entry source order of the system-table cache's row merge. The merge
// orders versions by origin HLC (system-table-cache-row-merge.js), and every
// event of one committed source entry carries that entry's origin HLC: for
// two events of one entry on one key the HLC ties, and only the source
// position - the entry's log index and the event's ordinal within it - orders
// them. A range that commits after a newer one (a superseded CDC_BATCH
// proposal committing after its retry) would otherwise overwrite the newer
// member with the older, and an entry that deletes and re-creates a key would
// have its re-create fenced by its own tombstone. The cache therefore keeps,
// per table key, the source position of the last versioned event it applied:
// an event at the same origin HLC and log index with a lower ordinal is older
// and is refused before the merge; one with a higher ordinal is newer and
// supersedes that entry's own tombstone. The version the merge compares is
// thus (origin HLC, source position), at this one owner.
//
// Stage 3 of the CDC delivery repair (a contiguous applied position per
// source partition at the recipient) refuses every event at or below the
// recipient's position before the merge; it subsumes this tie-break, which is
// then deleted.

import {COLUMN} from '../constants/index.js';

// A per-table bound: the tie only matters for events of an entry that is
// still being re-delivered, so the most recently applied keys suffice.
const SOURCE_ORDER_MAX_KEYS_PER_TABLE = 4096;

// A position is compared only within one source entry of one source
// partition: the same origin HLC (which names the proposing clock and its
// instant), partition and log index. Positions of another entry - a rebuilt
// log reusing an index included - never meet, so none is compared blindly.
function sourcePositionOf(data, options) {
  const hlc = data?.[COLUMN.UPDATED_AT_HLC];
  if (typeof hlc !== 'string' || hlc.length === 0 ||
      typeof options?.sourcePartition !== 'string' ||
      !Number.isSafeInteger(options?.sourceLogIndex) ||
      !Number.isSafeInteger(options?.sourceOrdinal)) return null;
  return Object.freeze({hlc, partition: options.sourcePartition,
    logIndex: options.sourceLogIndex, ordinal: options.sourceOrdinal});
}

class SystemTableCacheSourceOrder {
  constructor() {
    this.tables = new Map();
  }

  /**
   * Order this event against the one the key last applied from the same
   * source entry (same origin HLC and log index) by source ordinal.
   * @param {string} tableName
   * @param {string} key
   * @param {Object} data - The event's row data (carries the origin HLC).
   * @param {Object} options - The apply options ({sourceLogIndex, sourceOrdinal}).
   * @return {number} Negative: older; positive: newer; 0: the same event, or
   *   no event of this entry was applied (the merge alone decides).
   */
  compareInSameEntry(tableName, key, data, options) {
    const incoming = sourcePositionOf(data, options);
    const applied = incoming === null ? undefined : this.tables.get(tableName)?.get(key);
    if (applied === undefined || applied.hlc !== incoming.hlc ||
        applied.partition !== incoming.partition || applied.logIndex !== incoming.logIndex) {
      return 0;
    }
    return Math.sign(incoming.ordinal - applied.ordinal);
  }

  /**
   * Record the source position of an event the key applied.
   * @param {string} tableName
   * @param {string} key
   * @param {Object} data
   * @param {Object} options
   */
  record(tableName, key, data, options) {
    const position = sourcePositionOf(data, options);
    if (position === null) return;
    let table = this.tables.get(tableName);
    if (!table) {
      table = new Map();
      this.tables.set(tableName, table);
    }
    table.delete(key);
    table.set(key, position);
    if (table.size > SOURCE_ORDER_MAX_KEYS_PER_TABLE) table.delete(table.keys().next().value);
  }

  clear() {
    this.tables.clear();
  }
}

export {SystemTableCacheSourceOrder};
