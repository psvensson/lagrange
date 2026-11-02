// The Scenario A semantic proof journey's gate record: bound to the
// caller's deployment, one shared proof body per case for Lagrange and
// PostgreSQL, and `incomplete` (never null) when no proof record exists.
// Evidence ceiling: every connection is refused by the injected PG client
// factory (an ECONNREFUSED as the native pg client raises it), so this proves
// the record contract and the unrunnable path, not a passing proof. No real
// socket is opened: a guard on net.Socket#connect fails the file if one is.
import assert from 'node:assert/strict';
import net from 'node:net';

import {test} from '../../../../src/test-helpers/tap.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from '../oltp-scenario-a-semantic-gate.js';
import {
  SCENARIO_A_PROOF_CASE_STATUS,
  SCENARIO_A_PROOF_FAILURE_KIND,
  SCENARIO_A_SEMANTIC_GATE_STATUS,
  classifyProofCaseFailure,
  runScenarioASemanticProofJourney,
} from '../../scenarios/scenario-a-semantic-proof-journey.js';
import {
  evaluateScenarioARetryableConflictObservation,
} from '../oltp-scenario-a-retryable-conflict-case.js';
import {
  induceLagrangeRetryableConflict,
} from '../../reference-client/lagrange-retryable-conflict-probe.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);

const REFUSING_ENDPOINT = Object.freeze({host: '127.0.0.1', port: 1});
const ECONNREFUSED = 'ECONNREFUSED';

// No test here may reach the network: a real connect throws.
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function refuseRealSocket() {
  throw new Error('scenario-a-semantic-proof-journey.test.js opened a real socket');
};
process.once('exit', () => {
  net.Socket.prototype.connect = socketConnect;
});

// The seam fixture: a pg client whose connect is refused the way the native
// client refuses a closed port.
function createRefusingClientFactory() {
  const attempts = [];
  const createClient = (options) => ({
    connect: async () => {
      attempts.push(`${options.host}:${options.port}`);
      throw Object.assign(new Error(`connect ${ECONNREFUSED} ${options.host}:${options.port}`),
        {code: ECONNREFUSED, errno: -111, syscall: 'connect', address: options.host,
          port: options.port});
    },
    query: async () => {
      throw new Error('a refused client is never queried');
    },
    end: async () => {},
  });
  return {createClient, attempts};
}

const CREDENTIALS = Object.freeze({user: 'bench', password: 'bench', database: 'bench'});
const BINDING = Object.freeze({
  campaignId: 'campaign-fixture',
  containerId: 'container-fixture',
  imageId: 'sha256:fixture',
  endpoint: '127.0.0.1:1',
});

