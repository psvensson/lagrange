// The leader's determinism self-check, as the partition runs it (TX1 design
// revision 10, section 3.3, AH): the check itself is the classifier owner's
// (runDeterminismSelfCheck, partition-transaction-determinism.js); the
// partition takes it from its construction option
// `transactionDeterminismSelfCheck` (the classifier owner's by default),
// runs it when it becomes the leader of a partition whose transaction
// admission is enabled, and in any case before the leader's first BEGIN.
// While it is not PASSED every BEGIN is refused, typed; ordinary writes are
// unaffected.
//
// A verdict lives only as long as what it measured: this connection, its
// schema - the main schema and the connection's temp schema, whose objects (a
// TEMP trigger on a participant table) enter every program yet never bump the
// main schema_version - and this leadership tenure. Each leadership
// acquisition measures again; a change to either schema measures again; an
// UNAVAILABLE verdict (a probe that could not be measured, nothing else
// unsatisfied, or a self-check that could not run) is never kept, so the next
// BEGIN measures again, and it is reported once per leadership tenure (a
// deterministic probe_unavailable would otherwise warn on every BEGIN). A
// FAILED verdict refuses every BEGIN for the rest of its lifetime, and a
// binary that is genuinely not deterministic fails every measurement, so it
// stays refused.
//
// The coordinator ledger (sql_transactions) is never a participant: the
// participant admission owner refuses its BEGIN before any self-check, and
// its committed origin installs the row owner's insertion trigger, whose
// program the classifier refuses at `opcode` (design 3.3 measures a
// participant table). There the self-check is NOT_APPLICABLE and never runs.
import {runDeterminismSelfCheck} from './partition-transaction-determinism.js';
import {
  participantStoreConnectionStateOf,
  readPartitionWriteOrigin,
} from './partition-participant-transaction-store.js';
import {
  PARTICIPANT_DETERMINISM_SELF_CHECK_STATE as STATE,
  PARTICIPANT_STORE_CONNECTION_STATE as CONNECTION_STATE,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
} from './partition-participant-transaction-constants.js';
import {
  TRANSACTION_CLASSIFIER_LAYER as LAYER,
  TRANSACTION_SELF_CHECK_RESULT as PROBE_RESULT,
} from './partition-transaction-determinism-constants.js';
import {coordinatorTableParticipantRefusal} from
  '../query/distributed/distributed-transaction-participant-admission.js';

// Per partition service: its configured self-check.
const CONFIGURED = new WeakMap();
// Per connection, within the current leadership tenure: the kept verdict
// with the schema key it was measured on, or the record that an UNAVAILABLE
// verdict was already reported (nothing kept: `verdict` null).
const VERDICTS = new WeakMap();
const PRAGMA_SCHEMA_VERSION = 'schema_version';
const PRAGMA_TEMP_SCHEMA_VERSION = 'temp.schema_version';
const NOT_APPLICABLE_VERDICT = Object.freeze({passed: false,
  state: STATE.NOT_APPLICABLE, cases: Object.freeze([])});

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

// The one outcome of a self-check that could not run: nothing was measured,
// so its state is UNAVAILABLE - BEGIN stays refused and the next BEGIN
// measures again - with the cause it threw.
function unmeasuredSelfCheck(selfCheckError) {
  return Object.freeze({measured: false, passed: false,
    cases: Object.freeze([]), error: String(selfCheckError?.message)});
}

function runConfiguredSelfCheck(service) {
  const selfCheck = CONFIGURED.get(service) ?? runDeterminismSelfCheck;
  try {
    return {measured: true, ...selfCheck(service.db, {tableName: service.tableName})};
  } catch (selfCheckError) {
    return unmeasuredSelfCheck(selfCheckError);
  }
}

// What a verdict is kept against: the main and the temp schema versions.
function schemaKeyOf(db) {
  return `${db.pragma(PRAGMA_SCHEMA_VERSION, {simple: true})}:` +
    `${db.pragma(PRAGMA_TEMP_SCHEMA_VERSION, {simple: true})}`;
}

