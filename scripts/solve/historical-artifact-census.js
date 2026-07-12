import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

import {CONTENT_ADDRESS_THRESHOLD_BYTES} from
  './content-addressed-change-artifact.js';
import {buildProofArtifactCensus} from './proof-artifact-census.js';
import {PROOF_ARTIFACT_CENSUS} from './proof-artifact-census-constants.js';

const TEXT_ENCODING = 'utf8';
const MAX_GIT_BUFFER_BYTES = 64 * 1024 * 1024;
const TERMINAL_REPORT = /\*\*Outcome:\*\* (?:SOLVED|EXHAUSTED)/u;
const ACTIONABLE_REPORT = /- Next (?:move|action): (?!No open frontier remains)/u;
const OBJECT_PATH_SUFFIX = '.diff.gz';
const ENTRY_SEPARATOR = '\n';
const HASH_ENCODING_BASE64 = 'base64';
const GIT_COMMAND = 'git';
const GIT_ARGUMENT = Object.freeze({
  REV_PARSE: 'rev-parse',
  VERIFY: '--verify',
  LS_TREE: 'ls-tree',
  RECURSIVE: '-r',
  NUL_TERMINATED: '-z',
  LONG: '--long',
  PATH_SEPARATOR: '--',
  CAT_FILE: 'cat-file',
  BLOB: 'blob',
});
const TREE_RECORD_INDEX = Object.freeze({MODE: 1, OBJECT: 2, BYTES: 3, PATH: 4});
const NUL_SEPARATOR = '\0';
const ARCHIVE_SUFFIX = Object.freeze({
  TAR_GZIP: '.tar.gz',
  LOG_GZIP: '.log.gz',
  MARKER: '/ARCHIVED.md',
  SEGMENT: '/archive/',
});
const MIGRATION_DESCRIPTOR_ESTIMATE_BYTES = 512;
const PATH_PREFIX = Object.freeze({
  OBJECTS: 'solve/artifacts/sha256/',
  LOG: 'solve/log/',
  REPORT: 'solve/report/',
  QUEST: 'solve/quests/',
  CHANGE: 'solve/changes/',
});
const PATH_SUFFIX = Object.freeze({
  NDJSON: '.ndjson',
  MARKDOWN: '.md',
  JSON: '.json',
  DESCRIPTOR: '.diff.json',
  GZIP_DIFF: '.diff.gz',
  DIFF: '.diff',
  PATCH: '.patch',
});
const GENERATED_PATH = Object.freeze({
  FRONTIER: 'solve/FRONTIER.generated.md',
  OVERVIEW: 'solve/OVERVIEW.generated.md',
});
const CLASS_ID = Object.freeze({
  AUTHORITATIVE: 'authoritative-definition',
  QUEST: 'quest-declaration',
  EVENT_LOG: 'event-log',
  INLINE_A2B: 'change-inline-a2b',
  INLINE_POLICY: 'change-inline-policy',
  INLINE_INFEASIBLE: 'change-inline-scope-infeasible',
  HISTORICAL_GZIP: 'change-historical-gzip',
  DESCRIPTOR: 'change-descriptor',
  OBJECT_REFERENCED: 'content-object-referenced',
  OBJECT_ORPHAN: 'content-object-orphan',
  CHANGE_EVIDENCE: 'change-evidence',
  ARCHIVE: 'archive-evidence',
  REPORT_REGENERABLE: 'report-regenerable',
  REPORT_LEGACY: 'report-terminal-actionable-v1',
  REPORT_UNIQUE: 'report-unique',
  GENERATED: 'generated-projection',
  INVALID: 'invalid-unknown',
});
const PROBLEM = Object.freeze({
  UNCLASSIFIED_REFERENCE: 'W11 contains an unclassified tracked changeRef',
  EMPTY_INVENTORY: 'historical Solver inventory is empty',
  W12_RECEIPT_MISSING: 'W12 migration receipt is missing from census tree',
  EMPTY: 'empty-inventory',
  DUPLICATE: 'duplicate-path',
  FILE_COUNT: 'file-count',
  BYTE_COUNT: 'byte-count',
  BYTE_RECONCILIATION: 'byte-reconciliation',
  CLASS_DECISION: 'class-or-decision',
  A2B_COVERAGE: 'a2b-coverage',
  A3B_COVERAGE: 'a3b-coverage',
  DIGEST: 'census-digest',
});
const DESCRIPTOR_SUFFIX_SEPARATOR = ', ';
const PLANNED_PATHS_PER_PAYLOAD = 3;
const FILE_ROW_CLASS_INDEX = 4;
const LIVE_INPUT_DRIFT_PREFIX = 'tracked historical W11 input drifted: ';

