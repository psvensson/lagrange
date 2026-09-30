// CDC integration service work in flight at markShuttingDown does not resume
// after terminal.
//
// Round 8, R8-1: the catch-up's own loop checks did not cover the owner's
// other continuations. When the mark landed while one of them awaited, the
// work resumed after terminal:
// - S1: an owner-RPC read answering TABLE_NOT_FOUND reseeded the routing
//   overlay and re-issued the read;
// - S2: a local read answering unusable issued a new owner-RPC read;
// - S3, S4: a visibility-repair read (the first attempt or the retry)
//   applied its cache repair;
// - S5, S6: the repair entry points, called after the mark, read and applied;
// - S7: a routed write whose local-leader leg answered a transient failure
//   was re-issued to the engine.
// K5 is the catch-up's in-flight read answering rows: they must not be
// applied, and the table must not be reported hydrated.
//
// The owner's gate, refuseIfTerminal, stands at each operation class's choke
// point: every authoritative read stage, every authoritative cache repair or
// sweep apply, and every routed mutation hop.
//
// Composition: the real CDCIntegrationService, including its real read flow,
// catch-up, visibility repair and routed write path, on a virtual clock. The
// seams are as low as the owner allows:
// - the query executor's executeOnPartition (the owner-RPC transport);
// - the engine's installRecoveryRoutingOverlayEntry and executeQuery;
// - a local partition replica's executeLocalQuery and executeQuery.
// Each seam holds its answer until the lane answers it after the mark, and
// records whether it was called after the mark. The cache's
// applySystemTableChange records whether the cache changed after the mark.
// Order is controlled by held answers and virtual-clock steps; no wall clock
// is waited on.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import * as CDC_CONSTANTS from '../../src/cdc/cdc-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ERRORS} from '../../src/constants/errors.js';
import {TABLES} from '../../src/constants/index.js';

const TURNS = 60;
const CLOCK_STEP_LIMIT = 5000;
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});
const NODES_PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.NODES];
const SHUT_DOWN = CDC_CONSTANTS.CDC_ERROR_CODE?.SHUT_DOWN ??
  'the typed terminal code';
const NODE_ROW = Object.freeze({
  node_id: 'n-1', node_address: 'ws://n-1', status: 'ACTIVE',
});

