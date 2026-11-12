// Repair controls derived from the preserved R2 diagnostics at 57e396e4.
// The historical expected-defect version remains in that immutable snapshot.
// These assertions consume production cache/image/handler/range owners; only
// source delivery scheduling and the final committed-entry handoff are controlled.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_LOG_MSG} from '../../src/cache/cache-constants.js';
import {installSourceImage} from '../../src/cache/system-table-cache-source-image.js';
import {SOURCE_EFFECT_STATE} from '../../src/cache/system-table-cache-source-order.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SOURCE_RELIST_BOUND, registerSourceRelister, relistSourceTable} from
  '../../src/cdc/cdc-integration-service-source-relist.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {CDC_EVENT_IDENTITY} from '../../src/constants/cdc-lifecycle-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE, CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PHASE_SCOPE, CONTROL_PLANE_READ_LEADER_MODE, CONTROL_PLANE_READ_STRATEGY,
  ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {applyCommittedCdcRange, classifyDurableRangeAtLeader} from
  '../../src/message-group/message-group-cdc-source-range.js';
import {assignRaftTiming} from '../../src/message-group/message-group-service-raft-timing.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {replacePrototypeProperty, withHostileIntrinsics} from '../helpers/hostile-intrinsics.js';

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

for (const transition of ['unchanged', 'clear', 'foreign-cache']) {
  test(`complete observation before a source cell binds its exact cache generation: ${transition}`,
    async () => {
      const cache = new SystemTableCache();
      const heldRead = Promise.withResolvers();
      const readStarted = Promise.withResolvers();
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'pre-cell-reader', systemTableCache: cache, now: () => 2000,
        cdcIntegrationService: {cacheMutationTarget: cache,
          executeAuthoritativeSystemTableRead() {
            readStarted.resolve();
            return heldRead.promise;
          }},
      });
      const before = cache.sourceOrder.tableGeneration(TABLE);
      assert.equal(cache.sourceOrder.cells.size, 0, 'the observation truly starts before any cell');
      const read = gateway.executeRead({tableName: TABLE, sql: `SELECT * FROM ${TABLE}`,
        params: [], strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED},
      {sessionId: 'pre-cell-complete-read', authoritativeObservationScope:
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE});
      await readStarted.promise;
      if (transition === 'clear') cache.clear();
      const target = transition === 'foreign-cache' ? new SystemTableCache() : cache;
      if (transition === 'unchanged') assert.equal(target.sourceOrder.tableGeneration(TABLE), before);
      else assert.notEqual(target.sourceOrder.tableGeneration(TABLE), before,
        'the changed owner or lifetime actually changes the generation');
      heldRead.resolve({success: true, rows: [], rowSetComplete: true,
        readAuthorityWitness: {state: 'observed', partitionId: SOURCE, role: 'leader',
          servingNodeId: 'pre-cell-source', servingReplicaId: 'pre-cell-source-r1',
          observedAtMs: 2000, term: 1, appliedIndex: 0, commitIndex: 0}});
      const result = await read;
      assert.equal(result.success, true, 'the actual gateway minted complete source evidence');
      const reconciled = await gateway.reconcileAuthoritativeCacheRows(TABLE, result.rows, {
        cacheMutationTarget: target, systemTableCache: target, cachedRows: [],
        authoritativeObservation: result.authoritativeObservation,
      });
      assert.equal(reconciled.success, transition === 'unchanged');
      assert.equal(target.getLastAuthoritativeObservedAtMs(TABLE),
        transition === 'unchanged' ? 2000 : null);
      if (transition !== 'unchanged') assert.equal(reconciled.error,
        CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR.CACHE_NOT_RECONCILED);
      assert.equal(target.sourceOrder.cells.size, 0, 'observation does not invent source currency');
    });
}

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
  const recovery = integrationWithImage(t, f, event.data, 11);
  registerSourceRelister(recovery.service);
  await recovery.installed;
  assert.equal(recovery.reads(), 1);
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

for (const reentry of ['image', 'authority']) {
  test(`a ${reentry} installed by a diagnostic callback cannot retain displaced key evidence`, (t) => {
    const f = fixture(t);
    f.install([], 9);
    const event = eventOf(CDC_OPERATION.DELETE, 11);
    const range = rangeOf([event], imagePosition(9));
    const row = eventOf(CDC_OPERATION.INSERT, 8).data;
    let reentered = 0;
    f.cache.logger = {...silent, debug(message) {
      if (message !== CACHE_LOG_MSG.DELETE_ON_MISSING_KEY_IGNORED || reentered !== 0) return;
      reentered += 1;
      if (reentry === 'image') {
        f.cache.sourceOrder.recordGap(range, TABLE);
        f.install([row], 10);
      } else {
        f.cache.applySystemTableChange(TABLE, CDC_OPERATION.UPSERT,
          eventOf(CDC_OPERATION.UPSERT, 20).data);
      }
    }};
    assert.equal(f.cache.applySourceCdcEvent(event, range, f.clock.now()).state,
      SOURCE_EFFECT_STATE.UNAVAILABLE);
    assert.equal(reentered, 1, 'the real delete-absent diagnostic reentered before evidence retention');
    assert.equal(f.cache.sourceOrder.tables.get(TABLE)?.has(KEY) ?? false, false,
      'displaced context cannot certify effects in a later generation');
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
    if (reentry === 'image') {
      assert.equal(f.cache.has(TABLE, KEY), true, 'the replacement image contains the pre-delete row');
      f.cache.logger = silent;
      f.commit([event], rangeOf([event], imagePosition(10)));
      assert.equal(f.cache.has(TABLE, KEY), false, 'the committed replay performs its missing deletion');
      assert.deepEqual(f.cache.sourceOrder.positionOf(SOURCE).position, position(11));
      assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'current');
    }
  });
}

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
  const readStarted = Promise.withResolvers();
  recovery.service.executeAuthoritativeSystemTableRead = () => {
    readStarted.resolve();
    return heldRead.promise;
  };
  const repair = recovery.service.refreshAuthoritativeCacheRow(TABLE, KEY);
  await readStarted.promise;
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
      const cause = new Error('controlled first image read failure');
      const diagnosticCause = new Error('controlled relist error diagnostic');
      const recovery = integrationWithImage(t, f, row, 11, (reads) => {
        if (reads === 1) throw cause;
      });
      const logger = recovery.service.logger;
      const observed = [];
      let diagnosticThrows = 0;
      recovery.service.logger = {...logger,
        error(message, fields) {
          logger.error(message, fields);
          if (diagnosticFailure === 'error') {
            diagnosticThrows += 1;
            throw diagnosticCause;
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
      assert.equal(failure.error, cause);
      assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
      assert.equal(recovery.reads(), 1, 'a failure does not spin another immediate read');
      assert.equal(recovery.service.relistImageSlots.held, 0, 'the failed attempt releases its slot');
      if (diagnosticFailure !== 'none') assert.equal(diagnosticThrows, 1);
      if (diagnosticFailure === 'error') {
        const retry = observed.find((fields) => fields.outcome === 'retry');
        assert.equal(retry.lastFailure.error, cause);
        assert.equal(retry.diagnosticFailures, 1);
        assert.equal(retry.lastDiagnosticError, diagnosticCause);
      }
      f.clock.advance(500);
      await recovery.installed;
      assert.equal(recovery.reads(), 2);
      assert.equal(f.cache.has(TABLE, KEY), true);
      assertImagePrefix(f, 11);
    });
}

