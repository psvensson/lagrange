import {UnifiedRebalancerBudgetPlanning} from './unified-rebalancer-budget-planning.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {readAllSharedRows} from '../cache/shared-row-read.js';
import {
  REPLICA_INVENTORY_OBSERVATION_STATE,
} from './replica-inventory-constants.js';
import {
  inheritPriorityRecoverySchedulingOwner,
} from '../control-plane/priority-recovery-scheduling-owner-policy.js';

const {
  EntityType,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE_TABLE,
  PRIORITY_RECOVERY_FOLLOW_UP_DECISION,
  PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT,
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_PARTITION_SELECTION_STATE_TABLE,
  PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
  buildPriorityRecoveryPartitionAssessment,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
} = SHARED;

const {buildPriorityRecoveryOperationContextFromRecord} =
  UNIFIED_REBALANCER_SHARED;
const {isReplicaOperationStale, normalizeReplicaOperationRecord} =
  UNIFIED_REBALANCER_SHARED;

const FOLLOW_UP_REQUIREMENT_STATE_TABLE = Object.freeze([
  Object.freeze([
    'createRecoveryOperation',
    PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT.CREATE_RECOVERY_OPERATION,
  ]),
  Object.freeze([
    'scheduleFollowupRebalance',
    PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT.SCHEDULE_FOLLOWUP_REBALANCE,
  ]),
  Object.freeze([
    'terminalFailedOperation',
    PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT.TERMINAL_FAILED_OPERATION,
  ]),
]);

