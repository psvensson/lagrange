// The leader's determinism self-check, as the partition runs it (TX1 design
// revision 10, section 3.3, AH): the check itself is the classifier owner's
// (runDeterminismSelfCheck, partition-transaction-determinism.js); the
// partition takes it from its construction option
// `transactionDeterminismSelfCheck` (the classifier owner's by default),
// runs it when it becomes the leader of a partition whose transaction
// admission is enabled, and in any case before the leader's first BEGIN,
// once per connection. While it is failed every BEGIN is refused, typed;
// ordinary writes are unaffected.
import {runDeterminismSelfCheck} from './partition-transaction-determinism.js';
import {readPartitionWriteOrigin} from './partition-participant-transaction-store.js';
import {PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG} from
  './partition-participant-transaction-constants.js';

// Per partition service: its configured self-check.
const CONFIGURED = new WeakMap();
// Per connection: the self-check's result, run once.
const RESULTS = new WeakMap();

/**
 * Record the partition's self-check (its construction option); the
 * classifier owner's own when the option is not a function.
 * @param {Object} service - The partition.
 * @param {*} selfCheck - The option: (db, {tableName}) => {passed, cases}.
 */
function configureParticipantDeterminismSelfCheck(service, selfCheck) {
  if (typeof selfCheck === 'function') {
    CONFIGURED.set(service, selfCheck);
  }
}

function runConfiguredSelfCheck(service) {
  const selfCheck = CONFIGURED.get(service) ?? runDeterminismSelfCheck;
  try {
    return selfCheck(service.db, {tableName: service.tableName});
  } catch (selfCheckError) {
    // A self-check that cannot run has failed: transactions stay refused.
    return {passed: false, cases: [], error: String(selfCheckError?.message)};
  }
}

/**
 * The self-check's result on this partition's connection, run once.
 * @param {Object} service - The partition (its leader).
 * @return {{passed: boolean}} The result.
 */
function participantDeterminismSelfCheckOf(service) {
  let result = RESULTS.get(service.db);
  if (result === undefined) {
    result = runConfiguredSelfCheck(service);
    RESULTS.set(service.db, result);
    if (result?.passed !== true) {
      service.logger.warn(LOG_MSG.SELF_CHECK_FAILED, {
        partitionId: service.partitionId, cases: result?.cases ?? null,
        error: result?.error ?? null});
    }
  }
  return result;
}

/**
 * Run the self-check as this replica becomes the leader (the lifecycle
 * owner's leader hook), on a partition whose transaction admission is
 * enabled (its generation origin applied here); a partition that admits no
 * transaction runs it at its first BEGIN instead.
 * @param {Object} service - The partition.
 */
function runLeaderDeterminismSelfCheck(service) {
  try {
    if (service.db?.open === true && readPartitionWriteOrigin(service.db) !== null) {
      participantDeterminismSelfCheckOf(service);
    }
  } catch (leaderCheckError) {
    // A leader hook never throws into the lifecycle owner; the first BEGIN
    // runs the check again.
    service.logger.warn(LOG_MSG.SELF_CHECK_FAILED, {
      partitionId: service.partitionId, error: leaderCheckError?.message});
  }
}

export {
  configureParticipantDeterminismSelfCheck,
  participantDeterminismSelfCheckOf,
  runLeaderDeterminismSelfCheck,
};
