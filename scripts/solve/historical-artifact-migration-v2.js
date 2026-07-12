import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  contentObjectRelativePathForPayload,
  readChangeArtifact,
} from './content-addressed-change-artifact.js';
import {
  validateHistoricalArtifactCensus,
} from './historical-artifact-census.js';
import {HISTORICAL_ARTIFACT_MIGRATION_V2 as CONTRACT} from
  './historical-artifact-migration-v2-constants.js';

const PROBLEM = Object.freeze({
  MANIFEST_EXISTS: 'v2 migration manifest already exists',
  MANIFEST_MISSING: 'v2 migration manifest is missing',
  CENSUS_UNCOMMITTED: 'A1 census is not byte-identical to HEAD',
  CENSUS_INVALID: 'A1 census validation failed: ',
  W12_MISSING: 'W12 migration receipt is missing',
  W12_AUTHORITY: 'current W12 receipt differs from the A1 authority',
  BATCH_RECEIPTS_EXIST: 'v2 batch receipts exist before manifest creation',
  BATCH_COUNT: 'A1 batch count does not match the sealed A2a contract',
  PAYLOAD_COUNT: 'A1 payload count does not match the sealed A2a contract',
  DUPLICATE_PAYLOAD: 'A1 contains duplicate migration payload paths',
  SOURCE_INVALID: 'A1 migration source is unreadable: ',
  SOURCE_NOT_INLINE: 'A1 migration source is not inline: ',
  SOURCE_IDENTITY: 'A1 migration source identity changed: ',
  BATCH_LIMIT: 'A1 batch exceeds its sealed scope: ',
  RECEIPT_JSON: 'v2 migration manifest JSON is unreadable: ',
  RECEIPT_CANONICAL: 'v2 migration manifest bytes are not canonical',
  RECEIPT_PLAN: 'v2 migration manifest differs from the A1 plan',
});
const GIT_COMMAND = 'git';
const GIT_DIFF_ARGUMENTS = Object.freeze([
  'diff',
  '--quiet',
  'HEAD',
  '--',
  CONTRACT.CENSUS_PATH,
]);
const GIT_TRACKED_ARGUMENTS = Object.freeze([
  'ls-files',
  '--error-unmatch',
  '--',
  CONTRACT.CENSUS_PATH,
]);
const GIT_SUCCESS = 0;
const CANONICAL_NEWLINE = '\n';
const PATH_INDEX = 0;
const PROBLEM_SEPARATOR = '; ';

function hash(content) {
  return createHash(CONTRACT.HASH_ALGORITHM)
    .update(content)
    .digest(CONTRACT.HASH_ENCODING);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) =>
    [key, canonical(value[key])]));
}

