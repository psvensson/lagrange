import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';
import {
  REPLICA_INVENTORY_OBSERVATION_STATE,
} from './replica-inventory-constants.js';

const {
  PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY,
  PRIORITY_RECOVERY_FOLLOW_UP_DECISION,
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES,
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
  UNIFIED_REBALANCER_LITERAL,
} = SHARED;

const PRIORITY_RECOVERY_FOLLOW_UP_DECISION_METHODS_CONSTRUCTOR =
  'constructor';

class UnifiedRebalancerPriorityRecoveryFollowUpDecisionMethods {
  normalizePriorityRecoveryCoordinatorDecisionStateValue(value) {
    const normalizedValue = String(
      value || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return normalizedValue.length > 0 ?
      normalizedValue :
      PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE;
  }

  isPriorityRecoveryCoordinatorDecisionStatePresent(value) {
    const normalizedValue =
      this.normalizePriorityRecoveryCoordinatorDecisionStateValue(value);
    return (
      normalizedValue !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE &&
      normalizedValue !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.UNAVAILABLE
    );
  }

  hasPriorityRecoveryCoordinatorDecisionOperationVisibility(
    decisionSnapshot = null,
  ) {
    const observation =
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.OBSERVATION] || {};
    const conditions =
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.CONDITIONS] || {};
    const visibilityCandidates = Object.freeze([
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.AUTHORITATIVE_VISIBILITY_STATE
      ],
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.VISIBILITY_STATE],
      observation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.VISIBILITY_STATE],
    ]);
    const workflowCandidates = Object.freeze([
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.WORKFLOW_STATE],
      observation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.WORKFLOW_STATE],
    ]);
    const latestOperationStatusCandidates = Object.freeze([
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.LATEST_OPERATION_STATUS
      ],
      conditions?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.LATEST_OPERATION_STATUS],
    ]);
    const hasVisibilityEvidence = visibilityCandidates.some((candidate) =>
      this.isPriorityRecoveryCoordinatorDecisionStatePresent(candidate),
    );
    const hasWorkflowEvidence = workflowCandidates.some((candidate) =>
      this.isPriorityRecoveryCoordinatorDecisionStatePresent(candidate),
    );
    const hasLatestOperationStatusEvidence =
      latestOperationStatusCandidates.some((candidate) =>
        this.isPriorityRecoveryCoordinatorDecisionStatePresent(candidate),
      );
    return (
      hasVisibilityEvidence ||
      hasWorkflowEvidence ||
      hasLatestOperationStatusEvidence
    );
  }

  shouldPreferPlanningPriorityRecoveryOperationCreation({
    coordinatorDecisionSnapshot = null,
    planningDecisionSnapshot = null,
  } = {}) {
    const planningOperationRequired =
      this.isPriorityRecoveryFollowUpOperationRequired(planningDecisionSnapshot);
    const coordinatorOperationRequired =
      this.isPriorityRecoveryFollowUpOperationRequired(
        coordinatorDecisionSnapshot,
      );
    const coordinatorOperationVisible =
      this.hasPriorityRecoveryCoordinatorDecisionOperationVisibility(
        coordinatorDecisionSnapshot,
      );
    const evidence = Object.freeze({
      planningOperationRequired,
      coordinatorOperationRequired,
      coordinatorOperationVisible,
    });
    const shouldUsePlanning =
      evidence.planningOperationRequired === true &&
      evidence.coordinatorOperationRequired !== true &&
      evidence.coordinatorOperationVisible !== true;
    return shouldUsePlanning;
  }

  async getCurrentPriorityRecoveryCoordinatorDecisionSnapshot() {
    if (!this.isControlPlanePriorityPartition()) {
      return null;
    }
    const workflowOwner = this.rebalanceCoordinator?.workflowOwner || null;
    if (
      !workflowOwner ||
      typeof workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations !==
        'function'
    ) {
      return null;
    }
    const decisionSnapshot =
      await workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations(
        this.entityId,
        [],
      );
    return decisionSnapshot && typeof decisionSnapshot === 'object' ?
      decisionSnapshot :
      null;
  }

  async getCurrentPriorityRecoveryFollowUpDecisionSnapshot() {
    if (!this.isControlPlanePriorityPartition()) {
      return null;
    }
    const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot({
      partitionId: this.entityId,
    });
    const coordinatorDecisionSnapshot =
      await this.getCurrentPriorityRecoveryCoordinatorDecisionSnapshot();
    const planningDecisionSnapshot =
      this.resolvePriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: this.entityId},
      ) || null;
    if (coordinatorDecisionSnapshot) {
      if (
        this.shouldPreferPlanningPriorityRecoveryOperationCreation({
          coordinatorDecisionSnapshot,
          planningDecisionSnapshot,
        })
      ) {
        return Object.freeze({
          planningSnapshot,
          decisionSnapshot: planningDecisionSnapshot,
        });
      }
      return Object.freeze({
        planningSnapshot,
        decisionSnapshot: coordinatorDecisionSnapshot,
      });
    }
    if (!planningDecisionSnapshot) {
      return null;
    }
    return Object.freeze({
      planningSnapshot,
      decisionSnapshot: planningDecisionSnapshot,
    });
  }

  buildPriorityRecoverySurrogateFollowUpDecision(
    planningSnapshot = null,
  ) {
    const followUpDecision =
      this.buildPriorityRecoverySurrogateFollowUpDecisions(planningSnapshot)[
        0
      ];
    if (followUpDecision) {
      return followUpDecision;
    }
    const decisionSnapshot =
      this.buildPriorityRecoverySurrogateDecisionFromPlanning(planningSnapshot);
    return decisionSnapshot ?
      Object.freeze({
        planningSnapshot,
        decisionSnapshot,
      }) :
      null;
  }

  buildPriorityRecoverySurrogateFollowUpDecisionRecord(
    planningSnapshot = null,
    decisionSnapshot = null,
  ) {
    return Object.freeze({
      planningSnapshot,
      decisionSnapshot,
    });
  }

  appendPriorityRecoverySurrogateFollowUpDecision(
    followUpDecisions,
    followUpPartitionIds,
    planningSnapshot,
    decisionSnapshot,
  ) {
    if (
      !this.isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot)
    ) {
      return false;
    }
    const partitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decisionSnapshot);
    if (
      partitionId.length === 0 ||
      followUpPartitionIds.has(partitionId)
    ) {
      return true;
    }
    followUpPartitionIds.add(partitionId);
    followUpDecisions.push(
      this.buildPriorityRecoverySurrogateFollowUpDecisionRecord(
        planningSnapshot,
        decisionSnapshot,
      ),
    );
    return true;
  }

  normalizePriorityRecoverySurrogateFollowUpDecisionSnapshot(
    planningSnapshot = null,
    partitionId = UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  ) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const decisionSnapshot =
      this.resolvePriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: normalizedPartitionId},
      );
    if (this.isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot)) {
      return decisionSnapshot;
    }
    const operationRequiredSnapshot =
      this.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: normalizedPartitionId},
      );
    if (operationRequiredSnapshot) {
      return operationRequiredSnapshot;
    }
    const closureWitnessEvidence =
      this.buildPriorityRecoveryClosureWitnessFollowUpEvidence(planningSnapshot);
    if (
      decisionSnapshot &&
      closureWitnessEvidence.needsOperationRequired === true &&
      closureWitnessEvidence.rawCandidatePartitionIds.includes(
        normalizedPartitionId,
      )
    ) {
      const blockerReasons = Array.isArray(
        decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKER_REASONS],
      ) ?
        decisionSnapshot[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKER_REASONS] :
        [];
      return Object.freeze({
        ...decisionSnapshot,
        semanticState: PRIORITY_RECOVERY_FOLLOW_UP_DECISION.NEEDS_OPERATION,
        [PRIORITY_RECOVERY_FOLLOW_UP_FIELD.AUTHORITATIVE_VISIBILITY_STATE]:
          REPLICA_INVENTORY_OBSERVATION_STATE.OWNER_ADJUDICATED_EMPTY,
        [PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKER_REASONS]:
          Object.freeze([
            ...new Set([
              ...blockerReasons,
              PRIORITY_RECOVERY_FOLLOW_UP_DECISION.ELIGIBLE_NO_OPERATION,
            ]),
          ]),
        [PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PROGRESS]: Object.freeze({
          ...(decisionSnapshot?.[
            PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PROGRESS
          ] || {}),
          [PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NEXT_REQUIRED_ACTION]:
            PRIORITY_RECOVERY_FOLLOW_UP_DECISION.CREATE_RECOVERY_OPERATION,
        }),
      });
    }
    return decisionSnapshot;
  }

  buildPriorityRecoverySurrogateFollowUpDecisions(
    planningSnapshot = null,
  ) {
    if (!this.isControlPlanePriorityPartition()) {
      return Object.freeze([]);
    }
    const followUpDecisions = [];
    const followUpPartitionIds = new Set();
    let skippedSettledCandidate = false;
    const addFollowUpDecision = (decisionSnapshot) => {
      const appended =
        this.appendPriorityRecoverySurrogateFollowUpDecision(
          followUpDecisions,
          followUpPartitionIds,
          planningSnapshot,
          decisionSnapshot,
        );
      if (appended !== true) {
        if (decisionSnapshot) {
          skippedSettledCandidate = true;
        }
      }
    };
    const closureWitnessPartitionId =
      this.resolvePriorityRecoveryClosureWitnessFollowUpPartitionId(
        planningSnapshot,
      );
    const resolveDecisionSnapshotForPartitionId = (partitionId) => {
      const normalizedPartitionId = String(
        partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (normalizedPartitionId.length === 0) {
        return null;
      }
      return this.normalizePriorityRecoverySurrogateFollowUpDecisionSnapshot(
        planningSnapshot,
        normalizedPartitionId,
      );
    };
    const closureWitnessDecisionSnapshot =
      resolveDecisionSnapshotForPartitionId(closureWitnessPartitionId);
    addFollowUpDecision(closureWitnessDecisionSnapshot);
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary ||
      planningSnapshot?.publicationRecoveryGate?.priorityPartitionSummary ||
      null;
    const candidatePartitionIds = Array.isArray(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots
        .map((snapshot) =>
          this.resolvePriorityRecoveryFollowUpPartitionId(snapshot),
        )
        .filter(
          (partitionId) =>
            partitionId.length > 0 && partitionId !== this.entityId,
        ) :
      [];
    for (const partitionId of candidatePartitionIds) {
      const decisionSnapshot =
        resolveDecisionSnapshotForPartitionId(partitionId);
      addFollowUpDecision(decisionSnapshot);
    }
    const blockedPartitions = Array.isArray(
      priorityPartitionSummary?.blockedPartitions,
    ) ?
      priorityPartitionSummary.blockedPartitions :
      [];
    for (const blockedPartition of blockedPartitions) {
      const blockedPartitionId = String(
        blockedPartition?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (
        blockedPartitionId.length === 0 ||
        blockedPartitionId === this.entityId
      ) {
        continue;
      }
      const decisionSnapshot =
        resolveDecisionSnapshotForPartitionId(blockedPartitionId);
      addFollowUpDecision(decisionSnapshot);
    }
    const fallbackDecision =
      this.buildPriorityRecoverySurrogateDecisionFromPlanning(planningSnapshot);
    addFollowUpDecision(fallbackDecision);
    return skippedSettledCandidate === true ?
      Object.freeze(followUpDecisions) :
      Object.freeze(followUpDecisions.slice(0, 1));
  }

  buildPriorityRecoverySurrogateDecisionFromPlanning(
    planningSnapshot = null,
  ) {
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary ||
      planningSnapshot?.publicationRecoveryGate?.priorityPartitionSummary ||
      null;
    const closureWitnessPartitionId =
      this.resolvePriorityRecoveryClosureWitnessFollowUpPartitionId(
        planningSnapshot,
      );
    if (closureWitnessPartitionId) {
      return this.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: closureWitnessPartitionId},
      );
    }
    const blockedPartitions = Array.isArray(
      priorityPartitionSummary?.blockedPartitions,
    ) ?
      priorityPartitionSummary.blockedPartitions :
      [];
    const blockedPartition = blockedPartitions.find((partition) => {
      const partitionId = String(
        partition?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      return partitionId.length > 0 && partitionId !== this.entityId;
    });
    if (!blockedPartition) {
      return null;
    }
    return this.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
      planningSnapshot,
      {
        partitionId:
          blockedPartition[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID],
      },
    );
  }

  resolvePriorityRecoveryClosureWitnessFollowUpPartitionId(
    planningSnapshot = null,
  ) {
    const closureWitnessEvidence =
      this.buildPriorityRecoveryClosureWitnessFollowUpEvidence(planningSnapshot);
    return this.selectPriorityRecoveryClosureWitnessFollowUpPartitionId(
      closureWitnessEvidence,
    );
  }

  buildPriorityRecoveryClosureWitnessFollowUpEvidence(
    planningSnapshot = null,
  ) {
    const closureWitness =
      planningSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PRIORITY_RECOVERY_CLOSURE_WITNESS
      ] ||
      planningSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PUBLICATION_RECOVERY_GATE
      ]?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PRIORITY_RECOVERY_CLOSURE_WITNESS
      ] ||
      null;
    const unresolvedSemanticStateIds = Array.isArray(
      closureWitness?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.UNRESOLVED_SEMANTIC_STATE_IDS
      ],
    ) ?
      closureWitness[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.UNRESOLVED_SEMANTIC_STATE_IDS
      ] :
      [];
    const blockedPartitionIds = Array.isArray(
      closureWitness?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKED_PARTITION_IDS
      ],
    ) ?
      closureWitness[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKED_PARTITION_IDS
      ] :
      [];
    const decisionSnapshots = Array.isArray(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots :
      [];
    const operationRequiredPartitionIds = new Set(
      decisionSnapshots
        .filter((snapshot) =>
          this.isPriorityRecoveryFollowUpOperationRequired(snapshot),
        )
        .map((snapshot) =>
          this.resolvePriorityRecoveryFollowUpPartitionId(snapshot),
        )
        .filter((partitionId) => partitionId.length > 0),
    );
    const topologyBlockingPartitionIds =
      this.buildGlobalTopologyBlockingPartitionIdSet();
    const followUpRequired = PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES.some(
      (semanticState) =>
        unresolvedSemanticStateIds.includes(semanticState),
    );
    const rawCandidatePartitionIds = followUpRequired ?
      blockedPartitionIds
        .map((partitionId) =>
          String(
            partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((partitionId) => partitionId.length > 0) :
      [];
    const rankedRawCandidatePartitionIds =
      this.rankPriorityRecoveryClosureWitnessFollowUpPartitionIds(
        planningSnapshot,
        rawCandidatePartitionIds,
      );
    const candidatePartitionIds = rankedRawCandidatePartitionIds
      .filter(
        (partitionId) =>
          !topologyBlockingPartitionIds.has(partitionId),
      );
    const needsOperationRawCandidatePartitionIds =
      rankedRawCandidatePartitionIds.filter((partitionId) =>
        operationRequiredPartitionIds.has(partitionId),
      );
    const needsOperationCandidatePartitionIds =
      needsOperationRawCandidatePartitionIds.filter((partitionId) =>
        !topologyBlockingPartitionIds.has(partitionId),
      );
    return Object.freeze({
      followUpRequired:
        followUpRequired,
      needsOperationRequired: unresolvedSemanticStateIds.includes(
        PRIORITY_RECOVERY_FOLLOW_UP_DECISION.NEEDS_OPERATION,
      ),
      blockedPartitionIds,
      rawCandidatePartitionIds:
        rankedRawCandidatePartitionIds,
      candidatePartitionIds: Object.freeze(candidatePartitionIds),
      needsOperationRawCandidatePartitionIds:
        Object.freeze(needsOperationRawCandidatePartitionIds),
      needsOperationCandidatePartitionIds:
        Object.freeze(needsOperationCandidatePartitionIds),
      hasRawCandidate: rawCandidatePartitionIds.length > 0,
      hasUnblockedCandidate: candidatePartitionIds.length > 0,
      topologyBlockingPartitionIds,
    });
  }

  normalizePriorityRecoveryClosureWitnessFollowUpSpreadGap(
    spreadGap = undefined,
  ) {
    const normalizedSpreadGap = Number(spreadGap);
    return Number.isFinite(normalizedSpreadGap) ?
      normalizedSpreadGap :
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY
        .SPREAD_GAP_UNAVAILABLE;
  }
}

function applyUnifiedRebalancerPriorityRecoveryFollowUpDecisionMethods(
  targetClass,
) {
  const sourcePrototype =
    UnifiedRebalancerPriorityRecoveryFollowUpDecisionMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === PRIORITY_RECOVERY_FOLLOW_UP_DECISION_METHODS_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerPriorityRecoveryFollowUpDecisionMethods};
