// CDC Stage 3 paged re-list (design note, "Stage 3 as built", chunked
// re-list): a source table of any size is listed into a recipient cache as
// one image read from one leader snapshot, page by page, staged off the cache
// and installed - rows swapped and position recorded - in one span.
//
// Composition: the source is a real PartitionService of the production
// latency_groups schema and partition id (file databases: the image holds a
// WAL read snapshot), written through committed entries. The recipient is the
// production entry point - a real SystemTableCache, a real
// CDCIntegrationService whose relister the cache's source-order cell drives
// (registerSourceRelister, relistSourceTable), and the real committed
// application of a message group for the ranges that follow an image. Faults
// are injected at the owner-RPC port between the recipient and the source
// replicas (leader change, an expired image, a router that confuses images, a
// cleared cache, a stopped recipient). Only the shipping lane is modelled:
// ranges are built from the source's own committed writes in log order (the
// lane's range shipping is witnessed in
// test/partition/partition-cdc-source-relist.test.js).
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {INITIAL_PARTITION_IDS, getSchemaByTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SOURCE_IMAGE_ADMISSION, SOURCE_POSITION_STATE, SOURCE_RELIST_STATE} from
  '../../src/cache/system-table-cache-source-order.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SOURCE_RELIST_FAILURE} from '../../src/cdc/cdc-integration-service-source-relist.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCClockService} from '../../src/hlc/hlc-clock-service.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {assignRaftTiming} from '../../src/message-group/message-group-service-raft-timing.js';
import {readCdcLedgerIncarnation} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_HYDRATION_IMAGE_BOUND as SOURCE_BOUND} from
  '../../src/partition/partition-hydration-image-pages.js';
import {PARTITION_HYDRATION_IMAGE_ERROR, PARTITION_HYDRATION_IMAGE_PAGE_FIELD,
  PARTITION_HYDRATION_IMAGE_QUERY_FIELD} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {QUERY_MESSAGE_TYPE} from '../../src/query/query-constants.js';
import {QUERY_RESULT_REQUEST_FIELD, collectBoundedSqliteRows} from
  '../../src/query/query-result-budget.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {REPLICAS, applyCommitted, clearFixtureSingletons, committedQueryOf, resetFixtureSingletons,
  shutdownAll, startLeader, startReplica, temporaryDbPath} from
  '../test-helpers/participant-transaction-fixture.js';

beforeEach(() => resetFixtureSingletons());
afterEach(() => clearFixtureSingletons());

const TABLE = TABLES.LATENCY_GROUPS;
const SOURCE = INITIAL_PARTITION_IDS[TABLE];
const SCHEMA = {columns: getSchemaByTableName(TABLE).columns};
const COLUMNS = ['group_id', 'representative_node_id', 'coordinator_node_id', 'state',
  'created_at', 'updated_at'];
