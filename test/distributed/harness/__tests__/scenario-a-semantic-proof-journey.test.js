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
  SCENARIO_A_SEMANTIC_GATE_STATUS,
  runScenarioASemanticProofJourney,
} from '../../scenarios/scenario-a-semantic-proof-journey.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);

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
