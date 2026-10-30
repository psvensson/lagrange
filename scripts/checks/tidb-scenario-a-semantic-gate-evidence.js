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

const stringTrim = Function.call.bind(String.prototype.trim);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySort = Function.call.bind(Array.prototype.sort);

const SCHEMA_VERSION_ONE = 1;
const EXPECTED_PROOF_FILES = 9;
const DEFAULT_INPUT_DIR = 'test-output/tidb-reference';
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-tidb-semantic-gate.json';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const DIGEST_ALGORITHM_SHA256 = 'sha256';
const DIGEST_ENCODING_HEX = 'hex';
const FILE_ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const COMMA = ',';
const SEMICOLON_SPACE = '; ';

const STATUS_PASSED = 'passed';
const STATUS_INCOMPLETE = 'incomplete';

const OBJECT_TYPE = 'object';
const STRING_TYPE = 'string';

const TIDB_EVIDENCE_ID = 'tidb-scenario-a-semantic-gate-v1';
const PAIRED_EVIDENCE_ID = 'paired-scenario-a-semantic-gate-v1';

const TIDB_FILE_SUFFIX = '-tidb.json';
const LAGRANGE_FILE_SUFFIX = '-lagrange.json';
const SCENARIO_FILE_PREFIX = 'scenario-a-';
const TIDB_ARTIFACT_DEFAULT_PREFIX = 'tidb-artifact';
const LAGRANGE_ARTIFACT_DEFAULT_PREFIX = 'lagrange-artifact';

const TIDB_NON_COMPARABLE_REASON =
  'TiDB/TiKV semantic proof is complete; Lagrange semantic evidence is still absent.';
const REASON_SEMANTIC_EVIDENCE_INCOMPLETE =
  'Scenario A semantic evidence is incomplete.';

const TIDB_GATE_INCOMPLETE_PREFIX = 'TiDB semantic gate is incomplete: ';
const TIDB_PROOF_COUNT_MISMATCH = 'TiDB semantic gate proof count mismatch';
const TIDB_PROOF_SET_MISMATCH = 'TiDB semantic gate proof set mismatch';
const TIDB_ONLY_NON_EQUIVALENT_ERROR =
  'TiDB-only semantic evidence must not claim semantic equivalence';
const TIDB_ONLY_LAGRANGE_UNPROVEN_ERROR =
  'TiDB-only semantic evidence must leave Lagrange unproven';

const MAIN_PASS_PREFIX = 'tidb-scenario-a-semantic-gate-evidence: PASS ';
const FILE_URL_PREFIX = 'file://';

function canonicalPayloadDigest(payload) {
  return createHash(DIGEST_ALGORITHM_SHA256)
    .update(JSON.stringify(payload))
    .digest(DIGEST_ENCODING_HEX);
}

function requireSha256(value, label) {
  const raw = value ? String(value) : '';
  const digest = stringToLowerCase(stringTrim(raw));
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function assertExpectedSystem(evidence, proofRecord, filename, expectedSystem) {
  if (expectedSystem === undefined) {
    return;
  }
  if (evidence.system === expectedSystem &&
      proofRecord.system === expectedSystem) {
    return;
  }
  if (expectedSystem === OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV) {
    throw new Error(`semantic evidence ${filename} is not TiDB/TiKV evidence`);
  }
  throw new Error(`semantic evidence ${filename} is not ${expectedSystem} evidence`);
}

function verifySystemEvidenceArtifact(evidence, filename, expectedSystem) {
  if (!evidence || typeof evidence !== OBJECT_TYPE) {
    throw new Error(`semantic evidence ${filename} must be an object`);
  }
  const {proofRecord, artifactSha256, ...payload} = evidence;
  if (!proofRecord || typeof proofRecord !== OBJECT_TYPE) {
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
  assertExpectedSystem(evidence, proofRecord, filename, expectedSystem);
  if (proofRecord.status !== OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED) {
    throw new Error(`semantic evidence ${filename} did not pass`);
  }
  const evidenceId = evidence.evidenceId ? String(evidence.evidenceId) : '';
  return Object.freeze({
    filename,
    evidenceId,
    artifactSha256: computed,
    proofRecord: Object.freeze({...proofRecord}),
  });
}

function verifyEvidenceArtifact(evidence, filename) {
  return verifySystemEvidenceArtifact(
    evidence,
    filename,
    OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
  );
}

async function loadProofArtifactsForSystem(inputDir, system, outputPath) {
  const outputName = outputPath ? path.basename(outputPath) : '';
  const suffix = system === OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV ?
    TIDB_FILE_SUFFIX :
    LAGRANGE_FILE_SUFFIX;
  const rawNames = await readdir(inputDir);
  const names = arraySort(
    arrayFilter(
      rawNames,
      (name) =>
        stringStartsWith(name, SCENARIO_FILE_PREFIX) &&
        stringEndsWith(name, suffix) &&
        name !== outputName,
    ),
  );
  const artifacts = [];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const raw = await readFile(path.join(inputDir, name), FILE_ENCODING_UTF8);
    artifacts.push(
      verifySystemEvidenceArtifact(JSON.parse(raw), name, system),
    );
  }
  return Object.freeze(artifacts);
}

async function loadProofArtifacts(inputDir, outputPath) {
  const outputName = outputPath ? path.basename(outputPath) : '';
  const rawNames = await readdir(inputDir);
  const names = arraySort(
    arrayFilter(
      rawNames,
      (name) =>
        stringStartsWith(name, SCENARIO_FILE_PREFIX) &&
        stringEndsWith(name, TIDB_FILE_SUFFIX) &&
        name !== outputName,
    ),
  );
  if (names.length !== EXPECTED_PROOF_FILES) {
    throw new Error(
      `TiDB semantic gate expected ${EXPECTED_PROOF_FILES} proof files, got ${names.length}: ` +
      arrayJoin(names, COMMA),
    );
  }
  const artifacts = [];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const raw = await readFile(path.join(inputDir, name), FILE_ENCODING_UTF8);
    artifacts.push(
      verifyEvidenceArtifact(JSON.parse(raw), name),
    );
  }
  return Object.freeze(artifacts);
}

