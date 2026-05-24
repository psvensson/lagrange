import {
  buildOwnerOutcomeEnvelope,
} from './owner-outcome-contract.js';
import {
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_BUDGET_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_REASON,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_STATE,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  isPublicationActiveGateHandoffRecord,
  normalizePublicationActiveGateHandoffNodeIdList,
} from './publication-active-gate-handoff-contract-helpers.js';
import {
  buildPublicationActiveGateCrossOwnerHandoffContract,
  buildPublicationActiveGateOwnerOutcomeContract,
  decidePublicationActiveGateHandoff,
  resolvePublicationActiveGateOwnerOutcomeFreshness,
  resolvePublicationActiveGateOwnerOutcomeState,
} from './publication-active-gate-handoff-contract-decision.js';
import {
  buildPublicationActiveGateCatchupFence,
} from './publication-active-gate-handoff-contract-fence.js';
import {
  buildPublicationOperationWorkflowHandoff,
} from './publication-active-gate-handoff-contract-workflow.js';
import {
  resolvePublicationActiveGateHandoffExpectedNodeIds,
  resolvePublicationActiveGateHandoffMissingPublishedNodeIds,
  resolvePublicationActiveGateHandoffPendingReconcileNodeIds,
  resolvePublicationActiveGateHandoffPendingRecoveryNodeIds,
  resolvePublicationActiveGateHandoffPublishedActiveNodeIds,
  resolvePublicationActiveGateHandoffReconcileRequirement,
} from './publication-active-gate-handoff-contract-evidence.js';
import {
  buildPublicationActiveGateHandoffContractFromProgress,
  buildPublicationActiveGateHandoffEmptyReconcileTarget,
  buildPublicationActiveGateHandoffReconcileTarget,
  hasPublicationActiveGateOwnerRecoveryWaitSignal,
  selectMostAdvancedPublicationActiveGateHandoffCandidate,
  selectPublicationActiveGateHandoffProgressContextRecord,
  selectPublicationActiveGateProgressRecord,
} from './publication-active-gate-handoff-contract-selection.js';

function buildPublicationActiveGateHandoffContract(options = {}) {
  const expectedNodeIds =
    resolvePublicationActiveGateHandoffExpectedNodeIds(options);
  const publishedActiveNodeIds =
    resolvePublicationActiveGateHandoffPublishedActiveNodeIds(options);
  const missingPublishedNodeIds =
    resolvePublicationActiveGateHandoffMissingPublishedNodeIds({
      expectedNodeIds,
      publishedActiveNodeIds,
      publicationConvergence: options.publicationConvergence,
    });
  const pendingRecoveryNodeIds =
    Array.isArray(options.pendingRecoveryNodeIds) ?
      normalizePublicationActiveGateHandoffNodeIdList(
        options.pendingRecoveryNodeIds,
      ) :
      resolvePublicationActiveGateHandoffPendingRecoveryNodeIds(
        expectedNodeIds,
        options.readinessByNodeId,
        options.publicationConvergence,
      );
  const pendingReconcileNodeIds =
    Array.isArray(options.pendingReconcileNodeIds) ?
      normalizePublicationActiveGateHandoffNodeIdList(
        options.pendingReconcileNodeIds,
      ) :
      resolvePublicationActiveGateHandoffPendingReconcileNodeIds({
        missingPublishedNodeIds,
        pendingRecoveryNodeIds,
      });
  const reconcileRequirement =
    resolvePublicationActiveGateHandoffReconcileRequirement(
      options.publicationConvergence,
    );
  const evidence = Object.freeze({
    expectedNodeIds,
    publishedActiveNodeIds,
    missingPublishedNodeIds,
    pendingRecoveryNodeIds,
    pendingReconcileNodeIds,
    reconcileRequirement,
  });
  const activeGateCatchupFence = buildPublicationActiveGateCatchupFence({
    ...options,
    expectedNodeIds,
  });
  const decision = decidePublicationActiveGateHandoff(evidence);
  const operationWorkflowHandoff = buildPublicationOperationWorkflowHandoff({
    ...options,
    handoffContract: options,
    decision,
  });
  const publicationEpoch =
    options.publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
    ] ?? PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH;
  const runtimePromotionAllowed =
    decision.runtimePromotionAllowed === true &&
    activeGateCatchupFence.promotionAllowed === true;
  const promotionDeniedByFence =
    decision.runtimePromotionAllowed === true &&
    runtimePromotionAllowed !== true;
  const contractState = promotionDeniedByFence ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED :
    decision.state;
  const contractReasonCode = promotionDeniedByFence ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
      .PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE :
    decision.reasonCode;
  const contractNextAction = promotionDeniedByFence ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF :
    decision.nextAction;
  const crossOwnerHandoffContract =
    buildPublicationActiveGateCrossOwnerHandoffContract({
      publicationEpoch,
      state: contractState,
      reasonCode: contractReasonCode,
      nextAction: contractNextAction,
      runtimePromotionAllowed,
      expectedNodeIds,
      pendingRecoveryNodeIds,
      pendingReconcileNodeIds,
      publishedActiveNodeIds,
      reconcileRequirement,
      activeGateCatchupFence,
      operationWorkflowHandoff,
    });
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    publicationEpoch,
    expectedNodeIds,
    expectedNodeCount: expectedNodeIds.length,
    publishedActiveNodeIds,
    publishedActiveNodeCount: publishedActiveNodeIds.length,
    missingPublishedNodeIds,
    missingPublishedCount: missingPublishedNodeIds.length,
    pendingRecoveryNodeIds,
    pendingRecoveryCount: pendingRecoveryNodeIds.length,
    pendingReconcileNodeIds,
    pendingReconcileCount: pendingReconcileNodeIds.length,
    activeGateCatchupFence,
    runtimePromotionAllowed,
    state: contractState,
    reasonCode: contractReasonCode,
    nextAction: contractNextAction,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CROSS_OWNER_HANDOFF_CONTRACT]:
      crossOwnerHandoffContract,
    ...(operationWorkflowHandoff ?
      {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF]:
          operationWorkflowHandoff,
      } :
      {}),
  });
}

