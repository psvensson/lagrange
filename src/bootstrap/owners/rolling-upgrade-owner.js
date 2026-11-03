import {
  CLUSTER_FACTS_CONSTANTS as FACTS,
  L4_ROLLING_UPGRADE_REASON_CODE as L4_CODE,
  L4_UPGRADE_NODE_STEP as NODE_STEP,
  MANAGEMENT_OPERATION_KIND as OP_KIND,
  MANAGEMENT_OPERATION_STATE as OP_STATE,
  MANAGEMENT_V1_CONTRACT,
  TERMINAL_MANAGEMENT_OPERATION_STATES as TERM_STATES,
} from './management-v1-constants.js';
import {
  evaluateRollbackEligibility,
  validateVersionPairAdmission,
} from './support-envelope-owner.js';

const UNSET = null;
const ARTIFACT_SHA256_PREFIX = 'sha256:';
const SEMVER_SEPARATOR_DOT = '.';
const FUNCTION_TYPE = 'function';
const SEMVER_PARTS_COUNT = 3;
const ARTIFACT_DIGEST_MIN_LENGTH = 10;
const D_VER = MANAGEMENT_V1_CONTRACT.DEFAULT_RELEASE_VERSION;
const D_DIG = MANAGEMENT_V1_CONTRACT.DEFAULT_ARTIFACT_DIGEST;
const D_TIMEOUT = MANAGEMENT_V1_CONTRACT.DEFAULT_NODE_UPGRADE_TIMEOUT_MS;
const PREFLIGHT_SUCCESS = Object.freeze({ok: true, valid: true, reasonCode: UNSET});
const OWNER_DEFAULTS = Object.freeze({
  currentVersion: D_VER, currentArtifactDigest: D_DIG,
  isVersionCompatible: defaultIsVersionCompatible, nodeUpgradeTimeoutMs: D_TIMEOUT,
  onDrainNodeLeadership: UNSET, onSetNodeReadyz: UNSET,
  onTriggerNodeRestart: UNSET, onPersistState: UNSET, activeOperation: UNSET,
  nodePlan: UNSET, currentNodeIndex: -1, versionSkew: false,
  initialOperationState: OP_STATE.ACCEPTED, supportEnvelope: UNSET, exactVersionPair: UNSET,
});

