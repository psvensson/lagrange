// Public entry: summarizeCopyOccupancy, saturatedTargetsOf, isCopyWithinCapacity, recordAdmittedCopyOccupancy, classifyNodeStorageExclusion, COPY_MOVE_TYPES, buildTargetCapacityRanker, computeCopyWaitingDemand, buildPassOrderedCandidates, evaluatePassBudgetsForController, createControlPlanePlacementNodeObservationReader.
// Required collaborators: none (pure functions of the census and the candidate).
// Durable authority / commit point: none - the ledger's apply arbitrates copy capacity.
// Permitted post-commit work: none.
// Recovery / wake entry: none.
// Representative production tests: test/rebalancer/replica-placement-owner-core.test.js.
//
// The replica placement owner's copy-capacity view of one pass (owner
// decision D2: K_src copies per source, K_tgt per target): the copy-phase
// occupancy of the census, the saturated targets, whether a copy candidate
// fits, the occupancy after an admission, and a node's storage exclusion.
import {COLUMN, TABLES} from '../constants/index.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-record-decision.js';
import {isOccupyingCopy} from '../partition/partition-placement-admission-decision.js';
import {OperationType} from './replica-operation-progress.js';
import {PRESSURE_STATE} from './storage-capacity-constants.js';
import {resolveSourceCapacityForClass} from './replica-placement-owner-admission-statement.js';
import {isFunction} from './replica-placement-owner-collaborators.js';
import {PLACEMENT_COPY_CAPACITY, PLACEMENT_WAITING_REASON} from
  './replica-placement-owner-constants.js';
import {PLACEMENT_DEFICIT_STATE, readPlacementNodeInputs, repairSourceNodeIdsOf} from
  './replica-placement-owner-deficits.js';
import {formationWaitingReasonOf, orderPlacementCandidates} from
  './replica-placement-owner-order.js';

const COPY_MOVE_TYPES = Object.freeze(new Set([OperationType.ADD, OperationType.REPLACE]));
const TARGET_CAPACITY_SCORE_WEIGHT = 1_000;
const PERCENT_DIVISOR = 100;
const BYTES_PER_MIB = 1024 * 1024;
const ROLE_SOURCE = 'source';
const ROLE_TARGET = 'target';
const HARD_MEMORY_REASON = 'HARD_MEMORY_LIMIT_REACHED';
const PLACEMENT_OWNER_UNAVAILABLE_REASON = 'placement_owner_unavailable';

function buildTargetCapacityRanker(budgetSnapshot, eligibleNodeIds = []) {
  if (!budgetSnapshot) return null;
  const budgets = eligibleNodeIds.map((id) => budgetSnapshot.targetBudgetOf(id));
  const hasHeterogeneousBudgets =
    budgets.length > 1 && budgets.some((b) => b !== budgets[0]);
  if (!hasHeterogeneousBudgets) return null;
  return (nodeId) =>
    (budgetSnapshot.targetRemainingCapacityScore(nodeId) * TARGET_CAPACITY_SCORE_WEIGHT) +
    budgetSnapshot.targetRemainingSlots(nodeId);
}

function computeCopyWaitingDemand(evaluations, formation) {
  const waitingBySource = new Map();
  const waitingByTarget = new Map();
  for (const {isBusy, evaluation} of evaluations) {
    if (isBusy || evaluation.state !== PLACEMENT_DEFICIT_STATE.CANDIDATE) continue;
    const {candidate} = evaluation;
    if (formationWaitingReasonOf(candidate.placementClass, formation) !== null) continue;
    if (!COPY_MOVE_TYPES.has(candidate.move.type)) continue;
    const src = candidate.move.copySourceNodeId;
    const tgt = candidate.move.targetNodeId;
    if (typeof src === 'string' && src.length > 0) {
      waitingBySource.set(src, (waitingBySource.get(src) ?? 0) + 1);
    }
    if (typeof tgt === 'string' && tgt.length > 0) {
      waitingByTarget.set(tgt, (waitingByTarget.get(tgt) ?? 0) + 1);
    }
  }
  return {waitingBySource, waitingByTarget};
}

