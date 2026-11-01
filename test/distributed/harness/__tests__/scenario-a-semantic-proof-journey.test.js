// The Scenario A semantic proof journey's gate record: bound to the
// caller's deployment, one shared proof body per case for Lagrange and
// PostgreSQL, and `incomplete` (never null) when no proof record exists.
// Evidence ceiling: the endpoint refuses connections (127.0.0.1:1), so this
// proves the record contract and the unrunnable path, not a passing proof.
import assert from 'node:assert/strict';

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

const REFUSING_ENDPOINT = Object.freeze({host: '127.0.0.1', port: 1});
const CREDENTIALS = Object.freeze({user: 'bench', password: 'bench', database: 'bench'});
const BINDING = Object.freeze({
  campaignId: 'campaign-fixture',
  containerId: 'container-fixture',
  imageId: 'sha256:fixture',
  endpoint: '127.0.0.1:1',
});

test('an unrunnable arm yields an incomplete, deployment-bound gate record', async () => {
  for (const system of ['postgresql', 'lagrange']) {
    const gate = await runScenarioASemanticProofJourney({
      system,
      connection: {endpoint: REFUSING_ENDPOINT, credentials: CREDENTIALS},
      binding: BINDING,
    });
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
    }
  }
});

test('the journey refuses a missing binding and a non-PG-wire system', async () => {
  const connection = {endpoint: REFUSING_ENDPOINT, credentials: CREDENTIALS};
  await assert.rejects(runScenarioASemanticProofJourney({system: 'tidb-tikv', connection,
    binding: BINDING}), /does not run tidb-tikv/u);
  await assert.rejects(runScenarioASemanticProofJourney({system: 'postgresql', connection,
    binding: {...BINDING, imageId: ''}}), /binding requires imageId/u);
  await assert.rejects(runScenarioASemanticProofJourney({system: 'postgresql', connection,
    binding: {...BINDING, endpoint: 'nowhere'}}), /host:port/u);
});
