import {createHash} from 'node:crypto';

import {
  EVENT_ATTEMPT,
  EVENT_VIOLATION,
  INTEGRITY_RESOLUTION_FRESH_SAMPLE,
  INTEGRITY_RESOLUTION_NEW_QUEST,
  INTEGRITY_SCOPE_ATTEMPT,
  INTEGRITY_SCOPE_GOALPOSTS,
} from './constants.js';
import {
  changeArtifactIdentity,
  changeArtifactIdentityIsSealed,
  changeArtifactIdentityMatches,
} from './change-artifact.js';

export const INTEGRITY_EVENT_SCHEMA_VERSION = 2;

export {
  INTEGRITY_RESOLUTION_FRESH_SAMPLE,
  INTEGRITY_RESOLUTION_NEW_QUEST,
  INTEGRITY_SCOPE_ATTEMPT,
  INTEGRITY_SCOPE_GOALPOSTS,
};

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const VIOLATION_ID_DIGEST_LENGTH = 20;
const UNVERSIONED_GENERATION = 'unversioned';
const QUEST_LEVEL_FRONTIER = 'quest';
const VIOLATION_ID_SEPARATOR = ':';
const REASON_MISSING_VIOLATION_ID = 'missing violationId';
const REASON_MISSING_SCOPE = 'missing scope';
const REASON_INVALID_RESOLUTION_POLICY = 'invalid resolutionPolicy';
const REASON_MISSING_VIOLATIONS = 'missing violations';
const REASON_MISSING_REPLACEMENT_FRONTIER = 'missing replacement frontier';
const REASON_MISSING_REPLACEMENT_PROBE = 'missing replacement probe identity';
const REASON_MISSING_FAILED_EVIDENCE = 'missing failed evidence identity';
const MISSING_ACCEPTED_CHANGE_IDENTITY =
  'accepted changeRef is missing a sealed content identity';
const LEGACY_INTEGRITY_UNVERIFIABLE =
  'legacy_integrity_unverifiable: a pre-v2 violation was followed ' +
  'by an accepted attempt; provide replacement evidence in a new migration Quest';
const NO_MALFORMED_REASONS = Object.freeze([]);

const INTEGRITY_RESOLUTION_POLICIES = Object.freeze([
  INTEGRITY_RESOLUTION_FRESH_SAMPLE,
  INTEGRITY_RESOLUTION_NEW_QUEST,
]);

function digest(value) {
  return createHash(HASH_ALGORITHM)
    .update(JSON.stringify(value))
    .digest(HASH_ENCODING)
    .slice(0, VIOLATION_ID_DIGEST_LENGTH);
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
    generation || quest.links?.draftedAtCommit ||
      quest.links?.sealedAtCommit || UNVERSIONED_GENERATION,
    scope,
    frontier || QUEST_LEVEL_FRONTIER,
    digest({
      violations,
      probeKey: attempt?.probeKey || null,
      evidenceFingerprint: attempt?.evidenceFingerprint || null,
    }),
  ].join(VIOLATION_ID_SEPARATOR);
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

// Choose the resolution policy a violation can actually satisfy, instead of
// hardcoding fresh-accepted-sample at the emit site. A fresh sample REPLACES a named
// failed measurement, so it needs a frontier, a replacement probe identity, and a
// failed evidence fingerprint. An attempt that produced no evidence at all cannot
// supply one — stamping fresh-accepted-sample on it emits a violation that
// malformedIntegrityViolationReasons immediately rejects and that
// unresolvedIntegrityViolations can never clear, silently making the Quest unlandable
// from that instant. new-quest-only is the honest policy for that case: it is
// well-formed without replacement identity and already means "reseal in a successor".
export function integrityResolutionPolicyFor(violation) {
  const hasReplacementIdentity =
    typeof violation?.frontier === 'string' && violation.frontier.length > 0 &&
    typeof violation?.replacementProbeKey === 'string' &&
    violation.replacementProbeKey.length > 0 &&
    typeof violation?.failedEvidenceFingerprint === 'string' &&
    violation.failedEvidenceFingerprint.length > 0;
  return hasReplacementIdentity ?
    INTEGRITY_RESOLUTION_FRESH_SAMPLE :
    INTEGRITY_RESOLUTION_NEW_QUEST;
}

export function malformedIntegrityViolationReasons(event) {
  if (event?.type !== EVENT_VIOLATION ||
    event.eventSchemaVersion !== INTEGRITY_EVENT_SCHEMA_VERSION) {
    return NO_MALFORMED_REASONS;
  }
  const reasons = Array.from(NO_MALFORMED_REASONS);
  if (typeof event.violationId !== 'string' || event.violationId.length === 0) {
    reasons.push(REASON_MISSING_VIOLATION_ID);
  }
  if (typeof event.scope !== 'string' || event.scope.length === 0) {
    reasons.push(REASON_MISSING_SCOPE);
  }
  if (!INTEGRITY_RESOLUTION_POLICIES.includes(event.resolutionPolicy)) {
    reasons.push(REASON_INVALID_RESOLUTION_POLICY);
  }
  if (!Array.isArray(event.violations) || event.violations.length === 0) {
    reasons.push(REASON_MISSING_VIOLATIONS);
  }
  if (event.resolutionPolicy === INTEGRITY_RESOLUTION_FRESH_SAMPLE) {
    if (typeof event.frontier !== 'string' || event.frontier.length === 0) {
      reasons.push(REASON_MISSING_REPLACEMENT_FRONTIER);
    }
    if (typeof event.replacementProbeKey !== 'string' ||
      event.replacementProbeKey.length === 0) {
      reasons.push(REASON_MISSING_REPLACEMENT_PROBE);
    }
    if (typeof event.failedEvidenceFingerprint !== 'string' ||
      event.failedEvidenceFingerprint.length === 0) {
      reasons.push(REASON_MISSING_FAILED_EVIDENCE);
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
        message: MISSING_ACCEPTED_CHANGE_IDENTITY,
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
      message: LEGACY_INTEGRITY_UNVERIFIABLE,
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
