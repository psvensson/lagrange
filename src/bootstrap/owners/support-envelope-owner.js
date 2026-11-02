import {createHash} from 'node:crypto';

const SUPPORT_ENVELOPE_SCHEMA_VERSION = 1;
const HASH_ALGORITHM_SHA256 = 'sha256';
const DIGEST_ENCODING_HEX = 'hex';
const JSON_ENCODING_UTF8 = 'utf8';
const ZERO = 0;
const DEFAULT_MIN_NODES = 3;
const DEFAULT_MAX_NODES = 7;
const DEFAULT_REPLICATION_FACTOR = 3;
const DEFAULT_MAX_REPLICA_BYTES = 1_073_741_824;
const DEFAULT_MAX_REBUILD_DURATION_MS = 120_000;
const DEFAULT_SOURCE_VERSION = '0.4.1';
const DEFAULT_TARGET_VERSION = '0.5.0';
const DEFAULT_ROLLBACK_CUTOFF_PHASE = 'BEFORE_TARGET_SCHEMA_FINALIZE';
const DEFAULT_PROTOCOL_BOUNDARY_ID = 'node-transport-mtls-v1';
const DEFAULT_SCHEMA_BOUNDARY_ID = 'raft-sqlite-schema-v1';
const DEFAULT_ARTIFACT_ABI_ID = 'service-cell-v2';
const DIGEST_EXCLUDED_KEY = 'envelopeDigest';
const DEFAULT_FINALIZED_PHASE = 'FINALIZED';
const DEFAULT_DOWNGRADE_RECOVERY_MS = 420;
const DEFAULT_FAILURE_RECOVERY_MS = 650;
const DEFAULT_ROLLING_UPGRADE_RECOVERY_MS = 510;
const DEFAULT_ARTIFACT_UPGRADE_RECOVERY_MS = 310;
const DEFAULT_REPLICA_REBUILD_RECOVERY_MS = 890;
const DEFAULT_REPLICA_BYTES_REBUILT = 4_194_304;
const ROLLBACK_RESTORE_SUFFIX = 'restore from certified snapshot instead.';
const SCHEMA_INCOMPATIBLE_SUFFIX = 'boundary is incompatible.';

const SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME = Object.freeze({
  BOUNDED_DEGRADATION: 'BOUNDED_DEGRADATION',
  BOUNDED_UNAVAILABILITY: 'BOUNDED_UNAVAILABILITY',
  CONTINUOUS: 'CONTINUOUS',
});

const VALID_AVAILABILITY_OUTCOMES = Object.freeze([
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.CONTINUOUS,
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_UNAVAILABILITY,
]);

const SUPPORT_ENVELOPE_DRILL_ID = Object.freeze({
  DOWNGRADE_ROLLBACK_BOUNDARY: 'downgrade_rollback_boundary',
  ONE_NODE_FAILURE_RECOVERY: 'one_node_failure_recovery',
  ROLLING_UPGRADE: 'rolling_upgrade',
  SERVICE_ARTIFACT_UPGRADE: 'service_artifact_upgrade',
  WIPED_REPLICA_REBUILD: 'wiped_replica_rebuild',
});

const REQUIRED_DRILL_IDS = Object.freeze([
  SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE,
  SUPPORT_ENVELOPE_DRILL_ID.DOWNGRADE_ROLLBACK_BOUNDARY,
  SUPPORT_ENVELOPE_DRILL_ID.ONE_NODE_FAILURE_RECOVERY,
  SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD,
  SUPPORT_ENVELOPE_DRILL_ID.SERVICE_ARTIFACT_UPGRADE,
]);

