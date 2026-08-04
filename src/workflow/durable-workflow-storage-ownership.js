import {
  WORKFLOW_CLAIM_RESULT,
  WORKFLOW_ERROR_MSG,
  WORKFLOW_TRANSITION_FIELD,
} from './workflow-constants.js';

function rejectClaim(result, workflow) {
  return {accepted: false, result, workflow};
}

function validateClaim(claim = {}) {
  const ownerId = String(claim.ownerId || '').trim();
  if (!ownerId) {
    throw new Error(WORKFLOW_ERROR_MSG.CLAIM_OWNER_ID_REQUIRED);
  }
  if (!Number.isInteger(claim.fenceToken) || claim.fenceToken < 0) {
    throw new Error(WORKFLOW_ERROR_MSG.CLAIM_FENCE_TOKEN_REQUIRED);
  }
  if (!Number.isFinite(claim.leaseExpiresAt)) {
    throw new Error(WORKFLOW_ERROR_MSG.CLAIM_LEASE_EXPIRY_REQUIRED);
  }
  return {ownerId, fenceToken: claim.fenceToken,
    leaseExpiresAt: claim.leaseExpiresAt};
}

function resolveFenceToken(workflow) {
  return Number.isInteger(workflow.fenceToken) ? workflow.fenceToken : 0;
}

function resolveClaimRejection(workflow, claim, currentFenceToken, now) {
  if (claim.fenceToken < currentFenceToken) {
    return WORKFLOW_CLAIM_RESULT.STALE_FENCE;
  }
  if (!workflow.workflowOwnerId || workflow.workflowOwnerId === claim.ownerId) {
    return null;
  }
  if (Number(workflow.leaseExpiresAt) > now) {
    return WORKFLOW_CLAIM_RESULT.ACTIVE_OWNER;
  }
  return claim.fenceToken <= currentFenceToken ?
    WORKFLOW_CLAIM_RESULT.STALE_FENCE : null;
}

function isNewClaimAttempt(workflow, claim, currentFenceToken) {
  return claim.fenceToken > currentFenceToken ||
    workflow.workflowOwnerId !== claim.ownerId;
}

async function persistClaim(coordinator, candidate, context) {
  if (coordinator.persistWorkflowClaim) {
    return coordinator.persistWorkflowClaim(candidate, context);
  }
  await coordinator.persistWorkflow(candidate);
  return {accepted: true};
}

async function claimDurableWorkflow(coordinator, workflowId, claim = {}) {
  const workflow = coordinator.requireWorkflow(workflowId);
  if (coordinator.isTerminalWorkflow(workflow)) {
    return rejectClaim(WORKFLOW_CLAIM_RESULT.TERMINAL, workflow);
  }
  const normalized = validateClaim(claim);
  const currentFenceToken = resolveFenceToken(workflow);
  const rejection = resolveClaimRejection(
    workflow,
    normalized,
    currentFenceToken,
    coordinator.now(),
  );
  if (rejection) {
    return rejectClaim(rejection, workflow);
  }
  const newAttempt = isNewClaimAttempt(
    workflow,
    normalized,
    currentFenceToken,
  );
  const candidate = {
    ...workflow,
    workflowOwnerId: normalized.ownerId,
    fenceToken: normalized.fenceToken,
    leaseExpiresAt: normalized.leaseExpiresAt,
    attemptCount: (workflow.attemptCount ?? 0) + (newAttempt ? 1 : 0),
    updatedAt: coordinator.now(),
  };
  const persistence = await persistClaim(coordinator, candidate, {
    expectedFenceToken: currentFenceToken,
    previousWorkflow: workflow,
  });
  if (persistence === false || persistence?.accepted === false) {
    return rejectClaim(WORKFLOW_CLAIM_RESULT.STORAGE_REJECTED, workflow);
  }
  Object.assign(workflow, persistence?.workflow ?? candidate);
  return {accepted: true, result: WORKFLOW_CLAIM_RESULT.ACCEPTED, workflow};
}

