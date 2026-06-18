import {NUM} from '../constants/index.js';
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
  resolvePublicationActiveGateHandoffPublicationEpoch,
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
import {assertProjectionFresh} from './projection-freshness-guard.js';
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
  selectPublicationActiveGateProgressRecord,
} from './publication-active-gate-handoff-contract-selection.js';

const PUBLICATION_ACTIVE_GATE_HANDOFF_RETRY_AFTER_MS_FIELD = Object.freeze({
  PUBLICATION_ACTIVE_GATE_HANDOFF_RETRY_AFTER_MS:
    'publicationActiveGateHandoffRetryAfterMs',
  RETRY_AFTER_MS: 'retryAfterMs',
  SELECTED_SNAPSHOT_OBSERVATION_RETRY_AFTER_MS:
    'selectedSnapshotObservationRetryAfterMs',
});
const PUBLICATION_ACTIVE_GATE_OWNER_RECOVERY_RETRY_AFTER_MS = NUM.THOUSAND;

function normalizePublicationActiveGateHandoffRetryAfterMs(value) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    NUM.ZERO;
}

function selectPublicationActiveGateHandoffRetryAfterMsFromRecord(
  record = null,
) {
  if (!isPublicationActiveGateHandoffRecord(record)) {
    return NUM.ZERO;
  }
  for (const fieldName of Object.values(
    PUBLICATION_ACTIVE_GATE_HANDOFF_RETRY_AFTER_MS_FIELD,
  )) {
    const retryAfterMs =
      normalizePublicationActiveGateHandoffRetryAfterMs(record[fieldName]);
    if (retryAfterMs > NUM.ZERO) {
      return retryAfterMs;
    }
  }
  return NUM.ZERO;
}

function collectPublicationActiveGateHandoffRetrySourceRecords(value = null) {
  if (!isPublicationActiveGateHandoffRecord(value)) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  const publicationConvergence =
    value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_CONVERGENCE];
  const activeGate = value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE];
  const publicationActiveGate =
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE
    ];
  return Object.freeze([
    value,
    value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
    ],
    publicationConvergence,
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
    ],
    value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_PROGRESS],
    value[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_BEST_PROGRESS],
    activeGate,
    activeGate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROGRESS],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_PROGRESS
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACTIVE_GATE_BEST_PROGRESS
    ],
    publicationActiveGate,
    publicationActiveGate?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PROGRESS],
  ].filter(isPublicationActiveGateHandoffRecord));
}

function resolvePublicationActiveGateHandoffRetryAfterMs(...sources) {
  for (const source of sources) {
    for (const record of collectPublicationActiveGateHandoffRetrySourceRecords(
      source,
    )) {
      const retryAfterMs =
        selectPublicationActiveGateHandoffRetryAfterMsFromRecord(record);
      if (retryAfterMs > NUM.ZERO) {
        return retryAfterMs;
      }
    }
  }
  return NUM.ZERO;
}

function resolvePublicationActiveGateOwnerRecoveryRetryAfterMs(
  value,
  retryAfterMs,
) {
  const normalizedRetryAfterMs =
    normalizePublicationActiveGateHandoffRetryAfterMs(retryAfterMs);
  if (!hasPublicationActiveGateOwnerRecoveryWaitSignal(value)) {
    return normalizedRetryAfterMs;
  }
  return Math.max(
    normalizedRetryAfterMs,
    PUBLICATION_ACTIVE_GATE_OWNER_RECOVERY_RETRY_AFTER_MS,
  );
}

function applyPublicationActiveGateHandoffRetryAfterMs(value, retryAfterMs) {
  if (
    !isPublicationActiveGateHandoffRecord(value) ||
    retryAfterMs <= NUM.ZERO
  ) {
    return value;
  }
  return Object.freeze({
    ...value,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_RETRY_AFTER_MS_FIELD.RETRY_AFTER_MS]:
      retryAfterMs,
  });
}

