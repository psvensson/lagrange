// Pure provisioning-completion summary shared by the initial-partition
// provisioning flow: normalizes the requested/resolved/minimum/routable
// replica counts and derives the completion contract outcome, answering
// UNDER_REPLICATED while the full requested replica count has not converged
// and the quorum minimum is reached (the quorum-minimum create itself proceeds;
// full convergence is the rebalancer's post-join obligation - round-14/F10).
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';

const {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} = SQL_QUERY_ENGINE_SHARED;

function buildProvisioningCompletionSummary(options = {}) {
  const requestedReplicaCount =
    Number.isInteger(options?.requestedReplicaCount) &&
    options.requestedReplicaCount > 0 ?
      options.requestedReplicaCount :
      null;
  const resolvedReplicaCount =
    Number.isInteger(options?.resolvedReplicaCount) &&
    options.resolvedReplicaCount > 0 ?
      options.resolvedReplicaCount :
      requestedReplicaCount;
  const minimumRoutableReplicaCount =
    Number.isInteger(options?.minimumRoutableReplicaCount) &&
    options.minimumRoutableReplicaCount > 0 ?
      options.minimumRoutableReplicaCount :
      resolvedReplicaCount;
  const routableReplicaCount =
    Number.isInteger(options?.routableReplicaCount) &&
    options.routableReplicaCount >= 0 ?
      options.routableReplicaCount :
      0;
  const fullReplicaCountConverged =
    !Number.isInteger(requestedReplicaCount) ||
    requestedReplicaCount <= 0 ||
    routableReplicaCount >= requestedReplicaCount;
  const defaultContractOutcome = buildOwnerContractOutcome({
    contractState: fullReplicaCountConverged ?
      OWNER_CONTRACT_STATE.READY :
      OWNER_CONTRACT_STATE.UNDER_REPLICATED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
  });
  const requestedContractOutcome = options?.contractState ?
    buildOwnerContractOutcome({
      contractState: options.contractState,
      nextAction: options?.nextAction || defaultContractOutcome.nextAction,
    }) :
    defaultContractOutcome;
  const contractOutcome =
    fullReplicaCountConverged === false &&
    requestedContractOutcome.contractState === OWNER_CONTRACT_STATE.READY &&
    requestedContractOutcome.nextAction === OWNER_CONTRACT_NEXT_ACTION.PROCEED ?
      defaultContractOutcome :
      requestedContractOutcome;

  const committedReplicaCount = routableReplicaCount;
  const missingReplicaCount = Number.isInteger(requestedReplicaCount) ?
    Math.max(0, requestedReplicaCount - committedReplicaCount) :
    0;

  return {
    requestedReplicaCount,
    resolvedReplicaCount,
    minimumRoutableReplicaCount,
    routableReplicaCount,
    committedReplicaCount,
    missingReplicaCount,
    epoch: options?.epoch || null,
    fullReplicaCountConverged,
    contractState: contractOutcome.contractState,
    nextAction: contractOutcome.nextAction,
    reasonCodes: Array.isArray(options?.reasonCodes) ?
      [...options.reasonCodes] :
      [],
    retryAfterMs:
      Number.isFinite(options?.retryAfterMs) &&
      options.retryAfterMs > 0 ?
        Math.floor(options.retryAfterMs) :
        0,
  };
}

export {buildProvisioningCompletionSummary};
