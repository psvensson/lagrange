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
const EVIDENCE_IDENTITY_SCHEMA_VERSION = 2;
export const EVIDENCE_CLASS = Object.freeze({
  DETERMINISTIC: 'deterministic',
  LIVE: 'live',
  EXTERNAL: 'external',
});

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

function classifyEvidence(value) {
  if (value === EVIDENCE_CLASS.DETERMINISTIC ||
      value === EVIDENCE_CLASS.EXTERNAL ||
      value === EVIDENCE_CLASS.LIVE) return value;
  return EVIDENCE_CLASS.LIVE;
}

function legacyFingerprint(identity) {
  return sha256(stableStringify({
    path: identity.path,
    resolvedPath: identity.resolvedPath,
    exists: identity.exists,
    size: identity.size,
    mtimeMs: identity.mtimeMs,
    sha256: identity.sha256,
  }));
}

function semanticProbeKey(metadata) {
  return stableProbeKey({
    probe: metadata.probe || null,
    args: metadata.identityArgs || metadata.args || null,
  });
}

function semanticFingerprint(identity) {
  const descriptor = {
    schemaVersion: EVIDENCE_IDENTITY_SCHEMA_VERSION,
    evidenceClass: identity.evidenceClass,
    probeKey: identity.semanticProbeKey,
    exists: identity.exists,
    semanticSha256: identity.semanticSha256,
  };
  if (!identity.exists) descriptor.path = identity.path;
  return sha256(stableStringify(descriptor));
}

export function buildEvidenceIdentity(root, evidencePath, metadata = {}) {
  const resolvedPath = resolveEvidencePath(root, evidencePath);
  const observedAt = new Date().toISOString();
  const classification = classifyEvidence(metadata.evidenceClass);
  const shared = {
    schemaVersion: EVIDENCE_IDENTITY_SCHEMA_VERSION,
    evidenceClass: classification,
    probe: metadata.probe || null,
    args: metadata.args || null,
    semanticProbeKey: semanticProbeKey(metadata),
    observedAt,
  };
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    const missingIdentity = {
      ...shared,
      path: evidencePath || null,
      resolvedPath,
      exists: false,
      size: null,
      mtimeMs: null,
      sha256: null,
      semanticSha256: null,
    };
    const legacy = legacyFingerprint(missingIdentity);
    return {
      ...missingIdentity,
      legacyFingerprint: legacy,
      fingerprint: classification === EVIDENCE_CLASS.DETERMINISTIC ?
        semanticFingerprint(missingIdentity) : legacy,
    };
  }

  const stat = fs.statSync(resolvedPath);
  const content = fs.readFileSync(resolvedPath);
  const rawSha256 = sha256(content);
  const semanticSha256 = classification === EVIDENCE_CLASS.DETERMINISTIC &&
    metadata.semanticContent !== undefined ?
    sha256(metadata.semanticContent) : rawSha256;
  const identity = {
    ...shared,
    path: displayPath(root, resolvedPath, evidencePath),
    resolvedPath,
    exists: true,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: rawSha256,
    semanticSha256,
  };
  const legacy = legacyFingerprint(identity);
  return {
    ...identity,
    legacyFingerprint: legacy,
    fingerprint: classification === EVIDENCE_CLASS.DETERMINISTIC ?
      semanticFingerprint(identity) : legacy,
  };
}

export function attachEvidenceIdentity(root, probeSpec, result) {
  const evidencePath = result?.evidence || null;
  const identity = evidencePath ?
    buildEvidenceIdentity(root, evidencePath, {
      probe: probeSpec?.probe || null,
      args: probeSpec?.args || null,
      evidenceClass: result?.evidenceClass,
      identityArgs: result?.evidenceIdentityArgs,
      semanticContent: result?.evidenceSemanticContent,
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

function legacyEventMatchesDeterministic(identity, event) {
  const recorded = event?.evidenceIdentity;
  return identity.evidenceClass === EVIDENCE_CLASS.DETERMINISTIC &&
    recorded && recorded.schemaVersion === undefined &&
    recorded.exists === identity.exists &&
    recorded.sha256 === identity.sha256 &&
    (identity.exists || recorded.path === identity.path);
}

function deterministicProbeIdentityMatches(identity, event) {
  const recorded = event?.evidenceIdentity;
  if (identity.schemaVersion !== EVIDENCE_IDENTITY_SCHEMA_VERSION ||
      identity.evidenceClass !== EVIDENCE_CLASS.DETERMINISTIC ||
      recorded?.schemaVersion !== EVIDENCE_IDENTITY_SCHEMA_VERSION ||
      recorded?.evidenceClass !== EVIDENCE_CLASS.DETERMINISTIC) {
    return null;
  }
  if (!identity.semanticProbeKey || !recorded.semanticProbeKey) return false;
  return identity.semanticProbeKey === recorded.semanticProbeKey;
}

export function evidenceIdentityMatchesEvent(identity, event, options = {}) {
  if (!identity || !event) return false;
  const eventFingerprint = eventEvidenceFingerprint(event);
  const fingerprintMatches = Boolean(eventFingerprint) &&
    (eventFingerprint === identity.fingerprint ||
      eventFingerprint === identity.legacyFingerprint ||
      legacyEventMatchesDeterministic(identity, event));
  if (!fingerprintMatches) return false;
  if (!options.requireProbeSpec) return true;
  const deterministicMatch = deterministicProbeIdentityMatches(identity, event);
  if (deterministicMatch !== null) return deterministicMatch;
  const identityKey = stableProbeKey(probeSpecFromIdentity(identity));
  const recordedKey = eventProbeKey(event);
  if (!identityKey || !recordedKey) return options.allowLegacy !== false;
  return identityKey === recordedKey;
}
