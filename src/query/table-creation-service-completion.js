import {NUM, TABLES} from '../constants/index.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from '../control-plane/owner-contract-outcome.js';
import {QUERY_OPERATION} from './query-constants.js';


const TABLE_CREATION_SERVICE_LITERAL = Object.freeze({
  BOOLEAN: 'boolean',
  FUNCTION: 'function',
  OBJECT: 'object',
  STRING: 'string',
  UPDATE: 'UPDATE',
  INSERT: 'INSERT',
  TABLE_POLICY_CHANGED: 'table_policy_changed',
  PARTITION_SIZE_CHANGED: 'partition_size_changed',
  EMPTY: ',',
  UNABLE_TO_RESTORE_MISSING_INITIAL_PARTITION_METADATA_FOR_TABLE:
    'Unable to restore missing initial partition metadata for table ',
  EXISTING_PARTITION_REPLICATION_POLICY_UNDECLARED:
    'Existing partition row declares no replication policy for table ',
  TABLE_CONSTRAINT: 'table_constraint',
  COLUMN_CONSTRAINT: 'column_constraint',
});
const TABLE_CREATION_SQL = Object.freeze({
  SELECT_TABLE_BY_NAME: `SELECT * FROM ${TABLES.TABLES} WHERE table_name = ? LIMIT 1`,
  SELECT_PARTITION_BY_ID: `SELECT * FROM ${TABLES.PARTITIONS} WHERE partition_id = ? LIMIT 1`,
});
const TABLE_CREATION_COMPLETION_STATE = Object.freeze({
  ACTIVE: 'active',
  PENDING_CREATION: 'pending_creation',
});
// The metadata half of CREATE TABLE answers from the commit of its routed
// writes; the only pending answer comes from provisioning convergence
// (quest replica-admission-from-committed-operation, attempt 2; the client
// words stay as they are until Group A's F10 vocabulary replaces them).
const TABLE_CREATION_COMPLETION_REASON = Object.freeze({
  REPLICA_CONVERGENCE_PENDING: 'replica_convergence_pending',
});
const TABLE_CREATION_CONTRACT_PRIORITY = Object.freeze({
  [OWNER_CONTRACT_STATE.READY]: 0,
  [OWNER_CONTRACT_STATE.UNDER_REPLICATED]: 1,
  [OWNER_CONTRACT_STATE.PENDING]: 2,
  [OWNER_CONTRACT_STATE.DEFERRED]: NUM.THREE,
  [OWNER_CONTRACT_STATE.BLOCKED]: NUM.FOUR,
  [OWNER_CONTRACT_STATE.FAILED]: 5,
});

function normalizeProvisioningSummary(provisioningResult = null, context = {}) {
  const requestedReplicaCount =
    Number.isInteger(context?.replicaCount) && context.replicaCount > 0 ?
      context.replicaCount :
      null;
  const minimumRoutableReplicaCount =
    Number.isInteger(context?.minimumRoutableReplicaCount) &&
    context.minimumRoutableReplicaCount > 0 ?
      context.minimumRoutableReplicaCount :
      null;
  const normalized =
    provisioningResult && typeof provisioningResult === 'object' ?
      provisioningResult :
      {};
  const resolvedReplicaCount =
    Number.isInteger(normalized?.resolvedReplicaCount) &&
    normalized.resolvedReplicaCount > 0 ?
      normalized.resolvedReplicaCount :
      requestedReplicaCount;
  const fallbackRoutableReplicaCount =
    Number.isInteger(minimumRoutableReplicaCount) &&
    minimumRoutableReplicaCount > 0 ?
      minimumRoutableReplicaCount :
      0;
  const routableReplicaCount =
    Number.isInteger(normalized?.routableReplicaCount) &&
    normalized.routableReplicaCount >= 0 ?
      normalized.routableReplicaCount :
      fallbackRoutableReplicaCount;
  const fullReplicaCountConverged =
    typeof normalized?.fullReplicaCountConverged ===
    TABLE_CREATION_SERVICE_LITERAL.BOOLEAN ?
      normalized.fullReplicaCountConverged :
      !Number.isInteger(requestedReplicaCount) ||
        requestedReplicaCount <= 0 ||
        routableReplicaCount >= requestedReplicaCount;
  const defaultProvisioningContractOutcome = buildOwnerContractOutcome({
    contractState: fullReplicaCountConverged ?
      OWNER_CONTRACT_STATE.READY :
      OWNER_CONTRACT_STATE.UNDER_REPLICATED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
  });
  const requestedProvisioningContractOutcome = buildOwnerContractOutcome({
    contractState:
      normalized?.contractState ||
      defaultProvisioningContractOutcome.contractState,
    nextAction:
      normalized?.nextAction || defaultProvisioningContractOutcome.nextAction,
  });
  const provisioningContractOutcome =
    fullReplicaCountConverged === false &&
    requestedProvisioningContractOutcome.contractState ===
      OWNER_CONTRACT_STATE.READY &&
    requestedProvisioningContractOutcome.nextAction ===
      OWNER_CONTRACT_NEXT_ACTION.PROCEED ?
      defaultProvisioningContractOutcome :
      requestedProvisioningContractOutcome;
  const committedReplicaCount = routableReplicaCount;
  const missingReplicaCount =
    Number.isInteger(normalized?.missingReplicaCount) ?
      normalized.missingReplicaCount :
      Number.isInteger(requestedReplicaCount) ?
        Math.max(0, requestedReplicaCount - committedReplicaCount) :
        0;
  return {
    requestedReplicaCount,
    resolvedReplicaCount,
    minimumRoutableReplicaCount:
      Number.isInteger(normalized?.minimumRoutableReplicaCount) &&
      normalized.minimumRoutableReplicaCount > 0 ?
        normalized.minimumRoutableReplicaCount :
        minimumRoutableReplicaCount,
    routableReplicaCount,
    committedReplicaCount,
    missingReplicaCount,
    epoch: normalized?.epoch || null,
    fullReplicaCountConverged,
    contractState: provisioningContractOutcome.contractState,
    nextAction: provisioningContractOutcome.nextAction,
    reasonCodes: Array.isArray(normalized?.reasonCodes) ?
      [...normalized.reasonCodes] :
      [],
    retryAfterMs:
      Number.isFinite(normalized?.retryAfterMs) &&
      normalized.retryAfterMs > 0 ?
        Math.floor(normalized.retryAfterMs) :
        0,
  };
}

