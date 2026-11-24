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

// The gate's own verdict over all proofs: failed when any proof failed,
// incomplete when a required proof is missing, otherwise passed.
const GATE_STATUS = Object.freeze({
  PASSED: STATUS.PASSED,
  FAILED: STATUS.FAILED,
  INCOMPLETE: 'incomplete',
});
const SYSTEMS = Object.freeze(Object.values(OLTP_SCENARIO_A_SYSTEM));

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const objectHasOwn = Object.hasOwn;
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringTrim = Function.call.bind(String.prototype.trim);

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

const CANONICAL_PROOF_COUNT = 33;
const REQUIRED_SYSTEM_PROOF_IDS = requiredSystemProofIds();
if (REQUIRED_SYSTEM_PROOF_IDS.length !== CANONICAL_PROOF_COUNT) {
  throw new Error(
    `expected ${CANONICAL_PROOF_COUNT} Scenario A semantic proofs, got ${REQUIRED_SYSTEM_PROOF_IDS.length}`,
  );
}
const REQUIRED_SYSTEM_PROOF_SET = new Set(REQUIRED_SYSTEM_PROOF_IDS);

function familyProofIds(family) {
  const contract = OLTP_SCENARIO_A_SEMANTIC_PROFILE.transactionFamilies[family];
  return arrayMap(
    contract.successInvariants,
    (invariant) => `transaction:${family}:${invariant}`,
  );
}

function freezeSortedProofIds(ids) {
  return Object.freeze([...ids].sort());
}

function buildCanonicalScenarioACaseProofIds() {
  const profile = OLTP_SCENARIO_A_SEMANTIC_PROFILE;
  const durabilityProofIds = freezeSortedProofIds([
    'isolation:atomicCommitRequired',
    'isolation:successfulCommitDurable',
  ]);
  const canonicalNineCases = Object.freeze({
    'new-order-contention': freezeSortedProofIds([
      'forbidden:duplicate_success_effect',
      'forbidden:lost_successful_write',
      'isolation:lostSuccessfulWriteForbidden',
      'isolation:successfulEffectsExactlyOnce',
      ...familyProofIds('new_order'),
    ]),
    'visibility': freezeSortedProofIds([
      'forbidden:dirty_read',
      'isolation:dirtyReadsForbidden',
      'isolation:readYourOwnWritesRequired',
    ]),
    'payment': freezeSortedProofIds(familyProofIds('payment')),
    'order-status': freezeSortedProofIds([
      'forbidden:read_only_transaction_mutation',
      ...familyProofIds('order_status'),
    ]),
    'delivery': freezeSortedProofIds(familyProofIds('delivery')),
    'stock-level': freezeSortedProofIds(familyProofIds('stock_level')),
    'failure-atomicity': freezeSortedProofIds([
      `failureAtomicity:${profile.failureAtomicity.rule}`,
      'forbidden:partial_commit',
    ]),
    'retryable-conflict': freezeSortedProofIds([
      `outcome:retryableConflictSqlState:${profile.outcomes.retryableConflictSqlState}`,
    ]),
    'durability': durabilityProofIds,
  });
  const combined = [];
  for (const ids of Object.values(canonicalNineCases)) {
    combined.push(...ids);
  }
  const sortedCombined = [...combined].sort();
  if (sortedCombined.length !== REQUIRED_SYSTEM_PROOF_IDS.length ||
      arraySome(sortedCombined, (id, index) => id !== REQUIRED_SYSTEM_PROOF_IDS[index])) {
    throw new Error('Scenario A canonical case proof IDs do not partition required proof IDs');
  }
  return Object.freeze({
    ...canonicalNineCases,
    'scenario-a-durable-commit-v1': durabilityProofIds,
  });
}

const CANONICAL_SCENARIO_A_CASE_PROOF_IDS = buildCanonicalScenarioACaseProofIds();

function isCanonicalScenarioAProofId(value) {
  return typeof value === 'string' && REQUIRED_SYSTEM_PROOF_SET.has(value);
}

function hasExactSortedProofIds(values, expectedSortedIds) {
  if (!Array.isArray(values) || !Array.isArray(expectedSortedIds)) return false;
  if (values.length !== expectedSortedIds.length) return false;
  if (new Set(values).size !== expectedSortedIds.length) return false;
  if (!arrayEvery(values, isCanonicalScenarioAProofId)) return false;
  const sorted = [...values].sort();
  return arrayEvery(sorted, (id, index) => id === expectedSortedIds[index]);
}

function hasExactCanonicalScenarioAProofIdSet(values) {
  return hasExactSortedProofIds(values, REQUIRED_SYSTEM_PROOF_IDS);
}

