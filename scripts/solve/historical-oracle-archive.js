// Versioned retention for solved oracle evidence that originally lived under an
// ignored output directory. This is deliberately narrower than the generic change-
// artifact store: it can only prove that one sealed Quest path still has the exact
// bytes named by that Quest's terminal event.

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync, gzipSync} from 'node:zlib';

const ARCHIVE_ROOT = 'solve/artifacts/historical-oracles';
const OBJECT_ROOT = `${ARCHIVE_ROOT}/sha256`;
const MANIFEST_PATH = `${ARCHIVE_ROOT}/manifest.json`;
const MANIFEST_KIND = 'solve-historical-oracle-archive';
const SCHEMA_VERSION = 1;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const CONTENT_ENCODING = 'gzip';
const TEXT_ENCODING = 'utf8';
const OBJECT_SUFFIX = '.oracle.json.gz';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const PROBLEM_ENTRY_QUEST_ID = 'entry has no Quest id';
const PROBLEM_ENTRY_SEALED_PATH = 'entry has no sealed path';
const PROBLEM_ENTRY_TERMINAL_HASH = 'entry has invalid terminal evidence SHA-256';
const PROBLEM_ENTRY_PAYLOAD_BYTES = 'entry has invalid payload byte count';
const PROBLEM_ENTRY_OBJECT_PATH =
  'entry object path is not canonical for terminal evidence SHA-256';
const PROBLEM_ENTRY_STORAGE_HASH = 'entry has invalid object storage SHA-256';
const PROBLEM_MANIFEST_SCHEMA = 'unsupported archive manifest schemaVersion';
const PROBLEM_MANIFEST_KIND = 'invalid archive manifest kind';
const PROBLEM_MANIFEST_HASH = 'invalid archive hash algorithm';
const PROBLEM_MANIFEST_ENCODING = 'invalid archive content encoding';
const PROBLEM_MANIFEST_ENTRIES = 'archive manifest entries must be an array';
const PROBLEM_MANIFEST_CANONICAL = 'archive manifest bytes are not canonical';
const PROBLEM_OBJECT_STORAGE_HASH = 'archive object storage SHA-256 mismatch';
const PROBLEM_PAYLOAD_BYTES = 'archive payload byte count mismatch';
const PROBLEM_PAYLOAD_HASH =
  'archive payload SHA-256 does not match terminal evidence';
const PROBLEM_TERMINAL_PATH =
  'terminal evidence path does not match sealed oracle path';
const PROBLEM_SEALED_PATH = 'archive sealed path does not match Quest';
const PROBLEM_TERMINAL_HASH = 'archive SHA-256 does not match terminal evidence';

function hash(bytes) {
  return createHash(HASH_ALGORITHM).update(bytes).digest(HASH_ENCODING);
}

function objectRelativePath(payloadSha256) {
  return `${OBJECT_ROOT}/${payloadSha256.slice(0, 2)}/` +
    `${payloadSha256}${OBJECT_SUFFIX}`;
}

function canonicalEntry(entry) {
  return {
    questId: entry.questId,
    sealedPath: entry.sealedPath,
    terminalEvidenceSha256: entry.terminalEvidenceSha256,
    payloadBytes: entry.payloadBytes,
    objectPath: entry.objectPath,
    objectStorageSha256: entry.objectStorageSha256,
  };
}

function entryOrder(left, right) {
  return left.questId.localeCompare(right.questId) ||
    left.sealedPath.localeCompare(right.sealedPath);
}

export function canonicalHistoricalOracleManifestBytes(manifest) {
  const entries = Array.isArray(manifest?.entries) ?
    manifest.entries.map(canonicalEntry).sort(entryOrder) : manifest?.entries;
  const canonical = {
    schemaVersion: manifest?.schemaVersion,
    kind: manifest?.kind,
    hashAlgorithm: manifest?.hashAlgorithm,
    contentEncoding: manifest?.contentEncoding,
    entries,
  };
  return Buffer.from(`${JSON.stringify(canonical, null, 2)}\n`);
}

export function historicalOracleArchivePaths() {
  return {archiveRoot: ARCHIVE_ROOT, objectRoot: OBJECT_ROOT, manifest: MANIFEST_PATH};
}

function entryProblems(entry) {
  const problems = [];
  if (typeof entry?.questId !== 'string' || entry.questId.length === 0) {
    problems.push(PROBLEM_ENTRY_QUEST_ID);
  }
  if (typeof entry?.sealedPath !== 'string' || entry.sealedPath.length === 0) {
    problems.push(PROBLEM_ENTRY_SEALED_PATH);
  }
  if (!SHA256_PATTERN.test(String(entry?.terminalEvidenceSha256 || ''))) {
    problems.push(PROBLEM_ENTRY_TERMINAL_HASH);
  }
  if (!Number.isInteger(entry?.payloadBytes) || entry.payloadBytes < 0) {
    problems.push(PROBLEM_ENTRY_PAYLOAD_BYTES);
  }
  const expectedPath = SHA256_PATTERN.test(
    String(entry?.terminalEvidenceSha256 || '')) ?
    objectRelativePath(entry.terminalEvidenceSha256) : null;
  if (entry?.objectPath !== expectedPath) {
    problems.push(PROBLEM_ENTRY_OBJECT_PATH);
  }
  if (!SHA256_PATTERN.test(String(entry?.objectStorageSha256 || ''))) {
    problems.push(PROBLEM_ENTRY_STORAGE_HASH);
  }
  return problems;
}

function duplicateEntryProblems(entries) {
  const problems = [];
  const questIds = new Set();
  const sealedPaths = new Set();
  for (const entry of entries) {
    if (questIds.has(entry.questId)) problems.push(`duplicate Quest id: ${entry.questId}`);
    if (sealedPaths.has(entry.sealedPath)) {
      problems.push(`duplicate sealed path: ${entry.sealedPath}`);
    }
    questIds.add(entry.questId);
    sealedPaths.add(entry.sealedPath);
  }
  return problems;
}

