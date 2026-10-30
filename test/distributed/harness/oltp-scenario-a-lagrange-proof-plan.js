import {
  OLTP_SCENARIO_A_SYSTEM,
} from './oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from './oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from './oltp-scenario-a-semantic-profile.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from './oltp-scenario-a-semantic-gate.js';

const ZERO = 0;
const MIN_CERTIFICATION_STREAK = 3;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SRC_FINGERPRINT_PATTERN = /^[0-9a-f]{16}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringTrim = Function.call.bind(String.prototype.trim);

const FORMATION_REQUIREMENT = Object.freeze({
  epicId: 'formation-seed-decoupling',
  questId: 'five-node-cold-formation-certification',
  scenario: 'release-0-2-five-node-cold-formation',
  metric: 'priority',
  consecutive: MIN_CERTIFICATION_STREAK,
});

const PUBLIC_EXECUTION_CONTRACT = Object.freeze({
  serviceId: 'sys-postgres-wire',
  protocol: 'postgresql',
  executionPath: 'public-sql',
  adapter: 'lagrange-oltp-adapter',
  transactionExecutor: 'oltp-baseline-transaction-executor',
  retryOwner: 'oltp-paired-retry-owner',
  lockingReadMode: 'snapshot-write-conflict',
});

const CORE_MILESTONE = '0.3.2';
const COMPARATIVE_MILESTONE = '0.4';
const COMPARATIVE_OWNER = 'RM-0.4-scenario-a-comparison';
const COMPARATIVE_REASON =
  'Both-system semanticEquivalent gate and paired offered-load sweep belong to 0.4 comparative qualification';
const PROFILE_ID = OLTP_SCENARIO_A_SEMANTIC_PROFILE.id;
const PROFILE_SHA256 = hashScenarioASemanticProfile();

const PROOF_ID_TO_CASE_ID = new Map();
for (const proofCase of OLTP_SCENARIO_A_PROOF_CASES) {
  for (const proofId of proofCase.proofIds) {
    PROOF_ID_TO_CASE_ID.set(proofId, proofCase.id);
  }
}

function buildProofAccounting(options = {}) {
  const proofs = Array.isArray(options.proofs) ? options.proofs : null;
  const lagrangeProofs = proofs ?
    arrayFilter(proofs, (candidate) =>
      candidate && candidate.system === OLTP_SCENARIO_A_SYSTEM.LAGRANGE) :
    null;

  const accounting = arrayMap(OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS, (proofId) => {
    const colonIndex = stringIndexOf(proofId, ':');
    const category = proofId.slice(0, colonIndex);
    const predicate = proofId.slice(colonIndex + 1);
    const caseId = PROOF_ID_TO_CASE_ID.get(proofId);
    if (!caseId) {
      throw new Error(`Unmapped proofId in proof cases: ${proofId}`);
    }
    const scenarioModule = `test/distributed/scenarios/scenario-a-${caseId}-lagrange.js`;

    let receiptStatus = 'pending_live_execution';
    let receiptArtifactSha256 = null;

    if (lagrangeProofs) {
      const match = arrayFind(
        lagrangeProofs,
        (candidate) =>
          Array.isArray(candidate.proofIds) && arrayIncludes(candidate.proofIds, proofId),
      );
      if (match) {
        receiptStatus = match.status === 'passed' ? 'passed' : 'failed';
        receiptArtifactSha256 = match.artifactSha256 || null;
      }
    }

    return Object.freeze({
      proofId,
      category,
      predicate,
      caseId,
      scenarioModule,
      profileId: PROFILE_ID,
      profileSha256: PROFILE_SHA256,
      coreMilestone: CORE_MILESTONE,
      coreGuaranteeRequired: true,
      comparativeMilestone: COMPARATIVE_MILESTONE,
      comparativeOwner: COMPARATIVE_OWNER,
      comparativeReason: COMPARATIVE_REASON,
      receiptStatus,
      receiptArtifactSha256,
    });
  });

  return Object.freeze(accounting);
}