// The single-shot image bound the paged image replaces (the old
// RELIST_IMAGE_MAX_ROWS / RELIST_IMAGE_MAX_BYTES).
const OLD_IMAGE_BOUND = Object.freeze({maxRows: 64 * 1024, maxBytes: 16 * 1024 * 1024});
const RELIST_RETRY_MS = 500;
const SILENT_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const settle = async (turns = 20) => {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

// --- the source: real partition replicas and their committed write log ---

async function sourceOf(t, {replicas: count = 1, file = true} = {}) {
  const clock = new VirtualTimeSource({startMs: 1_000});
  const directories = [];
  const extraOf = () => {
    const temporary = file ? temporaryDbPath() : null;
    if (temporary) directories.push(temporary.directory);
    return {tableName: TABLE, schema: SCHEMA, partitionId: SOURCE, generationOrigin: false,
      timeSource: clock, ...(temporary ? {dbPath: temporary.dbPath} : {})};
  };
  const {leader} = await startLeader(extraOf());
  const replicas = [leader];
  for (let index = 1; index < count; index += 1) {
    replicas.push(await startReplica(REPLICAS[index], extraOf()));
  }
  t.after(async () => {
    await shutdownAll(...replicas);
    for (const directory of directories) fs.rmSync(directory, {recursive: true, force: true});
  });
  const source = {clock, replicas, events: [], rows: new Map(), wallMs: 10_000, writes: 0};
  source.leader = () => replicas.find((replica) => replica.isLeader) ?? null;
  source.appliedIndex = () => replicas[0].controllablePort.committedIndex;
  // The ledger incarnation every range and image of this source names.
  source.incarnation = () => readCdcLedgerIncarnation(replicas[0].db);
  // One committed entry on every replica; its CDC events in source order.
  source.commit = (sql, params, changes) => {
    source.writes += 1;
    source.wallMs += 10;
    const command = committedQueryOf(`paged-relist-${source.writes}`, sql);
    command.params = params;
    command.timestamp = new HLCTimestamp(source.wallMs, 0, 'paged-source').toString();
    for (const replica of replicas) assert.equal(applyCommitted(replica, command), null);
    const logIndex = source.appliedIndex();
    changes.forEach(([operation, data], ordinal) => {
      if (operation === CDC_OPERATION.DELETE) source.rows.delete(data.group_id);
      else source.rows.set(data.group_id, data);
      // The shipping lane is modelled, but its payload uses the real producer's
      // original command stamp. A wall time is not a substitute source identity.
      const stamped = replicas[0].syncCDCGeneratorDependencies().stampOriginHlc(
        data, command.timestamp);
      source.events.push({tableName: TABLE, operation, data: stamped, timestamp: command.timestamp,
        sourcePartition: SOURCE, sourceReplica: replicas[0].replicaId,
        eventKey: `paged-${logIndex}-${ordinal}`, entryId: command.entryId,
        sourceLogIndex: logIndex, sourceOrdinal: ordinal});
    });
  };
  source.insert = (ids, padding = '') => {
    const rows = ids.map((id) => ({group_id: id, representative_node_id: padding || null,
      coordinator_node_id: null, state: 'active', created_at: source.wallMs + 10,
      updated_at: source.wallMs + 10}));
    source.commit(`INSERT INTO ${TABLE} (${COLUMNS.join(', ')}) VALUES ` +
      rows.map(() => `(${COLUMNS.map(() => '?').join(', ')})`).join(', '),
    rows.flatMap((row) => COLUMNS.map((column) => row[column])),
    rows.map((row) => [CDC_OPERATION.INSERT, row]));
  };
  source.update = (id, state) => {
    const row = {...source.rows.get(id), state, updated_at: source.wallMs + 10};
    source.commit(`UPDATE ${TABLE} SET state = ?, updated_at = ? WHERE group_id = ?`,
      [state, row.updated_at, id], [[CDC_OPERATION.UPDATE, row]]);
  };
  source.delete = (id) => {
    source.commit(`DELETE FROM ${TABLE} WHERE group_id = ?`, [id],
      [[CDC_OPERATION.DELETE, {group_id: id, updated_at: source.wallMs + 10}]]);
  };
  source.bulk = (count, prefix, padding = '') => {
    for (let at = 0; at < count; at += 100) {
      source.insert(Array.from({length: Math.min(100, count - at)},
        (_, offset) => `${prefix}-${String(at + offset).padStart(6, '0')}`), padding);
    }
  };
  // The source table as its leader holds it now: [group_id, state] pairs.
  source.table = () => replicas[0].db.prepare(
    `SELECT group_id, state FROM ${TABLE} ORDER BY group_id`).all()
    .map((row) => [row.group_id, row.state]);
  return source;
}

function makeLeader(replica) {
  replica.role = 'leader';
  replica.isLeader = true;
  replica.leaderId = replica.replicaId;
  replica.controllablePort.setRole(RAFT_ROLE.LEADER);
}

// --- the recipient: real cache, integration service relister, application ---

class CommittedApplicationHost extends EventEmitter {}
assignRaftTiming(CommittedApplicationHost);

function recipientOf(source, {pageRows = null} = {}) {
  const clock = new VirtualTimeSource({startMs: 1});
  const cache = new SystemTableCache({timeSource: clock});
  const host = new CommittedApplicationHost();
  host.groupId = 'paged-recipient-group';
  host.logger = SILENT_LOGGER;
  host.hlcClock = new HLCClockService('paged-recipient');
  host.cdcHandler = new CDCHandler(cache);
  host.cdcHandler.initialize();
  const recipient = {clock, cache, host, pages: [], images: [], hook: null, pageRows};
  // The owner-RPC port: every source replica is a candidate; the first
  // success answers, else the last refusal (a router walking its candidates).
  const queryExecutor = {executeOnPartition: async (partitionId, _sql, _params, _forRead,
    _preferLeader, _sameGroup, options) => {
    const request = options.buildRequest();
    if (recipient.pageRows !== null) {
      request[QUERY_RESULT_REQUEST_FIELD.MAX_ROWS] = recipient.pageRows;
    }
    const cursor = request[PARTITION_HYDRATION_IMAGE_PAGE_FIELD];
    const injected = recipient.hook ? await recipient.hook(cursor, request) : undefined;
    if (injected !== undefined) return injected;
    let refusal = null;
    for (const replica of source.replicas) {
      const answer = await replica.handleRemoteQuery(request);
      if (answer.success) {
        recipient.pages.push({...answer.imagePage, appliedIndex: answer.sourceImage.appliedIndex});
        return options.buildSuccessResult(answer);
      }
      refusal = answer;
    }
    recipient.pages.push({refused: refusal.errorCode, page: cursor.page});
    return refusal;
  }};
  const start = () => {
    const integration = new CDCIntegrationService({nodeId: 'paged-recipient',
      systemTableCache: cache, timeSource: clock, sqlQueryEngine: {queryExecutor}});
    integration.logger = {...SILENT_LOGGER, info: (message, fields) => {
      if (fields?.tableName !== TABLE || fields.pages === undefined) return;
      recipient.images.push(fields);
      recipient.onImage?.(fields);
    }};
    integration.initialize({nodeId: 'paged-recipient'});
    recipient.integration = integration;
    return integration;
  };
  start();
  recipient.restart = start;
  let index = 0;
  recipient.commitRange = (events, sourceRange) => {
    index += 1;
    const effects = {afterCommit: [], afterRollback: []};
    host.applyCommittedEntry({command: {type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH,
      events: captureCdcEvents(events), sourceRange}, index, term: 1, effects}, null);
    for (const effect of effects.afterCommit) effect();
  };
  recipient.cell = () => cache.sourceOrder.positionOf(SOURCE);
  recipient.table = () => cache.getAll(TABLE).map((row) => [row.group_id, row.state])
    .sort(([left], [right]) => left.localeCompare(right));
  // Run the relister to quiescence: settle, and let its backoff elapse.
  recipient.run = async (rounds = 12) => {
    for (let round = 0; round < rounds; round += 1) {
      await settle();
      if (recipient.cell().state !== SOURCE_POSITION_STATE.GAP) return;
      clock.advance(RELIST_RETRY_MS);
    }
    await settle();
  };
  return recipient;
}

const positionOf = (event) => ({logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal});
const START = Object.freeze({logIndex: 0, ordinal: -1});

// The lane, as far as the recipient sees it: one held vector of every event
// past the recipient's confirmed cursor, re-shipped until its range applies.
function senderOf(source, recipient) {
  let confirmed = 0;
  return {ship() {
    if (confirmed >= source.events.length) return;
    const events = source.events.slice(confirmed);
    const range = {sourcePartition: SOURCE, incarnation: source.incarnation(),
      after: confirmed === 0 ? START : positionOf(source.events[confirmed - 1]),
      through: positionOf(events.at(-1))};
    recipient.commitRange(events, range);
    const cell = recipient.cell();
    if (cell.position !== null && (cell.position.logIndex > range.through.logIndex ||
        (cell.position.logIndex === range.through.logIndex &&
          cell.position.ordinal >= range.through.ordinal))) {
      confirmed = source.events.length;
    }
  }};
}

// A stale cache before the list: rows the source no longer has.
function seedStaleRows(recipient, ids) {
  for (const id of ids) {
    recipient.cache.applySystemTableChange(TABLE, CDC_OPERATION.UPSERT, {group_id: id,
      state: 'stale', created_at: 1, updated_at: 1}, {causeId: 'stale-seed'});
  }
}

const imageQuery = (cursor) => ({type: QUERY_MESSAGE_TYPE.QUERY, sql: `SELECT * FROM ${TABLE}`,
  params: [], [PARTITION_HYDRATION_IMAGE_QUERY_FIELD]: true,
  [PARTITION_HYDRATION_IMAGE_PAGE_FIELD]: cursor});

test('(a) a table above the old single-shot bound lists across pages; the cache equals the ' +
  'source; old rows stay visible and a currency-required read waits until the install',
async (t) => {
  const source = await sourceOf(t);
  // ~20 MiB: 5000 rows of ~4 KiB each.
  source.bulk(5000, 'g', 'x'.repeat(4000));
  assert.throws(() => collectBoundedSqliteRows(source.replicas[0].db
    .prepare(`SELECT * FROM ${TABLE}`), [], OLD_IMAGE_BOUND), /byte budget/u,
  'before: the single-shot image of this table is refused by its bound');
  const recipient = recipientOf(source);
  seedStaleRows(recipient, ['stale-1', 'stale-2']);
  let answer = null;
  recipient.integration.awaitProjectionAt({tableName: TABLE, key: 'stale-1', deleted: true,
    originHlc: new HLCTimestamp(source.wallMs, 0, 'paged-source').toString()})
    .then((value) => {
      answer = value;
    });
  const during = [];
  recipient.hook = async (cursor) => {
    if (cursor.page > 0) {
      during.push({stale: recipient.cache.get(TABLE, 'stale-1') !== null,
        rows: recipient.cache.getAll(TABLE).length, state: recipient.cell().state,
        answered: answer !== null});
    }
  };
  recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
  await recipient.run();
  const pages = recipient.pages.filter((page) => page.refused === undefined);
  assert.equal(pages.length >= 16, true, `many pages (${pages.length})`);
  assert.equal(pages.at(-1).last, true);
  assert.deepEqual(new Set(during.map((seen) => JSON.stringify(seen))),
    new Set([JSON.stringify({stale: true, rows: 2, state: SOURCE_POSITION_STATE.GAP,
      answered: false})]),
    'between pages: only the old rows are visible, the cell is gapped, the wait is open');
  assert.deepEqual(recipient.cell().position,
    {logIndex: source.appliedIndex(), ordinal: Number.MAX_SAFE_INTEGER});
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.table(), source.table(), 'the cache equals the source');
  await settle();
  assert.equal(answer?.outcome, 'reached', 'the install released the deletion wait');
  assert.equal(recipient.images.length, 1, 'one line for the image');
  assert.deepEqual({pages: recipient.images[0].pages, rows: recipient.images[0].rows,
    restarts: recipient.images[0].restarts, deleted: recipient.images[0].deleted},
  {pages: pages.length, rows: 5000, restarts: 0, deleted: 2});
  assert.equal(recipient.images[0].bytes > OLD_IMAGE_BOUND.maxBytes, true);
  assert.equal(source.replicas[0].hydrationImages.diagnostics().open, 0,
    'the last page closed the leader\'s snapshot');
});