function parseSemver(v) {
  if (typeof v !== 'string') return UNSET;
  const p = v.split(SEMVER_SEPARATOR_DOT).map((x) => Number(x));
  return p.length === SEMVER_PARTS_COUNT && p.every((n) => Number.isInteger(n) && n >= 0) ?
    p : UNSET;
}
function compareParsedSemver(v1, v2) {
  for (let i = 0; i < SEMVER_PARTS_COUNT; i += 1) {
    if (v1[i] !== v2[i]) return v1[i] > v2[i] ? 1 : -1;
  }
  return 0;
}
function defaultIsVersionCompatible(cVer, tVer) {
  const [c, t] = [parseSemver(cVer), parseSemver(tVer)];
  if (!c || !t) return false;
  return t[0] - c[0] >= 0 && t[0] - c[0] <= 1 && compareParsedSemver(t, c) >= 0;
}
function defaultVerifyArtifactDigest(tVer, tDig, expected) {
  if (typeof tDig !== 'string' || !tDig.startsWith(ARTIFACT_SHA256_PREFIX) ||
      tDig.length < ARTIFACT_DIGEST_MIN_LENGTH) return false;
  if (!expected) return true;
  const exp = expected instanceof Map ? expected.get(tVer) : expected[tVer];
  return !exp || tDig === exp;
}
function checkSafetyFailure(quorumHealthy, mixedVersionViolated) {
  return quorumHealthy === false ? L4_CODE.QUORUM_SAFETY_HALT :
    (mixedVersionViolated === true ? L4_CODE.MIXED_VERSION_INVARIANT_VIOLATED : UNSET);
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}
function resolveReadyCount(snap) {
  if (Array.isArray(snap.readyNodeIds)) return snap.readyNodeIds.length;
  return isCount(snap.readyNodeCount) ? snap.readyNodeCount : 0;
}
/** An absent or incomplete snapshot is never read as a ready cluster. */
function isSnapshotIncomplete(snap) {
  return !snap || !Array.isArray(snap.nodeIds) || snap.nodeIds.length === 0 ||
    !isCount(snap.underReplicatedPartitionCount);
}
function isClusterNotReady(snap) {
  return snap.ready === false || resolveReadyCount(snap) < snap.nodeIds.length;
}
function isOutsideSupportEnvelope(owner, targetVersion) {
  const configuredEnvelope = owner.supportEnvelope || owner.exactVersionPair;
  if (!configuredEnvelope) return false;
  const check = validateVersionPairAdmission(configuredEnvelope, {
    sourceVersion: owner.currentVersion,
    targetVersion,
  });
  return !check.admitted;
}
function findPreflightFailure(owner, params, snap) {
  const [tVer, tDig] = [params?.targetVersion, params?.targetArtifactDigest];
  if (!owner.capabilitySupported) return L4_CODE.UPGRADE_CAPABILITY_UNSUPPORTED;
  if (isSnapshotIncomplete(snap)) return L4_CODE.CLUSTER_NOT_READY;
  const hit = [
    [snap.hasActiveOperation === true || owner.hasActiveUpgrade(),
      L4_CODE.CONCURRENT_OPERATION_ACTIVE],
    [isOutsideSupportEnvelope(owner, tVer), L4_CODE.OUTSIDE_SUPPORT_ENVELOPE],
    [!owner.checkVersionCompatible(tVer), L4_CODE.RELEASE_VERSION_INCOMPATIBLE],
    [Boolean(tDig && !owner.checkArtifactDigest(tVer, tDig)), L4_CODE.ARTIFACT_DIGEST_MISMATCH],
    [isClusterNotReady(snap), L4_CODE.CLUSTER_NOT_READY],
    [snap.underReplicatedPartitionCount > 0, L4_CODE.UNDER_REPLICATED_PARTITIONS],
    [snap.capacityState === FACTS.CAPACITY_PRESSURED, L4_CODE.STORAGE_CAPACITY_PRESSURED],
  ].find(([failed]) => failed);
  return hit ? hit[1] : UNSET;
}
function isClusterAlreadyUpgraded(owner, nodeIds, tVer, tDig, snapSkew) {
  return nodeIds.every((id) => owner.nodeVersions[id] === tVer) &&
    (!tDig || owner.currentArtifactDigest === tDig) &&
    (snapSkew === false || !owner.isVersionSkewActive());
}
function transitionOperation(owner, state, reasonCode, timeMs) {
  if (!owner.activeOperation) return UNSET;
  Object.assign(owner.activeOperation, {
    state, reasonCode, updatedAtMs: timeMs, completedAtMs: timeMs,
  });
  owner.onPersistState?.(owner.getPersistedState());
  return owner.getOperationStatus(owner.activeOperation.operationId);
}
function touchActiveOp(owner, timeMs) {
  owner.activeOperation.state = OP_STATE.IN_PROGRESS;
  owner.activeOperation.updatedAtMs = timeMs;
  owner.onPersistState?.(owner.getPersistedState());
}
const failOp = (owner, code, t) => transitionOperation(owner, OP_STATE.FAILED, code, t);
const succOp = (owner, t) => transitionOperation(owner, OP_STATE.SUCCEEDED, UNSET, t);
function haltAndFail(owner, node, code, timeMs) {
  if (node) Object.assign(node, {step: NODE_STEP.HALTED, updatedAtMs: timeMs});
  return failOp(owner, code, timeMs);
}
function handleCatchUpLag(owner, node, options, timeMs) {
  const timeout = (timeMs - node.startedAtMs) > owner.nodeUpgradeTimeoutMs;
  if (options.failOnUnderReplicated === true || timeout) {
    return haltAndFail(owner, node, L4_CODE.UNDER_REPLICATED_PARTITIONS, timeMs);
  }
  node.updatedAtMs = timeMs;
  return owner.getOperationStatus(owner.activeOperation.operationId);
}
function buildOperationRecord(
  opId, lOpId, state, code, params, timeMs, comp = UNSET, plan = UNSET) {
  return {
    operationId: opId, lagrangeOperationId: lOpId || opId, kind: OP_KIND.TRANSITION_RELEASE,
    state, reasonCode: code, parameters: params ? {...params} : {}, nodePlan: plan,
    currentNodeIndex: -1, startedAtMs: timeMs, updatedAtMs: timeMs, completedAtMs: comp,
  };
}
function commitActiveOp(owner, opId, op) {
  owner.operations.set(opId, op);
  owner.activeOperation = op;
  owner.onPersistState?.(owner.getPersistedState());
  return op;
}
function restorePersistedCollections(owner, s) {
  Object.assign(owner, {
    nodeVersions: s.nodeVersions ? {...s.nodeVersions} : owner.nodeVersions,
    operations: new Map(s.operations || []),
    activeOperation: s.activeOperation ? {...s.activeOperation} : UNSET,
    nodePlan: s.nodePlan ? s.nodePlan.map((n) => ({...n})) : UNSET,
  });
  const op = owner.activeOperation;
  if (op) owner.operations.set(op.operationId, op);
}