function summarizeCopyOccupancy(census) {
  const copies = census.filter(isOccupyingCopy);
  const bySource = new Map();
  const byTarget = new Map();
  let unrecordedSourceCopies = 0;
  for (const row of copies) {
    if (row.copySourceNodeId === null) {
      unrecordedSourceCopies += 1;
    } else {
      bySource.set(row.copySourceNodeId, (bySource.get(row.copySourceNodeId) ?? 0) + 1);
    }
    byTarget.set(row.targetNodeId, (byTarget.get(row.targetNodeId) ?? 0) + 1);
  }
  return {copies, bySource, byTarget, unrecordedSourceCopies};
}

function sourceLimitOf(nodeId, budgetSnapshot = null) {
  const limit = budgetSnapshot?.sourceBudgetOf?.(nodeId);
  return Number.isSafeInteger(limit) && limit >= 0 ?
    limit :
    PLACEMENT_COPY_CAPACITY.K_SRC;
}

function targetLimitOf(nodeId, budgetSnapshot = null) {
  const limit = budgetSnapshot?.targetBudgetOf?.(nodeId);
  return Number.isSafeInteger(limit) && limit >= 0 ?
    limit :
    PLACEMENT_COPY_CAPACITY.K_TGT;
}

function saturatedTargetsOf(byTarget, budgetSnapshot = null, eligibleNodeIds = []) {
  const saturated = new Set();
  const candidates = new Set([
    ...byTarget.keys(),
    ...(Array.isArray(eligibleNodeIds) ? eligibleNodeIds : []),
  ]);
  for (const nodeId of candidates) {
    const count = byTarget.get(nodeId) ?? 0;
    if (count >= targetLimitOf(nodeId, budgetSnapshot)) saturated.add(nodeId);
  }
  return saturated;
}

function isCopyWithinCapacity(
  candidate,
  repairWaitingSourceNodeIds,
  occupancy,
  budgetSnapshot = null,
) {
  const kSrc = sourceLimitOf(candidate.move.copySourceNodeId, budgetSnapshot);
  const kTgt = targetLimitOf(candidate.move.targetNodeId, budgetSnapshot);
  if (kSrc <= 0 || kTgt <= 0) return false;
  const kSrcForClass = resolveSourceCapacityForClass({
    placementClass: candidate.placementClass,
    repair: candidate.repair,
    copySourceNodeId: candidate.move.copySourceNodeId,
    repairWaitingSourceNodeIds,
    kSrc,
  });
  const sourceOcc = occupancy.unrecordedSourceCopies +
    (occupancy.bySource.get(candidate.move.copySourceNodeId) ?? 0);
  const targetOcc = occupancy.byTarget.get(candidate.move.targetNodeId) ?? 0;
  return sourceOcc < kSrcForClass && targetOcc < kTgt;
}

function recordAdmittedCopyOccupancy(
  candidate,
  occupancy,
  saturatedTargets,
  budgetSnapshot = null,
) {
  if (!COPY_MOVE_TYPES.has(candidate.move.type)) return 0;
  occupancy.bySource.set(
    candidate.move.copySourceNodeId,
    (occupancy.bySource.get(candidate.move.copySourceNodeId) ?? 0) + 1,
  );
  const nextTargetOcc = (occupancy.byTarget.get(candidate.move.targetNodeId) ?? 0) + 1;
  occupancy.byTarget.set(candidate.move.targetNodeId, nextTargetOcc);
  if (nextTargetOcc >= targetLimitOf(candidate.move.targetNodeId, budgetSnapshot)) {
    saturatedTargets.add(candidate.move.targetNodeId);
  }
  return 1;
}

function classifyNodeStorageExclusion(identity) {
  const capacity = identity?.projection?.capacity;
  if (!capacity || capacity.budgetBytes === null) {
    return PLACEMENT_WAITING_REASON.TARGET_STORAGE_UNKNOWN;
  }
  if (capacity.pressureState === PRESSURE_STATE.HARD ||
      capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
    return PLACEMENT_WAITING_REASON.TARGET_STORAGE_CONSTRAINED;
  }
  return null;
}

