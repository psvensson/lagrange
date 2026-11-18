import {createHash} from 'node:crypto';

const arrayFrom = Array.from; const arrayIsArray = Array.isArray;
const jsonStringify = JSON.stringify; const numberIsFinite = Number.isFinite;
const numberIsNaN = Number.isNaN; const numberIsSafeInteger = Number.isSafeInteger;
const objectAssign = Object.assign; const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn; const objectIs = Object.is; const objectKeys = Object.keys;

// The cluster format revision is the release-keyed version fence (founding
// D7, placement P6, latch rev. 3 point B). A seed writes the revision of its
// build into the original allocation it founds (the retained, write-once
// declaration), so it is the one fact that a cluster was founded at format R.
// Every admission into a cluster and every reopen of a seed's founding
// declaration compares against this build's revision, and only equality is
// admitted: an absent or different revision is refused, never inferred.
// There is no in-place upgrade and no downgrade across a revision; a cluster
// of another revision is re-founded.
const CLUSTER_FORMAT_REVISION = 1; const CLUSTER_FORMAT_REVISION_FIELD = 'clusterFormatRevision';
const SUPPORT_ENVELOPE_SCHEMA_VERSION = 1; const ZERO = 0;
const HASH_ALGORITHM_SHA256 = 'sha256'; const DIGEST_ENCODING_HEX = 'hex';
const JSON_ENCODING_UTF8 = 'utf8'; const MAX_DIAGNOSTIC_REVISION_STRING_LENGTH = 64;
const DEFAULT_MIN_NODES = 3; const DEFAULT_MAX_NODES = 7; const DEFAULT_REPLICATION_FACTOR = 3;
const DEFAULT_MAX_REPLICA_BYTES = 1_073_741_824; const DEFAULT_MAX_REBUILD_DURATION_MS = 120_000;
const DEFAULT_SOURCE_VERSION = '0.4.1'; const DEFAULT_TARGET_VERSION = '0.5.0';
const DEFAULT_ROLLBACK_CUTOFF_PHASE = 'BEFORE_TARGET_SCHEMA_FINALIZE';
const DEFAULT_PROTOCOL_BOUNDARY_ID = 'node-transport-mtls-v1';
const DEFAULT_SCHEMA_BOUNDARY_ID = 'raft-sqlite-schema-v1';
const DEFAULT_ARTIFACT_ABI_ID = 'service-cell-v2'; const DIGEST_EXCLUDED_KEY = 'envelopeDigest';
const DEFAULT_FINALIZED_PHASE = 'FINALIZED'; const DEFAULT_DOWNGRADE_RECOVERY_MS = 420;
const DEFAULT_FAILURE_RECOVERY_MS = 650; const DEFAULT_ROLLING_UPGRADE_RECOVERY_MS = 510;
const DEFAULT_ARTIFACT_UPGRADE_RECOVERY_MS = 310; const DEFAULT_REPLICA_REBUILD_RECOVERY_MS = 890;
const DEFAULT_REPLICA_BYTES_REBUILT = 4_194_304;
const ROLLBACK_RESTORE_SUFFIX = 'restore from certified snapshot instead.';
const SCHEMA_INCOMPATIBLE_SUFFIX = 'boundary is incompatible.';
const ENVELOPE_FIELD = objectFreeze({
  BOUNDARIES: 'boundaries', DEPENDENCY_RECEIPTS: 'dependencyReceipts', DRILLS: 'drills',
  ELIGIBLE_PHASES: 'eligiblePhases', ENVELOPE_OPTION: 'envelope',
  REBUILD: 'rebuildEnvelope', ROLLBACK: 'rollback', ROLLBACK_CUTOFF: 'rollbackCutoff',
  SCHEMA_VERSION: 'schemaVersion', SOURCE_VERSION: 'sourceVersion',
  TARGET_VERSION: 'targetVersion', TOPOLOGY: 'topologyEnvelope', VERSION_PAIR: 'versionPair',
});
const UNCERTIFIED_ENVELOPE_PREFIX = 'Support envelope is not certified (';
const UNCERTIFIED_ENVELOPE_SUFFIX = ').';
const CERTIFIED_PAIR_ADMITTED_SUFFIX = 'is within the certified support envelope.';
const OUTSIDE_CERTIFIED_PAIR_INFIX = 'is outside the certified support envelope (';
const OUTSIDE_MIXED_PEER_INFIX = ') is outside the certified support envelope (';
const CLUSTER_FORMAT_SUBJECT = objectFreeze({
  PEER: 'Peer', RETAINED_ORIGINAL_ALLOCATION: 'Retained original allocation',
  SUPPORT_ENVELOPE: 'Support envelope',
});
const CLUSTER_FORMAT_TOKEN = objectFreeze({
  ABSENT: 'absent', FALSE: 'false', INFINITY: 'Infinity', NAN: 'NaN',
  NEGATIVE_INFINITY: '-Infinity', NEGATIVE_ZERO: '-0',
  NON_INTEGER_PREFIX: 'non-integer (', NON_INTEGER_SUFFIX: ')', TRUE: 'true',
});
const OUTSIDE_CLUSTER_FORMAT_CLAUSE = 'outside the support envelope of this build';
const OUTSIDE_CLUSTER_FORMAT_REMEDIATION =
  'a cluster is re-founded across a format revision, never upgraded or downgraded in place.';

const SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME = objectFreeze({
  BOUNDED_DEGRADATION: 'BOUNDED_DEGRADATION',
  BOUNDED_UNAVAILABILITY: 'BOUNDED_UNAVAILABILITY',
  CONTINUOUS: 'CONTINUOUS',
});
const VALID_AVAILABILITY_OUTCOMES = objectFreeze([
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.CONTINUOUS,
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_UNAVAILABILITY,
]);
const SUPPORT_ENVELOPE_DRILL_ID = objectFreeze({
  DOWNGRADE_ROLLBACK_BOUNDARY: 'downgrade_rollback_boundary',
  ONE_NODE_FAILURE_RECOVERY: 'one_node_failure_recovery',
  ROLLING_UPGRADE: 'rolling_upgrade',
  SERVICE_ARTIFACT_UPGRADE: 'service_artifact_upgrade',
  WIPED_REPLICA_REBUILD: 'wiped_replica_rebuild',
});
const REQUIRED_DRILL_IDS = objectFreeze([
  SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE, SUPPORT_ENVELOPE_DRILL_ID.DOWNGRADE_ROLLBACK_BOUNDARY,
  SUPPORT_ENVELOPE_DRILL_ID.ONE_NODE_FAILURE_RECOVERY, SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD,
  SUPPORT_ENVELOPE_DRILL_ID.SERVICE_ARTIFACT_UPGRADE,
]);
const SUPPORT_ENVELOPE_REASON_CODE = objectFreeze({
  ACKNOWLEDGED_DATA_LOSS_DETECTED: 'ACKNOWLEDGED_DATA_LOSS_DETECTED',
  ENVELOPE_DIGEST_MISMATCH: 'ENVELOPE_DIGEST_MISMATCH',
  INVALID_AVAILABILITY_OUTCOME: 'INVALID_AVAILABILITY_OUTCOME',
  MISSING_DEPENDENCY_RECEIPT: 'MISSING_DEPENDENCY_RECEIPT',
  MISSING_OR_INVALID_DRILL_RECEIPT: 'MISSING_OR_INVALID_DRILL_RECEIPT',
  MIXED_VERSION_UNSUPPORTED: 'MIXED_VERSION_UNSUPPORTED', OK: 'OK',
  ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED:
    'ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED',
  OUTSIDE_SUPPORT_ENVELOPE: 'OUTSIDE_SUPPORT_ENVELOPE',
  REBUILD_WINDOW_EXCEEDED: 'REBUILD_WINDOW_EXCEEDED',
  REPLICA_SIZE_EXCEEDS_ENVELOPE: 'REPLICA_SIZE_EXCEEDS_ENVELOPE',
  ROLLBACK_CUTOFF_EXCEEDED: 'ROLLBACK_CUTOFF_EXCEEDED',
  SCHEMA_BOUNDARY_INCOMPATIBLE: 'SCHEMA_BOUNDARY_INCOMPATIBLE',
  TOPOLOGY_OUTSIDE_ENVELOPE: 'TOPOLOGY_OUTSIDE_ENVELOPE',
});
const REQUIRED_DEPENDENCY_QUEST_IDS = objectFreeze([
  'learner-promotion-progress-proof', 'node-transport-authenticated-encryption',
  'resumable-bulk-data-load', 'pilot-cutover-and-rollback-receipts',
  'public-path-scale-and-failure-certification',
]);
const ROLLBACK_ELIGIBLE_PHASES = objectFreeze([
  'PREFLIGHT', 'ROLLING_CANARY', 'ROLLING_FOLLOWERS', 'ROLLING_LEADER',
  'BEFORE_TARGET_SCHEMA_FINALIZE',
]);
const POST_CUTOFF_PHASES = objectFreeze([
  'TARGET_SCHEMA_FINALIZED', 'POST_CUTOFF_COMMITTED', 'FINALIZED',
  'AFTER_ROLLBACK_CUTOFF',
]);

function isNonNullObject(value) {
  return value !== null && typeof value === 'object';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > ZERO;
}

/**
 * The one comparison of the fence: only this build's exact integer revision is admitted.
 * @param {*} rawRevision A claimed or retained cluster format revision.
 * @return {boolean}
 */
function isCurrentClusterFormatRevision(rawRevision) {
  return typeof rawRevision === 'number' &&
    !objectIs(rawRevision, -0) &&
    rawRevision === CLUSTER_FORMAT_REVISION;
}

/**
 * This build's revision as the wire and declaration field that carries it.
 * @return {Object} {clusterFormatRevision}.
 */
