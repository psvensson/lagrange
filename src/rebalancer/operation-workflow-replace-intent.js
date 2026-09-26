/**
 * Owner contract:
 * Owner: the REPLACE owner's removal-intent boundary and its C0 (quest
 * replace-source-removal-owner, amendment-1 step 3, D2; T4b item 2).
 * Inputs: the operation (its type, entity, step and durable step history);
 * the durable row, read through the repository's authority read.
 * Canonical output: whether an operation is a partition REPLACE, whether its
 * removal intent is durable, the witness commit index C0 recorded with the
 * first intent (NaN at STOPPING without a recorded intent; the floor before
 * the boundary), whether the intent recorded the source unreachable.
 * Prohibited: no decision and no write.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  REPLACE_INTENT_FIELD,
  replaceIntentEntryOf,
} from './operation-workflow-replace-owner-state.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  SERVICE_TYPE,
  WORKFLOW_STEP,
} = OPERATION_WORKFLOW_OWNER_SHARED;

// The commit-index floor of R-1a before any removal intent exists.
const PRE_INTENT_COMMIT_INDEX_FLOOR = 0;

/**
 * Whether this operation is a REPLACE of a partition replica (the C1/D2
 * contract is about raft membership; runtime-service and message-group
 * REPLACEs keep their own owners).
 * @param {Object} operation
 * @return {boolean}
 */
function isPartitionReplace(operation) {
  return operation?.type === OperationType.REPLACE &&
    (operation?.entityType === undefined ||
      operation?.entityType === null ||
      operation?.entityType === SERVICE_TYPE.PARTITION);
}

/**
 * The durable removal-intent boundary (D2): the REPLACE has persisted
 * STOPPING, which is written before the REMOVE_REPLICA effect.
 * @param {Object} operation
 * @return {boolean}
 */
function isReplaceRemovalIntentDurable(operation) {
  return isPartitionReplace(operation) &&
    operation?.workflowStep === WORKFLOW_STEP.STOPPING;
}

// C0: the witness commit index recorded with the first removal intent. A
// REPLACE past the intent boundary (STOPPING) with no recorded intent has no
// C0 yet - NaN, which no commit index satisfies, until its owner records one.
// Before the boundary there is no intent to be stale against: the source's
// absence alone decides (the index floor is the lowest there is).
function witnessCommitIndexAtIntent(operation) {
  const entry = replaceIntentEntryOf(operation);
  if (entry !== null) {
    return Number(entry[REPLACE_INTENT_FIELD.WITNESS_COMMIT_INDEX]);
  }
  return isReplaceRemovalIntentDurable(operation) ?
    Number.NaN : PRE_INTENT_COMMIT_INDEX_FLOOR;
}

function isSourceUnreachableAtIntent(operation) {
  return replaceIntentEntryOf(operation)
    ?.[REPLACE_INTENT_FIELD.SOURCE_UNREACHABLE] === true;
}

// C0 is durable step metadata: a caller's copy that reached STOPPING
// without the intent entry (a projection that did not carry the history)
// reads it from the durable row.
async function resolveIntentCommitIndex(owner, operation) {
  const fromCopy = witnessCommitIndexAtIntent(operation);
  if (!Number.isNaN(fromCopy) ||
      typeof owner.repository
        ?.queryReplicaOperationPersistenceAuthorityOperation !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
    return fromCopy;
  }
  const durable = await owner.repository
    .queryReplicaOperationPersistenceAuthorityOperation(operation);
  return durable ? witnessCommitIndexAtIntent(durable) : fromCopy;
}

export {
  isPartitionReplace,
  isReplaceRemovalIntentDurable,
  isSourceUnreachableAtIntent,
  resolveIntentCommitIndex,
  witnessCommitIndexAtIntent,
};