function assertTiDbCoverage(gate) {
  const tidb = gate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV];
  const lagrange = gate.systems[OLTP_SCENARIO_A_SYSTEM.LAGRANGE];
  if (tidb.failedProofIds.length !== 0 || tidb.missingProofIds.length !== 0) {
    throw new Error(
      TIDB_GATE_INCOMPLETE_PREFIX +
      JSON.stringify({
        failed: tidb.failedProofIds,
        missing: tidb.missingProofIds,
      }),
    );
  }
  if (tidb.passedProofIds.length !== OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length) {
    throw new Error(TIDB_PROOF_COUNT_MISMATCH);
  }
  if (JSON.stringify(tidb.passedProofIds) !==
      JSON.stringify(OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS)) {
    throw new Error(TIDB_PROOF_SET_MISMATCH);
  }
  if (gate.status !== STATUS_INCOMPLETE || gate.semanticEquivalent !== false) {
    throw new Error(TIDB_ONLY_NON_EQUIVALENT_ERROR);
  }
  if (lagrange.passedProofIds.length !== 0 ||
      lagrange.failedProofIds.length !== 0 ||
      lagrange.missingProofIds.length !== OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length) {
    throw new Error(TIDB_ONLY_LAGRANGE_UNPROVEN_ERROR);
  }
}

function determineNonComparableMessage(gate) {
  if (gate.semanticEquivalent === true && gate.status === STATUS_PASSED) {
    return null;
  }
  const parts = [];
  const systems = [
    OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
    OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
  ];
  for (let i = 0; i < systems.length; i += 1) {
    const sys = systems[i];
    const record = gate.systems ? gate.systems[sys] : null;
    if (!record) {
      parts.push(`${sys} semantic evidence is missing`);
      continue;
    }
    if (record.failedProofIds.length > 0) {
      parts.push(
        `${sys} has ${record.failedProofIds.length} failed proof ID(s)`,
      );
    }
    if (record.missingProofIds.length > 0) {
      parts.push(
        `${sys} has ${record.missingProofIds.length} missing proof ID(s)`,
      );
    }
  }
  if (parts.length === 0) {
    return REASON_SEMANTIC_EVIDENCE_INCOMPLETE;
  }
  return arrayJoin(parts, SEMICOLON_SPACE);
}

