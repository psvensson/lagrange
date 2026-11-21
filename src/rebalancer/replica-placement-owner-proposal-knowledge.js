// Public entry: createProposalProgress, recordProposalHandover, recordProposalAnswer, classifyCandidateFailure, CANDIDATE_FAILED, REPLICA_PLACEMENT_PASS_ABORTED.
// Required collaborators: none (the owner hands the pass record and the proposal's progress).
// Durable authority / commit point: none - it classifies what the owner knows of one proposal.
// Permitted post-commit work: none.
// Recovery / wake entry: none (an aborted pass's triggers are retained by the owner's drain).
// Representative production tests: test/rebalancer/placement-owner-authority-wakes.test.js.
//
// A candidate's failure is classified by what is KNOWN about its proposal,
// never by where the exception surfaced (corrective round 2, item 2):
// - nothing was handed over, or the answer is a definite non-admission (a
//   committed refusal, the tenure fence, a typed refusal before proposing):
//   CANDIDATE_FAILED, recorded for the candidate; the pass goes on;
// - the answer is ADMITTED and a later local step threw: the admission stands,
//   recorded as admitted, the local failure recorded apart; the pass aborts
//   (its census no longer holds);
// - handed over with no answer known (the submission threw, or its outcome is
//   unknown): the attempt stays retained for the uncertain-attempt
//   reconciliation; the pass aborts.
import {PLACEMENT_RESULT_FIELD} from '../partition/partition-placement-admission-constants.js';
import {isWriteOutcomeUnknown} from '../partition/partition-write-kernel.js';
import {PLACEMENT_OUTCOME} from './replica-placement-owner-constants.js';
import {
  recordAdmittedOperation, recordCandidateFailure, recordLocalFailureAfterAdmission,
  recordUncertainCandidate,
} from './replica-placement-owner-pass-observation.js';

const PROPOSAL_STAGE = Object.freeze({
  NOT_HANDED_OVER: 'NOT_HANDED_OVER',
  HANDED_OVER: 'HANDED_OVER',
  ANSWERED: 'ANSWERED',
});
const PROPOSAL_KNOWLEDGE = Object.freeze({
  NOT_PROPOSED: 'NOT_PROPOSED',
  REFUSED: 'REFUSED',
  ADMITTED: 'ADMITTED',
  UNCERTAIN: 'UNCERTAIN',
});
// The typed answer of a candidate that failed before or without an admission.
const CANDIDATE_FAILED = Object.freeze({state: 'CANDIDATE_FAILED'});
const REPLICA_PLACEMENT_PASS_ABORTED = 'REPLICA_PLACEMENT_PASS_ABORTED';

function createProposalProgress() {
  return {stage: PROPOSAL_STAGE.NOT_HANDED_OVER, answer: null};
}

// Immediately before a submission: from here on the entry may be proposed.
function recordProposalHandover(progress) {
  progress.stage = PROPOSAL_STAGE.HANDED_OVER;
  progress.answer = null;
}

function recordProposalAnswer(progress, answer) {
  progress.stage = PROPOSAL_STAGE.ANSWERED;
  progress.answer = answer;
}

function proposalKnowledgeOf(progress) {
  if (progress.stage === PROPOSAL_STAGE.NOT_HANDED_OVER) return PROPOSAL_KNOWLEDGE.NOT_PROPOSED;
  if (progress.stage === PROPOSAL_STAGE.HANDED_OVER ||
      isWriteOutcomeUnknown(progress.answer)) {
    return PROPOSAL_KNOWLEDGE.UNCERTAIN;
  }
  return progress.answer?.[PLACEMENT_RESULT_FIELD]?.outcome === PLACEMENT_OUTCOME.ADMITTED ?
    PROPOSAL_KNOWLEDGE.ADMITTED : PROPOSAL_KNOWLEDGE.REFUSED;
}

function passAbortOf(partitionId, knowledge, cause) {
  const error = new Error(`Replica placement pass aborted: candidate ${partitionId} ` +
    `${knowledge}: ${cause?.message ?? String(cause)}`, {cause});
  error.code = REPLICA_PLACEMENT_PASS_ABORTED;
  error.partitionId = partitionId;
  error.knowledge = knowledge;
  return error;
}

/**
 * Classify one candidate's failure by what is known of its proposal.
 * @param {Object} pass - The pass record.
 * @param {string} partitionId - The candidate's partition.
 * @param {Object} progress - The candidate's proposal progress.
 * @param {*} error - What the candidate's step threw.
 * @return {Object} CANDIDATE_FAILED when the pass goes on.
 * @throws {Error} REPLICA_PLACEMENT_PASS_ABORTED when the pass must abort.
 */
function classifyCandidateFailure(pass, partitionId, progress, error) {
  const knowledge = proposalKnowledgeOf(progress);
  if (knowledge === PROPOSAL_KNOWLEDGE.NOT_PROPOSED || knowledge === PROPOSAL_KNOWLEDGE.REFUSED) {
    recordCandidateFailure(pass, partitionId, error);
    return CANDIDATE_FAILED;
  }
  if (knowledge === PROPOSAL_KNOWLEDGE.ADMITTED) {
    const [operationId] = progress.answer[PLACEMENT_RESULT_FIELD].operationIds;
    recordAdmittedOperation(pass, operationId);
    recordLocalFailureAfterAdmission(pass, partitionId, operationId, error);
  } else {
    recordUncertainCandidate(pass, partitionId, error);
  }
  throw passAbortOf(partitionId, knowledge, error);
}

export {
  CANDIDATE_FAILED,
  REPLICA_PLACEMENT_PASS_ABORTED,
  classifyCandidateFailure,
  createProposalProgress,
  recordProposalAnswer,
  recordProposalHandover,
};
