// Diagnostic controls on fa709, NOT repair acceptance. Negative observations
// are expected and named below. No production owner is replaced. Only the
// r1 counterfactual explicitly removes one remembered ID and table metadata.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {test} from 'node:test';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {installSourceImage} from '../../src/cache/system-table-cache-source-image.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {assignRaftTiming} from '../../src/message-group/message-group-service-raft-timing.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const TABLE = TABLES.NODES;
const SOURCE = INITIAL_PARTITION_IDS[TABLE];
const INCARNATION = 'r2-controls-ledger';
const KEY = 'r2-controls-node';
const silent = {debug() {}, info() {}, warn() {}, error() {}};
const outcomes = [];
const hlc = (index) => new HLCTimestamp(index * 100, 0, 'r2-source').toString();

class ApplicationHost extends EventEmitter {}
assignRaftTiming(ApplicationHost);

function eventOf(operation, index, key = KEY) {
  return captureCdcEvents([{tableName: TABLE, operation,
    data: {node_id: key, status: 'joining', created_at: 100,
      updated_at: index * 100, updated_at_hlc: hlc(index)},
    timestamp: hlc(index), sourcePartition: SOURCE, sourceReplica: 'r2-source-replica',
    sourceLogIndex: index, sourceOrdinal: 0, entryId: `r2-entry-${index}`,
    eventKey: `r2-opaque-${index}-${key}`}])[0];
}

function fixture(t, options = {}) {
  const clock = new VirtualTimeSource({startMs: 2000});
  const cache = new SystemTableCache({timeSource: clock});
  cache.logger = silent;
  const hosts = [0, 1].map((index) => {
    const host = new ApplicationHost();
    host.groupId = `r2-control-group-${index}`;
    host.logger = silent;
    host.cdcHandler = new CDCHandler(cache, {timeSource: clock, ...options});
    host.cdcHandler.logger = silent;
    host.cdcHandler.subscribe(TABLE);
    return host;
  });
  t.after(() => {
    for (const host of hosts) host.cdcHandler.shutdown();
  });
  cache.sourceOrder.requireListed(SOURCE, TABLE);
  const token = cache.sourceOrder.beginImage(SOURCE);
  assert.ok(token, 'real source owner admits an image start against GAP');
  const install = () => installSourceImage(cache, token, {sourcePartition: SOURCE,
    tableName: TABLE, incarnation: INCARNATION, appliedIndex: 10, rows: []});
  const commit = (events, after, through) => {
    const effects = {afterCommit: [], afterRollback: []};
    hosts[0].applyCommittedEntry({index: 1, term: 1, effects,
      command: {type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events,
        sourceRange: {sourcePartition: SOURCE, incarnation: INCARNATION,
          after, through}}}, null);
    for (const effect of effects.afterCommit) effect();
  };
  return {cache, clock, hosts, install, commit};
}

function observe(f) {
  const cell = f.cache.sourceOrder.positionOf(SOURCE);
  return {present: f.cache.has(TABLE, KEY), position: cell.position, state: cell.state,
    incarnation: cell.incarnation,
    tombstone: f.cache.tombstoneStore.tables.get(TABLE).has(KEY),
    observationTime: f.cache.getLastAuthoritativeObservedAtMs(TABLE)};
}

function assertAtImage(f, present) {
  assert.equal(f.cache.has(TABLE, KEY), present, 'row presence at image prefix');
  assert.deepEqual(f.cache.sourceOrder.positionOf(SOURCE).position,
    {logIndex: 10, ordinal: Number.MAX_SAFE_INTEGER}, 'position stays at image10');
}

function installEmpty(f) {
  const installed = f.install();
  assert.equal(installed.admission, 'install', 'real source-image owner INSTALL engages');
  assertAtImage(f, false);
  return installed;
}

function rememberedSchedule(t, invalidate) {
  const f = fixture(t);
  const inserted = eventOf(CDC_OPERATION.INSERT, 8);
  const deleted = eventOf(CDC_OPERATION.DELETE, 9);
  const handler = f.hosts[0].cdcHandler;
  handler.applyImmediate(inserted);
  handler.applyImmediate(deleted);
  const before = observe(f);
  assert.equal(before.tombstone, true, 'DELETE9 created a real tombstone');
  const installed = installEmpty(f);
  assert.equal(installed.upserted + installed.deleted, 0, 'empty/equal image engages');
  const id = handler.generateEventId(inserted);
  assert.equal(handler.processedEventIds.has(id), true, 'INSERT8 really remembered');
  if (invalidate) {
    // Explicit controlled r1 counterfactual, not an r1 implementation:
    // revoke this occurrence receipt and replaced-table ordering/deletion data.
    handler.processedEventIds.delete(id);
    f.cache.sourceOrder.tables.delete(TABLE);
    f.cache.tombstoneStore.clearKey(TABLE, KEY);
    assert.equal(f.cache.tombstoneStore.tables.get(TABLE).has(KEY), false);
  }
  const returned = handler.applyImmediate(inserted);
  assert.equal(returned, invalidate, 'only the counterfactual reopens the receipt');
  assertAtImage(f, invalidate);
  f.commit([inserted, deleted], {logIndex: 7, ordinal: 0}, {logIndex: 9, ordinal: 0});
  assertAtImage(f, invalidate);
  outcomes.push({id: invalidate ? 'F1-r1-counterfactual' : 'F1-remembered-base-control',
    counterfactual: invalidate, before, after: observe(f), defectObserved: invalidate});
}

