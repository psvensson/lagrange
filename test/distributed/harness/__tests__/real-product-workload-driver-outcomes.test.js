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
import {
  validateBenchmarkAccounting,
} from '../benchmark-operation-outcome.js';
import {executeBenchmarkWorkload} from '../real-product-workload-drivers.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);

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

const WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE)\b/iu;

// A request commits only when every response it saw satisfied the contract:
// under the fault only transactions that exchanged no faulted response may
// commit (read-only work the fault does not touch, a delivery with nothing to
// deliver), and their committed attempt shows only well-formed answers.
function assertOnlyUnfaultedRequestsCommitted(observed) {
  for (const request of observed.output.observations.requests) {
    if (request.outcome !== 'committed') continue;
    const attempt = request.attempts[request.attempts.length - 1];
    for (const statement of attempt.statements) {
      if (WRITE_PATTERN.test(statement.sql)) {
        assert.equal(statement.affectedRows, 1,
          `${request.opId} committed through a write that affected ` +
          `${statement.affectedRows} row(s)`);
      }
      assert.equal(stringIncludes(JSON.stringify(statement.rows ?? []), 'garbage'), false,
        `${request.opId} committed through a wrong value`);
    }
  }
}

test('D06: a write that affected zero rows is a correctness failure', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.ZERO_AFFECTED,
  });
  assertOnlyUnfaultedRequestsCommitted(observed);
  assert.ok(observed.accounting.terminalFailures.correctness_failure >= 1);
  assert.equal(observed.output.correctness.finalState.status, 'reconciled');
});

test('D06: a response with a wrong value is a correctness failure', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.WRONG_VALUE,
  });
  assertOnlyUnfaultedRequestsCommitted(observed);
  assert.ok(observed.accounting.terminalFailures.correctness_failure >= 1);
  assert.equal(observed.output.correctness.finalState.status, 'reconciled');
});

test('D09: the driver emits no fabricated phase or byte counters', async () => {
  for (const targetId of ['lagrange', 'tidb-tikv']) {
    const observed = await runDriverCase({...LAGRANGE_SCENARIO_A, targetId});
    for (const key of ['phaseSumsMs', 'phaseSampleCount', 'clientWireBytesTotal']) {
      assert.equal(arrayIncludes(observed.outputKeys, key), false, `${targetId} emits ${key}`);
    }
  }
});

test('J14: a lost COMMIT answer stays unresolved, is never retried and is reconciled',
  async () => {
    for (const targetId of ['lagrange', 'tidb-tikv', 'pg-app']) {
      const observed = await runDriverCase({
        ...LAGRANGE_SCENARIO_A,
        targetId,
        mode: DRIVER_FIXTURE_MODE.COMMIT_ACK_LOST,
      });
      const {accounting} = observed;
      assert.equal(accounting.committed, 0, `${targetId}: a lost answer is not a commit`);
      assert.ok(accounting.unresolved >= 1);
      assert.equal(accounting.ambiguousCommits, accounting.unresolved);
      for (const request of observed.output.observations.requests) {
        if (request.outcome !== 'unresolved') continue;
        assert.equal(request.attempts.length, 1, `${request.opId} was retried`);
        assert.equal(request.failureClass, 'ambiguous_commit');
        assert.equal(request.effectSummary.status, 'no-committed-effect');
      }
      assert.equal(observed.output.correctness.finalState.status,
        'unresolved-effects-observed', `${targetId}: the applied effects stay visible`);
      assert.ok(observed.output.observations.connections
        .destroyedAfterUnresolvedOrTransportFailure >= accounting.unresolved,
      `${targetId}: unresolved connections are destroyed`);
    }
  });

test('J1: the watchdog closes the run and still summarises it', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.SILENT,
  });
  const {observations} = observed.output;
  assert.equal(observations.runStatus, 'watchdog-stopped');
  assert.equal(observations.watchdog.fired, true);
  assert.ok(observations.watchdog.boundMs >= 240000, 'the bound covers the timing ladder');
  assert.equal(observations.latency.p99, null, 'no latency statistic without a sample');
  assert.equal(observations.connections.abortedInFlightAtWatchdog,
    observed.accounting.unresolved);
});