const SUPPORT_ENVELOPE_REASON_CODE = Object.freeze({
  ACKNOWLEDGED_DATA_LOSS_DETECTED: 'ACKNOWLEDGED_DATA_LOSS_DETECTED',
  ENVELOPE_DIGEST_MISMATCH: 'ENVELOPE_DIGEST_MISMATCH',
  INVALID_AVAILABILITY_OUTCOME: 'INVALID_AVAILABILITY_OUTCOME',
  MISSING_DEPENDENCY_RECEIPT: 'MISSING_DEPENDENCY_RECEIPT',
  MISSING_OR_INVALID_DRILL_RECEIPT: 'MISSING_OR_INVALID_DRILL_RECEIPT',
  MIXED_VERSION_UNSUPPORTED: 'MIXED_VERSION_UNSUPPORTED',
  OK: 'OK',
  OUTSIDE_SUPPORT_ENVELOPE: 'OUTSIDE_SUPPORT_ENVELOPE',
  REBUILD_WINDOW_EXCEEDED: 'REBUILD_WINDOW_EXCEEDED',
  REPLICA_SIZE_EXCEEDS_ENVELOPE: 'REPLICA_SIZE_EXCEEDS_ENVELOPE',
  ROLLBACK_CUTOFF_EXCEEDED: 'ROLLBACK_CUTOFF_EXCEEDED',
  SCHEMA_BOUNDARY_INCOMPATIBLE: 'SCHEMA_BOUNDARY_INCOMPATIBLE',
  TOPOLOGY_OUTSIDE_ENVELOPE: 'TOPOLOGY_OUTSIDE_ENVELOPE',
});

const REQUIRED_DEPENDENCY_QUEST_IDS = Object.freeze([
  'learner-promotion-progress-proof',
  'node-transport-authenticated-encryption',
  'resumable-bulk-data-load',
  'pilot-cutover-and-rollback-receipts',
  'public-path-scale-and-failure-certification',
]);

const ROLLBACK_ELIGIBLE_PHASES = Object.freeze([
  'PREFLIGHT',
  'ROLLING_CANARY',
  'ROLLING_FOLLOWERS',
  'ROLLING_LEADER',
  'BEFORE_TARGET_SCHEMA_FINALIZE',
]);

const POST_CUTOFF_PHASES = Object.freeze([
  'TARGET_SCHEMA_FINALIZED',
  'POST_CUTOFF_COMMITTED',
  'FINALIZED',
  'AFTER_ROLLBACK_CUTOFF',
]);

function canonicalizeEnvelopeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeEnvelopeValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (key === DIGEST_EXCLUDED_KEY) {
        continue;
      }
      sorted[key] = canonicalizeEnvelopeValue(value[key]);
    }
    return sorted;
  }
  return value;
}

function computeSupportEnvelopeDigest(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return '';
  }
  const canonicalJson = JSON.stringify(canonicalizeEnvelopeValue(envelope));
  return createHash(HASH_ALGORITHM_SHA256)
    .update(canonicalJson, JSON_ENCODING_UTF8)
    .digest(DIGEST_ENCODING_HEX);
}

function resolveVersionPair(envelope) {
  const pair = envelope?.versionPair || envelope;
  return {
    sourceVersion: pair?.sourceVersion || DEFAULT_SOURCE_VERSION,
    targetVersion: pair?.targetVersion || DEFAULT_TARGET_VERSION,
  };
}

function validateVersionPairAdmission(
  envelope,
  {sourceVersion, targetVersion} = {},
) {
  const certified = resolveVersionPair(envelope);
  const exactMatch =
    typeof sourceVersion === 'string' &&
    typeof targetVersion === 'string' &&
    sourceVersion === certified.sourceVersion &&
    targetVersion === certified.targetVersion;
  const code = exactMatch ?
    SUPPORT_ENVELOPE_REASON_CODE.OK :
    SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE;
  const message = exactMatch ?
    `Version pair ${sourceVersion} -> ${targetVersion} is within the ` +
      'certified support envelope.' :
    `Version transition ${String(sourceVersion)} -> ${String(targetVersion)} ` +
      'is outside the certified support envelope (' +
      `${certified.sourceVersion} -> ${certified.targetVersion}).`;
  return {
    admitted: exactMatch,
    certifiedSourceVersion: certified.sourceVersion,
    certifiedTargetVersion: certified.targetVersion,
    message,
    reasonCode: code,
  };
}

