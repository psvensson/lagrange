/**
 * Owner contract:
 * Owner: the remove-safety floor's committed-voter credit for a partition
 * REPLACE's source removal. The floor protects one thing: after the source
 * leaves, enough of the remaining committed voters are live to keep the
 * group's quorum and its replication minimum. Whether a remaining voter is
 * live is a Raft fact - it is a voter of the leader's CURRENT committed
 * configuration and its own port answered at the leader's term, past its
 * participation gate. A node's ready lease is a control-plane serve state:
 * during formation it is withheld until the priority spread that this very
 * removal completes, so it can never be a precondition of the removal
 * (authority-and-recovery: recovery must not depend on the condition it
 * restores).
 * Inputs: the committed-node floor's node-ready rows (the sealed
 * committed-node credit, unchanged); the REPLACE completion authority with
 * the voters' confirming answers (readReplaceCorroboratedConfiguration), read
 * at most once per evaluation and only when a remaining voter row - or the
 * replacement - is not credited by its node.
 * Canonical output: one frozen credit {state, reason, creditedRows,
 * replacementCommittedLiveVoter}. NOT_REQUIRED when every remaining voter row
 * is already credited; READY with the rows the committed evidence credits;
 * UNAVAILABLE with the typed reason when that evidence cannot be read (no
 * router, no leader answer, an uncorroborated or lagging leader, a joint
 * configuration) - then nothing is credited and the floor waits.
 * Prohibited: no row, cache or readiness projection is read as membership or
 * liveness here; an absent dependency never credits; no decision is taken
 * here (the evaluator applies the floor).
 */
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../partition/partition-replica-membership-constants.js';
import {
  readReplaceCorroboratedConfiguration,
} from './operation-workflow-replace-surviving-membership.js';

const COMMITTED_VOTER_CREDIT_STATE = Object.freeze({
  NOT_REQUIRED: 'not_required',
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
});

const COMMITTED_VOTER_CREDIT_REASON = Object.freeze({
  // Nothing is waited for (NOT_REQUIRED and READY).
  NONE: 'none',
  // The leader's configuration is joint: the remaining voter set is not one
  // set yet, and no further conf change is admitted until it leaves.
  JOINT_CONFIGURATION: 'committed_voter_configuration_joint',
  // The completion authority answered UNAVAILABLE without naming why.
  AUTHORITY_UNAVAILABLE: 'committed_voter_authority_unavailable',
});

const NO_CREDITED_ROWS = Object.freeze([]);

const COMMITTED_VOTER_CREDIT_NOT_REQUIRED = Object.freeze({
  state: COMMITTED_VOTER_CREDIT_STATE.NOT_REQUIRED,
  reason: COMMITTED_VOTER_CREDIT_REASON.NONE,
  creditedRows: NO_CREDITED_ROWS,
  replacementCommittedLiveVoter: false,
});

function creditUnavailable(reason) {
  return Object.freeze({
    state: COMMITTED_VOTER_CREDIT_STATE.UNAVAILABLE,
    reason,
    creditedRows: NO_CREDITED_ROWS,
    replacementCommittedLiveVoter: false,
  });
}

// The replica identities the committed evidence proves live: voters of the
// leader's current (non-joint) configuration whose own answer confirmed the
// leader's term with an open participation gate; or the UNAVAILABLE credit
// with the typed reason when the evidence cannot be read.
async function readCommittedLiveVoters(owner, operation) {
  const {authority, confirmingVoterAnswers} =
    await readReplaceCorroboratedConfiguration(owner, operation);
  if (authority.state === PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE) {
    return creditUnavailable(typeof authority.reason === 'string' ?
      authority.reason :
      COMMITTED_VOTER_CREDIT_REASON.AUTHORITY_UNAVAILABLE);
  }
  if (authority.votersOutgoingReplicaIds.length > 0) {
    return creditUnavailable(
      COMMITTED_VOTER_CREDIT_REASON.JOINT_CONFIGURATION);
  }
  const liveVoterIds = new Set();
  for (const replicaId of authority.voterReplicaIds) {
    if (confirmingVoterAnswers.get(replicaId)?.gateOpen === true) {
      liveVoterIds.add(replicaId);
    }
  }
  return {state: COMMITTED_VOTER_CREDIT_STATE.READY, liveVoterIds};
}

/**
 * Credit the remaining voter rows the committed-node floor did not: the rows
 * whose replica is a live committed voter by the group's own evidence.
 * @param {Object} owner - The operation workflow owner.
 * @param {Object} operation - The partition REPLACE in a remove-dispatch
 *   phase.
 * @param {Object} input
 * @param {Object[]} input.criticalReplicaRows - The partition's authoritative
 *   replica rows (candidates only; never membership).
 * @param {Object[]} input.nodeReadyRows - The rows the committed-node floor
 *   already credits.
 * @param {string} input.sourceReplicaId - The REPLACE source (never
 *   credited: it is the replica leaving).
 * @param {Object|null} input.replacementReplicaRow
 * @param {Object} input.removeSafetyReadiness - The strict participation
 *   read's dimension: a replacement that already passes it needs no credit.
 * @return {Promise<Object>} The frozen credit.
 */
async function resolveCommittedVoterCredit(owner, operation, input) {
  const candidateRows = input.criticalReplicaRows.filter((row) =>
    owner.isVoterReadyReplicaTopology(row) &&
    !owner.isOperationReplicaRow(row, {
      ...operation,
      replicaId: input.sourceReplicaId,
    }) &&
    !input.nodeReadyRows.includes(row));
  const replacementRow = input.replacementReplicaRow;
  const replacementNeedsEvidence =
    replacementRow !== null &&
    owner.isVoterReadyReplicaTopology(replacementRow) &&
    !owner.isVoterReadyRoutableReplica(
      replacementRow, input.removeSafetyReadiness);
  if (candidateRows.length === 0 && !replacementNeedsEvidence) {
    return COMMITTED_VOTER_CREDIT_NOT_REQUIRED;
  }
  const evidence = await readCommittedLiveVoters(owner, operation);
  if (evidence.state === COMMITTED_VOTER_CREDIT_STATE.UNAVAILABLE) {
    return evidence;
  }
  const isLiveVoterRow = (row) =>
    evidence.liveVoterIds.has(owner.getReplicaRowIdentity(row));
  return Object.freeze({
    state: COMMITTED_VOTER_CREDIT_STATE.READY,
    reason: COMMITTED_VOTER_CREDIT_REASON.NONE,
    creditedRows: Object.freeze(candidateRows.filter(isLiveVoterRow)),
    replacementCommittedLiveVoter:
      replacementNeedsEvidence && isLiveVoterRow(replacementRow),
  });
}

/**
 * The typed suffix a floor deferral carries when the committed-voter evidence
 * it needed could not be read; empty otherwise.
 * @param {Object} credit - A resolveCommittedVoterCredit result.
 * @return {string}
 */
function describeCommittedVoterCreditWait(credit) {
  return credit.state === COMMITTED_VOTER_CREDIT_STATE.UNAVAILABLE ?
    `; committed voter evidence unavailable: ${credit.reason}` :
    '';
}

export {
  COMMITTED_VOTER_CREDIT_NOT_REQUIRED,
  describeCommittedVoterCreditWait,
  resolveCommittedVoterCredit,
};
