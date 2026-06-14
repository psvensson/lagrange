import {UnifiedRebalancerBudgetPlanning} from './unified-rebalancer-budget-planning.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  EntityType,
  NUM,
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
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
  buildPriorityRecoveryPartitionAssessment,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
} = SHARED;

const {buildPriorityRecoveryOperationContextFromRecord} =
  UNIFIED_REBALANCER_SHARED;
const {isReplicaOperationStale, normalizeReplicaOperationRecord} =
  UNIFIED_REBALANCER_SHARED;

class UnifiedRebalancerFollowUpDecision extends UnifiedRebalancerBudgetPlanning {
  buildPriorityRecoveryFollowUpOperationContextsFromCache(partitionId) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (
      normalizedPartitionId.length === NUM.ZERO ||
      typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION
    ) {
      return Object.freeze([]);
    }
    const replicaOperationRows =
      this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || [];
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
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const partitionId = String(
      options?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
        this.entityId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      return null;
    }
    const snapshots = Array.isArray(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots :
      [];
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
    if (!planningDecisionSnapshot) {
      return reconstructedDecisionSnapshot;
    }
    if (!reconstructedDecisionSnapshot) {
      return planningDecisionSnapshot;
    }
    const planningOperationRequired =
      this.isPriorityRecoveryFollowUpOperationRequired(
        planningDecisionSnapshot,
      );
    const reconstructedOperationRequired =
      this.isPriorityRecoveryFollowUpOperationRequired(
        reconstructedDecisionSnapshot,
      );
    const operationRequirementMatches =
      planningOperationRequired === reconstructedOperationRequired;
    return operationRequirementMatches ?
      planningDecisionSnapshot :
      reconstructedDecisionSnapshot;
  }

