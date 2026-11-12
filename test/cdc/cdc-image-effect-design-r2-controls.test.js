// Repair controls derived from the preserved R2 diagnostics at 57e396e4.
// The historical expected-defect version remains in that immutable snapshot.
// These assertions consume production cache/image/handler/range owners; only
// source delivery scheduling and the final committed-entry handoff are controlled.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {installSourceImage} from '../../src/cache/system-table-cache-source-image.js';
import {SOURCE_EFFECT_STATE} from '../../src/cache/system-table-cache-source-order.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {applyCommittedCdcRange, classifyDurableRangeAtLeader} from
  '../../src/message-group/message-group-cdc-source-range.js';
import {assignRaftTiming} from '../../src/message-group/message-group-service-raft-timing.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const TABLE = TABLES.NODES;
const SOURCE = INITIAL_PARTITION_IDS[TABLE];
const INCARNATION = 'r2-controls-ledger';
const KEY = 'r2-controls-node';
const silent = {debug() {}, info() {}, warn() {}, error() {}};
const hlc = (index) => new HLCTimestamp(index * 100, 0, 'r2-source').toString();
const position = (logIndex, ordinal = 0) => ({logIndex, ordinal});
const imagePosition = (index) => position(index, Number.MAX_SAFE_INTEGER);

class ApplicationHost extends EventEmitter {}
assignRaftTiming(ApplicationHost);

function eventOf(operation, index, key = KEY, ordinal = 0, fields = {}) {
  return captureCdcEvents([{tableName: TABLE, operation,
    data: {node_id: key, status: 'joining', created_at: 100,
      updated_at: index * 100, updated_at_hlc: hlc(index), ...fields},
    timestamp: hlc(index), sourcePartition: SOURCE, sourceReplica: 'r2-source-replica',
    sourceLogIndex: index, sourceOrdinal: ordinal, entryId: `r2-entry-${index}`,
    eventKey: `r2-opaque-${index}-${ordinal}-${key}`}])[0];
}

function rangeOf(events, after = position(0, -1), incarnation = INCARNATION) {
  const last = events.at(-1);
  return {sourcePartition: SOURCE, incarnation, after,
    through: position(last.sourceLogIndex, last.sourceOrdinal)};
}

function fixture(t, options = {}) {
  const clock = new VirtualTimeSource({startMs: 2000});
  const cache = new SystemTableCache({timeSource: clock});
  cache.logger = silent;
  cache.sourceOrder.logger = silent;
  const hosts = [0, 1].map((index) => {
    const host = new ApplicationHost();
    host.groupId = `r2-control-group-${index}`;
    host.logger = silent;
    host.isCurrentRaftLeader = () => true;
    host.cdcHandler = new CDCHandler(cache, {timeSource: clock, ...options});
    host.cdcHandler.logger = silent;
    host.cdcHandler.subscribe(TABLE);
    return host;
  });
  t.after(() => hosts.forEach((host) => host.cdcHandler.shutdown()));
  cache.sourceOrder.requireListed(SOURCE, TABLE);
  const install = (rows = [], index = 10, incarnation = INCARNATION, token = null) => {
    const imageToken = token ?? cache.sourceOrder.beginImage(SOURCE);
    assert.ok(imageToken, 'image begins against the actual source GAP');
    return installSourceImage(cache, imageToken, {sourcePartition: SOURCE, tableName: TABLE,
      incarnation, appliedIndex: index, rows});
  };
  const commit = (events, range = rangeOf(events, imagePosition(10)), host = hosts[0]) => {
    const effects = {afterCommit: [], afterRollback: []};
    host.applyCommittedEntry({index: 1, term: 1, effects,
      command: {type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events, sourceRange: range}}, null);
    for (const effect of effects.afterCommit) effect();
    return range;
  };
  const provisional = (event, host = hosts[0], range = rangeOf([event])) =>
    host.cdcHandler.applyImmediate(event, {sourceRange: range});
  return {cache, clock, hosts, install, commit, provisional};
}

function assertImagePrefix(f, index = 10) {
  assert.deepEqual(f.cache.sourceOrder.positionOf(SOURCE).position, imagePosition(index));
  assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'current');
}