test('(b) a source leader change mid-image restarts the image on the new leader; a delete ' +
  'between the two images is not resurrected; the cache equals the source', async (t) => {
  const source = await sourceOf(t, {replicas: 2});
  source.bulk(12, 'g');
  const recipient = recipientOf(source, {pageRows: 4});
  let changed = false;
  recipient.hook = async (cursor) => {
    if (!changed && cursor.page === 2) {
      changed = true;
      source.delete('g-000001');
      source.insert(['late-1']);
      source.replicas[0].controllablePort.setRole(RAFT_ROLE.FOLLOWER);
      makeLeader(source.replicas[1]);
    }
  };
  recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
  await recipient.run();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.table(), source.table());
  assert.equal(recipient.cache.get(TABLE, 'g-000001') ?? null, null,
    'deleted before the second P');
  const [image] = recipient.images;
  assert.equal(image.restarts, 1);
  assert.deepEqual(Object.keys(image.restartReasons).sort(),
    [PARTITION_HYDRATION_IMAGE_ERROR.EXPIRED].sort(),
    'the new leader does not hold the old image');
  assert.equal(source.replicas[0].hydrationImages.diagnostics().open, 0,
    'the old leader closed its image when its leadership ended');
});

test('(c) an image that expires mid-image (no page asked for two idle sweeps) answers ' +
  'IMAGE_EXPIRED; the recipient restarts and converges', async (t) => {
  const source = await sourceOf(t);
  source.bulk(10, 'g');
  const recipient = recipientOf(source, {pageRows: 3});
  let expired = false;
  recipient.hook = async (cursor) => {
    if (!expired && cursor.page === 2) {
      expired = true;
      source.update('g-000004', 'draining');
      source.clock.advance(SOURCE_BOUND.IDLE_SWEEP_MS);
      source.clock.advance(SOURCE_BOUND.IDLE_SWEEP_MS);
      assert.equal(source.replicas[0].hydrationImages.diagnostics().open, 0, 'expired');
    }
  };
  recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
  await recipient.run();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.table(), source.table());
  assert.deepEqual(recipient.images[0].restartReasons,
    {[PARTITION_HYDRATION_IMAGE_ERROR.EXPIRED]: 1});
});