function buildPassOrderedCandidates(evaluations, inputsByPartition, formation) {
  const repairWaitingSourceNodeIds = repairSourceNodeIdsOf(
    evaluations.filter((e) => !e.isBusy).map((e) => e.evaluation),
  );
  const admissible = [];
  const formationWaiting = [];
  for (const {partitionId, evaluation} of evaluations) {
    if (evaluation.state !== PLACEMENT_DEFICIT_STATE.CANDIDATE) continue;
    const waitReason = formationWaitingReasonOf(
      evaluation.candidate.placementClass,
      formation,
    );
    if (waitReason === null) admissible.push(evaluation.candidate);
    else formationWaiting.push({partitionId, reason: waitReason});
  }
  return {
    ordered: orderPlacementCandidates(admissible),
    inputsByPartition,
    repairWaitingSourceNodeIds,
    evaluations,
    formationWaiting,
  };
}

function countLogicalNodesPerHost(eligibility) {
  const counts = new Map();
  if (!eligibility?.declaredHosts) return counts;
  for (const hostId of eligibility.declaredHosts.values()) {
    counts.set(hostId, (counts.get(hostId) ?? 0) + 1);
  }
  return counts;
}

function resolveHostLogicalNodeCount(nodeId, declaredHosts, nodesPerHost) {
  const hostId = declaredHosts?.get?.(nodeId);
  return hostId ? (nodesPerHost.get(hostId) ?? 1) : 1;
}

function buildEffectiveTargetObservation(obs, storageConstrained, nowMs) {
  if (!storageConstrained) return obs;
  return obs ?
    {...obs, storageHardConstrained: true} :
    {storageHardConstrained: true, sampledAtMs: nowMs};
}

function evaluateSourceNodeDecision({
  nodeId, sourceStates, getObservationFor, occupancy, waitingBySource,
  nodeBoots, declaredHosts, nodesPerHost, nowMs, sourceConfig, decideWindow,
}) {
  const sourceOcc = (occupancy?.unrecordedSourceCopies ?? 0) +
    (occupancy?.bySource?.get(nodeId) ?? 0);
  const decision = decideWindow(
    sourceStates.get(nodeId) || null,
    getObservationFor(nodeId, ROLE_SOURCE, nowMs),
    {
      occupancy: sourceOcc,
      waitingDemandCount: waitingBySource.get(nodeId) ?? 0,
      nowMs,
      expectedBootIncarnation: nodeBoots.get(nodeId) ?? null,
      hostLogicalNodeCount: resolveHostLogicalNodeCount(nodeId, declaredHosts, nodesPerHost),
    },
    sourceConfig,
  );
  sourceStates.set(nodeId, decision.nextState);
  return decision;
}

function evaluateTargetNodeDecision({
  nodeId, targetStates, getObservationFor, occupancy, waitingByTarget,
  storageExcludedTargets, hardExcludedTargets, nodeBoots, declaredHosts,
  nodesPerHost, nowMs, targetConfig, decideWindow,
}) {
  const effectiveObs = buildEffectiveTargetObservation(
    getObservationFor(nodeId, ROLE_TARGET, nowMs),
    storageExcludedTargets.has(nodeId),
    nowMs,
  );
  const decision = decideWindow(
    targetStates.get(nodeId) || null,
    effectiveObs,
    {
      occupancy: occupancy?.byTarget?.get(nodeId) ?? 0,
      waitingDemandCount: waitingByTarget.get(nodeId) ?? 0,
      nowMs,
      expectedBootIncarnation: nodeBoots.get(nodeId) ?? null,
      hostLogicalNodeCount: resolveHostLogicalNodeCount(nodeId, declaredHosts, nodesPerHost),
    },
    targetConfig,
  );
  targetStates.set(nodeId, decision.nextState);
  if (!decision.hardAdmissionAllowed && !hardExcludedTargets.has(nodeId)) {
    const exclusionReason = decision.reason === HARD_MEMORY_REASON ?
      PLACEMENT_WAITING_REASON.TARGET_MEMORY_CONSTRAINED :
      PLACEMENT_WAITING_REASON.TARGET_STORAGE_CONSTRAINED;
    hardExcludedTargets.set(nodeId, exclusionReason);
  }
  return decision;
}

