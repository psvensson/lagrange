/**
 * Guard tests for the call-cell per-invocation reduce coordinator.
 *
 * Drives `src/runtime/call-cell-reduce-coordinator.js` through an
 * in-memory SQL fake shaped like the production guarded UPDATE grammar
 * (mirroring the parallel-reduce fixture in
 * test/runtime/movielens-affinity-demo-wiring.test.js), and proves the
 * sealed contract's reduce semantics: lease acquire/renew/expired-claim,
 * partial publication under the leased slot, a fail-closed completeness
 * gate (typed REDUCE_INCOMPLETE for incomplete/stale/overlap/unbounded
 * sets), and exactly one atomically visible final snapshot — including
 * replacement-replica re-lease and recompute without a double-visible
 * snapshot.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CALL_CELL_REDUCE_INCOMPLETE_REASON,
  CALL_CELL_REDUCE_SNAPSHOT_STATE,
  createCallCellReduceCoordinator,
} from '../../src/runtime/call-cell-reduce-coordinator.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
} from '../../src/service/call-cell-routing-contract.js';

const INVOCATION_ID = 'call-invocation-guard-1';
const COORDINATION_TABLE = 'call_cell_reduce_slots';
const RESULT_TABLE = 'call_cell_results';
const LEASE_MS = 1000;
const SLOT_COUNT = 2;
const LIMIT = 4;
const REPLICA_ONE = 'svc-reduce-r1';
const REPLICA_TWO = 'svc-reduce-r2';

function slotRow(invocationId, slotId) {
  return {
    invocation_id: invocationId,
    slot_id: slotId,
    replica_id: '',
    lease_expires_at: 0,
    partial_json: '[]',
    computed_at: 0,
  };
}

function resultRow(resultId) {
  return {
    result_id: resultId,
    result_json: '',
    computed_at: 0,
    source_snapshot_json: '',
  };
}

function extractQuotedString(sql, marker) {
  const start = sql.indexOf(marker);
  if (start < 0) {
    return null;
  }
  let cursor = start + marker.length;
  let value = '';
  while (cursor < sql.length) {
    const char = sql[cursor];
    if (char !== '\'') {
      value += char;
      cursor += 1;
      continue;
    }
    if (sql[cursor + 1] === '\'') {
      value += '\'';
      cursor += 2;
      continue;
    }
    return value;
  }
  return value;
}

function whereValue(sql, marker) {
  const match = sql.match(new RegExp(`${marker} = ('?)([^'\\s,]+)\\1`));
  return match ? match[2] : null;
}

function isCoordinationUpdate(sql) {
  return sql.startsWith(`UPDATE ${COORDINATION_TABLE}`);
}

function whereClauseOf(sql) {
  const whereIndex = sql.indexOf(' WHERE ');
  return whereIndex < 0 ? '' : sql.slice(whereIndex);
}

function applyCoordinationUpdate(store, sql) {
  const whereClause = whereClauseOf(sql);
  const slot = store.slots.find((row) =>
    row.invocation_id === whereValue(whereClause, 'invocation_id') &&
    row.slot_id === Number(whereValue(whereClause, 'slot_id')));
  if (!slot) {
    return;
  }
  const ownerGuard = extractQuotedString(whereClause, 'replica_id = \'');
  if (ownerGuard !== null && slot.replica_id !== ownerGuard) {
    return;
  }
  const expiryGuard = whereClause.match(/lease_expires_at <= (\d+)/);
  if (expiryGuard && slot.lease_expires_at > Number(expiryGuard[1])) {
    return;
  }
  const whereIndex = sql.indexOf(' WHERE ');
  const setClause = sql.slice(0, whereIndex < 0 ? undefined : whereIndex);
  const claimOwner = ownerGuard === null ?
    extractQuotedString(setClause, 'replica_id = \'') :
    null;
  if (claimOwner !== null) {
    slot.replica_id = claimOwner;
    slot.partial_json = '[]';
    slot.computed_at = 0;
  }
  const partialJson = extractQuotedString(setClause, 'partial_json = \'');
  if (partialJson !== null) {
    slot.partial_json = partialJson;
    slot.computed_at = Number(whereValue(setClause, 'computed_at'));
  }
  const leaseAssignment = whereValue(setClause, 'lease_expires_at');
  if (leaseAssignment !== null) {
    slot.lease_expires_at = Number(leaseAssignment);
  }
}

function applyResultUpdate(store, sql) {
  const row = store.results.find(
    (entry) => entry.result_id === whereValue(sql, 'result_id'),
  );
  if (!row) {
    return;
  }
  row.result_json = extractQuotedString(sql, 'result_json = \'');
  row.computed_at = Number(whereValue(sql, 'computed_at'));
  row.source_snapshot_json = extractQuotedString(
    sql, 'source_snapshot_json = \'',
  );
  store.resultUpdateCount += 1;
}

// Parse the coordinator's seed INSERT grammar:
// INSERT INTO <table> (col, ...) VALUES (v, ...) with quoted-string and
// numeric literals, mirroring how the guarded-UPDATE grammar is parsed.
function parseInsert(sql) {
  const match =
    /^INSERT INTO ([a-z_]+) \(([^)]+)\) VALUES \((.+)\)$/u.exec(sql);
  if (!match) {
    return null;
  }
  const [, tableName, columnsFragment, valuesFragment] = match;
  const columns = columnsFragment.split(',').map((column) => column.trim());
  const values = valuesFragment.match(/'(?:[^']|'')*'|[^,\s]+/gu)
    .map((value) => (value.startsWith('\'') ?
      value.slice(1, -1).replace(/''/gu, '\'') :
      Number(value)));
  return {
    tableName,
    row: Object.fromEntries(
      columns.map((column, index) => [column, values[index]])),
  };
}

function createSqlStore(options = {}) {
  const store = options.empty === true ?
    {slots: [], results: [], resultUpdateCount: 0} :
    {
      slots: [slotRow(INVOCATION_ID, 1), slotRow(INVOCATION_ID, 2)],
      results: [resultRow(INVOCATION_ID)],
      resultUpdateCount: 0,
    };
  const executeInternal = async (sql) => {
    if (sql.startsWith('SELECT slot_id')) {
      const invocationId = whereValue(sql, 'invocation_id');
      return {
        success: true,
        results: store.slots
          .filter((row) => row.invocation_id === invocationId)
          .map((row) => ({...row})),
      };
    }
    if (isCoordinationUpdate(sql)) {
      applyCoordinationUpdate(store, sql);
      return {success: true};
    }
    if (sql.startsWith(`UPDATE ${RESULT_TABLE}`)) {
      applyResultUpdate(store, sql);
      return {success: true};
    }
    const insert = parseInsert(sql);
    if (insert?.tableName === COORDINATION_TABLE) {
      store.slots.push(insert.row);
      return {success: true};
    }
    if (insert?.tableName === RESULT_TABLE) {
      store.results.push(insert.row);
      return {success: true};
    }
    return {success: false, error: `unexpected sql: ${sql}`};
  };
  return {store, executeInternal};
}

function createCoordinator(executeInternal, nowRef) {
  return createCallCellReduceCoordinator({
    executeInternal,
    coordinationTable: COORDINATION_TABLE,
    resultTable: RESULT_TABLE,
    leaseMs: LEASE_MS,
    slotCount: SLOT_COUNT,
    nowProvider: () => nowRef.now,
  });
}

function partialJson(entries) {
  return JSON.stringify(entries);
}

async function expectReduceIncomplete(t, promise, reason, message) {
  await t.rejects(promise, new RegExp(reason), message);
  await promise.then(
    () => t.fail(`${message}: expected a rejection`),
    (error) => t.equal(
      error.code, CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE,
      `${message}: carries the typed error code`,
    ),
  );
}

async function leaseAndPublish(coordinator, slotId, replicaId, entries, atMs) {
  await coordinator.acquireReduceLease(INVOCATION_ID, replicaId, slotId);
  await coordinator.publishPartial(
    INVOCATION_ID, slotId, replicaId, partialJson(entries), atMs,
  );
}

test('reduce lease acquires a free slot and renews the owned slot',
  async (t) => {
    const nowRef = {now: 10_000};
    const {store, executeInternal} = createSqlStore();
    const coordinator = createCoordinator(executeInternal, nowRef);

    const acquired = await coordinator.acquireReduceLease(
      INVOCATION_ID, REPLICA_ONE, 1,
    );
    t.equal(Number(acquired.slot_id), 1, 'the free slot is claimed');
    t.equal(acquired.replica_id, REPLICA_ONE, 'the claim binds the replica');
    t.equal(Number(acquired.lease_expires_at), 10_000 + LEASE_MS,
      'the lease window starts at claim time');

    nowRef.now += 100;
    const renewed = await coordinator.acquireReduceLease(
      INVOCATION_ID, REPLICA_ONE, 1,
    );
    t.equal(Number(renewed.lease_expires_at), 11_100,
      'an owned live lease renews instead of re-claiming');
    t.equal(store.slots[0].replica_id, REPLICA_ONE,
      'renewal keeps the original owner');
    t.end();
  });

test('reduce lease: one replica holds multiple slots of one invocation',
  async (t) => {
    const nowRef = {now: 15_000};
    const {executeInternal} = createSqlStore();
    const coordinator = createCoordinator(executeInternal, nowRef);

    const first = await coordinator.acquireReduceLease(
      INVOCATION_ID, REPLICA_ONE, 1);
    t.equal(Number(first.slot_id), 1, 'slot 1 acquired');
    const second = await coordinator.acquireReduceLease(
      INVOCATION_ID, REPLICA_ONE, 2);
    t.equal(Number(second.slot_id), 2,
      'the same replica acquires a second slot for the multi-shard path');
    t.equal(second.replica_id, REPLICA_ONE,
      'both slots bind the same replica');
    t.end();
  });

test('reduce lease: a replacement replica claims only an expired slot',
  async (t) => {
    const nowRef = {now: 20_000};
    const {executeInternal} = createSqlStore();
    const coordinator = createCoordinator(executeInternal, nowRef);

    await coordinator.acquireReduceLease(INVOCATION_ID, REPLICA_ONE, 1);
    await expectReduceIncomplete(
      t,
      coordinator.acquireReduceLease(INVOCATION_ID, REPLICA_TWO, 1),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_UNAVAILABLE,
      'a live lease cannot be taken over',
    );

    nowRef.now += LEASE_MS + 1;
    const claimed = await coordinator.acquireReduceLease(
      INVOCATION_ID, REPLICA_TWO, 1,
    );
    t.equal(claimed.replica_id, REPLICA_TWO,
      'the replacement claims the expired slot');
    t.equal(claimed.partial_json, '[]',
      'the claim clears the predecessor partial atomically');
    t.end();
  });

test('publishPartial writes the shard partial only under the leased owner',
  async (t) => {
    const nowRef = {now: 30_000};
    const {store, executeInternal} = createSqlStore();
    const coordinator = createCoordinator(executeInternal, nowRef);

    await coordinator.acquireReduceLease(INVOCATION_ID, REPLICA_ONE, 1);
    await coordinator.publishPartial(
      INVOCATION_ID, 1, REPLICA_ONE,
      partialJson([{groupKey: 'a', aggValue: 3}]), 30_050,
    );
    t.equal(store.slots[0].partial_json,
      partialJson([{groupKey: 'a', aggValue: 3}]),
      'the owner-guarded publish lands the partial');
    t.equal(store.slots[0].computed_at, 30_050,
      'the publish carries the shard computation time');

    await coordinator.publishPartial(
      INVOCATION_ID, 1, REPLICA_TWO,
      partialJson([{groupKey: 'z', aggValue: 9}]), 30_060,
    );
    t.equal(store.slots[0].partial_json,
      partialJson([{groupKey: 'a', aggValue: 3}]),
      'a non-owner publish is a guarded no-op');
    t.end();
  });

test('resolveCompletePartialSet merges a complete fresh disjoint set ' +
  'and returns a witness', async (t) => {
  const nowRef = {now: 40_000};
  const {executeInternal} = createSqlStore();
  const coordinator = createCoordinator(executeInternal, nowRef);

  await leaseAndPublish(coordinator, 1, REPLICA_ONE, [
    {groupKey: 'b', aggValue: 2},
    {groupKey: 'a', aggValue: 5},
  ], 40_010);
  await leaseAndPublish(coordinator, 2, REPLICA_TWO, [
    {groupKey: 'c', aggValue: 4},
  ], 40_020);

  const resolved = await coordinator.resolveCompletePartialSet(
    INVOCATION_ID, [1, 2], LIMIT,
  );
  t.equal(resolved.complete, true, 'the gate opens for a complete set');
  t.same(resolved.partials, [['a', 5], ['c', 4], ['b', 2]],
    'merged partials are key/value tuples sorted by aggregate');
  t.equal(resolved.witness.schemaVersion, 1,
    'the witness declares its schema version');
  t.same(resolved.witness.slots.map((slot) => slot.slotId), [1, 2],
    'the witness covers every expected slot');
  t.same(resolved.witness.slots.map((slot) => slot.replicaId),
    [REPLICA_ONE, REPLICA_TWO],
    'the witness binds the contributing replica generations');
  t.same(resolved.witness.slots.map((slot) => slot.candidateCount), [2, 1],
    'the witness retains the bounded candidate counts');
  t.end();
});

test('resolveCompletePartialSet fails closed when the slot set is ' +
  'incomplete', async (t) => {
  const nowRef = {now: 50_000};
  const {executeInternal} = createSqlStore();
  const coordinator = createCoordinator(executeInternal, nowRef);

  await leaseAndPublish(coordinator, 1, REPLICA_ONE, [
    {groupKey: 'a', aggValue: 1},
  ], 50_010);
  await expectReduceIncomplete(
    t,
    coordinator.resolveCompletePartialSet(INVOCATION_ID, [1, 2], LIMIT),
    CALL_CELL_REDUCE_INCOMPLETE_REASON.SLOT_SET_INCOMPLETE,
    'a missing shard partial fails closed with a typed reason',
  );
  t.end();
});

test('resolveCompletePartialSet fails closed on a stale partial',
  async (t) => {
    const nowRef = {now: 60_000};
    const {executeInternal} = createSqlStore();
    const coordinator = createCoordinator(executeInternal, nowRef);

    await leaseAndPublish(coordinator, 1, REPLICA_ONE, [
      {groupKey: 'a', aggValue: 1},
    ], 60_010);
    await leaseAndPublish(coordinator, 2, REPLICA_TWO, [
      {groupKey: 'b', aggValue: 1},
    ], 60_020);
    nowRef.now += LEASE_MS + 20;
    await coordinator.acquireReduceLease(INVOCATION_ID, REPLICA_ONE, 1);
    await coordinator.acquireReduceLease(INVOCATION_ID, REPLICA_TWO, 2);

    await expectReduceIncomplete(
      t,
      coordinator.resolveCompletePartialSet(INVOCATION_ID, [1, 2], LIMIT),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_STALE,
      'a partial older than the lease window fails closed',
    );
    t.end();
  });

test('resolveCompletePartialSet fails closed on shard overlap',
  async (t) => {
    const nowRef = {now: 70_000};
    const {executeInternal} = createSqlStore();
    const coordinator = createCoordinator(executeInternal, nowRef);

    await leaseAndPublish(coordinator, 1, REPLICA_ONE, [
      {groupKey: 'a', aggValue: 1},
    ], 70_010);
    await leaseAndPublish(coordinator, 2, REPLICA_TWO, [
      {groupKey: 'a', aggValue: 2},
    ], 70_020);

    await expectReduceIncomplete(
      t,
      coordinator.resolveCompletePartialSet(INVOCATION_ID, [1, 2], LIMIT),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.SHARD_OVERLAP,
      'a duplicated group key across partials fails closed',
    );
    t.end();
  });

test('resolveCompletePartialSet fails closed on an unbounded partial',
  async (t) => {
    const nowRef = {now: 80_000};
    const {executeInternal} = createSqlStore();
    const coordinator = createCoordinator(executeInternal, nowRef);

    await leaseAndPublish(coordinator, 1, REPLICA_ONE, [
      {groupKey: 'a', aggValue: 1},
    ], 80_010);
    await leaseAndPublish(coordinator, 2, REPLICA_TWO, [
      {groupKey: 'b', aggValue: 1},
      {groupKey: 'c', aggValue: 2},
      {groupKey: 'd', aggValue: 3},
    ], 80_020);

    await expectReduceIncomplete(
      t,
      coordinator.resolveCompletePartialSet(INVOCATION_ID, [1, 2], 2),
      CALL_CELL_REDUCE_INCOMPLETE_REASON.PARTIAL_UNBOUNDED,
      'a partial above the batch bound fails closed',
    );
    t.end();
  });

test('publishFinalSnapshot writes one atomically visible result row',
  async (t) => {
    const nowRef = {now: 90_000};
    const {store, executeInternal} = createSqlStore();
    const coordinator = createCoordinator(executeInternal, nowRef);

    await leaseAndPublish(coordinator, 1, REPLICA_ONE, [
      {groupKey: 'a', aggValue: 5},
    ], 90_010);
    await leaseAndPublish(coordinator, 2, REPLICA_TWO, [
      {groupKey: 'b', aggValue: 3},
    ], 90_020);
    const resolved = await coordinator.resolveCompletePartialSet(
      INVOCATION_ID, [1, 2], LIMIT,
    );
    const resultJson = JSON.stringify(resolved.partials);
    const published = await coordinator.publishFinalSnapshot(
      INVOCATION_ID, resultJson, resolved.witness,
    );

    t.equal(store.resultUpdateCount, 1,
      'exactly one result-row UPDATE is issued');
    t.equal(store.results[0].result_json, resultJson,
      'the result row carries the final reduced payload');
    t.equal(store.results[0].computed_at, published.computedAt,
      'the snapshot carries its publication time');
    const witness = coordinator.parseResultSnapshotWitness(
      store.results[0].source_snapshot_json, [1, 2], LIMIT,
    );
    t.equal(witness.state, CALL_CELL_REDUCE_SNAPSHOT_STATE.AVAILABLE,
      'the stored witness parses as available');
    t.same(witness.slots.map((slot) => slot.slotId), [1, 2],
      'the visible snapshot identifies its complete partial set');
    t.equal(coordinator.parseResultSnapshotWitness('', [1, 2], LIMIT).state,
      CALL_CELL_REDUCE_SNAPSHOT_STATE.UNAVAILABLE,
      'an empty witness is explicitly unavailable');
    t.equal(
      coordinator.parseResultSnapshotWitness('{invalid', [1, 2], LIMIT).state,
      CALL_CELL_REDUCE_SNAPSHOT_STATE.INVALID,
      'an unparseable witness is explicitly invalid',
    );
    t.end();
  });

test('replacement replica re-leases, recomputes, and the final snapshot ' +
  'stays exactly once visible', async (t) => {
  const nowRef = {now: 100_000};
  const {store, executeInternal} = createSqlStore();
  const coordinator = createCoordinator(executeInternal, nowRef);

  await leaseAndPublish(coordinator, 1, REPLICA_ONE, [
    {groupKey: 'a', aggValue: 1},
  ], 100_010);
  await leaseAndPublish(coordinator, 2, REPLICA_TWO, [
    {groupKey: 'b', aggValue: 2},
  ], 100_020);
  const first = await coordinator.resolveCompletePartialSet(
    INVOCATION_ID, [1, 2], LIMIT,
  );
  await coordinator.publishFinalSnapshot(
    INVOCATION_ID, JSON.stringify(first.partials), first.witness,
  );
  t.equal(store.resultUpdateCount, 1, 'the first snapshot is published');

  nowRef.now += LEASE_MS + 1;
  const replacementId = 'svc-reduce-r3';
  const reacquired = await coordinator.acquireReduceLease(
    INVOCATION_ID, replacementId, 2,
  );
  t.equal(reacquired.replica_id, replacementId,
    'the replacement claims the expired slot');
  t.equal(reacquired.partial_json, '[]',
    'the re-lease clears the predecessor partial without touching the result');
  t.equal(store.resultUpdateCount, 1,
    'no intermediate state is published during the takeover');
  t.equal(store.results[0].result_json, JSON.stringify(first.partials),
    'readers keep seeing exactly the first sealed snapshot');

  await coordinator.acquireReduceLease(INVOCATION_ID, REPLICA_ONE, 1);
  await coordinator.publishPartial(
    INVOCATION_ID, 1, REPLICA_ONE,
    partialJson([{groupKey: 'a', aggValue: 1}]), nowRef.now,
  );
  await coordinator.publishPartial(
    INVOCATION_ID, 2, replacementId,
    partialJson([{groupKey: 'b', aggValue: 7}]), nowRef.now,
  );
  const recomputed = await coordinator.resolveCompletePartialSet(
    INVOCATION_ID, [1, 2], LIMIT,
  );
  t.same(recomputed.witness.slots.map((slot) => slot.replicaId),
    [REPLICA_ONE, replacementId],
    'the recomputed witness names the replacement generation');
  await coordinator.publishFinalSnapshot(
    INVOCATION_ID, JSON.stringify(recomputed.partials),
    recomputed.witness,
  );
  t.equal(store.resultUpdateCount, 2,
    'the recomputed result is one further atomic snapshot, never a ' +
        'double-visible intermediate');
  t.equal(store.results[0].result_json,
    JSON.stringify(recomputed.partials),
    'the single visible row flips atomically to the recomputed result');
  t.end();
});

test('seedInvocation creates the rows the guarded coordination cycle ' +
  'bites on, from an empty store', async (t) => {
  const nowRef = {now: 10_000};
  const {store, executeInternal} = createSqlStore({empty: true});
  const coordinator = createCoordinator(executeInternal, nowRef);
  const invocationId = 'call-invocation-seeded-1';

  const seeded = await coordinator.seedInvocation(invocationId, [1, 2]);
  t.same(seeded.slotIds, [1, 2], 'the seeded slot ids echo back sorted');
  t.same(
    store.slots.map((slot) =>
      [slot.invocation_id, slot.slot_id, slot.replica_id,
        slot.lease_expires_at, slot.partial_json, slot.computed_at]),
    [
      [invocationId, 1, '', 0, '[]', 0],
      [invocationId, 2, '', 0, '[]', 0],
    ],
    'each expected slot starts unowned with an expired lease and an ' +
      'empty partial',
  );
  t.same(
    store.results.map((row) =>
      [row.result_id, row.result_json, row.computed_at]),
    [[invocationId, '', 0]],
    'the result row exists for the final snapshot UPDATE to fill',
  );

  await coordinator.acquireReduceLease(invocationId, REPLICA_ONE, 1);
  await coordinator.publishPartial(
    invocationId, 1, REPLICA_ONE,
    partialJson([{groupKey: 'a', aggValue: 3}]), nowRef.now,
  );
  await coordinator.acquireReduceLease(invocationId, REPLICA_ONE, 2);
  await coordinator.publishPartial(
    invocationId, 2, REPLICA_ONE,
    partialJson([{groupKey: 'b', aggValue: 5}]), nowRef.now,
  );
  const gate = await coordinator.resolveCompletePartialSet(
    invocationId, [1, 2], LIMIT,
  );
  t.same(gate.partials, [['b', 5], ['a', 3]],
    'the seeded rows carry a full leased publish → gate cycle');
  await coordinator.publishFinalSnapshot(
    invocationId, JSON.stringify(gate.partials), gate.witness,
  );
  t.equal(store.results[0].result_json, JSON.stringify(gate.partials),
    'the seeded result row receives the atomically visible snapshot');

  await coordinator.seedInvocation(invocationId, [1, 2]).then(
    () => t.pass('re-seeding is a plain insert; uniqueness is the ' +
      'coordination DDL owner concern'),
    () => t.fail('seedInvocation must not throw on the fixture store'),
  );
  await coordinator.seedInvocation('').then(
    () => t.fail('expected a typed refusal for a missing invocation id'),
    (error) => t.match(String(error.message), /fresh invocation id/u),
  );
  t.end();
});
