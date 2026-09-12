#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-profile.js';

const PASS_LINE = 'oltp-scenario-a-semantic-gate-guard: PASS\n';
const FIRST_ARTIFACT = 'a'.repeat(64);
const SECOND_ARTIFACT = 'b'.repeat(64);

function proof(options = {}) {
  return {
    evidenceId: options.evidenceId || 'evidence-1',
    system: options.system || OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
    status: options.status || OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED,
    artifactSha256: options.artifactSha256 || FIRST_ARTIFACT,
    proofIds: options.proofIds || [OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS[0]],
  };
}

function assertRequiredProofsComeFromProfile() {
  const required = OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS;
  assert.ok(required.length > 20);
  assert.equal(
    required.includes('isolation:atomicCommitRequired'),
    true,
  );
  assert.equal(
    required.includes('isolation:lostSuccessfulWriteForbidden'),
    true,
  );
  assert.equal(
    required.includes('outcome:retryableConflictSqlState:40001'),
    true,
  );
  for (const [family, contract] of
    Object.entries(OLTP_SCENARIO_A_SEMANTIC_PROFILE.transactionFamilies)) {
    for (const invariant of contract.successInvariants) {
      assert.equal(
        required.includes(`transaction:${family}:${invariant}`),
        true,
      );
    }
  }
}

function assertEmptyEvidenceFailsClosed() {
  const gate = buildScenarioASemanticGateEvidence();
  assert.equal(gate.semanticProfileId, 'scenario-a-semantic-v1');
  assert.equal(gate.semanticProfileSha256, hashScenarioASemanticProfile());
  assert.equal(gate.status, 'incomplete');
  assert.equal(gate.comparable, false);
  assert.match(gate.semanticGateEvidenceSha256, /^[0-9a-f]{64}$/u);
  for (const system of Object.values(OLTP_SCENARIO_A_SYSTEM)) {
    assert.deepEqual(gate.systems[system].passedProofIds, []);
    assert.deepEqual(gate.systems[system].failedProofIds, []);
    assert.deepEqual(
      gate.systems[system].missingProofIds,
      OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
    );
  }
}

function assertPartialAndFailedEvidenceStayNonComparable() {
  const proofId = OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS[0];
  const partial = buildScenarioASemanticGateEvidence({
    proofs: [proof({proofIds: [proofId]})],
  });
  assert.equal(partial.status, 'incomplete');
  assert.equal(partial.comparable, false);
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
  assert.equal(failed.status, 'failed');
  assert.equal(failed.comparable, false);
  assert.deepEqual(
    failed.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV].failedProofIds,
    [proofId],
  );
}

function completeProofs() {
  return [
    proof({
      evidenceId: 'tidb-complete',
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      artifactSha256: FIRST_ARTIFACT,
      proofIds: OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
    }),
    proof({
      evidenceId: 'lagrange-complete',
      system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      artifactSha256: SECOND_ARTIFACT,
      proofIds: OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
    }),
  ];
}

function assertCompleteEvidenceCanPass() {
  const proofs = completeProofs();
  const first = buildScenarioASemanticGateEvidence({proofs});
  const second = buildScenarioASemanticGateEvidence({proofs: [...proofs].reverse()});
  assert.equal(first.status, 'passed');
  assert.equal(first.comparable, true);
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
      proofs: [proof({system: 'unknown-system'})],
    }),
    /unsupported semantic proof system/u,
  );
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [proof({proofIds: ['unknown-proof']})],
    }),
    /unknown Scenario A semantic proof id/u,
  );
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [proof({artifactSha256: 'bad-digest'})],
    }),
    /artifactSha256 must be a SHA-256 digest/u,
  );
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [proof({proofIds: [proofId, proofId]})],
    }),
    /duplicate proofIds/u,
  );
  assert.throws(
    () => buildScenarioASemanticGateEvidence({
      proofs: [
        proof({evidenceId: 'first', proofIds: [proofId]}),
        proof({evidenceId: 'second', proofIds: [proofId]}),
      ],
    }),
    /duplicate semantic proof result/u,
  );
}

function main() {
  assertRequiredProofsComeFromProfile();
  assertEmptyEvidenceFailsClosed();
  assertPartialAndFailedEvidenceStayNonComparable();
  assertCompleteEvidenceCanPass();
  assertInvalidEvidenceFailsClosed();
  process.stdout.write(PASS_LINE);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}