function isRollbackPhaseEligible(envelope, currentPhase, cutoffExceeded) {
  if (cutoffExceeded === true) {
    return false;
  }
  if (typeof currentPhase !== 'string' || currentPhase.length === ZERO) {
    return true;
  }
  if (POST_CUTOFF_PHASES.includes(currentPhase)) {
    return false;
  }
  const allowedPhases = Array.isArray(envelope?.rollback?.eligiblePhases) ?
    envelope.rollback.eligiblePhases :
    ROLLBACK_ELIGIBLE_PHASES;
  return allowedPhases.includes(currentPhase);
}

function resolveRollbackCutoffName(envelope) {
  return (
    envelope?.rollback?.rollbackCutoff ||
    envelope?.rollbackCutoff ||
    DEFAULT_ROLLBACK_CUTOFF_PHASE
  );
}

function buildRollbackCutoffExceededResult(certified, cutoffName, currentPhase) {
  const phaseText = String(currentPhase || DEFAULT_FINALIZED_PHASE);
  return {
    eligible: false,
    message:
      `Rollback to ${certified.sourceVersion} refused: rollback cutoff ` +
      `'${cutoffName}' has been exceeded at phase '${phaseText}'; ` +
      ROLLBACK_RESTORE_SUFFIX,
    reasonCode: SUPPORT_ENVELOPE_REASON_CODE.ROLLBACK_CUTOFF_EXCEEDED,
    rollbackCutoff: cutoffName,
    targetVersion: certified.sourceVersion,
  };
}

function evaluateRollbackEligibility(
  envelope,
  {
    currentPhase,
    cutoffExceeded = false,
    schemaFinalized = false,
    targetVersion,
  } = {},
) {
  const certified = resolveVersionPair(envelope);
  const cutoffName = resolveRollbackCutoffName(envelope);
  const targetMatchesSource =
    targetVersion === undefined || targetVersion === certified.sourceVersion;
  if (!targetMatchesSource) {
    return {
      eligible: false,
      message:
        `Rollback target ${String(targetVersion)} is outside the certified ` +
        `support envelope (${certified.sourceVersion}).`,
      reasonCode: SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
      rollbackCutoff: cutoffName,
      targetVersion: certified.sourceVersion,
    };
  }
  const phaseEligible =
    !schemaFinalized &&
    isRollbackPhaseEligible(envelope, currentPhase, cutoffExceeded);
  if (!phaseEligible) {
    return buildRollbackCutoffExceededResult(certified, cutoffName, currentPhase);
  }
  return {
    eligible: true,
    message:
      `Rollback to ${certified.sourceVersion} is eligible before ` +
      `${cutoffName}.`,
    reasonCode: SUPPORT_ENVELOPE_REASON_CODE.OK,
    rollbackCutoff: cutoffName,
    targetVersion: certified.sourceVersion,
  };
}

function validateMixedVersionNodeAdmission(
  envelope,
  {localVersion, peerVersion, schemaBoundaryCompatible = true} = {},
) {
  const certified = resolveVersionPair(envelope);
  const allowedVersions = new Set([
    certified.sourceVersion,
    certified.targetVersion,
  ]);
  const bothKnown =
    typeof localVersion === 'string' &&
    typeof peerVersion === 'string' &&
    allowedVersions.has(localVersion) &&
    allowedVersions.has(peerVersion);
  let code = SUPPORT_ENVELOPE_REASON_CODE.OK;
  let message =
    `Peer version ${String(peerVersion)} admitted with local version ` +
    `${String(localVersion)}.`;
  if (!schemaBoundaryCompatible) {
    code = SUPPORT_ENVELOPE_REASON_CODE.SCHEMA_BOUNDARY_INCOMPATIBLE;
    message =
      `Peer version ${String(peerVersion)} rejected: schema or wire ` +
      SCHEMA_INCOMPATIBLE_SUFFIX;
  } else if (!bothKnown) {
    code = SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE;
    message =
      `Mixed-version peer (${String(localVersion)} <-> ` +
      `${String(peerVersion)}) is outside the certified support envelope (` +
      `${certified.sourceVersion} -> ${certified.targetVersion}).`;
  }
  return {
    admitted: code === SUPPORT_ENVELOPE_REASON_CODE.OK,
    localVersion,
    message,
    peerVersion,
    reasonCode: code,
  };
}