test('(d) commits during the image (insert, update, delete, delete-then-recreate) are not ' +
  'in it: the install is the table at the image\'s one P; the ranges that follow apply in ' +
  'order and the cache equals the source', async (t) => {
  const source = await sourceOf(t);
  source.bulk(20, 'g');
  const recipient = recipientOf(source, {pageRows: 3});
  const sender = senderOf(source, recipient);
  let atOpen = null;
  recipient.hook = async (cursor) => {
    if (cursor.page === 0 && atOpen === null) {
      atOpen = {table: source.table(), appliedIndex: source.appliedIndex()};
      return undefined;
    }
    // Each page: one commit touching rows already paged and rows not yet.
    const step = cursor.page;
    if (step === 1) source.insert(['new-1']);
    if (step === 2) source.update('g-000000', 'paged-then-updated');
    if (step === 3) source.delete('g-000019');
    if (step === 4) source.delete('g-000002');
    if (step === 5) source.insert(['g-000002']);
    if (step === 6) source.update('g-000018', 'unpaged-then-updated');
    sender.ship();
    return undefined;
  };
  // The first contact of a recipient with no position: the range gaps.
  sender.ship();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.GAP);
  await settle();
  // Before the relister's backoff ends: the image is installed, not yet the ranges.
  assert.deepEqual(recipient.table(), atOpen.table,
    'the installed rows are the table at P, though six commits landed during the fetch');
  assert.deepEqual(recipient.cell().position,
    {logIndex: atOpen.appliedIndex, ordinal: Number.MAX_SAFE_INTEGER});
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.GAP,
    `ranges past P are known: still stale ${JSON.stringify(recipient.cell())} ` +
    `${JSON.stringify(recipient.pages)}`);
  sender.ship();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.table(), source.table(), 'the following ranges converge');
  const mutations = recipient.cache.getTableMutationVersion(TABLE);
  sender.ship();
  recipient.commitRange(source.events, {sourcePartition: SOURCE, incarnation: source.incarnation(),
    after: START, through: positionOf(source.events.at(-1))});
  assert.equal(recipient.cache.getTableMutationVersion(TABLE), mutations,
    'a replay at or below the position is refused (already applied)');
  await recipient.run();
  assert.equal(recipient.images.length, 1, 'one image: the ranges closed the gap');
});

