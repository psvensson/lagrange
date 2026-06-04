import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  eventProbeKey,
  probeSpecFromIdentity,
  stableProbeKey,
  stableStringify,
} from './probe-spec.js';

const HASH_ALGORITHM = 'sha256';

function sha256(value) {
  return crypto.createHash(HASH_ALGORITHM).update(value).digest('hex');
}

function resolveEvidencePath(root, evidencePath) {
  if (!evidencePath) return null;
  return path.isAbsolute(evidencePath) ?
    path.normalize(evidencePath) :
    path.resolve(root, evidencePath);
}

function displayPath(root, resolvedPath, originalPath) {
  if (!resolvedPath) return originalPath || null;
  const relativePath = path.relative(root, resolvedPath);
  if (relativePath && !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return originalPath || resolvedPath;
}

export function buildEvidenceIdentity(root, evidencePath, metadata = {}) {
  const resolvedPath = resolveEvidencePath(root, evidencePath);
  const observedAt = new Date().toISOString();
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    const missingIdentity = {
      path: evidencePath || null,
      resolvedPath,
      exists: false,
      size: null,
      mtimeMs: null,
      sha256: null,
      probe: metadata.probe || null,
      args: metadata.args || null,
      observedAt,
    };
    return {
      ...missingIdentity,
      fingerprint: sha256(stableStringify({
        path: missingIdentity.path,
        resolvedPath: missingIdentity.resolvedPath,
        exists: missingIdentity.exists,
        size: missingIdentity.size,
        mtimeMs: missingIdentity.mtimeMs,
        sha256: missingIdentity.sha256,
      })),
    };
  }

  const stat = fs.statSync(resolvedPath);
  const content = fs.readFileSync(resolvedPath);
  const identity = {
    path: displayPath(root, resolvedPath, evidencePath),
    resolvedPath,
    exists: true,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256(content),
    probe: metadata.probe || null,
    args: metadata.args || null,
    observedAt,
  };
  return {
    ...identity,
    fingerprint: sha256(stableStringify({
      path: identity.path,
      resolvedPath: identity.resolvedPath,
      exists: identity.exists,
      size: identity.size,
      mtimeMs: identity.mtimeMs,
      sha256: identity.sha256,
    })),
  };
}

export function attachEvidenceIdentity(root, probeSpec, result) {
  const evidencePath = result?.evidence || null;
  const identity = evidencePath ?
    buildEvidenceIdentity(root, evidencePath, {
      probe: probeSpec?.probe || null,
      args: probeSpec?.args || null,
    }) :
    null;
  if (!identity) return result;
  return {
    ...result,
    evidenceIdentity: identity,
    evidenceFingerprint: identity.fingerprint,
  };
}

export function eventEvidenceFingerprint(event) {
  return event?.evidenceFingerprint ||
    event?.evidenceIdentity?.fingerprint ||
    null;
}

export function evidenceIdentityMatchesEvent(identity, event, options = {}) {
  if (!identity || !event) return false;
  const eventFingerprint = eventEvidenceFingerprint(event);
  if (!eventFingerprint || eventFingerprint !== identity.fingerprint) return false;
  if (!options.requireProbeSpec) return true;
  const identityKey = stableProbeKey(probeSpecFromIdentity(identity));
  const recordedKey = eventProbeKey(event);
  if (!identityKey || !recordedKey) return options.allowLegacy !== false;
  return identityKey === recordedKey;
}