const CLASS_DEFINITIONS = Object.freeze([
  ['authoritative-definition', 'authoritative', 'retain-authoritative', null],
  ['quest-declaration', 'authoritative', 'retain-authoritative', null],
  ['event-log', 'audit-evidence', 'retain-audit-required', null],
  ['change-inline-a2b', 'audit-evidence', 'migrate-a2b', 'A2b'],
  ['change-inline-policy', 'audit-evidence', 'retain-inline-policy', null],
  ['change-inline-scope-infeasible', 'audit-evidence',
    'retain-scope-infeasible', null],
  ['change-historical-gzip', 'audit-evidence',
    'retain-legacy-readable', null],
  ['change-descriptor', 'audit-evidence',
    'retain-already-addressed', null],
  ['content-object-referenced', 'audit-evidence',
    'retain-content-storage', null],
  ['content-object-orphan', 'audit-evidence', 'retain-manual-review', null],
  ['change-evidence', 'audit-evidence', 'retain-unique-evidence', null],
  ['archive-evidence', 'audit-evidence', 'retain-archive-review', null],
  ['report-regenerable', 'derived-projection', 'candidate-a3a', 'A3a'],
  ['report-terminal-actionable-v1', 'legacy-projection',
    'migrate-or-label-a3b', 'A3b'],
  ['report-unique', 'audit-evidence', 'retain-unique-evidence', null],
  ['generated-projection', 'derived-projection', 'candidate-a3a', 'A3a'],
  ['invalid-unknown', 'invalid', 'block-invalid', null],
].map(([id, auditRole, decision, downstream]) => ({
  id,
  auditRole,
  decision,
  downstream,
})));

const CLASS_BY_ID = new Map(CLASS_DEFINITIONS.map((item) => [item.id, item]));

function hash(content) {
  return createHash(PROOF_ARTIFACT_CENSUS.HASH_ALGORITHM)
    .update(content)
    .digest(PROOF_ARTIFACT_CENSUS.HASH_ENCODING);
}

function hashBase64(content) {
  return createHash(PROOF_ARTIFACT_CENSUS.HASH_ALGORITHM)
    .update(content)
    .digest(HASH_ENCODING_BASE64);
}

function git(root, args, encoding = null) {
  return execFileSync(GIT_COMMAND, args, {
    cwd: root,
    encoding,
    maxBuffer: MAX_GIT_BUFFER_BYTES,
  });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) =>
    [key, canonical(value[key])]));
}

export function canonicalHistoricalCensusBytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value))}\n`);
}

function resolveCommit(root, revision) {
  return git(root, [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.VERIFY,
    `${revision}^{commit}`], TEXT_ENCODING)
    .trim();
}

function parseTreeRecord(record) {
  const match = /^(\d+) blob ([0-9a-f]+)\s+(\d+)\t([\s\S]+)$/u.exec(record);
  if (!match) throw new Error(`malformed Git tree record: ${record}`);
  return {
    mode: match[TREE_RECORD_INDEX.MODE],
    objectId: match[TREE_RECORD_INDEX.OBJECT],
    bytes: Number(match[TREE_RECORD_INDEX.BYTES]),
    path: match[TREE_RECORD_INDEX.PATH],
  };
}

function trackedSolverFiles(root, commit) {
  const output = git(root, [GIT_ARGUMENT.LS_TREE, GIT_ARGUMENT.RECURSIVE,
    GIT_ARGUMENT.NUL_TERMINATED, GIT_ARGUMENT.LONG, commit,
    GIT_ARGUMENT.PATH_SEPARATOR, 'solve']);
  return output.toString(TEXT_ENCODING).split(NUL_SEPARATOR).filter(Boolean)
    .map(parseTreeRecord).sort((left, right) => left.path.localeCompare(right.path));
}

function readBlob(root, objectId) {
  return git(root, [GIT_ARGUMENT.CAT_FILE, GIT_ARGUMENT.BLOB, objectId]);
}

function isArchivePath(filePath) {
  return filePath.endsWith(ARCHIVE_SUFFIX.TAR_GZIP) ||
    filePath.endsWith(ARCHIVE_SUFFIX.LOG_GZIP) ||
    filePath.endsWith(ARCHIVE_SUFFIX.MARKER) ||
    filePath.includes(ARCHIVE_SUFFIX.SEGMENT);
}

function objectPathFor(payloadSha256) {
  return `solve/artifacts/sha256/${payloadSha256.slice(0, 2)}/` +
    `${payloadSha256}${OBJECT_PATH_SUFFIX}`;
}

function migrationEstimate(content) {
  return content.length + (2 * gzipSync(content).length) +
    MIGRATION_DESCRIPTOR_ESTIMATE_BYTES;
}

function reportClass(filePath, content, trackedPaths) {
  const questId = path.basename(filePath, '.md');
  const hasQuest = trackedPaths.has(`solve/quests/${questId}.json`);
  const hasLog = trackedPaths.has(`solve/log/${questId}.ndjson`);
  const text = content.toString(TEXT_ENCODING);
  if (hasQuest && hasLog && TERMINAL_REPORT.test(text) &&
    ACTIONABLE_REPORT.test(text)) return CLASS_ID.REPORT_LEGACY;
  return hasQuest && hasLog ? CLASS_ID.REPORT_REGENERABLE : CLASS_ID.REPORT_UNIQUE;
}

function classifyObjectPath(filePath, _content, _trackedPaths, objectReferences) {
  if (!filePath.startsWith(PATH_PREFIX.OBJECTS)) return null;
  return objectReferences.has(filePath) ?
    CLASS_ID.OBJECT_REFERENCED : CLASS_ID.OBJECT_ORPHAN;
}

function classifyLogPath(filePath) {
  if (!filePath.startsWith(PATH_PREFIX.LOG)) return null;
  return filePath.endsWith(PATH_SUFFIX.NDJSON) ?
    CLASS_ID.EVENT_LOG : CLASS_ID.INVALID;
}

function classifyReportPath(filePath, content, trackedPaths) {
  if (!filePath.startsWith(PATH_PREFIX.REPORT)) return null;
  return filePath.endsWith(PATH_SUFFIX.MARKDOWN) ?
    reportClass(filePath, content, trackedPaths) : CLASS_ID.REPORT_UNIQUE;
}

function classifyQuestPath(filePath) {
  if (!filePath.startsWith(PATH_PREFIX.QUEST)) return null;
  return filePath.endsWith(PATH_SUFFIX.JSON) ? CLASS_ID.QUEST : CLASS_ID.INVALID;
}

function classifyChangePath(filePath, content) {
  if (!filePath.startsWith(PATH_PREFIX.CHANGE)) return null;
  if (filePath.endsWith(PATH_SUFFIX.DESCRIPTOR)) return CLASS_ID.DESCRIPTOR;
  if (filePath.endsWith(PATH_SUFFIX.GZIP_DIFF)) return CLASS_ID.HISTORICAL_GZIP;
  if (isArchivePath(filePath)) return CLASS_ID.ARCHIVE;
  if (!filePath.endsWith(PATH_SUFFIX.DIFF) &&
    !filePath.endsWith(PATH_SUFFIX.PATCH)) return CLASS_ID.CHANGE_EVIDENCE;
  if (content.length < CONTENT_ADDRESS_THRESHOLD_BYTES) return CLASS_ID.INLINE_POLICY;
  const estimate = migrationEstimate(content) +
    PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_FIXED_BYTES;
  return estimate <= PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_MAX_BYTES ?
    CLASS_ID.INLINE_A2B : CLASS_ID.INLINE_INFEASIBLE;
}

function classifyOtherPath(filePath) {
  if (isArchivePath(filePath)) return CLASS_ID.ARCHIVE;
  if (filePath === GENERATED_PATH.FRONTIER || filePath === GENERATED_PATH.OVERVIEW) {
    return CLASS_ID.GENERATED;
  }
  if (/^solve\/(?:epics|specs|oracle|oracles|autonomous)\//u.test(filePath) ||
    /^solve\/(?:release-[^/]+\.json|theory-ledger\.md)$/u.test(filePath)) {
    return CLASS_ID.AUTHORITATIVE;
  }
  return CLASS_ID.INVALID;
}

const PATH_CLASSIFIERS = Object.freeze([
  classifyObjectPath,
  classifyLogPath,
  classifyReportPath,
  classifyQuestPath,
  classifyChangePath,
]);

function baseClass(filePath, content, trackedPaths, objectReferences) {
  for (const classify of PATH_CLASSIFIERS) {
    const result = classify(filePath, content, trackedPaths, objectReferences);
    if (result) return result;
  }
  return classifyOtherPath(filePath);
}

function descriptorObjectReferences(root, files) {
  const references = new Set();
  for (const file of files.filter((item) =>
    item.path.endsWith(PATH_SUFFIX.DESCRIPTOR))) {
    let descriptor;
    try {
      descriptor = JSON.parse(readBlob(root, file.objectId).toString(TEXT_ENCODING));
    } catch (error) {
      throw new Error(`invalid descriptor ${file.path}: ${error.message}`);
    }
    if (typeof descriptor.objectPath !== 'string') {
      throw new Error(`descriptor lacks objectPath: ${file.path}`);
    }
    references.add(descriptor.objectPath);
  }
  return references;
}

function isW11Input(filePath) {
  return filePath.startsWith(PATH_PREFIX.LOG) ||
    filePath.startsWith(PATH_PREFIX.OBJECTS) ||
    (filePath.startsWith(PATH_PREFIX.CHANGE) &&
      (filePath.endsWith(PATH_SUFFIX.DIFF) ||
        filePath.endsWith(PATH_SUFFIX.PATCH) ||
        filePath.endsWith(PATH_SUFFIX.GZIP_DIFF) ||
        filePath.endsWith(PATH_SUFFIX.DESCRIPTOR)));
}

function assertLiveW11InputsMatchTree(root, files) {
  for (const file of files.filter((item) => isW11Input(item.path))) {
    const livePath = path.join(root, file.path);
    const tracked = readBlob(root, file.objectId);
    if (!fs.existsSync(livePath) || hash(fs.readFileSync(livePath)) !== hash(tracked)) {
      throw new Error(`${LIVE_INPUT_DRIFT_PREFIX}${file.path}`);
    }
  }
}

function reconcileProofArtifacts(root, files, commit) {
  assertLiveW11InputsMatchTree(root, files);
  const trackedPaths = new Set(files.map((item) => item.path));
  const proof = buildProofArtifactCensus(root);
  const artifactByPath = new Map(proof.artifacts.map((item) => [item.path, item]));
  const artifacts = files.filter((item) =>
    item.path.startsWith('solve/changes/') &&
    (item.path.endsWith('.diff') || item.path.endsWith('.patch') ||
      item.path.endsWith('.diff.gz') || item.path.endsWith('.diff.json')));
  for (const file of artifacts) {
    const artifact = artifactByPath.get(file.path);
    if (!artifact?.readable) {
      throw new Error(`W11 reader cannot resolve ${file.path} at ${commit}`);
    }
    const blob = readBlob(root, file.objectId);
    if (hash(blob) !== artifact.storageSha256) {
      throw new Error(`tracked historical artifact drifted: ${file.path}`);
    }
  }
  const references = proof.references.filter((item) =>
    trackedPaths.has(item.logPath));
  if (references.some((item) => !item.classified)) {
    throw new Error(PROBLEM.UNCLASSIFIED_REFERENCE);
  }
  return {
    proof,
    artifactByPath,
    references,
    referencedPaths: new Set(references.filter((item) => item.resolved)
      .map((item) => item.resolvedPath)),
  };
}

function classRows(entries) {
  return CLASS_DEFINITIONS.map((definition, index) => {
    const matching = entries.filter((item) => item.classId === definition.id);
    return {
      index,
      ...definition,
      files: matching.length,
      bytes: matching.reduce((sum, item) => sum + item.bytes, 0),
    };
  });
}

function placeBatch(batches, candidate) {
  return batches.find((batch) =>
    batch.payloads.length < PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_MAX_PAYLOADS &&
    batch.conservativeChangeBytes + candidate.estimate <=
      PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_MAX_BYTES);
}

function buildA2bBatches(candidates) {
  const batches = [];
  const sorted = [...candidates].sort((left, right) =>
    right.estimate - left.estimate || left.path.localeCompare(right.path));
  for (const candidate of sorted) {
    let batch = placeBatch(batches, candidate);
    if (!batch) {
      batch = {
        payloads: [],
        conservativeChangeBytes:
          PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_FIXED_BYTES,
      };
      batches.push(batch);
    }
    batch.payloads.push(candidate);
    batch.conservativeChangeBytes += candidate.estimate;
  }
  return batches.map((batch, index) => {
    const number = String(index + 1).padStart(3, '0');
    const questId = `solver-historical-artifact-batch-${number}`;
    const payloads = batch.payloads.sort((left, right) =>
      left.path.localeCompare(right.path)).map(({estimate: _estimate, ...item}) => item);
    return {
      questId,
      payloads,
      pathCount: PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_FIXED_PATHS +
        (payloads.length * PLANNED_PATHS_PER_PAYLOAD),
      conservativeChangeBytes: batch.conservativeChangeBytes,
      limits: {
        paths: PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_MAX_PATHS,
        bytes: PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_MAX_BYTES,
      },
    };
  });
}

function compactReference(reference) {
  return [
    reference.logPath,
    reference.line,
    reference.changeRef,
    reference.resolvedPath || null,
    reference.readabilityStatus,
    reference.payloadSha256 || null,
  ];
}

function censusWithoutDigest(census) {
  const {censusSha256: _digest, ...rest} = census;
  return rest;
}

export function buildHistoricalArtifactCensus(root = process.cwd(), options = {}) {
  const commit = resolveCommit(root, options.commit || 'HEAD');
  const tree = git(root, ['rev-parse', `${commit}^{tree}`], TEXT_ENCODING).trim();
  const files = trackedSolverFiles(root, commit);
  if (files.length === 0) throw new Error(PROBLEM.EMPTY_INVENTORY);
  const trackedPaths = new Set(files.map((item) => item.path));
  const objectReferences = descriptorObjectReferences(root, files);
  const reconciliation = reconcileProofArtifacts(root, files, commit);
  const entries = files.map((file) => {
    const content = readBlob(root, file.objectId);
    const classId = baseClass(
      file.path,
      content,
      trackedPaths,
      objectReferences,
    );
    const definition = CLASS_BY_ID.get(classId);
    const proofArtifact = reconciliation.artifactByPath.get(file.path);
    const referenceStatus = proofArtifact ?
      (reconciliation.referencedPaths.has(file.path) ? 'referenced' : 'unreferenced') :
      (file.path.startsWith('solve/artifacts/sha256/') ?
        (objectReferences.has(file.path) ? 'referenced' : 'orphan') : null);
    return {
      path: file.path,
      mode: file.mode,
      bytes: file.bytes,
      sha256Base64: hashBase64(content),
      classId,
      decision: definition.decision,
      referenceStatus,
      payloadSha256: proofArtifact?.payloadSha256 || null,
      payloadBytes: proofArtifact?.payloadBytes ?? null,
      migrationEstimateBytes: classId === 'change-inline-a2b' ?
        migrationEstimate(content) : null,
    };
  });
  const invalid = entries.filter((item) => item.decision === 'block-invalid');
  if (invalid.length > 0) {
    throw new Error(`unclassified tracked Solver paths: ${invalid.map((item) =>
      item.path).join(DESCRIPTOR_SUFFIX_SEPARATOR)}`);
  }
  const migrateCandidates = entries.filter((item) =>
    item.decision === 'migrate-a2b').map((item) => ({
    path: item.path,
    payloadSha256: item.payloadSha256,
    payloadBytes: item.payloadBytes,
    encoding: 'inline-diff',
    objectPath: objectPathFor(item.payloadSha256),
    referenceStatus: item.referenceStatus,
    estimate: item.migrationEstimateBytes,
  }));
  const staleReports = entries.filter((item) =>
    item.decision === 'migrate-or-label-a3b');
  const receipt = files.find((item) =>
    item.path === PROOF_ARTIFACT_CENSUS.W12_RECEIPT_PATH);
  if (!receipt) throw new Error(PROBLEM.W12_RECEIPT_MISSING);
  const trackedBytes = entries.reduce((sum, item) => sum + item.bytes, 0);
  const compactFiles = entries.map((item) => {
    const artifactIdentity = item.referenceStatus || item.payloadSha256 ? [
      item.referenceStatus,
      item.payloadSha256,
      item.payloadBytes,
    ] : null;
    const row = [
      item.path,
      item.mode,
      item.bytes,
      item.sha256Base64,
      CLASS_DEFINITIONS.findIndex((definition) => definition.id === item.classId),
    ];
    if (artifactIdentity) row.push(artifactIdentity);
    return row;
  });
  const compactReferences = reconciliation.references.map(compactReference);
  const census = {
    schemaVersion: PROOF_ARTIFACT_CENSUS.HISTORICAL_CENSUS_SCHEMA_VERSION,
    snapshot: {
      commit,
      tree,
      trackedSetSha256: hash(Buffer.from(files.map((item) =>
        `${item.path}\0${item.mode}\0${item.objectId}\0${item.bytes}`)
        .join(ENTRY_SEPARATOR))),
      scope: 'all tracked solve/** blobs at commit',
    },
    authorities: {
      w11CensusOwner: 'scripts/solve/proof-artifact-census.js',
      changeArtifactReader: 'scripts/solve/content-addressed-change-artifact.js',
      w12Receipt: {
        path: receipt.path,
        sha256: hash(readBlob(root, receipt.objectId)),
      },
    },
    summary: {
      trackedFiles: entries.length,
      trackedBytes,
      classifiedFiles: entries.length,
      decidedFiles: entries.length,
      bytesReconciled: trackedBytes === files.reduce(
        (sum, item) => sum + item.bytes, 0),
      changeRefOccurrences: reconciliation.references.length,
      a2bPayloads: migrateCandidates.length,
      a2bBatches: null,
      a3bProjectionSchemas: staleReports.length > 0 ? 1 : 0,
    },
    fileRowSchema: ['path', 'mode', 'bytes', 'sha256-base64', 'class-index',
      'optional-artifact-identity'],
    classes: classRows(entries),
    files: compactFiles,
    referenceGraph: {
      changeRefOccurrences: compactReferences.length,
      classifiedOccurrences: reconciliation.references.filter((item) =>
        item.classified).length,
      resolvedOccurrences: reconciliation.references.filter((item) =>
        item.resolved).length,
      identitySha256: hash(Buffer.from(JSON.stringify(compactReferences))),
      descriptorObjectPaths: [...objectReferences].sort(),
    },
    childQuestBatch: {
      sealed: true,
      a2b: buildA2bBatches(migrateCandidates),
      a3b: staleReports.length === 0 ? [] : [{
        questId: 'solver-legacy-projection-terminal-actionable-v1',
        schema: 'terminal-actionable-v1',
        migrationMode: 'projection-boundary-label',
        affectedReports: staleReports.map((item) => item.path).sort(),
        affectedBytes: staleReports.reduce((sum, item) => sum + item.bytes, 0),
      }],
    },
  };
  census.summary.a2bBatches = census.childQuestBatch.a2b.length;
  census.censusSha256 = hash(canonicalHistoricalCensusBytes(censusWithoutDigest(census)));
  return census;
}

function validateFileRows(census, rows) {
  const paths = rows.map((row) => row[0]);
  const conditions = [
    [rows.length === 0, PROBLEM.EMPTY],
    [new Set(paths).size !== paths.length, PROBLEM.DUPLICATE],
    [rows.length !== census?.summary?.trackedFiles, PROBLEM.FILE_COUNT],
    [rows.reduce((sum, row) => sum + row[2], 0) !==
      census?.summary?.trackedBytes, PROBLEM.BYTE_COUNT],
    [!census?.summary?.bytesReconciled, PROBLEM.BYTE_RECONCILIATION],
    [rows.some((row) => !CLASS_BY_ID.has(
      census?.classes?.[row[FILE_ROW_CLASS_INDEX]]?.id)), PROBLEM.CLASS_DECISION],
  ];
  return conditions.filter(([failed]) => failed).map(([, problem]) => problem);
}

function validateA2bCoverage(census, rows) {
  const eligible = new Set(rows.filter((row) =>
    census?.classes?.[row[FILE_ROW_CLASS_INDEX]]?.decision === 'migrate-a2b')
    .map((row) => row[0]));
  const batched = census?.childQuestBatch?.a2b?.flatMap((batch) =>
    batch.payloads.map((item) => item.path)) || [];
  const invalid = new Set(batched).size !== batched.length ||
    batched.length !== eligible.size || batched.some((item) => !eligible.has(item));
  return invalid ? [PROBLEM.A2B_COVERAGE] : [];
}

function validateA2bLimits(census) {
  const problems = [];
  for (const batch of census?.childQuestBatch?.a2b || []) {
    if (batch.pathCount > PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_MAX_PATHS) {
      problems.push(`a2b-path-limit:${batch.questId}`);
    }
    if (batch.conservativeChangeBytes >
      PROOF_ARTIFACT_CENSUS.HISTORICAL_BATCH_MAX_BYTES) {
      problems.push(`a2b-byte-limit:${batch.questId}`);
    }
  }
  return problems;
}

function validateA3b(census, rows) {
  const problems = [];
  const stale = new Set(rows.filter((row) =>
    census?.classes?.[row[FILE_ROW_CLASS_INDEX]]?.decision ===
      'migrate-or-label-a3b')
    .map((row) => row[0]));
  const projected = census?.childQuestBatch?.a3b?.flatMap((batch) =>
    batch.affectedReports) || [];
  if (new Set(projected).size !== projected.length || projected.length !== stale.size ||
    projected.some((item) => !stale.has(item))) problems.push(PROBLEM.A3B_COVERAGE);
  return problems;
}

function validateCensusDigest(census) {
  const expectedDigest = hash(canonicalHistoricalCensusBytes(
    censusWithoutDigest(census)));
  return census?.censusSha256 === expectedDigest ? [] : [PROBLEM.DIGEST];
}

export function validateHistoricalArtifactCensus(census) {
  const rows = census?.files || [];
  return [
    ...validateFileRows(census, rows),
    ...validateA2bCoverage(census, rows),
    ...validateA2bLimits(census),
    ...validateA3b(census, rows),
    ...validateCensusDigest(census),
  ];
}