  buildPriorityRecoveryClosureWitnessFollowUpSpreadGapByPartitionId(
    planningSnapshot = null,
  ) {
    const spreadGapByPartitionId = new Map();
    const decisionSnapshots = Array.isArray(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots :
      [];
    for (const snapshot of decisionSnapshots) {
      const partitionId =
        this.resolvePriorityRecoveryFollowUpPartitionId(snapshot);
      if (partitionId.length === NUM.ZERO) {
        continue;
      }
      const spreadGap =
        this.normalizePriorityRecoveryClosureWitnessFollowUpSpreadGap(
          snapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PLANNER]?.spreadGap,
        );
      if (
        spreadGap >
        PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY
          .SPREAD_GAP_UNAVAILABLE
      ) {
        spreadGapByPartitionId.set(partitionId, spreadGap);
      }
    }
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary ||
      planningSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD
        .PUBLICATION_RECOVERY_GATE]?.priorityPartitionSummary ||
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
      if (
        partitionId.length === NUM.ZERO ||
        spreadGapByPartitionId.has(partitionId)
      ) {
        continue;
      }
      const spreadGap =
        this.normalizePriorityRecoveryClosureWitnessFollowUpSpreadGap(
          partition?.spreadGap,
        );
      if (
        spreadGap >
        PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY
          .SPREAD_GAP_UNAVAILABLE
      ) {
        spreadGapByPartitionId.set(partitionId, spreadGap);
      }
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
        normalizedPartitionId.length === NUM.ZERO ||
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
      hasCurrentCandidate: selectedCurrentPartitionId.length > NUM.ZERO,
      hasNonLocalCandidate: nonLocalPartitionId.length > NUM.ZERO,
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
        .filter((partitionId) => partitionId.length > NUM.ZERO),
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
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const partitionId = String(
      options?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
        this.entityId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      return null;
    }
    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary ||
      planningSnapshot.publicationRecoveryGate?.priorityPartitionSummary ||
      null;
    if (!priorityPartitionSummary) {
      return null;
    }
    const closureWitnessEvidence =
      this.buildPriorityRecoveryClosureWitnessFollowUpEvidence(planningSnapshot);
    const closureWitnessPreferred =
      closureWitnessEvidence.followUpRequired === true &&
      closureWitnessEvidence.candidatePartitionIds.length > NUM.ZERO;
    if (
      closureWitnessPreferred &&
      !closureWitnessEvidence.candidatePartitionIds.includes(partitionId)
    ) {
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
    const eligibleButNoOperation = assessment.blockerReasons.includes(
      PRIORITY_RECOVERY_FOLLOW_UP_DECISION.ELIGIBLE_NO_OPERATION,
    );
    const progress = eligibleButNoOperation ?
      Object.freeze({
        nextRequiredAction:
          PRIORITY_RECOVERY_FOLLOW_UP_DECISION.CREATE_RECOVERY_OPERATION,
      }) :
      Object.freeze({});
    const decisionSnapshot = Object.freeze({
      partitionId,
      semanticState: assessment.semanticState,
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
      ...(eligibleButNoOperation && operationContexts.length === NUM.ZERO ?
        {
          [PRIORITY_RECOVERY_FOLLOW_UP_FIELD.COORDINATOR]:
            Object.freeze({
              serialWaitOperationCount: NUM.ZERO,
              [PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_OPERATION_IDS]:
                Object.freeze([]),
              [PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_PARTITION_IDS]:
                Object.freeze([]),
            }),
        } :
        {}),
      progress,
    });
    return options?.includeNonRequiredSnapshot === true ||
      this.isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot) ?
      decisionSnapshot :
      null;
  }

  isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot = null) {
    const blockerReasons = Array.isArray(
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKER_REASONS],
    ) ?
      decisionSnapshot[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKER_REASONS] :
      [];
    const semanticState =
      decisionSnapshot?.semanticState ||
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SEMANTIC_STATE_ID
      ];
    const nextRequiredActions = [
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PROGRESS]?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NEXT_REQUIRED_ACTION
      ],
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ACTUATION]?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NEXT_REQUIRED_ACTION
      ],
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NEXT_REQUIRED_ACTION
      ],
    ];
    const followUpEvidence = Object.freeze({
      createRecoveryAction: nextRequiredActions.includes(
        PRIORITY_RECOVERY_FOLLOW_UP_DECISION.CREATE_RECOVERY_OPERATION,
      ),
      scheduleFollowUpRebalance: nextRequiredActions.includes(
        PRIORITY_RECOVERY_FOLLOW_UP_DECISION.SCHEDULE_FOLLOWUP_REBALANCE,
      ),
      eligibleButNoOperation: blockerReasons.includes(
        PRIORITY_RECOVERY_FOLLOW_UP_DECISION.ELIGIBLE_NO_OPERATION,
      ),
      unresolvedSemanticState:
        PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.includes(
          semanticState,
        ),
      terminalFailedOperation:
        semanticState ===
          PRIORITY_RECOVERY_FOLLOW_UP_DECISION.BLOCKED_UNCLASSIFIED &&
        decisionSnapshot?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.WORKFLOW_STATE
        ] === PRIORITY_RECOVERY_FOLLOW_UP_DECISION.WORKFLOW_TERMINAL &&
        decisionSnapshot?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.LATEST_OPERATION_STATUS
        ] === ReplicaStatus.FAILED &&
        Array.isArray(
          decisionSnapshot?.[
            PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ELIGIBLE_NODE_IDS
          ],
        ) &&
        decisionSnapshot[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ELIGIBLE_NODE_IDS
        ].length > NUM.ZERO,
    });
    const followUpDecisionEvidence = Object.freeze({
      createRecoveryOperation:
        followUpEvidence.unresolvedSemanticState &&
        (followUpEvidence.createRecoveryAction ||
          followUpEvidence.eligibleButNoOperation) &&
        PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES.includes(
          semanticState,
        ),
      scheduleFollowupRebalance:
        followUpEvidence.unresolvedSemanticState &&
        followUpEvidence.scheduleFollowUpRebalance,
      terminalFailedOperation: followUpEvidence.terminalFailedOperation,
    });
    const followUpDecisionState =
      [
        {
          state: PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT
            .CREATE_RECOVERY_OPERATION,
          matches: (evidence) =>
            evidence.createRecoveryOperation === true,
        },
        {
          state: PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT
            .SCHEDULE_FOLLOWUP_REBALANCE,
          matches: (evidence) =>
            evidence.scheduleFollowupRebalance === true,
        },
        {
          state: PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT
            .TERMINAL_FAILED_OPERATION,
          matches: (evidence) =>
            evidence.terminalFailedOperation === true,
        },
      ].find((decision) => decision.matches(followUpDecisionEvidence))?.state ||
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
          normalizedNodeId.length === NUM.ZERO ||
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
    const decisionSnapshot = decision?.decisionSnapshot || null;
    const planningSnapshot = decision?.planningSnapshot || null;
    return this.normalizePriorityRecoveryFollowUpNodeIds([
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ELIGIBLE_NODE_IDS],
      decisionSnapshot?.admission?.effectiveEligibleNodeIds,
      decisionSnapshot?.publication?.recoveryActiveNodeIds,
      decisionSnapshot?.publication?.concreteEligibleNodeIds,
      decisionSnapshot?.publication?.publishedActiveNodeIds,
      planningSnapshot?.publishedActiveNodeIds,
      planningSnapshot?.publicationRecoveryGate?.publishedActiveNodeIds,
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
      normalizedPartitionId.length === NUM.ZERO ||
      !this.systemTableCache ||
      typeof this.systemTableCache.filter !== TYPEOF.FUNCTION
    ) {
      return [];
    }
    return this.filterReplicasRetiredByTerminalReplaceOperations(
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
      ] > NUM.ZERO ?
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
      targetState.targetReplicaCount > NUM.ZERO ?
      targetState.targetReplicaCount :
      this.getPriorityControlPlaneTargetReplicaCount();
  }
}

export {UnifiedRebalancerFollowUpDecision};
