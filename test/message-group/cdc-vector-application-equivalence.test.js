// CDC Stage 3 at the recipient (design note, "Stage 3 as built"): a durable
// range commits as one ranged CDC_BATCH and every member node decides it
// against its own cache's position cell. These witnesses run the real
// committed-command application of the message group, the real CDCHandler, the
// real SystemTableCache (and its source-order owner) and the real re-list
// (CDCIntegrationService, relistSourceTable) against a source model: an ordered
// history of source events at positions {logIndex, ordinal} in one incarnation,
// whose leader image at applied index P is the table after every event at or
// below P. Only the transport of the image is modelled: the image is served
// in pages of the shape the partition's hydration-image query answers
// (partition-service-hydration-image-methods.js, witnessed in
// test/partition/partition-cdc-source-relist.test.js and
// test/cdc/cdc-paged-relist.test.js).
//
// Requirements witnessed: a position is comparable only within one source
// incarnation; a re-list installs rows and position together and a gap is never
// merged on HLC; replay is idempotent (members at or below the position are
// refused before the merge); a late older range never overwrites; same-entry
// siblings keep source order; tombstones, delete/re-create, gaps, late
// proposals and list/stream races converge on the source.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, test} from 'node:test';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SOURCE_POSITION_STATE} from '../../src/cache/system-table-cache-source-order.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {HLCClockService} from '../../src/hlc/hlc-clock-service.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {PARTITION_HYDRATION_IMAGE_PAGE_FIELD} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {assignRaftTiming} from '../../src/message-group/message-group-service-raft-timing.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const SOURCE_PARTITION = 'nodes-p1';
const INCARNATION = '1:4:nodes-ledger-birth';
const OTHER_INCARNATION = '1:4:nodes-ledger-rebuilt';
const SILENT_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const RELIST_RETRY_MS = 500;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'stage3-recipient'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// One wall clock for source and recipient, as in a cluster: an event's time
// is its entry's commit time (by log index, far apart), and the leader image
// at P is read after every event at or below P and before every event above
// it. The cache's authoritative fences compare row times with its own clock,
// so the witness keeps them consistent.
const SOURCE_WALL_PER_INDEX_MS = 1_000_000;
const hlc = (wallMs) => new HLCTimestamp(wallMs, 0, 'nodes-source').toString();
const entryWallMs = (logIndex) => logIndex * SOURCE_WALL_PER_INDEX_MS;
const IMAGE_READ_AFTER_ENTRY_MS = 5;
// The modelled leader serves images in pages of this many rows, so most
// images of these histories span several pages.
const IMAGE_PAGE_ROWS = 2;
const settle = async () => {
  for (let turn = 0; turn < 30; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

// --- the source model: ordered history, ranges and leader images ---

function sourceOf(events, incarnation = INCARNATION) {
  const positionOf = (event) => ({logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal});
  const indexOf = (event) => events.indexOf(event);
  return {
    events, incarnation, appliedIndex: events.at(-1).sourceLogIndex, images: [],
    // A range of consecutive history members: its predecessor is the event
    // immediately before its first (the ledger's readCdcPredecessorPosition).
    range(start, end) {
      const first = events[start];
      const after = start === 0 ? {logIndex: 0, ordinal: -1} : positionOf(events[start - 1]);
      void first;
      return {events: events.slice(start, end), sourceRange: {sourcePartition: SOURCE_PARTITION,
        incarnation, after, through: positionOf(events[end - 1])}};
    },
    // The table after every event at or below appliedIndex, in source order.
    imageAt(appliedIndex) {
      const rows = new Map();
      for (const event of events) {
        if (event.sourceLogIndex > appliedIndex) break;
        const key = event.data[COLUMN.NODE_ID];
        if (event.operation === CDC_OPERATION.DELETE) rows.delete(key);
        else rows.set(key, {...(rows.get(key) ?? {}), ...event.data});
      }
      return [...rows.values()];
    },
    indexOf,
  };
}

function statusesOfRows(rows) {
  return rows.map((row) => [row[COLUMN.NODE_ID], row[COLUMN.STATUS]])
    .sort(([left], [right]) => left.localeCompare(right));
}

// --- the recipient: real committed application, handler, cache, re-list ---

class CommittedApplicationHost extends EventEmitter {}
assignRaftTiming(CommittedApplicationHost);

function leaderWitness(clock, appliedIndex) {
  return {state: 'observed', partitionId: SOURCE_PARTITION, servingNodeId: 'node-source',
    servingReplicaId: `${SOURCE_PARTITION}-r1`, role: RAFT_ROLE.LEADER, term: 3,
    appliedIndex, commitIndex: appliedIndex, observedAtMs: clock.now()};
}

function composeRecipient(sourceRef) {
  const clock = new VirtualTimeSource({startMs: 1});
  const cache = new SystemTableCache({timeSource: clock});
  const host = new CommittedApplicationHost();
  host.groupId = 'stage3-recipient-group';
  host.logger = SILENT_LOGGER;
  host.hlcClock = new HLCClockService('stage3-recipient');
  host.cdcHandler = new CDCHandler(cache);
  host.cdcHandler.initialize();
  const lists = [];
  const images = new Map();
  // The leader's paged image of the source now (sourceRef.current: the model
  // and the applied index the source leader has reached): page 0 opens an
  // image at that index; its later pages come from the same image.
  const queryExecutor = {executeOnPartition: async (partitionId, sql, _params, _forRead,
    _preferLeader, _sameGroup, options) => {
    const request = options.buildRequest();
    const cursor = request[PARTITION_HYDRATION_IMAGE_PAGE_FIELD];
    if (cursor.imageId === null) {
      const {source, appliedIndex} = sourceRef.current;
      const readAtMs = entryWallMs(appliedIndex) + IMAGE_READ_AFTER_ENTRY_MS;
      if (clock.now() < readAtMs) clock.advance(readAtMs - clock.now());
      lists.push({partitionId, appliedIndex, hydrationImage: request.hydrationImage});
      images.set(`image-${lists.length}`, {rows: source.imageAt(appliedIndex), appliedIndex,
        incarnation: source.incarnation});
    }
    const imageId = cursor.imageId ?? `image-${lists.length}`;
    const image = images.get(imageId);
    const rows = image.rows.slice(cursor.page * IMAGE_PAGE_ROWS,
      (cursor.page + 1) * IMAGE_PAGE_ROWS);
    const last = (cursor.page + 1) * IMAGE_PAGE_ROWS >= image.rows.length;
    const answer = {success: true, rows, partitionId,
      readAuthorityWitness: leaderWitness(clock, image.appliedIndex),
      sourceImage: {sourcePartition: partitionId, incarnation: image.incarnation,
        appliedIndex: image.appliedIndex},
      imagePage: {imageId, page: cursor.page, last, rowCount: rows.length,
        byteCount: JSON.stringify(rows).length}};
    return options.buildSuccessResult(answer);
  }};
  const integration = new CDCIntegrationService({nodeId: 'node-recipient', systemTableCache: cache,
    timeSource: clock, sqlQueryEngine: {queryExecutor}});
  integration.initialize({nodeId: 'node-recipient'});
  let index = 0;
  const commit = (command) => {
    index += 1;
    const effects = {afterCommit: [], afterRollback: []};
    host.applyCommittedEntry({command, index, term: 1, effects}, null);
    for (const effect of effects.afterCommit) effect();
  };
  // Time passes between deliveries (the sweep compares cache mutation times
  // with the list's start).
  const commitRange = ({events, sourceRange}) => {
    clock.advance(1);
    commit({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events: captureCdcEvents(events),
      sourceRange});
  };
  return {cache, host, clock, lists, commit, commitRange, integration,
    cell: () => cache.sourceOrder.positionOf(SOURCE_PARTITION),
    mutations: () => cache.getTableMutationVersion(TABLES.NODES),
    statuses: () => statusesOfRows(cache.getAll(TABLES.NODES))};
}

// A history: entries at sparse log indices, some with several events of one
// key (one origin HLC per entry), deletes and re-creates.
function event(logIndex, ordinal, operation, nodeId, _sourceMs, status = null) {
  const wallMs = entryWallMs(logIndex);
  const data = {[COLUMN.NODE_ID]: nodeId, [COLUMN.UPDATED_AT]: wallMs,
    [COLUMN.UPDATED_AT_HLC]: hlc(wallMs), ...(status === null ? {} : {[COLUMN.STATUS]: status})};
  return {tableName: TABLES.NODES, operation, data, timestamp: hlc(wallMs),
    sourcePartition: SOURCE_PARTITION, sourceReplica: `${SOURCE_PARTITION}-r1`,
    eventKey: `nodes-${logIndex}-${ordinal}`, entryId: `nodes-entry-${logIndex}`,
    sourceLogIndex: logIndex, sourceOrdinal: ordinal};
}

function fixedHistory() {
  return [
    event(10, 0, CDC_OPERATION.INSERT, 'node-a', 1000, 'joining'),
    event(12, 0, CDC_OPERATION.INSERT, 'node-b', 1100, 'joining'),
    // One entry: a joining -> ready update pair on one key (same HLC).
    event(15, 0, CDC_OPERATION.UPDATE, 'node-a', 1200, 'syncing'),
    event(15, 1, CDC_OPERATION.UPDATE, 'node-a', 1200, 'ready'),
    event(16, 0, CDC_OPERATION.DELETE, 'node-b', 1300),
    // One entry: delete and re-create of one key.
    event(20, 0, CDC_OPERATION.INSERT, 'node-c', 1400, 'joining'),
    event(21, 0, CDC_OPERATION.DELETE, 'node-c', 1500),
    event(21, 1, CDC_OPERATION.INSERT, 'node-c', 1500, 're-created'),
    event(25, 0, CDC_OPERATION.UPDATE, 'node-a', 1600, 'draining'),
  ];
}

async function listedRecipient(source, appliedIndex) {
  const ref = {current: {source, appliedIndex}};
  const recipient = composeRecipient(ref);
  // The first contact of a recipient with no position is a gap: it lists.
  recipient.commitRange(source.range(0, 1));
  await settle();
  return {recipient, ref};
}

test('S3-1 a recipient with no position answers its first range with a gap, merges nothing, ' +
  'lists once from the leader image and then streams from the listed position', async () => {
  const source = sourceOf(captureCdcEvents(fixedHistory()));
  const ref = {current: {source, appliedIndex: 15}};
  const recipient = composeRecipient(ref);
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.UNKNOWN);

  const mutationsBefore = recipient.mutations();
  recipient.commitRange(source.range(3, 5));
  assert.equal(recipient.mutations(), mutationsBefore,
    'a range whose predecessor this cache has not applied is not merged on HLC');
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.GAP);
  await settle();
  assert.deepEqual(recipient.lists, [{partitionId: SOURCE_PARTITION, appliedIndex: 15,
    hydrationImage: true}], 'one list, of the hydration image');
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.GAP,
    'the image at 15 predates the gapped range (through 16): still stale');
  ref.current.appliedIndex = 25;
  recipient.clock.advance(RELIST_RETRY_MS);
  await settle();
  assert.equal(recipient.lists.length, 2, 'the owed list ran again after the relister backoff');
  assert.deepEqual(recipient.cell().position, {logIndex: 25, ordinal: Number.MAX_SAFE_INTEGER});
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.statuses(), statusesOfRows(source.imageAt(25)));

  // Replay of everything already covered by the image: refused by position.
  const covered = recipient.mutations();
  recipient.commitRange(source.range(0, source.events.length));
  assert.equal(recipient.mutations(), covered, 'members at or below the position are skipped');
  assert.deepEqual(recipient.statuses(), statusesOfRows(source.imageAt(25)));
});