for (const shape of ['message-getter', 'conversion']) {
  test(`image failure records preserve hostile ${shape} causes without engaging them`, async (t) => {
    const f = fixture(t);
    let engagements = 0;
    const hostileCause = () => shape === 'message-getter' ? Object.defineProperty({}, 'message', {
      get() { engagements += 1; throw new Error('message must not be read'); },
    }) : {toString() { engagements += 1; throw new Error('cause must not be converted'); }};
    const cause = hostileCause();
    const diagnosticCause = hostileCause();
    const recovery = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 11).data, 11,
      (reads) => { if (reads === 1) throw cause; });
    const observed = [];
    const errors = [];
    const logger = recovery.service.logger;
    recovery.service.logger = {...logger,
      error(_message, fields) { errors.push(fields); throw diagnosticCause; },
      info(message, fields) { observed.push(fields); logger.info(message, fields); },
    };
    registerSourceRelister(recovery.service);
    await nextTurn();
    assert.equal(engagements, 0, 'recording original causes invokes no user conversion or getter');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].error, cause);
    const retry = observed.find((fields) => fields.outcome === 'retry');
    assert.equal(retry.lastFailure.error, cause);
    assert.equal(retry.restarts, 1);
    assert.equal(retry.diagnosticFailures, 1);
    assert.equal(retry.lastDiagnosticError, diagnosticCause);
    assert.equal(recovery.reads(), 1, 'the error does not start an unpaced attempt');
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
    assert.equal(recovery.service.relistImageSlots.held, 0);
    f.clock.advance(500);
    await recovery.installed;
    assert.equal(engagements, 0);
    assert.equal(recovery.reads(), 2);
    assertImagePrefix(f, 11);
    assert.equal(recovery.service.shutdownReleases.size, 0);
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

// The following discriminators were frozen before the outer-relister repair.
// They enter the real production registration and CDCIntegrationService clock,
// shutdown and image owners. Only the query transport and clock fault are held.
test('an escaping image-attempt failure retains its cause and uses the owner pace', async (t) => {
  const f = fixture(t);
  const recovery = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 11).data, 11);
  const cause = new Error('source image start clock failed');
  const now = f.clock.now.bind(f.clock);
  const setTimeout = f.clock.setTimeout.bind(f.clock);
  const delays = [];
  let failed = false;
  f.clock.now = () => {
    if (!failed) { failed = true; throw cause; }
    return now();
  };
  f.clock.setTimeout = (callback, delay) => {
    delays.push(delay);
    return setTimeout(callback, delay);
  };
  registerSourceRelister(recovery.service);
  await nextTurn();
  const waiting = f.cache.sourceOrder.positionOf(SOURCE);
  assert.equal(waiting.state, 'gap');
  assert.equal(waiting.relist, 'running', 'the failed attempt still owns its paced continuation');
  assert.equal(waiting.relistFailures, 1);
  assert.equal(waiting.lastRelistFailure.cause, cause, 'retain the actual original exception');
  assert.deepEqual(delays, [500], 'the existing shutdown-aware clock owns the only delay');
  assert.equal(recovery.reads(), 0);
  f.clock.advance(499);
  await nextTurn();
  assert.equal(recovery.reads(), 0, 'no retry before the existing pace expires');
  f.clock.advance(1);
  await nextTurn();
  assert.equal(recovery.reads(), 1);
  assertImagePrefix(f, 11);
  assert.equal(recovery.service.shutdownReleases.size, 0);
});