function buildPassBudgetSnapshot({
  sourceDecisions, targetDecisions, hardExcludedTargets, occupancy,
  currentSourceBudgetOf, currentTargetBudgetOf,
}) {
  return Object.freeze({
    sourceDecisions,
    targetDecisions,
    hardExcludedTargets,
    sourceBudgetOf(nodeId) {
      const decision = sourceDecisions.get(nodeId);
      if (!decision) return currentSourceBudgetOf(nodeId);
      return decision.hardAdmissionAllowed ? decision.limit : 0;
    },
    targetBudgetOf(nodeId) {
      const decision = targetDecisions.get(nodeId);
      if (!decision) return currentTargetBudgetOf(nodeId);
      return decision.hardAdmissionAllowed ? decision.limit : 0;
    },
    targetRemainingCapacityScore(nodeId) {
      const budget = this.targetBudgetOf(nodeId);
      if (budget <= 0) return -1;
      const occ = occupancy?.byTarget?.get(nodeId) ?? 0;
      return Math.max(0, budget - occ) / budget;
    },
    targetRemainingSlots(nodeId) {
      const budget = this.targetBudgetOf(nodeId);
      if (budget <= 0) return 0;
      const occ = occupancy?.byTarget?.get(nodeId) ?? 0;
      return Math.max(0, budget - occ);
    },
  });
}

function collectRoleNodeIds(eligibleIds, occupancyMap, waitingMap) {
  const keys = occupancyMap ? occupancyMap.keys() : [];
  return new Set([...eligibleIds, ...keys, ...waitingMap.keys()]);
}

function normalizePassEligibility(nodeInput) {
  const eligibility = nodeInput ? nodeInput.eligibility : null;
  if (!eligibility) {
    return {
      nodeBoots: new Map(),
      declaredHosts: new Map(),
      nodesPerHost: new Map(),
      eligibleIds: [],
    };
  }
  return {
    nodeBoots: eligibility.nodeBoots || new Map(),
    declaredHosts: eligibility.declaredHosts || new Map(),
    nodesPerHost: countLogicalNodesPerHost(eligibility),
    eligibleIds: eligibility.eligibleNodeIds || [],
  };
}

function evaluatePassBudgetsForController(state, {
  nodeInput, occupancy, waitingBySource = new Map(), waitingByTarget = new Map(),
  storageExcludedTargets = new Map(), nowMs = 0,
}) {
  const {nodeBoots, declaredHosts, nodesPerHost, eligibleIds} =
    normalizePassEligibility(nodeInput);
  const bySource = occupancy ? occupancy.bySource : null;
  const byTarget = occupancy ? occupancy.byTarget : null;
  const allSourceNodes = collectRoleNodeIds(eligibleIds, bySource, waitingBySource);
  const allTargetNodes = collectRoleNodeIds(eligibleIds, byTarget, waitingByTarget);
  const sourceDecisions = new Map();
  const targetDecisions = new Map();
  const hardExcludedTargets = new Map(storageExcludedTargets);
  const ctx = {
    ...state, occupancy, waitingBySource, waitingByTarget, storageExcludedTargets,
    hardExcludedTargets, nodeBoots, declaredHosts, nodesPerHost, nowMs,
  };
  for (const nodeId of allSourceNodes) {
    sourceDecisions.set(nodeId, evaluateSourceNodeDecision({...ctx, nodeId}));
  }
  for (const nodeId of allTargetNodes) {
    targetDecisions.set(nodeId, evaluateTargetNodeDecision({...ctx, nodeId}));
  }
  return buildPassBudgetSnapshot({
    sourceDecisions, targetDecisions, hardExcludedTargets, occupancy,
    currentSourceBudgetOf: state.currentSourceBudgetOf,
    currentTargetBudgetOf: state.currentTargetBudgetOf,
  });
}

function hasExplicitFiniteMetric(rawValue) {
  return rawValue !== null &&
    rawValue !== undefined &&
    typeof rawValue !== 'boolean' &&
    Number.isFinite(Number(rawValue));
}

function readNodeRowAvailableMemoryBytes(nodeRow) {
  if (!nodeRow ||
      !hasExplicitFiniteMetric(nodeRow.memory_mb) ||
      !hasExplicitFiniteMetric(nodeRow.memory_usage_percent)) {
    return undefined;
  }
  const memoryMb = Number(nodeRow.memory_mb);
  const usagePct = Number(nodeRow.memory_usage_percent);
  if (memoryMb <= 0 || usagePct < 0) return undefined;
  const totalBytes = memoryMb * BYTES_PER_MIB;
  return Math.max(0, Math.floor(totalBytes * (1 - (usagePct / PERCENT_DIVISOR))));
}

