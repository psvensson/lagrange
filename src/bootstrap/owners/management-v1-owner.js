import {randomUUID} from 'node:crypto';
import {HTTP_STATUS} from '../../constants/index.js';
import {
  CLUSTER_FACTS_CONSTANTS,
  L3_BACKUP_RESTORE_REASON_CODE,
  L4_ROLLING_UPGRADE_REASON_CODE,
  L6_DECOMMISSION_REASON_CODE,
  MANAGEMENT_ERROR_CODE,
  MANAGEMENT_OPERATION_KIND,
  MANAGEMENT_OPERATION_STATE,
  MANAGEMENT_V1_CONTRACT,
} from './management-v1-constants.js';
import {RollingUpgradeOwner} from './rolling-upgrade-owner.js';
import {BackupRestoreOwner} from './backup-restore-owner.js';
import {readCachedDeclaredFormationSize} from '../formation-target-record.js';
import {
  computeCanonicalOperationDigest,
  failValidation,
  isBoundedString,
  validateManagementV1OperationRequest,
} from './management-v1-request-validator.js';

const HTTP_STATUS_PAYLOAD_TOO_LARGE = 413;
const HTTP_STATUS_INTERNAL_ERROR = 500;
const PROPERTY_DUPLICATE = 'duplicate';
const NULL_REASON_CODE = null;
const NULL_RESTORE_LINEAGE = null;
const EMPTY_REASONS = Object.freeze([]);
const EMPTY_STRING_ARRAY = Object.freeze([]);
const RESTORE_HYDRATION_REASONS = Object.freeze(['restore_hydration_in_progress']);
const PREFLIGHT_PASSED = '';
const HEADER_CONTENT_LENGTH = 'content-length';
const OPERATION_STATE_BLOCKED = 'BLOCKED';
const MIN_QUORUM_SAFE_NODE_COUNT = 2;
const MAX_ADMISSION_CLOCK_SKEW_MS = 1000;
const MUTATION_AUTHORITY_PERMITTED = '';
const STRING_TYPE = 'string';
const FUNCTION_TYPE = 'function';
const NULL_CLUSTER_ID = null;
const NULL_SNAPSHOT = null;
const NULL_PORT = null;

const RESTORE_FENCED_HEALTH = Object.freeze({
  state: CLUSTER_FACTS_CONSTANTS.HEALTH_UNAVAILABLE,
  ready: false,
  reasons: RESTORE_HYDRATION_REASONS,
});

const HEALTH_SNAPSHOT_UNAVAILABLE = Object.freeze({
  state: CLUSTER_FACTS_CONSTANTS.HEALTH_UNKNOWN,
  ready: false,
  reasons: Object.freeze([CLUSTER_FACTS_CONSTANTS.REASON_HEALTH_SNAPSHOT_UNAVAILABLE]),
});

const CAPACITY_SNAPSHOT_UNAVAILABLE = Object.freeze({
  state: CLUSTER_FACTS_CONSTANTS.CAPACITY_UNKNOWN,
  reasons: Object.freeze([CLUSTER_FACTS_CONSTANTS.REASON_CAPACITY_SNAPSHOT_UNAVAILABLE]),
});

const TOPOLOGY_COUNT_FIELDS = Object.freeze([
  'nodeCount', 'readyNodeCount', 'underReplicatedPartitionCount',
]);

/** The physical rolling-upgrade ports handed to the rolling-upgrade owner. */
const ROLLING_UPGRADE_PORTS = Object.freeze([
  'onDrainNodeLeadership', 'onTriggerNodeRestart', 'onSetNodeReadyz', 'onPersistState',
]);

