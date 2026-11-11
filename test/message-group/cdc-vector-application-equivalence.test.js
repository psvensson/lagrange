// Range shipping (Stage 1 of the CDC delivery repair) commits several source
// events as one CDC_BATCH entry where each used to be its own CDC entry. This
// witness applies one vector holding several versions of one key (an in-order
// history, a stale version behind a tombstone, a re-create) through the real
// committed-command application, the real CDC handler and the real
// SystemTableCache, both ways, and requires the same cache state: the HLC
// last-writer-wins merge and the tombstone fence decide each member, in array
// order, exactly as they decide a single event. Re-applying the vector (a
// re-shipped vector after a lost receipt) changes nothing.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, test} from 'node:test';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {HLCClockService} from '../../src/hlc/hlc-clock-service.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {assignRaftTiming} from '../../src/message-group/message-group-service-raft-timing.js';

const SOURCE_PARTITION = 'nodes-p1';
const SILENT_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'vector-equivalence'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// The committed-command application of the message-group service
// (applyCommittedEntry) on a host that carries only what it reads.
class CommittedApplicationHost extends EventEmitter {}
assignRaftTiming(CommittedApplicationHost);

function composeRecipient() {
  const cache = new SystemTableCache();
  const host = new CommittedApplicationHost();
  host.groupId = 'vector-equivalence-group';
  host.logger = SILENT_LOGGER;
  host.hlcClock = new HLCClockService('vector-equivalence');
  host.cdcHandler = new CDCHandler(cache);
  host.cdcHandler.initialize();
  let index = 0;
  const commit = (command) => {
    index += 1;
    const effects = {afterCommit: [], afterRollback: []};
    host.applyCommittedEntry({command, index, term: 1, effects}, null);
    for (const effect of effects.afterCommit) effect();
  };
  return {cache, host, commit, committedEntries: () => index};
}

const hlc = (wallMs) => new HLCTimestamp(wallMs, 0, 'nodes-source').toString();

// The source ledger's order: log index, then ordinal. `wallMs` is the origin
// HLC the row carries (data.updated_at_hlc), which the merge compares.
function sourceVector() {
  const version = (ordinal, operation, nodeId, wallMs, fields = {}) => ({
    tableName: TABLES.NODES, operation,
    data: {[COLUMN.NODE_ID]: nodeId, [COLUMN.UPDATED_AT]: wallMs,
      [COLUMN.UPDATED_AT_HLC]: hlc(wallMs), ...fields},
    timestamp: hlc(wallMs), sourcePartition: SOURCE_PARTITION,
    sourceReplica: `${SOURCE_PARTITION}-r1`, eventKey: `nodes-write-${ordinal}`,
    entryId: `nodes-write-${ordinal}`, sourceLogIndex: 10 + ordinal, sourceOrdinal: 0,
  });
  return [
    version(0, CDC_OPERATION.INSERT, 'node-a', 1000, {[COLUMN.STATUS]: 'joining'}),
    version(1, CDC_OPERATION.UPDATE, 'node-a', 2000, {[COLUMN.STATUS]: 'ready'}),
    version(2, CDC_OPERATION.INSERT, 'node-b', 2100, {[COLUMN.STATUS]: 'joining'}),
    version(3, CDC_OPERATION.UPDATE, 'node-a', 1500, {[COLUMN.STATUS]: 'stale-older-version'}),
    version(4, CDC_OPERATION.DELETE, 'node-b', 3000),
    version(5, CDC_OPERATION.UPDATE, 'node-b', 2500, {[COLUMN.STATUS]: 'behind-the-tombstone'}),
    version(6, CDC_OPERATION.INSERT, 'node-c', 3100, {[COLUMN.STATUS]: 'joining'}),
    version(7, CDC_OPERATION.DELETE, 'node-c', 3200),
    version(8, CDC_OPERATION.INSERT, 'node-c', 3300, {[COLUMN.STATUS]: 're-created'}),
    version(9, CDC_OPERATION.UPDATE, 'node-a', 4000, {[COLUMN.STATUS]: 'draining'}),
  ];
}

function cacheStateOf(cache) {
  return cache.getAll(TABLES.NODES)
    .map((row) => ({...row}))
    .sort((left, right) => left[COLUMN.NODE_ID].localeCompare(right[COLUMN.NODE_ID]));
}

