import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
  LAGRANGE_SCENARIO_A_PUBLIC_EXECUTION_CONTRACT,
  buildLagrangeScenarioAProofPlan,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-proof-plan.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';

const ARTIFACT_SHA256 = 'd'.repeat(64);
const CORE_HEAD_SHA = 'c'.repeat(40);

function allProofIds(plan) {
  return plan.cases.flatMap(({proofIds}) => proofIds).sort();
}

function formationCertification(overrides = {}) {
  return {
    ...LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
    status: 'passed',
    coreHeadSha: CORE_HEAD_SHA,
    artifactSha256: ARTIFACT_SHA256,
    ...overrides,
  };
}

const blocked = buildLagrangeScenarioAProofPlan();
assert.equal(blocked.system, OLTP_SCENARIO_A_SYSTEM.LAGRANGE);
assert.equal(blocked.liveEnabled, false);
assert.equal(blocked.state, 'blocked');
assert.deepEqual(blocked.formationCertification, null);
assert.deepEqual(blocked.blocker, {
  owner: 'formation-seed-decoupling',
  quest: 'five-node-cold-formation-certification',
  reason: 'formation-certification-required',
});
assert.equal(blocked.proofCaseCount, 9);
assert.equal(blocked.proofCount, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length);
assert.equal(new Set(allProofIds(blocked)).size, allProofIds(blocked).length);
assert.deepEqual(allProofIds(blocked), OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
assert.equal(Object.hasOwn(blocked, 'comparable'), false);

for (const proofCase of blocked.cases) {
  assert.equal(proofCase.system, OLTP_SCENARIO_A_SYSTEM.LAGRANGE);
  assert.equal(proofCase.protocol, 'postgresql');
  assert.equal(proofCase.executionPath, 'public-sql');
  assert.equal(proofCase.adapter, 'lagrange-oltp-adapter');
  assert.equal(proofCase.transactionExecutor, 'oltp-baseline-transaction-executor');
  assert.equal(proofCase.retryOwner, 'oltp-paired-retry-owner');
  assert.equal(proofCase.lockingReadMode, 'snapshot-write-conflict');
}
assert.deepEqual(
  blocked.publicExecutionContract,
  LAGRANGE_SCENARIO_A_PUBLIC_EXECUTION_CONTRACT,
);

assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({status: 'failed'}),
  }),
  /formation certification must be passed/u,
);
assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({consecutive: 2}),
  }),
  /formation certification streak is insufficient/u,
);
assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({scenario: 'wrong-scenario'}),
  }),
  /does not satisfy Scenario A requirement/u,
);
assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({coreHeadSha: 'not-a-sha'}),
  }),
  /coreHeadSha must be a Git SHA/u,
);
assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({artifactSha256: 'not-a-digest'}),
  }),
  /artifactSha256 must be a SHA-256 digest/u,
);

const ready = buildLagrangeScenarioAProofPlan({
  formationCertification: formationCertification(),
});
assert.equal(ready.liveEnabled, true);
assert.equal(ready.state, 'ready');
assert.equal(ready.blocker, null);
assert.equal(ready.formationCertification.status, 'passed');
assert.equal(ready.formationCertification.consecutive, 3);

const proofs = ready.cases.map((proofCase) => Object.freeze({
  evidenceId: `lagrange-plan-${proofCase.id}`,
  system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
  status: OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED,
  artifactSha256: ARTIFACT_SHA256,
  proofIds: proofCase.proofIds,
}));
const gate = buildScenarioASemanticGateEvidence({proofs});
const lagrange = gate.systems[OLTP_SCENARIO_A_SYSTEM.LAGRANGE];
assert.deepEqual(lagrange.failedProofIds, []);
assert.deepEqual(lagrange.missingProofIds, []);
assert.deepEqual(lagrange.passedProofIds, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
assert.equal(gate.semanticEquivalent, false);
assert.equal(gate.status, 'incomplete');

console.log(
  'oltp-scenario-a-lagrange-proof-plan-guard: PASS ' +
  JSON.stringify({
    proofCases: ready.proofCaseCount,
    proofIds: ready.proofCount,
    liveEnabledWithoutCertification: blocked.liveEnabled,
  }),
);
