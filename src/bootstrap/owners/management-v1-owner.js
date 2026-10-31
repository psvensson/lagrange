import {randomUUID} from 'node:crypto';
import {HTTP_STATUS} from '../../constants/index.js';
import {
  CLUSTER_FACTS_CONSTANTS,
  L6_DECOMMISSION_REASON_CODE,
  MANAGEMENT_ERROR_CODE,
  MANAGEMENT_OPERATION_KIND,
  MANAGEMENT_OPERATION_STATE,
  MANAGEMENT_V1_CONTRACT,
  MANAGEMENT_V1_ROUTE,
} from './management-v1-constants.js';
import {RollingUpgradeOwner} from './rolling-upgrade-owner.js';
import {BackupRestoreOwner} from './backup-restore-owner.js';
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
const DEFAULT_PRIMARY_CLUSTER_ID = 'lagrange-cluster-primary';
const OPERATION_STATE_BLOCKED = 'BLOCKED';
const MIN_QUORUM_SAFE_NODE_COUNT = 2;

const RESTORE_FENCED_HEALTH = Object.freeze({
  state: CLUSTER_FACTS_CONSTANTS.HEALTH_UNAVAILABLE,
  ready: false,
  reasons: RESTORE_HYDRATION_REASONS,
});

function checkDecommissionPreflight(owner, snap, id) {
  const c = L6_DECOMMISSION_REASON_CODE;
  if (owner.options.decommissionSupported === false) return c.DECOMMISSION_CAPABILITY_UNSUPPORTED;
  if (owner.hasActiveOperation()) return c.CONCURRENT_OPERATION_ACTIVE;
  if (snap.underReplicatedPartitionCount > 0) return c.UNDER_REPLICATED_PARTITIONS;
  if (Array.isArray(snap.nodes) && snap.nodes.length > 0 && !snap.nodes.includes(id)) {
    return c.NODE_NOT_FOUND;
  }
  const unsafe = (snap.nodeCount ?? 1) <= MIN_QUORUM_SAFE_NODE_COUNT ||
    (typeof snap.isQuorumSafe === 'function' && !snap.isQuorumSafe(id));
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
  const status = error.statusCode || error.status || defaultStatus;
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

function buildHealth(bkp, custom) {
  if (isBackupFencingReadiness(bkp)) return RESTORE_FENCED_HEALTH;
  const src = custom || {};
  return {
    state: src.state || CLUSTER_FACTS_CONSTANTS.HEALTH_HEALTHY,
    ready: src.ready !== false,
    reasons: src.reasons || EMPTY_REASONS,
  };
}

function buildCapacity(cap) {
  const src = cap || {};
  return {
    state: src.state || CLUSTER_FACTS_CONSTANTS.CAPACITY_NORMAL,
    reasons: src.reasons || EMPTY_REASONS,
  };
}

function resolveCapabilityState(supported) {
  return supported ?
    CLUSTER_FACTS_CONSTANTS.CAPABILITY_SUPPORTED :
    CLUSTER_FACTS_CONSTANTS.CAPABILITY_UNSUPPORTED;
}

function buildReleaseSection(rel) {
  const v = MANAGEMENT_V1_CONTRACT;
  return {
    version: rel?.version || v.DEFAULT_RELEASE_VERSION,
    artifactDigest: rel?.artifactDigest || v.DEFAULT_ARTIFACT_DIGEST,
  };
}

function buildClusterSection(owner, incLin) {
  const identity = owner.getClusterId();
  const lin = owner.getRestoreLineage();
  return lin && incLin ? {identity, restoredFrom: lin} : {identity};
}

function buildFacts(owner, incLin) {
  const snap = owner.getClusterSnapshot();
  const cap = owner.options.capacitySnapshot?.() || owner.options.capacity;
  const h = owner.options.healthSnapshot?.() || owner.options.health;
  return {
    cluster: buildClusterSection(owner, incLin),
    release: buildReleaseSection(owner.rollingUpgradeOwner?.getReleaseFacts?.()),
    health: buildHealth(owner.backupRestoreOwner, h),
    topology: {
      nodeCount: snap.nodeCount, readyNodeCount: snap.readyNodeCount,
      underReplicatedPartitionCount: snap.underReplicatedPartitionCount,
      versionSkew: snap.versionSkew,
    },
    operations: owner._buildOperationsSection(),
    capacity: buildCapacity(cap),
    capabilities: {
      backupRestore: resolveCapabilityState(owner.backupRestoreOwner?.capabilitySupported),
      rollingUpgrade: resolveCapabilityState(owner.rollingUpgradeOwner?.capabilitySupported),
    },
  };
}

function isExistingConflict(ex, input) {
  return ex.requestDigest !== input.requestDigest ||
    ex.kind !== input.kind || ex.clusterId !== input.clusterId;
}

function resolveNodeList(opts) {
  return opts.nodeIds || opts.nodes || EMPTY_STRING_ARRAY;
}

function resolveDrainingCount(upg) {
  const ids = upg?.getDrainingNodeIds?.();
  return Array.isArray(ids) ? ids.length : 0;
}

class ManagementV1Owner {
  constructor(options = {}) {
    this.options = options;
    this.clusterId = options.clusterId ?? null;
    this.includeRestoredFromInFacts = options.includeRestoredFromInFacts ?? false;
    this.rollingUpgradeOwner = options.rollingUpgradeOwner ?? new RollingUpgradeOwner(options);
    this.backupRestoreOwner = options.backupRestoreOwner ?? new BackupRestoreOwner({
      ...options,
      getClusterId: () => this.getClusterId(),
      onSetClusterId: (id) => {
        this.clusterId = id;
        options.onSetClusterId?.(id);
      },
    });
    this.operationsById = new Map();
  }

  getClusterId() {
    return typeof this.options.getClusterId === 'function' ?
      this.options.getClusterId() : (this.clusterId || DEFAULT_PRIMARY_CLUSTER_ID);
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

  getClusterSnapshot() {
    if (typeof this.options.getClusterSnapshot === 'function') {
      return this.options.getClusterSnapshot();
    }
    const opts = this.options;
    const n = opts.nodeCount ?? 1;
    const baseReady = opts.readyNodeCount ?? n;
    const nodeList = resolveNodeList(opts);
    return {
      clusterId: this.getClusterId(),
      ready: opts.ready !== false && !isBackupFencingReadiness(this.backupRestoreOwner),
      hasPartitionQuorum: opts.hasPartitionQuorum !== false,
      capacityState: opts.capacity?.state || CLUSTER_FACTS_CONSTANTS.CAPACITY_NORMAL,
      hasActiveOperation: this.hasActiveOperation(),
      nodeCount: n,
      readyNodeCount: Math.max(0, baseReady - resolveDrainingCount(this.rollingUpgradeOwner)),
      underReplicatedPartitionCount: opts.underReplicatedPartitionCount ?? 0,
      nodes: nodeList,
      nodeIds: nodeList,
      versionSkew: Boolean(this.rollingUpgradeOwner?.isVersionSkewActive?.()),
    };
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

  _preflightDecommission(nodeId, nowMs) {
    const ref = checkDecommissionPreflight(this, this.getClusterSnapshot(), nodeId);
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
    const args = {
      operationId: input.operationId, lagrangeOperationId: opId, parameters: input.parameters,
      clusterSnapshot: this.getClusterSnapshot(), nowMs,
    };
    let res;
    if (isNoop) {
      res = {
        state: MANAGEMENT_OPERATION_STATE.SUCCEEDED,
        reasonCode: NULL_REASON_CODE, updatedAtMs: nowMs,
      };
    } else if (input.kind === MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE) {
      res = this.rollingUpgradeOwner.startUpgrade(args);
    } else if (input.kind === MANAGEMENT_OPERATION_KIND.CREATE_BACKUP) {
      res = await this.backupRestoreOwner.createBackup(args);
    } else {
      res = this._preflightDecommission(input.parameters.lagrangeNodeId, nowMs);
    }
    return {
      state: res.state, reasonCode: res.reasonCode ?? NULL_REASON_CODE,
      lagrangeOperationId: opId, updatedAtMs: res.updatedAtMs ?? nowMs,
    };
  }

  async submitOperation(input, {nowMs = Date.now()} = {}) {
    validateManagementV1OperationRequest(input);
    if (input.clusterId !== this.getClusterId()) {
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

  getClusterFacts(opts = {}) {
    const nowMs = opts.nowMs ?? Date.now();
    const incLin = Boolean(opts.includeRestoredFromInFacts || this.includeRestoredFromInFacts);
    const missing = Array.isArray(opts.missingSections) ? opts.missingSections : EMPTY_STRING_ARRAY;
    const all = buildFacts(this, incLin);
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

  async handleGetFactsRequest(_q, r) {
    return runHandler(r, () => this.getClusterFacts(), HTTP_STATUS_INTERNAL_ERROR);
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

  registerRoutes(fastify) {
    fastify.get(MANAGEMENT_V1_ROUTE.FACTS, async (q, r) => this.handleGetFactsRequest(q, r));
    fastify.post(MANAGEMENT_V1_ROUTE.OPERATIONS, async (q, r) =>
      this.handlePostOperationRequest(q, r));
    fastify.get(MANAGEMENT_V1_ROUTE.OPERATION_BY_ID, async (q, r) =>
      this.handleGetOperationStatusRequest(q, r));
  }
}

export {
  ManagementV1Owner,
  computeCanonicalOperationDigest,
  validateManagementV1OperationRequest,
};