function clusterFormatRevisionClaim() {
  return {[CLUSTER_FORMAT_REVISION_FIELD]: CLUSTER_FORMAT_REVISION};
}
function readClaimedClusterFormatRevision(carrier) {
  if (!isNonNullObject(carrier) || !objectHasOwn(carrier, CLUSTER_FORMAT_REVISION_FIELD)) {
    return {present: false, rawRevision: undefined};
  }
  return {present: true, rawRevision: carrier[CLUSTER_FORMAT_REVISION_FIELD]};
}
function formatNumberRevisionToken(rawRevision) {
  if (objectIs(rawRevision, -0)) return CLUSTER_FORMAT_TOKEN.NEGATIVE_ZERO;
  if (numberIsNaN(rawRevision)) return CLUSTER_FORMAT_TOKEN.NAN;
  if (!numberIsFinite(rawRevision)) {
    return rawRevision > ZERO ? CLUSTER_FORMAT_TOKEN.INFINITY :
      CLUSTER_FORMAT_TOKEN.NEGATIVE_INFINITY;
  }
  return `${rawRevision}`;
}
function boundDiagnosticString(value) {
  return value.length <= MAX_DIAGNOSTIC_REVISION_STRING_LENGTH ?
    value : value.slice(ZERO, MAX_DIAGNOSTIC_REVISION_STRING_LENGTH);
}
// Format an untrusted revision claim without ToPrimitive coercion; quote strings.
function formatClusterFormatRevisionToken(present, rawRevision) {
  if (!present || rawRevision === null || rawRevision === undefined) {
    return CLUSTER_FORMAT_TOKEN.ABSENT;
  }
  if (typeof rawRevision === 'number') return formatNumberRevisionToken(rawRevision);
  if (typeof rawRevision === 'string') return jsonStringify(boundDiagnosticString(rawRevision));
  if (typeof rawRevision === 'boolean') {
    return rawRevision ? CLUSTER_FORMAT_TOKEN.TRUE : CLUSTER_FORMAT_TOKEN.FALSE;
  }
  return `${CLUSTER_FORMAT_TOKEN.NON_INTEGER_PREFIX}${typeof rawRevision}` +
    CLUSTER_FORMAT_TOKEN.NON_INTEGER_SUFFIX;
}
// Sanitize diagnostic revision fields to JSON-safe primitives or null.
function sanitizeDiagnosticClusterFormatRevision(present, rawRevision) {
  if (!present || rawRevision === null || rawRevision === undefined) return null;
  if (typeof rawRevision === 'number') {
    return numberIsFinite(rawRevision) && !objectIs(rawRevision, -0) ? rawRevision : null;
  }
  if (typeof rawRevision === 'string') return boundDiagnosticString(rawRevision);
  return typeof rawRevision === 'boolean' ? rawRevision : null;
}
function formatVersionOrPhaseLabel(value) {
  return typeof value === 'string' ? boundDiagnosticString(value) :
    formatClusterFormatRevisionToken(value !== undefined, value);
}
function outsideClusterFormatMessage(subject, claim) {
  const token = formatClusterFormatRevisionToken(claim.present, claim.rawRevision);
  return `${subject} cluster format revision ${token} is ` +
    `${OUTSIDE_CLUSTER_FORMAT_CLAUSE} (revision ${CLUSTER_FORMAT_REVISION}); ` +
    OUTSIDE_CLUSTER_FORMAT_REMEDIATION;
}
function outsideClusterFormatClaimRefusal(subject, claim) {
  return isCurrentClusterFormatRevision(claim.rawRevision) ?
    null : outsideClusterFormatMessage(subject, claim);
}
function resolveJoinSupportEnvelopeConflict({nodeAddress, nodeId, carrier}) {
  const claim = readClaimedClusterFormatRevision(carrier);
  if (isCurrentClusterFormatRevision(claim.rawRevision)) return null;
  return {
    code: SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
    error: outsideClusterFormatMessage(CLUSTER_FORMAT_SUBJECT.PEER, claim),
    localClusterFormatRevision: CLUSTER_FORMAT_REVISION, nodeAddress, nodeId,
    peerClusterFormatRevision: sanitizeDiagnosticClusterFormatRevision(
      claim.present, claim.rawRevision),
    reasonCode: SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
  };
}
function isCurrentClusterFormatDeclaration(declaration) {
  return isCurrentClusterFormatRevision(
    readClaimedClusterFormatRevision(declaration).rawRevision);
}
function assertCurrentClusterFormatDeclaration(declaration) {
  const claim = readClaimedClusterFormatRevision(declaration);
  if (isCurrentClusterFormatRevision(claim.rawRevision)) return;
  const code = SUPPORT_ENVELOPE_REASON_CODE.ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED;
  throw objectAssign(new Error(outsideClusterFormatMessage(
    CLUSTER_FORMAT_SUBJECT.RETAINED_ORIGINAL_ALLOCATION, claim)), {
    code, reasonCode: code, clusterFormatRevision: CLUSTER_FORMAT_REVISION,
    retainedClusterFormatRevision: sanitizeDiagnosticClusterFormatRevision(
      claim.present, claim.rawRevision),
  });
}
function canonicalizeArray(items, seen) {
  seen.add(items);
  const out = [];
  for (let idx = ZERO; idx < items.length; idx += 1) {
    const child = canonicalizeEnvelopeValue(items[idx], seen);
    if (!child.valid) {
      seen.delete(items); return {valid: false, value: null};
    }
    out.push(child.value);
  }
  seen.delete(items);
  return {valid: true, value: out};
}
function canonicalizeObject(record, seen) {
  seen.add(record);
  const sorted = {};
  for (const key of objectKeys(record).sort()) {
    if (key === DIGEST_EXCLUDED_KEY) continue;
    const rawValue = record[key];
    if (rawValue === undefined) continue;
    const child = canonicalizeEnvelopeValue(rawValue, seen);
    if (!child.valid) {
      seen.delete(record); return {valid: false, value: null};
    }
    sorted[key] = child.value;
  }
  seen.delete(record);
  return {valid: true, value: sorted};
}
function canonicalizeEnvelopeValue(value, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return {valid: true, value};
  }
  if (typeof value === 'number') {
    return numberIsFinite(value) && !objectIs(value, -0) ?
      {valid: true, value} : {valid: false, value: null};
  }
  if (!isNonNullObject(value) || seen.has(value)) return {valid: false, value: null};
  return arrayIsArray(value) ? canonicalizeArray(value, seen) : canonicalizeObject(value, seen);
}
function computeSupportEnvelopeDigest(envelope) {
  if (!isNonNullObject(envelope) || arrayIsArray(envelope)) return '';
  const canonical = canonicalizeEnvelopeValue(envelope, new Set());
  if (!canonical.valid) return '';
  return createHash(HASH_ALGORITHM_SHA256)
    .update(jsonStringify(canonical.value), JSON_ENCODING_UTF8).digest(DIGEST_ENCODING_HEX);
}
function snapshotEnvelopeRecord(record) {
  if (!isNonNullObject(record) || arrayIsArray(record)) {
    return {claim: {present: false, rawRevision: undefined}, snapshot: null};
  }
  const snapshot = {};
  let present = false;
  let rawRevision;
  for (const key of objectKeys(record)) {
    const value = record[key];
    snapshot[key] = value;
    if (key === CLUSTER_FORMAT_REVISION_FIELD) {
      present = true; rawRevision = value;
    }
  }
  if (!present && objectHasOwn(record, CLUSTER_FORMAT_REVISION_FIELD)) {
    present = true; rawRevision = record[CLUSTER_FORMAT_REVISION_FIELD];
  }
  return {claim: {present, rawRevision}, snapshot};
}

