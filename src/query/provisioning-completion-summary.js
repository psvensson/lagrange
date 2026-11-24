// Canonical provisioning-completion summary shared by initial-partition
// provisioning and table creation completion: validates observed routable and
// committed replica counts and derives READY / UNDER_REPLICATED / PENDING.
// UNDER_REPLICATED + PROCEED is permitted ONLY when observed replicas satisfy
// the writable minimum (> 0 and >= minimumRoutableReplicaCount when specified).
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from '../control-plane/owner-contract-outcome.js';

const OBJECT_TYPE = 'object';
const BOOLEAN_TYPE = 'boolean';
const STRING_TYPE = 'string';

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function firstPositiveInteger(primary, secondary = null) {
  if (isPositiveInteger(primary)) {
    return primary;
  }
  return isPositiveInteger(secondary) ? secondary : null;
}

function isProvisioningWritableMinimumSatisfied(summary) {
  if (!summary || typeof summary !== OBJECT_TYPE) {
    return false;
  }
  const {
    routableReplicaCount,
    committedReplicaCount,
    minimumRoutableReplicaCount,
  } = summary;
  if (
    !isPositiveInteger(routableReplicaCount) ||
    !isPositiveInteger(committedReplicaCount)
  ) {
    return false;
  }
  if (!isPositiveInteger(minimumRoutableReplicaCount)) {
    return true;
  }
  return (
    routableReplicaCount >= minimumRoutableReplicaCount &&
    committedReplicaCount >= minimumRoutableReplicaCount
  );
}

function resolveCommittedReplicaObservation(
  normalized,
  hasObservedResultObject,
  routableReplicaCount,
  hasObservedRoutableCount,
) {
  const hasExplicit =
    hasObservedResultObject &&
    normalized.committedReplicaCount !== undefined;
  if (!hasExplicit) {
    return {
      hasObservedCommittedCount: hasObservedRoutableCount,
      committedReplicaCount: routableReplicaCount,
    };
  }
  const validExplicit = isNonNegativeInteger(normalized.committedReplicaCount);
  return {
    hasObservedCommittedCount: validExplicit,
    committedReplicaCount: validExplicit ?
      normalized.committedReplicaCount :
      0,
  };
}

function resolveObservedReplicaCounts(normalized, hasObservedResultObject) {
  const hasObservedRoutableCount =
    hasObservedResultObject &&
    isNonNegativeInteger(normalized.routableReplicaCount);
  const routableReplicaCount = hasObservedRoutableCount ?
    normalized.routableReplicaCount :
    0;
  const committed = resolveCommittedReplicaObservation(
    normalized,
    hasObservedResultObject,
    routableReplicaCount,
    hasObservedRoutableCount,
  );
  return {
    hasObservedReplicaCounts:
      hasObservedRoutableCount && committed.hasObservedCommittedCount,
    routableReplicaCount,
    committedReplicaCount: committed.committedReplicaCount,
  };
}

function buildDefaultProvisioningContractOutcome({
  writableMinimumSatisfied,
  fullReplicaCountConverged,
}) {
  if (!writableMinimumSatisfied) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    });
  }
  return buildOwnerContractOutcome({
    contractState: fullReplicaCountConverged ?
      OWNER_CONTRACT_STATE.READY :
      OWNER_CONTRACT_STATE.UNDER_REPLICATED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
  });
}

function selectNonEmptyString(requestedValue, defaultValue) {
  if (typeof requestedValue === STRING_TYPE && requestedValue.length > 0) {
    return requestedValue;
  }
  return defaultValue;
}

function resolveRequestedProvisioningContractOutcome(
  normalized,
  defaultContractOutcome,
) {
  const requestedState = normalized?.contractState;
  const requestedAction = normalized?.nextAction;
  if (!requestedState && !requestedAction) {
    return defaultContractOutcome;
  }
  const {
    contractState: defaultState,
    nextAction: defaultAction,
  } = defaultContractOutcome;
  return buildOwnerContractOutcome({
    contractState: selectNonEmptyString(requestedState, defaultState),
    nextAction: selectNonEmptyString(requestedAction, defaultAction),
  });
}

function isProceedingContractOutcome(outcome) {
  return (
    outcome.contractState === OWNER_CONTRACT_STATE.READY ||
    outcome.contractState === OWNER_CONTRACT_STATE.UNDER_REPLICATED ||
    outcome.nextAction === OWNER_CONTRACT_NEXT_ACTION.PROCEED
  );
}

