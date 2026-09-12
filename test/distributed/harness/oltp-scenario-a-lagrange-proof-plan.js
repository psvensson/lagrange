import {
  OLTP_SCENARIO_A_SYSTEM,
} from './oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from './oltp-scenario-a-proof-cases.js';

const ZERO = 0;
const MIN_CERTIFICATION_STREAK = 3;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const FORMATION_REQUIREMENT = Object.freeze({
  epicId: 'formation-seed-decoupling',
  questId: 'five-node-cold-formation-certification',
  scenario: 'release-0-2-five-node-cold-formation',
  metric: 'priority',
  consecutive: MIN_CERTIFICATION_STREAK,
});

const PUBLIC_EXECUTION_CONTRACT = Object.freeze({
  protocol: 'postgresql',
  executionPath: 'public-sql',
  adapter: 'lagrange-oltp-adapter',
  transactionExecutor: 'oltp-baseline-transaction-executor',
  retryOwner: 'oltp-paired-retry-owner',
  lockingReadMode: 'snapshot-write-conflict',
});

function requireText(value, label) {
  const text = String(value || '').trim();
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
    coreHeadSha: requireText(value.coreHeadSha, 'formation certification coreHeadSha')
      .toLowerCase(),
    artifactSha256: requireText(
      value.artifactSha256,
      'formation certification artifactSha256',
    ).toLowerCase(),
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
  const cases = Object.freeze(OLTP_SCENARIO_A_PROOF_CASES.map((proofCase) =>
    Object.freeze({
      id: proofCase.id,
      system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      proofIds: proofCase.proofIds,
      ...PUBLIC_EXECUTION_CONTRACT,
    })));

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
  });
}

export {
  FORMATION_REQUIREMENT as LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
  PUBLIC_EXECUTION_CONTRACT as LAGRANGE_SCENARIO_A_PUBLIC_EXECUTION_CONTRACT,
  buildLagrangeScenarioAProofPlan,
};