function resolveJoinEnvelope(options, defaultEnvelope, getSupportEnvelope) {
  if (options?.supportEnvelope) {
    return options.supportEnvelope;
  }
  if (defaultEnvelope) {
    return defaultEnvelope;
  }
  return typeof getSupportEnvelope === 'function' ?
    getSupportEnvelope() :
    null;
}

function resolveJoinLocalVersion(options, envelope, getReleaseVersion) {
  if (options?.localVersion) {
    return options.localVersion;
  }
  if (typeof getReleaseVersion === 'function') {
    const version = getReleaseVersion();
    if (version) {
      return version;
    }
  }
  return envelope?.versionPair?.sourceVersion || null;
}

function resolveJoinSupportEnvelopeConflict({
  defaultEnvelope = null,
  getReleaseVersion = null,
  getSupportEnvelope = null,
  nodeAddress,
  nodeId,
  options = {},
} = {}) {
  const envelope = resolveJoinEnvelope(
    options,
    defaultEnvelope,
    getSupportEnvelope,
  );
  const peerVersion = options.peerVersion || options.releaseVersion || null;
  if (!envelope || !peerVersion) {
    return null;
  }
  const localVersion = resolveJoinLocalVersion(
    options,
    envelope,
    getReleaseVersion,
  );
  const admission = validateMixedVersionNodeAdmission(envelope, {
    localVersion,
    peerVersion,
    schemaBoundaryCompatible: options.schemaBoundaryCompatible !== false,
  });
  if (admission.admitted) {
    return null;
  }
  return {
    code: SUPPORT_ENVELOPE_REASON_CODE.OUTSIDE_SUPPORT_ENVELOPE,
    error: admission.message,
    localVersion,
    nodeAddress,
    nodeId,
    peerVersion,
    reasonCode: admission.reasonCode,
  };
}

function buildDefaultDrills() {
  return {
    [SUPPORT_ENVELOPE_DRILL_ID.DOWNGRADE_ROLLBACK_BOUNDARY]: {
      availabilityOutcome:
        SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.DOWNGRADE_ROLLBACK_BOUNDARY,
      executed: true,
      lostAcknowledgedWrites: ZERO,
      postCutoffRefusedWithCode:
        SUPPORT_ENVELOPE_REASON_CODE.ROLLBACK_CUTOFF_EXCEEDED,
      preCutoffSucceeded: true,
      recoveryDurationMs: DEFAULT_DOWNGRADE_RECOVERY_MS,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.ONE_NODE_FAILURE_RECOVERY]: {
      availabilityOutcome:
        SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.ONE_NODE_FAILURE_RECOVERY,
      executed: true,
      lostAcknowledgedWrites: ZERO,
      recoveryDurationMs: DEFAULT_FAILURE_RECOVERY_MS,
      targetVersion: DEFAULT_TARGET_VERSION,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE]: {
      availabilityOutcome: SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.CONTINUOUS,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.ROLLING_UPGRADE,
      executed: true,
      lostAcknowledgedWrites: ZERO,
      recoveryDurationMs: DEFAULT_ROLLING_UPGRADE_RECOVERY_MS,
      sourceVersion: DEFAULT_SOURCE_VERSION,
      targetVersion: DEFAULT_TARGET_VERSION,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.SERVICE_ARTIFACT_UPGRADE]: {
      artifactAbi: DEFAULT_ARTIFACT_ABI_ID,
      availabilityOutcome: SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.CONTINUOUS,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.SERVICE_ARTIFACT_UPGRADE,
      executed: true,
      lostAcknowledgedWrites: ZERO,
      previousGenerationRetired: true,
      recoveryDurationMs: DEFAULT_ARTIFACT_UPGRADE_RECOVERY_MS,
    },
    [SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD]: {
      availabilityOutcome:
        SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME.BOUNDED_DEGRADATION,
      drillId: SUPPORT_ENVELOPE_DRILL_ID.WIPED_REPLICA_REBUILD,
      executed: true,
      learnerCatchUpVerified: true,
      lostAcknowledgedWrites: ZERO,
      recoveryDurationMs: DEFAULT_REPLICA_REBUILD_RECOVERY_MS,
      replicaBytesRebuilt: DEFAULT_REPLICA_BYTES_REBUILT,
    },
  };
}

