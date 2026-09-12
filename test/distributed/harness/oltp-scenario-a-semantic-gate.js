import {createHash} from 'node:crypto';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from './oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from './oltp-scenario-a-semantic-profile.js';

const ZERO = 0;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const STATUS = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
});
const SYSTEMS = Object.freeze(Object.values(OLTP_SCENARIO_A_SYSTEM));

function requiredSystemProofIds() {
  const profile = OLTP_SCENARIO_A_SEMANTIC_PROFILE;
  const ids = [];
  for (const [key, required] of Object.entries(profile.isolation)) {
    if (required === true) ids.push(`isolation:${key}`);
  }
  ids.push(
    `outcome:retryableConflictSqlState:${profile.outcomes.retryableConflictSqlState}`,
  );
  for (const anomaly of profile.forbiddenAnomalies) {
    ids.push(`forbidden:${anomaly}`);
  }
  if (profile.failureAtomicity.required) {
    ids.push(`failureAtomicity:${profile.failureAtomicity.rule}`);
  }
  for (const [family, contract] of
    Object.entries(profile.transactionFamilies)) {
    for (const invariant of contract.successInvariants) {
      ids.push(`transaction:${family}:${invariant}`);
    }
  }
  return Object.freeze([...ids].sort());
}

const REQUIRED_SYSTEM_PROOF_IDS = requiredSystemProofIds();
const REQUIRED_SYSTEM_PROOF_SET = new Set(REQUIRED_SYSTEM_PROOF_IDS);

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireSha256(value, label) {
  const digest = requireText(value, label).toLowerCase();
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function normalizeSystem(value) {
  const system = requireText(value, 'semantic proof system');
  if (!SYSTEMS.includes(system)) {
    throw new Error(`unsupported semantic proof system ${system}`);
  }
  return system;
}

function normalizeStatus(value) {
  const status = requireText(value, 'semantic proof status');
  if (!Object.values(STATUS).includes(status)) {
    throw new Error(`unsupported semantic proof status ${status}`);
  }
  return status;
}

function normalizeProofIds(values) {
  if (!Array.isArray(values) || values.length === ZERO) {
    throw new Error('semantic proof requires proofIds');
  }
  const ids = values.map((value) => requireText(value, 'semantic proof id'));
  if (new Set(ids).size !== ids.length) {
    throw new Error('semantic proof contains duplicate proofIds');
  }
  for (const id of ids) {
    if (!REQUIRED_SYSTEM_PROOF_SET.has(id)) {
      throw new Error(`unknown Scenario A semantic proof id ${id}`);
    }
  }
  return Object.freeze([...ids].sort());
}

function normalizeProof(value = {}) {
  return Object.freeze({
    evidenceId: requireText(value.evidenceId, 'semantic proof evidenceId'),
    system: normalizeSystem(value.system),
    status: normalizeStatus(value.status),
    artifactSha256: requireSha256(
      value.artifactSha256,
      'semantic proof artifactSha256',
    ),
    proofIds: normalizeProofIds(value.proofIds),
  });
}

function normalizeProofs(values = []) {
  if (!Array.isArray(values)) throw new Error('semantic proofs must be an array');
  const proofs = values.map(normalizeProof).sort((left, right) =>
    `${left.system}:${left.evidenceId}`.localeCompare(
      `${right.system}:${right.evidenceId}`,
    ));
  const evidenceIds = new Set();
  const proofOwners = new Set();
  for (const proof of proofs) {
    const evidenceKey = `${proof.system}:${proof.evidenceId}`;
    if (evidenceIds.has(evidenceKey)) {
      throw new Error(`duplicate semantic evidence id ${evidenceKey}`);
    }
    evidenceIds.add(evidenceKey);
    for (const proofId of proof.proofIds) {
      const ownerKey = `${proof.system}:${proofId}`;
      if (proofOwners.has(ownerKey)) {
        throw new Error(`duplicate semantic proof result ${ownerKey}`);
      }
      proofOwners.add(ownerKey);
    }
  }
  return Object.freeze(proofs);
}

function systemSummary(system, proofs) {
  const passed = new Set();
  const failed = new Set();
  for (const proof of proofs.filter((candidate) => candidate.system === system)) {
    const destination = proof.status === STATUS.PASSED ? passed : failed;
    for (const proofId of proof.proofIds) destination.add(proofId);
  }
  const missing = REQUIRED_SYSTEM_PROOF_IDS.filter(
    (proofId) => !passed.has(proofId) && !failed.has(proofId),
  );
  return Object.freeze({
    passedProofIds: Object.freeze([...passed].sort()),
    failedProofIds: Object.freeze([...failed].sort()),
    missingProofIds: Object.freeze(missing),
  });
}

function hashGateEvidence(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function buildScenarioASemanticGateEvidence(options = {}) {
  const proofs = normalizeProofs(options.proofs || []);
  const systems = Object.fromEntries(
    SYSTEMS.map((system) => [system, systemSummary(system, proofs)]),
  );
  const hasFailure = Object.values(systems).some(
    ({failedProofIds}) => failedProofIds.length > ZERO,
  );
  const hasMissing = Object.values(systems).some(
    ({missingProofIds}) => missingProofIds.length > ZERO,
  );
  const semanticEquivalent = !hasFailure && !hasMissing;
  const status = hasFailure ?
    'failed' :
    semanticEquivalent ? 'passed' : 'incomplete';
  const payload = Object.freeze({
    semanticProfileId: OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
    semanticProfileSha256: hashScenarioASemanticProfile(),
    requiredSystemProofIds: REQUIRED_SYSTEM_PROOF_IDS,
    systems: Object.freeze(systems),
    proofs,
    status,
    semanticEquivalent,
  });
  return Object.freeze({
    ...payload,
    semanticGateEvidenceSha256: hashGateEvidence(payload),
  });
}

export {
  REQUIRED_SYSTEM_PROOF_IDS as OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  STATUS as OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
};