test('(e) a recipient stopped mid-image installs nothing and the old rows stay; a cache ' +
  'reset mid-image discards the stage; each restart converges', async (t) => {
  const source = await sourceOf(t);
  source.bulk(12, 'g');
  const recipient = recipientOf(source, {pageRows: 4});
  seedStaleRows(recipient, ['stale-1']);
  const stoppedIntegration = recipient.integration;
  let stoppedDuringImage = false;
  recipient.hook = async (cursor) => {
    if (cursor.page === 2) {
      stoppedDuringImage = true;
      stoppedIntegration.markShuttingDown();
    }
  };
  recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
  await recipient.run(2);
  assert.equal(stoppedDuringImage, true);
  assert.deepEqual(recipient.table(), [['stale-1', 'stale']], 'no partial rows are visible');
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.GAP);
  assert.equal(recipient.cell().relist, SOURCE_RELIST_STATE.NO_RELISTER);
  assert.equal(recipient.images.length, 0,
    'the detached request cannot publish an image diagnostic for its old registration');
  assert.equal(stoppedIntegration.sourceRelisterRelease, null);
  assert.equal(stoppedIntegration.shutdownReleases.size, 0);
  assert.equal(stoppedIntegration.relistImageSlots.held, 0);
  assert.equal(stoppedIntegration.relistImageSlots.waiting.length, 0);
  assert.equal(recipient.clock.pendingTimerCount(), 0);

  // The recipient restarts: its new service lists the gapped table.
  recipient.hook = null;
  source.delete('g-000003');
  recipient.restart();
  await recipient.run();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.table(), source.table());
  assert.equal(recipient.images.length, 1);
  assert.equal(recipient.images[0].outcome, SOURCE_IMAGE_ADMISSION.INSTALL);

  // The cache is reset mid-image: the stage of the old cell is never installed.
  const imageCountBeforeReset = recipient.images.length;
  const resetRequests = [];
  let discardedImageId = null;
  recipient.hook = async (cursor) => {
    resetRequests.push({imageId: cursor.imageId, page: cursor.page});
    if (cursor.page === 1 && recipient.hook.fired !== true) {
      recipient.hook.fired = true;
      discardedImageId = cursor.imageId;
      recipient.cache.clear();
      seedStaleRows(recipient, ['after-clear']);
      recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
    }
  };
  source.update('g-000005', 'second');
  recipient.cache.sourceOrder.recordGap({sourcePartition: SOURCE,
    incarnation: source.incarnation(),
    after: positionOf(source.events.at(-1)), through: {logIndex: source.appliedIndex() + 1,
      ordinal: 0}}, TABLE);
  await recipient.run();
  // Advancing the existing retry clock cannot revive the displaced request.
  recipient.clock.advance(RELIST_RETRY_MS);
  await settle();
  assert.equal(typeof discardedImageId, 'string');
  assert.deepEqual(resetRequests.slice(0, 2).map((request) => request.page), [0, 1]);
  assert.deepEqual(resetRequests.filter((request) => request.imageId === discardedImageId)
    .map((request) => request.page), [1],
  'the displaced request stops at the held page instead of fetching the obsolete image');
  assert.equal(recipient.images.length, imageCountBeforeReset + 1,
    'only the replacement cell publishes its completed image');
  assert.equal(recipient.images.at(-1).outcome, SOURCE_IMAGE_ADMISSION.INSTALL);
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.equal(recipient.cell().relist, SOURCE_RELIST_STATE.IDLE);
  assert.deepEqual(recipient.table(), source.table());
  assert.equal(typeof recipient.integration.sourceRelisterRelease, 'function');
  assert.equal(recipient.integration.shutdownReleases.size, 0);
  assert.equal(recipient.integration.relistImageSlots.held, 0);
  assert.equal(recipient.integration.relistImageSlots.waiting.length, 0);
  assert.equal(recipient.clock.pendingTimerCount(), 0);
});