// PASSED; UNAVAILABLE when nothing was measured, or when every unsatisfied
// case is a probe that could not be measured on a vetted engine; otherwise
// FAILED (a probe refused at another layer, or an unvetted engine).
function verdictStateOf(result) {
  if (result.passed === true) {
    return STATE.PASSED;
  }
  if (result.measured === false) {
    return STATE.UNAVAILABLE;
  }
  const unsatisfied = (result.cases ?? []).filter((entry) =>
    entry?.result === PROBE_RESULT.UNSATISFIED);
  return result.engine?.vetted === true && unsatisfied.length > 0 &&
    unsatisfied.every((entry) => entry.layer === LAYER.PROBE_UNAVAILABLE) ?
    STATE.UNAVAILABLE : STATE.FAILED;
}

function reportVerdict(service, verdict) {
  if (verdict.state === STATE.PASSED) {
    return;
  }
  service.logger.warn(verdict.state === STATE.UNAVAILABLE ?
    LOG_MSG.SELF_CHECK_UNAVAILABLE : LOG_MSG.SELF_CHECK_FAILED, {
    partitionId: service.partitionId, tableName: service.tableName,
    state: verdict.state, schemaVersion: verdict.schemaVersion,
    cases: verdict.cases ?? null, engine: verdict.engine ?? null,
    error: verdict.error ?? null});
}

/**
 * The self-check's verdict on this partition's connection: the one measured
 * in this leadership tenure on the current schema version, measured now when
 * there is none (an UNAVAILABLE verdict is never kept).
 * @param {Object} service - The partition (its leader).
 * @return {{passed: boolean, state: string}} The verdict.
 */
function participantDeterminismSelfCheckOf(service) {
  if (coordinatorTableParticipantRefusal(service.tableName) !== null) {
    return NOT_APPLICABLE_VERDICT;
  }
  const db = service.db;
  const schemaVersion = schemaKeyOf(db);
  const tenure = VERDICTS.get(db);
  if (tenure?.verdict && tenure.verdict.schemaVersion === schemaVersion) {
    return tenure.verdict;
  }
  const measurement = runConfiguredSelfCheck(service);
  const state = verdictStateOf(measurement);
  const verdict = Object.freeze({...measurement, passed: state === STATE.PASSED,
    state, schemaVersion});
  if (state !== STATE.UNAVAILABLE) {
    VERDICTS.set(db, {verdict, unavailableReported: false});
    reportVerdict(service, verdict);
  } else {
    // Never kept; reported once in this tenure.
    VERDICTS.set(db, {verdict: null, unavailableReported: true});
    if (tenure?.unavailableReported !== true) {
      reportVerdict(service, verdict);
    }
  }
  return verdict;
}

/**
 * Measure the self-check as this replica becomes the leader (the lifecycle
 * owner's leader hook): the previous tenure's verdict ends here. On a
 * partition whose transaction admission is enabled (its generation origin
 * applied here) it is measured now; a partition that admits no transaction
 * yet measures it at its first BEGIN instead.
 * @param {Object} service - The partition.
 */
function runLeaderDeterminismSelfCheck(service) {
  try {
    if (participantStoreConnectionStateOf(service.db) !== CONNECTION_STATE.OPEN) {
      return;
    }
    VERDICTS.delete(service.db);
    if (readPartitionWriteOrigin(service.db) !== null) {
      participantDeterminismSelfCheckOf(service);
    }
  } catch (leaderCheckError) {
    // A leader hook never throws into the lifecycle owner; the first BEGIN
    // measures again.
    service.logger.warn(LOG_MSG.SELF_CHECK_UNAVAILABLE, {
      partitionId: service.partitionId, tableName: service.tableName,
      state: STATE.UNAVAILABLE, error: leaderCheckError?.message});
  }
}

export {
  configureParticipantDeterminismSelfCheck,
  participantDeterminismSelfCheckOf,
  runLeaderDeterminismSelfCheck,
};