async function buildTiDbSemanticGateArtifact(options = {}) {
  const inputDir = options.inputDir || DEFAULT_INPUT_DIR;
  const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;
  const artifacts = await loadProofArtifacts(inputDir, outputPath);
  const gate = buildScenarioASemanticGateEvidence({
    proofs: arrayMap(artifacts, ({proofRecord}) => proofRecord),
  });
  assertTiDbCoverage(gate);
  const payload = Object.freeze({
    schemaVersion: SCHEMA_VERSION_ONE,
    evidenceId: TIDB_EVIDENCE_ID,
    system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
    sourceArtifacts: Object.freeze(arrayMap(artifacts, (artifact) => Object.freeze({
      filename: artifact.filename,
      evidenceId: artifact.evidenceId,
      artifactSha256: artifact.artifactSha256,
      proofIds: Object.freeze([...artifact.proofRecord.proofIds]),
    }))),
    semanticGate: gate,
    comparable: false,
    nonComparableReason: TIDB_NON_COMPARABLE_REASON,
  });
  const artifactSha256 = canonicalPayloadDigest(payload);
  const evidence = Object.freeze({...payload, artifactSha256});
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(
    outputPath,
    JSON.stringify(evidence, null, 2) + NEWLINE,
    FILE_ENCODING_UTF8,
  );
  return evidence;
}

async function resolveSystemArtifacts({
  artifacts,
  inputDir,
  system,
  defaultPrefix,
  outputPath,
}) {
  if (Array.isArray(artifacts)) {
    return arrayMap(artifacts, (artifact, index) =>
      verifySystemEvidenceArtifact(
        artifact,
        artifact.filename || `${defaultPrefix}-${index}.json`,
        system,
      ));
  }
  if (typeof inputDir === STRING_TYPE) {
    return loadProofArtifactsForSystem(inputDir, system, outputPath);
  }
  return [];
}

async function buildPairedScenarioASemanticGateArtifact(options = {}) {
  const verifiedTidbArtifacts = await resolveSystemArtifacts({
    artifacts: options.tidbArtifacts,
    inputDir: options.tidbInputDir,
    system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
    defaultPrefix: TIDB_ARTIFACT_DEFAULT_PREFIX,
    outputPath: options.outputPath,
  });
  const verifiedLagrangeArtifacts = await resolveSystemArtifacts({
    artifacts: options.lagrangeArtifacts,
    inputDir: options.lagrangeInputDir,
    system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
    defaultPrefix: LAGRANGE_ARTIFACT_DEFAULT_PREFIX,
    outputPath: options.outputPath,
  });
  const allVerified = [...verifiedTidbArtifacts, ...verifiedLagrangeArtifacts];
  const baseProofs = Array.isArray(options.proofs) ? options.proofs : [];
  const proofs = [
    ...baseProofs,
    ...arrayMap(allVerified, ({proofRecord}) => proofRecord),
  ];

  const gate = buildScenarioASemanticGateEvidence({proofs});
  const comparable = Boolean(
    gate.semanticEquivalent === true && gate.status === STATUS_PASSED,
  );
  const nonComparableReason = determineNonComparableMessage(gate);
  const sourceArtifacts = arrayMap(allVerified, (artifact) =>
    Object.freeze({
      filename: artifact.filename,
      evidenceId: artifact.evidenceId,
      artifactSha256: artifact.artifactSha256,
      proofIds: Object.freeze([...artifact.proofRecord.proofIds]),
    }),
  );

  const payload = Object.freeze({
    schemaVersion: SCHEMA_VERSION_ONE,
    evidenceId: PAIRED_EVIDENCE_ID,
    sourceArtifacts: Object.freeze(sourceArtifacts),
    semanticGate: gate,
    comparable,
    nonComparableReason,
  });

  const artifactSha256 = canonicalPayloadDigest(payload);
  const evidence = Object.freeze({
    ...payload,
    artifactSha256,
  });

  if (options.outputPath) {
    await mkdir(path.dirname(options.outputPath), {recursive: true});
    await writeFile(
      options.outputPath,
      JSON.stringify(evidence, null, 2) + NEWLINE,
      FILE_ENCODING_UTF8,
    );
  }

  return evidence;
}

async function main() {
  const evidence = await buildTiDbSemanticGateArtifact({
    inputDir: process.argv[2] || DEFAULT_INPUT_DIR,
    outputPath: process.argv[3] || DEFAULT_OUTPUT_PATH,
  });
  process.stdout.write(
    MAIN_PASS_PREFIX +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      proofArtifacts: evidence.sourceArtifacts.length,
      proofIds:
        evidence.semanticGate.systems[OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV]
          .passedProofIds.length,
      semanticEquivalent: evidence.semanticGate.semanticEquivalent,
    }) + NEWLINE,
  );
}

if (import.meta.url === `${FILE_URL_PREFIX}${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}${NEWLINE}`);
    process.exitCode = 1;
  });
}

export {
  buildPairedScenarioASemanticGateArtifact,
  buildTiDbSemanticGateArtifact,
  verifyEvidenceArtifact,
  verifySystemEvidenceArtifact,
};