class RollingUpgradeOwner {
  /**
   * @param {Object} [options] - Rolling upgrade is supported only when both
   *   physical ports, onDrainNodeLeadership and onTriggerNodeRestart, are
   *   installed; no option can claim the capability without them.
   */
  constructor(options = {}) {
    Object.assign(this, OWNER_DEFAULTS, options);
    this.capabilitySupported = typeof this.onDrainNodeLeadership === FUNCTION_TYPE &&
      typeof this.onTriggerNodeRestart === FUNCTION_TYPE;
    this.operations = new Map();
    this.drainingNodeIds = new Set();
    this.nodeVersions = {...(options.nodeVersions || {})};
    if (!options.verifyArtifactDigest) {
      this.verifyArtifactDigest = (v, d) =>
        defaultVerifyArtifactDigest(v, d, options.expectedArtifactDigests);
    }
    if (options.initialPersistedState) this.resumeFromPersistedState(options.initialPersistedState);
  }
  checkVersionCompatible(v) {
    return Boolean(v && this.isVersionCompatible(this.currentVersion, v));
  }
  checkArtifactDigest(v, d) {
    return Boolean(v && d && this.verifyArtifactDigest(v, d));
  }
  hasActiveUpgrade() {
    return Boolean(this.activeOperation && !TERM_STATES.includes(this.activeOperation.state));
  }
  evaluatePreflight(parameters, clusterSnapshot) {
    const code = findPreflightFailure(this, parameters, clusterSnapshot);
    return code ? {ok: false, valid: false, reasonCode: code} : PREFLIGHT_SUCCESS;
  }
  startUpgrade({operationId, lagrangeOperationId, parameters, clusterSnapshot, nowMs}) {
    const timeMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (this.operations.has(operationId)) return this.getOperationStatus(operationId);
    const snap = clusterSnapshot ?? UNSET;
    const code = findPreflightFailure(this, parameters, snap);
    if (code) {
      return commitActiveOp(this, operationId, buildOperationRecord(
        operationId, lagrangeOperationId, OP_STATE.REJECTED, code, parameters, timeMs, timeMs));
    }
    return this.initiatePlan(operationId, lagrangeOperationId, parameters, snap, timeMs);
  }
  initiatePlan(opId, lagrangeOpId, params, snap, timeMs) {
    const [tVer, tDig] = [params?.targetVersion, params?.targetArtifactDigest];
    const nodeIds = snap.nodeIds;
    for (const id of nodeIds) this.nodeVersions[id] = this.nodeVersions[id] || this.currentVersion;
    if (isClusterAlreadyUpgraded(this, nodeIds, tVer, tDig, snap.versionSkew)) {
      return commitActiveOp(this, opId, buildOperationRecord(
        opId, lagrangeOpId, OP_STATE.SUCCEEDED, UNSET, params, timeMs, timeMs));
    }
    this.nodePlan = nodeIds.map((id) => ({
      nodeId: id, step: NODE_STEP.PENDING, targetVersion: tVer,
      previousVersion: this.nodeVersions[id] || this.currentVersion,
      startedAtMs: timeMs, updatedAtMs: timeMs, readyzWithdrawn: false, leadershipDrained: false,
    }));
    this.currentNodeIndex = 0;
    const op = commitActiveOp(this, opId, buildOperationRecord(
      opId, lagrangeOpId, this.initialOperationState, UNSET, params, timeMs, UNSET, this.nodePlan));
    this.drainNodeAtIndex(0, timeMs);
    return op;
  }
  drainNodeAtIndex(index, timeMs) {
    const node = this.nodePlan?.[index];
    if (!node) return UNSET;
    Object.assign(node, {
      step: NODE_STEP.AWAITING_RESTART, leadershipDrained: true, readyzWithdrawn: true,
      startedAtMs: timeMs, updatedAtMs: timeMs,
    });
    this.drainingNodeIds.add(node.nodeId);
    this.onDrainNodeLeadership?.(node.nodeId);
    this.onSetNodeReadyz?.(node.nodeId, false);
    this.onTriggerNodeRestart?.(
      node.nodeId, node.targetVersion, this.activeOperation?.parameters?.targetArtifactDigest);
    return node;
  }
  beginNextNodeDrain(nowMs) {
    const timeMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (!this.activeOperation || this.currentNodeIndex < 0 || !this.nodePlan) return UNSET;
    const node = this.drainNodeAtIndex(this.currentNodeIndex, timeMs);
    if (node) touchActiveOp(this, timeMs);
    return node;
  }
  recordNodeRestarted(nodeId, {version, artifactDigest: _d, nowMs}) {
    const timeMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    const node = this.nodePlan?.find((n) => n.nodeId === nodeId);
    if (!node || !this.activeOperation) return UNSET;
    this.drainingNodeIds.delete(nodeId);
    if (version !== node.targetVersion) {
      return haltAndFail(this, node, L4_CODE.MIXED_VERSION_INVARIANT_VIOLATED, timeMs);
    }
    node.step = NODE_STEP.CATCHING_UP; node.updatedAtMs = timeMs;
    this.nodeVersions[nodeId] = version;
    touchActiveOp(this, timeMs);
    return node;
  }
  completeNodeCatchUp(nodeId, options = {}) {
    const timeMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const safety = checkSafetyFailure(
      options.quorumHealthy, options.mixedVersionInvariantViolated);
    const node = this.nodePlan?.find((n) => n.nodeId === nodeId);
    if (safety) return haltAndFail(this, node, safety, timeMs);
    if (!node || !this.activeOperation) return UNSET;
    if ((options.underReplicatedPartitionCount || 0) > 0) {
      return handleCatchUpLag(this, node, options, timeMs);
    }
    return this.finalizeCatchUp(node, timeMs);
  }
  finalizeCatchUp(node, timeMs) {
    this.onSetNodeReadyz?.(node.nodeId, true);
    Object.assign(node, {readyzWithdrawn: false, step: NODE_STEP.COMPLETED, updatedAtMs: timeMs});
    this.nodeVersions[node.nodeId] = node.targetVersion;
    this.currentNodeIndex += 1;
    if (this.nodePlan.every((n) => n.step === NODE_STEP.COMPLETED)) {
      const p = this.activeOperation.parameters;
      this.currentVersion = p?.targetVersion;
      if (p?.targetArtifactDigest) this.currentArtifactDigest = p.targetArtifactDigest;
      this.versionSkew = false; succOp(this, timeMs);
    }
    this.onPersistState?.(this.getPersistedState());
    return this.getOperationStatus(this.activeOperation.operationId);
  }
  checkTimeoutsAndSafety(options = {}) {
    const timeMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    if (!this.hasActiveUpgrade()) return UNSET;
    const safety = checkSafetyFailure(
      options.quorumHealthy, options.mixedVersionInvariantViolated);
    const node = this.getActiveNode();
    if (safety) return haltAndFail(this, node, safety, timeMs);
    if (node && (timeMs - node.startedAtMs) > this.nodeUpgradeTimeoutMs) {
      const isLag = (options.underReplicatedPartitionCount || 0) > 0;
      return haltAndFail(this, node,
        isLag ? L4_CODE.UNDER_REPLICATED_PARTITIONS : L4_CODE.NODE_UPGRADE_TIMEOUT, timeMs);
    }
    return UNSET;
  }
  getActiveNode() {
    const idx = this.currentNodeIndex;
    return (this.nodePlan && idx >= 0 && idx < this.nodePlan.length) ? this.nodePlan[idx] : UNSET;
  }
  pauseUpgrade(nowMs) {
    const t = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (this.activeOperation) this.activeOperation.updatedAtMs = t;
    const state = this.getPersistedState();
    this.onPersistState?.(state);
    return state;
  }
  resumeFromPersistedState(s, _nowMs) {
    if (!s) return UNSET;
    this.currentVersion = s.currentVersion || this.currentVersion;
    this.currentArtifactDigest = s.currentArtifactDigest || this.currentArtifactDigest;
    this.versionSkew = Boolean(s.versionSkew);
    restorePersistedCollections(this, s);
    const idx = this.nodePlan ? this.nodePlan.findIndex((n) => n.step !== NODE_STEP.COMPLETED) : -1;
    this.currentNodeIndex = idx >= 0 ? idx : (s.currentNodeIndex || -1);
    return this.activeOperation;
  }
  getPersistedState() {
    return {
      activeOperation: this.activeOperation ? {...this.activeOperation} : UNSET,
      operations: Array.from(this.operations.entries()),
      nodePlan: this.nodePlan ? this.nodePlan.map((n) => ({...n})) : UNSET,
      currentNodeIndex: this.currentNodeIndex, currentVersion: this.currentVersion,
      currentArtifactDigest: this.currentArtifactDigest, nodeVersions: {...this.nodeVersions},
      versionSkew: this.versionSkew,
    };
  }
  isVersionSkewActive() {
    if (new Set(Object.values(this.nodeVersions)).size > 1) return true;
    if (this.nodePlan && this.nodePlan.length > 0) {
      const done = this.nodePlan.filter((n) => n.step === NODE_STEP.COMPLETED).length;
      if (done >= 1 && done < this.nodePlan.length) return true;
    }
    return this.versionSkew === true;
  }
  getReleaseFacts() {
    return {
      version: this.currentVersion, artifactDigest: this.currentArtifactDigest,
      versionSkew: this.isVersionSkewActive(),
      rollingUpgrade: this.capabilitySupported ?
        FACTS.CAPABILITY_SUPPORTED : FACTS.CAPABILITY_UNSUPPORTED,
    };
  }
  getDrainingNodeIds() {
    return Array.from(this.drainingNodeIds);
  }
  isFeatureGateEnabled(minVersion) {
    if (!minVersion) return true;
    const target = this.activeOperation?.parameters?.targetVersion;
    if (this.isVersionSkewActive() && minVersion === target) return false;
    const [pMin, pCur] = [parseSemver(minVersion), parseSemver(this.currentVersion)];
    return Boolean(pMin && pCur && compareParsedSemver(pCur, pMin) >= 0);
  }
  getOperationStatus(opId) {
    const op = this.operations.get(opId) ||
      (this.activeOperation?.operationId === opId ? this.activeOperation : UNSET);
    return op ? {...op} : UNSET;
  }
  executeRollback(options = {}) {
    const configuredEnvelope = this.supportEnvelope || this.exactVersionPair || {
      versionPair: {
        sourceVersion: options.targetVersion || this.currentVersion,
        targetVersion: this.currentVersion,
      },
    };
    const eligibility = evaluateRollbackEligibility(configuredEnvelope, options);
    if (!eligibility.eligible) {
      return {
        message: eligibility.message,
        ok: false,
        reasonCode: eligibility.reasonCode,
        rollbackCutoff: eligibility.rollbackCutoff,
      };
    }
    this.currentVersion = eligibility.targetVersion;
    for (const nodeId of Object.keys(this.nodeVersions)) {
      this.nodeVersions[nodeId] = eligibility.targetVersion;
    }
    this.versionSkew = false;
    this.onPersistState?.(this.getPersistedState());
    return {
      message: eligibility.message,
      ok: true,
      reasonCode: UNSET,
      rollbackCutoff: eligibility.rollbackCutoff,
      targetVersion: eligibility.targetVersion,
    };
  }
}

export {RollingUpgradeOwner};
