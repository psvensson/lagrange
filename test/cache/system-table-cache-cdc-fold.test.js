// The cache's CDC merge rule is one function (defect D3, 2026-11-11): the
// cache decides every CDC-merge row through foldCdcEventOntoRow, and a
// consumer that needs the row an event leaves folds with the same function
// (foldCdcEventsOntoRows) instead of instantiating a scratch cache. This
// witness requires (a) the cache's apply to call the fold and no merge
// predicate of its own, and (b) the fold and the real cache to agree, event
// by event, on every row - stale versions, backfill, INSERT replacement,
// tombstones and same-entry source order.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {foldCdcEventsOntoRows} from
  '../../src/cache/system-table-cache-cdc-fold.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const CACHE_SOURCE = fileURLToPath(
  new URL('../../src/cache/system-table-cache.js', import.meta.url));

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'fold-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

const hlc = (wallMs) => new HLCTimestamp(wallMs, 0, 'fold-source').toString();
const version = (operation, nodeId, wallMs, fields = {}) => ({operation,
  key: nodeId, data: {[COLUMN.NODE_ID]: nodeId, [COLUMN.UPDATED_AT]: wallMs,
    [COLUMN.UPDATED_AT_HLC]: hlc(wallMs), ...fields}, source: {}});
const sameEntry = (nodeId, ordinal, fields) => ({
  ...version(CDC_OPERATION.UPDATE, nodeId, 5000, fields),
  source: {sourcePartition: 'nodes-p1', sourceLogIndex: 50,
    sourceOrdinal: ordinal, sourceIncarnation: 'fold-source-ledger',
    eventKey: `fold-entry-50-${ordinal}`}});

function applyMethodSource() {
  const source = fs.readFileSync(CACHE_SOURCE, 'utf8');
  const start = source.indexOf('  applySystemTableChange(');
  const end = source.indexOf('\n  }\n', start);
  return source.slice(start, end);
}

test('the cache decides its CDC-merge rows through the one fold', () => {
  const apply = applyMethodSource();
  assert.match(apply, /resolveAppliedRow\(/,
    'applySystemTableChange resolves the row through the fold');
  const source = fs.readFileSync(CACHE_SOURCE, 'utf8');
  assert.match(source, /foldCdcEventOntoRow\(tableName, existing, operation, data, sameEntryOrder\)/,
    'resolveAppliedRow calls foldCdcEventOntoRow');
  for (const ownRule of ['isStaleForExistingRecord(', 'mergeRecords(',
    'applyStaleRowBackfill(', 'isDeleteSupersededByExistingRecord(']) {
    assert.equal(apply.includes(ownRule), false,
      `applySystemTableChange keeps no merge predicate of its own (${ownRule})`);
  }
});

test('the fold and the real cache agree event by event', () => {
  const seed = [
    version(CDC_OPERATION.INSERT, 'node-a', 1000, {status: 'active',
      created_at: 900}),
    version(CDC_OPERATION.INSERT, 'node-b', 1000, {status: 'active'}),
  ];
  const events = [
    // An update merges over the held row.
    version(CDC_OPERATION.UPDATE, 'node-a', 2000, {status: 'draining'}),
    // An older version only backfills a missing field.
    version(CDC_OPERATION.UPDATE, 'node-a', 1500, {status: 'stale',
      node_address: 'ws://a:1'}),
    // An INSERT over a held row replaces it.
    version(CDC_OPERATION.INSERT, 'node-a', 2100, {status: 'joining'}),
    // Delete, then a version behind the tombstone, then a newer re-create.
    version(CDC_OPERATION.DELETE, 'node-b', 2400),
    version(CDC_OPERATION.INSERT, 'node-b', 2300, {status: 'behind'}),
    version(CDC_OPERATION.UPDATE, 'node-b', 2600, {status: 'recreated'}),
    // A delete older than the held row is superseded.
    version(CDC_OPERATION.DELETE, 'node-a', 1200),
    // A delete of an absent key, then a write behind its tombstone.
    version(CDC_OPERATION.DELETE, 'node-c', 3000),
    version(CDC_OPERATION.UPSERT, 'node-c', 2900, {status: 'behind'}),
    // Three versions of one source entry, the middle one out of order.
    sameEntry('node-d', 0, {status: 'joining'}),
    sameEntry('node-d', 2, {status: 'active'}),
    sameEntry('node-d', 1, {status: 'reordered-older'}),
  ];
  const cache = new SystemTableCache();
  for (const event of seed) {
    cache.applySystemTableChange(TABLES.NODES, event.operation, event.data);
  }
  const folded = [];
  foldCdcEventsOntoRows(TABLES.NODES, events,
    (key) => cache.get(TABLES.NODES, key) ?? null,
    (event, rowBefore) => folded.push(rowBefore));
  const applied = [];
  for (const event of events) {
    const before = cache.get(TABLES.NODES, event.key);
    applied.push(before === undefined || before === null ? null : {...before});
    if (event.source.sourcePartition) {
      cache.applySourceCdcEvent({tableName: TABLES.NODES, operation: event.operation,
        data: event.data, timestamp: event.data.updated_at_hlc, ...event.source}, {
        sourcePartition: event.source.sourcePartition, incarnation: event.source.sourceIncarnation,
        after: {logIndex: 49, ordinal: Number.MAX_SAFE_INTEGER},
        through: {logIndex: 50, ordinal: event.source.sourceOrdinal},
      }, 5000);
    } else {
      cache.applySystemTableChange(TABLES.NODES, event.operation, event.data);
    }
  }
  assert.deepEqual(folded, applied,
    'every event is handed the row the cache held before applying it');
  assert.equal(cache.get(TABLES.NODES, 'node-c') ?? null, null,
    'the write behind the tombstone stayed fenced');
  assert.equal(cache.get(TABLES.NODES, 'node-d')?.status, 'active',
    'the same-entry order decided node-d');
  assert.equal(cache.get(TABLES.NODES, 'node-a')?.status, 'joining',
    'the superseded delete left node-a');
});