function applyPublicationActiveGateCrossOwnerRetryAfterMs(
  contract,
  retryAfterMs,
) {
  if (
    !isPublicationActiveGateHandoffRecord(contract) ||
    retryAfterMs <= NUM.ZERO
  ) {
    return contract;
  }
  return Object.freeze({
    ...contract,
    producerOwnerOutcome: Object.freeze({
      ...contract.producerOwnerOutcome,
      retryAfterMs,
    }),
    retryDeferBehavior: Object.freeze({
      ...contract.retryDeferBehavior,
      retryAfterMs,
    }),
  });
}

function selectPublicationActiveGateHandoffCandidateWithRetry(
  candidate = null,
  value = null,
) {
  const retryAfterMs = resolvePublicationActiveGateOwnerRecoveryRetryAfterMs(
    candidate,
    resolvePublicationActiveGateHandoffRetryAfterMs(candidate, value),
  );
  return applyPublicationActiveGateHandoffRetryAfterMs(candidate, retryAfterMs);
}

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
  // CL-001 variant A: pending recovery-eligible acks on an OPEN publication that
  // the owner driver must still re-drive to close. Only the owner-driven
  // reconcile path supplies this; the served/active-gate snapshot path leaves it
  // empty, so promotion semantics there are unchanged.
  const ownerAckCompletionPendingNodeIds =
    Array.isArray(options.ownerAckCompletionPendingNodeIds) ?
      normalizePublicationActiveGateHandoffNodeIdList(
        options.ownerAckCompletionPendingNodeIds,
      ) :
      PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  const evidence = Object.freeze({
    expectedNodeIds,
    publishedActiveNodeIds,
    missingPublishedNodeIds,
    pendingRecoveryNodeIds,
    pendingReconcileNodeIds,
    ownerAckCompletionPendingNodeIds,
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
  const publicationEpoch = resolvePublicationActiveGateHandoffPublicationEpoch(
    options.publicationConvergence,
  );
  const projectionFreshness = assertProjectionFresh({
    observedEpoch: publicationEpoch,
    freshness: resolvePublicationActiveGateOwnerOutcomeFreshness({
      state: decision.state,
    }),
    unknownEpoch: PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH,
  });
  const promotionFreshnessSatisfied =
    projectionFreshness.projectionFresh === true;
  const runtimePromotionAllowed =
    decision.runtimePromotionAllowed === true &&
    activeGateCatchupFence.promotionAllowed === true &&
    promotionFreshnessSatisfied;
  const selectedRetryAfterMs =
    resolvePublicationActiveGateHandoffRetryAfterMs(options);
  const promotionDeniedByFence =
    decision.runtimePromotionAllowed === true &&
    activeGateCatchupFence.promotionAllowed !== true;
  const promotionDeniedByFreshness =
    decision.runtimePromotionAllowed === true &&
    activeGateCatchupFence.promotionAllowed === true &&
    promotionFreshnessSatisfied !== true;
  const promotionDenied = promotionDeniedByFence || promotionDeniedByFreshness;
  const contractState = promotionDenied ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED :
    decision.state;
  const contractReasonCode = promotionDeniedByFreshness ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.PUBLICATION_EPOCH_UNOBSERVED :
    (promotionDeniedByFence ?
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
        .PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE :
      decision.reasonCode);
  const contractNextAction = promotionDenied ?
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF :
    decision.nextAction;
  const baseRetryAfterMs = resolvePublicationActiveGateOwnerRecoveryRetryAfterMs(
    {
      nextAction: contractNextAction,
      pendingRecoveryNodeIds,
    },
    selectedRetryAfterMs,
  );
  const retryAfterMs = promotionDeniedByFreshness ?
    Math.max(
      baseRetryAfterMs,
      PUBLICATION_ACTIVE_GATE_OWNER_RECOVERY_RETRY_AFTER_MS,
    ) :
    baseRetryAfterMs;
  const crossOwnerHandoffContract =
    applyPublicationActiveGateCrossOwnerRetryAfterMs(
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
      }),
      retryAfterMs,
    );
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
    retryAfterMs,
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
    retryAfterMs: value.retryAfterMs,
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
  const retryAfterMs = resolvePublicationActiveGateOwnerRecoveryRetryAfterMs(
    normalizedContract,
    resolvePublicationActiveGateHandoffRetryAfterMs(
      normalizedContract,
      handoffContract,
      value,
    ),
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
    retryAfterMs,
    terminal: producerOutcome.terminal,
    evidence: {
      publicationEpoch: normalizedContract?.publicationEpoch,
      expectedNodeIds: normalizedContract?.expectedNodeIds,
      pendingReconcileNodeIds: normalizedContract?.pendingReconcileNodeIds,
      pendingRecoveryNodeIds: normalizedContract?.pendingRecoveryNodeIds,
      activeGateCatchupFence: normalizedContract?.activeGateCatchupFence,
      retryAfterMs,
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
    retryAfterMs: contract.retryAfterMs,
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
    const selected = selectMostAdvancedPublicationActiveGateHandoffCandidate([
      progressHandoffContract,
      directHandoff,
    ]);
    return selectPublicationActiveGateHandoffCandidateWithRetry(
      selected,
      value,
    );
  }
  if (
    isPublicationActiveGateHandoffRecord(
      nestedHandoff,
    )
  ) {
    const selected = selectMostAdvancedPublicationActiveGateHandoffCandidate([
      progressHandoffContract,
      nestedHandoff,
    ]);
    return selectPublicationActiveGateHandoffCandidateWithRetry(
      selected,
      value,
    );
  }
  if (progressHandoffContract) {
    return selectPublicationActiveGateHandoffCandidateWithRetry(
      progressHandoffContract,
      value,
    );
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
    const selected = Object.freeze({
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
    return selectPublicationActiveGateHandoffCandidateWithRetry(
      selected,
      value,
    );
  }
  return selectPublicationActiveGateHandoffCandidateWithRetry(value, value);
}

function resolvePublicationActiveGateMembershipPublicationTarget(value = null) {
  const selectedHandoffContract = selectPublicationActiveGateHandoffContract(
    value,
  );
  const selectedPendingReconcileNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      selectedHandoffContract?.[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS
      ],
    );
  const selectedPendingReconcileCount = Number(
    selectedHandoffContract?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_COUNT
    ],
  );
  const hasSelectedOwnerReconcileDebt =
    isPublicationActiveGateHandoffRecord(selectedHandoffContract) &&
    selectedHandoffContract.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION &&
    (
      selectedPendingReconcileNodeIds.length > NUM.ZERO ||
      Number.isFinite(selectedPendingReconcileCount) &&
        selectedPendingReconcileCount > NUM.ZERO
    );
  const handoffContract = normalizePublicationActiveGateHandoffContract(
    selectedHandoffContract,
  );
  const targetHandoffContract =
    hasSelectedOwnerReconcileDebt ? selectedHandoffContract : handoffContract;
  if (
    !targetHandoffContract ||
    (targetHandoffContract.nextAction !==
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION &&
     targetHandoffContract.nextAction !==
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .OBSERVE_OWNER_HANDOFF) ||
    (targetHandoffContract.missingPublishedCount === 0 &&
     targetHandoffContract.nextAction !==
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION)
  ) {
    return buildPublicationActiveGateHandoffEmptyReconcileTarget(
      targetHandoffContract,
    );
  }
  return buildPublicationActiveGateHandoffReconcileTarget(
    targetHandoffContract,
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
      ) > NUM.ZERO ||
      normalizePublicationActiveGateHandoffNodeIdList(
        selectedHandoffContract[
          PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS
        ],
      ).length > NUM.ZERO
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
    handoffContract.pendingReconcileCount > NUM.ZERO ||
    handoffContract.pendingReconcileNodeIds.length > NUM.ZERO;
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