test('(f) a row larger than a page ships alone; a row above the absolute per-row bound is ' +
  'refused typed', async (t) => {
  const source = await sourceOf(t);
  source.bulk(6, 'g');
  source.insert(['huge'], 'h'.repeat(2 * SOURCE_BOUND.PAGE_MAX_BYTES));
  source.bulk(6, 'z');
  const recipient = recipientOf(source);
  recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
  await recipient.run();
  assert.deepEqual(recipient.table(), source.table());
  const pages = recipient.pages.filter((page) => page.refused === undefined);
  assert.deepEqual(pages.map((page) => page.rowCount), [6, 1, 6],
    'the huge row is a page of its own');
  assert.equal(recipient.cache.get(TABLE, 'huge').representative_node_id.length,
    2 * SOURCE_BOUND.PAGE_MAX_BYTES);

  source.insert(['too-large'], 't'.repeat(SOURCE_BOUND.ROW_MAX_BYTES + 1));
  const leader = source.leader();
  let answer = await leader.handleRemoteQuery(imageQuery({imageId: null, page: 0}));
  while (answer.success && !answer.imagePage.last) {
    answer = await leader.handleRemoteQuery(imageQuery({imageId: answer.imagePage.imageId,
      page: answer.imagePage.page + 1}));
  }
  assert.equal(answer.errorCode, PARTITION_HYDRATION_IMAGE_ERROR.ROW_EXCEEDS_BOUND);
  assert.equal(leader.hydrationImages.diagnostics().open, 0, 'the refusal closed the image');
});

