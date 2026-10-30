#!/usr/bin/env node

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from '../../test/distributed/harness/oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-profile.js';
import {
  buildPairedScenarioASemanticGateArtifact,
  verifySystemEvidenceArtifact,
} from './tidb-scenario-a-semantic-gate-evidence.js';

const stringRepeat = Function.call.bind(String.prototype.repeat);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayReverse = Function.call.bind(Array.prototype.reverse);

const PASS_LINE = 'oltp-scenario-a-semantic-gate-guard: PASS\n';
const NEWLINE = '\n';

const DIGEST_CHAR_A = 'a';
const DIGEST_CHAR_B = 'b';
const DIGEST_CHAR_C = 'c';
const HASH_LENGTH = 64;
const FIRST_ARTIFACT = stringRepeat(DIGEST_CHAR_A, HASH_LENGTH);
const SECOND_ARTIFACT = stringRepeat(DIGEST_CHAR_B, HASH_LENGTH);
const TAMPERED_HASH = stringRepeat(DIGEST_CHAR_C, HASH_LENGTH);

const REQUIRED_PROOF_COUNT = 33;
const EXPECTED_PROOF_CASE_COUNT = 9;

const ISOLATION_ATOMIC_COMMIT_REQUIRED = 'isolation:atomicCommitRequired';
const ISOLATION_LOST_SUCCESSFUL_WRITE_FORBIDDEN =
  'isolation:lostSuccessfulWriteForbidden';
const OUTCOME_RETRYABLE_CONFLICT_SQL_STATE =
  'outcome:retryableConflictSqlState:40001';

const SEMANTIC_PROFILE_ID_V1 = 'scenario-a-semantic-v1';
const STATUS_INCOMPLETE = 'incomplete';
const STATUS_FAILED = 'failed';
const STATUS_PASSED = 'passed';

const PROPERTY_COMPARABLE = 'comparable';

const EVIDENCE_ID_TIDB_COMPLETE = 'tidb-complete';
const EVIDENCE_ID_LAGRANGE_COMPLETE = 'lagrange-complete';
const DEFAULT_TEST_EVIDENCE_ID = 'evidence-1';

const UNKNOWN_SYSTEM = 'unknown-system';
const UNKNOWN_PROOF = 'unknown-proof';
const BAD_DIGEST = 'bad-digest';
const EVIDENCE_ID_FIRST = 'first';
const EVIDENCE_ID_SECOND = 'second';

const DIGEST_ALGORITHM_SHA256 = 'sha256';
const DIGEST_ENCODING_HEX = 'hex';
const STRING_TYPE = 'string';
const PAIRED_GATE_EVIDENCE_ID = 'paired-scenario-a-semantic-gate-v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const PATTERN_UNSUPPORTED_SYSTEM = /unsupported semantic proof system/u;
const PATTERN_UNKNOWN_PROOF_ID = /unknown Scenario A semantic proof id/u;
const PATTERN_MUST_BE_SHA256 = /artifactSha256 must be a SHA-256 digest/u;
const PATTERN_DUPLICATE_PROOF_IDS = /duplicate proofIds/u;
const PATTERN_DUPLICATE_PROOF_RESULT = /duplicate semantic proof result/u;
const PATTERN_SYSTEM_MISMATCH = /is not lagrange evidence/u;
const PATTERN_CONTENT_HASH_MISMATCH = /content hash mismatch/u;

function proof(options = {}) {
  const evidenceId = options.evidenceId || DEFAULT_TEST_EVIDENCE_ID;
  const system = options.system || OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV;
  const status = options.status || OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED;
  const artifactSha256 = options.artifactSha256 || FIRST_ARTIFACT;
  const proofIds = options.proofIds || [OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS[0]];
  return {
    evidenceId,
    system,
    status,
    artifactSha256,
    proofIds,
  };
}

function assertRequiredProofsComeFromProfile() {
  const required = OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS;
  assert.equal(required.length, REQUIRED_PROOF_COUNT);
  assert.equal(
    arrayIncludes(required, ISOLATION_ATOMIC_COMMIT_REQUIRED),
    true,
  );
  assert.equal(
    arrayIncludes(required, ISOLATION_LOST_SUCCESSFUL_WRITE_FORBIDDEN),
    true,
  );
  assert.equal(
    arrayIncludes(required, OUTCOME_RETRYABLE_CONFLICT_SQL_STATE),
    true,
  );
  for (const [family, contract] of
    Object.entries(OLTP_SCENARIO_A_SEMANTIC_PROFILE.transactionFamilies)) {
    for (const invariant of contract.successInvariants) {
      assert.equal(
        arrayIncludes(required, `transaction:${family}:${invariant}`),
        true,
      );
    }
  }
}