function normalizePublicationActiveGateHandoffContract(value) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  const activeGateCatchupFence =
    isPublicationActiveGateHandoffRecord(
      value[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE
      ],
    ) ?
      value[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE
      ] :
      null;
  return buildPublicationActiveGateHandoffContract({
    publicationConvergence: {
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH]:
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH],
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS]:
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS],
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS]:
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS],
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF]:
        value[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.OPERATION_WORKFLOW_HANDOFF
        ],
    },
    expectedNodeIds: value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EXPECTED_NODE_IDS],
    pendingRecoveryNodeIds: value.pendingRecoveryNodeIds,
    pendingReconcileNodeIds: value.pendingReconcileNodeIds,
    snapshotCoverage: activeGateCatchupFence?.snapshotCoverage,
    activeNodeViews: {
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EFFECTIVE_ACTIVE_NODE_IDS]:
        activeGateCatchupFence?.presence?.presentNodeIds,
    },
  });
}

function buildPublicationActiveGateOwnerOutcomeEnvelope(value = null) {
  const contract = selectPublicationActiveGateHandoffContract(value);
  const handoffContract = isPublicationActiveGateHandoffRecord(contract) ?
    contract :
    null;
  const normalizedContract = normalizePublicationActiveGateHandoffContract(
    handoffContract,
  );
  const ownerOutcomeState = resolvePublicationActiveGateOwnerOutcomeState(
    normalizedContract,
  );
  const producerOutcome = buildPublicationActiveGateOwnerOutcomeContract(
    normalizedContract,
  );
  return buildOwnerOutcomeEnvelope({
    owner: producerOutcome.owner,
    boundary: producerOutcome.boundary,
    state: ownerOutcomeState,
    outcome: producerOutcome.outcome,
    reasonCodes: producerOutcome.reasonCodes,
    nextAction: producerOutcome.nextAction,
    freshness: producerOutcome.freshness,
    revision: producerOutcome.revision,
    retryAfterMs: producerOutcome.retryAfterMs,
    terminal: producerOutcome.terminal,
    evidence: {
      publicationEpoch: normalizedContract?.publicationEpoch,
      expectedNodeIds: normalizedContract?.expectedNodeIds,
      pendingReconcileNodeIds: normalizedContract?.pendingReconcileNodeIds,
      pendingRecoveryNodeIds: normalizedContract?.pendingRecoveryNodeIds,
      activeGateCatchupFence: normalizedContract?.activeGateCatchupFence,
      crossOwnerHandoffContract:
        normalizedContract?.[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CROSS_OWNER_HANDOFF_CONTRACT
        ] || null,
      operationWorkflowHandoff:
        normalizedContract?.operationWorkflowHandoff || null,
    },
  });
}

function projectPublicationActiveGateHandoffToOwnerCohort(
  handoffContract,
  options = {},
) {
  const contract = normalizePublicationActiveGateHandoffContract(
    handoffContract,
  );
  const activeGateBudget =
    isPublicationActiveGateHandoffRecord(options.activeGateBudget) ?
      options.activeGateBudget :
      Object.freeze({
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_BUDGET_STATE.UNAVAILABLE,
      });
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    state: contract.state,
    reasonCode: contract.reasonCode,
    topologyEpoch: contract.publicationEpoch,
    expectedNodeIds: contract.expectedNodeIds,
    expectedNodeCount: contract.expectedNodeCount,
    readyLeaseNodeIds: normalizePublicationActiveGateHandoffNodeIdList(
      options.readyLeaseNodeIds,
    ),
    readyLeaseNodeCount:
      normalizePublicationActiveGateHandoffNodeIdList(
        options.readyLeaseNodeIds,
      ).length,
    publishedActiveNodeIds: contract.publishedActiveNodeIds,
    publishedActiveNodeCount: contract.publishedActiveNodeCount,
    missingPublishedNodeIds: contract.missingPublishedNodeIds,
    missingPublishedCount: contract.missingPublishedCount,
    pendingRecoveryNodeIds: contract.pendingRecoveryNodeIds,
    pendingRecoveryCount: contract.pendingRecoveryCount,
    pendingReconcileNodeIds: contract.pendingReconcileNodeIds,
    pendingReconcileCount: contract.pendingReconcileCount,
    activeGateCatchupFence: contract.activeGateCatchupFence,
    runtimePromotionAllowed: contract.runtimePromotionAllowed,
    nextAction: contract.nextAction,
    activeGateBudget,
    ...(contract.operationWorkflowHandoff ?
      {operationWorkflowHandoff: contract.operationWorkflowHandoff} :
      {}),
  });
}

