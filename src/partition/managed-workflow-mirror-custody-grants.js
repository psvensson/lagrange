/**
 * The source mirror custody grants a split or merge workflow record owes
 * (`metadata.mirrorCustodyGrants`): which record change answers must keep
 * them, and when a source's committed release receipt discharges one. Pure
 * decisions over decoded records; managed-workflow-record-store.js applies
 * them at the record's turn.
 */
import {MIRROR_RETENTION_CUSTODY_ACTION} from './partition-committed-statement-outcome-constants.js';
import {WORKFLOW_FAMILY, endsSourceExecutionAttempt} from './partition-constants.js';
import {validMirrorCustody} from './partition-mirror-custody-codec.js';
import {generationOf, storedRecordOf} from './managed-workflow-record-bytes.js';

const MIRROR_RELEASE_ACK_ERROR = Object.freeze({
  MISMATCH_MESSAGE: 'Mirror release acknowledgement does not match terminal workflow',
  UNRESOLVED_MESSAGE: 'Committed mirror release awaiting workflow acknowledgement',
  UNRESOLVED_CODE: 'MIRROR_RELEASE_ACK_UNCONFIRMED',
});

// Why a committed release could not be acknowledged on the record yet.
const MIRROR_RELEASE_UNRESOLVED = Object.freeze({
  ROW_UNAVAILABLE: 'authoritative-row-unavailable',
  GENERATION_BEHIND: 'authoritative-generation-behind',
  WORKFLOW_IDENTITY_CHANGED: 'workflow-identity-changed',
  RELEASE_AUTHORIZATION_CHANGED: 'release-authorization-changed',
  CONDITIONAL_WRITE_UNCONFIRMED: 'conditional-write-unconfirmed',
});

// The grant a release receipt names: its source partition at its fence.
function isGrantOfReceipt(grant, {partitionId, custody}) {
  return grant.partitionId === partitionId && grant.fence === custody.workflowFenceToken;
}

// A grant may be released once the owner marked it, or once its source
// execution attempt ended.
function isReleaseAuthorized(grant, metadata, state) {
  return grant.release || (metadata.mirrorExecutionEnded && endsSourceExecutionAttempt(state));
}

/**
 * Whether a committed release receipt does not match the terminal workflow
 * record it is acknowledged on.
 * @param {Object} receipt - {partitionId, custody, action, logIndex}.
 * @param {Object} metadata - The record's decoded metadata.
 * @param {string|null} state - The record's state.
 * @return {boolean}
 */
function releaseReceiptMismatches(receipt, metadata, state) {
  const {partitionId, custody, action, logIndex} = receipt;
  return action !== MIRROR_RETENTION_CUSTODY_ACTION.RELEASE || !validMirrorCustody(custody) ||
      !(BigInt(logIndex) > 0n) ||
      custody.workflowId !== metadata.workflowId ||
      custody.workflowAttempt !== metadata.workflowAttempt ||
      custody.targetPartitionVersion !== metadata.targetPartitionVersion ||
      !(custody.family === WORKFLOW_FAMILY.SPLIT ? metadata.sourcePartitionId === partitionId :
        metadata.sourcePartitionIds?.includes(partitionId)) ||
      !metadata.mirrorCustodyGrants?.some((grant) =>
        isGrantOfReceipt(grant, receipt) && isReleaseAuthorized(grant, metadata, state));
}

// A change answer that drops an owed grant, or weakens its acquired or
// release mark, while the source's ACK races (the answer is a record).
function dropsOwedGrant(priorMetadata, answer) {
  const grants = priorMetadata?.mirrorCustodyGrants;
  return grants?.length && grants.some((owed) => !answer.metadata?.mirrorCustodyGrants?.some(
    (grant) => grant.partitionId === owed.partitionId && grant.fence === owed.fence &&
      (!owed.acquired || grant.acquired) && (!owed.release || grant.release)));
}

// A change answer that would turn the ended attempt back into executable work.
function reopensEndedAttempt(priorMetadata, answer) {
  return priorMetadata?.mirrorExecutionEnded &&
    answer.metadata?.workflowAttempt === priorMetadata.workflowAttempt &&
    !endsSourceExecutionAttempt(answer.status);
}

// A change answer that ends the source execution attempt while grants are owed.
function endsAttemptOwingGrants(priorMetadata, answer) {
  return priorMetadata?.mirrorCustodyGrants?.length && endsSourceExecutionAttempt(answer.status);
}

// A scheduled retry registers a fresh attempt. The old source's grant stays
// addressable even if the retry is due before RELEASE commits.
function withEndedMirrorExecution(answer) {
  return {...answer, metadata: {...answer.metadata, mirrorExecutionEnded: true}};
}

// One release attempt on `base` (the store's attempt `attempt` of at most
// `maxAttempts`): why it cannot be decided, the receipt's grant already gone
// (`done`), or the record without that grant.
function releaseAttemptOf(base, row, receipt, attempt, maxAttempts) {
  const {custody} = receipt;
  if (!base) return {unresolved: MIRROR_RELEASE_UNRESOLVED.ROW_UNAVAILABLE};
  if (generationOf(base) < generationOf(row)) {
    return {unresolved: MIRROR_RELEASE_UNRESOLVED.GENERATION_BEHIND};
  }
  const current = storedRecordOf(base);
  if (current.workflowId !== custody.workflowId ||
      current.metadata.workflowAttempt !== custody.workflowAttempt ||
      current.metadata.targetPartitionVersion !== custody.targetPartitionVersion) {
    return {unresolved: MIRROR_RELEASE_UNRESOLVED.WORKFLOW_IDENTITY_CHANGED};
  }
  const grant = current.metadata.mirrorCustodyGrants.find((item) =>
    isGrantOfReceipt(item, receipt));
  if (!grant) return {done: true};
  if (!isReleaseAuthorized(grant, current.metadata, current.state)) {
    return {unresolved: MIRROR_RELEASE_UNRESOLVED.RELEASE_AUTHORIZATION_CHANGED};
  }
  if (attempt === maxAttempts) {
    return {unresolved: MIRROR_RELEASE_UNRESOLVED.CONDITIONAL_WRITE_UNCONFIRMED};
  }
  const remaining = current.metadata.mirrorCustodyGrants.filter((item) =>
    !isGrantOfReceipt(item, receipt));
  return {current, remaining};
}

/**
 * The typed error of a committed release the record could not acknowledge.
 * @param {Object} receipt - {partitionId, custody}.
 * @param {string} reason - MIRROR_RELEASE_UNRESOLVED.
 * @param {Object|undefined} observation - The last attempt's observation.
 * @return {Error}
 */
function mirrorReleaseUnresolvedError({partitionId, custody}, reason, observation) {
  return Object.assign(new Error(MIRROR_RELEASE_ACK_ERROR.UNRESOLVED_MESSAGE, {
    cause: observation?.cause,
  }), {
    code: MIRROR_RELEASE_ACK_ERROR.UNRESOLVED_CODE, partitionId, workflowId: custody.workflowId,
    workflowAttempt: custody.workflowAttempt, fence: custody.workflowFenceToken,
    reason, observation,
  });
}

export {
  MIRROR_RELEASE_ACK_ERROR,
  MIRROR_RELEASE_UNRESOLVED,
  dropsOwedGrant,
  endsAttemptOwingGrants,
  mirrorReleaseUnresolvedError,
  releaseAttemptOf,
  releaseReceiptMismatches,
  reopensEndedAttempt,
  withEndedMirrorExecution,
};
