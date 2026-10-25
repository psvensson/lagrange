import {test} from '../../../../src/test-helpers/tap.js';
import {POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE} from
  '../../scenarios/postgres-baseline-comparison-benchmark-table-load.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const stringIncludes = Function.call.bind(String.prototype.includes);

const {waitForSutBenchmarkTableReady} =
  POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE;
const TABLE_ID = 'tbl-one';
const TABLE_NAME = 'Events';
const GOOD = Object.freeze({partition_id: 'p-good', table_id: TABLE_ID,
  table_name: TABLE_NAME});

function fixture(readCohort, readCatalog = () => ({rows: [{table_id: TABLE_ID}]})) {
  const statements = [];
  let now = 0;
  let cohortReads = 0;
  const client = {async queryControl(_node, sql) {
    statements.push(sql);
    if (stringIncludes(sql, 'FROM partitions WHERE table_id')) return readCohort(cohortReads++);
    if (stringIncludes(sql, 'FROM partitions WHERE table_name')) return {rows: [GOOD]};
    if (stringIncludes(sql, 'FROM tables WHERE table_name')) return readCatalog();
    throw new Error('unexpected source query: ' + sql);
  }};
  return {statements, wait: () => waitForSutBenchmarkTableReady(client,
    [{id: 'seed'}], TABLE_NAME, {timing: {now: () => now,
      sleep: async (ms) => {
        now += ms;
      }}, timeoutMs: 100, pollIntervalMs: 10})};
}

function assertReadOnlyFullCohort(t, f) {
  t.ok(arraySome(f.statements, (sql) => stringIncludes(sql,
    'SELECT partition_id, table_id, table_name FROM partitions WHERE table_id')),
  'read includes every identity field from the table ID cohort');
  t.notOk(arraySome(f.statements, (sql) => stringIncludes(sql, 'FROM partitions WHERE table_name')),
    'no partial by-name success path');
  t.ok(arrayEvery(f.statements, (sql) => /^SELECT\b/.test(sql)), 'no repair writes');
}

test('every cohort row must retain the exact catalog identity', async (t) => {
  for (const row of [
    {partition_id: 'p-missing', table_id: TABLE_ID},
    {partition_id: 'p-null', table_id: TABLE_ID, table_name: null},
    {partition_id: 'p-wrong', table_id: TABLE_ID, table_name: 'other'},
    {partition_id: 'p-folded', table_id: TABLE_ID, table_name: 'events'},
    {partition_id: 'p-other-table', table_id: 'other', table_name: TABLE_NAME},
  ]) {
    const f = fixture(() => ({rows: [GOOD, row]}));
    await t.rejects(f.wait(), /partition_table_name_missing/);
    assertReadOnlyFullCohort(t, f);
  }
});

test('a complete cohort succeeds after empty metadata becomes visible', async (t) => {
  const f = fixture((read) => ({rows: read === 0 ? [] :
    [GOOD, {...GOOD, partition_id: 'p-second'}]}));
  await f.wait();
  t.equal(arrayFilter(f.statements, (sql) => stringIncludes(sql, 'FROM partitions')).length, 2);
  assertReadOnlyFullCohort(t, f);
});

test('missing catalog identity cannot be bypassed by a matching name row', async (t) => {
  const f = fixture(() => ({rows: [GOOD]}), () => ({rows: []}));
  await t.rejects(f.wait(), /not ready within 100ms/);
  t.notOk(arraySome(f.statements, (sql) => stringIncludes(sql, 'FROM partitions')),
    'no cohort is invented without its catalog identity');
});

test('unavailable reads never become successful readiness', async (t) => {
  const refused = fixture(() => {
    throw new Error('authority_refused');
  });
  await t.rejects(refused.wait(), /all_system_table_read_nodes_failed:seed=authority_refused/);
  const temporary = fixture((read) => {
    if (read === 0) throw new Error('connect ECONNREFUSED');
    return {rows: [GOOD]};
  });
  await temporary.wait();
  t.equal(arrayFilter(temporary.statements, (sql) => stringIncludes(sql, 'FROM partitions')).length, 2,
    'existing transient-read retry remains owned by the readiness loop');
  assertReadOnlyFullCohort(t, temporary);
});