function assertEmptyEvidenceFailsClosed() {
  const gate = buildScenarioASemanticGateEvidence();
  assert.equal(gate.semanticProfileId, SEMANTIC_PROFILE_ID_V1);
  assert.equal(gate.semanticProfileSha256, hashScenarioASemanticProfile());
  assert.equal(gate.status, STATUS_INCOMPLETE);
  assert.equal(gate.semanticEquivalent, false);
  assert.equal(Object.hasOwn(gate, PROPERTY_COMPARABLE), false);
  assert.match(gate.semanticGateEvidenceSha256, SHA256_PATTERN);
  for (const system of Object.values(OLTP_SCENARIO_A_SYSTEM)) {
    assert.deepEqual(gate.systems[system].passedProofIds, []);
    assert.deepEqual(gate.systems[system].failedProofIds, []);
    assert.deepEqual(
      gate.systems[system].missingProofIds,
      OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
    );
  }
}

function assertPartialAndFailedEvidenceStayNonEquivalent() {
  const proofId = OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS[0];
  const partial = buildScenarioASemanticGateEvidence({
    proofs: [proof({proofIds: [proofId]})],
  });
  assert.equal(partial.status, STATUS_INCOMPLETE);
  assert.equal(partial.semanticEquivalent, false);
  assert.deepEqual(
    partial.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV].passedProofIds,
    [proofId],
  );

  const failed = buildScenarioASemanticGateEvidence({
    proofs: [proof({
      status: OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
      proofIds: [proofId],
    })],
  });
  assert.equal(failed.status, STATUS_FAILED);
  assert.equal(failed.semanticEquivalent, false);
  assert.deepEqual(
    failed.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV].failedProofIds,
    [proofId],
  );
}

function assertSingleSystemLagrangeDoesNotPassSemanticGate() {
  const lagrangeProof = proof({
    evidenceId: EVIDENCE_ID_LAGRANGE_COMPLETE,
    system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
    artifactSha256: SECOND_ARTIFACT,
    proofIds: OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  });
  const gate = buildScenarioASemanticGateEvidence({
    proofs: [lagrangeProof],
  });
  assert.equal(gate.status, STATUS_INCOMPLETE);
  assert.equal(gate.semanticEquivalent, false);
  const lagrange = gate.systems[OLTP_SCENARIO_A_SYSTEM.LAGRANGE];
  const tidb = gate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV];
  assert.equal(lagrange.passedProofIds.length, REQUIRED_PROOF_COUNT);
  assert.equal(lagrange.missingProofIds.length, 0);
  assert.deepEqual(lagrange.failedProofIds, []);
  assert.deepEqual(lagrange.passedProofIds, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
  assert.equal(tidb.passedProofIds.length, 0);
  assert.equal(tidb.missingProofIds.length, REQUIRED_PROOF_COUNT);
}

function completeProofs() {
  return [
    proof({
      evidenceId: EVIDENCE_ID_TIDB_COMPLETE,
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      artifactSha256: FIRST_ARTIFACT,
      proofIds: OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
    }),
    proof({
      evidenceId: EVIDENCE_ID_LAGRANGE_COMPLETE,
      system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      artifactSha256: SECOND_ARTIFACT,
      proofIds: OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
    }),
  ];
}

function assertCompleteEvidenceCanPassSemanticGate() {
  const proofs = completeProofs();
  const first = buildScenarioASemanticGateEvidence({proofs});
  const second = buildScenarioASemanticGateEvidence({
    proofs: arrayReverse([...proofs]),
  });
  assert.equal(first.status, STATUS_PASSED);
  assert.equal(first.semanticEquivalent, true);
  assert.equal(Object.hasOwn(first, PROPERTY_COMPARABLE), false);
  assert.equal(first.semanticGateEvidenceSha256, second.semanticGateEvidenceSha256);
  for (const system of Object.values(OLTP_SCENARIO_A_SYSTEM)) {
    assert.deepEqual(first.systems[system].failedProofIds, []);
    assert.deepEqual(first.systems[system].missingProofIds, []);
    assert.deepEqual(
      first.systems[system].passedProofIds,
      OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
    );
  }
}

function assertInvalidEvidenceFailsClosed() {
  const proofId = OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS[0];
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [proof({system: UNKNOWN_SYSTEM})],
    }),
    PATTERN_UNSUPPORTED_SYSTEM,
  );
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [proof({proofIds: [UNKNOWN_PROOF]})],
    }),
    PATTERN_UNKNOWN_PROOF_ID,
  );
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [proof({artifactSha256: BAD_DIGEST})],
    }),
    PATTERN_MUST_BE_SHA256,
  );
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [proof({proofIds: [proofId, proofId]})],
    }),
    PATTERN_DUPLICATE_PROOF_IDS,
  );
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [
        proof({evidenceId: EVIDENCE_ID_FIRST, proofIds: [proofId]}),
        proof({evidenceId: EVIDENCE_ID_SECOND, proofIds: [proofId]}),
      ],
    }),
    PATTERN_DUPLICATE_PROOF_RESULT,
  );
}

function createTestEvidenceArtifact(system, caseId, proofIds) {
  const payload = {
    schemaVersion: 1,
    evidenceId: `scenario-a-${caseId}-${system}`,
    system,
    caseId,
    proofIds,
  };
  const artifactSha256 = createHash(DIGEST_ALGORITHM_SHA256)
    .update(JSON.stringify(payload))
    .digest(DIGEST_ENCODING_HEX);
  return Object.freeze({
    ...payload,
    artifactSha256,
    proofRecord: Object.freeze({
      evidenceId: `scenario-a-${caseId}-${system}`,
      system,
      status: OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED,
      artifactSha256,
      proofIds: Object.freeze([...proofIds]),
    }),
  });
}