for (const wake of ['registration', 'new-gap']) {
  test(`a failed relist clock retains FAULTED debt until ${wake} wakes its healed owner`, async (t) => {
    const f = fixture(t);
    const recovery = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 12).data, 12);
    const cause = new Error('source image start clock failed');
    const pacingCause = new Error('source image retry clock failed');
    const now = f.clock.now.bind(f.clock);
    const setTimeout = f.clock.setTimeout.bind(f.clock);
    let failed = false;
    let pacingCalls = 0;
    f.clock.now = () => {
      if (!failed) { failed = true; throw cause; }
      return now();
    };
    f.clock.setTimeout = () => { pacingCalls += 1; throw pacingCause; };
    registerSourceRelister(recovery.service);
    await nextTurn();
    const faulted = f.cache.sourceOrder.positionOf(SOURCE);
    assert.equal(faulted.state, 'gap');
    assert.equal(faulted.relist, 'faulted', 'a broken sole clock is not terminal owner state');
    assert.equal(faulted.relistFailures, 1);
    assert.equal(faulted.lastRelistFailure.cause, cause);
    assert.equal(faulted.lastRelistFailure.pacingCause, pacingCause);
    assert.equal(pacingCalls, 1, 'pacing failure does not spin or introduce a second clock');
    assert.equal(recovery.service.shutdownReleases.size, 0, 'failed timer acquisition releases custody');
    assert.equal(recovery.reads(), 0);
    f.clock.setTimeout = setTimeout;
    if (wake === 'registration') registerSourceRelister(recovery.service);
    else f.cache.sourceOrder.recordGap(rangeOf([eventOf(CDC_OPERATION.INSERT, 12)]), TABLE);
    await nextTurn();
    assert.equal(recovery.reads(), 1);
    assertImagePrefix(f, 12);
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).relist, 'idle');
  });
}

// Source-order's independent STOPPED validation consumes the required owner
// record directly. Production registration lifecycle is tested separately.
function registerDirectRelisterOwner(service) {
  return service.cacheMutationTarget.sourceOrder.registerRelister({
    list: (request) => relistSourceTable(service, request),
    isStopped: () => service.isShuttingDown === true,
    paceAfterFailure: () => service.delayUntilShutdown(SOURCE_RELIST_BOUND.RELIST_RETRY_DELAY_MS),
  }, service.logger);
}

for (const terminal of [false, true]) {
  test(`STOPPED is accepted only from an actually terminal relister: ${terminal}`, async (t) => {
    const f = fixture(t);
    const recovery = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 11).data, 11);
    const refuse = recovery.service.refuseIfTerminal.bind(recovery.service);
    let first = true;
    if (terminal) recovery.service.markShuttingDown();
    else recovery.service.refuseIfTerminal = (...args) => {
      if (first) { first = false; return new Error('false terminal answer'); }
      return refuse(...args);
    };
    registerDirectRelisterOwner(recovery.service);
    await nextTurn();
    const cell = f.cache.sourceOrder.positionOf(SOURCE);
    assert.equal(cell.state, 'gap', 'neither terminal answer fabricates current currency');
    assert.equal(cell.relist, terminal ? 'idle' : 'running');
    assert.equal(recovery.reads(), 0);
    assert.equal(recovery.service.shutdownReleases.size, terminal ? 0 : 1);
    f.clock.advance(500);
    await nextTurn();
    assert.equal(recovery.reads(), terminal ? 0 : 1);
    if (terminal) assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
    else assertImagePrefix(f, 11);
  });
}

for (const completion of ['clock', 'shutdown']) {
  test(`the existing retry delay releases its exact registration on ${completion}`, async (t) => {
    const f = fixture(t);
    const recovery = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 11).data, 11);
    let completed = false;
    const pending = recovery.service.delayUntilShutdown(500).then(() => { completed = true; });
    assert.equal(recovery.service.shutdownReleases.size, 1);
    assert.equal(f.clock.pendingTimerCount(), 1);
    if (completion === 'clock') f.clock.advance(500);
    else recovery.service.markShuttingDown();
    await pending;
    assert.equal(completed, true);
    assert.equal(recovery.service.shutdownReleases.size, 0);
    assert.equal(f.clock.pendingTimerCount(), 0);
  });
}

test('a failed retry cancellation rejects its delay and still releases the next shutdown wait',
  async (t) => {
    const f = fixture(t);
    const recovery = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 11).data, 11);
    const cancellationCause = new Error('retry timer cancellation failed');
    const clearTimeout = f.clock.clearTimeout.bind(f.clock);
    let clears = 0;
    f.clock.clearTimeout = (timer) => {
      clears += 1;
      if (clears === 1) throw cancellationCause;
      return clearTimeout(timer);
    };
    const first = recovery.service.delayUntilShutdown(500).then(
      () => ({state: 'released'}), (cause) => ({state: 'failed', cause}));
    const second = recovery.service.delayUntilShutdown(500).then(
      () => ({state: 'released'}), (cause) => ({state: 'failed', cause}));
    assert.equal(f.clock.pendingTimerCount(), 2);
    assert.doesNotThrow(() => recovery.service.markShuttingDown());
    assert.deepEqual(await first, {state: 'failed', cause: cancellationCause});
    assert.deepEqual(await second, {state: 'released'});
    assert.equal(recovery.service.shutdownReleases.size, 0);
    assert.equal(f.clock.pendingTimerCount(), 1,
      'the failed cancellation retains the actual original timer, not a clean-release claim');
    f.clock.clearTimeout = clearTimeout;
    f.clock.advance(500);
    await nextTurn();
    assert.equal(f.clock.pendingTimerCount(), 0, 'the original clock eventually fires that timer');
    assert.equal(recovery.reads(), 0);
  });

test('a failed cancellation of the relist pace retains FAULTED and both original causes',
  async (t) => {
    const f = fixture(t);
    const recovery = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 11).data, 11);
    const cause = new Error('image attempt clock failed before acquisition');
    const pacingCause = new Error('image retry timer cancellation failed');
    const now = f.clock.now.bind(f.clock);
    const clearTimeout = f.clock.clearTimeout.bind(f.clock);
    let failed = false;
    f.clock.now = () => {
      if (!failed) { failed = true; throw cause; }
      return now();
    };
    registerSourceRelister(recovery.service);
    await nextTurn();
    assert.equal(f.clock.pendingTimerCount(), 1);
    f.clock.clearTimeout = () => { throw pacingCause; };
    assert.doesNotThrow(() => recovery.service.markShuttingDown());
    await nextTurn();
    const cell = f.cache.sourceOrder.positionOf(SOURCE);
    assert.equal(cell.state, 'gap');
    assert.equal(cell.relist, 'faulted');
    assert.equal(cell.lastRelistFailure.cause, cause);
    assert.equal(cell.lastRelistFailure.pacingCause, pacingCause);
    assert.equal(recovery.service.shutdownReleases.size, 0);
    assert.equal(f.clock.pendingTimerCount(), 1);
    f.clock.clearTimeout = clearTimeout;
    f.clock.advance(500);
    await nextTurn();
    assert.equal(f.clock.pendingTimerCount(), 0);
    assert.equal(recovery.reads(), 0, 'firing the original timer cannot restart a terminal owner');
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).relist, 'faulted');
  });

