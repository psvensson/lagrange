import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

import {
  computeSourceFingerprint,
} from '../../../src/diagnostics/source-fingerprint.js';
import {
  verifyLagrangeScenarioALiveAdmission,
} from './oltp-scenario-a-lagrange-live-admission.js';

const ONE = 1;
const SOURCE_ROOT = fileURLToPath(new URL('../../../src', import.meta.url));

function hashPreflight(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

async function buildLagrangeScenarioARuntimePreflight(admission) {
  const verifiedAdmission = verifyLagrangeScenarioALiveAdmission(admission);
  const observedSrcFingerprint = await computeSourceFingerprint(SOURCE_ROOT);
  if (observedSrcFingerprint !== verifiedAdmission.requiredSrcFingerprint) {
    throw new Error(
      'Lagrange Scenario A runtime source fingerprint does not match formation certification',
    );
  }

  const payload = Object.freeze({
    schemaVersion: ONE,
    preflightType: 'lagrange-scenario-a-runtime-source',
    system: verifiedAdmission.system,
    proofCaseId: verifiedAdmission.proofCaseId,
    admissionSha256: verifiedAdmission.admissionSha256,
    requiredCoreHeadSha: verifiedAdmission.requiredCoreHeadSha,
    requiredSrcFingerprint: verifiedAdmission.requiredSrcFingerprint,
    observedSrcFingerprint,
    srcFingerprintMatches: true,
  });
  return Object.freeze({
    ...payload,
    preflightSha256: hashPreflight(payload),
  });
}

export {
  buildLagrangeScenarioARuntimePreflight,
};
