import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync, gzipSync} from 'node:zlib';

import {PROOF_ARTIFACT_CENSUS} from './proof-artifact-census-constants.js';

function normalizePath(value) {
  return String(value).split(path.sep).join('/');
}

function relativePath(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function hash(content) {
  return createHash(PROOF_ARTIFACT_CENSUS.HASH_ALGORITHM)
    .update(content)
    .digest(PROOF_ARTIFACT_CENSUS.HASH_ENCODING);
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files.sort();
}

function artifactEncoding(filePath) {
  if (filePath.endsWith(PROOF_ARTIFACT_CENSUS.GZIP_DIFF_SUFFIX)) {
    return PROOF_ARTIFACT_CENSUS.ENCODING_GZIP_DIFF;
  }
  if (filePath.endsWith(PROOF_ARTIFACT_CENSUS.INLINE_DIFF_SUFFIX) ||
    filePath.endsWith(PROOF_ARTIFACT_CENSUS.PATCH_SUFFIX)) {
    return PROOF_ARTIFACT_CENSUS.ENCODING_INLINE_DIFF;
  }
  return null;
}

function readPayload(filePath, encoding) {
  const stored = fs.readFileSync(filePath);
  const payload = encoding === PROOF_ARTIFACT_CENSUS.ENCODING_GZIP_DIFF ?
    gunzipSync(stored) : stored;
  return {stored, payload};
}

function inventoryArtifact(root, filePath) {
  const encoding = artifactEncoding(filePath);
  try {
    const {stored, payload} = readPayload(filePath, encoding);
    return {
      path: relativePath(root, filePath),
      encoding,
      readable: true,
      storageBytes: stored.length,
      payloadBytes: payload.length,
      storageSha256: hash(stored),
      payloadSha256: hash(payload),
      gzipBytes: gzipSync(payload).length,
      readError: null,
    };
  } catch (error) {
    return {
      path: relativePath(root, filePath),
      encoding,
      readable: false,
      storageBytes: fs.statSync(filePath).size,
      payloadBytes: null,
      storageSha256: null,
      payloadSha256: null,
      gzipBytes: null,
      readError: error.message,
    };
  }
}

function inventoryArtifacts(root) {
  const changesDir = path.join(root, PROOF_ARTIFACT_CENSUS.CHANGES_DIR);
  return walkFiles(changesDir)
    .filter((filePath) => artifactEncoding(filePath) !== null)
    .map((filePath) => inventoryArtifact(root, filePath));
}

function collectChangeRefs(value, pointer, references) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectChangeRefs(item, `${pointer}/${index}`, references));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${key}`;
    if (key === 'changeRef' && typeof child === 'string') {
      references.push({changeRef: child, pointer: childPointer});
    }
    collectChangeRefs(child, childPointer, references);
  }
}

function readReferences(root) {
  const logDir = path.join(root, PROOF_ARTIFACT_CENSUS.LOG_DIR);
  const references = [];
  const parseErrors = [];
  for (const logPath of walkFiles(logDir).filter((file) => file.endsWith('.ndjson'))) {
    const questId = path.basename(logPath, '.ndjson');
    fs.readFileSync(logPath, 'utf8').split('\n').forEach((line, index) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        const eventReferences = [];
        collectChangeRefs(event, '', eventReferences);
        for (const reference of eventReferences) {
          references.push({
            questId,
            logPath: relativePath(root, logPath),
            line: index + 1,
            ...reference,
          });
        }
      } catch (error) {
        parseErrors.push({
          logPath: relativePath(root, logPath),
          line: index + 1,
          error: error.message,
        });
      }
    });
  }
  return {references, parseErrors};
}

function insideDirectory(filePath, directory) {
  const relative = path.relative(directory, filePath);
  return relative.length > 0 && !relative.startsWith('..') &&
    !path.isAbsolute(relative);
}

function resolveReference(root, reference, artifactByPath) {
  const prefix = PROOF_ARTIFACT_CENSUS.CHANGE_REF_PREFIX;
  const referenceSha256 = hash(Buffer.from(reference.changeRef));
  if (!reference.changeRef.startsWith(prefix)) {
    return {
      ...reference,
      referenceSha256,
      classified: true,
      resolved: false,
      readabilityStatus: 'historical-unsupported-reference',
      reason: 'unsupported-change-ref',
    };
  }
  const rawPath = reference.changeRef.slice(prefix.length);
  const requestedPath = path.resolve(root, rawPath);
  const changesDir = path.resolve(root, PROOF_ARTIFACT_CENSUS.CHANGES_DIR);
  if (!insideDirectory(requestedPath, changesDir)) {
    return {
      ...reference,
      referenceSha256,
      classified: true,
      resolved: false,
      readabilityStatus: 'historical-invalid-source-reference',
      reason: 'outside-changes-directory',
    };
  }
  const candidates = [requestedPath, `${requestedPath}.gz`];
  const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolvedPath) {
    return {
      ...reference,
      referenceSha256,
      classified: false,
      resolved: false,
      readabilityStatus: 'payload-missing',
      reason: 'payload-missing',
    };
  }
  const normalized = relativePath(root, resolvedPath);
  const artifact = artifactByPath.get(normalized);
  if (!artifact) {
    return {
      ...reference,
      referenceSha256,
      classified: false,
      resolved: false,
      readabilityStatus: 'payload-unclassified',
      reason: 'payload-unclassified',
    };
  }
  return {
    ...reference,
    referenceSha256,
    classified: true,
    resolved: artifact.readable,
    readabilityStatus: artifact.readable ? 'readable' : 'payload-unreadable',
    reason: artifact.readable ? null : 'payload-unreadable',
    resolvedPath: normalized,
    historicalFallback: resolvedPath !== requestedPath,
    encoding: artifact.encoding,
    payloadSha256: artifact.payloadSha256,
    payloadBytes: artifact.payloadBytes,
  };
}

function duplicateGroups(artifacts) {
  const byHash = new Map();
  for (const artifact of artifacts.filter((item) => item.readable)) {
    const group = byHash.get(artifact.payloadSha256) || [];
    group.push(artifact);
    byHash.set(artifact.payloadSha256, group);
  }
  return [...byHash.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([payloadSha256, group]) => ({
      payloadSha256,
      payloadBytes: group[0].payloadBytes,
      copies: group.length,
      duplicatePayloadBytes: group[0].payloadBytes * (group.length - 1),
      paths: group.map((item) => item.path).sort(),
    }))
    .sort((left, right) =>
      right.duplicatePayloadBytes - left.duplicatePayloadBytes ||
      left.payloadSha256.localeCompare(right.payloadSha256));
}

function selectMigrationPolicy(groups, artifacts) {
  const thresholdBytes = PROOF_ARTIFACT_CENSUS.MIGRATION_THRESHOLD_CANDIDATES
    .find((candidate) => groups.some((group) => group.payloadBytes >= candidate));
  if (!thresholdBytes) {
    return {
      inlineThresholdBytes: null,
      contentCompression: PROOF_ARTIFACT_CENSUS.COMPRESSION_NONE,
      eligibleDuplicateGroups: 0,
      eligibleDuplicatePayloadBytes: 0,
    };
  }
  const eligibleArtifacts = artifacts.filter((artifact) =>
    artifact.readable && artifact.payloadBytes >= thresholdBytes);
  const rawBytes = eligibleArtifacts.reduce((sum, item) => sum + item.payloadBytes, 0);
  const gzipBytes = eligibleArtifacts.reduce((sum, item) => sum + item.gzipBytes, 0);
  const savingsRatio = rawBytes === 0 ? 0 : (rawBytes - gzipBytes) / rawBytes;
  const eligibleGroups = groups.filter((group) =>
    group.payloadBytes >= thresholdBytes);
  return {
    inlineThresholdBytes: thresholdBytes,
    contentCompression: savingsRatio >=
      PROOF_ARTIFACT_CENSUS.MINIMUM_COMPRESSION_SAVINGS_RATIO ?
      PROOF_ARTIFACT_CENSUS.COMPRESSION_GZIP :
      PROOF_ARTIFACT_CENSUS.COMPRESSION_NONE,
    compressionSavingsRatio: savingsRatio,
    eligibleDuplicateGroups: eligibleGroups.length,
    eligibleDuplicatePayloadBytes: eligibleGroups.reduce(
      (sum, group) => sum + group.duplicatePayloadBytes, 0),
  };
}

function summarize(artifacts, groups, references, parseErrors) {
  const readable = artifacts.filter((artifact) => artifact.readable);
  const referencedPaths = new Set(references
    .filter((reference) => reference.resolved)
    .map((reference) => reference.resolvedPath));
  const storageBytes = artifacts.reduce((sum, item) => sum + item.storageBytes, 0);
  const filesystemBytes = artifacts.reduce((sum, item) =>
    sum + fs.statSync(item.absolutePath).size, 0);
  const uniquePayloadBytes = [...new Map(readable.map((item) =>
    [item.payloadSha256, item.payloadBytes])).values()]
    .reduce((sum, size) => sum + size, 0);
  const duplicatePayloadBytes = groups.reduce((sum, group) =>
    sum + group.duplicatePayloadBytes, 0);
  return {
    artifactCount: artifacts.length,
    readableArtifactCount: readable.length,
    referencedArtifactCount: referencedPaths.size,
    unreferencedArtifactCount: artifacts.length - referencedPaths.size,
    referenceOccurrences: references.length,
    classifiedReferenceOccurrences: references.filter(
      (item) => item.classified).length,
    resolvedReferenceOccurrences: references.filter((item) => item.resolved).length,
    unresolvedReferenceOccurrences: references.filter(
      (item) => !item.classified).length,
    historicalInvalidReferenceOccurrences: references.filter((item) =>
      item.classified && !item.resolved).length,
    historicalFallbackOccurrences: references.filter(
      (item) => item.historicalFallback).length,
    logParseErrors: parseErrors.length,
    storageBytes,
    filesystemBytes,
    bytesReconciled: artifacts.length > 0 && storageBytes === filesystemBytes,
    uniquePayloadBytes,
    duplicatePayloadBytes,
    duplicateRatio: uniquePayloadBytes + duplicatePayloadBytes === 0 ? 0 :
      duplicatePayloadBytes / (uniquePayloadBytes + duplicatePayloadBytes),
  };
}

export function buildProofArtifactCensus(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  const artifacts = inventoryArtifacts(absoluteRoot).map((artifact) => ({
    ...artifact,
    absolutePath: path.resolve(absoluteRoot, artifact.path),
  }));
  const artifactByPath = new Map(artifacts.map((artifact) =>
    [artifact.path, artifact]));
  const {references: rawReferences, parseErrors} = readReferences(absoluteRoot);
  const references = rawReferences.map((reference) =>
    resolveReference(absoluteRoot, reference, artifactByPath));
  const groups = duplicateGroups(artifacts);
  const summary = summarize(artifacts, groups, references, parseErrors);
  const migrationPolicy = selectMigrationPolicy(groups, artifacts);
  return {
    schemaVersion: 1,
    root: '.',
    summary,
    migrationPolicy,
    duplicateGroups: groups,
    references,
    unresolvedReferences: references.filter((item) => !item.classified),
    historicalFallbacks: references.filter((item) => item.historicalFallback),
    parseErrors,
    artifacts: artifacts.map((item) => {
      const {absolutePath: _absolutePath, ...artifact} = item;
      return {
        ...artifact,
        referenced: references.some((reference) =>
          reference.resolvedPath === artifact.path),
      };
    }),
  };
}