export function canonicalMigrationV2Bytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value), null, 2)}` +
    CANONICAL_NEWLINE);
}

function workspacePath(root, relative) {
  return path.resolve(root, relative);
}

function readJson(root, relative) {
  const bytes = fs.readFileSync(workspacePath(root, relative));
  return {
    bytes,
    value: JSON.parse(bytes.toString(CONTRACT.TEXT_ENCODING)),
  };
}

function censusIsCommitted(root) {
  const tracked = spawnSync(GIT_COMMAND, GIT_TRACKED_ARGUMENTS, {cwd: root});
  const unchanged = spawnSync(GIT_COMMAND, GIT_DIFF_ARGUMENTS, {cwd: root});
  return tracked.status === GIT_SUCCESS && unchanged.status === GIT_SUCCESS;
}

function loadCensus(root) {
  if (!censusIsCommitted(root)) throw new Error(PROBLEM.CENSUS_UNCOMMITTED);
  const censusFile = readJson(root, CONTRACT.CENSUS_PATH);
  const problems = validateHistoricalArtifactCensus(censusFile.value);
  if (problems.length > 0) {
    throw new Error(PROBLEM.CENSUS_INVALID + problems.join(PROBLEM_SEPARATOR));
  }
  return {
    ...censusFile,
    artifactSha256: hash(censusFile.bytes),
  };
}

function loadW12Receipt(root, census) {
  const file = workspacePath(root, CONTRACT.W12_RECEIPT_PATH);
  if (!fs.existsSync(file)) throw new Error(PROBLEM.W12_MISSING);
  const bytes = fs.readFileSync(file);
  const sha256 = hash(bytes);
  const authority = census.authorities?.w12Receipt;
  if (authority?.path !== CONTRACT.W12_RECEIPT_PATH ||
    authority?.sha256 !== sha256) {
    throw new Error(PROBLEM.W12_AUTHORITY);
  }
  return {bytes, sha256};
}

function batchReceiptFiles(root) {
  const directory = workspacePath(root, CONTRACT.BATCH_RECEIPT_DIRECTORY);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true})
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name).sort();
}

function assertCreationState(root) {
  if (fs.existsSync(workspacePath(root, CONTRACT.MANIFEST_PATH))) {
    throw new Error(PROBLEM.MANIFEST_EXISTS);
  }
  if (batchReceiptFiles(root).length > 0) {
    throw new Error(PROBLEM.BATCH_RECEIPTS_EXIST);
  }
}

function plannedPayload(root, payload, requireInline) {
  const changeRef = `${CONTRACT.CHANGE_REF_PREFIX}${payload.path}`;
  const artifact = readChangeArtifact(root, changeRef);
  if (!artifact.valid) throw new Error(PROBLEM.SOURCE_INVALID + payload.path);
  if (requireInline && artifact.kind !== CONTRACT.BEFORE_KIND) {
    throw new Error(PROBLEM.SOURCE_NOT_INLINE + payload.path);
  }
  if (artifact.payloadSha256 !== payload.payloadSha256 ||
    artifact.payloadBytes !== payload.payloadBytes) {
    throw new Error(PROBLEM.SOURCE_IDENTITY + payload.path);
  }
  const descriptorPath = `${payload.path}${CONTRACT.DESCRIPTOR_SUFFIX}`;
  const before = {
    kind: CONTRACT.BEFORE_KIND,
    payloadSha256: payload.payloadSha256,
    payloadBytes: payload.payloadBytes,
  };
  const plannedAfter = {
    kind: CONTRACT.AFTER_KIND,
    descriptorPath,
    objectPath: contentObjectRelativePathForPayload(payload.payloadSha256),
    payloadSha256: payload.payloadSha256,
    payloadBytes: payload.payloadBytes,
  };
  return {
    sourcePath: payload.path,
    referenceStatus: payload.referenceStatus,
    before,
    plannedAfter,
  };
}

function plannedBatch(root, batch, ordinal, requireInline) {
  if (batch.pathCount > CONTRACT.MAX_BATCH_PATHS ||
    batch.conservativeChangeBytes > CONTRACT.MAX_BATCH_BYTES) {
    throw new Error(PROBLEM.BATCH_LIMIT + batch.questId);
  }
  const entries = batch.payloads.map((payload) =>
    plannedPayload(root, payload, requireInline));
  const inventory = {
    questId: batch.questId,
    ordinal,
    pathLimit: batch.limits.paths,
    byteLimit: batch.limits.bytes,
    pathCount: batch.pathCount,
    conservativeChangeBytes: batch.conservativeChangeBytes,
    entries,
  };
  return {
    ...inventory,
    inventorySha256: hash(canonicalMigrationV2Bytes(inventory)),
  };
}

function assertInventoryShape(batches, options) {
  const expectedBatchCount = options.expectedBatchCount ??
    CONTRACT.EXPECTED_BATCH_COUNT;
  const expectedPayloadCount = options.expectedPayloadCount ??
    CONTRACT.EXPECTED_PAYLOAD_COUNT;
  if (batches.length !== expectedBatchCount) {
    throw new Error(PROBLEM.BATCH_COUNT);
  }
  const paths = batches.flatMap((batch) =>
    batch.payloads.map((payload) => payload.path));
  if (paths.length !== expectedPayloadCount) {
    throw new Error(PROBLEM.PAYLOAD_COUNT);
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error(PROBLEM.DUPLICATE_PAYLOAD);
  }
}

export function buildHistoricalMigrationV2Manifest(
  root = process.cwd(),
  options = {},
) {
  const censusFile = loadCensus(root);
  const census = censusFile.value;
  const sourceBatches = census.childQuestBatch.a2b;
  assertInventoryShape(sourceBatches, options);
  const batches = sourceBatches.map((batch, index) =>
    plannedBatch(root, batch, index + 1, options.requireInline === true));
  const batchInventorySha256 = hash(canonicalMigrationV2Bytes(batches));
  const schemaSha256 = hash(canonicalMigrationV2Bytes(
    CONTRACT.BATCH_RECEIPT_SCHEMA));
  const w12 = loadW12Receipt(root, census);
  const manifest = {
    schemaVersion: CONTRACT.SCHEMA_VERSION,
    kind: CONTRACT.MANIFEST_KIND,
    census: {
      path: CONTRACT.CENSUS_PATH,
      artifactSha256: censusFile.artifactSha256,
      censusSha256: census.censusSha256,
      schemaVersion: census.schemaVersion,
      snapshotCommit: census.snapshot.commit,
      snapshotTree: census.snapshot.tree,
    },
    migrationSchema: {
      id: CONTRACT.BATCH_SCHEMA_ID,
      version: CONTRACT.SCHEMA_VERSION,
      schemaSha256,
    },
    batchInventorySha256,
    w12Receipt: {
      path: CONTRACT.W12_RECEIPT_PATH,
      sha256: w12.sha256,
    },
    batches,
  };
  return manifest;
}

export function writeHistoricalMigrationV2Manifest(
  root = process.cwd(),
  options = {},
) {
  assertCreationState(root);
  const manifest = buildHistoricalMigrationV2Manifest(root, {
    ...options,
    requireInline: true,
  });
  const file = workspacePath(root, CONTRACT.MANIFEST_PATH);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, canonicalMigrationV2Bytes(manifest));
  fs.renameSync(temporary, file);
  return {manifest, manifestPath: CONTRACT.MANIFEST_PATH};
}

function parseManifest(root) {
  const file = workspacePath(root, CONTRACT.MANIFEST_PATH);
  if (!fs.existsSync(file)) {
    return {manifest: null, problems: [PROBLEM.MANIFEST_MISSING]};
  }
  try {
    const parsed = readJson(root, CONTRACT.MANIFEST_PATH);
    return {manifest: parsed.value, bytes: parsed.bytes, problems: []};
  } catch (error) {
    return {manifest: null, problems: [PROBLEM.RECEIPT_JSON + error.message]};
  }
}

export function validateHistoricalMigrationV2Manifest(
  root = process.cwd(),
  options = {},
) {
  const parsed = parseManifest(root);
  if (!parsed.manifest) {
    const batchProblems = batchReceiptFiles(root).length > 0 ?
      [PROBLEM.BATCH_RECEIPTS_EXIST] : [];
    return {valid: false, problems: [...parsed.problems, ...batchProblems]};
  }
  const problems = [];
  if (!parsed.bytes.equals(canonicalMigrationV2Bytes(parsed.manifest))) {
    problems.push(PROBLEM.RECEIPT_CANONICAL);
  }
  let expected = null;
  try {
    expected = buildHistoricalMigrationV2Manifest(root, options);
    if (!canonicalMigrationV2Bytes(parsed.manifest)
      .equals(canonicalMigrationV2Bytes(expected))) {
      problems.push(PROBLEM.RECEIPT_PLAN);
    }
  } catch (error) {
    problems.push(error.message);
  }
  return {
    valid: problems.length === 0,
    problems,
    manifest: parsed.manifest,
    expected,
  };
}

export function historicalMigrationV2Paths() {
  return {
    manifest: CONTRACT.MANIFEST_PATH,
    batchReceipts: CONTRACT.BATCH_RECEIPT_DIRECTORY,
  };
}

export function manifestPayloadPaths(manifest) {
  return manifest.batches.flatMap((batch) =>
    batch.entries.map((entry) => entry.sourcePath)).sort((left, right) =>
    left.localeCompare(right));
}

export function manifestBatchIds(manifest) {
  return manifest.batches.map((batch) => batch.questId);
}

export function manifestSourcePath(manifest, sourcePath) {
  return manifest.batches.flatMap((batch) => batch.entries)
    .find((entry) => entry.sourcePath === sourcePath)?.sourcePath || null;
}

export function manifestFirstPayload(manifest) {
  return manifest.batches[PATH_INDEX]?.entries[PATH_INDEX] || null;
}
