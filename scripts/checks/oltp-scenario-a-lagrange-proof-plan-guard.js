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

const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayMap = Function.call.bind(Array.prototype.map);

const SHA_LENGTH = 64;
const CORE_SHA_LENGTH = 40;
const FINGERPRINT_LENGTH = 16;
const ARTIFACT_SHA256 = 'd'.repeat(SHA_LENGTH);
const CORE_HEAD_SHA = 'c'.repeat(CORE_SHA_LENGTH);
const SRC_FINGERPRINT = 'b'.repeat(FINGERPRINT_LENGTH);

const STATUS_PASSED = 'passed';
const STATUS_FAILED = 'failed';
const STATE_BLOCKED = 'blocked';
const STATE_READY = 'ready';
const GATE_STATUS_INCOMPLETE = 'incomplete';
const BLOCKER_OWNER = 'formation-seed-decoupling';
const BLOCKER_QUEST = 'five-node-cold-formation-certification';
const BLOCKER_REASON = 'formation-certification-required';
const BLOCKER_SPEC = Object.freeze({
  owner: BLOCKER_OWNER,
  quest: BLOCKER_QUEST,
  reason: BLOCKER_REASON,
});
const EXPECTED_PROOF_CASE_COUNT = 9;
const EXPECTED_CONSECUTIVE_COUNT = 3;
const PROPERTY_COMPARABLE = 'comparable';
const EXPECTED_SERVICE_ID = 'sys-postgres-wire';
const EXPECTED_PROTOCOL = 'postgresql';
const EXPECTED_EXECUTION_PATH = 'public-sql';
const EXPECTED_ADAPTER = 'lagrange-oltp-adapter';
const EXPECTED_TRANSACTION_EXECUTOR = 'oltp-baseline-transaction-executor';
const EXPECTED_RETRY_OWNER = 'oltp-paired-retry-owner';
const EXPECTED_LOCKING_READ_MODE = 'snapshot-write-conflict';
const WRONG_SCENARIO = 'wrong-scenario';
const INVALID_SHA = 'not-a-sha';
const INVALID_FINGERPRINT = 'not-fingerprint';
const INVALID_DIGEST = 'not-a-digest';
const PASS_PREFIX = 'oltp-scenario-a-lagrange-proof-plan-guard: PASS ';

function allProofIds(plan) {
  return arrayFlatMap(plan.cases, ({proofIds}) => proofIds).sort();
}

function formationCertification(overrides = {}) {
  return {
    ...LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
    status: STATUS_PASSED,
    coreHeadSha: CORE_HEAD_SHA,
    srcFingerprint: SRC_FINGERPRINT,
    artifactSha256: ARTIFACT_SHA256,
    ...overrides,
  };
}

const blocked = buildLagrangeScenarioAProofPlan();
assert.equal(blocked.system, OLTP_SCENARIO_A_SYSTEM.LAGRANGE);
assert.equal(blocked.liveEnabled, false);
assert.equal(blocked.state, STATE_BLOCKED);
assert.deepEqual(blocked.formationCertification, null);
assert.deepEqual(blocked.blocker, BLOCKER_SPEC);
assert.equal(blocked.proofCaseCount, EXPECTED_PROOF_CASE_COUNT);
assert.equal(blocked.proofCount, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length);
assert.equal(new Set(allProofIds(blocked)).size, allProofIds(blocked).length);
assert.deepEqual(allProofIds(blocked), OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
assert.equal(Object.hasOwn(blocked, PROPERTY_COMPARABLE), false);

for (const proofCase of blocked.cases) {
  assert.equal(proofCase.system, OLTP_SCENARIO_A_SYSTEM.LAGRANGE);
  assert.equal(proofCase.serviceId, EXPECTED_SERVICE_ID);
  assert.equal(proofCase.protocol, EXPECTED_PROTOCOL);
  assert.equal(proofCase.executionPath, EXPECTED_EXECUTION_PATH);
  assert.equal(proofCase.adapter, EXPECTED_ADAPTER);
  assert.equal(proofCase.transactionExecutor, EXPECTED_TRANSACTION_EXECUTOR);
  assert.equal(proofCase.retryOwner, EXPECTED_RETRY_OWNER);
  assert.equal(proofCase.lockingReadMode, EXPECTED_LOCKING_READ_MODE);
}
assert.deepEqual(
  blocked.publicExecutionContract,
  LAGRANGE_SCENARIO_A_PUBLIC_EXECUTION_CONTRACT,
);

assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({status: STATUS_FAILED}),
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
    formationCertification: formationCertification({scenario: WRONG_SCENARIO}),
  }),
  /does not satisfy Scenario A requirement/u,
);
assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({coreHeadSha: INVALID_SHA}),
  }),
  /coreHeadSha must be a Git SHA/u,
);
assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({srcFingerprint: INVALID_FINGERPRINT}),
  }),
  /srcFingerprint must be 16 hex characters/u,
);
assert.throws(
  () => buildLagrangeScenarioAProofPlan({
    formationCertification: formationCertification({artifactSha256: INVALID_DIGEST}),
  }),
  /artifactSha256 must be a SHA-256 digest/u,
);

const ready = buildLagrangeScenarioAProofPlan({
  formationCertification: formationCertification(),
});
assert.equal(ready.liveEnabled, true);
assert.equal(ready.state, STATE_READY);
assert.equal(ready.blocker, null);
assert.equal(ready.formationCertification.status, STATUS_PASSED);
assert.equal(ready.formationCertification.consecutive, EXPECTED_CONSECUTIVE_COUNT);
assert.equal(ready.formationCertification.srcFingerprint, SRC_FINGERPRINT);

const proofs = arrayMap(ready.cases, (proofCase) => Object.freeze({
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
assert.equal(gate.status, GATE_STATUS_INCOMPLETE);

console.log(
  PASS_PREFIX +
  JSON.stringify({
    proofCases: ready.proofCaseCount,
    proofIds: ready.proofCount,
    liveEnabledWithoutCertification: blocked.liveEnabled,
  }),
);