const LAGRANGE_SCENARIO_A_PROOF_ACCOUNTING = buildProofAccounting();

function requireText(value, label) {
  const text = stringTrim(String(value || ''));
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function normalizeFormationCertification(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('formation certification must be an object');
  }
  const certification = Object.freeze({
    epicId: requireText(value.epicId, 'formation certification epicId'),
    questId: requireText(value.questId, 'formation certification questId'),
    scenario: requireText(value.scenario, 'formation certification scenario'),
    metric: requireText(value.metric, 'formation certification metric'),
    status: requireText(value.status, 'formation certification status'),
    consecutive: Number(value.consecutive),
    coreHeadSha: stringToLowerCase(requireText(value.coreHeadSha, 'formation certification coreHeadSha')),
    srcFingerprint: stringToLowerCase(requireText(
      value.srcFingerprint,
      'formation certification srcFingerprint',
    )),
    artifactSha256: stringToLowerCase(requireText(
      value.artifactSha256,
      'formation certification artifactSha256',
    )),
  });

  if (certification.epicId !== FORMATION_REQUIREMENT.epicId ||
      certification.questId !== FORMATION_REQUIREMENT.questId ||
      certification.scenario !== FORMATION_REQUIREMENT.scenario ||
      certification.metric !== FORMATION_REQUIREMENT.metric) {
    throw new Error('formation certification does not satisfy Scenario A requirement');
  }
  if (certification.status !== 'passed') {
    throw new Error('formation certification must be passed');
  }
  if (!Number.isInteger(certification.consecutive) ||
      certification.consecutive < MIN_CERTIFICATION_STREAK) {
    throw new Error('formation certification streak is insufficient');
  }
  if (!GIT_SHA_PATTERN.test(certification.coreHeadSha)) {
    throw new Error('formation certification coreHeadSha must be a Git SHA');
  }
  if (!SRC_FINGERPRINT_PATTERN.test(certification.srcFingerprint)) {
    throw new Error('formation certification srcFingerprint must be 16 hex characters');
  }
  if (!SHA256_PATTERN.test(certification.artifactSha256)) {
    throw new Error('formation certification artifactSha256 must be a SHA-256 digest');
  }
  return certification;
}

function proofCount(cases) {
  return cases.reduce((count, proofCase) => count + proofCase.proofIds.length, ZERO);
}

function buildLagrangeScenarioAProofPlan(options = {}) {
  const formationCertification = normalizeFormationCertification(
    options.formationCertification,
  );
  const liveEnabled = formationCertification !== null;
  const cases = Object.freeze(arrayMap(OLTP_SCENARIO_A_PROOF_CASES, (proofCase) =>
    Object.freeze({
      id: proofCase.id,
      system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      proofIds: proofCase.proofIds,
      scenarioModule: `test/distributed/scenarios/scenario-a-${proofCase.id}-lagrange.js`,
      ...PUBLIC_EXECUTION_CONTRACT,
    })));

  const proofAccounting = Array.isArray(options.proofs) ?
    buildProofAccounting(options) :
    LAGRANGE_SCENARIO_A_PROOF_ACCOUNTING;

  return Object.freeze({
    system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
    proofCaseCount: cases.length,
    proofCount: proofCount(cases),
    publicExecutionContract: PUBLIC_EXECUTION_CONTRACT,
    formationRequirement: FORMATION_REQUIREMENT,
    formationCertification,
    liveEnabled,
    state: liveEnabled ? 'ready' : 'blocked',
    blocker: liveEnabled ? null : Object.freeze({
      owner: FORMATION_REQUIREMENT.epicId,
      quest: FORMATION_REQUIREMENT.questId,
      reason: 'formation-certification-required',
    }),
    cases,
    proofAccounting,
  });
}

export {
  FORMATION_REQUIREMENT as LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
  PUBLIC_EXECUTION_CONTRACT as LAGRANGE_SCENARIO_A_PUBLIC_EXECUTION_CONTRACT,
  LAGRANGE_SCENARIO_A_PROOF_ACCOUNTING,
  buildLagrangeScenarioAProofPlan,
};
