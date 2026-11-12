import assert from 'node:assert/strict';
import {test} from 'node:test';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {SYSTEM_TABLE_CACHE_MUTATION_MODE} from '../../src/cache/cache-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  applyAuthoritativeSystemTableRowsToCache,
  applyCommittedPartitionCdcEventToCache,
  evictAuthoritativeAbsentSystemTableRowsFromCache,
} from '../../src/control-plane/control-plane-system-table-gateway-cache-reconciliation.js';

const ROW = Object.freeze({node_id: 'n1', status: 'active', updated_at: 1000});
const SOURCE = INITIAL_PARTITION_IDS.nodes;
const RANGE = Object.freeze({sourcePartition: SOURCE, incarnation: 'ingress-source',
  after: Object.freeze({logIndex: 0, ordinal: -1}),
  through: Object.freeze({logIndex: 1, ordinal: 0})});
const occurrence = (operation, data = ROW) => ({tableName: TABLES.NODES, operation,
  data: {...data, updated_at_hlc: '1000:0:origin'}, timestamp: '1000:0:origin',
  sourcePartition: SOURCE, eventKey: `ingress-${operation}`, entryId: 'ingress-entry',
  sourceLogIndex: 1, sourceOrdinal: 0, causeId: 'committed-cause'});

function capturePort() {
  const calls = [];
  const sourceCalls = [];
  return {calls, sourceCalls, port: {applySystemTableChange(...args) {
    calls.push(args);
  }, applySourceCdcEvent(...args) { sourceCalls.push(args); return {state: 'applied'}; }}};
}

test('owned ingress preserves row identity, operation and source metadata', () => {
  const {port, calls, sourceCalls} = capturePort();
  const gateway = new ControlPlaneSystemTableGateway({systemTableCache: port});
  gateway.applySystemTableRowsToCache = () => {
    throw new Error('retired gateway mutation method must not run');
  };
  assert.equal(applyAuthoritativeSystemTableRowsToCache(gateway, port, TABLES.NODES, [ROW]), true);
  assert.equal(calls[0][2], ROW);
  assert.deepEqual(calls[0], [TABLES.NODES, CDC_OPERATION.UPSERT, ROW, undefined]);
  assert.equal(
    evictAuthoritativeAbsentSystemTableRowsFromCache(gateway, port, TABLES.NODES, [ROW]), true);
  assert.deepEqual(calls[1], [TABLES.NODES, CDC_OPERATION.DELETE, ROW, {
    mutationMode: SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_ABSENCE_RECONCILIATION,
  }]);
  for (const operation of [CDC_OPERATION.INSERT, CDC_OPERATION.UPDATE, CDC_OPERATION.DELETE]) {
    const event = occurrence(operation);
    assert.equal(applyCommittedPartitionCdcEventToCache(port, event, RANGE, 0).state, 'applied');
    assert.deepEqual(sourceCalls.at(-1), [event, RANGE, 0]);
    assert.equal(sourceCalls.at(-1)[0], event, 'complete occurrence crosses the existing gateway');
    assert.equal(sourceCalls.at(-1)[1], RANGE, 'immutable source range remains explicit');
  }
  assert.equal(calls.length, 2, 'durable ingress never takes the generic row mutation route');
  assert.equal(sourceCalls.length, 3);
});

test('read-only views use only the gateway-owned writable target', () => {
  const cache = new SystemTableCache();
  const view = createReadOnlyCache(cache);
  const gateway = new ControlPlaneSystemTableGateway({
    systemTableCache: view,
    cdcIntegrationService: {cacheMutationTarget: cache},
  });
  assert.equal(applyAuthoritativeSystemTableRowsToCache(gateway, view, TABLES.NODES, [ROW]), true,
    'true means a usable owned target accepted the batch');
  assert.equal(view.get(TABLES.NODES, ROW.node_id).status, ROW.status);
  assert.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.NODES), null,
    'a subset repair cannot publish a complete observation');
  const unavailable = new ControlPlaneSystemTableGateway({systemTableCache: view});
  assert.equal(
    applyAuthoritativeSystemTableRowsToCache(unavailable, view, TABLES.NODES, [ROW]), false);
  assert.equal(
    evictAuthoritativeAbsentSystemTableRowsFromCache(unavailable, view, TABLES.NODES, [ROW]),
    false,
  );
  assert.equal(applyAuthoritativeSystemTableRowsToCache(null, null, TABLES.NODES, [ROW]), false);
  assert.ok(view.get(TABLES.NODES, ROW.node_id), 'missing capability did not evict');
});

test('subset failures are contained per row; committed and full-reconcile failures propagate', async () => {
  const failure = new Error('controlled mutation refusal');
  const attempts = [];
  const port = {applySystemTableChange(...args) {
    attempts.push(args);
    throw failure;
  }, applySourceCdcEvent() { throw failure; }};
  const logs = [];
  const cache = new SystemTableCache();
  const gateway = new ControlPlaneSystemTableGateway({systemTableCache: cache});
  gateway.logger = {debug: (...args) => logs.push(args)};
  const second = {...ROW, node_id: 'n2'};
  for (const apply of [applyAuthoritativeSystemTableRowsToCache,
    evictAuthoritativeAbsentSystemTableRowsFromCache]) {
    assert.equal(apply(gateway, port, TABLES.NODES, [ROW, null, second]), true);
  }
  assert.equal(attempts.length, 4, 'each valid row is attempted despite prior refusal');
  assert.equal(logs.length, 4);
  assert.ok(logs.every((entry) => entry[1].error === failure.message));
  assert.throws(() => applyCommittedPartitionCdcEventToCache(port,
    occurrence(CDC_OPERATION.INSERT), RANGE, 0), (error) => error === failure);
  await assert.rejects(gateway.reconcileAuthoritativeCacheRows(TABLES.NODES, [ROW], {
    cacheMutationTarget: port, systemTableCache: cache,
  }), (error) => error === failure);
  assert.equal(logs.length, 4, 'stronger ingress failures were not swallowed');
  assert.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.NODES), null);
});

test('real-cache CDC provenance and authoritative-absence fencing stay distinct', () => {
  const cache = new SystemTableCache();
  const row = {...ROW, updated_at_hlc: '1000:0:origin'};
  const event = {...occurrence(CDC_OPERATION.INSERT, row), causeId: 'cdc-row'};
  assert.equal(applyCommittedPartitionCdcEventToCache(cache, event, RANGE, 0).state, 'applied');
  assert.deepEqual(cache.getLastCdcObservation(TABLES.NODES, ROW.node_id), {
    observedAtMs: 0, originHlc: row.updated_at_hlc,
  });
  assert.equal(cache.getLastAppliedCauseId(TABLES.NODES), 'cdc-row');
  assert.equal(
    evictAuthoritativeAbsentSystemTableRowsFromCache(null, cache, TABLES.NODES, [row]), true);
  assert.equal(cache.get(TABLES.NODES, ROW.node_id), undefined);
  assert.equal(cache.getLastCdcObservation(TABLES.NODES, ROW.node_id), null);
  applyAuthoritativeSystemTableRowsToCache(null, cache, TABLES.NODES, [row]);
  assert.equal(cache.get(TABLES.NODES, ROW.node_id), undefined,
    'the old row cannot undo the owner tombstone');
  assert.equal(cache.getLastAuthoritativeObservedAtMs(TABLES.NODES), null,
    'neither committed row delivery nor subset absence claims a complete table');
});