function isEstablishedClusterId(id) {
  return typeof id === STRING_TYPE && id.length > 0;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * A runtime snapshot is usable only when the runtime port reports every
 * admission-relevant fact; a partial snapshot is unavailable, never defaulted.
 */
function isRuntimeClusterSnapshot(snap) {
  return Boolean(snap) && TOPOLOGY_COUNT_FIELDS.every((k) => isCount(snap[k])) &&
    Array.isArray(snap.nodeIds);
}

function pickPorts(options, names) {
  const ports = {};
  for (const name of names) {
    if (typeof options[name] === FUNCTION_TYPE) ports[name] = options[name];
  }
  return ports;
}

function checkDecommissionPreflight(owner, snap, id) {
  const c = L6_DECOMMISSION_REASON_CODE;
  if (!owner.decommissionSupported) return c.DECOMMISSION_CAPABILITY_UNSUPPORTED;
  if (snap === NULL_SNAPSHOT) return c.CLUSTER_NOT_READY;
  if (owner.hasActiveOperation()) return c.CONCURRENT_OPERATION_ACTIVE;
  if (snap.hasPartitionQuorum !== true) return c.QUORUM_SAFETY_VIOLATION;
  if (snap.ready !== true) return c.CLUSTER_NOT_READY;
  if (snap.underReplicatedPartitionCount > 0) return c.UNDER_REPLICATED_PARTITIONS;
  if (!snap.nodeIds.includes(id)) return c.NODE_NOT_FOUND;
  const unsafe = snap.nodeCount <= MIN_QUORUM_SAFE_NODE_COUNT ||
    (typeof snap.isQuorumSafe === FUNCTION_TYPE && !snap.isQuorumSafe(id));
  return unsafe ? c.QUORUM_SAFETY_VIOLATION : PREFLIGHT_PASSED;
}

function applyUpdatedOperationStatus(record, updated) {
  if (updated) {
    record.state = updated.state;
    record.reasonCode = updated.reasonCode ?? NULL_REASON_CODE;
    record.updatedAtMs = updated.updatedAtMs ?? Date.now();
  }
}

function sendErrorReply(reply, error, defaultStatus = HTTP_STATUS.BAD_REQUEST) {
  // ManagementV1ValidationError (management-v1-request-validator.js) carries
  // statusCode; any other error answers the handler's declared status.
  const status = error.statusCode ?? defaultStatus;
  const payload = {
    error: error.message,
    code: error.code || MANAGEMENT_ERROR_CODE.OPERATION_VALUE_INVALID,
  };
  reply.code?.(status);
  reply.status?.(status);
  return typeof reply.send === 'function' ? reply.send(payload) : payload;
}

async function runHandler(reply, fn, defaultStatus) {
  try {
    reply.code?.(HTTP_STATUS.OK);
    return await fn();
  } catch (err) {
    return sendErrorReply(reply, err, defaultStatus);
  }
}

function checkPayloadSize(req) {
  const len = req.headers?.[HEADER_CONTENT_LENGTH];
  if (len != null && Number(len) > MANAGEMENT_V1_CONTRACT.MAX_BODY_BYTES) {
    failValidation(MANAGEMENT_ERROR_CODE.PAYLOAD_TOO_LARGE, HTTP_STATUS_PAYLOAD_TOO_LARGE);
  }
}

function isBackupFencingReadiness(bkp) {
  return Boolean(bkp?.isRestoreInProgress?.() || bkp?.isRestoreAborted?.());
}

function readSnapshotPort(port) {
  return typeof port === FUNCTION_TYPE ? port() : NULL_SNAPSHOT;
}

function snapshotReasons(snap) {
  return Array.isArray(snap.reasons) ? snap.reasons : EMPTY_REASONS;
}

function buildHealth(bkp, snap) {
  if (isBackupFencingReadiness(bkp)) return RESTORE_FENCED_HEALTH;
  if (typeof snap?.state !== STRING_TYPE) return HEALTH_SNAPSHOT_UNAVAILABLE;
  return {state: snap.state, ready: snap.ready === true, reasons: snapshotReasons(snap)};
}

function buildCapacity(snap) {
  if (typeof snap?.state !== STRING_TYPE) return CAPACITY_SNAPSHOT_UNAVAILABLE;
  return {state: snap.state, reasons: snapshotReasons(snap)};
}

function buildTopology(snap, versionSkew) {
  if (snap === NULL_SNAPSHOT) {
    return {
      state: CLUSTER_FACTS_CONSTANTS.TOPOLOGY_UNKNOWN,
      reasons: [CLUSTER_FACTS_CONSTANTS.REASON_CLUSTER_SNAPSHOT_UNAVAILABLE],
      versionSkew,
    };
  }
  return {
    state: CLUSTER_FACTS_CONSTANTS.TOPOLOGY_OBSERVED,
    nodeCount: snap.nodeCount, readyNodeCount: snap.readyNodeCount,
    underReplicatedPartitionCount: snap.underReplicatedPartitionCount,
    versionSkew,
  };
}

function resolveCapabilityState(supported) {
  return supported ?
    CLUSTER_FACTS_CONSTANTS.CAPABILITY_SUPPORTED :
    CLUSTER_FACTS_CONSTANTS.CAPABILITY_UNSUPPORTED;
}

function buildReleaseSection(rel, supportEnvelope) {
  const v = MANAGEMENT_V1_CONTRACT;
  const base = {
    version: rel?.version || v.DEFAULT_RELEASE_VERSION,
    artifactDigest: rel?.artifactDigest || v.DEFAULT_ARTIFACT_DIGEST,
  };
  return supportEnvelope ? {...base, supportEnvelope} : base;
}

function buildClusterSection(owner, incLin) {
  const identity = owner.getClusterId();
  const identityState = identity === NULL_CLUSTER_ID ?
    CLUSTER_FACTS_CONSTANTS.IDENTITY_UNKNOWN :
    CLUSTER_FACTS_CONSTANTS.IDENTITY_ESTABLISHED;
  const lin = owner.getRestoreLineage();
  const declaredFormationSize = owner.getDeclaredFormationSize();
  return lin && incLin ?
    {identity, identityState, declaredFormationSize, restoredFrom: lin} :
    {identity, identityState, declaredFormationSize};
}

function buildFacts(owner, snap, incLin) {
  const baseFacts = {
    cluster: buildClusterSection(owner, incLin),
    release: buildReleaseSection(
      owner.rollingUpgradeOwner?.getReleaseFacts?.(),
      owner.supportEnvelope,
    ),
    health: buildHealth(owner.backupRestoreOwner, readSnapshotPort(owner.options.healthSnapshot)),
    topology: buildTopology(snap, owner.isVersionSkewActive()),
    operations: owner._buildOperationsSection(),
    capacity: owner.getCapacityFacts(),
    capabilities: {
      backupRestore: resolveCapabilityState(owner.backupRestoreOwner?.capabilitySupported),
      decommissionNode: resolveCapabilityState(owner.decommissionSupported),
      rollingUpgrade: resolveCapabilityState(owner.rollingUpgradeOwner?.capabilitySupported),
    },
  };
  return owner.supportEnvelope ?
    {...baseFacts, supportEnvelope: owner.supportEnvelope} :
    baseFacts;
}

function overlayRuntimeSnapshot(owner, runtime) {
  if (!isRuntimeClusterSnapshot(runtime)) return NULL_SNAPSHOT;
  const clusterId = owner.getClusterId();
  return {
    ...runtime,
    clusterId,
    ready: runtime.ready === true && !isBackupFencingReadiness(owner.backupRestoreOwner),
    hasPartitionQuorum: runtime.hasPartitionQuorum === true,
    capacityState: owner.getCapacityFacts().state,
    hasActiveOperation: runtime.hasActiveOperation === true || owner.hasActiveOperation(),
    readyNodeCount: Math.max(0,
      runtime.readyNodeCount - resolveDrainingCount(owner.rollingUpgradeOwner)),
    versionSkew: owner.isVersionSkewActive(),
    configurationKey: runtime.configurationKey ?? null,
    membershipGenerationIndex: runtime.membershipGenerationIndex ?? null,
    lifecycleIncarnation: runtime.lifecycleIncarnation ?? null,
    capturedAtMs: runtime.capturedAtMs ?? null,
    maxFreshnessMs: runtime.maxFreshnessMs ?? null,
    operationAuthority: runtime.operationAuthority ? {
      ...runtime.operationAuthority,
      clusterId,
    } : null,
  };
}

function resolveFactsClusterSnapshot(owner, resolvedSnapshot) {
  return resolvedSnapshot === undefined ?
    owner.getClusterSnapshot() :
    resolvedSnapshot;
}

function isExistingConflict(ex, input) {
  return ex.requestDigest !== input.requestDigest ||
    ex.kind !== input.kind || ex.clusterId !== input.clusterId;
}

function resolveDrainingCount(upg) {
  const ids = upg?.getDrainingNodeIds?.();
  return Array.isArray(ids) ? ids.length : 0;
}

function createBackupRestoreOwner(owner) {
  const options = owner.options;
  return new BackupRestoreOwner({
    storageAdapter: options.storageAdapter ?? NULL_PORT,
    exportPartitionSnapshots: options.exportPartitionSnapshots ?? NULL_PORT,
    hydratePartitionSnapshots: options.hydratePartitionSnapshots ?? NULL_PORT,
    getClusterId: () => owner.getClusterId(),
    onSetClusterId: (id) => {
      owner.clusterId = id;
      options.onSetClusterId?.(id);
    },
  });
}

function resolveQuorumRefusalCode(kind) {
  if (kind === MANAGEMENT_OPERATION_KIND.CREATE_BACKUP) {
    return L3_BACKUP_RESTORE_REASON_CODE.PARTITION_QUORUM_UNAVAILABLE;
  }
  if (kind === MANAGEMENT_OPERATION_KIND.DECOMMISSION_NODE) {
    return L6_DECOMMISSION_REASON_CODE.QUORUM_SAFETY_VIOLATION;
  }
  return L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT;
}

function hasValidConfigurationAuthority(clusterSnapshot) {
  const {configurationKey, lifecycleIncarnation} = clusterSnapshot;
  return typeof configurationKey === STRING_TYPE &&
    configurationKey.length > 0 &&
    lifecycleIncarnation !== null &&
    lifecycleIncarnation !== undefined;
}

function isFreshSnapshotAuthority(clusterSnapshot, nowMs) {
  const {capturedAtMs, maxFreshnessMs} = clusterSnapshot;
  if (!Number.isFinite(capturedAtMs) || !Number.isFinite(maxFreshnessMs) || maxFreshnessMs <= 0) {
    return false;
  }
  const ageMs = nowMs - capturedAtMs;
  return ageMs >= -MAX_ADMISSION_CLOCK_SKEW_MS && ageMs <= maxFreshnessMs;
}

function evaluateMutationAuthority(owner, clusterSnapshot, nowMs, kind) {
  if (!clusterSnapshot || clusterSnapshot.hasPartitionQuorum !== true) {
    return resolveQuorumRefusalCode(kind);
  }
  const clusterId = owner.getClusterId();
  if (clusterId === NULL_CLUSTER_ID || clusterSnapshot.clusterId !== clusterId) {
    return resolveQuorumRefusalCode(kind);
  }
  if (!hasValidConfigurationAuthority(clusterSnapshot)) {
    return resolveQuorumRefusalCode(kind);
  }
  if (!isFreshSnapshotAuthority(clusterSnapshot, nowMs)) {
    return resolveQuorumRefusalCode(kind);
  }
  return MUTATION_AUTHORITY_PERMITTED;
}

function executeDecommission(owner, input, clusterSnapshot, nowMs) {
  const preflight = owner._preflightDecommission(
    input.parameters?.lagrangeNodeId,
    nowMs,
    clusterSnapshot,
  );
  if (preflight.state === MANAGEMENT_OPERATION_STATE.REJECTED) {
    return preflight;
  }
  const refusalCode = evaluateMutationAuthority(owner, clusterSnapshot, nowMs, input.kind);
  if (refusalCode !== MUTATION_AUTHORITY_PERMITTED) {
    return {
      state: MANAGEMENT_OPERATION_STATE.REJECTED,
      reasonCode: refusalCode,
      updatedAtMs: nowMs,
    };
  }
  return preflight;
}

async function executeGuardedOperation(owner, input, args, nowMs) {
  if (input.kind === MANAGEMENT_OPERATION_KIND.DECOMMISSION_NODE) {
    return executeDecommission(owner, input, args.clusterSnapshot, nowMs);
  }
  const refusalCode = evaluateMutationAuthority(owner, args.clusterSnapshot, nowMs, input.kind);
  if (refusalCode !== MUTATION_AUTHORITY_PERMITTED) {
    if (input.kind === MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE &&
        !owner.rollingUpgradeOwner?.capabilitySupported) {
      return owner.rollingUpgradeOwner.startUpgrade(args);
    }
    if (input.kind === MANAGEMENT_OPERATION_KIND.CREATE_BACKUP &&
        !owner.backupRestoreOwner?.capabilitySupported) {
      return owner.backupRestoreOwner.createBackup(args);
    }
    return {
      state: MANAGEMENT_OPERATION_STATE.REJECTED,
      reasonCode: refusalCode,
      updatedAtMs: nowMs,
    };
  }
  if (input.kind === MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE) {
    return owner.rollingUpgradeOwner.startUpgrade(args);
  }
  return owner.backupRestoreOwner.createBackup(args);
}

class ManagementV1Owner {
  /**
   * @param {Object} [options] - Declared ports: getClusterId/onSetClusterId
   *   and getDeclaredFormationSize (the established cluster record),
   *   getClusterSnapshot, healthSnapshot,
   *   capacitySnapshot, storageAdapter, exportPartitionSnapshots,
   *   hydratePartitionSnapshots, onDrainNodeLeadership, onTriggerNodeRestart,
   *   onSetNodeReadyz, onPersistState, onDecommissionNode, supportEnvelope.
   *   A capability is supported only when its adapters are installed.
   */
  constructor(options = {}) {
    this.options = options;
    this.clusterId = options.clusterId ?? NULL_CLUSTER_ID;
    // The cluster-record port for the declared formation size; without one
    // the answer is the named UNAVAILABLE (no source), never a number.
    this.declaredFormationSizePort = options.getDeclaredFormationSize ??
      (() => readCachedDeclaredFormationSize(null));
    this.includeRestoredFromInFacts = options.includeRestoredFromInFacts ?? false;
    this.supportEnvelope =
      options.supportEnvelopeOwner?.getEnvelope?.() ??
      options.supportEnvelope ??
      null;
    this.decommissionSupported = typeof options.onDecommissionNode === FUNCTION_TYPE;
    this.rollingUpgradeOwner = options.rollingUpgradeOwner ?? new RollingUpgradeOwner({
      ...pickPorts(options, ROLLING_UPGRADE_PORTS),
      supportEnvelope: this.supportEnvelope,
    });
    this.backupRestoreOwner = options.backupRestoreOwner ?? createBackupRestoreOwner(this);
    this.operationsById = new Map();
  }

  /**
   * The established cluster identity, or null when none is established. It is
   * read from the cluster-record port when installed, never invented.
   * @return {string|null}
   */
  getClusterId() {
    const id = typeof this.options.getClusterId === FUNCTION_TYPE ?
      this.options.getClusterId() : this.clusterId;
    return isEstablishedClusterId(id) ? id : NULL_CLUSTER_ID;
  }

  /**
   * The declared formation size as the cluster-record port reads it (a
   * cache-served answer that names its read strategy), or UNAVAILABLE when
   * no port is installed. Never a number invented here.
   * @return {Object} {state, count, reason, readStrategy}.
   */
  getDeclaredFormationSize() {
    return this.declaredFormationSizePort();
  }

  getCapacityFacts() {
    return buildCapacity(readSnapshotPort(this.options.capacitySnapshot));
  }

  isVersionSkewActive() {
    return Boolean(this.rollingUpgradeOwner?.isVersionSkewActive?.());
  }

  getRestoreLineage() {
    return this.backupRestoreOwner?.getRestoredFrom?.() ?? NULL_RESTORE_LINEAGE;
  }

  hasActiveOperation() {
    for (const r of this.operationsById.values()) {
      this._refreshActiveOperation(r);
      const isOp = r.kind === MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE ||
        r.kind === MANAGEMENT_OPERATION_KIND.CREATE_BACKUP ||
        r.kind === MANAGEMENT_OPERATION_KIND.DECOMMISSION_NODE;
      const active = r.state === MANAGEMENT_OPERATION_STATE.ACCEPTED ||
        r.state === MANAGEMENT_OPERATION_STATE.IN_PROGRESS;
      if (isOp && active) return true;
    }
    return false;
  }

  /**
   * The runtime cluster snapshot for synchronous port callers, or null when the
   * runtime port is absent, asynchronous, or reports incomplete facts.
   * @return {Object|null}
   */
  getClusterSnapshot() {
    return overlayRuntimeSnapshot(this, readSnapshotPort(this.options.getClusterSnapshot));
  }

  /**
   * Resolve the runtime cluster snapshot across synchronous or asynchronous
   * canonical authority ports. Missing or incomplete evidence resolves to null.
   * @return {Promise<Object|null>}
   */
  async resolveClusterSnapshot() {
    const runtime = await readSnapshotPort(this.options.getClusterSnapshot);
    return overlayRuntimeSnapshot(this, runtime);
  }

  _refreshActiveOperation(record) {
    const active = record.state === MANAGEMENT_OPERATION_STATE.ACCEPTED ||
      record.state === MANAGEMENT_OPERATION_STATE.IN_PROGRESS;
    if (!active) return;
    const isRel = record.kind === MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE;
    const isBkp = record.kind === MANAGEMENT_OPERATION_KIND.CREATE_BACKUP;
    const up = isRel ? this.rollingUpgradeOwner?.getOperationStatus?.(record.operationId) :
      (isBkp ? this.backupRestoreOwner?.getOperationStatus?.(record.operationId) : null);
    applyUpdatedOperationStatus(record, up);
  }

  _formatStatus(r, isDup = false) {
    const c = MANAGEMENT_V1_CONTRACT;
    const res = {
      schemaVersion: c.SCHEMA_VERSION, sourceContract: c.SOURCE_CONTRACT,
      sourceContractVersion: c.SOURCE_CONTRACT_VERSION, operationId: r.operationId,
      lagrangeOperationId: r.lagrangeOperationId, kind: r.kind, state: r.state,
      reasonCode: r.reasonCode ?? NULL_REASON_CODE, updatedAtMs: r.updatedAtMs,
    };
    Object.defineProperty(res, PROPERTY_DUPLICATE, {
      value: isDup, enumerable: false, configurable: true, writable: true,
    });
    return res;
  }

  _preflightDecommission(nodeId, nowMs, clusterSnapshot = this.getClusterSnapshot()) {
    const ref = checkDecommissionPreflight(this, clusterSnapshot, nodeId);
    const rej = ref !== PREFLIGHT_PASSED;
    return {
      state: rej ? MANAGEMENT_OPERATION_STATE.REJECTED : MANAGEMENT_OPERATION_STATE.ACCEPTED,
      reasonCode: rej ? ref : NULL_REASON_CODE, updatedAtMs: nowMs,
    };
  }

  async _executeOperation(input, nowMs) {
    const c = MANAGEMENT_V1_CONTRACT;
    const isNoop = input.kind === MANAGEMENT_OPERATION_KIND.NOOP;
    const pfx = isNoop ? c.NOOP_OPERATION_ID_PREFIX : c.OPERATION_ID_PREFIX;
    const opId = `${pfx}${input.operationId}`;
    let res;
    if (isNoop) {
      res = {
        state: MANAGEMENT_OPERATION_STATE.SUCCEEDED,
        reasonCode: NULL_REASON_CODE,
        updatedAtMs: nowMs,
      };
    } else {
      const clusterSnapshot = await this.resolveClusterSnapshot();
      const args = {
        operationId: input.operationId,
        lagrangeOperationId: opId,
        parameters: input.parameters,
        clusterSnapshot,
        nowMs,
      };
      res = await executeGuardedOperation(this, input, args, nowMs);
    }
    return {
      state: res.state,
      reasonCode: res.reasonCode ?? NULL_REASON_CODE,
      lagrangeOperationId: opId,
      updatedAtMs: res.updatedAtMs ?? nowMs,
    };
  }

  async submitOperation(input, {nowMs = Date.now()} = {}) {
    validateManagementV1OperationRequest(input);
    const clusterId = this.getClusterId();
    if (clusterId === NULL_CLUSTER_ID) {
      failValidation(
        MANAGEMENT_ERROR_CODE.CLUSTER_IDENTITY_UNESTABLISHED, HTTP_STATUS.SERVICE_UNAVAILABLE);
    }
    if (input.clusterId !== clusterId) {
      failValidation(MANAGEMENT_ERROR_CODE.CLUSTER_ID_MISMATCH, HTTP_STATUS.CONFLICT);
    }
    const ex = this.operationsById.get(input.operationId);
    if (ex) {
      if (isExistingConflict(ex, input)) {
        failValidation(MANAGEMENT_ERROR_CODE.OPERATION_CONFLICT, HTTP_STATUS.CONFLICT);
      }
      this._refreshActiveOperation(ex);
      return this._formatStatus(ex, true);
    }
    const out = await this._executeOperation(input, nowMs);
    const rec = {
      operationId: input.operationId, lagrangeOperationId: out.lagrangeOperationId,
      kind: input.kind, clusterId: input.clusterId, requestDigest: input.requestDigest,
      parameters: input.parameters, state: out.state,
      reasonCode: out.reasonCode ?? NULL_REASON_CODE, createdAtMs: nowMs,
      updatedAtMs: out.updatedAtMs ?? nowMs,
    };
    this.operationsById.set(input.operationId, rec);
    return this._formatStatus(rec, false);
  }

  getOperationStatus(id) {
    const c = MANAGEMENT_V1_CONTRACT;
    if (!isBoundedString(id, c.MIN_OPERATION_ID_LENGTH, c.MAX_OPERATION_ID_LENGTH)) {
      failValidation(MANAGEMENT_ERROR_CODE.OPERATION_VALUE_INVALID);
    }
    const rec = this.operationsById.get(id);
    if (!rec) failValidation(MANAGEMENT_ERROR_CODE.OPERATION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    this._refreshActiveOperation(rec);
    return this._formatStatus(rec, false);
  }

  _buildOperationsSection() {
    const c = {activeCount: 0, blockedCount: 0, failedCount: 0};
    for (const r of this.operationsById.values()) {
      this._refreshActiveOperation(r);
      const {state} = r;
      const act = state === MANAGEMENT_OPERATION_STATE.ACCEPTED ||
        state === MANAGEMENT_OPERATION_STATE.IN_PROGRESS;
      const blk =
        state === MANAGEMENT_OPERATION_STATE.REJECTED || state === OPERATION_STATE_BLOCKED;
      if (act) c.activeCount += 1;
      else if (blk) c.blockedCount += 1;
      else if (state === MANAGEMENT_OPERATION_STATE.FAILED) c.failedCount += 1;
    }
    return c;
  }

  getClusterFacts(opts = {}, resolvedSnapshot) {
    const nowMs = opts.nowMs ?? Date.now();
    const incLin = Boolean(opts.includeRestoredFromInFacts || this.includeRestoredFromInFacts);
    const missing = Array.isArray(opts.missingSections) ? opts.missingSections : EMPTY_STRING_ARRAY;
    const all = buildFacts(this, resolveFactsClusterSnapshot(this, resolvedSnapshot), incLin);
    const facts = {};
    for (const [k, sec] of Object.entries(all)) {
      if (!missing.includes(k)) facts[k] = sec;
    }
    const c = CLUSTER_FACTS_CONSTANTS;
    const v = MANAGEMENT_V1_CONTRACT;
    return {
      schemaVersion: v.SCHEMA_VERSION, sourceContract: v.SOURCE_CONTRACT,
      sourceContractVersion: v.SOURCE_CONTRACT_VERSION, observationId: randomUUID(),
      observedAtMs: nowMs,
      completeness: missing.length > 0 ? c.COMPLETENESS_PARTIAL : c.COMPLETENESS_COMPLETE,
      missing, facts,
    };
  }

  async readClusterFacts(opts = {}) {
    const snap = await this.resolveClusterSnapshot();
    return this.getClusterFacts(opts, snap);
  }

  async handleGetFactsRequest(_q, r) {
    return runHandler(r, () => this.readClusterFacts(), HTTP_STATUS_INTERNAL_ERROR);
  }

  async handlePostOperationRequest(q, r) {
    return runHandler(r, () => {
      checkPayloadSize(q);
      return this.submitOperation(q.body || {});
    }, HTTP_STATUS.BAD_REQUEST);
  }

  async handleGetOperationStatusRequest(q, r) {
    const id = q.params?.operationId;
    return runHandler(r, () => this.getOperationStatus(id), HTTP_STATUS.NOT_FOUND);
  }
}

export {
  ManagementV1Owner,
  computeCanonicalOperationDigest,
  validateManagementV1OperationRequest,
};
