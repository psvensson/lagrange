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
const arraySome = Function.call.bind(Array.prototype.some);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

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

// Live campaign bench-live-20261101-b: the record owner requires the
// preregistered warm-up as plan.warmup {operations, digest}, but no run plan
// carried it (only the chain fixture did), so every real record - completed
// or setup-failed - would be rejected. The run's plan identity carries the
// planned warm-up: its operation count and the digest of the planned warm-up
// slice, which a completed run's executed warm-up must equal.
test('every run plan carries the preregistered warm-up the executed one must match',
  async () => {
    const completed = (await runDriverCase(LAGRANGE_SCENARIO_A)).output;
    const workload = completed.plan.workload;
    const operations = workload.workers * workload.warmupOperationsPerWorker;
    assert.ok(operations > 0);
    assert.deepEqual(Object.keys(completed.plan.warmup).sort(), ['digest', 'operations']);
    assert.equal(completed.plan.warmup.operations, operations);
    assert.match(completed.plan.warmup.digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(completed.observations.warmup.accounting.offered, operations);
    assert.equal(completed.observations.warmup.executedOperationsDigest,
      completed.plan.warmup.digest, 'the executed warm-up is the preregistered one');
    const unopened = (await runDriverCase({...LAGRANGE_SCENARIO_A, setupFailure: {
      failureClass: 'product_error', sqlState: null, code: 'readiness_exhausted',
      message: 'node 2 did not report ready'}})).output;
    assert.deepEqual(unopened.plan.warmup, completed.plan.warmup);
  });

// Live campaign bench-live-20261101-b-r5: the PostgreSQL durability proof
// restarted the server and an idle pg client received FATAL 57P01 as an
// asynchronous 'error' event; no listener was attached, so Node turned it into
// an uncaught exception that killed the whole campaign runner (no teardown).
// One owner creates every pg-wire client of the benchmark chain and keeps such
// an error on the client as evidence; pg then refuses the client's further
// queries, which fail through the outcome owner.
test('an asynchronous pg connection error is kept, never a process crash', async () => {
  const {createPgWireClient} = await import('../../reference-client/pg-wire-client.js');
  const client = createPgWireClient({host: '127.0.0.1', port: 1});
  const terminated = Object.assign(new Error('terminating connection due to administrator ' +
    'command'), {code: '57P01'});
  client.emit('error', terminated);
  assert.equal(client.connectionError, terminated);
});

test('no other benchmark-chain module constructs a pg client', async () => {
  const {readdirSync, readFileSync} = await import('node:fs');
  // The scenarios too (coordinator decision 3, 2026-11-02): every pg-wire
  // client of the repository's distributed tests comes from the one owner.
  const roots = [new URL('../../reference-client/', import.meta.url),
    new URL('../', import.meta.url), new URL('../../scenarios/', import.meta.url)];
  const offenders = [];
  for (const root of roots) {
    for (const name of readdirSync(root)) {
      if (!stringEndsWith(name, '.js') || name === 'pg-wire-client.js') continue;
      if (stringEndsWith(root.href, '/harness/') && !/^(benchmark-|comparative-benchmark-|real-product-)/u
        .test(name)) continue;
      const text = readFileSync(new URL(name, root), 'utf8');
      if (/new (pg\.|pgModule\.)?Client\(/u.test(text)) offenders.push(name);
    }
  }
  assert.deepEqual(offenders, []);
});

// The same campaign's load generator lacked mysql2, which only the TiDB arm
// uses; the run loaded it for every system. A run loads only its own driver.
test('a PostgreSQL run never loads the TiDB driver', async () => {
  const {executeBenchmarkWorkload} = await import('../real-product-workload-drivers.js');
  const output = await executeBenchmarkWorkload({targetId: 'pg-single-primary',
    system: 'postgresql', scenario: 'scenarioA', subkind: 'smoke',
    connection: {endpoint: {host: '127.0.0.1', port: 1},
      credentials: {user: 'u', password: 'p', database: 'd'}},
    plan: {offeredRatePerSec: 5, repetition: 1, orderIndex: 0, sweepPlanSha256: null},
    drivers: {createPgClient: () => ({async connect() {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'),
        {code: 'ECONNREFUSED'});
    }, async query() {}, async end() {}, on() {}})},
    evidenceDir: (await import('node:fs')).mkdtempSync(
      `${(await import('node:os')).tmpdir()}/bench-pg-only-`)});
  assert.equal(output.observations.runStatus, 'setup-failed');
  assert.equal(output.observations.setup.failureClass, 'transport_failure');
});

// Coordinator decision 3 (2026-11-02): mysql2 is a dependency of the
// reference-client package (its own lockfile), never of the root. Its owner
// loads it and reads both native drivers' installed versions from that
// package's own resolution path; the harness cannot resolve it from its own
// directory (live campaign bench-live-20261101-b-r6: ERR_MODULE_NOT_FOUND).
test('native drivers resolve and report versions through the reference-client package',
  async () => {
    const {createRequire} = await import('node:module');
    const {nativeClientVersions} = await import('../../reference-client/native-clients.js');
    const versions = nativeClientVersions();
    const fromRoot = createRequire(import.meta.url)('pg/package.json').version;
    assert.deepEqual(versions.pg, {version: fromRoot, error: null});
    assert.deepEqual(Object.keys(versions.mysql2).sort(), ['error', 'version']);
    assert.ok(versions.mysql2.version !== null || /mysql2/u.test(versions.mysql2.error));
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

// Live campaign bench-live-20261101-b-r7: the TiDB arm committed 100 of 100,
// then the run closed its adapter, which dropped the benchmark database, and
// the deployment's after-window placement observation found no regions of the
// canonical table for 120 s - a harness ordering fault recorded as the
// product's readiness exhaustion. Each run's arm is a fresh deployment the
// campaign tears down: the run leaves its dataset in place for the
// deployment's after-window observations.
test('a run closes its adapter without dropping the dataset the deployment observes after ' +
  'the window', async () => {
  const observed = await runDriverCase({...LAGRANGE_SCENARIO_A, targetId: 'tidb-tikv'});
  assert.equal(observed.output.observations.runStatus, 'completed');
  assert.equal(arraySome(observed.statements, (sql) => /DROP DATABASE/iu.test(sql)), false,
    'no DROP DATABASE after the window');
  assert.equal(observed.output.cleanup.databaseDropped, false);
});