function readPlanningDecisionSnapshots(planningSnapshot) {
  const snapshots =
    planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots;
  return Array.isArray(snapshots) ? snapshots : [];
}
function selectPriorityPartitionSummary(planningSnapshot) {
  return planningSnapshot.priorityPartitionSummary ||
    planningSnapshot.publicationRecoveryGate?.priorityPartitionSummary ||
    null;
}
function recordFollowUpSpreadGap(
  rebalancer,
  spreadGapByPartitionId,
  partitionId,
  rawSpreadGap,
  preserveExisting = false,
) {
  if (
    partitionId.length === 0 ||
    (preserveExisting && spreadGapByPartitionId.has(partitionId))
  ) {
    return;
  }
  const spreadGap =
    rebalancer.normalizePriorityRecoveryClosureWitnessFollowUpSpreadGap(
      rawSpreadGap,
    );
  if (
    spreadGap >
    PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY
      .SPREAD_GAP_UNAVAILABLE
  ) {
    spreadGapByPartitionId.set(partitionId, spreadGap);
  }
}
function isTerminalFailedFollowUpOperation(decisionSnapshot, semanticState) {
  const decision = PRIORITY_RECOVERY_FOLLOW_UP_DECISION;
  const field = PRIORITY_RECOVERY_FOLLOW_UP_FIELD;
  const eligibleNodeIds =
    decisionSnapshot?.[field.ELIGIBLE_NODE_IDS];
  return semanticState === decision.BLOCKED_UNCLASSIFIED &&
    decisionSnapshot?.[field.WORKFLOW_STATE] === decision.WORKFLOW_TERMINAL &&
    decisionSnapshot?.[field.LATEST_OPERATION_STATUS] === ReplicaStatus.FAILED &&
    Array.isArray(eligibleNodeIds) &&
    eligibleNodeIds.length > 0;
}
function buildFollowUpRequirementSignals(decisionSnapshot) {
  const decision = PRIORITY_RECOVERY_FOLLOW_UP_DECISION;
  const field = PRIORITY_RECOVERY_FOLLOW_UP_FIELD;
  const blockerReasons =
    decisionSnapshot?.[field.BLOCKER_REASONS];
  const semanticState =
    decisionSnapshot?.semanticState ||
    decisionSnapshot?.[field.SEMANTIC_STATE_ID];
  const nextRequiredActions = [
    decisionSnapshot?.[field.PROGRESS]?.[field.NEXT_REQUIRED_ACTION],
    decisionSnapshot?.[field.ACTUATION]?.[field.NEXT_REQUIRED_ACTION],
    decisionSnapshot?.[field.NEXT_REQUIRED_ACTION],
  ];
  return Object.freeze({
    semanticState,
    createRecoveryAction: nextRequiredActions.includes(
      decision.CREATE_RECOVERY_OPERATION,
    ),
    scheduleFollowUpRebalance: nextRequiredActions.includes(
      decision.SCHEDULE_FOLLOWUP_REBALANCE,
    ),
    eligibleButNoOperation:
      Array.isArray(blockerReasons) &&
      blockerReasons.includes(decision.ELIGIBLE_NO_OPERATION),
    unresolvedSemanticState:
      PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.includes(semanticState),
    terminalFailedOperation:
      isTerminalFailedFollowUpOperation(decisionSnapshot, semanticState),
  });
}
function buildFollowUpRequirementEvidence(decisionSnapshot) {
  const signals = buildFollowUpRequirementSignals(decisionSnapshot);
  return Object.freeze({
    createRecoveryOperation:
      signals.unresolvedSemanticState &&
      (signals.createRecoveryAction || signals.eligibleButNoOperation) &&
      PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES.includes(
        signals.semanticState,
      ),
    scheduleFollowupRebalance:
      signals.unresolvedSemanticState &&
      signals.scheduleFollowUpRebalance,
    terminalFailedOperation: signals.terminalFailedOperation,
  });
}
function buildFollowUpPlanningDecisionSnapshot({
  partitionId,
  assessment,
  activeNodeIds,
  operationContexts,
  closureWitnessNeedsOperation,
}) {
  const decision = PRIORITY_RECOVERY_FOLLOW_UP_DECISION;
  const field = PRIORITY_RECOVERY_FOLLOW_UP_FIELD;
  const eligibleButNoOperation = assessment.blockerReasons.includes(
    decision.ELIGIBLE_NO_OPERATION,
  );
  const progress = eligibleButNoOperation ?
    Object.freeze({
      nextRequiredAction: decision.CREATE_RECOVERY_OPERATION,
    }) :
    Object.freeze({});
  const coordinator = eligibleButNoOperation &&
    operationContexts.length === 0 ?
    {
      [field.COORDINATOR]: Object.freeze({
        serialWaitOperationCount: 0,
        [field.SERIAL_WAIT_OPERATION_IDS]:
          Object.freeze([]),
        [field.SERIAL_WAIT_PARTITION_IDS]:
          Object.freeze([]),
      }),
    } :
    {};
  return Object.freeze({
    partitionId,
    semanticState: assessment.semanticState,
    [field.AUTHORITATIVE_VISIBILITY_STATE]:
      closureWitnessNeedsOperation ?
        REPLICA_INVENTORY_OBSERVATION_STATE.OWNER_ADJUDICATED_EMPTY :
        null,
    blockerReasons: Object.freeze([...assessment.blockerReasons]),
    planner: assessment.planner,
    admission: Object.freeze({
      effectiveEligibleNodeIds: Object.freeze([...activeNodeIds]),
      effectiveEligibleNodeCount: activeNodeIds.length,
      ineligibleNodes: Object.freeze([]),
      blockingReasons: Object.freeze([]),
    }),
    publication: Object.freeze({
      recoveryActiveNodeIds: Object.freeze([...activeNodeIds]),
      concreteEligibleNodeIds: Object.freeze([...activeNodeIds]),
      publishedActiveNodeIds: Object.freeze([...activeNodeIds]),
    }),
    ...coordinator,
    progress,
  });
}
function closureWitnessAllowsPartition(evidence, partitionId) {
  return evidence.followUpRequired !== true ||
    evidence.candidatePartitionIds.length === 0 ||
    evidence.candidatePartitionIds.includes(partitionId);
}
function readDecisionSnapshotEligibleNodeIdLists(snapshot) {
  const publication = snapshot?.publication;
  return [
    snapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ELIGIBLE_NODE_IDS],
    snapshot?.admission?.effectiveEligibleNodeIds,
    publication?.recoveryActiveNodeIds,
    publication?.concreteEligibleNodeIds,
    publication?.publishedActiveNodeIds,
  ];
}
function readPlanningSnapshotEligibleNodeIdLists(snapshot) {
  return [
    snapshot?.publishedActiveNodeIds,
    snapshot?.publicationRecoveryGate?.publishedActiveNodeIds,
  ];
}
class UnifiedRebalancerFollowUpDecision extends UnifiedRebalancerBudgetPlanning {
  buildPriorityRecoveryFollowUpOperationContextsFromCache(partitionId) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (
      normalizedPartitionId.length === 0 ||
      typeof this.systemTableCache?.getAll !== 'function'
    ) {
      return Object.freeze([]);
    }
    const replicaOperationRows = readAllSharedRows(
      this.systemTableCache,
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    );
    const nowMs = this.nowFn();
    const operationContexts = replicaOperationRows
      .filter((operation) => {
        if (!this.isTrackedInFlightOperation(operation)) {
          return false;
        }
        const normalizedOperation = normalizeReplicaOperationRecord(
          operation,
          {nowMs},
        );
        return !isReplicaOperationStale(normalizedOperation, {
          nowMs,
          staleTimeoutLookbackMs: Number.MAX_SAFE_INTEGER,
        });
      })
      .map((operation) =>
        buildPriorityRecoveryOperationContextFromRecord(operation),
      )
      .filter(
        (operationContext) =>
          operationContext?.partitionId === normalizedPartitionId,
      );
    return Object.freeze(operationContexts);
  }
  resolvePriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
    planningSnapshot = null,
    options = {},
  ) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }
    const partitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(options);
    if (partitionId.length === 0) {
      return null;
    }
    const snapshots = readPlanningDecisionSnapshots(planningSnapshot);
    const planningDecisionSnapshot =
      snapshots.find((snapshot) => {
        const snapshotPartitionId =
          this.resolvePriorityRecoveryFollowUpPartitionId(snapshot);
        return snapshotPartitionId === partitionId;
      }) || null;
    const reconstructedDecisionSnapshot =
      this.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {
          ...options,
          partitionId,
          includeNonRequiredSnapshot: true,
        },
      );
    let selectedDecisionSnapshot =
      planningDecisionSnapshot || reconstructedDecisionSnapshot;
    if (planningDecisionSnapshot && reconstructedDecisionSnapshot) {
      const planningOperationRequired =
        this.isPriorityRecoveryFollowUpOperationRequired(
          planningDecisionSnapshot,
        );
      const reconstructedOperationRequired =
        this.isPriorityRecoveryFollowUpOperationRequired(
          reconstructedDecisionSnapshot,
        );
      selectedDecisionSnapshot =
        planningOperationRequired === reconstructedOperationRequired ?
          planningDecisionSnapshot :
          reconstructedDecisionSnapshot;
    }
    selectedDecisionSnapshot = inheritPriorityRecoverySchedulingOwner(
      selectedDecisionSnapshot,
      planningDecisionSnapshot,
    );
    return this.attachPriorityRecoveryClosureWitnessOperationObservation(
      planningSnapshot,
      partitionId,
      selectedDecisionSnapshot,
    );
  }

  attachPriorityRecoveryClosureWitnessOperationObservation(
    planningSnapshot = null,
    partitionId = '',
    decisionSnapshot = null,
  ) {
    if (!decisionSnapshot) {
      return null;
    }
    const semanticState =
      decisionSnapshot?.semanticState ||
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SEMANTIC_STATE_ID
      ];
    const closureWitnessEvidence =
      this.buildPriorityRecoveryClosureWitnessFollowUpEvidence(planningSnapshot);
    const ownerAdjudicatedEmpty =
      semanticState === PRIORITY_RECOVERY_FOLLOW_UP_DECISION.NEEDS_OPERATION &&
      closureWitnessEvidence.needsOperationCandidatePartitionIds.includes(
        partitionId,
      );
    if (!ownerAdjudicatedEmpty) {
      return decisionSnapshot;
    }
    return Object.freeze({
      ...decisionSnapshot,
      [PRIORITY_RECOVERY_FOLLOW_UP_FIELD.AUTHORITATIVE_VISIBILITY_STATE]:
        REPLICA_INVENTORY_OBSERVATION_STATE.OWNER_ADJUDICATED_EMPTY,
    });
  }

  buildPriorityRecoveryClosureWitnessFollowUpSpreadGapByPartitionId(
    planningSnapshot = null,
  ) {
    const spreadGapByPartitionId = new Map();
    const decisionSnapshots = readPlanningDecisionSnapshots(planningSnapshot);
    for (const snapshot of decisionSnapshots) {
      const partitionId =
        this.resolvePriorityRecoveryFollowUpPartitionId(snapshot);
      recordFollowUpSpreadGap(
        this,
        spreadGapByPartitionId,
        partitionId,
        snapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PLANNER]?.spreadGap,
      );
    }
    const priorityPartitionSummary = planningSnapshot ?
      selectPriorityPartitionSummary(planningSnapshot) :
      null;
    const blockedPartitions = Array.isArray(
      priorityPartitionSummary?.blockedPartitions,
    ) ?
      priorityPartitionSummary.blockedPartitions :
      [];
    for (const partition of blockedPartitions) {
      const partitionId = String(
        partition?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      recordFollowUpSpreadGap(
        this,
        spreadGapByPartitionId,
        partitionId,
        partition?.spreadGap,
        true,
      );
    }
    return spreadGapByPartitionId;
  }

  rankPriorityRecoveryClosureWitnessFollowUpPartitionIds(
    planningSnapshot = null,
    partitionIds = [],
  ) {
    const spreadGapByPartitionId =
      this.buildPriorityRecoveryClosureWitnessFollowUpSpreadGapByPartitionId(
        planningSnapshot,
      );
    const rankedPartitionIds = (Array.isArray(partitionIds) ?
      partitionIds :
      [])
      .map((partitionId, originalIndex) => ({
        [PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD
          .PARTITION_ID]: partitionId,
        [PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD
          .SPREAD_GAP]:
          spreadGapByPartitionId.get(partitionId) ??
          PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY
            .SPREAD_GAP_UNAVAILABLE,
        [PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD
          .ORIGINAL_INDEX]: originalIndex,
      }))
      .sort((left, right) => {
        const leftSpreadGap =
          left[PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD
            .SPREAD_GAP];
        const rightSpreadGap =
          right[PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD
            .SPREAD_GAP];
        if (leftSpreadGap !== rightSpreadGap) {
          return rightSpreadGap - leftSpreadGap;
        }
        return left[
          PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD
            .ORIGINAL_INDEX
        ] - right[
          PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD
            .ORIGINAL_INDEX
        ];
      })
      .map(
        (entry) =>
          entry[
            PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY_FIELD
              .PARTITION_ID
          ],
      );
    return Object.freeze(rankedPartitionIds);
  }

  resolvePriorityRecoveryClosureWitnessFollowUpState(evidence = {}) {
    const tableEntry =
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE_TABLE.find(
        (entry) => entry.matches(evidence),
      );
    return tableEntry ?
      tableEntry.state :
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE.BLOCKED_BY_TOPOLOGY;
  }
  selectNonLocalPriorityRecoveryFollowUpPartitionId(
    candidatePartitionIds = [],
  ) {
    return (
      candidatePartitionIds.find((partitionId) => partitionId !== this.entityId) ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING
    );
  }
  selectCurrentPriorityRecoveryFollowUpPartitionId(
    candidatePartitionIds = [],
  ) {
    return candidatePartitionIds.includes(this.entityId) ?
      this.entityId :
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
  }
  selectPreferredPriorityRecoveryFollowUpPartitionId(
    candidatePartitionIds = [],
    options = {},
  ) {
    return this.resolvePriorityRecoveryFollowUpPartitionSelection(
      this.buildPriorityRecoveryFollowUpPartitionSelectionEvidence(
        candidatePartitionIds,
        options,
      ),
    );
  }

  buildPriorityRecoveryFollowUpPartitionSelectionEvidence(
    candidatePartitionIds = [],
    options = {},
  ) {
    const currentPartitionId = String(
      this.entityId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const normalizedCandidatePartitionIds = [];
    const seenPartitionIds = new Set();
    for (const partitionId of Array.isArray(candidatePartitionIds) ?
      candidatePartitionIds :
      []) {
      const normalizedPartitionId = String(
        partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (
        normalizedPartitionId.length === 0 ||
        seenPartitionIds.has(normalizedPartitionId)
      ) {
        continue;
      }
      seenPartitionIds.add(normalizedPartitionId);
      normalizedCandidatePartitionIds.push(normalizedPartitionId);
    }
    const nonLocalPartitionId =
      this.selectNonLocalPriorityRecoveryFollowUpPartitionId(
        normalizedCandidatePartitionIds,
      );
    const selectedCurrentPartitionId =
      this.selectCurrentPriorityRecoveryFollowUpPartitionId(
        normalizedCandidatePartitionIds,
      );
    return Object.freeze({
      candidatePartitionIds: Object.freeze(normalizedCandidatePartitionIds),
      currentNeedsOperation: options.currentNeedsOperation === true,
      currentPartitionId,
      hasCurrentCandidate: selectedCurrentPartitionId.length > 0,
      hasNonLocalCandidate: nonLocalPartitionId.length > 0,
      nonLocalPartitionId,
    });
  }

  resolvePriorityRecoveryFollowUpPartitionSelection(evidence = {}) {
    const tableEntry =
      PRIORITY_RECOVERY_FOLLOW_UP_PARTITION_SELECTION_STATE_TABLE.find(
        (entry) => entry.matches(evidence),
      );
    return tableEntry.select(evidence);
  }

  selectPriorityRecoveryClosureWitnessNeedsOperationPartitionId(
    evidence = {},
  ) {
    const needsOperationCandidatePartitionIds = Array.isArray(
      evidence.needsOperationCandidatePartitionIds,
    ) ?
      evidence.needsOperationCandidatePartitionIds :
      [];
    const selectedNeedsOperationPartitionId =
      this.selectPreferredPriorityRecoveryFollowUpPartitionId(
        needsOperationCandidatePartitionIds,
        {
          currentNeedsOperation:
            needsOperationCandidatePartitionIds.includes(this.entityId),
        },
      );
    if (selectedNeedsOperationPartitionId) {
      return selectedNeedsOperationPartitionId;
    }
    const candidatePartitionIds = Array.isArray(
      evidence.candidatePartitionIds,
    ) ?
      evidence.candidatePartitionIds :
      [];
    const unblockedCandidatePartitionId =
      this.selectPreferredPriorityRecoveryFollowUpPartitionId(
        candidatePartitionIds,
        {
          currentNeedsOperation: evidence.needsOperationRequired === true,
        },
      );
    if (unblockedCandidatePartitionId) {
      return unblockedCandidatePartitionId;
    }
    const rawCandidatePartitionIds = Array.isArray(
      evidence.rawCandidatePartitionIds,
    ) ?
      evidence.rawCandidatePartitionIds :
      [];
    return this.selectNonLocalPriorityRecoveryFollowUpPartitionId(
      rawCandidatePartitionIds,
    );
  }

  buildGlobalTopologyBlockingPartitionIdSet() {
    return new Set(
      this.getGlobalTopologyBlockingInFlightOperations()
        .map((operation) =>
          String(
            operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
              operation?.[
                PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE
              ] ||
              UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((partitionId) => partitionId.length > 0),
    );
  }

  selectPriorityRecoveryClosureWitnessFollowUpPartitionId(evidence = {}) {
    const followUpState =
      this.resolvePriorityRecoveryClosureWitnessFollowUpState(evidence);
    if (
      followUpState ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE
        .NEEDS_OPERATION_CANDIDATE
    ) {
      return this.selectPriorityRecoveryClosureWitnessNeedsOperationPartitionId(
        evidence,
      );
    }
    if (
      followUpState ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE.UNBLOCKED_CANDIDATE
    ) {
      const candidatePartitionIds = Array.isArray(
        evidence.candidatePartitionIds,
      ) ?
        evidence.candidatePartitionIds :
        [];
      return this.selectPreferredPriorityRecoveryFollowUpPartitionId(
        candidatePartitionIds,
      );
    }
    return UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
  }

  async hasPriorityRecoverySurrogateFollowUpOperationRequired() {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot({
      partitionId: this.entityId,
    });
    return Boolean(
      this.buildPriorityRecoverySurrogateFollowUpDecision(planningSnapshot),
    );
  }

  buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
    planningSnapshot = null,
    options = {},
  ) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }
    const partitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(options);
    if (partitionId.length === 0) {
      return null;
    }
    const priorityPartitionSummary =
      selectPriorityPartitionSummary(planningSnapshot);
    if (!priorityPartitionSummary) {
      return null;
    }
    const closureWitnessEvidence =
      this.buildPriorityRecoveryClosureWitnessFollowUpEvidence(planningSnapshot);
    const closureWitnessNeedsOperation =
      closureWitnessEvidence.needsOperationCandidatePartitionIds.includes(
        partitionId,
      );
    if (!closureWitnessAllowsPartition(closureWitnessEvidence, partitionId)) {
      return null;
    }
    const activeNodeIds =
      resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds;
    const operationContexts =
      this.buildPriorityRecoveryFollowUpOperationContextsFromCache(partitionId);
    const assessment = buildPriorityRecoveryPartitionAssessment({
      partitionId,
      priorityPartitionSummary,
      admission: {
        effectiveEligibleNodeIds: activeNodeIds,
        effectiveEligibleNodeCount: activeNodeIds.length,
        ineligibleNodes: [],
      },
      operationContexts,
    });
    const decisionSnapshot = buildFollowUpPlanningDecisionSnapshot({
      partitionId,
      assessment,
      activeNodeIds,
      operationContexts,
      closureWitnessNeedsOperation,
    });
    return options?.includeNonRequiredSnapshot === true ||
      this.isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot) ?
      decisionSnapshot :
      null;
  }

  isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot = null) {
    const evidence = buildFollowUpRequirementEvidence(decisionSnapshot);
    const followUpDecisionState = FOLLOW_UP_REQUIREMENT_STATE_TABLE
      .find(([evidenceField]) => evidence[evidenceField] === true)?.[1] ||
      PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT.NONE;
    return followUpDecisionState !==
      PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT.NONE;
  }

  async hasPriorityRecoveryFollowUpOperationRequired() {
    const decision =
      await this.getCurrentPriorityRecoveryFollowUpDecisionSnapshot();
    return this.isPriorityRecoveryFollowUpOperationRequired(
      decision?.decisionSnapshot || null,
    );
  }

  normalizePriorityRecoveryFollowUpNodeIds(candidateLists = []) {
    const nodeIds = [];
    const seenNodeIds = new Set();
    for (const candidateList of candidateLists) {
      for (const nodeId of Array.isArray(candidateList) ? candidateList : []) {
        const normalizedNodeId = String(
          nodeId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
        ).trim();
        if (
          normalizedNodeId.length === 0 ||
          seenNodeIds.has(normalizedNodeId)
        ) {
          continue;
        }
        seenNodeIds.add(normalizedNodeId);
        nodeIds.push(normalizedNodeId);
      }
    }
    return nodeIds;
  }

  resolvePriorityRecoveryFollowUpEligibleNodeIds(decision) {
    return this.normalizePriorityRecoveryFollowUpNodeIds([
      ...readDecisionSnapshotEligibleNodeIdLists(decision?.decisionSnapshot),
      ...readPlanningSnapshotEligibleNodeIdLists(decision?.planningSnapshot),
    ]);
  }

  resolvePriorityRecoveryFollowUpPartitionId(decision = null) {
    const decisionSnapshot = decision?.decisionSnapshot || decision || null;
    const partitionId = String(
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
        decisionSnapshot?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE
        ] ||
        this.entityId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return partitionId;
  }

  getCurrentPartitionReplicasByPartitionId(partitionId) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (
      normalizedPartitionId.length === 0 ||
      !this.systemTableCache ||
      typeof this.systemTableCache.filter !== 'function'
    ) {
      return [];
    }
    return this.filterReplicasRetiredByTerminalOperations(
      this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (service) => {
          const normalizedService = normalizeServiceRow(service);
          return (
            normalizedService.partitionId === normalizedPartitionId &&
            normalizedService.serviceType === EntityType.PARTITION
          );
        },
      ),
    );
  }

  resolvePriorityRecoveryFollowUpCurrentReplicas(
    decision = null,
    fallbackCurrentReplicas = [],
  ) {
    const partitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    if (partitionId === this.entityId) {
      return Array.isArray(fallbackCurrentReplicas) ?
        fallbackCurrentReplicas :
        [];
    }
    return this.getCurrentPartitionReplicasByPartitionId(partitionId);
  }

  resolvePriorityRecoveryFollowUpTargetReplicaCount(
    decision = null,
    targetState = null,
  ) {
    const plannerTargetReplicaCount =
      Number.isInteger(
        decision?.decisionSnapshot?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PLANNER
        ]?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REQUIRED_DISTINCT_NODE_COUNT
        ],
      ) &&
      decision.decisionSnapshot[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PLANNER
      ][
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REQUIRED_DISTINCT_NODE_COUNT
      ] > 0 ?
        decision.decisionSnapshot[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PLANNER
        ][
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REQUIRED_DISTINCT_NODE_COUNT
        ] :
        null;
    if (plannerTargetReplicaCount !== null) {
      return plannerTargetReplicaCount;
    }
    return Number.isInteger(targetState?.targetReplicaCount) &&
      targetState.targetReplicaCount > 0 ?
      targetState.targetReplicaCount :
      this.getPriorityControlPlaneTargetReplicaCount();
  }
}

export {UnifiedRebalancerFollowUpDecision};
