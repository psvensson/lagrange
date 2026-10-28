import assert from 'node:assert/strict';
import t from 'tap';

import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
  buildScenarioAVisibilityCase,
  evaluateScenarioAVisibilityObservation,
} from '../harness/oltp-scenario-a-visibility-case.js';
import {
  runLagrangeVisibilityProbe,
} from './lagrange-visibility-probe.js';
import {
  run as runLagrangeVisibilityScenario,
} from '../scenarios/scenario-a-visibility-lagrange.js';

const DEFINITION = buildScenarioAVisibilityCase();
const INITIAL_VALUE = DEFINITION.identity.expected.initialValue;
const WRITE_DELTA_CENTS = DEFINITION.identity.writeDeltaCents;
const ENDPOINT = Object.freeze({host: '127.0.0.1', port: 5432});
const CONNECTION = Object.freeze({user: 'benchmark', database: 'benchmark', ssl: false});

function fakeClientFactory(options = {}) {
  const clients = [];
  const events = [];
  let writerTransactionOpen = false;
  let writerUpdated = false;

  function warehouseResult(role, sql, values) {
    assert.equal(sql, 'SELECT ytd_cents FROM warehouse WHERE id = $1');
    assert.deepEqual(values, [1]);
    if (Object.hasOwn(options, 'invalidReadValue')) {
      return {rows: [{ytd_cents: options.invalidReadValue}]};
    }
    const visiblePending = writerTransactionOpen && writerUpdated &&
      (role === 'writer' || options.dirtyRead);
    return {
      rows: [{ytd_cents: INITIAL_VALUE +
        (visiblePending ? WRITE_DELTA_CENTS : 0)}],
    };
  }

  function createClient(config) {
    const role = clients.length === 0 ? 'writer' : 'observer';
    const client = {
      role,
      config,
      async connect() {
        events.push(`${role}:connect`);
        if (role === 'observer' && options.observerConnectFails) {
          throw new Error('observer connection failed');
        }
      },
      async query(sql, values = []) {
        events.push(`${role}:${sql}`);
        if (sql === 'BEGIN') {
          assert.equal(role, 'writer');
          writerTransactionOpen = true;
          writerUpdated = false;
          return {rowCount: 0};
        }
        if (sql === 'ROLLBACK') {
          assert.equal(role, 'writer');
          if (options.rollbackFails) throw new Error('rollback failed');
          writerTransactionOpen = false;
          writerUpdated = false;
          return {rowCount: 0};
        }
        if (sql.startsWith('UPDATE warehouse ')) {
          assert.equal(role, 'writer');
          assert.equal(writerTransactionOpen, true);
          assert.deepEqual(values, [WRITE_DELTA_CENTS, 1]);
          if (options.updateFails) throw new Error('update failed');
          writerUpdated = !options.noUpdatedRow;
          return {rowCount: options.noUpdatedRow ? 0 : 1};
        }
        return warehouseResult(role, sql, values);
      },
      async end() {
        events.push(`${role}:end`);
        if (role === 'observer' && options.observerEndFails) {
          throw new Error('observer cleanup failed');
        }
      },
    };
    clients.push(client);
    return client;
  }
  return {clients, events, createClient};
}

function probeOptions(createClient) {
  return {
    endpoint: ENDPOINT,
    connection: CONNECTION,
    warehouseId: DEFINITION.identity.target.key.id,
    writeDeltaCents: WRITE_DELTA_CENTS,
    createClient,
  };
}

async function assertVisibilityProof() {
  const fake = fakeClientFactory();
  const observation = await runLagrangeVisibilityProbe(
    probeOptions(fake.createClient),
  );
  const evaluation = evaluateScenarioAVisibilityObservation(observation);
  assert.equal(evaluation.passed, true);
  assert.deepEqual(evaluation.proofIds, OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS);
  assert.equal(fake.clients.length, 2);
  assert.deepEqual(fake.clients[0].config, {
    host: ENDPOINT.host,
    port: ENDPOINT.port,
    ...CONNECTION,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
  });
  assert.deepEqual(fake.events.filter((event) => event.endsWith(':end')), [
    'writer:end',
    'observer:end',
  ]);
  assert.equal(fake.events.filter((event) => event === 'writer:ROLLBACK').length, 1);
  assert.deepEqual(fake.events.slice(2, 5), [
    'writer:BEGIN',
    'writer:SELECT ytd_cents FROM warehouse WHERE id = $1',
    'observer:SELECT ytd_cents FROM warehouse WHERE id = $1',
  ]);
  assert.deepEqual(fake.events.filter((event) => event.startsWith('writer:UPDATE ')), [
    'writer:UPDATE warehouse SET ytd_cents = ytd_cents + $1 WHERE id = $2',
  ]);
}

