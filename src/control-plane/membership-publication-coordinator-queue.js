import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
} from './membership-publication-row-contract.js';
import {
  normalizeNodeIdList,
} from './membership-publication-row-helpers.js';
import {
  hasExplicitMembershipPublicationTarget,
} from './membership-publication-planning-evidence.js';
import {
  hasPublicationActiveGateOwnerReconcileSignal,
} from './publication-active-gate-handoff-contract.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from './control-plane-error-classification.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  MembershipPublicationCoordinatorReconcile,
} from './membership-publication-coordinator-reconcile.js';

const CONTROL_PLANE_CONVERGENCE_OUTCOME_SCHEMA_VERSION = 1;
const CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_BOUND = NUM.ONE;
const CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS = NUM.THOUSAND;
const CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_OUTCOME_ENQUEUED =
  'enqueued';
const CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_OUTCOME_MERGED = 'merged';
const CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_OUTCOME_REJECTED =
  'rejected';
const CONTROL_PLANE_CRITICAL_CONVERGENCE_REASON_QUEUE_STOPPED =
  'owner_queue_stopped';
const CONTROL_PLANE_CRITICAL_CONVERGENCE_REASON_QUEUE_BOUNDED =
  'owner_queue_bounded';
const CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION_OWNER_RECOVERY_WAKE =
  'owner_recovery_wake';
const CONTROL_PLANE_CONVERGENCE_FIELD = Object.freeze({
  CONTROL_PLANE_CONVERGENCE: 'controlPlaneConvergence',
  CONTROL_PLANE_CONVERGENCE_CLASS: 'controlPlaneConvergenceClass',
  CONTROL_PLANE_CONVERGENCE_OWNER_KEY: 'controlPlaneConvergenceOwnerKey',
  CONTROL_PLANE_CONVERGENCE_OPERATION: 'controlPlaneConvergenceOperation',
  CONTROL_PLANE_CONVERGENCE_QUEUE_BOUND:
    'controlPlaneConvergenceQueueBound',
  CONTROL_PLANE_PRESSURE_OUTCOME: 'controlPlanePressureOutcome',
  PRESSURE_RETRY_AFTER_MS: 'pressureRetryAfterMs',
});
const CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_DECISION = Object.freeze([
  Object.freeze({
    matches: (evidence) => evidence.queueStopped === true,
    pressureOutcome:
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
    queueOutcome: CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_OUTCOME_REJECTED,
    reasonCode: CONTROL_PLANE_CRITICAL_CONVERGENCE_REASON_QUEUE_STOPPED,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ownerAlreadyPending !== true &&
      evidence.queueAtBound === true,
    pressureOutcome:
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
    queueOutcome: CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_OUTCOME_REJECTED,
    reasonCode: CONTROL_PLANE_CRITICAL_CONVERGENCE_REASON_QUEUE_BOUNDED,
  }),
  Object.freeze({
    matches: (evidence) => evidence.ownerAlreadyPending === true,
    pressureOutcome:
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
    queueOutcome: CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_OUTCOME_MERGED,
    reasonCode: null,
  }),
  Object.freeze({
    matches: () => true,
    pressureOutcome:
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
    queueOutcome: CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_OUTCOME_ENQUEUED,
    reasonCode: null,
  }),
]);

const MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  ALLOW_EMPTY_PRELOADED_ROWS: 'allowEmptyPreloadedRows',
  ALLOW_PENDING_VISIBILITY: 'allowPendingVisibility',
  ALLOW_PRESSURE_DEFER: 'allowPressureDefer',
  DEFER_NESTED_PRIORITY_RECOVERY_PLANNING:
    'deferNestedPriorityRecoveryPlanning',
  EXCLUDED_NODE_IDS: 'excludedNodeIds',
  LATEST_PUBLICATION_ROW: 'latestPublicationRow',
  NODE_ENDPOINT_ROWS: 'nodeEndpointRows',
  NODE_ROWS: 'nodeRows',
  PARTITION_ROWS: 'partitionRows',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  PUBLICATION_EPOCH: 'publicationEpoch',
  PUBLICATION_EPOCH_SNAKE: 'publication_epoch',
  READ_PROFILE: 'readProfile',
  READINESS_ENTRIES: 'readinessEntries',
  REPLICA_OPERATION_ROWS: 'replicaOperationRows',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  SERVICE_ROWS: 'serviceRows',
  SKIP_PUBLICATION_WRITE_READBACK: 'skipPublicationWriteReadback',
});
const MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_ABSENT = Symbol(
  'membership-publication-reconcile-context-absent',
);
const MEMBERSHIP_PUBLICATION_RECONCILE_MERGE_ROUTE = Object.freeze({
  ACTIVE_GATE_HANDOFF: 'active_gate_handoff',
  STANDARD: 'standard',
});
const MEMBERSHIP_PUBLICATION_RECONCILE_MERGE_ROUTE_DECISION = Object.freeze([
  Object.freeze({
    route: MEMBERSHIP_PUBLICATION_RECONCILE_MERGE_ROUTE.ACTIVE_GATE_HANDOFF,
    matches: (evidence) =>
      evidence.nextHasOwnerReconcileHandoff === true &&
      evidence.nextHasExplicitTarget !== true,
  }),
  Object.freeze({
    route: MEMBERSHIP_PUBLICATION_RECONCILE_MERGE_ROUTE.STANDARD,
    matches: () => true,
  }),
]);
const MEMBERSHIP_PUBLICATION_RECONCILE_HANDOFF_ROUTE_RESET_FIELDS =
  Object.freeze([
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.REQUIRED_ACK_NODE_IDS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ACKNOWLEDGED_NODE_IDS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.EXCLUDED_NODE_IDS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ALLOW_EMPTY_PRELOADED_ROWS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.NODE_ROWS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.NODE_ENDPOINT_ROWS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.SERVICE_ROWS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PARTITION_ROWS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.REPLICA_OPERATION_ROWS,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.READINESS_ENTRIES,
  ]);
const MEMBERSHIP_PUBLICATION_HANDOFF_NODE_COUNT_FIELD_BY_NODE_LIST =
  Object.freeze({
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EXPECTED_NODE_IDS]:
      'expectedNodeCount',
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS]:
      'publishedActiveNodeCount',
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS]:
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_COUNT,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_ACK_NODE_IDS]:
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_ACK_COUNT,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_NODE_IDS]:
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_COUNT,
    [PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS]:
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_COUNT,
  });

function normalizeCriticalConvergenceRetryAfterMs(value) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS;
}

function buildCriticalConvergenceQueueOutcome({
  pressureOutcome,
  ownerKey,
  queueOutcome,
  reasonCode = null,
  retryAfterMs = CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS,
}) {
  return Object.freeze({
    schemaVersion: CONTROL_PLANE_CONVERGENCE_OUTCOME_SCHEMA_VERSION,
    convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
    pressureOutcome,
    ownerKey,
    operation: CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION_OWNER_RECOVERY_WAKE,
    queueBound: CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_BOUND,
    queueOutcome,
    retryAfterMs: normalizeCriticalConvergenceRetryAfterMs(retryAfterMs),
    ...(typeof reasonCode === TYPEOF.STRING && reasonCode.length > NUM.ZERO ?
      {reasonCode} :
      {}),
  });
}

function buildCriticalConvergenceQueueEvidence(reconcileQueue, ownerKey) {
  const ownerAlreadyPending =
    typeof reconcileQueue?.has === TYPEOF.FUNCTION ?
      reconcileQueue.has(ownerKey) :
      reconcileQueue?.pending instanceof Map &&
        reconcileQueue.pending.has(ownerKey);
  const pendingSize = Number.isFinite(reconcileQueue?.size) ?
    reconcileQueue.size :
    (
      reconcileQueue?.pending instanceof Map ?
        reconcileQueue.pending.size :
        NUM.ZERO
    );
  return Object.freeze({
    queueStopped: reconcileQueue?.stopped === true,
    ownerAlreadyPending,
    queueAtBound:
      pendingSize >= CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_BOUND,
  });
}

function resolveCriticalConvergenceQueueOutcome(reconcileQueue, ownerKey) {
  const evidence =
    buildCriticalConvergenceQueueEvidence(reconcileQueue, ownerKey);
  const decision = CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_DECISION.find(
    (entry) => entry.matches(evidence),
  );
  return buildCriticalConvergenceQueueOutcome({
    pressureOutcome: decision.pressureOutcome,
    ownerKey,
    queueOutcome: decision.queueOutcome,
    reasonCode: decision.reasonCode,
  });
}

function resolveCriticalConvergenceQueueFailureReason(error) {
  return getControlPlaneFailureSummary(error).primaryReason;
}

function isMembershipPublicationReconcileContext(value) {
  return value && typeof value === TYPEOF.OBJECT;
}

function hasActiveGateOwnerReconcileMembershipPublicationContext(context) {
  return isMembershipPublicationReconcileContext(context) &&
    hasPublicationActiveGateOwnerReconcileSignal(
      context[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF
      ],
    ) === true;
}