function createSystemArtifacts(system) {
  return arrayMap(OLTP_SCENARIO_A_PROOF_CASES, (proofCase) =>
    createTestEvidenceArtifact(system, proofCase.id, proofCase.proofIds),
  );
}

function assertVerifySystemEvidenceArtifact() {
  const tidbArtifacts = createSystemArtifacts(OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV);
  const validTidb = tidbArtifacts[0];
  const verified = verifySystemEvidenceArtifact(
    validTidb,
    validTidb.evidenceId,
    OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
  );
  assert.equal(verified.evidenceId, validTidb.evidenceId);
  assert.equal(verified.artifactSha256, validTidb.artifactSha256);

  assert.throws(
    () => verifySystemEvidenceArtifact(
      validTidb,
      validTidb.evidenceId,
      OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
    ),
    PATTERN_SYSTEM_MISMATCH,
  );

  const tampered = {
    ...validTidb,
    artifactSha256: TAMPERED_HASH,
  };
  assert.throws(
    () => verifySystemEvidenceArtifact(
      tampered,
      tampered.evidenceId,
      OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
    ),
    PATTERN_CONTENT_HASH_MISMATCH,
  );
}

async function assertPairedGateArtifactBehavior() {
  const tidbArtifacts = createSystemArtifacts(OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV);
  assert.equal(tidbArtifacts.length, EXPECTED_PROOF_CASE_COUNT);

  // Assertion 1a: 9 TiDB artifacts and 0 Lagrange artifacts
  const emptyLagrangeResult = await buildPairedScenarioASemanticGateArtifact({
    tidbArtifacts,
    lagrangeArtifacts: [],
  });
  assert.equal(emptyLagrangeResult.comparable, false);
  assert.equal(emptyLagrangeResult.semanticGate.status, STATUS_INCOMPLETE);
  assert.equal(emptyLagrangeResult.semanticGate.semanticEquivalent, false);
  assert.equal(typeof emptyLagrangeResult.nonComparableReason, STRING_TYPE);
  assert.ok(emptyLagrangeResult.nonComparableReason.length > 0);
  assert.equal(emptyLagrangeResult.evidenceId, PAIRED_GATE_EVIDENCE_ID);
  assert.equal(emptyLagrangeResult.schemaVersion, 1);
  assert.match(emptyLagrangeResult.artifactSha256, SHA256_PATTERN);

  // Assertion 1b: 9 TiDB artifacts and partial Lagrange artifacts
  const partialLagrangeArtifacts = [
    createTestEvidenceArtifact(
      OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      OLTP_SCENARIO_A_PROOF_CASES[0].id,
      OLTP_SCENARIO_A_PROOF_CASES[0].proofIds,
    ),
  ];
  const partialLagrangeResult = await buildPairedScenarioASemanticGateArtifact({
    tidbArtifacts,
    lagrangeArtifacts: partialLagrangeArtifacts,
  });
  assert.equal(partialLagrangeResult.comparable, false);
  assert.equal(partialLagrangeResult.semanticGate.status, STATUS_INCOMPLETE);
  assert.equal(partialLagrangeResult.semanticGate.semanticEquivalent, false);
  assert.equal(typeof partialLagrangeResult.nonComparableReason, STRING_TYPE);
  assert.ok(partialLagrangeResult.nonComparableReason.length > 0);

  // Assertion 2: 9 TiDB artifacts and 9 Lagrange artifacts
  const lagrangeArtifacts = createSystemArtifacts(OLTP_SCENARIO_A_SYSTEM.LAGRANGE);
  assert.equal(lagrangeArtifacts.length, EXPECTED_PROOF_CASE_COUNT);
  const completeResult = await buildPairedScenarioASemanticGateArtifact({
    tidbArtifacts,
    lagrangeArtifacts,
  });
  assert.equal(completeResult.comparable, true);
  assert.equal(completeResult.semanticGate.status, STATUS_PASSED);
  assert.equal(completeResult.semanticGate.semanticEquivalent, true);
  assert.equal(completeResult.nonComparableReason, null);
  assert.equal(completeResult.evidenceId, PAIRED_GATE_EVIDENCE_ID);
  assert.equal(completeResult.schemaVersion, 1);
  assert.match(completeResult.artifactSha256, SHA256_PATTERN);
}

async function main() {
  assertRequiredProofsComeFromProfile();
  assertEmptyEvidenceFailsClosed();
  assertPartialAndFailedEvidenceStayNonEquivalent();
  assertSingleSystemLagrangeDoesNotPassSemanticGate();
  assertCompleteEvidenceCanPassSemanticGate();
  assertInvalidEvidenceFailsClosed();
  assertVerifySystemEvidenceArtifact();
  await assertPairedGateArtifactBehavior();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}${NEWLINE}`);
  process.exitCode = 1;
});
