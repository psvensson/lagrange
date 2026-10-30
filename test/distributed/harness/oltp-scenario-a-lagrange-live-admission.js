import {createHash} from 'node:crypto';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from './oltp-scenario-a-comparison-systems.js';
import {
  buildLagrangeScenarioAProofPlan,
} from './oltp-scenario-a-lagrange-proof-plan.js';

const ONE = 1;
const ADMISSION_TYPE = 'lagrange-scenario-a-live-proof';
const ALLOWED_OPTION_KEYS = Object.freeze([
  'formationCertification',
  'proofCaseId',
]);
const ADMISSION_KEYS = Object.freeze([
  'schemaVersion',
  'admissionType',
  'system',
  'proofCaseId',
  'proofIds',
  'requiredCoreHeadSha',
  'requiredSrcFingerprint',
  'formationCertification',
  'publicExecutionContract',
  'admissionSha256',
].sort());

function requireOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lagrange Scenario A live admission requires options');
  }
  const unknown = Object.keys(value).filter(
    (key) => !ALLOWED_OPTION_KEYS.includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(
      `unsupported Lagrange Scenario A live admission option ${unknown.sort()[0]}`,
    );
  }
  return value;
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function hashAdmission(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function buildLagrangeScenarioALiveAdmission(value) {
  const options = requireOptions(value);
  const proofCaseId = requireText(options.proofCaseId, 'proofCaseId');
  const plan = buildLagrangeScenarioAProofPlan({
    formationCertification: options.formationCertification,
  });
  if (!plan.liveEnabled) {
    throw new Error(
      'Lagrange Scenario A live proof requires passed formation certification',
    );
  }
  const proofCase = plan.cases.find(({id}) => id === proofCaseId);
  if (!proofCase) {
    throw new Error(`unknown Lagrange Scenario A proof case ${proofCaseId}`);
  }

  const payload = Object.freeze({
    schemaVersion: ONE,
    admissionType: ADMISSION_TYPE,
    system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
    proofCaseId: proofCase.id,
    proofIds: proofCase.proofIds,
    requiredCoreHeadSha: plan.formationCertification.coreHeadSha,
    requiredSrcFingerprint: plan.formationCertification.srcFingerprint,
    formationCertification: plan.formationCertification,
    publicExecutionContract: plan.publicExecutionContract,
  });
  return Object.freeze({
    ...payload,
    admissionSha256: hashAdmission(payload),
  });
}

function verifyLagrangeScenarioALiveAdmission(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lagrange Scenario A live admission must be an object');
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(ADMISSION_KEYS)) {
    throw new Error('Lagrange Scenario A live admission shape is invalid');
  }
  const expected = buildLagrangeScenarioALiveAdmission({
    proofCaseId: value.proofCaseId,
    formationCertification: value.formationCertification,
  });
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error('Lagrange Scenario A live admission content binding mismatch');
  }
  return expected;
}

export {
  buildLagrangeScenarioALiveAdmission,
  verifyLagrangeScenarioALiveAdmission,
};