function resolveCriticalConvergenceQueueRetryAfterMs(error, context) {
  const retryAfterMs = getControlPlaneRetryAfterMs(error);
  if (!hasActiveGateOwnerReconcileMembershipPublicationContext(context)) {
    return retryAfterMs;
  }
  return CONTROL_PLANE_CRITICAL_CONVERGENCE_RETRY_AFTER_MS;
}

function mergeMembershipPublicationReconcileNodeIds(left, right) {
  return normalizeNodeIdList([
    ...normalizeNodeIdList(left),
    ...normalizeNodeIdList(right),
  ]);
}

function excludeMembershipPublicationReconcileNodeIds(nodeIds, excludedNodeIds) {
  const excluded = new Set(normalizeNodeIdList(excludedNodeIds));
  if (excluded.size === NUM.ZERO) {
    return normalizeNodeIdList(nodeIds);
  }
  return normalizeNodeIdList(nodeIds).filter((nodeId) =>
    !excluded.has(nodeId),
  );
}

function filterMembershipPublicationReconcileExclusions(
  excludedNodeIds,
  includedNodeIds,
) {
  const included = new Set(normalizeNodeIdList(includedNodeIds));
  if (included.size === NUM.ZERO) {
    return normalizeNodeIdList(excludedNodeIds);
  }
  return normalizeNodeIdList(excludedNodeIds).filter((nodeId) =>
    !included.has(nodeId),
  );
}

function hasMembershipPublicationReconcileContextField(context, fieldName) {
  return isMembershipPublicationReconcileContext(context) &&
    Object.hasOwn(context, fieldName);
}

function applyMembershipPublicationReconcileNodeList(
  context,
  fieldName,
  nodeIds,
  previousContext,
  nextContext,
) {
  if (
    nodeIds.length > NUM.ZERO ||
    hasMembershipPublicationReconcileContextField(
      previousContext,
      fieldName,
    ) ||
    hasMembershipPublicationReconcileContextField(nextContext, fieldName)
  ) {
    context[fieldName] = nodeIds;
    return;
  }
  delete context[fieldName];
}

function applyMembershipPublicationHandoffNodeList(
  handoff,
  fieldName,
  excludedNodeIds,
) {
  if (!hasMembershipPublicationReconcileContextField(handoff, fieldName)) {
    return;
  }
  const filteredNodeIds = excludeMembershipPublicationReconcileNodeIds(
    handoff[fieldName],
    excludedNodeIds,
  );
  handoff[fieldName] = filteredNodeIds;
  const countFieldName =
    MEMBERSHIP_PUBLICATION_HANDOFF_NODE_COUNT_FIELD_BY_NODE_LIST[fieldName];
  if (Object.hasOwn(handoff, countFieldName)) {
    handoff[countFieldName] = filteredNodeIds.length;
  }
}

function filterMembershipPublicationHandoffContext(
  handoff,
  excludedNodeIds,
) {
  if (
    !isMembershipPublicationReconcileContext(handoff) ||
    normalizeNodeIdList(excludedNodeIds).length === NUM.ZERO
  ) {
    return handoff;
  }
  const filteredHandoff = {...handoff};
  for (const fieldName of [
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EXPECTED_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REQUIRED_ACK_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.ACKNOWLEDGED_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_ACK_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_NODE_IDS,
    PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECONCILE_NODE_IDS,
  ]) {
    applyMembershipPublicationHandoffNodeList(
      filteredHandoff,
      fieldName,
      excludedNodeIds,
    );
  }
  return filteredHandoff;
}

function resolveMembershipPublicationReconcileFlag(previousValue, nextValue) {
  if (previousValue === false || nextValue === false) {
    return false;
  }
  if (nextValue === true || previousValue === true) {
    return true;
  }
  return nextValue ?? previousValue;
}

function resolvePublicationRowEpoch(row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return NUM.ZERO;
  }
  const epoch = Number(
    row[MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLICATION_EPOCH] ??
      row[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLICATION_EPOCH_SNAKE
      ],
  );
  return Number.isFinite(epoch) && epoch > NUM.ZERO ? epoch : NUM.ZERO;
}

function selectLatestPublicationRow(previousContext, nextContext) {
  const previousRow =
    previousContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.LATEST_PUBLICATION_ROW
    ];
  const nextRow =
    nextContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.LATEST_PUBLICATION_ROW
    ];
  if (!isMembershipPublicationReconcileContext(previousRow)) {
    return nextRow;
  }
  if (!isMembershipPublicationReconcileContext(nextRow)) {
    return previousRow;
  }
  return resolvePublicationRowEpoch(nextRow) >=
    resolvePublicationRowEpoch(previousRow) ?
    nextRow :
    previousRow;
}

