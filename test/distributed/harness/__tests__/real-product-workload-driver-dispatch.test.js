// Regression tests for the comparative-benchmark workload driver's dispatch
// (defect ledger D06, D07, D11, D24 of the quest
// comparative-benchmark-evidence-repair): every (target, scenario, subkind)
// executes its intended business-operation family or is a typed non-execution.
import assert from 'node:assert/strict';

import {test} from '../../../../src/test-helpers/tap.js';
import {
  LAGRANGE_OLTP_SQL,
} from '../../reference-client/lagrange-oltp-adapter.js';
import {
  runDriverCase,
  tablesOfStatements,
  workloadStatements,
} from './real-product-workload-driver-test-fixture.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const CANONICAL_TABLES = tablesOfStatements(Object.values(LAGRANGE_OLTP_SQL));

test('D06: Lagrange and TiDB Scenario A execute the same canonical family', async () => {
  const lagrange = await runDriverCase({
    targetId: 'lagrange',
    scenario: 'scenarioA',
    subkind: 'smoke',
  });
  const tidb = await runDriverCase({
    targetId: 'tidb-tikv',
    scenario: 'scenarioA',
    subkind: 'smoke',
  });
  assert.deepEqual(lagrange.tables, tidb.tables, 'both arms touch the same tables');
  for (const table of lagrange.tables) {
    assert.ok(arrayIncludes(CANONICAL_TABLES, table), `${table} is a canonical table`);
  }
  assert.ok(lagrange.tables.length > 0);
  assert.deepEqual(lagrange.kinds, tidb.kinds, 'both arms run the same plan');
});

test('D11: scale-out is a typed refusal, never a substitute statement', async () => {
  let observed = null;
  let refusal = null;
  try {
    observed = await runDriverCase({
      targetId: 'lagrange',
      scenario: 'scaleout',
      subkind: 'fixed-3node',
    });
  } catch (error) {
    refusal = error;
  }
  assert.deepEqual(observed ? workloadStatements(observed) : [], [],
    'no statement is issued for an unknown family');
  assert.equal(refusal?.code, 'BENCHMARK_DISPATCH_REFUSED');
});

test('D07: Lagrange Scenario B is blocked without a SELECT substitute', async () => {
  const observed = await runDriverCase({
    targetId: 'lagrange',
    scenario: 'scenarioB',
    subkind: 'shape:local-only',
  });
  assert.deepEqual(workloadStatements(observed), [], 'no substitute statement');
  assert.equal(observed.dispatchStatus, 'blocked');
});

test('D24: Scenario C is unsupported without a rollup SELECT substitute', async () => {
  for (const targetId of ['lagrange', 'tidb-tikv']) {
    const observed = await runDriverCase({targetId, scenario: 'scenarioC', subkind: '0ms'});
    assert.deepEqual(workloadStatements(observed), [], `${targetId} issues no statement`);
    assert.equal(observed.dispatchStatus, 'unsupported');
  }
});