for (const clearReceipts of [false, true]) {
  test(`image coverage survives receipt removal=${clearReceipts} and empty/equal replacement`, (t) => {
    const f = fixture(t);
    const inserted = eventOf(CDC_OPERATION.INSERT, 8);
    const deleted = eventOf(CDC_OPERATION.DELETE, 9);
    assert.equal(f.provisional(inserted), true);
    assert.equal(f.provisional(deleted), true);
    assert.equal(f.cache.tombstoneStore.tables.get(TABLE).has(KEY), true,
      'the real deletion fence engages before the empty image');
    const installed = f.install();
    assert.equal(installed.upserted + installed.deleted, 0);
    const handler = f.hosts[0].cdcHandler;
    assert.equal(handler.processedEventIds.has(handler.generateEventId(inserted)), true);
    if (clearReceipts) {
      // The historical r1 counterfactual revoked these non-prefix caches.
      handler.processedEventIds.clear();
      f.cache.sourceOrder.tables.delete(TABLE);
      f.cache.tombstoneStore.clearKey(TABLE, KEY);
    }
    assert.equal(f.provisional(inserted), false);
    assert.equal(f.cache.has(TABLE, KEY), false);
    f.commit([inserted, deleted], rangeOf([inserted, deleted], position(7)));
    assert.equal(f.cache.has(TABLE, KEY), false);
    assertImagePrefix(f);
  });
}

test('another handler buffer captures its original range and stays covered across image', (t) => {
  const f = fixture(t);
  const inserted = eventOf(CDC_OPERATION.INSERT, 8);
  f.provisional(inserted);
  const range = rangeOf([inserted]);
  const handler = f.hosts[1].cdcHandler;
  assert.equal(handler.handleEvent(inserted, {sourceRange: range}), true);
  assert.equal(handler.eventBuffer.get(TABLE).length, 1);
  range.incarnation = 'caller-mutated-after-buffer';
  assert.equal(f.install().deleted, 1);
  handler.flushBuffer(TABLE);
  assert.equal(f.cache.has(TABLE, KEY), false);
  assertImagePrefix(f);
});

test('real ID eviction and real tombstone expiry cannot reopen the source image prefix', (t) => {
  const f = fixture(t, {maxProcessedEventIds: 2});
  const inserted = eventOf(CDC_OPERATION.INSERT, 8);
  f.provisional(inserted);
  f.provisional(eventOf(CDC_OPERATION.DELETE, 9));
  assert.equal(f.cache.tombstoneStore.tables.get(TABLE).has(KEY), true);
  f.clock.advance(31000);
  f.cache.tombstoneStore.prune(TABLE, f.cache.tombstoneStore.tables.get(TABLE));
  assert.equal(f.cache.tombstoneStore.tables.get(TABLE).has(KEY), false, 'TTL actually evicts');
  f.install();
  f.provisional(eventOf(CDC_OPERATION.INSERT, 13, 'eviction-one'));
  f.provisional(eventOf(CDC_OPERATION.INSERT, 14, 'eviction-two'));
  assert.equal(f.hosts[0].cdcHandler.processedEventIds.has(
    f.hosts[0].cdcHandler.generateEventId(inserted)), false, 'bounded IDs actually evict');
  assert.equal(f.provisional(inserted), false);
  assert.equal(f.cache.has(TABLE, KEY), false);
  assertImagePrefix(f);
});

test('image clears obsolete authoritative absence and all table clock fences', (t) => {
  const f = fixture(t);
  f.provisional(eventOf(CDC_OPERATION.INSERT, 8));
  const oldToken = f.cache.sourceOrder.beginImage(SOURCE);
  const snapshot = f.cache.captureTableMutationSnapshot(TABLE);
  assert.equal(f.cache.reconcileAgainstAuthoritativeTruth({[TABLE]: []}, {
    mutationSnapshots: {[TABLE]: snapshot}, authoritativeObservedAtMs: 2000,
  }).removed.length, 1);
  assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), 2000);
  assert.equal(f.install([], 10, INCARNATION, oldToken).admission, 'cell_changed',
    'the authority mutation invalidates an already staged image token');
  assert.equal(f.install().admission, 'install');
  assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), null);
  assert.equal(f.cache.tombstoneStore.tables.get(TABLE).has(KEY), false);
  const restoring = eventOf(CDC_OPERATION.INSERT, 11, KEY, 0, {status: 'ready'});
  f.commit([restoring]);
  assert.equal(f.cache.get(TABLE, KEY).status, 'ready');
  assert.deepEqual(f.cache.sourceOrder.positionOf(SOURCE).position, position(11));
});