function resolveMembershipPublicationReconcileMergeRoute(nextContext) {
  const evidence = Object.freeze({
    nextHasOwnerReconcileHandoff:
      hasPublicationActiveGateOwnerReconcileSignal(
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .PUBLICATION_ACTIVE_GATE_HANDOFF
        ],
      ) === true,
    nextHasExplicitTarget:
      hasExplicitMembershipPublicationTarget(nextContext) === true,
  });
  const decision = MEMBERSHIP_PUBLICATION_RECONCILE_MERGE_ROUTE_DECISION.find(
    (candidate) => candidate.matches(evidence),
  );
  return decision.route;
}

function resetMembershipPublicationReconcileContextFields(
  context,
  fieldNames,
) {
  const nextContext = {...context};
  for (const fieldName of fieldNames) {
    delete nextContext[fieldName];
  }
  return nextContext;
}

function finalizeMembershipPublicationReconcileMergedContext(
  mergedContext,
  mergeRoute,
) {
  if (
    mergeRoute ===
      MEMBERSHIP_PUBLICATION_RECONCILE_MERGE_ROUTE.ACTIVE_GATE_HANDOFF
  ) {
    return resetMembershipPublicationReconcileContextFields(
      mergedContext,
      MEMBERSHIP_PUBLICATION_RECONCILE_HANDOFF_ROUTE_RESET_FIELDS,
    );
  }
  return mergedContext;
}

function mergeMembershipPublicationReconcileContext(previousContext, nextContext) {
  if (
    !isMembershipPublicationReconcileContext(previousContext) ||
    !isMembershipPublicationReconcileContext(nextContext)
  ) {
    return nextContext;
  }
  const mergeRoute =
    resolveMembershipPublicationReconcileMergeRoute(nextContext);
  const nextExplicitTargetNodeIds = hasExplicitMembershipPublicationTarget(
    nextContext,
  ) ?
    mergeMembershipPublicationReconcileNodeIds(
      nextContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLISHED_ACTIVE_NODE_IDS
      ],
      mergeMembershipPublicationReconcileNodeIds(
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .REQUIRED_ACK_NODE_IDS
        ],
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .ACKNOWLEDGED_NODE_IDS
        ],
      ),
    ) :
    [];
  const excludedNodeIds = mergeMembershipPublicationReconcileNodeIds(
    filterMembershipPublicationReconcileExclusions(
      previousContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.EXCLUDED_NODE_IDS
      ],
      nextExplicitTargetNodeIds,
    ),
    nextContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.EXCLUDED_NODE_IDS
    ],
  );
  const publishedActiveNodeIds = excludeMembershipPublicationReconcileNodeIds(
    mergeMembershipPublicationReconcileNodeIds(
      previousContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .PUBLISHED_ACTIVE_NODE_IDS
      ],
      nextContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .PUBLISHED_ACTIVE_NODE_IDS
      ],
    ),
    excludedNodeIds,
  );
  const requiredAckNodeIds = excludeMembershipPublicationReconcileNodeIds(
    mergeMembershipPublicationReconcileNodeIds(
      previousContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.REQUIRED_ACK_NODE_IDS
      ],
      nextContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.REQUIRED_ACK_NODE_IDS
      ],
    ),
    excludedNodeIds,
  );
  const acknowledgedNodeIds = excludeMembershipPublicationReconcileNodeIds(
    mergeMembershipPublicationReconcileNodeIds(
      previousContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ACKNOWLEDGED_NODE_IDS
      ],
      nextContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ACKNOWLEDGED_NODE_IDS
      ],
    ),
    excludedNodeIds,
  );
  const publicationActiveGateHandoff =
    filterMembershipPublicationHandoffContext(
      nextContext[
        MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .PUBLICATION_ACTIVE_GATE_HANDOFF
      ] ??
        previousContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .PUBLICATION_ACTIVE_GATE_HANDOFF
        ],
      excludedNodeIds,
    );
  const mergedContext = {
    ...previousContext,
    ...nextContext,
    [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.LATEST_PUBLICATION_ROW]:
      selectLatestPublicationRow(previousContext, nextContext),
    [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_PENDING_VISIBILITY]:
      resolveMembershipPublicationReconcileFlag(
        previousContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .ALLOW_PENDING_VISIBILITY
        ],
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .ALLOW_PENDING_VISIBILITY
        ],
      ),
    [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ALLOW_PRESSURE_DEFER]:
      resolveMembershipPublicationReconcileFlag(
        previousContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ALLOW_PRESSURE_DEFER
        ],
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ALLOW_PRESSURE_DEFER
        ],
      ),
    [MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .SKIP_PUBLICATION_WRITE_READBACK]:
      resolveMembershipPublicationReconcileFlag(
        previousContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .SKIP_PUBLICATION_WRITE_READBACK
        ],
        nextContext[
          MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .SKIP_PUBLICATION_WRITE_READBACK
        ],
      ),
  };
  if (publicationActiveGateHandoff) {
    mergedContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
        .PUBLICATION_ACTIVE_GATE_HANDOFF
    ] = publicationActiveGateHandoff;
  }
  if (excludedNodeIds.length > NUM.ZERO) {
    mergedContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.EXCLUDED_NODE_IDS
    ] = excludedNodeIds;
  } else {
    delete mergedContext[
      MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.EXCLUDED_NODE_IDS
    ];
  }
  applyMembershipPublicationReconcileNodeList(
    mergedContext,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    publishedActiveNodeIds,
    previousContext,
    nextContext,
  );
  applyMembershipPublicationReconcileNodeList(
    mergedContext,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.REQUIRED_ACK_NODE_IDS,
    requiredAckNodeIds,
    previousContext,
    nextContext,
  );
  applyMembershipPublicationReconcileNodeList(
    mergedContext,
    MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.ACKNOWLEDGED_NODE_IDS,
    acknowledgedNodeIds,
    previousContext,
    nextContext,
  );
  return finalizeMembershipPublicationReconcileMergedContext(
    mergedContext,
    mergeRoute,
  );
}