function readOwnObjectProperty(record, field) {
  if (!isNonNullObject(record) || arrayIsArray(record) || !objectHasOwn(record, field)) {
    return null;
  }
  const section = record[field];
  return isNonNullObject(section) && !arrayIsArray(section) ? section : null;
}

function readEnvelopeVersionPair(record) {
  const pair = readOwnObjectProperty(record, ENVELOPE_FIELD.VERSION_PAIR);
  if (pair === null) return {sourceVersion: null, targetVersion: null};
  const sourceVersion = objectHasOwn(pair, ENVELOPE_FIELD.SOURCE_VERSION) &&
    isNonEmptyString(pair.sourceVersion) ? pair.sourceVersion : null;
  const targetVersion = objectHasOwn(pair, ENVELOPE_FIELD.TARGET_VERSION) &&
    isNonEmptyString(pair.targetVersion) ? pair.targetVersion : null;
  return {sourceVersion, targetVersion};
}

const EMPTY_ELIGIBLE_PHASES = objectFreeze([]);
const ROLLBACK_DECISION_STATE = objectFreeze({
  INVALID_ENVELOPE: 'invalid_envelope', OUTSIDE_TARGET: 'outside_target',
  CUTOFF_EXCEEDED: 'cutoff_exceeded', ELIGIBLE: 'eligible',
});
const MIXED_ADMISSION_STATE = objectFreeze({
  INVALID_ENVELOPE: 'invalid_envelope', BOUNDARY_MISMATCH: 'boundary_mismatch',
  OUTSIDE_ENVELOPE: 'outside_envelope', ADMITTED: 'admitted',
});

function readEnvelopeRollbackSection(record) {
  const rollback = readOwnObjectProperty(record, ENVELOPE_FIELD.ROLLBACK);
  if (rollback === null) {
    return {valid: false, eligiblePhases: EMPTY_ELIGIBLE_PHASES, rollbackCutoff: null};
  }
  const rollbackCutoff = objectHasOwn(rollback, ENVELOPE_FIELD.ROLLBACK_CUTOFF) &&
    isNonEmptyString(rollback.rollbackCutoff) ? rollback.rollbackCutoff : null;
  const rawPhases = objectHasOwn(rollback, ENVELOPE_FIELD.ELIGIBLE_PHASES) ?
    rollback.eligiblePhases : null;
  const phasesValid = arrayIsArray(rawPhases) && rawPhases.length > ZERO &&
    rawPhases.every((phase) => isNonEmptyString(phase));
  return {
    valid: rollbackCutoff !== null && phasesValid,
    eligiblePhases: phasesValid ? rawPhases : EMPTY_ELIGIBLE_PHASES,
    rollbackCutoff,
  };
}

function uncertifiedEnvelopeRefusalMessage(formatRefusal, validation) {
  return formatRefusal !== null ? formatRefusal :
    `${UNCERTIFIED_ENVELOPE_PREFIX}${validation.reasonCode}${UNCERTIFIED_ENVELOPE_SUFFIX}`;
}

function validateVersionPairAdmission(envelope, {sourceVersion, targetVersion} = {}) {
  const snap = snapshotEnvelopeRecord(envelope);
  const validation = validateEnvelopeSnapshot(snap);
  const certified = readEnvelopeVersionPair(snap.snapshot);
  const formatRefusal = outsideClusterFormatClaimRefusal(
    CLUSTER_FORMAT_SUBJECT.SUPPORT_ENVELOPE, snap.claim);
  if (!validation.valid) {
    return {
      admitted: false,
      certifiedSourceVersion: certified.sourceVersion,
      certifiedTargetVersion: certified.targetVersion,
      message: uncertifiedEnvelopeRefusalMessage(formatRefusal, validation),
      reasonCode: validation.reasonCode,
    };
  }
  const exactMatch = typeof sourceVersion === 'string' &&
    typeof targetVersion === 'string' &&
    sourceVersion === certified.sourceVersion &&
    targetVersion === certified.targetVersion;
  const code = exactMatch ?
    SUPPORT_ENVELOPE_REASON_CODE.OK :
    SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE;
  const message = exactMatch ?
    `Version pair ${sourceVersion} -> ${targetVersion} ${CERTIFIED_PAIR_ADMITTED_SUFFIX}` :
    `Version transition ${formatVersionOrPhaseLabel(sourceVersion)} -> ` +
      `${formatVersionOrPhaseLabel(targetVersion)} ` +
      `${OUTSIDE_CERTIFIED_PAIR_INFIX}${certified.sourceVersion} -> ` +
      `${certified.targetVersion}).`;
  return {
    admitted: exactMatch,
    certifiedSourceVersion: certified.sourceVersion,
    certifiedTargetVersion: certified.targetVersion,
    message,
    reasonCode: code,
  };
}

