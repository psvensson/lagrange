// Durable record of the declared formation size (stage S1 of
// formation-admission-design-2026-11-11.md): the decoder's named outcomes,
// the read contract's strategy marking, and the once-only publication beside
// cluster_id (retained row is the authority; a differing value is refused).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {CLUSTER_ID_CONFIG_KEY} from '../../src/bootstrap/cluster-identity-constants.js';
import {CONTROL_PLANE_READ_STRATEGY as STRATEGY} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  DECLARED_FORMATION_SIZE_STATE as STATE,
  DECLARED_FORMATION_SIZE_UNAVAILABLE_REASON as REASON,
  FORMATION_TARGET_CONFIG_KEY,
  FORMATION_TARGET_RECORD_ERROR_CODE as RECORD_ERROR,
  buildFormationTargetRow,
  readCachedDeclaredFormationSize,
  readDeclaredFormationSize,
} from '../../src/bootstrap/formation-target-record.js';
import {publishOriginalSeedFormationTarget} from
  '../../src/bootstrap/seed-original-registration.js';

const NODE_ID = 'seed-node';
const TIMESTAMP = 1700000000000;
const IDENTITY_ROW = Object.freeze({[COLUMN.CONFIG_KEY]: CLUSTER_ID_CONFIG_KEY,
  [COLUMN.CONFIG_VALUE]: 'cluster-a', [COLUMN.VALUE_TYPE]: 'string'});

function formationRow(count) {
  return buildFormationTargetRow({count, nodeId: NODE_ID, timestamp: TIMESTAMP});
}

function cacheOf(rows) {
  const byKey = new Map(rows.map((row) => [row[COLUMN.CONFIG_KEY], row]));
  return {get(tableName, key) {
    assert.equal(tableName, TABLES.CONFIG);
    return byKey.get(key);
  }};
}

// A gateway/writer over one CONFIG table: the authoritative read the
// production readers call, and the insert the founding publication submits.
function configStore(rows, {readFails = null} = {}) {
  const table = new Map(rows.map((row) => [row[COLUMN.CONFIG_KEY], {...row}]));
  const store = {inserts: [], reads: 0, table,
    async readAuthoritativeRows(tableName, sql, params) {
      store.reads += 1;
      assert.equal(tableName, TABLES.CONFIG);
      if (readFails === 'throw') throw new Error('owner unreachable');
      if (readFails === 'refused') return {success: false, error: 'not leader'};
      return {success: true, rows: params.filter((key) => table.has(key))
        .map((key) => ({...table.get(key)}))};
    },
    async insertSystemTableRow(tableName, row) {
      assert.equal(tableName, TABLES.CONFIG);
      if (table.has(row[COLUMN.CONFIG_KEY])) throw new Error('UNIQUE constraint failed');
      store.inserts.push(row);
      table.set(row[COLUMN.CONFIG_KEY], {...row});
    }};
  return store;
}

test('the row is keyed and encoded by its owner', () => {
  const row = formationRow(3);
  assert.equal(row[COLUMN.CONFIG_KEY], FORMATION_TARGET_CONFIG_KEY);
  assert.equal(row[COLUMN.CONFIG_VALUE], '3');
  assert.equal(row[COLUMN.UPDATED_BY], NODE_ID);
  assert.equal(row[COLUMN.CREATED_AT], TIMESTAMP);
});

test('(b) a view holding cluster_id and the row answers DECLARED, marked by strategy',
  async () => {
    const rows = [IDENTITY_ROW, formationRow(3)];
    const cached = readCachedDeclaredFormationSize(cacheOf(rows));
    assert.deepEqual(cached, {state: STATE.DECLARED, count: 3, reason: null,
      readStrategy: STRATEGY.CACHE});
    const authoritative = await readDeclaredFormationSize({
      readStrategy: STRATEGY.AUTHORITATIVE, gateway: configStore(rows)});
    assert.deepEqual(authoritative, {state: STATE.DECLARED, count: 3, reason: null,
      readStrategy: STRATEGY.AUTHORITATIVE});
    assert.deepEqual(await readDeclaredFormationSize({readStrategy: STRATEGY.CACHE,
      systemTableCache: cacheOf(rows)}), cached);
  });