function resolveQueuedMembershipPublicationReconcileContext(
  reconcileQueue,
  ownerKey,
) {
  const pendingEntry =
    reconcileQueue?.pending instanceof Map ?
      reconcileQueue.pending.get(ownerKey) :
      null;
  if (pendingEntry) {
    return pendingEntry.context;
  }
  const retryEntry =
    reconcileQueue?.retryWorkItems instanceof Map ?
      reconcileQueue.retryWorkItems.get(ownerKey) :
      null;
  if (retryEntry) {
    return retryEntry.context;
  }
  return MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_ABSENT;
}

class MembershipPublicationCoordinatorQueue extends
  MembershipPublicationCoordinatorReconcile {
  constructor(options = {}) {
    super(options);
    if (
      typeof this.reconcileQueue?.configureRetryPolicy === TYPEOF.FUNCTION
    ) {
      this.reconcileQueue.configureRetryPolicy({
        isRetryableError: isRetryableControlPlaneError,
        getRetryAfterMs: resolveCriticalConvergenceQueueRetryAfterMs,
        getFailureReason: resolveCriticalConvergenceQueueFailureReason,
      });
    }
  }

  enqueueClusterMembershipReconcile(
    reason = MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MANUAL,
    context = {},
    options = {},
  ) {
    const ownerKey = this.buildOwnerKey();
    const queueOutcome =
      resolveCriticalConvergenceQueueOutcome(this.reconcileQueue, ownerKey);
    this.lastControlPlaneConvergenceQueueOutcome = queueOutcome;
    if (
      queueOutcome.pressureOutcome ===
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED
    ) {
      return false;
    }
    const pendingContext = resolveQueuedMembershipPublicationReconcileContext(
      this.reconcileQueue,
      ownerKey,
    );
    const mergedContext = mergeMembershipPublicationReconcileContext(
      pendingContext,
      {
        ...context,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE]:
          queueOutcome,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_CLASS]:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_OWNER_KEY]:
          ownerKey,
        [CONTROL_PLANE_CONVERGENCE_FIELD
          .CONTROL_PLANE_CONVERGENCE_OPERATION]:
          CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION_OWNER_RECOVERY_WAKE,
        [CONTROL_PLANE_CONVERGENCE_FIELD
          .CONTROL_PLANE_CONVERGENCE_QUEUE_BOUND]:
          CONTROL_PLANE_CRITICAL_CONVERGENCE_QUEUE_BOUND,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_PRESSURE_OUTCOME]:
          queueOutcome.pressureOutcome,
        [CONTROL_PLANE_CONVERGENCE_FIELD.PRESSURE_RETRY_AFTER_MS]:
          queueOutcome.retryAfterMs,
      },
    );
    return this.reconcileQueue.enqueue(ownerKey, reason, mergedContext, options);
  }
}

export {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  MembershipPublicationCoordinatorQueue as MembershipPublicationCoordinator,
};