test('every synchronous image observer sees the complete table and prefix, including equal keys', (t) => {
  const f = fixture(t);
  const rowA = eventOf(CDC_OPERATION.INSERT, 8, 'a').data;
  const rowB = eventOf(CDC_OPERATION.INSERT, 8, 'b').data;
  f.provisional(eventOf(CDC_OPERATION.INSERT, 8, 'a'));
  const seen = [];
  const observe = () => seen.push({keys: f.cache.getAll(TABLE).map((row) => row.node_id).sort(),
    position: f.cache.sourceOrder.positionOf(SOURCE).position});
  f.cache.sourceOrder.onCurrent(observe);
  f.cache.onCacheApplyChange(observe);
  f.cache.onCacheApplyChange(() => { throw new Error('controlled image observer failure'); });
  f.cache.sourceOrder.onCurrent(() => { throw new Error('controlled current observer failure'); });
  assert.equal(f.install([rowA, rowB]).admission, 'install');
  assert.ok(seen.length >= 2, 'both source-current and row observers engaged');
  for (const snapshot of seen) assert.deepEqual(snapshot,
    {keys: ['a', 'b'], position: imagePosition(10)});
  assertImagePrefix(f);
});

for (const reenter of ['clear', 'generic-write', 'new-image']) {
  test(`reentrant ${reenter} cannot let an old vector advance a replacement cell`, (t) => {
    const f = fixture(t);
    f.install();
    let engaged = 0;
    f.cache.onCacheApplyChange(() => {
      if (engaged++ !== 0) return;
      if (reenter === 'clear') f.cache.clear();
      else if (reenter === 'generic-write') {
        f.cache.applySystemTableChange(TABLE, CDC_OPERATION.UPSERT,
          eventOf(CDC_OPERATION.UPSERT, 20, 'other-authority').data);
      } else {
        f.cache.sourceOrder.recordGap({sourcePartition: SOURCE, incarnation: INCARNATION,
          through: position(20)}, TABLE);
        f.install([], 20);
      }
    });
    const members = [eventOf(CDC_OPERATION.INSERT, 11),
      eventOf(CDC_OPERATION.INSERT, 11, 'second-member', 1)];
    f.commit(members);
    assert.ok(engaged > 0, 'the real synchronous observer reentered');
    const cell = f.cache.sourceOrder.positionOf(SOURCE);
    if (reenter === 'new-image') {
      assertImagePrefix(f, 20);
      assert.equal(f.cache.has(TABLE, 'second-member'), false);
    } else {
      assert.equal(cell.state, 'gap');
      assert.equal(cell.position, null);
      assert.equal(cell.relist, 'no_relister', 'debt remains typed until the real relister binds');
    }
  });
}

test('late complete-table snapshot cannot sweep a replacement image, including equal-value rows', (t) => {
  const f = fixture(t);
  const row = eventOf(CDC_OPERATION.INSERT, 8).data;
  f.provisional(eventOf(CDC_OPERATION.INSERT, 8));
  const beforeRead = f.cache.captureTableMutationSnapshot(TABLE);
  f.install([row]);
  const result = f.cache.reconcileAgainstAuthoritativeTruth({[TABLE]: []}, {
    mutationSnapshots: {[TABLE]: beforeRead}, authoritativeObservedAtMs: 9000,
  });
  assert.equal(result.removed.length, 0);
  assert.equal(f.cache.has(TABLE, KEY), true);
  assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), null);
  assertImagePrefix(f);
});

test('malformed complete vectors refuse before any member effect or group receipt', (t) => {
  const f = fixture(t);
  f.install();
  const event = eventOf(CDC_OPERATION.INSERT, 11);
  const good = rangeOf([event], imagePosition(10));
  const badVectors = [
    [[event, {...event, eventKey: 'other', sourceOrdinal: 0}], good],
    [[{...event, sourcePartition: 'another-source'}], good],
    [[{...event, tableName: TABLES.SERVICES}], good],
    [[{...event, tableName: TABLES.SERVICES}], {...good, through: position(12)}],
    [[event], {...good, incarnation: null}],
    [[event], {...good, after: position(12), through: position(13)}],
    [[{...event, sourceLogIndex: undefined}], good],
  ];
  for (const [events, sourceRange] of badVectors) {
    let applied = 0;
    const committed = {command: {sourceRange}, index: 1, effects: {afterCommit: []}};
    assert.throws(() => applyCommittedCdcRange(f.hosts[0], committed, events,
      () => { applied += 1; }));
    assert.equal(applied, 0);
    assert.equal(committed.effects.afterCommit.length, 0);
    assertImagePrefix(f);
  }
  assert.throws(() => f.hosts[0].cdcHandler.applyImmediate(event));
  assert.equal(f.cache.has(TABLE, KEY), false, 'missing range never becomes ordinary delivery');
});