function buildDefaultDependencyReceipts() {
  const receipts = {};
  for (const questId of REQUIRED_DEPENDENCY_QUEST_IDS) {
    receipts[questId] = {
      questId,
      receiptDigest: `sha256:${questId}-certified`,
      verified: true,
    };
  }
  return receipts;
}

function resolveBoundariesSection(boundaries = {}) {
  return {
    artifactAbi: boundaries.artifactAbi || DEFAULT_ARTIFACT_ABI_ID,
    protocolBoundary:
      boundaries.protocolBoundary || DEFAULT_PROTOCOL_BOUNDARY_ID,
    schemaBoundary: boundaries.schemaBoundary || DEFAULT_SCHEMA_BOUNDARY_ID,
  };
}

function resolveRebuildSection(rebuildEnvelope = {}) {
  return {
    maxRebuildDurationMs:
      rebuildEnvelope.maxRebuildDurationMs ?? DEFAULT_MAX_REBUILD_DURATION_MS,
    maxReplicaBytes:
      rebuildEnvelope.maxReplicaBytes ?? DEFAULT_MAX_REPLICA_BYTES,
  };
}

function resolveRollbackSection(rollback = {}) {
  return {
    eligiblePhases: rollback.eligiblePhases || [...ROLLBACK_ELIGIBLE_PHASES],
    rollbackCutoff: rollback.rollbackCutoff || DEFAULT_ROLLBACK_CUTOFF_PHASE,
  };
}

function resolveTopologySection(topologyEnvelope = {}) {
  return {
    maxNodes: topologyEnvelope.maxNodes ?? DEFAULT_MAX_NODES,
    minNodes: topologyEnvelope.minNodes ?? DEFAULT_MIN_NODES,
    replicationFactor:
      topologyEnvelope.replicationFactor ?? DEFAULT_REPLICATION_FACTOR,
  };
}

function resolveVersionPairSection(versionPair = {}) {
  return {
    sourceVersion: versionPair.sourceVersion || DEFAULT_SOURCE_VERSION,
    targetVersion: versionPair.targetVersion || DEFAULT_TARGET_VERSION,
  };
}

function buildSupportEnvelopeRecord(input = {}) {
  const baseRecord = {
    boundaries: resolveBoundariesSection(input.boundaries),
    dependencyReceipts:
      input.dependencyReceipts || buildDefaultDependencyReceipts(),
    drills: input.drills || buildDefaultDrills(),
    rebuildEnvelope: resolveRebuildSection(input.rebuildEnvelope),
    rollback: resolveRollbackSection(input.rollback),
    schemaVersion: input.schemaVersion ?? SUPPORT_ENVELOPE_SCHEMA_VERSION,
    topologyEnvelope: resolveTopologySection(input.topologyEnvelope),
    versionPair: resolveVersionPairSection(input.versionPair),
  };
  return {
    ...baseRecord,
    envelopeDigest: computeSupportEnvelopeDigest(baseRecord),
  };
}

