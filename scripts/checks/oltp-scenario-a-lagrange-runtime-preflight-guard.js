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

const CORE_HEAD_SHA = 'a'.repeat(40);
const ARTIFACT_SHA256 = 'b'.repeat(64);

function differentFingerprint(value) {
  const replacement = value.startsWith('0') ? '1' : '0';
  return replacement + value.slice(1);
}

const srcFingerprint = await computeSourceFingerprint('src');
const formationCertification = Object.freeze({
  ...LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
  status: 'passed',
  coreHeadSha: CORE_HEAD_SHA,
  srcFingerprint,
  artifactSha256: ARTIFACT_SHA256,
});
const admission = buildLagrangeScenarioALiveAdmission({
  proofCaseId: 'payment',
  formationCertification,
});

assert.deepEqual(verifyLagrangeScenarioALiveAdmission(admission), admission);
const first = await buildLagrangeScenarioARuntimePreflight(admission);
const second = await buildLagrangeScenarioARuntimePreflight(admission);
assert.deepEqual(first, second);
assert.equal(first.proofCaseId, 'payment');
assert.equal(first.admissionSha256, admission.admissionSha256);
assert.equal(first.requiredCoreHeadSha, CORE_HEAD_SHA);
assert.equal(first.requiredSrcFingerprint, srcFingerprint);
assert.equal(first.observedSrcFingerprint, srcFingerprint);
assert.equal(first.srcFingerprintMatches, true);
assert.match(first.preflightSha256, /^[0-9a-f]{64}$/u);
assert.equal(Object.hasOwn(first, 'comparable'), false);
assert.equal(Object.isFrozen(first), true);

const tampered = {
  ...admission,
  requiredCoreHeadSha: 'f'.repeat(40),
};
assert.throws(
  () => verifyLagrangeScenarioALiveAdmission(tampered),
  /content binding mismatch/u,
);
await assert.rejects(
  buildLagrangeScenarioARuntimePreflight(buildLagrangeScenarioALiveAdmission({
    proofCaseId: 'payment',
    formationCertification: {
      ...formationCertification,
      srcFingerprint: differentFingerprint(srcFingerprint),
    },
  })),
  /runtime source fingerprint does not match formation certification/u,
);

console.log(
  'oltp-scenario-a-lagrange-runtime-preflight-guard: PASS ' +
  JSON.stringify({srcFingerprint, proofCaseId: first.proofCaseId}),
);