function selectPublicationActiveGateHandoffContract(value = null) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_ABSENT_RECORD;
  }
  const progressHandoff = selectPublicationActiveGateProgressRecord(value);
  const progressHandoffContract = progressHandoff ?
    buildPublicationActiveGateHandoffContractFromProgress(
      value,
      progressHandoff,
    ) :
    null;
  const directHandoff =
    value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
    ];
  const nestedHandoff =
    value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE
    ]?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
    ];
  if (
    isPublicationActiveGateHandoffRecord(
      directHandoff,
    )
  ) {
    return selectMostAdvancedPublicationActiveGateHandoffCandidate([
      progressHandoffContract,
      directHandoff,
    ]);
  }
  if (
    isPublicationActiveGateHandoffRecord(
      nestedHandoff,
    )
  ) {
    return selectMostAdvancedPublicationActiveGateHandoffCandidate([
      progressHandoffContract,
      nestedHandoff,
    ]);
  }
  if (progressHandoffContract) {
    return progressHandoffContract;
  }
  if (
    isPublicationActiveGateHandoffRecord(
      value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_OWNER_COHORT],
    )
  ) {
    const activeGateOwnerCohort =
      value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_OWNER_COHORT];
    const publicationConvergence =
      isPublicationActiveGateHandoffRecord(
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE],
      ) ?
        value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE] :
        {};
    return Object.freeze({
      ...publicationConvergence,
      ...activeGateOwnerCohort,
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE]:
        publicationConvergence,
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_OWNER_COHORT]:
        activeGateOwnerCohort,
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH]:
        activeGateOwnerCohort[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
        ] ??
        publicationConvergence[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_EPOCH
        ],
      [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS]:
        activeGateOwnerCohort[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
        ] ??
        publicationConvergence[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
        ],
    });
  }
  return value;
}

function resolvePublicationActiveGateMembershipPublicationTarget(value = null) {
  const selectedHandoffContract = selectPublicationActiveGateHandoffContract(
    value,
  );
  const handoffContract = normalizePublicationActiveGateHandoffContract(
    selectedHandoffContract,
  );
  if (
    !handoffContract ||
    handoffContract.nextAction !==
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION
  ) {
    return buildPublicationActiveGateHandoffEmptyReconcileTarget(
      handoffContract,
    );
  }
  return buildPublicationActiveGateHandoffReconcileTarget(
    handoffContract,
    value,
  );
}

function hasPublicationActiveGateOwnerReconcileSignal(value = null) {
  const selectedHandoffContract = selectPublicationActiveGateHandoffContract(
    value,
  );
  if (
    isPublicationActiveGateHandoffRecord(selectedHandoffContract) &&
    (
      selectedHandoffContract.nextAction ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
      hasPublicationActiveGateOwnerRecoveryWaitSignal(
        selectedHandoffContract,
      ) ||
      Number(
        selectedHandoffContract[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_COUNT
        ],
      ) > Number(0) ||
      normalizePublicationActiveGateHandoffNodeIdList(
        selectedHandoffContract[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS
        ],
      ).length > Number(0)
    )
  ) {
    return true;
  }
  const handoffContract = normalizePublicationActiveGateHandoffContract(
    selectedHandoffContract,
  );
  if (!handoffContract) {
    return false;
  }
  return handoffContract.nextAction ===
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
    hasPublicationActiveGateOwnerRecoveryWaitSignal(handoffContract) ||
    handoffContract.pendingReconcileCount > Number(0) ||
    handoffContract.pendingReconcileNodeIds.length > Number(0);
}

export {
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_REASON,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_STATE,
  buildPublicationActiveGateHandoffContract,
  buildPublicationActiveGateOwnerOutcomeEnvelope,
  buildPublicationOperationWorkflowHandoff,
  hasPublicationActiveGateOwnerReconcileSignal,
  normalizePublicationActiveGateHandoffContract,
  projectPublicationActiveGateHandoffToOwnerCohort,
  resolvePublicationActiveGateMembershipPublicationTarget,
  selectPublicationActiveGateHandoffContract,
};