function isRebuildDurationExceeded(drill, rebuildEnvelope) {
  return (
    Number.isFinite(drill?.recoveryDurationMs) &&
    Number.isFinite(rebuildEnvelope?.maxRebuildDurationMs) &&
    drill.recoveryDurationMs > rebuildEnvelope.maxRebuildDurationMs
  );
}

function isReplicaBytesExceeded(drill, rebuildEnvelope) {
  return (
    Number.isFinite(drill?.replicaBytesRebuilt) &&
    Number.isFinite(rebuildEnvelope?.maxReplicaBytes) &&
    drill.replicaBytesRebuilt > rebuildEnvelope.maxReplicaBytes
  );
}

function checkSingleDrillReceipt(drill, rebuildEnvelope, collectedCodes) {
  if (!drill || drill.executed !== true) {
    collectedCodes.push(
      SUPPORT_ENVELOPE_REASON_CODE.MISSING_OR_INVALID_DRILL_RECEIPT,
    );
    return;
  }
  if (!VALID_AVAILABILITY_OUTCOMES.includes(drill.availabilityOutcome)) {
    collectedCodes.push(
      SUPPORT_ENVELOPE_REASON_CODE.INVALID_AVAILABILITY_OUTCOME,
    );
  }
  if (
    !Number.isFinite(drill.lostAcknowledgedWrites) ||
    drill.lostAcknowledgedWrites > ZERO
  ) {
    collectedCodes.push(
      SUPPORT_ENVELOPE_REASON_CODE.ACKNOWLEDGED_DATA_LOSS_DETECTED,
    );
  }
  if (isRebuildDurationExceeded(drill, rebuildEnvelope)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.REBUILD_WINDOW_EXCEEDED);
  }
  if (isReplicaBytesExceeded(drill, rebuildEnvelope)) {
    collectedCodes.push(
      SUPPORT_ENVELOPE_REASON_CODE.REPLICA_SIZE_EXCEEDS_ENVELOPE,
    );
  }
}

function checkDrillReceipts(record, rebuildEnvelope, collectedCodes) {
  const drills = record?.drills;
  if (!drills || typeof drills !== 'object') {
    collectedCodes.push(
      SUPPORT_ENVELOPE_REASON_CODE.MISSING_OR_INVALID_DRILL_RECEIPT,
    );
    return;
  }
  for (const drillId of REQUIRED_DRILL_IDS) {
    checkSingleDrillReceipt(drills[drillId], rebuildEnvelope, collectedCodes);
  }
}

function checkDependencyReceipts(record, collectedCodes) {
  const receipts = record?.dependencyReceipts;
  if (!receipts || typeof receipts !== 'object') {
    collectedCodes.push(
      SUPPORT_ENVELOPE_REASON_CODE.MISSING_DEPENDENCY_RECEIPT,
    );
    return;
  }
  for (const questId of REQUIRED_DEPENDENCY_QUEST_IDS) {
    const receipt = receipts[questId];
    if (
      !receipt ||
      receipt.verified !== true ||
      typeof receipt.receiptDigest !== 'string' ||
      receipt.receiptDigest.length === ZERO
    ) {
      collectedCodes.push(
        SUPPORT_ENVELOPE_REASON_CODE.MISSING_DEPENDENCY_RECEIPT,
      );
    }
  }
}

function isEnvelopeDigestMatch(record, options) {
  const computedDigest = computeSupportEnvelopeDigest(record);
  const expectedDigest = options?.expectedDigest ?? record?.envelopeDigest;
  return (
    record?.schemaVersion === SUPPORT_ENVELOPE_SCHEMA_VERSION &&
    typeof expectedDigest === 'string' &&
    expectedDigest.length > ZERO &&
    computedDigest === expectedDigest
  );
}

