// Independent reconstruction of the reported image/effect race. The relister,
// image install, cache, handlers and committed application are production code.
// Only owner-RPC page delivery and committed-entry delivery are substituted;
// this is not physical Raft, SQL loss or permanent-stranding evidence.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {test} from 'node:test';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {classifyDurableRangeAtLeader} from
  '../../src/message-group/message-group-cdc-source-range.js';
import {assignRaftTiming} from '../../src/message-group/message-group-service-raft-timing.js';
import {PARTITION_HYDRATION_IMAGE_PAGE_FIELD} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const TABLE = TABLES.NODES;
const SOURCE = INITIAL_PARTITION_IDS[TABLE];
const INCARNATION = 'independent-image-effect-source';
const KEY = 'image-effect-node';
const silent = {debug() {}, info() {}, warn() {}, error() {}};
const hlc = (index) => new HLCTimestamp(index * 100, 0, 'image-source').toString();
const original = {node_id: KEY, status: 'joining', address: 'before',
  boot_incarnation: 'boot-1', created_at: 1000, updated_at: 1000, updated_at_hlc: hlc(10)};
const updated = {...original, status: 'ready', address: 'after', updated_at: 1100,
  updated_at_hlc: hlc(11)};
const latch = () => {
  let resolve;
  const promise = new Promise((answer) => {
    resolve = answer;
  });
  return {promise, resolve};
};

class ApplicationHost extends EventEmitter {}
assignRaftTiming(ApplicationHost);

function eventOf(operation, data, ordinal = 0) {
  return {tableName: TABLE, operation, data, timestamp: hlc(11),
    sourcePartition: SOURCE, sourceReplica: 'image-source-replica',
    sourceLogIndex: 11, sourceOrdinal: ordinal, entryId: 'source-entry-11',
    eventKey: `image-effect-source:11:${ordinal}`};
}

function rowOf(cache) {
  const row = cache.get(TABLE, KEY);
  return row === null ? null : {status: row.status, address: row.address,
    boot_incarnation: row.boot_incarnation};
}

function observation(cache) {
  const cell = cache.sourceOrder.positionOf(SOURCE);
  return {row: rowOf(cache), position: cell.position, state: cell.state};
}

function fixture(t) {
  const clock = new VirtualTimeSource({startMs: 2000});
  const cache = new SystemTableCache({timeSource: clock});
  cache.logger = silent;
  cache.applySystemTableChange(TABLE, CDC_OPERATION.INSERT, original);
  const hosts = [0, 1].map((index) => {
    const host = new ApplicationHost();
    host.groupId = `image-effect-group-${index}`;
    host.logger = silent;
    host.isCurrentRaftLeader = () => true;
    host.cdcHandler = new CDCHandler(cache, {timeSource: clock});
    host.cdcHandler.logger = silent;
    host.cdcHandler.subscribe(TABLE);
    return host;
  });
  const secondPage = latch();
  const release = latch();
  const installed = latch();
  const pages = [];
  const queryExecutor = {executeOnPartition: async (_partition, _sql, _params,
    _forRead, _preferLeader, _sameGroup, options) => {
    const cursor = options.buildRequest()[PARTITION_HYDRATION_IMAGE_PAGE_FIELD];
    pages.push(cursor);
    if (cursor.page === 1) {
      secondPage.resolve();
      await release.promise;
    }
    return options.buildSuccessResult({rows: cursor.page === 0 ? [original] : [],
      sourceImage: {sourcePartition: SOURCE, incarnation: INCARNATION, appliedIndex: 10},
      imagePage: {imageId: 'independent-image-at-10', page: cursor.page,
        last: cursor.page === 1, byteCount: 256},
      readAuthorityWitness: {state: 'observed', partitionId: SOURCE, role: 'leader',
        servingNodeId: 'image-source', servingReplicaId: 'image-source-replica',
        observedAtMs: 2000, term: 1, appliedIndex: 10, commitIndex: 10}});
  }};
  const integration = new CDCIntegrationService({nodeId: 'image-effect-recipient',
    systemTableCache: cache, timeSource: clock, sqlQueryEngine: {queryExecutor}});
  integration.logger = {...silent, info(_message, fields) {
    if (fields?.tableName === TABLE && fields.pages !== undefined) installed.resolve(fields);
  }};
  integration.initialize();
  t.after(() => {
    integration.markShuttingDown();
    for (const host of hosts) host.cdcHandler.shutdown();
  });
  let logIndex = 0;
  const commit = (host, events, range) => {
    const effects = {afterCommit: [], afterRollback: []};
    host.applyCommittedEntry({command: {type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH,
      events: captureCdcEvents(events), sourceRange: range}, index: ++logIndex,
    term: 1, effects}, null);
    for (const effect of effects.afterCommit) effect();
  };
  return {cache, hosts, pages, secondPage, release, installed, commit};
}