test('a vector with several versions of one key yields the cache state of one-by-one ' +
  'delivery, and re-applying it changes nothing', () => {
  const events = captureCdcEvents(sourceVector());

  const oneByOne = composeRecipient();
  for (const event of events) {
    oneByOne.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC, ...event});
  }
  const vector = composeRecipient();
  vector.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events});

  assert.equal(oneByOne.committedEntries(), events.length);
  assert.equal(vector.committedEntries(), 1, 'the vector is one committed entry');
  const expected = cacheStateOf(oneByOne.cache);
  assert.deepEqual(expected.map((row) => [row[COLUMN.NODE_ID], row[COLUMN.STATUS]]),
    [['node-a', 'draining'], ['node-c', 're-created']],
    'last writer wins by origin HLC; the deleted key stays deleted behind its tombstone');
  assert.deepEqual(cacheStateOf(vector.cache), expected);

  vector.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events});
  assert.deepEqual(cacheStateOf(vector.cache), expected,
    'a re-shipped vector is absorbed (R14)');
  // A second recipient that sees the vector only after part of it arrived
  // one by one (an old leader's waves) converges on the same state.
  for (const event of events.slice(0, 4)) {
    oneByOne.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC, ...event});
  }
  oneByOne.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events});
  assert.deepEqual(cacheStateOf(oneByOne.cache), expected);
});

// Every event of one committed source entry carries the entry's origin HLC,
// so two events of one entry on one key tie on HLC: the source ordinal within
// the entry orders them. A range that commits after a newer one (a superseded
// CDC_BATCH proposal committing after its retry) must not overwrite it.
function sameEntryVector() {
  const ENTRY_LOG_INDEX = 40;
  const wallMs = 5000;
  const member = (ordinal, operation, nodeId, fields = {}) => ({
    tableName: TABLES.NODES, operation,
    data: {[COLUMN.NODE_ID]: nodeId, [COLUMN.UPDATED_AT]: wallMs,
      [COLUMN.UPDATED_AT_HLC]: hlc(wallMs), ...fields},
    timestamp: hlc(wallMs), sourcePartition: SOURCE_PARTITION,
    sourceReplica: `${SOURCE_PARTITION}-r1`, eventKey: `nodes-entry-${ordinal}`,
    entryId: `nodes-entry-${ENTRY_LOG_INDEX}`, sourceLogIndex: ENTRY_LOG_INDEX,
    sourceOrdinal: ordinal,
  });
  return captureCdcEvents([
    member(0, CDC_OPERATION.INSERT, 'node-a', {[COLUMN.STATUS]: 'joining'}),
    member(1, CDC_OPERATION.INSERT, 'node-b', {[COLUMN.STATUS]: 'joining'}),
    member(2, CDC_OPERATION.UPDATE, 'node-a', {[COLUMN.STATUS]: 'ready'}),
    member(3, CDC_OPERATION.DELETE, 'node-b'),
  ]);
}

const statusesOf = (cache) => cacheStateOf(cache)
  .map((row) => [row[COLUMN.NODE_ID], row[COLUMN.STATUS]]);

test('events of one entry tie on origin HLC and apply in source-ordinal order, one by one or ' +
  'as one vector', () => {
  const events = sameEntryVector();
  const oneByOne = composeRecipient();
  for (const event of events) oneByOne.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC, ...event});
  const vector = composeRecipient();
  vector.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events});
  assert.deepEqual(statusesOf(oneByOne.cache), [['node-a', 'ready']]);
  assert.deepEqual(cacheStateOf(vector.cache), cacheStateOf(oneByOne.cache));
});

test('an older range of one entry committing after a newer one changes nothing: the source ' +
  'ordinal is part of the version', () => {
  const events = sameEntryVector();
  const expected = composeRecipient();
  expected.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events});
  for (const late of [events.slice(0, 1), events.slice(0, 2), events.slice(0, 3),
    events.slice(1, 2)]) {
    const recipient = composeRecipient();
    recipient.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events: events.slice(2)});
    recipient.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events: late});
    recipient.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events});
    assert.deepEqual(cacheStateOf(recipient.cache), cacheStateOf(expected.cache),
      `late range ordinals ${late.map((event) => event.sourceOrdinal)}`);
    assert.deepEqual(statusesOf(recipient.cache), [['node-a', 'ready']],
      'node-a keeps its newer version; node-b stays deleted');
  }
});