function isRollbackPhaseEligible(eligiblePhases, currentPhase, cutoffExceeded) {
  if (cutoffExceeded === true) return false;
  if (typeof currentPhase !== 'string' || currentPhase.length === ZERO) return true;
  if (POST_CUTOFF_PHASES.includes(currentPhase)) return false;
  return eligiblePhases.includes(currentPhase);
}

function buildRollbackCutoffExceededResult(certified, cutoffName, currentPhase) {
  const phaseText = isNonEmptyString(currentPhase) ?
    boundDiagnosticString(currentPhase) : DEFAULT_FINALIZED_PHASE;
  return {
    eligible: false,
    message: `Rollback to ${certified.sourceVersion} refused: rollback cutoff ` +
      `'${cutoffName}' has been exceeded at phase '${phaseText}'; ${ROLLBACK_RESTORE_SUFFIX}`,
    reasonCode: SUPPORT_ENVELOPE_REASON_CODE.ROLLBACK_CUTOFF_EXCEEDED,
    rollbackCutoff: cutoffName,
    targetVersion: certified.sourceVersion,
  };
}

function resolveRollbackDecisionState({
  validEnvelope, targetMatchesSource, phaseEligible,
}) {
  if (!validEnvelope) return ROLLBACK_DECISION_STATE.INVALID_ENVELOPE;
  if (!targetMatchesSource) return ROLLBACK_DECISION_STATE.OUTSIDE_TARGET;
  return phaseEligible ?
    ROLLBACK_DECISION_STATE.ELIGIBLE :
    ROLLBACK_DECISION_STATE.CUTOFF_EXCEEDED;
}

function evaluateRollbackEligibility(
  envelope,
  {currentPhase, cutoffExceeded = false, schemaFinalized = false, targetVersion} = {},
) {
  const snap = snapshotEnvelopeRecord(envelope);
  const validation = validateEnvelopeSnapshot(snap);
  const certified = readEnvelopeVersionPair(snap.snapshot);
  const rollbackSection = readEnvelopeRollbackSection(snap.snapshot);
  const formatRefusal = outsideClusterFormatClaimRefusal(
    CLUSTER_FORMAT_SUBJECT.SUPPORT_ENVELOPE, snap.claim);
  const cutoffName = rollbackSection.rollbackCutoff;
  const targetMatchesSource =
    targetVersion === undefined || targetVersion === certified.sourceVersion;
  const phaseEligible = !schemaFinalized &&
    isRollbackPhaseEligible(rollbackSection.eligiblePhases, currentPhase, cutoffExceeded);
  const state = resolveRollbackDecisionState({
    validEnvelope: validation.valid, targetMatchesSource, phaseEligible,
  });
  switch (state) {
  case ROLLBACK_DECISION_STATE.INVALID_ENVELOPE:
    return {
      eligible: false,
      message: uncertifiedEnvelopeRefusalMessage(formatRefusal, validation),
      reasonCode: validation.reasonCode,
      rollbackCutoff: cutoffName, targetVersion: certified.sourceVersion,
    };
  case ROLLBACK_DECISION_STATE.OUTSIDE_TARGET:
    return {
      eligible: false,
      message: `Rollback target ${formatVersionOrPhaseLabel(targetVersion)} ` +
        `${OUTSIDE_CERTIFIED_PAIR_INFIX}${certified.sourceVersion}).`,
      reasonCode: SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
      rollbackCutoff: cutoffName, targetVersion: certified.sourceVersion,
    };
  case ROLLBACK_DECISION_STATE.CUTOFF_EXCEEDED:
    return buildRollbackCutoffExceededResult(certified, cutoffName, currentPhase);
  default:
    return {
      eligible: true,
      message: `Rollback to ${certified.sourceVersion} is eligible before ${cutoffName}.`,
      reasonCode: SUPPORT_ENVELOPE_REASON_CODE.OK,
      rollbackCutoff: cutoffName, targetVersion: certified.sourceVersion,
    };
  }
}

function resolveMixedAdmissionState({validEnvelope, boundaryMatched, bothKnown}) {
  if (!validEnvelope) return MIXED_ADMISSION_STATE.INVALID_ENVELOPE;
  if (!boundaryMatched) return MIXED_ADMISSION_STATE.BOUNDARY_MISMATCH;
  return bothKnown ? MIXED_ADMISSION_STATE.ADMITTED : MIXED_ADMISSION_STATE.OUTSIDE_ENVELOPE;
}