const cases = [
  {id: 'no-provisional', timing: 'none'},
  {id: 'provisional-after-image', timing: 'after'},
  {id: 'provisional-before-image', timing: 'before'},
  {id: 'all-handlers-sharing-cache', timing: 'before', both: true},
  {id: 'buffered-before-image', timing: 'before', buffered: true},
  {id: 'same-entry-siblings', timing: 'before', siblings: true, both: true},
  {id: 'delete-recreate', timing: 'before', recreate: true, both: true},
];

async function runCase(t, scenario) {
  const f = fixture(t);
  const events = scenario.recreate ? [eventOf(CDC_OPERATION.DELETE, {...original,
    updated_at: 1100, updated_at_hlc: hlc(11)}),
  eventOf(CDC_OPERATION.INSERT, {...updated, boot_incarnation: 'boot-2'}, 1)] :
    [eventOf(CDC_OPERATION.UPDATE, updated)];
  if (scenario.siblings) {
    events.push(eventOf(CDC_OPERATION.UPDATE, {...updated, address: 'sibling-last'}, 1));
  }
  const range = {sourcePartition: SOURCE, incarnation: INCARNATION,
    after: {logIndex: 10, ordinal: Number.MAX_SAFE_INTEGER},
    through: {logIndex: 11, ordinal: events.at(-1).sourceOrdinal}};
  const expected = {row: {status: 'ready',
    address: scenario.siblings ? 'sibling-last' : 'after',
    boot_incarnation: scenario.recreate ? 'boot-2' : 'boot-1'},
  position: range.through, state: 'current'};
  const timeline = [];
  const observe = (stage) => timeline.push({stage, ...observation(f.cache)});
  const provisional = () => {
    for (const host of scenario.both ? f.hosts : [f.hosts[0]]) {
      for (const event of events) {
        if (scenario.buffered) host.cdcHandler.handleEvent(event);
        else host.cdcHandler.applyImmediate(event);
      }
      if (scenario.buffered) host.cdcHandler.flushAllBuffers();
    }
  };
  f.cache.sourceOrder.requireListed(SOURCE, TABLE);
  await f.secondPage.promise;
  observe('paged-relist-before-provisional');
  if (scenario.timing === 'before') provisional();
  observe('paged-relist-after-provisional');
  f.release.resolve();
  const image = await f.installed.promise;
  observe('image-installed');
  if (scenario.timing === 'after') provisional();
  const host = f.hosts[scenario.both ? 1 : 0];
  f.commit(host, events, range);
  observe('committed-replay');
  const revision = f.cache.getTableMutationVersion(TABLE);
  // Discard the first answer (lost receipt); deliver the identical entry again.
  f.commit(host, events, range);
  observe('lost-receipt-replay');
  f.commit(f.hosts[0], events, range);
  observe('other-handler-repeated-replay');
  const leader = classifyDurableRangeAtLeader(host, range, TABLE);
  return {id: scenario.id, timeline, expected, image, pages: f.pages,
    leaderDecision: leader.decision,
    replayStable: f.cache.getTableMutationVersion(TABLE) === revision,
    passed: isDeepStrictEqual(observation(f.cache), expected) &&
      f.cache.getTableMutationVersion(TABLE) === revision &&
      leader.decision === 'already_applied'};
}

test('an image replacement retains row effect and source position together across replay',
async (t) => {
  const results = [];
  for (const scenario of cases) results.push(await runCase(t, scenario));
  const receipt = {schema: 'test-receipt/1', status: results.every((r) => r.passed) ?
    'pass' : 'fail', receipts: results.map(({id, passed}) => ({id, passed}))};
  const evidence = new URL('../../solve/quests/cdc-image-effect-currentness/evidence/',
    import.meta.url);
  fs.mkdirSync(evidence, {recursive: true});
  fs.writeFileSync(new URL('receipt.json', evidence), `${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(new URL('observations.json', evidence), `${JSON.stringify(results, null, 2)}\n`);
  for (const result of results) {
    t.diagnostic(`${result.id}: ${JSON.stringify(result.timeline)}`);
  }
  for (const result of results) {
    assert.deepEqual(result.timeline.find((seen) => seen.stage === 'image-installed').position,
      {logIndex: 10, ordinal: Number.MAX_SAFE_INTEGER}, `${result.id}: image position`);
    assert.deepEqual(result.timeline.find((seen) => seen.stage === 'committed-replay'),
      {stage: 'committed-replay', ...result.expected}, `${result.id}: row AND position`);
    assert.equal(result.passed, true, `${result.id}: lost receipt and repeated replay`);
  }
});