test('registration while the old relister runs is delivered after its exact slot releases',
  async (t) => {
    const f = fixture(t);
    const row = eventOf(CDC_OPERATION.INSERT, 11).data;
    const oldOwner = integrationWithImage(t, f, row, 11);
    const newOwner = integrationWithImage(t, f, row, 11);
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    const executor = oldOwner.service.sqlQueryEngine.queryExecutor;
    const execute = executor.executeOnPartition.bind(executor);
    executor.executeOnPartition = async (...args) => {
      started.resolve();
      await release.promise;
      return execute(...args);
    };
    registerSourceRelister(oldOwner.service);
    await started.promise;
    const cell = f.cache.sourceOrder.cells.get(SOURCE);
    registerSourceRelister(newOwner.service);
    assert.equal(f.cache.sourceOrder.cells.get(SOURCE), cell, 'the same cell owes the continuation');
    assert.equal(newOwner.reads(), 0, 'registration does not run two attempts for one cell');
    oldOwner.service.markShuttingDown();
    release.resolve();
    await nextTurn();
    assert.equal(newOwner.reads(), 1, 'the new registration wake survives old terminal completion');
    assert.equal(oldOwner.service.relistImageSlots.held, 0);
    assert.equal(newOwner.service.relistImageSlots.held, 0);
    assertImagePrefix(f, 11);
  });

test('a live old relister cannot keep its retry loop after a newer owner registers', async (t) => {
  const f = fixture(t);
  const row = eventOf(CDC_OPERATION.INSERT, 11).data;
  const oldOwner = integrationWithImage(t, f, row, 11);
  const newOwner = integrationWithImage(t, f, row, 11);
  let refused = 0;
  oldOwner.service.sqlQueryEngine.queryExecutor.executeOnPartition = () => {
    refused += 1;
    return {success: false, errorCode: 'old_owner_source_unavailable'};
  };
  registerSourceRelister(oldOwner.service);
  await nextTurn();
  assert.equal(refused, 1);
  assert.equal(oldOwner.service.isShuttingDown, false);
  registerSourceRelister(newOwner.service);
  assert.equal(newOwner.reads(), 0, 'the existing running attempt still owns its pace');
  f.clock.advance(500);
  await nextTurn();
  assert.equal(refused, 1, 'the displaced owner cannot begin another fetch');
  assert.equal(newOwner.reads(), 1);
  assertImagePrefix(f, 11);
});

function pageFor(sourcePartition, rows, index = 11) {
  return {rows, sourceImage: {sourcePartition, incarnation: `owner-${sourcePartition}`,
    appliedIndex: index}, imagePage: {imageId: `image-${sourcePartition}-${index}`,
    page: 0, last: true, byteCount: 256},
  readAuthorityWitness: {state: 'observed', partitionId: sourcePartition, role: 'leader',
    servingNodeId: 'slot-source', servingReplicaId: `${sourcePartition}-r1`,
    observedAtMs: 2000, term: 1, appliedIndex: index, commitIndex: index}};
}

test('two unavailable sources release image slots before pacing so a third source progresses',
  async (t) => {
    const f = fixture(t);
    const second = INITIAL_PARTITION_IDS[TABLES.SERVICES];
    const third = INITIAL_PARTITION_IDS[TABLES.CONFIG];
    f.cache.sourceOrder.requireListed(second, TABLES.SERVICES);
    f.cache.sourceOrder.requireListed(third, TABLES.CONFIG);
    let healed = false;
    let peak = 0;
    const queries = [];
    const service = new CDCIntegrationService({nodeId: 'slot-recipient',
      systemTableCache: f.cache, timeSource: f.clock,
      sqlQueryEngine: {queryExecutor: {executeOnPartition(sourcePartition, _sql, _params,
        _forRead, _preferLeader, _sameGroup, options) {
        queries.push(sourcePartition);
        peak = Math.max(peak, service.relistImageSlots.held);
        if (!healed && sourcePartition !== third) {
          return {success: false, errorCode: 'source_owner_temporarily_unavailable'};
        }
        const rows = sourcePartition === third ?
          [{config_key: 'available-source', config_value: 'published'}] : [];
        return options.buildSuccessResult(pageFor(sourcePartition, rows));
      }}}});
    service.logger = silent;
    t.after(() => service.markShuttingDown());
    registerSourceRelister(service);
    await nextTurn();
    assert.equal(f.cache.get(TABLES.CONFIG, 'available-source')?.config_value, 'published',
      'the available owner can publish while the other two remain unavailable');
    assert.equal(f.cache.sourceOrder.positionOf(third).state, 'current');
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
    assert.equal(f.cache.sourceOrder.positionOf(second).state, 'gap');
    assert.equal(peak, 2, 'the actual two-slot bound is reached but never exceeded');
    assert.equal(service.relistImageSlots.held, 0, 'pacing retains no physical image slot');
    assert.equal(service.relistImageSlots.waiting.length, 0);
    assert.equal(queries.length, 3, 'unavailable owners do not spin during their pace');
    healed = true;
    f.clock.advance(500);
    await nextTurn();
    for (const sourcePartition of [SOURCE, second, third]) {
      assert.equal(f.cache.sourceOrder.positionOf(sourcePartition).state, 'current');
    }
    assert.equal(queries.length, 5, 'the same two owners resume on the original retry clock');
    assert.equal(service.relistImageSlots.held, 0);
    assert.equal(service.shutdownReleases.size, 0);
  });