// Metadata committed: the metadata half is ready.
const METADATA_COMMITTED_CONTRACT_OUTCOME = buildOwnerContractOutcome({
  contractState: OWNER_CONTRACT_STATE.READY,
  nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
});

function pickStrongerTableCreationContractOutcome(currentOutcome, nextOutcome) {
  if (!currentOutcome) {
    return nextOutcome;
  }
  if (!nextOutcome) {
    return currentOutcome;
  }
  const currentPriority =
    TABLE_CREATION_CONTRACT_PRIORITY[currentOutcome.contractState] ??
    Number.NEGATIVE_INFINITY;
  const nextPriority =
    TABLE_CREATION_CONTRACT_PRIORITY[nextOutcome.contractState] ??
    Number.NEGATIVE_INFINITY;
  return nextPriority > currentPriority ? nextOutcome : currentOutcome;
}

function buildTableCreationCompletionDecision(decision) {
  return decision;
}

function resolveTableCreationProvisioningCompletionDecision(
  contractOutcome,
  provisioningContractOutcome,
) {
  const selectedContractOutcome = provisioningContractOutcome ?
    pickStrongerTableCreationContractOutcome(
      contractOutcome,
      provisioningContractOutcome,
    ) :
    contractOutcome;
  const readyContractOutcome =
    selectedContractOutcome.contractState === OWNER_CONTRACT_STATE.READY ?
      buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      }) :
      selectedContractOutcome;
  return buildTableCreationCompletionDecision({
    completionState: TABLE_CREATION_COMPLETION_STATE.PENDING_CREATION,
    completionReason:
      TABLE_CREATION_COMPLETION_REASON.REPLICA_CONVERGENCE_PENDING,
    contractOutcome: readyContractOutcome,
  });
}

function resolveTableCreationCompletionDecision(
  provisioningSummary,
  contractOutcome,
  provisioningContractOutcome,
) {
  if (
    provisioningSummary &&
    provisioningSummary.fullReplicaCountConverged === false
  ) {
    if (
      provisioningContractOutcome?.contractState ===
      OWNER_CONTRACT_STATE.UNDER_REPLICATED
    ) {
      return buildTableCreationCompletionDecision({
        completionState: TABLE_CREATION_COMPLETION_STATE.ACTIVE,
        completionReason: null,
        contractOutcome: provisioningContractOutcome,
      });
    }
    return resolveTableCreationProvisioningCompletionDecision(
      contractOutcome,
      provisioningContractOutcome,
    );
  }
  return buildTableCreationCompletionDecision({
    completionState: TABLE_CREATION_COMPLETION_STATE.ACTIVE,
    completionReason: null,
    contractOutcome,
  });
}

function resolveTableCreationCompletion(options = {}) {
  const provisioningSummary = options?.provisioningSummary || null;
  const provisioningContractOutcome =
    provisioningSummary &&
    typeof provisioningSummary === TABLE_CREATION_SERVICE_LITERAL.OBJECT ?
      buildOwnerContractOutcome({
        contractState: provisioningSummary.contractState,
        nextAction: provisioningSummary.nextAction,
      }) :
      null;
  const contractOutcome = METADATA_COMMITTED_CONTRACT_OUTCOME;
  const completionDecision = resolveTableCreationCompletionDecision(
    provisioningSummary,
    contractOutcome,
    provisioningContractOutcome,
  );
  return {
    completionState: completionDecision.completionState,
    completionReason: completionDecision.completionReason,
    contractState: completionDecision.contractOutcome.contractState,
    nextAction: completionDecision.contractOutcome.nextAction,
  };
}

function buildCreateTableSuccessResult(options = {}) {
  return {
    success: true,
    operation: QUERY_OPERATION.CREATE_TABLE,
    ...options,
  };
}

export {
  TABLE_CREATION_SERVICE_LITERAL,
  TABLE_CREATION_SQL,
  buildCreateTableSuccessResult,
  normalizeProvisioningSummary,
  resolveTableCreationCompletion,
};