test('S3-2 replay of an applied range and a late older range change nothing; same-entry ' +
  'siblings keep source order; delete and re-create in one entry converge', async () => {
  const events = captureCdcEvents(fixedHistory());
  const source = sourceOf(events);
  const {recipient} = await listedRecipient(source, 12);
  assert.deepEqual(recipient.cell().position, {logIndex: 12, ordinal: Number.MAX_SAFE_INTEGER});
  recipient.commitRange(source.range(2, 5));
  assert.deepEqual(recipient.statuses(), [['node-a', 'ready']],
    'syncing then ready of one entry ends ready; node-b deleted');
  recipient.commitRange(source.range(5, 9));
  const settled = recipient.mutations();
  recipient.commitRange(source.range(2, 5));
  recipient.commitRange(source.range(3, 4));
  recipient.commitRange(source.range(5, 9));
  assert.equal(recipient.mutations(), settled, 'a replay or late older range is refused by position');
  assert.deepEqual(recipient.statuses(), statusesOfRows(source.imageAt(25)));
  assert.deepEqual(recipient.statuses(), [['node-a', 'draining'], ['node-c', 're-created']]);
});

test('S3-3 a position of another source incarnation never authorizes a skip: the rebuilt ' +
  'log\'s ranges gap, the recipient lists from the new incarnation and converges', async () => {
  const source = sourceOf(captureCdcEvents(fixedHistory()));
  const {recipient, ref} = await listedRecipient(source, 25);
  assert.deepEqual(recipient.statuses(), statusesOfRows(source.imageAt(25)));
  // The source log is rebuilt from fresh storage: indexes restart, and the
  // first positions are numerically below the cell's.
  const rebuilt = sourceOf(captureCdcEvents([
    event(5, 0, CDC_OPERATION.INSERT, 'node-x', 9000, 'joining'),
    event(6, 0, CDC_OPERATION.INSERT, 'node-y', 9100, 'joining'),
    event(7, 0, CDC_OPERATION.UPDATE, 'node-x', 9200, 'ready'),
  ]), OTHER_INCARNATION);
  ref.current = {source: rebuilt, appliedIndex: 6};
  const before = recipient.mutations();
  recipient.commitRange(rebuilt.range(1, 2));
  assert.equal(recipient.mutations(), before,
    'index 6 is below the old position 25, yet it is neither skipped as applied nor merged');
  assert.equal(recipient.cell().incarnation, OTHER_INCARNATION);
  await settle();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.statuses(), statusesOfRows(rebuilt.imageAt(6)),
    'the image of the new incarnation replaced the old rows (swept)');
  recipient.commitRange(rebuilt.range(2, 3));
  assert.deepEqual(recipient.statuses(), [['node-x', 'ready'], ['node-y', 'joining']]);
});