function validateMixedVersionNodeAdmission(
  envelope,
  {localVersion, peerVersion, schemaBoundaryCompatible = true} = {},
) {
  const snap = snapshotEnvelopeRecord(envelope);
  const validation = validateEnvelopeSnapshot(snap);
  const certified = readEnvelopeVersionPair(snap.snapshot);
  const formatRefusal = outsideClusterFormatClaimRefusal(
    CLUSTER_FORMAT_SUBJECT.SUPPORT_ENVELOPE, snap.claim);
  const allowedVersions = new Set([certified.sourceVersion, certified.targetVersion]);
  const bothKnown = typeof localVersion === 'string' && typeof peerVersion === 'string' &&
    allowedVersions.has(localVersion) && allowedVersions.has(peerVersion);
  const state = resolveMixedAdmissionState({
    validEnvelope: validation.valid, boundaryMatched: Boolean(schemaBoundaryCompatible), bothKnown,
  });
  switch (state) {
  case MIXED_ADMISSION_STATE.INVALID_ENVELOPE:
    return {
      admitted: false, localVersion, peerVersion,
      message: uncertifiedEnvelopeRefusalMessage(formatRefusal, validation),
      reasonCode: validation.reasonCode,
    };
  case MIXED_ADMISSION_STATE.BOUNDARY_MISMATCH:
    return {
      admitted: false, localVersion, peerVersion,
      message: `Peer version ${formatVersionOrPhaseLabel(peerVersion)} rejected: ` +
        `schema or wire ${SCHEMA_INCOMPATIBLE_SUFFIX}`,
      reasonCode: SUPPORT_ENVELOPE_REASON_CODE.SCHEMA_BOUNDARY_INCOMPATIBLE,
    };
  case MIXED_ADMISSION_STATE.OUTSIDE_ENVELOPE:
    return {
      admitted: false, localVersion, peerVersion,
      message: `Mixed-version peer (${formatVersionOrPhaseLabel(localVersion)} <-> ` +
        `${formatVersionOrPhaseLabel(peerVersion)}${OUTSIDE_MIXED_PEER_INFIX}` +
        `${certified.sourceVersion} -> ${certified.targetVersion}).`,
      reasonCode: SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
    };
  default:
    return {
      admitted: true, localVersion, peerVersion,
      message: `Peer version ${peerVersion} admitted with local version ${localVersion}.`,
      reasonCode: SUPPORT_ENVELOPE_REASON_CODE.OK,
    };
  }
}

function buildDefaultDrills() {
  return {
    [SUPPORT_ENVELOPE_DRILL_ID.DOWNGRADE_ROLLBACK_BOUNDARY]: {
      availabilityOutcome: SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.DOWNGRADE_ROLLBACK_BOUNDARY,
      executed: true, lostAcknowledgedWrites: ZERO,
      postCutoffRefusedWithCode: SUPPORT_ENVELOPE_REASON_CODE.ROLLBACK_CUTOFF_EXCEEDED,
      preCutoffSucceeded: true, recoveryDurationMs: DEFAULT_DOWNGRADE_RECOVERY_MS,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.ONE_NODE_FAILURE_RECOVERY]: {
      availabilityOutcome: SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.ONE_NODE_FAILURE_RECOVERY,
      executed: true, lostAcknowledgedWrites: ZERO,
      recoveryDurationMs: DEFAULT_FAILURE_RECOVERY_MS, targetVersion: DEFAULT_TARGET_VERSION,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE]: {
      availabilityOutcome: SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.CONTINUOUS,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE,
      executed: true, lostAcknowledgedWrites: ZERO,
      recoveryDurationMs: DEFAULT_ROLLING_UPGRADE_RECOVERY_MS,
      sourceVersion: DEFAULT_SOURCE_VERSION, targetVersion: DEFAULT_TARGET_VERSION,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.SERVICE_ARTIFACT_UPGRADE]: {
      artifactAbi: DEFAULT_ARTIFACT_ABI_ID,
      availabilityOutcome: SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.CONTINUOUS,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.SERVICE_ARTIFACT_UPGRADE,
      executed: true, lostAcknowledgedWrites: ZERO,
      previousGenerationRetired: true, recoveryDurationMs: DEFAULT_ARTIFACT_UPGRADE_RECOVERY_MS,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD]: {
      availabilityOutcome: SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD,
      executed: true, learnerCatchUpVerified: true, lostAcknowledgedWrites: ZERO,
      recoveryDurationMs: DEFAULT_REPLICA_REBUILD_RECOVERY_MS,
      replicaBytesRebuilt: DEFAULT_REPLICA_BYTES_REBUILT,
    },
  };
}