test('an unrunnable arm yields an incomplete, deployment-bound gate record', async () => {
  for (const system of ['postgresql', 'lagrange']) {
    const refusing = createRefusingClientFactory();
    const gate = await runScenarioASemanticProofJourney({
      system,
      connection: {endpoint: REFUSING_ENDPOINT, credentials: CREDENTIALS},
      binding: BINDING,
      createClient: refusing.createClient,
    });
    assert.ok(refusing.attempts.length > 0, 'every case connects through the seam');
    assert.equal(gate.system, system);
    assert.equal(gate.status, SCENARIO_A_SEMANTIC_GATE_STATUS.INCOMPLETE);
    assert.deepEqual(gate.binding, BINDING);
    assert.deepEqual(gate.passed, []);
    assert.deepEqual(gate.failed, []);
    assert.deepEqual(gate.missing, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
    const durability = arrayFind(gate.cases, (entry) => entry.caseId === 'durability');
    assert.equal(durability.status, SCENARIO_A_PROOF_CASE_STATUS.NOT_EXECUTED);
    for (const entry of gate.cases) {
      if (entry.caseId === 'durability') continue;
      assert.equal(entry.status, SCENARIO_A_PROOF_CASE_STATUS.ERRORED, entry.caseId);
      assert.match(entry.error, /ECONNREFUSED 127\.0\.0\.1:1/u, entry.caseId);
    }
  }
});

test('the journey refuses a missing binding and a non-PG-wire system', async () => {
  const connection = {endpoint: REFUSING_ENDPOINT, credentials: CREDENTIALS};
  const {createClient} = createRefusingClientFactory();
  await assert.rejects(runScenarioASemanticProofJourney({system: 'postgresql', connection,
    binding: BINDING, createClient: 'not-a-factory'}), /createClient must be a function/u);
  await assert.rejects(runScenarioASemanticProofJourney({system: 'tidb-tikv', connection,
    binding: BINDING, createClient}), /does not run tidb-tikv/u);
  await assert.rejects(runScenarioASemanticProofJourney({system: 'postgresql', connection,
    binding: {...BINDING, imageId: ''}, createClient}), /binding requires imageId/u);
  await assert.rejects(runScenarioASemanticProofJourney({system: 'postgresql', connection,
    binding: {...BINDING, endpoint: 'nowhere'}, createClient}), /host:port/u);
});

test('a rebind from beforeCase becomes the context of that case and every later case',
  async () => {
    const rebound = {...BINDING, containerId: 'container-reformed', endpoint: '127.0.0.1:2'};
    let calls = 0;
    const gate = await runScenarioASemanticProofJourney({
      system: 'postgresql',
      connection: {endpoint: REFUSING_ENDPOINT, credentials: CREDENTIALS},
      binding: BINDING,
      createClient: createRefusingClientFactory().createClient,
      beforeCase: async ({caseId}) => {
        calls += 1;
        if (caseId !== 'payment') return null;
        return {
          connection: {endpoint: {host: '127.0.0.1', port: 2}, credentials: CREDENTIALS},
          binding: rebound,
        };
      },
    });
    assert.ok(calls > 0);
    const caseIds = arrayMap(gate.cases, (entry) => entry.caseId);
    const paymentIndex = arrayIndexOf(caseIds, 'payment');
    for (let index = 0; index < gate.cases.length; index += 1) {
      const expected = index < paymentIndex ? BINDING : rebound;
      assert.deepEqual(gate.cases[index].binding, expected, gate.cases[index].caseId);
    }
    assert.deepEqual(gate.bindings, [BINDING, rebound]);
    assert.equal(gate.binding, null, 'a gate over two deployments names no single binding');
  });

test('a case whose connection differs from its binding is refused, typed', async () => {
  const gate = await runScenarioASemanticProofJourney({
    system: 'postgresql',
    connection: {endpoint: {host: '127.0.0.1', port: 3}, credentials: CREDENTIALS},
    binding: BINDING,
    createClient: createRefusingClientFactory().createClient,
  });
  for (const entry of gate.cases) {
    if (entry.caseId === 'durability') continue;
    assert.equal(entry.status, 'refused', entry.caseId);
    assert.equal(entry.reason, 'binding_changed_without_rebind');
  }
});

test('beforeCase must answer a rebind or an explicit null', async () => {
  const gate = await runScenarioASemanticProofJourney({
    system: 'postgresql',
    connection: {endpoint: REFUSING_ENDPOINT, credentials: CREDENTIALS},
    binding: BINDING,
    createClient: createRefusingClientFactory().createClient,
    beforeCase: async () => undefined,
  });
  assert.equal(gate.cases[0].status, 'errored');
  assert.match(gate.cases[0].error, /beforeCase must answer/u);
});

// Coordinator decision 4 (2026-11-02), from live campaign
// bench-live-20261101-b-r6: each failed or unobtained case says what kind of
// failure it is. Only a product_anomaly fails the gate; evidence that could
// not be obtained or a probe that does not apply leaves the gate incomplete.
// Durability on container-layer (smoke) storage is probe_inapplicable by the
// contract: it is recorded as such, the product is never restarted for it,
// and it never passes.
test('durability on non-persistent storage is probe_inapplicable; errored cases are ' +
  'evidence_insufficient; the gate carries the kinds and stays incomplete', async () => {
  let restarts = 0;
  const gate = await runScenarioASemanticProofJourney({
    system: 'postgresql',
    connection: {endpoint: REFUSING_ENDPOINT, credentials: CREDENTIALS},
    binding: BINDING,
    createClient: createRefusingClientFactory().createClient,
    persistentStorage: false,
    restartProduct: async () => {
      restarts += 1;
      return {};
    },
  });
  assert.equal(restarts, 0, 'the product is never restarted for an inapplicable probe');
  const durability = arrayFind(gate.cases, (entry) => entry.caseId === 'durability');
  assert.equal(durability.status, SCENARIO_A_PROOF_CASE_STATUS.FAILED);
  assert.equal(durability.failureKind, SCENARIO_A_PROOF_FAILURE_KIND.PROBE_INAPPLICABLE);
  assert.deepEqual(durability.failureReasons, ['durability_requires_persistent_storage']);
  const errored = arrayFind(gate.cases, (entry) => entry.caseId === 'payment');
  assert.equal(errored.failureKind, SCENARIO_A_PROOF_FAILURE_KIND.EVIDENCE_INSUFFICIENT);
  assert.deepEqual(errored.failureReasons, ['case_errored']);
  assert.equal(gate.status, SCENARIO_A_SEMANTIC_GATE_STATUS.INCOMPLETE);
  assert.deepEqual(gate.failed, []);
  assert.deepEqual(arrayFind(gate.failureKinds, (one) => one.caseId === 'durability'),
    {caseId: 'durability', kind: 'probe_inapplicable',
      reasons: ['durability_requires_persistent_storage']});
});

test('a case failure is classified by its evaluator reason codes', async () => {
  assert.equal(classifyProofCaseFailure('durability',
    ['fault_incarnation_unchanged', 'storage_continuity_invalid']), 'evidence_insufficient');
  assert.equal(classifyProofCaseFailure('durability',
    ['fault_incarnation_unchanged', 'durability_state']), 'product_anomaly');
  assert.equal(classifyProofCaseFailure('payment', ['history_row']), 'product_anomaly');
  assert.equal(classifyProofCaseFailure('retryable-conflict', ['lost_update']),
    'product_anomaly');
});

// Coordinator decision 5: the retryable-conflict proof asserts the externally
// observable contract of the semantic profile, not a mechanism. Two
// concurrent conflicting logical requests end either both committed with both
// effects present (a blocking engine: PostgreSQL READ COMMITTED), or with
// exactly one 40001 on the loser that then commits on retry through the retry
// owner (first-committer-wins: Lagrange). A lost update or any other SQLSTATE
// is a product anomaly. The mechanism observed is recorded as a fact.
test('the retryable-conflict contract: both effects survive, by either mechanism', async () => {
  const effects = (final) => ({baseline: 100, final, delta: 100});
  const pass = (observation) => evaluateScenarioARetryableConflictObservation(observation);
  assert.deepEqual(pass({mechanism: 'blocking-then-commit', victimSqlState: null,
    retryCommitted: null, effects: effects(300)}).failures, []);
  assert.deepEqual(pass({mechanism: 'serialization-conflict', victimSqlState: '40001',
    retryCommitted: true, effects: effects(300)}).failures, []);
  assert.equal(pass({mechanism: 'serialization-conflict', victimSqlState: '40001',
    retryCommitted: true, effects: effects(300)}).passed, true);
  assert.deepEqual(pass({mechanism: 'blocking-then-commit', victimSqlState: null,
    retryCommitted: null, effects: effects(200)}).failures, ['lost_update']);
  assert.deepEqual(pass({mechanism: 'serialization-conflict', victimSqlState: '40001',
    retryCommitted: false, effects: effects(200)}).failures,
  ['retry_not_committed', 'lost_update']);
  assert.deepEqual(pass({mechanism: 'other-error', victimSqlState: 'HY000',
    retryCommitted: null, effects: effects(200)}).failures,
  ['unexpected_sql_state', 'lost_update']);
  assert.deepEqual(pass({}).failures, ['effects_unobserved']);
});

// A fake engine behind the probe: one warehouse row; `mode` decides how it
// treats the second, conflicting update.
function createConflictEngine(mode) {
  const state = {value: 100, version: 0};
  const createClient = () => {
    const session = {snapshot: null, pending: 0};
    const conflicted = () => session.snapshot !== null && state.version !== session.snapshot;
    const handlers = {
      BEGIN: () => {
        session.snapshot = state.version;
        session.pending = 0;
        return {rows: []};
      },
      ROLLBACK: () => {
        session.snapshot = null;
        session.pending = 0;
        return {rows: []};
      },
      COMMIT: () => {
        state.value += session.pending;
        if (session.pending !== 0) state.version += 1;
        session.snapshot = null;
        session.pending = 0;
        return {rows: []};
      },
      SELECT: () => ({rows: [{ytd_cents: state.value}]}),
      UPDATE: (parameters) => {
        if (mode === 'serialization' && conflicted()) {
          throw Object.assign(new Error('could not serialize access'), {code: '40001'});
        }
        if (!(mode === 'lost' && conflicted())) session.pending += parameters[0];
        return {rowCount: 1, rows: []};
      },
    };
    return {
      connect: async () => {},
      end: async () => {},
      query: async (sql, parameters = []) => handlers[stringSplit(sql, ' ')[0]](parameters),
    };
  };
  return {createClient, state};
}

test('the conflict probe observes the mechanism and both effects', async () => {
  const run = (mode) => induceLagrangeRetryableConflict({endpoint: {host: '127.0.0.1', port: 1},
    connection: {user: 'u', database: 'd'}, createClient: createConflictEngine(mode).createClient,
    retrySleep: async () => {}});
  const blocking = await run('blocking');
  assert.equal(blocking.observation.mechanism, 'blocking-then-commit');
  assert.equal(blocking.observation.victimSqlState, null);
  assert.deepEqual(blocking.observation.effects, {baseline: 100, final: 300, delta: 100});
  const conflict = await run('serialization');
  assert.equal(conflict.observation.mechanism, 'serialization-conflict');
  assert.equal(conflict.observation.victimSqlState, '40001');
  assert.equal(conflict.observation.retryCommitted, true);
  assert.equal(conflict.observation.effects.final, 300);
  assert.ok(conflict.observation.retry.attempts >= 2);
  const lost = await run('lost');
  assert.equal(lost.observation.effects.final, 200);
  assert.deepEqual(evaluateScenarioARetryableConflictObservation(lost.observation).failures,
    ['lost_update']);
});