test('shutdown removes a queued image acquisition before granting it any query custody', async (t) => {
  const f = fixture(t);
  f.cache.sourceOrder.requireListed(INITIAL_PARTITION_IDS[TABLES.SERVICES], TABLES.SERVICES);
  f.cache.sourceOrder.requireListed(INITIAL_PARTITION_IDS[TABLES.CONFIG], TABLES.CONFIG);
  const release = Promise.withResolvers();
  const queries = [];
  const service = new CDCIntegrationService({nodeId: 'queued-slot-recipient',
    systemTableCache: f.cache, timeSource: f.clock,
    sqlQueryEngine: {queryExecutor: {async executeOnPartition(sourcePartition, _sql, _params,
      _forRead, _preferLeader, _sameGroup, options) {
      queries.push(sourcePartition);
      await release.promise;
      return options.buildSuccessResult(pageFor(sourcePartition, []));
    }}}});
  service.logger = silent;
  t.after(() => service.markShuttingDown());
  try {
    registerSourceRelister(service);
    await nextTurn();
    assert.equal(queries.length, 2);
    assert.equal(service.relistImageSlots.held, 2);
    assert.equal(service.relistImageSlots.waiting.length, 1);
    service.markShuttingDown();
    await nextTurn();
    assert.equal(service.relistImageSlots.waiting.length, 0,
      'terminal queued work releases its existing acquisition registration');
    assert.equal(queries.length, 2);
    release.resolve();
    await nextTurn();
    assert.equal(service.relistImageSlots.held, 0);
    assert.equal(service.shutdownReleases.size, 0);
    assert.equal(queries.length, 2, 'a late grant cannot issue the queued terminal query');
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
  } finally {
    release.resolve();
    await nextTurn();
  }
});

test('a displaced source-cell attempt cannot fetch on behalf of a replacement relist', async (t) => {
  const f = fixture(t);
  const releases = [Promise.withResolvers(), Promise.withResolvers()];
  let queries = 0;
  const service = new CDCIntegrationService({nodeId: 'replaced-cell-recipient',
    systemTableCache: f.cache, timeSource: f.clock,
    sqlQueryEngine: {queryExecutor: {async executeOnPartition(sourcePartition, _sql, _params,
      _forRead, _preferLeader, _sameGroup, options) {
      const index = queries++;
      if (index < releases.length) await releases[index].promise;
      return options.buildSuccessResult(pageFor(sourcePartition, [], 10 + index));
    }}}});
  service.logger = silent;
  t.after(() => service.markShuttingDown());
  try {
    registerSourceRelister(service);
    await nextTurn();
    const oldCell = f.cache.sourceOrder.cells.get(SOURCE);
    f.cache.clear();
    f.cache.sourceOrder.requireListed(SOURCE, TABLE);
    await nextTurn();
    assert.notEqual(f.cache.sourceOrder.cells.get(SOURCE), oldCell);
    assert.equal(queries, 2, 'the replacement cell owns its distinct scheduled attempt');
    releases[0].resolve();
    await nextTurn();
    f.clock.advance(500);
    await nextTurn();
    assert.equal(queries, 2, 'the displaced attempt cannot borrow the replacement cell');
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
    releases[1].resolve();
    await nextTurn();
    assertImagePrefix(f, 11);
    assert.equal(service.relistImageSlots.held, 0);
  } finally {
    for (const release of releases) release.resolve();
    await nextTurn();
  }
});

for (const fault of ['warn-call', 'warn-property', 'message-property', 'conversion']) {
  test(`current listeners cannot strand publication when diagnostic observation fails: ${fault}`,
    (t) => {
      const f = fixture(t);
      const diagnosticFailure = new Error('observer diagnostic failed');
      let cause = new Error('source current listener failed');
      const logger = {...silent};
      if (fault === 'warn-call') logger.warn = () => { throw diagnosticFailure; };
      if (fault === 'warn-property') Object.defineProperty(logger, 'warn', {
        get() { throw diagnosticFailure; },
      });
      if (fault === 'message-property') Object.defineProperty(cause, 'message', {
        get() { throw diagnosticFailure; },
      });
      if (fault === 'conversion') {
        cause = {[Symbol.toPrimitive]() { throw diagnosticFailure; }};
        logger.warn = (_message, fields) => String(fields.error);
      }
      f.cache.sourceOrder.logger = logger;
      let observed = 0;
      f.cache.sourceOrder.onCurrent(() => { throw cause; });
      f.cache.sourceOrder.onCurrent(() => { observed += 1; });
      assert.doesNotThrow(() => f.install());
      assert.equal(observed, 1, 'a diagnostic cannot prevent the next actual currentness observer');
      assertImagePrefix(f);
    });
}

test('source singleton capture never consults the public array iterator', (t) => {
  const f = fixture(t);
  f.install();
  const event = eventOf(CDC_OPERATION.INSERT, 11);
  const range = rangeOf([event], imagePosition(10));
  const iterator = Array.prototype[Symbol.iterator];
  let consulted = 0;
  const result = withHostileIntrinsics([
    replacePrototypeProperty(Array.prototype, Symbol.iterator, function() {
      if (this[0]?.eventKey === event.eventKey) {
        consulted += 1;
        throw new Error('source singleton consulted public iterator');
      }
      return Reflect.apply(iterator, this, []);
    }),
  ], () => f.cache.applySourceCdcEvent(event, range, f.clock.now()));
  assert.equal(consulted, 0);
  assert.equal(result.state, SOURCE_EFFECT_STATE.APPLIED);
  assert.equal(f.cache.has(TABLE, KEY), true);
  assertImagePrefix(f, 10);
});