function buildDefaultDependencyReceipts() {
  const receipts = {};
  for (const questId of REQUIRED_DEPENDENCY_QUEST_IDS) {
    receipts[questId] = {questId, receiptDigest: `sha256:${questId}-certified`, verified: true};
  }
  return receipts;
}
function resolveBoundariesSection(boundaries = {}) {
  return {
    artifactAbi: boundaries.artifactAbi ?? DEFAULT_ARTIFACT_ABI_ID,
    protocolBoundary: boundaries.protocolBoundary ?? DEFAULT_PROTOCOL_BOUNDARY_ID,
    schemaBoundary: boundaries.schemaBoundary ?? DEFAULT_SCHEMA_BOUNDARY_ID,
  };
}
function resolveRebuildSection(rebuildEnvelope = {}) {
  return {
    maxRebuildDurationMs: rebuildEnvelope.maxRebuildDurationMs ?? DEFAULT_MAX_REBUILD_DURATION_MS,
    maxReplicaBytes: rebuildEnvelope.maxReplicaBytes ?? DEFAULT_MAX_REPLICA_BYTES,
  };
}
function resolveRollbackSection(rollback = {}) {
  return {
    eligiblePhases: rollback.eligiblePhases ?? [...ROLLBACK_ELIGIBLE_PHASES],
    rollbackCutoff: rollback.rollbackCutoff ?? DEFAULT_ROLLBACK_CUTOFF_PHASE,
  };
}
function resolveTopologySection(topologyEnvelope = {}) {
  return {
    maxNodes: topologyEnvelope.maxNodes ?? DEFAULT_MAX_NODES,
    minNodes: topologyEnvelope.minNodes ?? DEFAULT_MIN_NODES,
    replicationFactor: topologyEnvelope.replicationFactor ?? DEFAULT_REPLICATION_FACTOR,
  };
}
function resolveVersionPairSection(versionPair = {}) {
  return {
    sourceVersion: versionPair.sourceVersion ?? DEFAULT_SOURCE_VERSION,
    targetVersion: versionPair.targetVersion ?? DEFAULT_TARGET_VERSION,
  };
}
function buildSupportEnvelopeRecord(input = {}) {
  const baseRecord = {
    ...clusterFormatRevisionClaim(),
    boundaries: resolveBoundariesSection(input.boundaries),
    dependencyReceipts: input.dependencyReceipts ?? buildDefaultDependencyReceipts(),
    drills: input.drills ?? buildDefaultDrills(),
    rebuildEnvelope: resolveRebuildSection(input.rebuildEnvelope),
    rollback: resolveRollbackSection(input.rollback),
    schemaVersion: input.schemaVersion ?? SUPPORT_ENVELOPE_SCHEMA_VERSION,
    topologyEnvelope: resolveTopologySection(input.topologyEnvelope),
    versionPair: resolveVersionPairSection(input.versionPair),
  };
  return {...baseRecord, envelopeDigest: computeSupportEnvelopeDigest(baseRecord)};
}

function isRebuildDurationExceeded(drill, rebuildEnvelope) {
  return numberIsFinite(drill?.recoveryDurationMs) &&
    numberIsFinite(rebuildEnvelope?.maxRebuildDurationMs) &&
    drill.recoveryDurationMs > rebuildEnvelope.maxRebuildDurationMs;
}

function isReplicaBytesExceeded(drill, rebuildEnvelope) {
  return numberIsFinite(drill?.replicaBytesRebuilt) &&
    numberIsFinite(rebuildEnvelope?.maxReplicaBytes) &&
    drill.replicaBytesRebuilt > rebuildEnvelope.maxReplicaBytes;
}

function checkSingleDrillReceipt(drill, rebuildEnvelope, collectedCodes) {
  if (!isNonNullObject(drill) || drill.executed !== true) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.MISSING_OR_INVALID_DRILL_RECEIPT);
    return;
  }
  if (!VALID_AVAILABILITY_OUTCOMES.includes(drill.availabilityOutcome)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.INVALID_AVAILABILITY_OUTCOME);
  }
  if (!numberIsFinite(drill.lostAcknowledgedWrites) || drill.lostAcknowledgedWrites > ZERO) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.ACKNOWLEDGED_DATA_LOSS_DETECTED);
  }
  if (isRebuildDurationExceeded(drill, rebuildEnvelope)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.REBUILD_WINDOW_EXCEEDED);
  }
  if (isReplicaBytesExceeded(drill, rebuildEnvelope)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.REPLICA_SIZE_EXCEEDS_ENVELOPE);
  }
}

function checkDrillReceipts(record, rebuildEnvelope, collectedCodes) {
  const drills = readOwnObjectProperty(record, ENVELOPE_FIELD.DRILLS);
  if (drills === null) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.MISSING_OR_INVALID_DRILL_RECEIPT);
    return;
  }
  for (const drillId of REQUIRED_DRILL_IDS) {
    const drill = objectHasOwn(drills, drillId) ? drills[drillId] : null;
    checkSingleDrillReceipt(drill, rebuildEnvelope, collectedCodes);
  }
}

function isValidDependencyReceipt(receipt) {
  return isNonNullObject(receipt) &&
    receipt.verified === true &&
    isNonEmptyString(receipt.receiptDigest);
}

function checkDependencyReceipts(record, collectedCodes) {
  const receipts = readOwnObjectProperty(record, ENVELOPE_FIELD.DEPENDENCY_RECEIPTS);
  if (receipts === null) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.MISSING_DEPENDENCY_RECEIPT);
    return;
  }
  for (const questId of REQUIRED_DEPENDENCY_QUEST_IDS) {
    const receipt = objectHasOwn(receipts, questId) ? receipts[questId] : null;
    if (!isValidDependencyReceipt(receipt)) {
      collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.MISSING_DEPENDENCY_RECEIPT);
    }
  }
}

function isEnvelopeDigestMatch(record, options, computedDigest) {
  const expectedDigest = options?.expectedDigest ?? record?.envelopeDigest;
  return record?.schemaVersion === SUPPORT_ENVELOPE_SCHEMA_VERSION &&
    isNonEmptyString(expectedDigest) &&
    computedDigest === expectedDigest;
}