test('S3-4 a list racing the stream: ranges committed while the node is gapped are not ' +
  'merged; an image older than them leaves the cell stale and lists again', async () => {
  const source = sourceOf(captureCdcEvents(fixedHistory()));
  const ref = {current: {source, appliedIndex: 12}};
  const recipient = composeRecipient(ref);
  recipient.commitRange(source.range(2, 5));
  recipient.commitRange(source.range(5, 9));
  const gapped = recipient.mutations();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.GAP);
  await settle();
  assert.equal(recipient.lists.length, 1);
  assert.equal(recipient.mutations() > gapped, true, 'the image at 12 was installed');
  assert.deepEqual(recipient.cell().need, {logIndex: 25, ordinal: 0},
    'the cell knows it is stale through the last skipped range');
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.GAP);
  ref.current.appliedIndex = 25;
  recipient.clock.advance(RELIST_RETRY_MS);
  await settle();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.statuses(), statusesOfRows(source.imageAt(25)));
});

// Seeded histories and schedules: arbitrary range boundaries, re-deliveries,
// late older ranges, skipped ranges (gaps), and leader images at arbitrary
// applied indexes racing the stream, through the real committed application.
// After the schedule the source delivers its tail once more (as a lane does
// for a recipient that confirmed nothing past it) and every owed list runs:
// the cache equals the source.
function seededHistory(random) {
  const live = new Set();
  const out = [];
  let wallMs = 1000;
  let logIndex = 10;
  let ordinal = 0;
  for (let index = 0; index < 4 + random(16); index += 1) {
    const nodeId = `node-${random(3)}`;
    const sameEntry = out.length > 0 && random(4) === 0;
    if (sameEntry) {
      ordinal += 1;
    } else {
      wallMs += 10;
      logIndex += 1 + random(3);
      ordinal = 0;
    }
    let operation = CDC_OPERATION.UPDATE;
    if (!live.has(nodeId)) {
      operation = CDC_OPERATION.INSERT;
      live.add(nodeId);
    } else if (random(3) === 0) {
      operation = CDC_OPERATION.DELETE;
      live.delete(nodeId);
    }
    out.push(event(logIndex, ordinal, operation, nodeId, wallMs,
      operation === CDC_OPERATION.DELETE ? null : `s${index}`));
  }
  return captureCdcEvents(out);
}