function resolveLocalDiagnosticsSampleStamp(latest, nowMs) {
  const reportTimestamp = Number(latest?.timestamp);
  const sampledAtMs = Number.isFinite(reportTimestamp) && reportTimestamp > 0 ?
    reportTimestamp :
    nowMs;
  const rawSampleId = latest?.sampleId;
  const sampleId = Number.isSafeInteger(rawSampleId) ? rawSampleId : null;
  return {sampledAtMs, sampleId};
}

function readLocalDiagnosticsObservation(resourceDiagnosticsSampler, nodeRow, nowMs) {
  const report = resourceDiagnosticsSampler.getSharedReport();
  const proc = report?.latest ? report.latest.process : null;
  if (!proc) return null;
  const {sampledAtMs, sampleId} = resolveLocalDiagnosticsSampleStamp(report.latest, nowMs);
  const availableMemoryBytes = readNodeRowAvailableMemoryBytes(nodeRow);
  return {
    sampledAtMs,
    ...(sampleId !== null ? {sampleId, congestionEpochId: sampleId} : {}),
    bootIncarnation: nodeRow ? nodeRow[COLUMN.BOOT_INCARNATION] : null,
    singleCoreCpuPercent: proc.singleCoreCpuPercent,
    eventLoopDelayMs: proc.eventLoopDelayMs,
    eventLoopUtilizationPercent: proc.eventLoopUtilizationPercent,
    ...(availableMemoryBytes !== undefined ? {availableMemoryBytes} : {}),
  };
}

function readRemoteHeartbeatObservation(nodeRow) {
  if (!nodeRow || !hasExplicitFiniteMetric(nodeRow[COLUMN.LAST_HEARTBEAT])) return null;
  const sampledAtMs = Number(nodeRow[COLUMN.LAST_HEARTBEAT]);
  const availableMemoryBytes = readNodeRowAvailableMemoryBytes(nodeRow);
  const cpuUsagePercent = Number(nodeRow.cpu_usage_percent);
  const hasCpuUsage =
    hasExplicitFiniteMetric(nodeRow.cpu_usage_percent) && cpuUsagePercent >= 0;
  const pressureSensorsComplete = hasCpuUsage && availableMemoryBytes !== undefined;
  return {
    sampledAtMs,
    sampleId: sampledAtMs,
    congestionEpochId: sampledAtMs,
    bootIncarnation: nodeRow[COLUMN.BOOT_INCARNATION],
    pressureSensorsComplete,
    ...(availableMemoryBytes !== undefined ? {availableMemoryBytes} : {}),
    ...(hasCpuUsage ? {cpuUsagePercent} : {}),
  };
}

function createControlPlanePlacementNodeObservationReader({
  localNodeId,
  resourceDiagnosticsSampler,
  systemTableCache,
}) {
  return (targetNodeId, _role, nowMs, nodeRowOverride = null) => {
    const nodeRow = nodeRowOverride ?? (systemTableCache ?
      systemTableCache.get(TABLES.NODES, targetNodeId) :
      null);
    if (targetNodeId === localNodeId && resourceDiagnosticsSampler) {
      return readLocalDiagnosticsObservation(resourceDiagnosticsSampler, nodeRow, nowMs);
    }
    return readRemoteHeartbeatObservation(nodeRow);
  };
}

function isNonEmptyNodeId(nodeId) {
  return typeof nodeId === 'string' && nodeId.length > 0;
}

function pickExcludedTargetOrSourceValue(
  targetNodeId, hardExcludedTargets, sourceDecision, targetDecision,
) {
  if (targetDecision && targetDecision.hardAdmissionAllowed === false) {
    return hardExcludedTargets.get(targetNodeId) || targetDecision.reason || null;
  }
  return sourceDecision && sourceDecision.hardAdmissionAllowed === false ?
    (sourceDecision.reason || null) :
    null;
}

function summarizeMoveCopyDecisions(
  state, targetNodeId, hardExcludedTargets, sourceDecision, targetDecision,
) {
  const sourceAllowed = sourceDecision ? sourceDecision.hardAdmissionAllowed : true;
  const targetAllowed = targetDecision ? targetDecision.hardAdmissionAllowed : true;
  return Object.freeze({
    kSrc: sourceDecision ? sourceDecision.limit : state.sourceConfig.initialLimit,
    kTgt: targetDecision ? targetDecision.limit : state.targetConfig.initialLimit,
    hardAdmissionAllowed: sourceAllowed && targetAllowed,
    reason: pickExcludedTargetOrSourceValue(
      targetNodeId, hardExcludedTargets, sourceDecision, targetDecision,
    ),
    sourceDecision,
    targetDecision,
  });
}

