// Lagrange public-PG-wire facts from the lab diagnosis of 2026-11-01
// (quest comparative-benchmark-evidence-repair, live-diagnosis §5, §7.4;
// ledger D29, D30): typed schema-provisioning states, recorded receipt
// shapes (no durability inferred from a receipt), and integer columns as
// canonical decimal text recorded as a dialect fact.
import assert from 'node:assert/strict';

import {test} from '../../../../src/test-helpers/tap.js';
import {
  DRIVER_FIXTURE_MODE,
  runDriverCase,
} from './real-product-workload-driver-test-fixture.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);

const LAGRANGE_SMOKE = Object.freeze({
  targetId: 'lagrange',
  scenario: 'scenarioA',
  subkind: 'smoke',
});
const WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE)\b/iu;

// The first attempt's statements, inline or from the retained evidence file
// (read by the fixture before it removes the evidence directory).
function firstAttemptStatements(observed, request) {
  if (request.responseEvidence.encoding === 'retained-file') {
    return observed.retainedEvidence[request.responseEvidence.path][0];
  }
  return request.attempts[0].statements;
}

test('D29: an unroutable partition during provisioning is a typed pending state',
  async () => {
    const observed = await runDriverCase({
      ...LAGRANGE_SMOKE,
      mode: DRIVER_FIXTURE_MODE.PROVISIONING_UNROUTABLE,
    });
    const {output} = observed;
    assert.equal(output.observations.runStatus, 'completed',
      'setup waits through typed provisioning states within its bound');
    const provisioning = output.deployment.dataset.provisioning;
    const warehouse = arrayFilter(provisioning.tables, (t) => t.table === 'warehouse')[0];
    assert.deepEqual(arrayMap(warehouse.states, (entry) => entry.state),
      ['provisioning_pending', 'partition_not_routable', 'partition_not_routable', 'present']);
    assert.equal(warehouse.outcome, 'routable');
    assert.ok(provisioning.boundMs > 0);
    assert.equal(typeof provisioning.derivation.rule, 'string');
  });

test('D29: any other answer during provisioning is a product error', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SMOKE,
    mode: DRIVER_FIXTURE_MODE.PROVISIONING_OTHER_INTERNAL_ERROR,
  });
  const {observations} = observed.output;
  assert.equal(observations.runStatus, 'setup-failed');
  assert.equal(observations.setup.failureClass, 'product_error');
  assert.equal(observations.setup.sqlState, 'XX000');
});

test('D30: every statement records its receipt shape; durability is never inferred',
  async () => {
    const observed = await runDriverCase(LAGRANGE_SMOKE);
    for (const request of observed.output.observations.requests) {
      for (const statement of firstAttemptStatements(observed, request)) {
        assert.equal(typeof statement.receipt?.kind, 'string', statement.sql);
        assert.equal(Object.hasOwn(statement.receipt, 'durable'), false);
        if (WRITE_PATTERN.test(statement.sql)) {
          assert.equal(statement.receipt.command, WRITE_PATTERN.exec(statement.sql)[1]);
        }
      }
    }
    assert.equal(observed.output.correctness.finalState.status, 'reconciled',
      'durability evidence is the readback reconciliation');
  });

test('integer columns as canonical decimal text are a recorded dialect fact',
  async () => {
    const observed = await runDriverCase({
      ...LAGRANGE_SMOKE,
      mode: DRIVER_FIXTURE_MODE.INTEGER_TEXT,
    });
    const {output} = observed;
    assert.equal(observed.accounting.committed, observed.accounting.offered);
    const encodings = new Set();
    for (const request of output.observations.requests) {
      for (const statement of firstAttemptStatements(observed, request)) {
        for (const encoding of Object.values(statement.columnEncodings ?? {})) {
          encodings.add(encoding);
        }
      }
    }
    assert.deepEqual([...encodings], ['decimal-text']);
  });

test('integer columns as non-canonical text are a correctness failure', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SMOKE,
    mode: DRIVER_FIXTURE_MODE.NONCANONICAL_INTEGER_TEXT,
  });
  assert.ok(observed.accounting.terminalFailures.correctness_failure >= 1);
  for (const request of observed.output.observations.requests) {
    if (request.operationKind === 'new_order') {
      assert.notEqual(request.outcome, 'committed', `${request.opId} read '5.0' as 5`);
    }
  }
});