test('range comparison never consults a replaced Math.sign intrinsic', (t) => {
  const f = fixture(t);
  f.install();
  const event = eventOf(CDC_OPERATION.INSERT, 11);
  const sibling = eventOf(CDC_OPERATION.UPDATE, 11, KEY, 1, {status: 'ready'});
  const range = rangeOf([event, sibling], imagePosition(10));
  let consulted = 0;
  const result = withHostileIntrinsics([
    replacePrototypeProperty(Math, 'sign', () => {
      consulted += 1;
      throw new Error('source range consulted mutable comparison intrinsic');
    }),
  ], () => [f.cache.applySourceCdcEvent(event, range, f.clock.now()),
    f.cache.applySourceCdcEvent(sibling, range, f.clock.now())]);
  assert.equal(consulted, 0);
  assert.deepEqual(result.map((effect) => effect.state),
    [SOURCE_EFFECT_STATE.APPLIED, SOURCE_EFFECT_STATE.APPLIED]);
  assert.equal(f.cache.get(TABLE, KEY).status, 'ready');
  assertImagePrefix(f, 10);
});

test('unknown position reads never bind a source cell or change the table observation basis', (t) => {
  const f = fixture(t);
  const unknown = 'nodes-p2';
  const before = f.cache.sourceOrder.tableGeneration(TABLE);
  const count = f.cache.sourceOrder.cells.size;
  assert.equal(f.cache.sourceOrder.positionOf(unknown).state, 'unknown');
  assert.equal(f.cache.sourceOrder.cells.size, count);
  assert.equal(f.cache.sourceOrder.cells.has(unknown), false);
  assert.equal(f.cache.sourceOrder.tableGeneration(TABLE), before);
  assert.equal(f.install().admission, 'install');
  assertImagePrefix(f);
});

test('a noncanonical image source refuses before staging or changing any cell or table', (t) => {
  const f = fixture(t);
  const wrongSource = 'nodes-p2';
  const image = {sourcePartition: wrongSource, tableName: TABLE, incarnation: INCARNATION,
    appliedIndex: 10, rows: [eventOf(CDC_OPERATION.INSERT, 10).data]};
  const token = f.cache.sourceOrder.beginImage(SOURCE);
  const count = f.cache.sourceOrder.cells.size;
  const clone = f.cache.deepClone.bind(f.cache);
  let staged = 0;
  f.cache.deepClone = (...args) => { staged += 1; return clone(...args); };
  assert.throws(() => installSourceImage(f.cache, token, image),
    {code: CDC_EVENT_IDENTITY.INVALID_CODE});
  assert.equal(staged, 0);
  assert.equal(f.cache.sourceOrder.cells.size, count);
  assert.equal(f.cache.sourceOrder.cells.has(wrongSource), false);
  assert.equal(f.cache.has(TABLE, KEY), false);
  assert.equal(f.install(image.rows).admission, 'install');
  assertImagePrefix(f);
});

test('canonical source identity cannot be retargeted after cache construction', (t) => {
  const f = fixture(t);
  const original = INITIAL_PARTITION_IDS[TABLE];
  const wrongSource = 'nodes-p2';
  const count = f.cache.sourceOrder.cells.size;
  const basis = f.cache.sourceOrder.tableGeneration(TABLE);
  try {
    assert.throws(() => { INITIAL_PARTITION_IDS[TABLE] = wrongSource; }, TypeError);
    assert.equal(INITIAL_PARTITION_IDS[TABLE], original);
    const event = {...eventOf(CDC_OPERATION.INSERT, 11), sourcePartition: wrongSource};
    const range = {...rangeOf([event]), sourcePartition: wrongSource};
    assert.throws(() => f.cache.applySourceCdcEvent(event, range, f.clock.now()),
      {code: CDC_EVENT_IDENTITY.INVALID_CODE});
    assert.equal(f.cache.sourceOrder.cells.size, count);
    assert.equal(f.cache.sourceOrder.tableGeneration(TABLE), basis);
    assert.equal(f.cache.has(TABLE, KEY), false);
    f.install();
    f.commit([eventOf(CDC_OPERATION.INSERT, 11)]);
    assert.equal(f.cache.has(TABLE, KEY), true);
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'current');
    assert.deepEqual(f.cache.sourceOrder.positionOf(SOURCE).position, position(11));
  } finally {
    // The discriminator also runs against the historical mutable map. Restore
    // its exact original bytes after that assertion fails, for other controls.
    if (INITIAL_PARTITION_IDS[TABLE] !== original) INITIAL_PARTITION_IDS[TABLE] = original;
  }
});

function heldTargetRelister(t, f) {
  const queries = [];
  const service = new CDCIntegrationService({nodeId: 'target-replacement-recipient',
    cacheMutationTarget: f.cache, timeSource: f.clock,
    sqlQueryEngine: {queryExecutor: {async executeOnPartition(sourcePartition, _sql, _params,
      _forRead, _preferLeader, _sameGroup, options) {
      const index = 11 + queries.length;
      const release = Promise.withResolvers();
      queries.push({release, index});
      await release.promise;
      return options.buildSuccessResult(pageFor(sourcePartition,
        [eventOf(CDC_OPERATION.INSERT, index, KEY, 0, {status: 'ready'}).data], index));
    }}}});
  service.logger = silent;
  t.after(() => {
    service.markShuttingDown();
    for (const query of queries) query.release.resolve();
  });
  return {service, queries};
}