test('UNDECLARED only where the view proves absence (cluster_id present, row absent)',
  async () => {
    assert.equal(readCachedDeclaredFormationSize(cacheOf([IDENTITY_ROW])).state,
      STATE.UNDECLARED);
    const answer = await readDeclaredFormationSize({readStrategy: STRATEGY.AUTHORITATIVE,
      gateway: configStore([IDENTITY_ROW])});
    assert.equal(answer.state, STATE.UNDECLARED);
    assert.equal(answer.count, null);
  });

test('(d) a failed, refused, absent or not-yet-hydrated read is UNAVAILABLE, never ' +
  'UNDECLARED or a number', async () => {
  const cases = [
    [await readDeclaredFormationSize({readStrategy: STRATEGY.AUTHORITATIVE,
      gateway: configStore([IDENTITY_ROW, formationRow(3)], {readFails: 'throw'})}),
    REASON.READ_FAILED],
    [await readDeclaredFormationSize({readStrategy: STRATEGY.AUTHORITATIVE,
      gateway: configStore([IDENTITY_ROW, formationRow(3)], {readFails: 'refused'})}),
    REASON.READ_FAILED],
    [await readDeclaredFormationSize({readStrategy: STRATEGY.AUTHORITATIVE}),
      REASON.SOURCE_ABSENT],
    [readCachedDeclaredFormationSize(null), REASON.SOURCE_ABSENT],
    // Pre-hydration: the cache holds nothing yet.
    [readCachedDeclaredFormationSize(cacheOf([])), REASON.IDENTITY_NOT_VISIBLE],
    // A formation row visible before cluster_id cannot prove anything.
    [readCachedDeclaredFormationSize(cacheOf([formationRow(3)])),
      REASON.IDENTITY_NOT_VISIBLE],
    [readCachedDeclaredFormationSize(cacheOf([IDENTITY_ROW,
      {...formationRow(3), [COLUMN.CONFIG_VALUE]: '0'}])), REASON.MALFORMED_ROW],
    [readCachedDeclaredFormationSize(cacheOf([IDENTITY_ROW,
      {...formationRow(3), [COLUMN.CONFIG_VALUE]: 'three'}])), REASON.MALFORMED_ROW],
  ];
  for (const [answer, reason] of cases) {
    assert.equal(answer.state, STATE.UNAVAILABLE);
    assert.equal(answer.reason, reason);
    assert.equal(answer.count, null);
  }
  await assert.rejects(readDeclaredFormationSize({readStrategy: 'eventual'}), TypeError);
});

test('(b) the founding publication writes the row once and observes it', async () => {
  const store = configStore([]);
  await publishOriginalSeedFormationTarget(store, formationRow(3));
  assert.equal(store.inserts.length, 1);
  assert.equal(store.table.get(FORMATION_TARGET_CONFIG_KEY)[COLUMN.CONFIG_VALUE], '3');
});

test('(c) a retained row with the same value is not rewritten', async () => {
  const store = configStore([IDENTITY_ROW, formationRow(3)]);
  const retained = {...store.table.get(FORMATION_TARGET_CONFIG_KEY)};
  const answer = await publishOriginalSeedFormationTarget(store,
    buildFormationTargetRow({count: 3, nodeId: 'restarted', timestamp: TIMESTAMP + 1}));
  assert.equal(store.inserts.length, 0, 'no rewrite');
  assert.deepEqual(answer, retained, 'the retained row is the answer');
  assert.deepEqual(store.table.get(FORMATION_TARGET_CONFIG_KEY), retained);
});

test('(c) a retained row with a different value refuses typed and stays unchanged',
  async () => {
    const store = configStore([IDENTITY_ROW, formationRow(3)]);
    const retained = {...store.table.get(FORMATION_TARGET_CONFIG_KEY)};
    await assert.rejects(publishOriginalSeedFormationTarget(store, formationRow(5)),
      (error) => {
        assert.equal(error.code, RECORD_ERROR.MISMATCH);
        assert.deepEqual(error.detail, {durable: '3', configured: 5});
        return true;
      });
    assert.equal(store.inserts.length, 0);
    assert.deepEqual(store.table.get(FORMATION_TARGET_CONFIG_KEY), retained);
  });

test('an unreadable durable row refuses typed and writes nothing', async () => {
  for (const readFails of ['throw', 'refused']) {
    const store = configStore([], {readFails});
    await assert.rejects(publishOriginalSeedFormationTarget(store, formationRow(3)),
      (error) => error.code === RECORD_ERROR.UNAVAILABLE);
    assert.equal(store.inserts.length, 0, `${readFails}: no write over an unknown`);
  }
});
