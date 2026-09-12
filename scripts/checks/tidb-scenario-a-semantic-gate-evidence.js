#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';

const ONE = 1;
const EXPECTED_PROOF_FILES = 9;
const DEFAULT_INPUT_DIR = 'test-output/tidb-reference';
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-tidb-semantic-gate.json';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function canonicalPayloadDigest(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function requireSha256(value, label) {
  const digest = String(value || '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function verifyEvidenceArtifact(evidence, filename) {
  if (!evidence || typeof evidence !== 'object') {
    throw new Error(`semantic evidence ${filename} must be an object`);
  }
  const {proofRecord, artifactSha256, ...payload} = evidence;
  if (!proofRecord || typeof proofRecord !== 'object') {
    throw new Error(`semantic evidence ${filename} has no proofRecord`);
  }
  const declared = requireSha256(
    artifactSha256,
    `semantic evidence ${filename} artifactSha256`,
  );
  const proofDigest = requireSha256(
    proofRecord.artifactSha256,
    `semantic evidence ${filename} proofRecord.artifactSha256`,
  );
  const computed = canonicalPayloadDigest(payload);
  if (declared !== computed || proofDigest !== computed) {
    throw new Error(`semantic evidence ${filename} content hash mismatch`);
  }
  if (evidence.system !== OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV ||
      proofRecord.system !== OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV) {
    throw new Error(`semantic evidence ${filename} is not TiDB/TiKV evidence`);
  }
  if (proofRecord.status !== OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED) {
    throw new Error(`semantic evidence ${filename} did not pass`);
  }
  return Object.freeze({
    filename,
    evidenceId: String(evidence.evidenceId || ''),
    artifactSha256: computed,
    proofRecord: Object.freeze({...proofRecord}),
  });
}

async function loadProofArtifacts(inputDir, outputPath) {
  const outputName = path.basename(outputPath);
  const names = (await readdir(inputDir))
    .filter((name) =>
      name.startsWith('scenario-a-') &&
      name.endsWith('-tidb.json') &&
      name !== outputName)
    .sort();
  if (names.length !== EXPECTED_PROOF_FILES) {
    throw new Error(
      `TiDB semantic gate expected ${EXPECTED_PROOF_FILES} proof files, got ${names.length}: ` +
      names.join(','),
    );
  }
  const artifacts = [];
  for (const name of names) {
    const raw = await readFile(path.join(inputDir, name), 'utf8');
    artifacts.push(verifyEvidenceArtifact(JSON.parse(raw), name));
  }
  return Object.freeze(artifacts);
}

function assertTiDbCoverage(gate) {
  const tidb = gate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV];
  const lagrange = gate.systems[OLTP_SCENARIO_A_SYSTEM.LAGRANGE];
  if (tidb.failedProofIds.length !== 0 || tidb.missingProofIds.length !== 0) {
    throw new Error(
      'TiDB semantic gate is incomplete: ' +
      JSON.stringify({
        failed: tidb.failedProofIds,
        missing: tidb.missingProofIds,
      }),
    );
  }
  if (tidb.passedProofIds.length !== OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length) {
    throw new Error('TiDB semantic gate proof count mismatch');
  }
  if (JSON.stringify(tidb.passedProofIds) !==
      JSON.stringify(OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS)) {
    throw new Error('TiDB semantic gate proof set mismatch');
  }
  if (gate.status !== 'incomplete' || gate.semanticEquivalent !== false) {
    throw new Error('TiDB-only semantic evidence must not claim semantic equivalence');
  }
  if (lagrange.passedProofIds.length !== 0 ||
      lagrange.failedProofIds.length !== 0 ||
      lagrange.missingProofIds.length !== OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length) {
    throw new Error('TiDB-only semantic evidence must leave Lagrange unproven');
  }
}

async function buildTiDbSemanticGateArtifact(options = {}) {
  const inputDir = options.inputDir || DEFAULT_INPUT_DIR;
  const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;
  const artifacts = await loadProofArtifacts(inputDir, outputPath);
  const gate = buildScenarioASemanticGateEvidence({
    proofs: artifacts.map(({proofRecord}) => proofRecord),
  });
  assertTiDbCoverage(gate);
  const payload = Object.freeze({
    schemaVersion: ONE,
    evidenceId: 'tidb-scenario-a-semantic-gate-v1',
    system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
    sourceArtifacts: Object.freeze(artifacts.map((artifact) => Object.freeze({
      filename: artifact.filename,
      evidenceId: artifact.evidenceId,
      artifactSha256: artifact.artifactSha256,
      proofIds: Object.freeze([...artifact.proofRecord.proofIds]),
    }))),
    semanticGate: gate,
    comparable: false,
    nonComparableReason:
      'TiDB/TiKV semantic proof is complete; Lagrange semantic evidence is still absent.',
  });
  const artifactSha256 = canonicalPayloadDigest(payload);
  const evidence = Object.freeze({...payload, artifactSha256});
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  return evidence;
}

async function main() {
  const evidence = await buildTiDbSemanticGateArtifact({
    inputDir: process.argv[2] || DEFAULT_INPUT_DIR,
    outputPath: process.argv[3] || DEFAULT_OUTPUT_PATH,
  });
  process.stdout.write(
    'tidb-scenario-a-semantic-gate-evidence: PASS ' +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      proofArtifacts: evidence.sourceArtifacts.length,
      proofIds:
        evidence.semanticGate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV]
          .passedProofIds.length,
      semanticEquivalent: evidence.semanticGate.semanticEquivalent,
    }) + '\n',
  );
}

if (import.meta.url === `file://${process.argv[ONE]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = ONE;
  });
}

export {
  buildTiDbSemanticGateArtifact,
  verifyEvidenceArtifact,
};