function hasCanonicalScenarioACaseProofIds(caseId, values) {
  if (typeof caseId !== 'string' || !objectHasOwn(CANONICAL_SCENARIO_A_CASE_PROOF_IDS, caseId)) {
    return false;
  }
  return hasExactSortedProofIds(values, CANONICAL_SCENARIO_A_CASE_PROOF_IDS[caseId]);
}

function requireText(value, label) {
  const text = stringTrim(String(value || ''));
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireSha256(value, label) {
  const digest = stringToLowerCase(requireText(value, label));
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function normalizeSystem(value) {
  const system = requireText(value, 'semantic proof system');
  if (!arrayIncludes(SYSTEMS, system)) {
    throw new Error(`unsupported semantic proof system ${system}`);
  }
  return system;
}

function normalizeStatus(value) {
  const status = requireText(value, 'semantic proof status');
  if (!arrayIncludes(Object.values(STATUS), status)) {
    throw new Error(`unsupported semantic proof status ${status}`);
  }
  return status;
}

function normalizeProofIds(values) {
  if (!Array.isArray(values) || values.length === ZERO) {
    throw new Error('semantic proof requires proofIds');
  }
  const ids = arrayMap(values, (value) => requireText(value, 'semantic proof id'));
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
  const proofs = arrayMap(values, normalizeProof).sort((left, right) =>
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

// The compared systems are named by the caller, in its recorded execution
// order: every named system must carry every required proof; a proof for a
// system outside the comparison is refused.
function normalizeComparedSystems(values) {
  if (!Array.isArray(values) || values.length === ZERO) {
    throw new Error('Scenario A semantic gate requires the compared systems');
  }
  const systems = arrayMap(values, normalizeSystem);
  if (new Set(systems).size !== systems.length) {
    throw new Error('Scenario A semantic gate compared systems contain duplicates');
  }
  return Object.freeze(systems);
}

function systemSummary(system, proofs) {
  const passed = new Set();
  const failed = new Set();
  for (const proof of arrayFilter(proofs, (candidate) => candidate.system === system)) {
    const destination = proof.status === STATUS.PASSED ? passed : failed;
    for (const proofId of proof.proofIds) destination.add(proofId);
  }
  const missing = arrayFilter(
    REQUIRED_SYSTEM_PROOF_IDS,
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
  const comparedSystems = normalizeComparedSystems(options.systems);
  const proofs = normalizeProofs(options.proofs || []);
  for (const proof of proofs) {
    if (!arrayIncludes(comparedSystems, proof.system)) {
      throw new Error(`semantic proof for ${proof.system} is outside the compared systems`);
    }
  }
  const systems = Object.fromEntries(
    arrayMap(comparedSystems, (system) => [system, systemSummary(system, proofs)]),
  );
  const hasFailure = arraySome(
    Object.values(systems),
    ({failedProofIds}) => failedProofIds.length > ZERO,
  );
  const hasMissing = arraySome(
    Object.values(systems),
    ({missingProofIds}) => missingProofIds.length > ZERO,
  );
  const semanticEquivalent = !hasFailure && !hasMissing;
  const status = hasFailure ?
    GATE_STATUS.FAILED :
    semanticEquivalent ? GATE_STATUS.PASSED : GATE_STATUS.INCOMPLETE;
  const payload = Object.freeze({
    semanticProfileId: OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
    semanticProfileSha256: hashScenarioASemanticProfile(),
    requiredSystemProofIds: REQUIRED_SYSTEM_PROOF_IDS,
    comparedSystems,
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

// What a failed or unobtained proof case says (coordinator decision 4,
// 2026-11-02): the product violated the contract, the evidence the proof
// needs could not be obtained, or the probe does not apply to the deployment.
// Only a product anomaly fails the gate. The proof journey records them; the
// claim admission reads them.
const PROOF_FAILURE_KIND = Object.freeze({
  PRODUCT_ANOMALY: 'product_anomaly',
  EVIDENCE_INSUFFICIENT: 'evidence_insufficient',
  PROBE_INAPPLICABLE: 'probe_inapplicable',
});

export {
  CANONICAL_SCENARIO_A_CASE_PROOF_IDS,
  REQUIRED_SYSTEM_PROOF_IDS as CANONICAL_SCENARIO_A_PROOF_IDS,
  PROOF_FAILURE_KIND as OLTP_SCENARIO_A_PROOF_FAILURE_KIND,
  REQUIRED_SYSTEM_PROOF_IDS as OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  GATE_STATUS as OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS,
  STATUS as OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
  hasCanonicalScenarioACaseProofIds,
  hasExactCanonicalScenarioAProofIdSet,
  isCanonicalScenarioAProofId,
};