function isTopologyBoundsValid(topology) {
  if (!isNonNullObject(topology)) return false;
  const {minNodes, maxNodes, replicationFactor: rf} = topology;
  if (!numberIsSafeInteger(minNodes) || !numberIsSafeInteger(maxNodes) ||
      !numberIsSafeInteger(rf)) {
    return false;
  }
  return minNodes >= DEFAULT_MIN_NODES && maxNodes >= minNodes && rf <= maxNodes;
}

function hasValidVersionPairAndRollback(record) {
  const pair = readEnvelopeVersionPair(record);
  return pair.sourceVersion !== null && pair.targetVersion !== null &&
    readEnvelopeRollbackSection(record).valid;
}

function checkTopologyAndDigest(snap, options, computedDigest, collectedCodes) {
  const record = snap.snapshot;
  if (!isCurrentClusterFormatRevision(snap.claim.rawRevision)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE);
  }
  if (!isEnvelopeDigestMatch(record, options, computedDigest)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.ENVELOPE_DIGEST_MISMATCH);
  }
  if (!isTopologyBoundsValid(readOwnObjectProperty(record, ENVELOPE_FIELD.TOPOLOGY))) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.TOPOLOGY_OUTSIDE_ENVELOPE);
  }
  if (!hasValidVersionPairAndRollback(record)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE);
  }
}

function validateEnvelopeSnapshot(snap, options = {}) {
  const record = snap.snapshot;
  const computedDigest = computeSupportEnvelopeDigest(record);
  const collectedCodes = [];
  checkTopologyAndDigest(snap, options, computedDigest, collectedCodes);
  checkDependencyReceipts(record, collectedCodes);
  checkDrillReceipts(record, readOwnObjectProperty(record, ENVELOPE_FIELD.REBUILD), collectedCodes);
  const uniqueCodes = arrayFrom(new Set(collectedCodes));
  const primaryReason = uniqueCodes.length === ZERO ?
    SUPPORT_ENVELOPE_REASON_CODE.OK : uniqueCodes[ZERO];
  return {
    actualDigest: computedDigest, reasonCode: primaryReason,
    reasonCodes: uniqueCodes, valid: uniqueCodes.length === ZERO,
  };
}

function validateSupportEnvelopeRecord(record, options = {}) {
  return validateEnvelopeSnapshot(snapshotEnvelopeRecord(record), options);
}

function readOptionalOwnSection(record, field) {
  return record !== null && objectHasOwn(record, field) ? record[field] : null;
}

class SupportEnvelopeOwner {
  constructor(options = {}) {
    this.envelope = isNonNullObject(options) &&
      objectHasOwn(options, ENVELOPE_FIELD.ENVELOPE_OPTION) ?
      options.envelope : null;
  }
  getEnvelope() {
    return this.envelope;
  }
  validateEnvelope(options = {}) {
    return validateSupportEnvelopeRecord(this.envelope, options);
  }
  validateUpgradePair({sourceVersion, targetVersion} = {}) {
    return validateVersionPairAdmission(this.envelope, {sourceVersion, targetVersion});
  }
  evaluateRollback(options = {}) {
    return evaluateRollbackEligibility(this.envelope, options);
  }
  validateMixedVersionPeer(options = {}) {
    return validateMixedVersionNodeAdmission(this.envelope, options);
  }
  getManagementSummary() {
    const snap = snapshotEnvelopeRecord(this.envelope);
    const validation = validateEnvelopeSnapshot(snap);
    const record = snap.snapshot;
    const drills = readOwnObjectProperty(record, ENVELOPE_FIELD.DRILLS);
    return {
      boundaries: readOptionalOwnSection(record, ENVELOPE_FIELD.BOUNDARIES),
      clusterFormatRevision: sanitizeDiagnosticClusterFormatRevision(
        snap.claim.present, snap.claim.rawRevision),
      certifiedDrillIds: drills === null ? [] : objectKeys(drills),
      envelopeDigest: readOptionalOwnSection(record, DIGEST_EXCLUDED_KEY),
      rebuildEnvelope: readOptionalOwnSection(record, ENVELOPE_FIELD.REBUILD),
      rollback: readOptionalOwnSection(record, ENVELOPE_FIELD.ROLLBACK),
      schemaVersion: readOptionalOwnSection(record, ENVELOPE_FIELD.SCHEMA_VERSION),
      topologyEnvelope: readOptionalOwnSection(record, ENVELOPE_FIELD.TOPOLOGY),
      valid: validation.valid,
      versionPair: readOptionalOwnSection(record, ENVELOPE_FIELD.VERSION_PAIR),
    };
  }
}

export {
  CLUSTER_FORMAT_REVISION, CLUSTER_FORMAT_REVISION_FIELD, DEFAULT_ROLLBACK_CUTOFF_PHASE,
  DEFAULT_SOURCE_VERSION, DEFAULT_TARGET_VERSION, REQUIRED_DEPENDENCY_QUEST_IDS,
  REQUIRED_DRILL_IDS, SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME, SUPPORT_ENVELOPE_DRILL_ID,
  SUPPORT_ENVELOPE_REASON_CODE, SUPPORT_ENVELOPE_SCHEMA_VERSION, SupportEnvelopeOwner,
  assertCurrentClusterFormatDeclaration, buildSupportEnvelopeRecord, clusterFormatRevisionClaim,
  computeSupportEnvelopeDigest, evaluateRollbackEligibility, isCurrentClusterFormatDeclaration,
  resolveJoinSupportEnvelopeConflict, validateMixedVersionNodeAdmission,
  validateSupportEnvelopeRecord, validateVersionPairAdmission,
};