test('the happy path commits every request and reconciles the final state', async () => {
  for (const targetId of ['lagrange', 'tidb-tikv', 'pg-app']) {
    const observed = await runDriverCase({...LAGRANGE_SCENARIO_A, targetId});
    const {output, accounting} = observed;
    assert.equal(accounting.committed, accounting.offered, targetId);
    assert.equal(output.deployment.dataset.verification.status, 'verified');
    assert.equal(output.correctness.finalState.status, 'reconciled');
    assert.match(output.identity.harness.driverSourceSha256, /^[0-9a-f]{64}$/u);
    assert.equal(output.plan.profileClass, 'smoke');
    assert.equal(Object.hasOwn(output.observations, 'completedPerSec'), false,
      'a smoke run carries no capacity metric');
    assert.ok(output.correctness.finalState.after.tableRows.orders > 0);
    assert.equal(output.observations.executedOperationsDigest, output.plan.operationSliceDigest,
      'every planned operation was issued, in plan order');
    for (const request of output.observations.requests) {
      assert.ok(request.endpoint, 'each request records its endpoint');
      assert.ok(Number.isInteger(request.serverConnectionId));
      assert.match(request.attempts[0].responseDigest, /^sha256:[0-9a-f]{64}$/u);
    }
  }
});

test('a refused dataset load (55P03) is a complete setup-failed record', async () => {
  const observed = await runDriverCase({
    ...LAGRANGE_SCENARIO_A,
    mode: DRIVER_FIXTURE_MODE.LOAD_LOCK_NOT_AVAILABLE,
  });
  const {output} = observed;
  const {observations} = output;
  assert.equal(observations.runStatus, 'setup-failed');
  assert.equal(observations.setup.failureClass, 'product_error');
  assert.equal(observations.setup.sqlState, '55P03');
  assert.equal(output.deployment.dataset.verification.status, 'failed');
  assert.equal(observations.accounting.offered, observations.plannedOffered);
  assert.equal(observations.accounting.unissued, observations.accounting.offered);
  assert.equal(observations.accounting.issued, 0);
  assert.deepEqual(validateBenchmarkAccounting(observations.requests), observations.accounting);
  assert.match(observations.executedOperationsDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(typeof observations.window.startedAt, 'string');
  assert.equal(observations.errorRate, null);
  assert.equal(Object.hasOwn(observations, 'completedPerSec'), false);
  assert.equal(output.correctness.finalState, null);
  assert.equal(output.correctness.finalStateObservation.reason, 'setup-failed');
});

test('an unopened run (the deployer\'s readiness exhausted) records every planned request ' +
  'unissued under the deployer\'s setup failure and never connects', async () => {
  const setupFailure = {failureClass: 'product_error', sqlState: null,
    code: 'readiness_exhausted', message: 'membership 1 of 3 after 120 polls'};
  const observed = await runDriverCase({...LAGRANGE_SCENARIO_A, setupFailure});
  const {output} = observed;
  assert.equal(observed.product.state.connections, 0, 'the product is never opened');
  assert.equal(output.observations.runStatus, 'setup-failed');
  assert.deepEqual(output.observations.setup, setupFailure);
  assert.equal(observed.accounting.issued, 0);
  assert.equal(observed.accounting.unissued, observed.accounting.offered);
  assert.ok(observed.accounting.offered > 0);
  assert.equal(output.deployment.endpoint, null);
  assert.equal(output.deployment.dataset.verification.status, 'failed');
  assert.equal(output.deployment.dataset.resetMethod, 'fresh-formation');
  assert.equal(output.correctness.finalState, null);
});

test('an unopened run refuses a setup failure without its typed fields', async () => {
  await assert.rejects(runDriverCase({...LAGRANGE_SCENARIO_A,
    setupFailure: {code: 'readiness_exhausted'}}), /setupFailure/u);
});

test('the plan names its repetition, order and sweep plan (null: no sweep); a missing ' +
  'one is refused, never recorded as null', async () => {
  const setupFailure = {failureClass: 'product_error', sqlState: null,
    code: 'readiness_exhausted', message: 'never ready'};
  const base = {targetId: 'lagrange', system: 'lagrange', scenario: 'scenarioA',
    subkind: 'smoke', setupFailure, evidenceDir: '/tmp/unused-bench-evidence'};
  const complete = {offeredRatePerSec: 50, repetition: 1, orderIndex: 0, sweepPlanSha256: null};
  const output = await executeBenchmarkWorkload({...base, plan: complete});
  assert.equal(output.plan.sweepPlanDigest, null);
  assert.equal(output.plan.repetition, 1);
  for (const missing of ['repetition', 'orderIndex', 'sweepPlanSha256']) {
    const plan = {...complete};
    delete plan[missing];
    await assert.rejects(executeBenchmarkWorkload({...base, plan}), new RegExp(missing, 'u'));
  }
});
