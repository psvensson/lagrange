import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';

// Real cache reads and subscription lifetime; rows stand in for CDC delivery.
// This fixture proves cache/wake composition, not replicated publication.
export function createSystemTableCacheFixture(rows) {
  const cache = new SystemTableCache();
  for (const [tableName, records] of Object.entries(rows)) {
    for (const record of records) {
      cache.applySystemTableChange(tableName, CDC_OPERATION.INSERT, record);
    }
  }
  return cache;
}
