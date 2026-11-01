// Regression tests for the comparative-benchmark workload driver's
// operation outcomes (defect ledger D01, D02, D03, D06, D09 of the quest
// comparative-benchmark-evidence-repair). Each case drives the real driver
// entry against a controlled product substitute and states the correct
// accounting.
import assert from 'node:assert/strict';

import {test} from '../../../../src/test-helpers/tap.js';
import {
  DRIVER_FIXTURE_MODE,
  runDriverCase,
} from './real-product-workload-driver-test-fixture.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const LAGRANGE_SCENARIO_A = Object.freeze({
  targetId: 'lagrange',
  scenario: 'scenarioA',
  subkind: 'smoke',
});

test('D01: requests that never answer are unresolved, never committed', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.SILENT,
  });
  assert.equal(observed.accounting.committed, 0, 'no request may count as committed');
  assert.ok(observed.accounting.unresolved >= 1, 'in-flight requests are unresolved');
  assert.equal(
    observed.accounting.unresolved + observed.accounting.unissued,
    observed.accounting.offered,
    'every offered request is unresolved or unissued',
  );
  assert.equal(observed.latencyCount, 0, 'no latency sample from unresolved requests');
});

test('D02: an unavailable data path is a transport failure, never /health', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.NEVER_OPEN,
  });
  assert.equal(observed.healthRequests, 0, 'no substitute /health request is issued');
  assert.equal(observed.accounting.committed, 0);
  assert.ok(arrayIncludes(observed.failureClasses, 'transport_failure'));
});

test('D03: a product error response is a product_error, never committed', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.ERROR_ENVELOPE,
  });
  assert.equal(observed.accounting.committed, 0, 'an error response is not a commit');
  assert.ok(observed.accounting.terminalFailures.product_error >= 1);
  assert.ok(arrayIncludes(observed.failureClasses, 'product_error'));
});

test('D06: a write that affected zero rows is a correctness failure', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.ZERO_AFFECTED,
  });
  assert.equal(observed.accounting.committed, 0, 'zero affected rows is not a commit');
  assert.ok(observed.accounting.terminalFailures.correctness_failure >= 1);
});

test('D06: a response with a wrong value is a correctness failure', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.WRONG_VALUE,
  });
  assert.equal(observed.accounting.committed, 0, 'a wrong value is not a commit');
  assert.ok(observed.accounting.terminalFailures.correctness_failure >= 1);
});

test('D09: the driver emits no fabricated phase or byte counters', async () => {
  for (const targetId of ['lagrange', 'tidb-tikv']) {
    const observed = await runDriverCase({...LAGRANGE_SCENARIO_A, targetId});
    for (const key of ['phaseSumsMs', 'phaseSampleCount', 'clientWireBytesTotal']) {
      assert.equal(arrayIncludes(observed.outputKeys, key), false, `${targetId} emits ${key}`);
    }
  }
});