test('the source holds at most OPEN_IMAGES_MAX images, refuses out-of-order pages and a ' +
  'follower typed, and closes its images when the partition closes', async (t) => {
  const source = await sourceOf(t, {file: false});
  source.bulk(5, 'g');
  const leader = source.leader();
  const opened = [];
  for (let index = 0; index < SOURCE_BOUND.OPEN_IMAGES_MAX; index += 1) {
    opened.push(await leader.handleRemoteQuery({...imageQuery({imageId: null, page: 0}),
      [QUERY_RESULT_REQUEST_FIELD.MAX_ROWS]: 1}));
  }
  const refused = await leader.handleRemoteQuery(imageQuery({imageId: null, page: 0}));
  assert.deepEqual({code: refused.errorCode, retryAfterMs: refused.retryAfterMs},
    {code: PARTITION_HYDRATION_IMAGE_ERROR.UNAVAILABLE,
      retryAfterMs: SOURCE_BOUND.UNAVAILABLE_RETRY_AFTER_MS});
  const skipped = await leader.handleRemoteQuery(imageQuery({imageId: opened[0].imagePage.imageId,
    page: 3}));
  assert.equal(skipped.errorCode, PARTITION_HYDRATION_IMAGE_ERROR.EXPIRED);
  const replay = await leader.handleRemoteQuery(imageQuery({imageId: opened[0].imagePage.imageId,
    page: 1}));
  assert.equal(replay.errorCode, PARTITION_HYDRATION_IMAGE_ERROR.EXPIRED, 'closed by the skip');
  const noCursor = await leader.handleRemoteQuery({...imageQuery(null)});
  assert.equal(noCursor.errorCode, PARTITION_HYDRATION_IMAGE_ERROR.REFUSED,
    'the single-shot request no longer exists');
  assert.equal(leader.hydrationImages.diagnostics().open, SOURCE_BOUND.OPEN_IMAGES_MAX - 1);
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  const follower = await leader.handleRemoteQuery(imageQuery({
    imageId: opened[1].imagePage.imageId, page: 1}));
  assert.equal(follower.errorCode, PARTITION_HYDRATION_IMAGE_ERROR.NOT_LEADER);
  assert.equal(leader.hydrationImages.diagnostics().open, 0, 'leadership ended: all closed');
  makeLeader(leader);
  await leader.handleRemoteQuery({...imageQuery({imageId: null, page: 0}),
    [QUERY_RESULT_REQUEST_FIELD.MAX_ROWS]: 1});
  assert.equal(leader.hydrationImages.diagnostics().open, 1);
  await shutdownAll(leader);
  assert.equal(leader.hydrationImages.diagnostics().open, 0, 'closed with the partition');
});

test('(b2) a page of another image (a router that confused images) is never staged: the ' +
  'image restarts and the install is the table at one P', async (t) => {
  const source = await sourceOf(t);
  source.bulk(12, 'g');
  const recipient = recipientOf(source, {pageRows: 4});
  let confused = false;
  const atOpen = [];
  recipient.hook = async (cursor, request) => {
    if (cursor.page === 0) {
      atOpen.push({table: source.table(), appliedIndex: source.appliedIndex()});
    }
    if (confused || cursor.page !== 1) return undefined;
    confused = true;
    source.delete('g-000000');
    source.insert(['g-000005b']);
    // The router answers page 1 from a fresh image of the same leader.
    const fresh = await source.leader().handleRemoteQuery({...request,
      [PARTITION_HYDRATION_IMAGE_PAGE_FIELD]: {imageId: null, page: 0}});
    return {...fresh, imagePage: {...fresh.imagePage, page: 1}};
  };
  recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
  await recipient.run();
  assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT);
  assert.deepEqual(recipient.images[0].restartReasons, {[SOURCE_RELIST_FAILURE.IMAGE_CHANGED]: 1});
  const installedAt = atOpen.find((open) =>
    open.appliedIndex === recipient.cell().position.logIndex);
  assert.deepEqual(recipient.table(), installedAt.table, 'one image, one P');
  assert.deepEqual(recipient.table(), source.table());
});

// Seeded: table size x page bound x commits interleaved at pages x a fault at
// a page, through real source replicas and the real recipient. After the
// schedule the lane ships its tail: the cache equals the source.
const FAULT = Object.freeze({NONE: 'none', LEADER_CHANGE: 'leader_change', EXPIRE: 'expire',
  DROPPED: 'dropped', RESET: 'reset', STOP: 'stop'});

