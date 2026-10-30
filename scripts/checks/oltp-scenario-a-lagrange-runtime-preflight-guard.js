import assert from 'node:assert/strict';

import {
  computeSourceFingerprint,
} from '../../src/diagnostics/source-fingerprint.js';
import {
  LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-proof-plan.js';
import {
  buildLagrangeScenarioALiveAdmission,
  verifyLagrangeScenarioALiveAdmission,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-live-admission.js';
import {
  buildLagrangeScenarioARuntimePreflight,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-runtime-preflight.js';

const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const CORE_SHA_LENGTH = 40;
const ARTIFACT_SHA_LENGTH = 64;
const CORE_HEAD_SHA = 'a'.repeat(CORE_SHA_LENGTH);
const ARTIFACT_SHA256 = 'b'.repeat(ARTIFACT_SHA_LENGTH);
const TAMPERED_SHA_CHAR = 'f';
const DIGIT_ZERO = '0';
const DIGIT_ONE = '1';
const SRC_DIR = 'src';
const STATUS_PASSED = 'passed';
const PROOF_CASE_PAYMENT = 'payment';
const PROPERTY_COMPARABLE = 'comparable';
const PASS_PREFIX = 'oltp-scenario-a-lagrange-runtime-preflight-guard: PASS ';

function differentFingerprint(value) {
  const replacement = stringStartsWith(value, DIGIT_ZERO) ?
    DIGIT_ONE :
    DIGIT_ZERO;
  return replacement + value.slice(1);
}

const srcFingerprint = await computeSourceFingerprint(SRC_DIR);
const formationCertification = Object.freeze({
  ...LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
  status: STATUS_PASSED,
  coreHeadSha: CORE_HEAD_SHA,
  srcFingerprint,
  artifactSha256: ARTIFACT_SHA256,
});
const admission = buildLagrangeScenarioALiveAdmission({
  proofCaseId: PROOF_CASE_PAYMENT,
  formationCertification,
});

assert.deepEqual(verifyLagrangeScenarioALiveAdmission(admission), admission);
const first = await buildLagrangeScenarioARuntimePreflight(admission);
const second = await buildLagrangeScenarioARuntimePreflight(admission);
assert.deepEqual(first, second);
assert.equal(first.proofCaseId, PROOF_CASE_PAYMENT);
assert.equal(first.admissionSha256, admission.admissionSha256);
assert.equal(first.requiredCoreHeadSha, CORE_HEAD_SHA);
assert.equal(first.requiredSrcFingerprint, srcFingerprint);
assert.equal(first.observedSrcFingerprint, srcFingerprint);
assert.equal(first.srcFingerprintMatches, true);
assert.match(first.preflightSha256, /^[0-9a-f]{64}$/u);
assert.equal(Object.hasOwn(first, PROPERTY_COMPARABLE), false);
assert.equal(Object.isFrozen(first), true);

const tampered = {
  ...admission,
  requiredCoreHeadSha: TAMPERED_SHA_CHAR.repeat(CORE_SHA_LENGTH),
};
assert.throws(
  () => verifyLagrangeScenarioALiveAdmission(tampered),
  /content binding mismatch/u,
);
await assert.rejects(
  buildLagrangeScenarioARuntimePreflight(buildLagrangeScenarioALiveAdmission({
    proofCaseId: PROOF_CASE_PAYMENT,
    formationCertification: {
      ...formationCertification,
      srcFingerprint: differentFingerprint(srcFingerprint),
    },
  })),
  /runtime source fingerprint does not match formation certification/u,
);

console.log(
  PASS_PREFIX +
  JSON.stringify({srcFingerprint, proofCaseId: first.proofCaseId}),
);