async function assertAnomaliesFailClosed() {
  const fake = fakeClientFactory({dirtyRead: true});
  const observation = await runLagrangeVisibilityProbe(
    probeOptions(fake.createClient),
  );
  const evaluation = evaluateScenarioAVisibilityObservation(observation);
  assert.equal(evaluation.passed, false);
  assert.deepEqual(evaluation.failures, ['dirty_read']);
  assert.deepEqual(evaluation.proofIds, []);
}

async function assertFailuresCleanUp() {
  for (const failure of [
    {updateFails: true, error: /update failed/u},
    {noUpdatedRow: true, error: /must affect one warehouse/u},
    {observerConnectFails: true, error: /observer connection failed/u},
    {rollbackFails: true, error: /rollback both failed/u},
  ]) {
    const {error, ...options} = failure;
    const fake = fakeClientFactory(options);
    await assert.rejects(
      runLagrangeVisibilityProbe(probeOptions(fake.createClient)),
      error,
    );
    assert.deepEqual(fake.events.filter((event) => event.endsWith(':end')), [
      'writer:end',
      'observer:end',
    ]);
    if (options.updateFails || options.noUpdatedRow) {
      assert.equal(fake.events.includes('writer:ROLLBACK'), true);
    }
  }
  const fake = fakeClientFactory({updateFails: true, observerEndFails: true});
  await assert.rejects(
    runLagrangeVisibilityProbe(probeOptions(fake.createClient)),
    (error) => error instanceof AggregateError && error.errors.length === 2,
  );
}

async function assertInvalidInputHasNoEffects() {
  const fake = fakeClientFactory();
  await assert.rejects(
    runLagrangeVisibilityProbe({
      ...probeOptions(fake.createClient),
      endpoint: {host: '', port: 5432},
    }),
    /endpoint\.host/u,
  );
  await assert.rejects(
    runLagrangeVisibilityProbe({
      ...probeOptions(fake.createClient),
      writeDeltaCents: 0,
    }),
    /positive integer/u,
  );
  assert.equal(fake.clients.length, 0);
}

async function assertHostileRowsFailClosed() {
  for (const invalidReadValue of [null, undefined, '', false, '0e1']) {
    const fake = fakeClientFactory({invalidReadValue});
    await assert.rejects(
      runLagrangeVisibilityProbe(probeOptions(fake.createClient)),
      /expected an integer warehouse ytd/u,
    );
    assert.deepEqual(fake.events.filter((event) => event.endsWith(':end')), [
      'writer:end',
      'observer:end',
    ]);
  }
}

async function assertScenarioRequiresAdmission() {
  const previous = process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH;
  try {
    delete process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH;
    await assert.rejects(
      runLagrangeVisibilityScenario({
        getNodes() {
          throw new Error('cluster must not be queried without certification');
        },
      }),
      /requires LAGRANGE_SCENARIO_A_ADMISSION_PATH/u,
    );
  } finally {
    if (previous === undefined) delete process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH;
    else process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH = previous;
  }
}

await t.test('Lagrange visibility uses the shared Scenario A oracle', assertVisibilityProof);
await t.test('Lagrange visibility rejects dirty-read anomalies', assertAnomaliesFailClosed);
await t.test('Lagrange visibility closes resources on failure', assertFailuresCleanUp);
await t.test('Lagrange visibility refuses invalid inputs before effects',
  assertInvalidInputHasNoEffects);
await t.test('Lagrange visibility rejects invalid PostgreSQL values',
  assertHostileRowsFailClosed);
await t.test('Lagrange visibility requires admission before SQL activity',
  assertScenarioRequiresAdmission);