function assertTransitionFence(coordinator, workflow, transition) {
  const transitionFence = transition.fenceToken;
  const currentFence = workflow.fenceToken;
  if (coordinator.persistWorkflowTransition) {
    if (transitionFence !== currentFence) {
      throw new Error(WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN);
    }
    if (transition.ownerId !== workflow.workflowOwnerId) {
      throw new Error(WORKFLOW_ERROR_MSG.WORKFLOW_OWNER_MISMATCH);
    }
    if (!workflow.workflowOwnerId ||
        Number(workflow.leaseExpiresAt) <= coordinator.now()) {
      throw new Error(WORKFLOW_ERROR_MSG.WORKFLOW_LEASE_EXPIRED);
    }
    return;
  }
  if (transitionFence !== undefined && transitionFence !== null &&
      currentFence !== undefined && currentFence !== null &&
      transitionFence < currentFence) {
    throw new Error(WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN);
  }
}

function assertTerminalTransition(coordinator, workflow, transition) {
  if (coordinator.isTerminalWorkflow(workflow) &&
      transition.nextStep !== workflow.step) {
    throw new Error(WORKFLOW_ERROR_MSG.TERMINAL_WORKFLOW_IMMUTABLE);
  }
}

function buildTransitionHistoryEntry(workflow, transition, fenceToken, now) {
  const metadata = transition.metadata &&
    typeof transition.metadata === 'object' ? transition.metadata : {};
  return {
    [WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP]: workflow.step ?? null,
    [WORKFLOW_TRANSITION_FIELD.NEXT_STEP]: transition.nextStep,
    [WORKFLOW_TRANSITION_FIELD.REASON]: transition.reason,
    [WORKFLOW_TRANSITION_FIELD.TIMESTAMP]: now,
    [WORKFLOW_TRANSITION_FIELD.OWNER_KEY]: workflow.ownerKey,
    [WORKFLOW_TRANSITION_FIELD.FENCE_TOKEN]: fenceToken,
    ...metadata,
  };
}

function buildTransitionCandidate(coordinator, workflow, transition, updates) {
  assertTransitionFence(coordinator, workflow, transition);
  assertTerminalTransition(coordinator, workflow, transition);
  const transitionFence = transition.fenceToken;
  const currentFence = workflow.fenceToken;
  const fenceToken = transitionFence ?? currentFence ?? null;
  const now = coordinator.now();
  const historyEntry = buildTransitionHistoryEntry(
    workflow,
    transition,
    fenceToken,
    now,
  );
  return {
    ...workflow,
    step: transition.nextStep,
    fenceToken,
    transitionHistory: [...(workflow.transitionHistory ?? []), historyEntry],
    updatedAt: now,
    ...updates,
  };
}

function restoreWorkflowState(workflow, previousState) {
  for (const key of Object.keys(workflow)) {
    if (!Object.prototype.hasOwnProperty.call(previousState, key)) {
      delete workflow[key];
    }
  }
  Object.assign(workflow, previousState);
  workflow.participants = previousState.participants;
}

async function transitionDurableWorkflow(
  coordinator,
  workflow,
  transition,
  updates = {},
) {
  const candidate = buildTransitionCandidate(
    coordinator,
    workflow,
    transition,
    updates,
  );
  if (!coordinator.persistWorkflowTransition) {
    // Durable-first ordering: persist the candidate BEFORE the in-memory
    // record advances, and roll the record back on rejection — the
    // in-memory registry must never run ahead of the durable row.
    const previousState = {...workflow};
    try {
      await coordinator.persistWorkflow(candidate);
    } catch (error) {
      restoreWorkflowState(workflow, previousState);
      throw error;
    }
    restoreWorkflowState(workflow, candidate);
    return workflow;
  }
  const persistence = await coordinator.persistWorkflowTransition(candidate, {
    expectedFenceToken: workflow.fenceToken ?? null,
    expectedOwnerId: workflow.workflowOwnerId,
    previousWorkflow: workflow,
  });
  if (persistence === false || persistence?.accepted === false) {
    throw new Error(WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN);
  }
  restoreWorkflowState(workflow, persistence?.workflow ?? candidate);
  return workflow;
}

export {claimDurableWorkflow, transitionDurableWorkflow};