// Any delivery of a source history - in ranges with arbitrary boundaries,
// overlapping re-deliveries and late older ranges, entries holding several
// events of one key - converges on the state of in-order, one-at-a-time
// delivery. Deterministic seeded histories (the reviewer's fuzz shape).
function seededHistory(random) {
  const live = new Set();
  const out = [];
  let wallMs = 1000;
  let logIndex = 10;
  for (let index = 0; index < 4 + random(14); index += 1) {
    const nodeId = `node-${random(3)}`;
    let operation = CDC_OPERATION.UPDATE;
    if (!live.has(nodeId)) {
      operation = CDC_OPERATION.INSERT;
      live.add(nodeId);
    } else if (random(3) === 0) {
      operation = CDC_OPERATION.DELETE;
      live.delete(nodeId);
    }
    const sameEntry = out.length > 0 && random(4) === 0;
    if (!sameEntry) {
      wallMs += 10;
      logIndex += 1;
    }
    const data = operation === CDC_OPERATION.DELETE ?
      {[COLUMN.NODE_ID]: nodeId, [COLUMN.UPDATED_AT_HLC]: hlc(wallMs)} :
      {[COLUMN.NODE_ID]: nodeId, [COLUMN.UPDATED_AT]: wallMs,
        [COLUMN.UPDATED_AT_HLC]: hlc(wallMs), [COLUMN.STATUS]: `s${index}`};
    out.push({tableName: TABLES.NODES, operation, data, timestamp: hlc(wallMs),
      sourcePartition: SOURCE_PARTITION, sourceReplica: `${SOURCE_PARTITION}-r1`,
      eventKey: `seeded-${index}`, entryId: `seeded-entry-${logIndex}`, sourceLogIndex: logIndex,
      sourceOrdinal: sameEntry ? out.at(-1).sourceOrdinal + 1 : 0});
  }
  return captureCdcEvents(out);
}

test('ranges with arbitrary boundaries, re-deliveries and late older ranges converge on ' +
  'in-order delivery, also for entries with several events of one key', () => {
  let seed = 12345;
  const random = (bound) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % bound;
  };
  for (let trial = 0; trial < 300; trial += 1) {
    const events = seededHistory(random);
    const inOrder = composeRecipient();
    for (const event of events) inOrder.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC, ...event});
    const ranges = [];
    for (let at = 0; at < events.length;) {
      const end = Math.min(events.length, at + 1 + random(5));
      ranges.push([at, end]);
      at = end;
    }
    for (let extra = 1 + random(4); extra > 0; extra -= 1) {
      const start = random(events.length);
      ranges.splice(random(ranges.length + 1), 0,
        [start, Math.min(events.length, start + 1 + random(6))]);
    }
    const ranged = composeRecipient();
    for (const [start, end] of ranges) {
      ranged.commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events: events.slice(start, end)});
    }
    assert.deepEqual(statusesOf(ranged.cache), statusesOf(inOrder.cache),
      `trial ${trial}: ranges ${JSON.stringify(ranges)}`);
  }
});

// Two updates of one row in one source entry (ordinal 0 'joining', ordinal 1
// 'ready', one log index, one HLC) are distinct occurrences: in order - in
// separate vectors, one vector, or one by one - the row ends 'ready'; a
// duplicate replay of either changes nothing; the earlier one arriving late
// cannot replace the later one.
test('same-entry same-key updates are distinct occurrences, replay is idempotent and a late ' +
  'earlier one never replaces the later one', () => {
  const update = (ordinal, status) => ({tableName: TABLES.NODES, operation: CDC_OPERATION.UPDATE,
    data: {[COLUMN.NODE_ID]: 'node-a', [COLUMN.UPDATED_AT]: 7000,
      [COLUMN.UPDATED_AT_HLC]: hlc(7000), [COLUMN.STATUS]: status},
    timestamp: hlc(7000), sourcePartition: SOURCE_PARTITION,
    sourceReplica: `${SOURCE_PARTITION}-r1`, eventKey: `nodes-update-${ordinal}`,
    entryId: 'nodes-entry-70', sourceLogIndex: 70, sourceOrdinal: ordinal});
  const [joining, ready] = captureCdcEvents([update(0, 'joining'), update(1, 'ready')]);
  const batch = (events) => ({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events});
  const single = (event) => ({type: MESSAGE_GROUP_COMMAND_TYPE.CDC, ...event});
  const deliveries = {
    'one vector': [batch([joining, ready])],
    'separate vectors': [batch([joining]), batch([ready])],
    'one by one': [single(joining), single(ready)],
    'duplicate replay': [batch([joining, ready]), batch([joining, ready]), single(ready)],
    'late earlier': [batch([ready]), batch([joining])],
    'late earlier, then replay': [single(ready), single(joining), batch([joining, ready])],
  };
  for (const [name, commands] of Object.entries(deliveries)) {
    const recipient = composeRecipient();
    for (const command of commands) recipient.commit(command);
    assert.deepEqual(statusesOf(recipient.cache), [['node-a', 'ready']], name);
  }
});