for (const change of ['replacement', 'removal']) {
  test(`a held source read loses its exact registration on cache target ${change}`, async (t) => {
    const f = fixture(t);
    const recovery = heldTargetRelister(t, f);
    const nextCache = new SystemTableCache({timeSource: f.clock});
    nextCache.logger = silent;
    nextCache.sourceOrder.logger = silent;
    nextCache.sourceOrder.requireListed(SOURCE, TABLE);
    recovery.service.initialize();
    await nextTurn();
    assert.equal(recovery.queries.length, 1);
    recovery.service.setCacheMutationTarget(change === 'replacement' ? nextCache : null);
    await nextTurn();
    assert.equal(recovery.queries.length, change === 'replacement' ? 2 : 1);
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).relist, 'running',
      'the held attempt retains custody until its awaited page unwinds');
    recovery.queries[0].release.resolve();
    await nextTurn();
    assert.equal(f.cache.has(TABLE, KEY), false, 'the detached source image cannot publish');
    assert.equal(nextCache.has(TABLE, KEY), false, 'the old image cannot publish into the new cache');
    assert.equal(f.cache.sourceOrder.positionOf(SOURCE).relist, 'no_relister');
    const before = recovery.queries.length;
    f.clock.advance(1000);
    await nextTurn();
    assert.equal(recovery.queries.length, before, 'the detached attempt never starts another fetch');
    if (change === 'removal') {
      recovery.service.setCacheMutationTarget(nextCache);
      await nextTurn();
      assert.equal(recovery.queries.length, 2);
    }
    recovery.queries[1].release.resolve();
    await nextTurn();
    assert.equal(nextCache.get(TABLE, KEY).status, 'ready');
    assert.equal(nextCache.sourceOrder.positionOf(SOURCE).state, 'current');
    assert.deepEqual(nextCache.sourceOrder.positionOf(SOURCE).position, imagePosition(12));
    assert.equal(recovery.service.relistImageSlots.held, 0);
    const oldRecovery = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 13).data, 13);
    registerSourceRelister(oldRecovery.service);
    await oldRecovery.installed;
    assertImagePrefix(f, 13);
    assert.equal(oldRecovery.reads(), 1, 'a later valid owner can recover the detached cache debt');
    assert.deepEqual(nextCache.sourceOrder.positionOf(SOURCE).position, imagePosition(12));
  });
}

test('an idempotent stale registration release cannot erase its replacement owner', async (t) => {
  const f = fixture(t);
  const old = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 11).data, 11);
  const replacement = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 12).data, 12);
  const releaseOld = registerDirectRelisterOwner(old.service);
  const releaseReplacement = registerDirectRelisterOwner(replacement.service);
  releaseOld();
  releaseOld();
  await replacement.installed;
  assert.equal(old.reads(), 0);
  assert.equal(replacement.reads(), 1);
  assertImagePrefix(f, 12);
  releaseReplacement();
  releaseReplacement();
  f.cache.sourceOrder.recordGap(rangeOf([eventOf(CDC_OPERATION.INSERT, 13)]), TABLE);
  await nextTurn();
  assert.equal(f.cache.sourceOrder.positionOf(SOURCE).relist, 'no_relister');
  const healed = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 13).data, 13);
  registerSourceRelister(healed.service);
  await healed.installed;
  assertImagePrefix(f, 13);
});

test('shutdown detaches a source relister and refuses a new registration after the mark', async (t) => {
  const f = fixture(t);
  const recovery = heldTargetRelister(t, f);
  recovery.service.initialize();
  await nextTurn();
  assert.equal(recovery.queries.length, 1);
  recovery.service.markShuttingDown();
  assert.equal(registerSourceRelister(recovery.service), false,
    'a terminal lifecycle cannot acquire a new source registration');
  recovery.queries[0].release.resolve();
  await nextTurn();
  assert.equal(f.cache.has(TABLE, KEY), false);
  assert.equal(f.cache.sourceOrder.positionOf(SOURCE).state, 'gap');
  assert.equal(f.cache.sourceOrder.positionOf(SOURCE).relist, 'no_relister');
  assert.equal(recovery.service.relistImageSlots.held, 0);
  assert.equal(recovery.service.shutdownReleases.size, 0);
  f.clock.advance(1000);
  await nextTurn();
  assert.equal(recovery.queries.length, 1);
});

for (const failure of ['acquisition', 'shutdown-cancellation']) {
  test(`an internal image retry pacing ${failure} failure retains its original attempt and clock debt`,
    async (t) => {
      const f = fixture(t);
      const cause = new Error('the source owner is temporarily unavailable');
      const pacingCause = new Error('the sole image retry clock failed');
      const reason = 'controlled_source_owner_unavailable';
      let reads = 0;
      let pacingCalls = 0;
      const service = new CDCIntegrationService({nodeId: 'internal-pace-recipient',
        cacheMutationTarget: f.cache, timeSource: f.clock,
        sqlQueryEngine: {queryExecutor: {executeOnPartition() {
          reads += 1;
          return {success: false, errorCode: reason, error: cause};
        }}}});
      service.logger = silent;
      const setTimeout = f.clock.setTimeout.bind(f.clock);
      const clearTimeout = f.clock.clearTimeout.bind(f.clock);
      t.after(() => {
        f.clock.setTimeout = setTimeout;
        f.clock.clearTimeout = clearTimeout;
        service.markShuttingDown();
      });
      f.clock.setTimeout = (callback, delay) => {
        pacingCalls += 1;
        if (failure === 'acquisition') throw pacingCause;
        return setTimeout(callback, delay);
      };
      service.initialize();
      await nextTurn();
      if (failure === 'shutdown-cancellation') {
        assert.equal(service.shutdownReleases.size, 1, 'the ordinary internal image pace is held');
        f.clock.clearTimeout = () => { throw pacingCause; };
        assert.doesNotThrow(() => service.markShuttingDown());
        await nextTurn();
      }
      assert.equal(pacingCalls, 1, 'a failed pace never arms another delay');
      const faulted = f.cache.sourceOrder.positionOf(SOURCE);
      assert.equal(faulted.state, 'gap');
      assert.equal(faulted.relist, 'faulted', 'shutdown release cannot overwrite a pacing fault');
      assert.equal(faulted.relistFailures, 1);
      assert.equal(faulted.lastRelistFailure.cause.reason, reason);
      assert.equal(faulted.lastRelistFailure.cause.error, cause);
      assert.equal(faulted.lastRelistFailure.pacingCause, pacingCause);
      assert.equal(reads, 1);
      assert.equal(service.shutdownReleases.size, 0);
      assert.equal(service.relistImageSlots.held, 0);
      assert.equal(f.clock.pendingTimerCount(), failure === 'acquisition' ? 0 : 1,
        'a rejected cancellation promise does not prove the original timer was cleared');
      f.clock.setTimeout = setTimeout;
      f.clock.clearTimeout = clearTimeout;
      f.clock.advance(500);
      await nextTurn();
      assert.equal(f.clock.pendingTimerCount(), 0, 'the original timer itself eventually fires');
      assert.equal(reads, 1, 'the faulted owner never resumes its query loop');
      assert.equal(f.cache.sourceOrder.positionOf(SOURCE).relist, 'faulted');
      const healed = integrationWithImage(t, f, eventOf(CDC_OPERATION.INSERT, 12).data, 12);
      registerSourceRelister(healed.service);
      await healed.installed;
      assertImagePrefix(f, 12);
    });
}