function resolveMoveCopyLimitsForController(state, {
  copySourceNodeId,
  targetNodeId,
  nodeInput = null,
  occupancy = null,
  storageExcludedTargets = new Map(),
  nowMs = 0,
}) {
  const {nodeBoots, declaredHosts, nodesPerHost} = normalizePassEligibility(nodeInput);
  const hardExcludedTargets = new Map(storageExcludedTargets);
  const ctx = {
    ...state,
    occupancy,
    waitingBySource: new Map(),
    waitingByTarget: new Map(),
    storageExcludedTargets,
    hardExcludedTargets,
    nodeBoots,
    declaredHosts,
    nodesPerHost,
    nowMs,
  };
  const sourceDecision = isNonEmptyNodeId(copySourceNodeId) ?
    evaluateSourceNodeDecision({...ctx, nodeId: copySourceNodeId}) :
    null;
  const targetDecision = isNonEmptyNodeId(targetNodeId) ?
    evaluateTargetNodeDecision({...ctx, nodeId: targetNodeId}) :
    null;
  return summarizeMoveCopyDecisions(
    state, targetNodeId, hardExcludedTargets, sourceDecision, targetDecision,
  );
}

function readOwnerReadyNodeInput(owner, nowMs) {
  const nodeInput = owner?.nodeAuthority ?
    readPlacementNodeInputs(owner.nodeAuthority, nowMs) :
    null;
  return nodeInput?.state === SERVE_ELIGIBILITY_STATE.READY ? nodeInput : null;
}

function readOwnerStorageExclusionsForMove(owner, readyNodeInput, targetNodeId, nowMs) {
  const excluded = readyNodeInput && isFunction(owner?.readStorageExcludedTargets) ?
    owner.readStorageExcludedTargets(readyNodeInput, nowMs) :
    new Map();
  if (!excluded.has(targetNodeId) && owner?.storageAccountingService &&
      typeof targetNodeId === 'string') {
    const reason = classifyNodeStorageExclusion(
      owner.storageAccountingService.getCapacitySemanticIdentity(targetNodeId, nowMs),
    );
    if (reason !== null) excluded.set(targetNodeId, reason);
  }
  return excluded;
}

function resolveOwnerMoveCopyLimits(owner, move, nowMs) {
  if (!move || !COPY_MOVE_TYPES.has(move.type)) {
    return Object.freeze({
      kSrc: PLACEMENT_COPY_CAPACITY.K_SRC,
      kTgt: PLACEMENT_COPY_CAPACITY.K_TGT,
      hardAdmissionAllowed: true,
      reason: null,
    });
  }
  const controller = owner?.adaptiveBudgetController;
  if (!isFunction(controller?.resolveMoveCopyLimits)) {
    return Object.freeze({
      kSrc: null,
      kTgt: null,
      hardAdmissionAllowed: false,
      reason: PLACEMENT_OWNER_UNAVAILABLE_REASON,
    });
  }
  const readyNodeInput = readOwnerReadyNodeInput(owner, nowMs);
  const storageExcludedTargets = readOwnerStorageExclusionsForMove(
    owner, readyNodeInput, move.targetNodeId, nowMs,
  );
  return controller.resolveMoveCopyLimits({
    copySourceNodeId: move.copySourceNodeId,
    targetNodeId: move.targetNodeId,
    nodeInput: readyNodeInput,
    storageExcludedTargets,
    nowMs,
  });
}

export {
  COPY_MOVE_TYPES,
  buildPassOrderedCandidates,
  buildTargetCapacityRanker,
  classifyNodeStorageExclusion,
  computeCopyWaitingDemand,
  createControlPlanePlacementNodeObservationReader,
  evaluatePassBudgetsForController,
  isCopyWithinCapacity,
  readRemoteHeartbeatObservation,
  recordAdmittedCopyOccupancy,
  resolveMoveCopyLimitsForController,
  resolveOwnerMoveCopyLimits,
  saturatedTargetsOf,
  sourceLimitOf,
  summarizeCopyOccupancy,
  targetLimitOf,
};