function resolveProvisioningContractOutcome(normalized, convergence) {
  const defaultContractOutcome =
    buildDefaultProvisioningContractOutcome(convergence);
  const requestedContractOutcome = resolveRequestedProvisioningContractOutcome(
    normalized,
    defaultContractOutcome,
  );
  if (!convergence.writableMinimumSatisfied) {
    return isProceedingContractOutcome(requestedContractOutcome) ?
      defaultContractOutcome :
      requestedContractOutcome;
  }
  const claimedReadyWhileUnderReplicated =
    !convergence.fullReplicaCountConverged &&
    requestedContractOutcome.contractState === OWNER_CONTRACT_STATE.READY &&
    requestedContractOutcome.nextAction === OWNER_CONTRACT_NEXT_ACTION.PROCEED;
  return claimedReadyWhileUnderReplicated ?
    defaultContractOutcome :
    requestedContractOutcome;
}

function resolveFullReplicaCountConverged(
  normalized,
  {
    writableMinimumSatisfied,
    requestedReplicaCount,
    routableReplicaCount,
    committedReplicaCount,
  },
) {
  if (!writableMinimumSatisfied) {
    return false;
  }
  const observedConverged =
    !isPositiveInteger(requestedReplicaCount) ||
    (routableReplicaCount >= requestedReplicaCount &&
      committedReplicaCount >= requestedReplicaCount);
  if (typeof normalized.fullReplicaCountConverged === BOOLEAN_TYPE) {
    return normalized.fullReplicaCountConverged && observedConverged;
  }
  return observedConverged;
}

function resolveMissingReplicaCount(
  normalized,
  requestedReplicaCount,
  committedReplicaCount,
) {
  if (Number.isInteger(normalized.missingReplicaCount)) {
    return normalized.missingReplicaCount;
  }
  if (!isPositiveInteger(requestedReplicaCount)) {
    return 0;
  }
  return Math.max(0, requestedReplicaCount - committedReplicaCount);
}

function resolveRetryAfterMs(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function buildProvisioningCompletionSummary(options = null, context = {}) {
  const hasObservedResultObject = Boolean(
    options && typeof options === OBJECT_TYPE,
  );
  const normalized = hasObservedResultObject ? options : {};
  const requestedReplicaCount = firstPositiveInteger(
    context?.replicaCount,
    normalized.requestedReplicaCount,
  );
  const resolvedReplicaCount = firstPositiveInteger(
    normalized.resolvedReplicaCount,
    requestedReplicaCount,
  );
  const minimumRoutableReplicaCount = firstPositiveInteger(
    normalized.minimumRoutableReplicaCount,
    context?.minimumRoutableReplicaCount,
  );

  const {
    hasObservedReplicaCounts,
    routableReplicaCount,
    committedReplicaCount,
  } = resolveObservedReplicaCounts(normalized, hasObservedResultObject);

  const writableMinimumSatisfied =
    hasObservedReplicaCounts &&
    isProvisioningWritableMinimumSatisfied({
      routableReplicaCount,
      committedReplicaCount,
      minimumRoutableReplicaCount,
    });
  const fullReplicaCountConverged = resolveFullReplicaCountConverged(
    normalized,
    {
      writableMinimumSatisfied,
      requestedReplicaCount,
      routableReplicaCount,
      committedReplicaCount,
    },
  );
  const contractOutcome = resolveProvisioningContractOutcome(normalized, {
    writableMinimumSatisfied,
    fullReplicaCountConverged,
  });

  return {
    requestedReplicaCount,
    resolvedReplicaCount,
    minimumRoutableReplicaCount,
    routableReplicaCount,
    committedReplicaCount,
    missingReplicaCount: resolveMissingReplicaCount(
      normalized,
      requestedReplicaCount,
      committedReplicaCount,
    ),
    epoch: normalized.epoch || null,
    fullReplicaCountConverged,
    contractState: contractOutcome.contractState,
    nextAction: contractOutcome.nextAction,
    reasonCodes: Array.isArray(normalized.reasonCodes) ?
      [...normalized.reasonCodes] :
      [],
    retryAfterMs: resolveRetryAfterMs(normalized.retryAfterMs),
  };
}

export {
  buildProvisioningCompletionSummary,
  isProvisioningWritableMinimumSatisfied,
};