test('a boolean callback cannot certify an effect; a later bound relister repairs its debt', async (t) => {
  const f = fixture(t);
  f.install();
  const event = eventOf(CDC_OPERATION.INSERT, 11);
  const range = rangeOf([event], imagePosition(10));
  const committed = {command: {sourceRange: range}, index: 1, effects: {afterCommit: []}};
  const outcome = applyCommittedCdcRange(f.hosts[0], committed, [event], () => true);
  assert.equal(outcome.decision, 'gap');
  assert.deepEqual(f.cache.sourceOrder.positionOf(SOURCE).position, imagePosition(10));
  for (const effect of committed.effects.afterCommit) effect();
  assert.equal(classifyDurableRangeAtLeader(f.hosts[0], range, TABLE).decision, 'already_applied',
    'group receipt is distinct from this member cache debt');
  let relists = 0;
  const repaired = Promise.withResolvers();
  f.cache.sourceOrder.registerRelister(() => {
    relists += 1;
    f.install([event.data], 11);
    repaired.resolve();
    return 'stopped';
  }, silent);
  await repaired.promise;
  assert.equal(relists, 1);
  assert.equal(f.cache.has(TABLE, KEY), true);
  assertImagePrefix(f, 11);
});

test('an occurrence from a different ledger cannot reuse old coverage', (t) => {
  const f = fixture(t);
  f.install();
  const event = eventOf(CDC_OPERATION.INSERT, 8);
  const wrongRange = rangeOf([event], position(7), 'different-ledger');
  const outcome = f.cache.applySourceCdcEvent(event, wrongRange, f.clock.now());
  assert.equal(outcome.state, SOURCE_EFFECT_STATE.UNAVAILABLE);
  assert.equal(f.cache.has(TABLE, KEY), false);
  assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
  assert.equal(f.cache.sourceOrder.positionOf(SOURCE).incarnation, 'different-ledger');
});

test('null, stale, wrong-table and foreign source contexts cannot bypass invalidation', (t) => {
  const f = fixture(t);
  const foreign = fixture(t);
  const stale = f.cache.sourceOrder.captureEffectContext(SOURCE, TABLE, INCARNATION);
  f.install();
  foreign.install();
  const wrongTable = f.cache.sourceOrder.captureEffectContext(
    INITIAL_PARTITION_IDS.services, TABLES.SERVICES, INCARNATION);
  const otherCache = foreign.cache.sourceOrder.captureEffectContext(SOURCE, TABLE, INCARNATION);
  const event = eventOf(CDC_OPERATION.INSERT, 11);
  for (const sourceEffectContext of [null, stale, wrongTable, otherCache]) {
    assert.equal(f.cache.applySystemTableChange(TABLE, event.operation, event.data, {
      ...event, sourceIncarnation: INCARNATION, sourceEffectContext,
    }), false);
    assert.equal(f.cache.has(TABLE, KEY), false);
    assertImagePrefix(f);
  }
});

function integrationWithImage(t, f, row, index, beforeRead = null) {
  const installed = Promise.withResolvers();
  const failures = Promise.withResolvers();
  let reads = 0;
  const service = new CDCIntegrationService({nodeId: 'r2-recovery-recipient',
    systemTableCache: f.cache, timeSource: f.clock,
    sqlQueryEngine: {queryExecutor: {executeOnPartition: async (_partition, _sql, _params,
      _forRead, _preferLeader, _sameGroup, options) => {
      reads += 1;
      beforeRead?.(reads);
      return options.buildSuccessResult({rows: [row],
        sourceImage: {sourcePartition: SOURCE, incarnation: INCARNATION, appliedIndex: index},
        imagePage: {imageId: 'r2-recovery-image', page: 0, last: true, byteCount: 256},
        readAuthorityWitness: {state: 'observed', partitionId: SOURCE, role: 'leader',
          servingNodeId: 'r2-source', servingReplicaId: 'r2-source-replica',
          observedAtMs: 3000, term: 1, appliedIndex: index, commitIndex: index}});
    }}}});
  service.logger = {...silent, error(_message, fields) { failures.resolve(fields); },
    info(_message, fields) {
      if (fields?.tableName === TABLE && fields.outcome === 'install') installed.resolve(fields);
    }};
  t.after(() => service.markShuttingDown());
  return {service, installed: installed.promise, failures: failures.promise, reads: () => reads};
}

