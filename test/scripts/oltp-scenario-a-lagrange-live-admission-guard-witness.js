import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
  LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
} from '../distributed/harness/oltp-scenario-a-lagrange-proof-plan.js';
import {
  buildLagrangeScenarioALiveAdmission,
} from '../distributed/harness/oltp-scenario-a-lagrange-live-admission.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from '../distributed/harness/oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from '../distributed/harness/oltp-scenario-a-semantic-gate.js';

const CORE_HEAD_SHA = 'a'.repeat(40);
const SRC_FINGERPRINT = 'c'.repeat(16);
const ARTIFACT_SHA256 = 'b'.repeat(64);

function certification(overrides = {}) {
  return {
    ...LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
    status: 'passed',
    coreHeadSha: CORE_HEAD_SHA,
    srcFingerprint: SRC_FINGERPRINT,
    artifactSha256: ARTIFACT_SHA256,
    ...overrides,
  };
}

assert.throws(
  () => buildLagrangeScenarioALiveAdmission({proofCaseId: 'payment'}),
  /requires passed formation certification/u,
);
assert.throws(
  () => buildLagrangeScenarioALiveAdmission({
    proofCaseId: 'unknown-case',
    formationCertification: certification(),
  }),
  /unknown Lagrange Scenario A proof case/u,
);
assert.throws(
  () => buildLagrangeScenarioALiveAdmission({
    proofCaseId: 'payment',
    formationCertification: certification(),
    executionPath: 'internal-sql',
  }),
  /unsupported Lagrange Scenario A live admission option executionPath/u,
);
assert.throws(
  () => buildLagrangeScenarioALiveAdmission({
    proofCaseId: 'payment',
    formationCertification: certification(),
    retryCount: 100,
  }),
  /unsupported Lagrange Scenario A live admission option retryCount/u,
);
assert.throws(
  () => buildLagrangeScenarioALiveAdmission({
    proofCaseId: 'payment',
    formationCertification: certification({srcFingerprint: 'bad'}),
  }),
  /srcFingerprint must be 16 hex characters/u,
);

const firstPayment = buildLagrangeScenarioALiveAdmission({
  proofCaseId: 'payment',
  formationCertification: certification(),
});
const secondPayment = buildLagrangeScenarioALiveAdmission({
  proofCaseId: 'payment',
  formationCertification: certification(),
});
assert.deepEqual(firstPayment, secondPayment);
assert.match(firstPayment.admissionSha256, /^[0-9a-f]{64}$/u);
assert.equal(firstPayment.requiredCoreHeadSha, CORE_HEAD_SHA);
assert.equal(firstPayment.requiredSrcFingerprint, SRC_FINGERPRINT);
assert.equal(firstPayment.publicExecutionContract.serviceId, 'sys-postgres-wire');
assert.equal(firstPayment.publicExecutionContract.protocol, 'postgresql');
assert.equal(firstPayment.publicExecutionContract.executionPath, 'public-sql');
assert.equal(firstPayment.publicExecutionContract.adapter, 'lagrange-oltp-adapter');
assert.equal(
  firstPayment.publicExecutionContract.transactionExecutor,
  'oltp-baseline-transaction-executor',
);
assert.equal(
  firstPayment.publicExecutionContract.retryOwner,
  'oltp-paired-retry-owner',
);
assert.equal(
  firstPayment.publicExecutionContract.lockingReadMode,
  'snapshot-write-conflict',
);
assert.equal(Object.hasOwn(firstPayment, 'comparable'), false);
assert.equal(Object.isFrozen(firstPayment), true);
assert.equal(Object.isFrozen(firstPayment.formationCertification), true);
assert.equal(Object.isFrozen(firstPayment.publicExecutionContract), true);

const admissions = OLTP_SCENARIO_A_PROOF_CASES.map(({id}) =>
  buildLagrangeScenarioALiveAdmission({
    proofCaseId: id,
    formationCertification: certification(),
  }));
assert.equal(admissions.length, 9);
assert.equal(new Set(admissions.map(({admissionSha256}) => admissionSha256)).size, 9);
const allProofIds = admissions.flatMap(({proofIds}) => proofIds).sort();
assert.equal(new Set(allProofIds).size, allProofIds.length);
assert.deepEqual(allProofIds, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
for (const admission of admissions) {
  assert.equal(admission.requiredCoreHeadSha, CORE_HEAD_SHA);
  assert.equal(admission.requiredSrcFingerprint, SRC_FINGERPRINT);
  assert.equal(admission.formationCertification.artifactSha256, ARTIFACT_SHA256);
  assert.equal(admission.publicExecutionContract.serviceId, 'sys-postgres-wire');
  assert.equal(admission.publicExecutionContract.executionPath, 'public-sql');
}

// R27: Quest measurement inspects the runner's committed ordering; the
// dedicated scenario-a-prestart-admission.test.js independently exercises the seam.
function preStartBoundaryDeficit() {
  const source = readFileSync('test/distributed/run-runtime-helpers.js', 'utf8');
  const loadAt = source.indexOf('const scenarioModule = await loadScenarioModule(scenario.path);');
  const preStartAt = source.indexOf('await scenarioModule.preStart()');
  const constructAt = source.indexOf('cluster = clusterFactory(');
  const runnerDeficit = loadAt >= 0 && preStartAt > loadAt && preStartAt < constructAt ?
    0 : 1;
  const visibilitySource = readFileSync(
    'test/distributed/scenarios/scenario-a-visibility-lagrange.js', 'utf8');
  const runAt = visibilitySource.indexOf('async function prepareAdmittedVisibilityContext(');
  const runtimeCheckAt = visibilitySource.indexOf(
    'await buildLagrangeScenarioARuntimePreflight(admission)', runAt);
  const sqlContextAt = visibilitySource.indexOf(
    'prepareLagrangeScenarioAPublicPgContext({cluster, admission})', runAt);
  const runtimeDeficit = runtimeCheckAt > runAt && runtimeCheckAt < sqlContextAt ? 0 : 1;
  return runnerDeficit + runtimeDeficit;
}

function evaluateLagrangeScenarioALiveAdmissionGuard() {
  return Object.freeze({
    metric: preStartBoundaryDeficit(),
    summary: 'oltp-scenario-a-lagrange-live-admission-guard: PASS ' +
      JSON.stringify({admissions: admissions.length, proofIds: allProofIds.length}),
  });
}

export {evaluateLagrangeScenarioALiveAdmissionGuard};