test('S3-5 property: any schedule of ranges, replays, late older ranges, gaps and racing ' +
  'images converges on the source through the real application, handler and cache', async () => {
  let seed = 424242;
  const random = (bound) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % bound;
  };
  for (let trial = 0; trial < 150; trial += 1) {
    const events = seededHistory(random);
    const source = sourceOf(events);
    const ref = {current: {source, appliedIndex: events[random(events.length)].sourceLogIndex}};
    const recipient = composeRecipient(ref);
    const ranges = [];
    for (let at = 0; at < events.length;) {
      const end = Math.min(events.length, at + 1 + random(4));
      if (random(5) !== 0) ranges.push([at, end]);
      at = end;
    }
    for (let extra = random(4); extra > 0; extra -= 1) {
      const start = random(events.length);
      ranges.splice(random(ranges.length + 1), 0,
        [start, Math.min(events.length, start + 1 + random(5))]);
    }
    for (const [start, end] of ranges) {
      recipient.commitRange(source.range(start, end));
      if (random(3) === 0) await settle();
      // The source leader moves on; an image taken now names that index.
      ref.current.appliedIndex = Math.max(ref.current.appliedIndex,
        events[end - 1].sourceLogIndex);
    }
    ref.current.appliedIndex = events.at(-1).sourceLogIndex;
    recipient.commitRange(source.range(events.length - 1, events.length));
    for (let round = 0; round < 3; round += 1) {
      await settle();
      recipient.clock.advance(RELIST_RETRY_MS);
    }
    await settle();
    assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT,
      `trial ${trial}: ${JSON.stringify(ranges)}`);
    assert.deepEqual(recipient.statuses(), statusesOfRows(source.imageAt(Infinity)),
      `trial ${trial}: ranges ${JSON.stringify(ranges)}`);
  }
});

// The within-entry rule of the same source-order owner, on a path no range
// gates (provisional ingress applies through the handler directly): two
// updates of one key in one entry tie on origin HLC; the later ordinal wins
// and a late earlier sibling never replaces it.
test('S3-6 unranged ingress keeps same-entry source order: a late earlier sibling never ' +
  'replaces the later one', () => {
  const recipient = composeRecipient({current: null});
  const [syncing, ready] = captureCdcEvents([
    event(15, 0, CDC_OPERATION.UPDATE, 'node-a', 0, 'syncing'),
    event(15, 1, CDC_OPERATION.UPDATE, 'node-a', 0, 'ready')]);
  recipient.host.cdcHandler.applyImmediate(ready, {skipSubscriptionCheck: true});
  recipient.host.cdcHandler.applyImmediate(syncing, {skipSubscriptionCheck: true});
  assert.deepEqual(recipient.statuses(), [['node-a', 'ready']]);
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.UNKNOWN,
    'unranged ingress never moves the position cell');
});
