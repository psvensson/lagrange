import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  COORDINATOR_CREATED_REMOTE_HANDOFF_MAX_ACTIVE_RETRIES_PER_TARGET,
  buildHandoffDeferralTransportDiagnostics,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE = Object.freeze({
  INELIGIBLE: 'ineligible',
  LOCAL_TRANSITION_RETRY_ACTIVE: 'local_transition_retry_active',
  LOCAL_OWNER: 'local_owner',
  ACTIVE_HANDOFF_RETRY: 'active_handoff_retry',
  SCHEDULE_REMOTE_HANDOFF: 'schedule_remote_handoff',
});

const COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION = Object.freeze({
  REJECT: 'reject',
  ACCEPT_EXISTING: 'accept_existing',
  SCHEDULE: 'schedule',
});

const COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION_BY_STATE =
  Object.freeze(new Map([
    [
      COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE
        .LOCAL_TRANSITION_RETRY_ACTIVE,
      COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION.ACCEPT_EXISTING,
    ],
    [
      COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE.ACTIVE_HANDOFF_RETRY,
      COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION.ACCEPT_EXISTING,
    ],
    [
      COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE.SCHEDULE_REMOTE_HANDOFF,
      COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION.SCHEDULE,
    ],
  ]));

const COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE.INELIGIBLE,
    matches: (evidence) =>
      evidence.operationAvailable !== true ||
      evidence.remoteHandoffEligible !== true ||
      evidence.retryableControlPlaneError !== true,
  }),
  Object.freeze({
    state:
      COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE
        .LOCAL_TRANSITION_RETRY_ACTIVE,
    matches: (evidence) =>
      evidence.locallyOwned === true &&
      evidence.transitionRetryGraceActive === true,
  }),
  Object.freeze({
    state: COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE.LOCAL_OWNER,
    matches: (evidence) => evidence.locallyOwned === true,
  }),
  Object.freeze({
    state: COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE.ACTIVE_HANDOFF_RETRY,
    matches: (evidence) => evidence.handoffRetryActive === true,
  }),
  Object.freeze({
    state:
      COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE.SCHEDULE_REMOTE_HANDOFF,
    matches: () => true,
  }),
]);

function buildCoordinatorCreatedRemoteHandoffRetryEvidence(
  context,
  operation,
  errorLike,
  options = {},
) {
  const operationId = operation?.operationId || null;
  return Object.freeze({
    operationId,
    operationAvailable: Boolean(operationId),
    remoteHandoffEligible:
      context.shouldRetryCoordinatorCreatedRemoteHandoff(
        operation,
        options,
      ),
    retryableControlPlaneError: isRetryableControlPlaneError(errorLike),
    locallyOwned: context.isCoordinatorCreatedOperationLocallyOwned(operation),
    transitionRetryGraceActive:
      context.hasActiveTransitionRetryGrace(operationId),
    handoffRetryActive:
      context.hasActiveCreatedOperationHandoffRetry(operationId),
  });
}

function resolveCoordinatorCreatedRemoteHandoffRetryAction(evidence) {
  const state =
    COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_STATE.INELIGIBLE;
  return (
    COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION_BY_STATE.get(state) ||
    COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION.REJECT
  );
}

function deferCoordinatorCreatedRemoteHandoffRetry(
  context,
  operation,
  errorLike,
  options = {},
) {
  const evidence =
    context.buildCoordinatorCreatedRemoteHandoffRetryEvidence(
      operation,
      errorLike,
      options,
    );
  const action =
    context.resolveCoordinatorCreatedRemoteHandoffRetryAction(evidence);
  if (
    action === COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION.REJECT
  ) {
    return false;
  }
  if (
    action ===
    COORDINATOR_CREATED_REMOTE_HANDOFF_RETRY_ACTION.ACCEPT_EXISTING
  ) {
    return true;
  }

  const operationId = evidence.operationId;
  const ownerNodeId =
    context.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
  const diagnosticDestination =
    context.resolveCoordinatorCreatedHandoffDiagnosticDestination(
      operation,
      options,
    );
  const alreadyScheduled =
    context.hasActiveCreatedOperationHandoffRetry(operationId);
  if (
    !alreadyScheduled &&
    ownerNodeId &&
    context.countActiveCreatedOperationHandoffRetriesByTargetNode(
      ownerNodeId,
    ) >= COORDINATOR_CREATED_REMOTE_HANDOFF_MAX_ACTIVE_RETRIES_PER_TARGET
  ) {
    context.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_SHED,
      {
        operationId,
        partitionId: operation?.partitionId || null,
        ...diagnosticDestination.logFields,
        workflowStep: operation?.workflowStep || null,
        activeRetriesPerTarget:
          context.countActiveCreatedOperationHandoffRetriesByTargetNode(
            ownerNodeId,
          ),
        maxActiveRetriesPerTarget:
          COORDINATOR_CREATED_REMOTE_HANDOFF_MAX_ACTIVE_RETRIES_PER_TARGET,
        boundary:
          OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
        ...buildHandoffDeferralTransportDiagnostics(
          context,
          operation,
          errorLike,
          diagnosticDestination.nodeId,
        ),
      },
    );
    return false;
  }

  const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
  const delayMs = context.resolveCreatedOperationHandoffRetryDelayMs(
    operationId,
    Number.isFinite(retryAfterMs) && retryAfterMs > 0 ?
      retryAfterMs :
      0,
  );
  const errorMessage = context.normalizeErrorMessage(
    errorLike,
    REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
  );

  context.logger.warn(
    REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED,
    {
      operationId,
      partitionId: operation?.partitionId || null,
      ...diagnosticDestination.logFields,
      workflowStep: operation?.workflowStep || null,
      delayMs,
      errorMessage,
      boundary:
        OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF,
      ...buildHandoffDeferralTransportDiagnostics(
        context,
        operation,
        errorLike,
        diagnosticDestination.nodeId,
      ),
    },
  );

  return context.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
    operation,
    delayMs,
    options,
  );
}

export {
  buildCoordinatorCreatedRemoteHandoffRetryEvidence,
  deferCoordinatorCreatedRemoteHandoffRetry,
  resolveCoordinatorCreatedRemoteHandoffRetryAction,
};
