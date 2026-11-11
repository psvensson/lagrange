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