test('paused keyed repair crossing image and newer durable event leaves real re-list debt', async (t) => {
  const f = fixture(t);
  const oldRow = eventOf(CDC_OPERATION.UPSERT, 8).data;
  f.install([oldRow]);
  const latest = eventOf(CDC_OPERATION.UPSERT, 21, KEY, 0, {status: 'ready'});
  const recovery = integrationWithImage(t, f, latest.data, 21);
  const heldRead = Promise.withResolvers();
  recovery.service.executeAuthoritativeSystemTableRead = () => heldRead.promise;
  const repair = recovery.service.refreshAuthoritativeCacheRow(TABLE, KEY);
  f.cache.sourceOrder.recordGap({sourcePartition: SOURCE, incarnation: INCARNATION,
    through: position(20)}, TABLE);
  f.install([eventOf(CDC_OPERATION.UPSERT, 20).data], 20);
  f.commit([latest], rangeOf([latest], imagePosition(20)));
  assert.equal(f.cache.get(TABLE, KEY).status, 'ready');
  assert.deepEqual(f.cache.sourceOrder.positionOf(SOURCE).position, position(21));
  heldRead.resolve({success: true, rows: [oldRow]});
  assert.equal(await repair, false);
  assert.equal(f.cache.get(TABLE, KEY).status, 'ready', 'late keyed read does not erase newer effect');
  const gapped = f.cache.sourceOrder.positionOf(SOURCE);
  assert.equal(gapped.state, 'gap');
  assert.equal(gapped.position, null, 'point repair cannot publish complete source currency');
  assert.equal(f.hosts[0].cdcHandler.processedEventIds.has(
    f.hosts[0].cdcHandler.generateEventId(latest)), true, 'delivery identity remains diagnostic');
  recovery.service.initialize();
  await recovery.installed;
  assert.equal(recovery.reads(), 1, 'existing relister repairs without any new CDC event');
  assert.equal(f.cache.get(TABLE, KEY).status, 'ready');
  assertImagePrefix(f, 21);
});

for (const diagnosticFailure of ['none', 'error', 'info']) {
  test(`unexpected image read throw keeps paced recovery with ${diagnosticFailure} diagnostic failure`,
    async (t) => {
      const f = fixture(t);
      const row = eventOf(CDC_OPERATION.INSERT, 11).data;
      const recovery = integrationWithImage(t, f, row, 11, (reads) => {
        if (reads === 1) throw new Error('controlled first image read failure');
      });
      const logger = recovery.service.logger;
      const observed = [];
      let diagnosticThrows = 0;
      recovery.service.logger = {...logger,
        error(message, fields) {
          logger.error(message, fields);
          if (diagnosticFailure === 'error') {
            diagnosticThrows += 1;
            throw new Error('controlled relist error diagnostic');
          }
        },
        info(message, fields) {
          observed.push(fields);
          if (diagnosticFailure === 'info' && fields.outcome === 'retry') {
            diagnosticThrows += 1;
            throw new Error('controlled relist info diagnostic');
          }
          logger.info(message, fields);
        },
      };
      recovery.service.initialize();
      const failure = await recovery.failures;
      assert.equal(failure.error, 'controlled first image read failure');
      assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
      assert.equal(recovery.reads(), 1, 'a failure does not spin another immediate read');
      assert.equal(recovery.service.relistImageSlots.held, 0, 'the failed attempt releases its slot');
      if (diagnosticFailure !== 'none') assert.equal(diagnosticThrows, 1);
      if (diagnosticFailure === 'error') {
        const retry = observed.find((fields) => fields.outcome === 'retry');
        assert.equal(retry.lastFailure.error, 'controlled first image read failure');
        assert.equal(retry.diagnosticFailures, 1);
        assert.equal(retry.lastDiagnosticError, 'controlled relist error diagnostic');
      }
      f.clock.advance(500);
      await recovery.installed;
      assert.equal(recovery.reads(), 2);
      assert.equal(f.cache.has(TABLE, KEY), true);
      assertImagePrefix(f, 11);
    });
}

test('throwing handler listener cannot turn a refused vector into current source currency', async (t) => {
  const f = fixture(t);
  f.install();
  const event = eventOf(CDC_OPERATION.INSERT, 11);
  const recovery = integrationWithImage(t, f, event.data, 11);
  f.hosts[0].cdcHandler.on('eventApplied', () => { throw new Error('controlled handler listener'); });
  assert.throws(() => f.commit([event]), /controlled handler listener/u);
  assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
  assert.deepEqual(f.cache.sourceOrder.positionOf(SOURCE).position, imagePosition(10));
  recovery.service.initialize();
  await recovery.installed;
  assertImagePrefix(f, 11);
});