test('late writable cache injection uses the same owned relister registration', async (t) => {
  const f = fixture(t);
  const recovery = heldTargetRelister(t, f);
  recovery.service.setCacheMutationTarget(null);
  recovery.service.initialize();
  await nextTurn();
  assert.equal(recovery.queries.length, 0);
  assert.equal(recovery.service.sourceRelisterRelease, null);
  recovery.service.setSystemTableCache(f.cache);
  await nextTurn();
  assert.equal(recovery.queries.length, 1);
  assert.equal(typeof recovery.service.sourceRelisterRelease, 'function');
  recovery.queries[0].release.resolve();
  await nextTurn();
  assertImagePrefix(f, 11);
  assert.equal(recovery.service.relistImageSlots.held, 0);
  recovery.service.markShuttingDown();
  assert.equal(recovery.service.sourceRelisterRelease, null);
});

test('a supplied complete-table token alone retains its scope and mints the generation-bound receipt',
  async (t) => {
    const f = fixture(t);
    f.install();
    const generation = f.cache.sourceOrder.tableGeneration(TABLE);
    const readAuthority = buildControlPlaneReadAuthority({
      strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      authoritativeObservationScope: CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
    });
    const calls = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'supplied-complete-token-reader', systemTableCache: f.cache,
      now: () => f.clock.now(),
      cdcIntegrationService: {cacheMutationTarget: f.cache,
        executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
          calls.push({tableName, sql, params, options});
          return {success: true, rows: [], rowSetComplete: true,
            readAuthorityWitness: {state: 'observed', partitionId: SOURCE, role: 'leader',
              servingNodeId: 'supplied-token-owner', servingReplicaId: 'supplied-token-owner-r1',
              observedAtMs: f.clock.now(), term: 1, appliedIndex: 10, commitIndex: 10}};
        }},
    });
    const result = await gateway.executeRead({tableName: TABLE, sql: `SELECT * FROM ${TABLE}`,
      params: [], strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED},
    {sessionId: 'supplied-complete-token-read', readAuthority});
    assert.equal(result.success, true);
    assert.equal(result.authoritativeObservation?.scope,
      CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
      'the only declared scope lives in the supplied token');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.readAuthority, readAuthority,
      'the actual owner consumes the exact selected token');
    assert.equal(result.authoritativeObservation.sourceGeneration, generation);
    assert.equal(result.authoritativeObservation.causeId, 'supplied-complete-token-read');
    const reconciled = await gateway.reconcileAuthoritativeCacheRows(TABLE, result.rows, {
      cacheMutationTarget: f.cache, systemTableCache: f.cache, cachedRows: [],
      authoritativeObservation: result.authoritativeObservation,
    });
    assert.equal(reconciled.success, true,
      'the canonical reconciliation owner accepts the actual minted receipt');
    assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), f.clock.now());
    assert.equal(f.cache.sourceOrder.tableGeneration(TABLE), generation);
    assertImagePrefix(f);
  });

test('a supplied bootstrap token alone carries its phase to the snapshot provider', async (t) => {
  const f = fixture(t);
  const rows = [eventOf(CDC_OPERATION.INSERT, 10).data];
  const readAuthority = buildControlPlaneReadAuthority({
    strategy: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.ANY,
    phaseScope: CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP,
  });
  let snapshotCalls = 0;
  let ownerReads = 0;
  let sqlReads = 0;
  let receivedAuthority = null;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'supplied-bootstrap-token-reader', systemTableCache: f.cache,
    now: () => f.clock.now(),
    cdcIntegrationService: {executeAuthoritativeSystemTableRead() { ownerReads += 1; }},
    sqlQueryEngine: {executeQuery() { sqlReads += 1; }},
  });
  const result = await gateway.executeRead({tableName: TABLE,
    strategy: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
    readBootstrapSnapshot(_intent, options) {
      snapshotCalls += 1;
      receivedAuthority = options.readAuthority;
      return rows;
    }}, {readAuthority});
  assert.equal(result.success, true, 'the selected token supplies the declared bootstrap phase');
  assert.equal(snapshotCalls, 1);
  assert.equal(receivedAuthority, readAuthority);
  assert.equal(receivedAuthority.phaseScope, CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP);
  assert.deepEqual(result.rows, rows);
  assert.equal(ownerReads, 0);
  assert.equal(sqlReads, 0);
  assert.equal(f.cache.has(TABLE, KEY), false, 'reading a snapshot does not publish cache authority');
});