test('(g) property: table size x page bound x interleaved commits x fault point converge on ' +
  'the source, with every install the table at its own P', async (t) => {
  let seed = 20261111;
  const random = (bound) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % bound;
  };
  const faults = Object.values(FAULT);
  const coverage = {fired: {}, outcomes: {}, restarted: 0, multiPage: 0, atP: 0,
    commitsDuring: 0};
  const notAtP = [];
  for (let trial = 0; trial < 48; trial += 1) {
    const source = await sourceOf(t, {replicas: 2, file: trial % 3 === 0});
    source.bulk(random(40), 'g');
    const recipient = recipientOf(source, {pageRows: 1 + random(7)});
    // A stale cache: rows the source never had, and some it has.
    seedStaleRows(recipient, Array.from({length: random(4)}, (_, index) => `stale-${index}`));
    seedStaleRows(recipient, [...source.rows.keys()].filter(() => random(3) === 0));
    const sender = senderOf(source, recipient);
    const fault = faults[trial % faults.length];
    const faultPage = 1 + random(3);
    const opens = new Map();
    let faulted = false;
    let next = 0;
    const live = () => [...source.rows.keys()];
    // One random source change while a page is read (kind 4: none).
    const changeSource = (kind) => {
      const ids = live();
      if (kind === 0) source.insert([`n-${next++}`]);
      if (kind === 1 && ids.length) source.update(ids[random(ids.length)], `s${next++}`);
      if (kind === 2 && ids.length) source.delete(ids[random(ids.length)]);
      if (kind === 3 && ids.length) {
        const id = ids[random(ids.length)];
        source.delete(id);
        source.insert([id]);
      }
    };
    // The trial's one fault, at its page: the page's answer, or undefined.
    const injectFault = () => {
      if (fault === FAULT.LEADER_CHANGE) {
        const [current, other] = source.leader() === source.replicas[0] ?
          source.replicas : [...source.replicas].reverse();
        current.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
        makeLeader(other);
      }
      if (fault === FAULT.EXPIRE) source.clock.advance(2 * SOURCE_BOUND.IDLE_SWEEP_MS);
      if (fault === FAULT.DROPPED) return {success: false, errorCode: 'transport_lost'};
      if (fault === FAULT.RESET) {
        recipient.cache.clear();
        recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
      }
      if (fault === FAULT.STOP) recipient.integration.markShuttingDown();
      return undefined;
    };
    recipient.hook = async (cursor) => {
      const kind = random(5);
      changeSource(kind);
      if (random(2) === 0) sender.ship();
      if (kind < 4) coverage.commitsDuring += 1;
      // The table as the image this request opens will read it (page 0 is
      // never a fault page).
      if (cursor.page === 0) opens.set(source.appliedIndex(), source.table());
      if (faulted || cursor.page !== faultPage) return undefined;
      faulted = true;
      coverage.fired[fault] = (coverage.fired[fault] ?? 0) + 1;
      return injectFault();
    };
    // Every install (logged in its own span) is the table at its image's P.
    recipient.onImage = (image) => {
      coverage.outcomes[image.outcome] = (coverage.outcomes[image.outcome] ?? 0) + 1;
      if (image.outcome !== 'install') return;
      // Recorded, not asserted: the relister's promise would swallow a throw.
      if (JSON.stringify(recipient.table()) === JSON.stringify(opens.get(image.appliedIndex))) {
        coverage.atP += 1;
      } else {
        notAtP.push({trial, fault, appliedIndex: image.appliedIndex, opens: [...opens.keys()],
          cell: recipient.cell()});
      }
    };
    recipient.cache.sourceOrder.requireListed(SOURCE, TABLE);
    sender.ship();
    await settle();
    if (fault === FAULT.STOP && faulted) {
      assert.equal(recipient.cache.getAll(TABLE).every((row) => row.state === 'stale'), true,
        `trial ${trial}: nothing partial`);
      recipient.restart();
    }
    for (let round = 0; round < 4; round += 1) {
      sender.ship();
      await recipient.run();
    }
    sender.ship();
    assert.equal(recipient.cell().state, SOURCE_POSITION_STATE.CURRENT,
      `trial ${trial} (${fault}): ${JSON.stringify(recipient.cell())} ` +
      `${JSON.stringify(recipient.pages)} ${JSON.stringify(recipient.images)}`);
    assert.deepEqual(recipient.table(), source.table(), `trial ${trial} (${fault})`);
    if (recipient.images.some((image) => image.restarts > 0)) coverage.restarted += 1;
    if (recipient.pages.some((page) => page.page > 0)) coverage.multiPage += 1;
  }
  assert.deepEqual(notAtP, [], 'every install is the table at its image\'s P');
  // The schedule exercised what it claims: every fault fired, restarts,
  // multi-page images, commits between pages, and the at-P check.
  for (const fault of faults.filter((kind) => kind !== FAULT.NONE)) {
    assert.equal((coverage.fired[fault] ?? 0) >= 2, true, `${fault}: ${JSON.stringify(coverage)}`);
  }
  assert.equal(coverage.restarted >= 8 && coverage.multiPage >= 20 && coverage.atP >= 10 &&
    coverage.commitsDuring >= 40, true, JSON.stringify(coverage));
  t.diagnostic(`coverage ${JSON.stringify(coverage)}`);
});