async function turns(count = TURNS) {
  for (let turn = count; turn > 0; turn -= 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// The owner and its lowest seams. `local` adds a local replica of the nodes
// partition: a read replica (executeLocalQuery) and a leader write leg
// (executeQuery).
function composeOwner({local = false} = {}) {
  const timeSource = new VirtualTimeSource();
  const cache = new SystemTableCache();
  const calls = [];
  const held = [];
  let service = null;
  const record = (seam) => {
    calls.push({seam, afterMark: service?.isShuttingDown === true});
  };
  const hold = (seam) => {
    record(seam);
    return new Promise((resolve, reject) => {
      held.push({seam, resolve, reject});
    });
  };
  const localReplica = {
    partitionId: NODES_PARTITION_ID,
    getRole: () => 'leader',
    executeLocalQuery: () => hold('local-read'),
    executeQuery: () => hold('local-leader-write'),
  };
  service = new CDCIntegrationService({
    nodeId: 'gate-node',
    systemTableCache: cache,
    timeSource,
    ...(local ?
      {partitionServicesProvider: new Map([[NODES_PARTITION_ID, localReplica]])} :
      {}),
  });
  service.logger = QUIET_LOGGER;
  service.messageRouter = {getConnectedNodes: () => ['peer-node']};
  service.sqlQueryEngine = {
    queryExecutor: {executeOnPartition: () => hold('owner-rpc-read')},
    installRecoveryRoutingOverlayEntry: () => {
      record('overlay-reseed');
      return true;
    },
    executeQuery: () => hold('engine'),
  };
  const applyChange = cache.applySystemTableChange.bind(cache);
  cache.applySystemTableChange = (...args) => {
    record('cache-change');
    return applyChange(...args);
  };
  const answer = (value, {reject = false} = {}) => {
    const next = held.shift();
    assert.ok(next, 'a held answer is waiting');
    if (reject) {
      next.reject(value);
    } else {
      next.resolve(value);
    }
  };
  return {service, timeSource, cache, calls, held, answer};
}

function callsAfterMark(owner) {
  return owner.calls.filter((call) => call.afterMark)
    .map((call) => call.seam);
}

async function untilHeld(owner, seam, count = 1) {
  const heldOf = () => owner.calls.filter((call) => call.seam === seam).length;
  for (let step = 0; step < CLOCK_STEP_LIMIT && heldOf() < count; step += 1) {
    owner.timeSource.advance(1);
    await turns(2);
  }
  assert.equal(heldOf(), count, `${seam} call ${count} is in flight at the mark`);
}

function track(operation) {
  const box = {outcome: null};
  operation.then(
    (value) => {
      box.outcome = {value};
    },
    (error) => {
      box.outcome = {error};
    },
  );
  return box;
}

function assertCatchupTerminal(box) {
  assert.notEqual(box.outcome, null, 'the catch-up settles');
  const summary = box.outcome.value;
  assert.equal(summary.tablesHydrated, 0,
    'a table whose rows were not applied before terminal is not hydrated');
  assert.equal(summary.rowsApplied, 0, 'no row is applied after terminal');
  assert.deepEqual(summary.tablesFailed, [TABLES.NODES],
    'the table is reported failed');
  assert.equal(summary.code, SHUT_DOWN, 'with the owner\'s typed SHUT_DOWN');
}

function catchupNodes(owner) {
  return track(owner.service.hydrateCdcPropagatedTablesFromAuthority({
    tables: [TABLES.NODES],
  }));
}

test('S1: an owner-RPC read in flight at the mark answers TABLE_NOT_FOUND: ' +
  'no overlay reseed, no re-issued read', async () => {
  const owner = composeOwner();
  const box = catchupNodes(owner);
  await untilHeld(owner, 'owner-rpc-read');
  owner.service.markShuttingDown();
  owner.answer({success: false, errorCode: 'TABLE_NOT_FOUND',
    error: 'Table not found: nodes'});
  await turns();
  assert.deepEqual(callsAfterMark(owner), [],
    'nothing is issued, reseeded or applied after terminal');
  assertCatchupTerminal(box);
});

test('S2: a local read in flight at the mark answers unusable: no owner-RPC ' +
  'read is issued after terminal', async () => {
  const owner = composeOwner({local: true});
  const box = catchupNodes(owner);
  await untilHeld(owner, 'local-read');
  owner.service.markShuttingDown();
  owner.answer({success: false, error: 'local replica not ready', rows: []});
  await turns();
  assert.deepEqual(callsAfterMark(owner), [],
    'no later read stage is issued after terminal');
  assertCatchupTerminal(box);
});

test('K5: the catch-up\'s read in flight at the mark answers rows: they are ' +
  'not applied and the table is not reported hydrated', async () => {
  const owner = composeOwner();
  const box = catchupNodes(owner);
  await untilHeld(owner, 'owner-rpc-read');
  owner.service.markShuttingDown();
  owner.answer({success: true, rows: [{...NODE_ROW}]});
  await turns();
  assert.deepEqual(callsAfterMark(owner), [],
    'no cache repair is applied after terminal');
  assert.equal(owner.cache.has(TABLES.NODES, NODE_ROW.node_id), false);
  assertCatchupTerminal(box);
});

async function visibilityRepairInFlight(heldAttempt) {
  const owner = composeOwner();
  const wait = track(owner.service.waitForCacheUpdate(
    TABLES.NODES, NODE_ROW.node_id, true, {timeoutMs: 1000}));
  // Earlier attempts confirm nothing (the row is not there yet), so the
  // repair retries; the held attempt is in flight at the mark.
  for (let attempt = 1; attempt < heldAttempt; attempt += 1) {
    await untilHeld(owner, 'owner-rpc-read', attempt);
    owner.answer({success: true, rows: []});
  }
  await untilHeld(owner, 'owner-rpc-read', heldAttempt);
  owner.service.markShuttingDown();
  await turns();
  owner.answer({success: true, rows: [{...NODE_ROW}]});
  await turns();
  assert.deepEqual(callsAfterMark(owner), [],
    'no cache repair and no further read after terminal');
  assert.equal(owner.cache.has(TABLES.NODES, NODE_ROW.node_id), false,
    'the cache is not repaired after terminal');
  assert.notEqual(wait.outcome, null, 'the waiter settles at terminal');
  assert.equal(wait.outcome.error?.code, SHUT_DOWN,
    'with the owner\'s typed SHUT_DOWN');
}

test('S4: the visibility repair\'s first read in flight at the mark: no ' +
  'repair applied after terminal', () => visibilityRepairInFlight(1));

test('S3: the visibility repair\'s retry read in flight at the mark: no ' +
  'repair applied after terminal', () => visibilityRepairInFlight(2));

test('S5: refreshAuthoritativeCacheRow called after the mark reads and ' +
  'applies nothing', async () => {
  const owner = composeOwner();
  owner.service.markShuttingDown();
  const box = track(owner.service.refreshAuthoritativeCacheRow(
    TABLES.NODES, NODE_ROW.node_id));
  await turns();
  assert.deepEqual(callsAfterMark(owner), [], 'nothing is read or applied');
  assert.equal(box.outcome?.value, false,
    'the refresh settles and is not reported done');
});

test('S6: repairCacheVisibilityHole called after the mark reads and ' +
  'applies nothing', async () => {
  const owner = composeOwner();
  owner.service.markShuttingDown();
  const box = track(owner.service.repairCacheVisibilityHole(
    TABLES.NODES, NODE_ROW.node_id, true, null, null, {}));
  await turns();
  assert.deepEqual(callsAfterMark(owner), [], 'nothing is read or applied');
  assert.notEqual(box.outcome, null, 'the repair settles');
  assert.notEqual(box.outcome.value?.authoritativeVisibilityConfirmed, true,
    'the repair is not reported confirmed');
});

for (const variant of ['thrown', 'returned']) {
  test('S7: a routed write\'s local-leader leg in flight at the mark ' +
    `(${variant} transient failure) is not re-issued to the engine`,
  async () => {
    const owner = composeOwner({local: true});
    const box = track(owner.service.executeSQL(
      'INSERT OR REPLACE INTO nodes (node_id, node_address, status) ' +
      'VALUES (?, ?, ?)', ['n-9', 'ws://n-9', 'ACTIVE']));
    await untilHeld(owner, 'local-leader-write');
    owner.service.markShuttingDown();
    if (variant === 'thrown') {
      owner.answer(new Error(ERRORS.PARTITION_SERVICE_NOT_FOUND),
        {reject: true});
    } else {
      owner.answer({success: false, error: ERRORS.PARTITION_SERVICE_NOT_FOUND});
    }
    await turns();
    assert.deepEqual(callsAfterMark(owner), [],
      'the write is not re-issued to the engine after terminal');
    assert.notEqual(box.outcome, null, 'the write settles at terminal');
    const error = box.outcome.error;
    assert.equal(error?.code, SHUT_DOWN, 'with the owner\'s typed SHUT_DOWN');
    assert.equal(error?.writeOutcome,
      CDC_CONSTANTS.CDC_SHUT_DOWN_WRITE_OUTCOME.NOT_CONFIRMED,
      'the leg was issued, so the outcome is not confirmed, never "not routed"');
    assert.match(String(error?.cause?.message ?? error?.cause?.error),
      new RegExp(ERRORS.PARTITION_SERVICE_NOT_FOUND),
      'the leg\'s own answer stays the cause');
  });
}
