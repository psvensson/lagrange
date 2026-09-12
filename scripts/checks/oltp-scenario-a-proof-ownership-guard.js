import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  buildLagrangeScenarioAProofPlan,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-proof-plan.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from '../../test/distributed/harness/oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';

const ARTIFACT_SHA256 = 'e'.repeat(64);

function proofFor(caseDefinition, system) {
  return Object.freeze({
    evidenceId: `ownership-${caseDefinition.id}`,
    system,
    status: OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED,
    artifactSha256: ARTIFACT_SHA256,
    proofIds: caseDefinition.proofIds,
  });
}

const allProofIds = OLTP_SCENARIO_A_PROOF_CASES
  .flatMap(({proofIds}) => proofIds)
  .sort();
assert.equal(
  new Set(allProofIds).size,
  allProofIds.length,
  'Scenario A semantic case owners must not claim the same proof ID twice',
);
assert.deepEqual(
  allProofIds,
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  'Scenario A case owners must cover every required semantic proof ID',
);

const lagrangePlan = buildLagrangeScenarioAProofPlan();
assert.equal(lagrangePlan.liveEnabled, false);
assert.deepEqual(
  lagrangePlan.cases.map(({id}) => id),
  OLTP_SCENARIO_A_PROOF_CASES.map(({id}) => id),
);
assert.deepEqual(
  lagrangePlan.cases.flatMap(({proofIds}) => proofIds).sort(),
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
);

const gate = buildScenarioASemanticGateEvidence({
  proofs: OLTP_SCENARIO_A_PROOF_CASES.map((proofCase) =>
    proofFor(proofCase, OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV)),
});
const tidb = gate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV];
const lagrange = gate.systems[OLTP_SCENARIO_A_SYSTEM.LAGRANGE];
assert.equal(gate.status, 'incomplete');
assert.equal(gate.semanticEquivalent, false);
assert.deepEqual(tidb.failedProofIds, []);
assert.deepEqual(tidb.missingProofIds, []);
assert.deepEqual(tidb.passedProofIds, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
assert.deepEqual(lagrange.passedProofIds, []);
assert.deepEqual(lagrange.failedProofIds, []);
assert.deepEqual(lagrange.missingProofIds, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);

console.log(
  'oltp-scenario-a-proof-ownership-guard: PASS ' +
  JSON.stringify({
    tidbProofCount: tidb.passedProofIds.length,
    lagrangePlannedProofCount: lagrangePlan.proofCount,
    lagrangeLiveEnabled: lagrangePlan.liveEnabled,
  }),
);