function bufferedSchedule(t) {
  const f = fixture(t);
  const inserted = eventOf(CDC_OPERATION.INSERT, 8);
  f.hosts[0].cdcHandler.applyImmediate(inserted);
  assert.equal(f.hosts[1].cdcHandler.handleEvent(inserted), true);
  assert.equal(f.hosts[1].cdcHandler.eventBuffer.get(TABLE).length, 1);
  assert.equal(f.cache.has(TABLE, KEY), true, 'live row before the image deletes it');
  const installed = installEmpty(f);
  assert.equal(installed.deleted, 1, 'image removes the cached row');
  assert.equal(f.cache.tombstoneStore.tables.get(TABLE).has(KEY), false,
    'image deletion leaves no CDC tombstone');
  f.hosts[1].cdcHandler.flushBuffer(TABLE);
  assertAtImage(f, true);
  outcomes.push({id: 'F1-buffer-across-install-base', counterfactual: false,
    after: observe(f), defectObserved: true});
}

function evictedSchedule(t) {
  const f = fixture(t, {maxProcessedEventIds: 2});
  const handler = f.hosts[0].cdcHandler;
  const inserted = eventOf(CDC_OPERATION.INSERT, 8);
  handler.applyImmediate(inserted);
  handler.applyImmediate(eventOf(CDC_OPERATION.DELETE, 9));
  installEmpty(f);
  handler.applyImmediate(eventOf(CDC_OPERATION.INSERT, 13, 'eviction-one'));
  handler.applyImmediate(eventOf(CDC_OPERATION.INSERT, 14, 'eviction-two'));
  assert.equal(handler.processedEventIds.has(handler.generateEventId(inserted)), false,
    'existing configured ID bound really evicts INSERT8');
  f.clock.advance(31000);
  handler.applyImmediate(inserted);
  assertAtImage(f, true);
  assert.equal(f.cache.tombstoneStore.tables.get(TABLE).has(KEY), false,
    'real tombstone TTL expires under the cache clock');
  outcomes.push({id: 'F1-evicted-ID-expired-tombstone-base', counterfactual: false,
    after: observe(f), defectObserved: true});
}

function absenceSchedule(t, mode) {
  const f = fixture(t);
  const handler = f.hosts[0].cdcHandler;
  handler.applyImmediate(eventOf(CDC_OPERATION.INSERT, 8));
  if (mode !== 'none') {
    const mutationSnapshot = f.cache.captureTableMutationSnapshot(TABLE);
    const sweep = f.cache.reconcileAgainstAuthoritativeTruth({[TABLE]: []}, {
      mutationSnapshots: {[TABLE]: mutationSnapshot}, authoritativeObservedAtMs: 2000,
    });
    assert.equal(sweep.removed.length, 1, 'real complete-absence sweep removes key');
    assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), 2000);
    assert.equal(f.cache.tombstoneStore.tables.get(TABLE).get(KEY).authoritativeAbsence, true);
  }
  installEmpty(f);
  if (mode === 'watermark-only') {
    // Isolate the second fence via the store's actual per-key eviction operation.
    f.cache.tombstoneStore.clearKey(TABLE, KEY);
    assert.equal(f.cache.tombstoneStore.tables.get(TABLE).has(KEY), false);
    assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), 2000);
  }
  const before = observe(f);
  const restoring = eventOf(CDC_OPERATION.INSERT, 11);
  f.commit([restoring], {logIndex: 10, ordinal: Number.MAX_SAFE_INTEGER},
    {logIndex: 11, ordinal: 0});
  const after = observe(f);
  assert.equal(after.present, mode === 'none', 'absence fence determines restoring result');
  assert.deepEqual(after.position, {logIndex: 11, ordinal: 0});
  assert.equal(after.state, 'current');
  assert.equal(handler.processedEventIds.has(handler.generateEventId(restoring)), true,
    'handler remembers even the fenced restoring member');
  outcomes.push({id: `F2-${mode}`, counterfactual: mode === 'watermark-only', before, after,
    defectObserved: mode !== 'none'});
}

test('r2 real-owner controls distinguish coverage from effect and absence fences', async (t) => {
  await t.test('F1 unchanged base protects a remembered covered delivery', (c) =>
    rememberedSchedule(c, false));
  await t.test('F1 explicit r1 counterfactual reopens covered delivery', (c) =>
    rememberedSchedule(c, true));
  await t.test('F1 pending buffer crosses installation on unchanged base', bufferedSchedule);
  await t.test('F1 ID eviction and tombstone expiry expose unchanged base', evictedSchedule);
  await t.test('F2 no authoritative absence admits restoring member', (c) =>
    absenceSchedule(c, 'none'));
  await t.test('F2 complete authoritative absence suppresses restoration on base', (c) =>
    absenceSchedule(c, 'complete-absence'));
  await t.test('F2 table watermark alone still suppresses restoration', (c) =>
    absenceSchedule(c, 'watermark-only'));
  const output = '/tmp/lagrange-cdc-image-effect-20261112/r2/controls-observations.json';
  fs.writeFileSync(output, `${JSON.stringify({kind: 'diagnostic-controls-not-acceptance',
    outcomes}, null, 2)}\n`, {flag: 'wx'});
  for (const result of outcomes) t.diagnostic(JSON.stringify(result));
});
