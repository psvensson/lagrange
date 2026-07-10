import {createHash} from 'node:crypto';

import {
  EVENT_ATTEMPT,
  EVENT_VIOLATION,
} from './constants.js';
import {
  changeArtifactIdentity,
  changeArtifactIdentityIsSealed,
  changeArtifactIdentityMatches,
} from './change-artifact.js';

export const INTEGRITY_EVENT_SCHEMA_VERSION = 2;
export const INTEGRITY_SCOPE_ATTEMPT = 'attempt-integrity';
export const INTEGRITY_SCOPE_GOALPOSTS = 'goalposts';
export const INTEGRITY_RESOLUTION_FRESH_SAMPLE = 'fresh-accepted-sample';
export const INTEGRITY_RESOLUTION_NEW_QUEST = 'new-quest-only';

const INTEGRITY_RESOLUTION_POLICIES = Object.freeze([
  INTEGRITY_RESOLUTION_FRESH_SAMPLE,
  INTEGRITY_RESOLUTION_NEW_QUEST,
]);

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 20);
}

export function integrityViolationId({
  quest,
  generation,
  frontier = null,
  scope,
  violations,
  attempt = null,
}) {
  return [
    quest.id,
    generation || quest.links?.sealedAtCommit || 'unversioned',
    scope,
    frontier || 'quest',
    digest({
      violations,
      probeKey: attempt?.probeKey || null,
      evidenceFingerprint: attempt?.evidenceFingerprint || null,
    }),
  ].join(':');
}

export function acceptedReplacementViolationIds(log, attempt) {
  if (!attempt || !attempt.frontier || !attempt.probeKey ||
    !attempt.evidenceFingerprint) {
    return [];
  }
  const alreadyResolved = new Set(
    log.flatMap((event) =>
      event.type === EVENT_ATTEMPT && Array.isArray(event.replacesViolationIds) ?
        event.replacesViolationIds : []),
  );
  return log
    .filter((event) =>
      event.type === EVENT_VIOLATION &&
      event.eventSchemaVersion === INTEGRITY_EVENT_SCHEMA_VERSION &&
      event.resolutionPolicy === INTEGRITY_RESOLUTION_FRESH_SAMPLE &&
      event.frontier === attempt.frontier &&
      event.replacementProbeKey === attempt.probeKey &&
      event.failedEvidenceFingerprint !== attempt.evidenceFingerprint &&
      event.violationId &&
      !alreadyResolved.has(event.violationId))
    .map((event) => event.violationId);
}

export function unresolvedIntegrityViolations(log) {
  const resolved = new Set(
    log.flatMap((event) =>
      event.type === EVENT_ATTEMPT &&
      event.integrityAccepted === true &&
      Array.isArray(event.replacesViolationIds) ?
        event.replacesViolationIds : []),
  );
  return log.filter((event) =>
    event.type === EVENT_VIOLATION &&
    event.eventSchemaVersion === INTEGRITY_EVENT_SCHEMA_VERSION &&
    (malformedIntegrityViolationReasons(event).length > 0 ||
      !resolved.has(event.violationId)));
}

export function malformedIntegrityViolationReasons(event) {
  if (event?.type !== EVENT_VIOLATION ||
    event.eventSchemaVersion !== INTEGRITY_EVENT_SCHEMA_VERSION) {
    return [];
  }
  const reasons = [];
  if (typeof event.violationId !== 'string' || event.violationId.length === 0) {
    reasons.push('missing violationId');
  }
  if (typeof event.scope !== 'string' || event.scope.length === 0) {
    reasons.push('missing scope');
  }
  if (!INTEGRITY_RESOLUTION_POLICIES.includes(event.resolutionPolicy)) {
    reasons.push('invalid resolutionPolicy');
  }
  if (!Array.isArray(event.violations) || event.violations.length === 0) {
    reasons.push('missing violations');
  }
  if (event.resolutionPolicy === INTEGRITY_RESOLUTION_FRESH_SAMPLE) {
    if (typeof event.frontier !== 'string' || event.frontier.length === 0) {
      reasons.push('missing replacement frontier');
    }
    if (typeof event.replacementProbeKey !== 'string' ||
      event.replacementProbeKey.length === 0) {
      reasons.push('missing replacement probe identity');
    }
    if (typeof event.failedEvidenceFingerprint !== 'string' ||
      event.failedEvidenceFingerprint.length === 0) {
      reasons.push('missing failed evidence identity');
    }
  }
  return reasons;
}

export function legacyIntegrityViolations(log, startIndex = 0) {
  const legacy = [];
  for (let index = startIndex; index < log.length; index += 1) {
    const event = log[index];
    if (event.type !== EVENT_VIOLATION ||
      event.eventSchemaVersion === INTEGRITY_EVENT_SCHEMA_VERSION) {
      continue;
    }
    const acceptedLater = log.slice(index + 1).some((candidate) =>
      candidate.type === EVENT_ATTEMPT &&
      (!event.frontier || candidate.frontier === event.frontier));
    if (acceptedLater) legacy.push(event);
  }
  return legacy;
}

export function acceptedChangeArtifactViolations(root, quest, log) {
  const violations = [];
  for (const event of log) {
    if (event.type !== EVENT_ATTEMPT || event.integrityAccepted !== true ||
      event.eventSchemaVersion !== INTEGRITY_EVENT_SCHEMA_VERSION) {
      continue;
    }
    if (!changeArtifactIdentityIsSealed(event.changeRefIdentity)) {
      violations.push({
        event,
        message: 'accepted changeRef is missing a sealed content identity',
      });
      continue;
    }
    const currentIdentity = changeArtifactIdentity(
      root,
      quest.id,
      event.changeRef,
    );
    if (!changeArtifactIdentityMatches(event.changeRefIdentity, currentIdentity)) {
      violations.push({
        event,
        message: `accepted changeRef artifact identity changed: ${event.changeRef}`,
      });
    }
  }
  return violations;
}

export function terminalIntegrityProblems(root, quest, log) {
  const problems = unresolvedIntegrityViolations(log).map((event) => {
    const malformed = malformedIntegrityViolationReasons(event);
    const suffix = malformed.length > 0 ?
      ` (malformed v2: ${malformed.join(', ')})` : '';
    return {
      event,
      message: 'unresolved integrity violation: ' +
        `${event.violationId || '(missing violationId)'}${suffix}`,
    };
  });
  for (const event of legacyIntegrityViolations(log)) {
    problems.push({
      event,
      message: 'legacy_integrity_unverifiable: a pre-v2 violation was followed ' +
        'by an accepted attempt; provide replacement evidence in a new migration Quest',
    });
  }
  problems.push(...acceptedChangeArtifactViolations(root, quest, log));
  return problems;
}

export function terminalIntegrityAllowsClosure(root, quest, log) {
  return terminalIntegrityProblems(root, quest, log).length === 0;
}

export function terminalSampleIsAccepted(sample) {
  return sample?.done === true &&
    sample.invalidSample !== true &&
    typeof sample.metric === 'number' &&
    Number.isFinite(sample.metric) &&
    sample.evidenceIdentity?.exists === true &&
    typeof sample.evidenceIdentity.sha256 === 'string' &&
    sample.evidenceIdentity.sha256.length > 0 &&
    typeof sample.evidenceIdentity.fingerprint === 'string' &&
    sample.evidenceIdentity.fingerprint.length > 0 &&
    sample.evidenceFingerprint === sample.evidenceIdentity.fingerprint;
}
