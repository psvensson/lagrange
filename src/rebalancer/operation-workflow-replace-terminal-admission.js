/**
 * Owner contract:
 * Owner: the REPLACE owner's admission of terminal writes (quest
 * replace-source-removal-owner; D2, R11, A11.1).
 * Inputs: the operation's durable step (authoritative read), the owner's
 * R-1a verdict, and the options a terminal was admitted with.
 * Canonical output: whether a FAILED of a partition REPLACE is admitted and
 * the step CAS its write carries; whether the terminal-transition repair may
 * re-assert a retained REPLACE terminal.
 * Prohibited: no terminal is decided or written here.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  REPLACE_COMPLETION_VERDICT,
  REPLACE_POST_INTENT_FAILURE,
  decideReplaceCompletion,
  isPartitionReplace,
  isReplaceRemovalIntentDurable,
} from './operation-workflow-replace-owner.js';

const {OPERATION_WORKFLOW_OWNER_LITERAL, WORKFLOW_STEP} =
  OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * The step the operation's durable row holds, from the authoritative read;
 * when the authority cannot be read, the caller's copy - whose FAILED write
 * is then a CAS on exactly that step, so a copy that lags the durable intent
 * still cannot cross it. A caller's in-memory copy may lag the durable
 * removal intent; the D2 boundary is the row's.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Promise<string>}
 */
async function readReplaceDurableStep(owner, operation) {
  const authoritative = typeof owner.repository
    ?.queryReplicaOperationPersistenceAuthorityOperation ===
      OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION ?
    await owner.repository.queryReplicaOperationPersistenceAuthorityOperation(
      operation) : null;
  return authoritative?.workflowStep || operation.workflowStep;
}

/**
 * D2's admission of a terminal FAILED for a partition REPLACE, decided on
 * the DURABLE step: before the durable intent every existing failure
 * applies; after it, only target death with the source still a voter. The
 * admitted write is a CAS on the step it was admitted against, so a copy
 * that read before the intent landed cannot write FAILED past it.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} options - failOperation options.
 * @return {Promise<Object>} Frozen {admitted, expectedWorkflowStep}.
 */
async function admitReplaceTerminalFailure(owner, operation, options = {}) {
  const durableStep = await readReplaceDurableStep(owner, operation);
  const admitted = !isReplaceRemovalIntentDurable(
    {...operation, workflowStep: durableStep}) ||
    options?.replacePostIntentFailure ===
      REPLACE_POST_INTENT_FAILURE.TARGET_DEAD_SOURCE_RETAINED;
  return Object.freeze({admitted, expectedWorkflowStep: durableStep});
}

/**
 * R11 / A11.1: the terminal-transition repair re-asserts a retained terminal
 * projection later; for a partition REPLACE it is never a second route to a
 * terminal. A retained REMOVED is re-decided by R-1a now; a retained FAILED
 * is written only as the CAS it was admitted with, and only while the
 * durable row still holds that step.
 * @param {Object} owner
 * @param {Object} projectedOperation - The retained terminal projection.
 * @param {Object} persistOptions - The options the terminal was admitted
 *   with ({expectedWorkflowStep} for a REPLACE FAILED).
 * @return {Promise<boolean>} Whether the repair may re-assert it.
 */
async function isReplaceTerminalRepairAdmitted(owner, projectedOperation,
  persistOptions = {}) {
  if (!isPartitionReplace(projectedOperation)) {
    return true;
  }
  if (projectedOperation.workflowStep === WORKFLOW_STEP.REMOVED) {
    const decision = await decideReplaceCompletion(owner, projectedOperation);
    return decision.verdict === REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED;
  }
  const expectedStep = persistOptions.expectedWorkflowStep;
  return typeof expectedStep === 'string' &&
    await readReplaceDurableStep(owner, projectedOperation) === expectedStep;
}

export {
  admitReplaceTerminalFailure,
  isReplaceTerminalRepairAdmitted,
  readReplaceDurableStep,
};