function manifestProblems(manifest, manifestBytes) {
  const problems = [];
  if (manifest?.schemaVersion !== SCHEMA_VERSION) {
    problems.push(PROBLEM_MANIFEST_SCHEMA);
  }
  if (manifest?.kind !== MANIFEST_KIND) problems.push(PROBLEM_MANIFEST_KIND);
  if (manifest?.hashAlgorithm !== HASH_ALGORITHM) {
    problems.push(PROBLEM_MANIFEST_HASH);
  }
  if (manifest?.contentEncoding !== CONTENT_ENCODING) {
    problems.push(PROBLEM_MANIFEST_ENCODING);
  }
  if (!Array.isArray(manifest?.entries)) {
    problems.push(PROBLEM_MANIFEST_ENTRIES);
    return problems;
  }
  for (const entry of manifest.entries) problems.push(...entryProblems(entry));
  problems.push(...duplicateEntryProblems(manifest.entries));
  if (!manifestBytes.equals(canonicalHistoricalOracleManifestBytes(manifest))) {
    problems.push(PROBLEM_MANIFEST_CANONICAL);
  }
  return problems;
}

function invalid(problems, extra = {}) {
  return {valid: false, problems, ...extra};
}

function readManifest(root) {
  const manifestFile = path.join(root, MANIFEST_PATH);
  if (!fs.existsSync(manifestFile)) {
    return invalid([`archive manifest is missing: ${MANIFEST_PATH}`]);
  }
  const manifestBytes = fs.readFileSync(manifestFile);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString(TEXT_ENCODING));
  } catch (error) {
    return invalid([`archive manifest JSON is unreadable: ${error.message}`]);
  }
  const problems = manifestProblems(manifest, manifestBytes);
  return problems.length > 0 ? invalid(problems, {manifest, manifestBytes}) :
    {valid: true, problems: [], manifest, manifestBytes};
}

function verifyEntryObject(root, entry) {
  const objectFile = path.join(root, entry.objectPath);
  if (!fs.existsSync(objectFile)) {
    return invalid([`archive object is missing: ${entry.objectPath}`], {entry});
  }
  const objectBytes = fs.readFileSync(objectFile);
  if (hash(objectBytes) !== entry.objectStorageSha256) {
    return invalid([PROBLEM_OBJECT_STORAGE_HASH], {entry, objectBytes});
  }
  let payload;
  try {
    payload = gunzipSync(objectBytes);
  } catch (error) {
    return invalid([`archive object gzip is unreadable: ${error.message}`],
      {entry, objectBytes});
  }
  const problems = [];
  if (payload.length !== entry.payloadBytes) {
    problems.push(PROBLEM_PAYLOAD_BYTES);
  }
  if (hash(payload) !== entry.terminalEvidenceSha256) {
    problems.push(PROBLEM_PAYLOAD_HASH);
  }
  return problems.length > 0 ? invalid(problems, {entry, objectBytes, payload}) :
    {valid: true, problems: [], entry, objectBytes, payload};
}

export function verifyHistoricalOracleArchive(root, binding) {
  const read = readManifest(root);
  if (!read.valid) return read;
  const matches = read.manifest.entries.filter(
    (entry) => entry.questId === binding.questId);
  if (matches.length !== 1) {
    return invalid([`archive has no unique entry for Quest ${binding.questId}`]);
  }
  const entry = matches[0];
  const problems = [];
  if (binding.terminalEvidencePath !== binding.sealedPath) {
    problems.push(PROBLEM_TERMINAL_PATH);
  }
  if (entry.sealedPath !== binding.sealedPath) {
    problems.push(PROBLEM_SEALED_PATH);
  }
  if (entry.terminalEvidenceSha256 !== binding.terminalEvidenceSha256) {
    problems.push(PROBLEM_TERMINAL_HASH);
  }
  if (problems.length > 0) return invalid(problems, {entry});
  return verifyEntryObject(root, entry);
}

function preparedRecord(record) {
  const payload = Buffer.isBuffer(record.payload) ? record.payload :
    Buffer.from(record.payload);
  const terminalEvidenceSha256 = hash(payload);
  const objectBytes = gzipSync(payload, {mtime: 0});
  const entry = {
    questId: record.questId,
    sealedPath: record.sealedPath,
    terminalEvidenceSha256,
    payloadBytes: payload.length,
    objectPath: objectRelativePath(terminalEvidenceSha256),
    objectStorageSha256: hash(objectBytes),
  };
  return {entry, objectBytes, payload};
}

export function prepareHistoricalOracleArchive(records) {
  const objects = records.map(preparedRecord);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    kind: MANIFEST_KIND,
    hashAlgorithm: HASH_ALGORITHM,
    contentEncoding: CONTENT_ENCODING,
    entries: objects.map(({entry}) => entry).sort(entryOrder),
  };
  return {
    manifest,
    manifestBytes: canonicalHistoricalOracleManifestBytes(manifest),
    objects,
  };
}

export function writeHistoricalOracleArchive(root, records) {
  const prepared = prepareHistoricalOracleArchive(records);
  for (const item of prepared.objects) {
    const objectFile = path.join(root, item.entry.objectPath);
    fs.mkdirSync(path.dirname(objectFile), {recursive: true});
    fs.writeFileSync(objectFile, item.objectBytes);
  }
  const manifestFile = path.join(root, MANIFEST_PATH);
  fs.mkdirSync(path.dirname(manifestFile), {recursive: true});
  fs.writeFileSync(manifestFile, prepared.manifestBytes);
  return prepared;
}