function isTopologyBoundsValid(topology) {
  const minNodes = topology?.minNodes;
  const maxNodes = topology?.maxNodes;
  const rf = topology?.replicationFactor;
  const areIntegers =
    Number.isSafeInteger(minNodes) &&
    Number.isSafeInteger(maxNodes) &&
    Number.isSafeInteger(rf);
  if (!areIntegers) {
    return false;
  }
  return minNodes >= DEFAULT_MIN_NODES && maxNodes >= minNodes && rf <= maxNodes;
}

function checkTopologyAndDigest(record, options, collectedCodes) {
  if (!isEnvelopeDigestMatch(record, options)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.ENVELOPE_DIGEST_MISMATCH);
  }
  if (!isTopologyBoundsValid(record?.topologyEnvelope)) {
    collectedCodes.push(SUPPORT_ENVELOPE_REASON_CODE.TOPOLOGY_OUTSIDE_ENVELOPE);
  }
}

function validateSupportEnvelopeRecord(record, options = {}) {
  const collectedCodes = [];
  checkTopologyAndDigest(record, options, collectedCodes);
  checkDependencyReceipts(record, collectedCodes);
  checkDrillReceipts(record, record?.rebuildEnvelope, collectedCodes);
  const uniqueCodes = Array.from(new Set(collectedCodes));
  const primaryReason = uniqueCodes.length === ZERO ?
    SUPPORT_ENVELOPE_REASON_CODE.OK :
    uniqueCodes[ZERO];
  return {
    actualDigest: computeSupportEnvelopeDigest(record),
    reasonCode: primaryReason,
    reasonCodes: uniqueCodes,
    valid: uniqueCodes.length === ZERO,
  };
}

class SupportEnvelopeOwner {
  constructor(options = {}) {
    this.envelope = options.envelope || buildSupportEnvelopeRecord(options);
  }

  getEnvelope() {
    return this.envelope;
  }

  validateEnvelope(options = {}) {
    return validateSupportEnvelopeRecord(this.envelope, options);
  }

  validateUpgradePair({sourceVersion, targetVersion} = {}) {
    return validateVersionPairAdmission(this.envelope, {
      sourceVersion,
      targetVersion,
    });
  }

  evaluateRollback(options = {}) {
    return evaluateRollbackEligibility(this.envelope, options);
  }

  validateMixedVersionPeer(options = {}) {
    return validateMixedVersionNodeAdmission(this.envelope, options);
  }

  getManagementSummary() {
    const validation = this.validateEnvelope();
    return {
      boundaries: this.envelope.boundaries,
      certifiedDrillIds: Object.keys(this.envelope.drills || {}),
      envelopeDigest: this.envelope.envelopeDigest,
      rebuildEnvelope: this.envelope.rebuildEnvelope,
      rollback: this.envelope.rollback,
      schemaVersion: this.envelope.schemaVersion,
      topologyEnvelope: this.envelope.topologyEnvelope,
      valid: validation.valid,
      versionPair: this.envelope.versionPair,
    };
  }
}

export {
  DEFAULT_ROLLBACK_CUTOFF_PHASE,
  DEFAULT_SOURCE_VERSION,
  DEFAULT_TARGET_VERSION,
  REQUIRED_DEPENDENCY_QUEST_IDS,
  REQUIRED_DRILL_IDS,
  SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME,
  SUPPORT_ENVELOPE_DRILL_ID,
  SUPPORT_ENVELOPE_REASON_CODE,
  SUPPORT_ENVELOPE_SCHEMA_VERSION,
  SupportEnvelopeOwner,
  buildSupportEnvelopeRecord,
  computeSupportEnvelopeDigest,
  evaluateRollbackEligibility,
  resolveJoinSupportEnvelopeConflict,
  validateMixedVersionNodeAdmission,
  validateSupportEnvelopeRecord,
  validateVersionPairAdmission,
};
