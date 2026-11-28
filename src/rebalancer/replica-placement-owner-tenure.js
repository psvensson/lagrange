// Public entry: createTenureCustody, isTermStartApplied, tenureFenceRefusal, PLACEMENT_TERM_START, PLACEMENT_TENURE_FENCE.
// Required collaborators: the ledger PartitionService (replica_operations-p1): its leadershipTenure and its consensus port's readStatus.
// Durable authority / commit point: none - the authority is the ledger's live consensus leadership; commits stay at the ledger's apply.
// Permitted post-commit work: none.
// Recovery / wake entry: a new custody per tenure (setLeader, TERM_CHANGE); the barrier's wake is the port's APPLIED_PROGRESS.
// Representative production tests: test/rebalancer/placement-owner-authority-tenure.test.js.
//
// The replica placement owner's custody of the ledger's leadership tenure
// (record reports/placement-owner-tenure-record.md). The tenure is the ledger
// replica's own leadershipTenure (src/raft/replica-leadership-state.js): a
// frozen {term} token minted at every leadership edge and every term the
// replica leads, null when it does not lead, compared by identity. A custody
// is the owner's service of one token: its term-start barrier, its one
// leadership-start reconciliation and its drain. A pass captures the custody
// at its start; it is current while the custody is the owner's and its token
// is the ledger's live token. Nothing here grants authority.
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../partition/partition-service-constants.js';
import {PLACEMENT_TRIGGER} from './replica-placement-owner-constants.js';
import {
  recordLeadershipStartDriveFailure, recordLeadershipStartDriveJoined,
} from './replica-placement-owner-pass-observation.js';

const LOG_START_DRIVE_FAILED = 'Replica placement leadership-start CDC drive failed';

// The custody's term-start barrier: its own term-start entry committed and
// applied on this replica, or not yet.
const PLACEMENT_TERM_START = Object.freeze({
  PENDING: 'PENDING',
  APPLIED: 'APPLIED',
});
// Why a submission was not handed to the write kernel.
const PLACEMENT_TENURE_FENCE = Object.freeze({
  TENURE_ENDED: 'TENURE_ENDED',
});

/**
 * The owner's custody of one leadership tenure of its ledger replica.
 * @param {Object} tenure - The ledger's live leadershipTenure token.
 * @return {Object} {tenure, termStart, reconciled, running, retainedTriggers}:
 *   retainedTriggers are those of a pass that threw, carried into the custody's
 *   next pass (started by the next wake: any trigger or the resync).
 */
function createTenureCustody(tenure) {
  return {tenure, termStart: PLACEMENT_TERM_START.PENDING, reconciled: false, running: null,
    retainedTriggers: new Set()};
}

/**
 * The term-start barrier from the ledger's own consensus progress: rs-raft's
 * currentTermApplied (raft-rs-status-observation.js: this replica leads and
 * its core applied past the index it held when it became leader, after the
 * partition applied every entry before it) at the tenure's own term. No
 * publication, projection or formation answer takes part.
 * @param {Object} ledger - The ledger PartitionService.
 * @param {Object} tenure - The custody's tenure token.
 * @return {boolean} Whether the tenure's term start is applied here.
 */
function isTermStartApplied(ledger, tenure) {
  const status = ledger.raft.readStatus();
  return status.currentTermApplied === true && status.term === tenure.term;
}

/**
 * The answer of a submission whose deciding tenure is no longer the ledger's
 * live tenure: nothing is proposed. It is the write kernel's NOT_LEADER
 * refusal (cleared by LEADERSHIP_START: the current tenure's own start owns
 * the work), marked as the owner's fence.
 * @param {string} partitionId - The ledger partition.
 * @return {Object} The frozen refusal.
 */
function tenureFenceRefusal(partitionId) {
  return Object.freeze({success: false,
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER, partitionId,
    tenureFence: PLACEMENT_TENURE_FENCE.TENURE_ENDED});
}

/**
 * The custody's leadership start requests one drive of the ledger's CDC
 * obligations and does not wait for it (lead ruling 4: the start path waits
 * for no publication or CDC drive); one request per owner at a time: a custody
 * whose earlier request is still unanswered joins it. Its answer, whenever it
 * comes, only frees the owner's request slot (and counts a failure).
 * @param {Object} owner - The ReplicaPlacementOwner.
 * @param {Object} pass - The pass record.
 */
function requestLeadershipStartCdcDrive(owner, pass) {
  const cdcDelivery = owner.ledgerPartitionService.cdcDelivery;
  if (!cdcDelivery) return;
  if (owner.leadershipStartDrive !== null) {
    recordLeadershipStartDriveJoined(pass);
    return;
  }
  const drive = Promise.resolve(
    cdcDelivery.driveCdcObligations(PLACEMENT_TRIGGER.LEADERSHIP_START));
  owner.leadershipStartDrive = drive;
  drive.then(() => {
    if (owner.leadershipStartDrive === drive) owner.leadershipStartDrive = null;
  }, (error) => {
    if (owner.leadershipStartDrive === drive) owner.leadershipStartDrive = null;
    recordLeadershipStartDriveFailure(owner.observation);
    owner.logger.warn(LOG_START_DRIVE_FAILED, {nodeId: owner.nodeId,
      error: error?.message ?? String(error)});
  });
}

export {
  PLACEMENT_TENURE_FENCE,
  PLACEMENT_TERM_START,
  createTenureCustody,
  isTermStartApplied,
  requestLeadershipStartCdcDrive,
  tenureFenceRefusal,
};
