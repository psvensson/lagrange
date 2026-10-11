/**
 * One release invocation's settlement of complete sql_transactions rows.
 *
 * This owner never upgrades legacy rows and never treats a terminal status as
 * proof. It reads each exact durable row through the early SQLQueryEngine,
 * uses the fixed settlement command for freeze/decision/progress, re-drives
 * every participant through the normal transaction wire, then binds those
 * replies to a fresh row census and the current release attempt.
 */
import {deepFreeze} from '../../raft/raft-operation-port.js';
import {COMMIT_MODE, isCanonicalTransactionEpoch, PARTICIPANT_SET_STATE,
  TRANSACTION_MODE} from
  '../../constants/transactions.js';
import {PARTICIPANT_TRANSACTION_DECISION as DECISION} from
  '../../partition/partition-participant-transaction-constants.js';
import {buildDecisionRecord} from
  '../../partition/partition-participant-transaction-bytes.js';
import {COORDINATOR_SETTLEMENT_TYPE, COORDINATOR_SETTLEMENT_RESULT} from
  '../../partition/partition-coordinator-settlement-constants.js';
import {QUERY_OPERATION} from '../query-constants.js';
import {readParticipantSet} from './distributed-transaction-participant-manifest.js';
import {decisionRecordOfRow, RECORDED_DECISION_STATE} from
  './distributed-transaction-decision-record.js';
import {TRANSACTION_AUTHORITY_STATE} from
  './distributed-transaction-recovery-authority.js';
import {TRANSACTION_STATUS} from
  './distributed-transaction-coordinator-constants.js';
import {canonicalTransactionSettlementResult,
  TRANSACTION_SETTLEMENT_KIND as KIND,
  TRANSACTION_SETTLEMENT_OUTCOME as SETTLEMENT_OUTCOME} from
  './distributed-transaction-settlement.js';
import {TRANSACTION_RELEASE_CENSUS_STATE} from
  './distributed-transaction-release-census.js';
import {committedAnswerOf, participantAnswerSnapshotOf, rolledBackAnswerOf} from
  '../sql-query-engine-participant-wire.js';

const RELEASE_PROOF_KIND = 'transaction_release_invocation_v1';
const TERMINAL_STATUS = Object.freeze({
  [DECISION.COMMIT]: TRANSACTION_STATUS.COMMITTED,
  [DECISION.ROLLBACK]: TRANSACTION_STATUS.ROLLED_BACK,
});
const RESULT_FIELDS = Object.freeze(['transactionId', 'decision',
  'decisionDigest', 'terminalStatus', 'participantIds']);

function exactKeys(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function releaseRowOf(payload, transactionId, now) {
  if (payload?.state !== TRANSACTION_AUTHORITY_STATE.AVAILABLE ||
      !Array.isArray(payload.participants)) return null;
  const row = payload.transaction;
  if (row?.transaction_id !== transactionId ||
      typeof row.session_id !== 'string' || row.session_id.length === 0 ||
      !isCanonicalTransactionEpoch(row.transaction_epoch) ||
      !Number.isFinite(row.timeout_deadline) || row.timeout_deadline < 0 ||
      !Object.values(TRANSACTION_MODE).includes(row.transaction_mode)) return null;
  const pairs = readParticipantSet(transactionId, row.participant_set_text);
  if (!pairs) return null;
  const admitted = new Map(pairs);
  const participantRows = new Map();
  for (const participant of payload.participants) {
    if (participant?.transaction_id !== transactionId ||
        admitted.get(participant.participant_id) !== participant.partition_id ||
        participantRows.has(participant.participant_id)) return null;
    participantRows.set(participant.participant_id, participant);
  }
  const frozen = row.participant_set_state === PARTICIPANT_SET_STATE.FROZEN;
  if ((!frozen && row.participant_set_state !== PARTICIPANT_SET_STATE.OPEN) ||
      row.commit_mode !== (frozen ? COMMIT_MODE.TWO_PHASE_COMMIT :
        COMMIT_MODE.NOT_SELECTED) ||
      row.frozen_participant_count !== (frozen ? pairs.length : 0)) return null;
  const decision = decisionRecordOfRow(row, transactionId);
  if (decision.state === RECORDED_DECISION_STATE.INVALID ||
      (decision.state === RECORDED_DECISION_STATE.RECORDED && !frozen)) return null;
  if (decision.state === RECORDED_DECISION_STATE.RECORDED &&
      (decision.participants.length !== pairs.length ||
        decision.participants.some(([id], index) => id !== pairs[index][0]))) return null;
  return {row, pairs, participantRows, decision,
    expired: row.timeout_deadline <= now};
}

function settlementOf(kind, authority, fields = {}) {
  return {kind, transactionId: authority.row.transaction_id,
    sessionId: authority.row.session_id,
    transactionEpoch: authority.row.transaction_epoch,
    participantSetText: authority.row.participant_set_text, ...fields};
}

function reportFailure(observeFailure, stage, transactionId, fields = {}) {
  if (typeof observeFailure !== 'function') return;
  observeFailure(deepFreeze({stage, transactionId, ...fields}));
}

async function applySettlement(service, settlement) {
  const answer = await service.handleApplicationMessage({
    type: COORDINATOR_SETTLEMENT_TYPE,
    settlement,
  });
  const result = canonicalTransactionSettlementResult(
    answer?.[COORDINATOR_SETTLEMENT_RESULT]);
  if (answer?.acknowledged !== true || answer?.committed !== true || result === null ||
      ![SETTLEMENT_OUTCOME.APPLIED, SETTLEMENT_OUTCOME.REPLAYED,
        SETTLEMENT_OUTCOME.ALREADY_RECORDED].includes(result.outcome)) return null;
  return result;
}

async function readAuthority(engine, transactionId, now, observeFailure, stage) {
  try {
    const authority = releaseRowOf(
      await engine.readDistributedTransactionRecoveryState(transactionId),
      transactionId,
      now,
    );
    if (authority === null) {
      reportFailure(observeFailure, stage, transactionId,
        {reason: 'authoritative_row_invalid_or_unavailable'});
    }
    return authority;
  } catch (error) {
    reportFailure(observeFailure, stage, transactionId,
      {reason: 'authoritative_read_failed', error: String(error?.message ?? error)});
    return null;
  }
}

async function ensureFrozen(engine, service, authority, now, observeFailure) {
  if (authority === null) return null;
  if (authority.row.participant_set_state === PARTICIPANT_SET_STATE.FROZEN) {
    return authority;
  }
  const transactionId = authority.row.transaction_id;
  if (!authority.expired || authority.decision.state !== RECORDED_DECISION_STATE.ABSENT) {
    reportFailure(observeFailure, 'freeze_ineligible', transactionId,
      {expired: authority.expired, decisionState: authority.decision.state});
    return null;
  }
  if (await applySettlement(service, settlementOf(KIND.FREEZE, authority)) === null) {
    reportFailure(observeFailure, 'freeze_apply', transactionId);
    return null;
  }
  return readAuthority(engine, transactionId, now, observeFailure, 'freeze_readback');
}

async function ensureDecision(engine, service, authority, now, observeFailure) {
  if (authority?.decision.state === RECORDED_DECISION_STATE.RECORDED) return authority;
  if (!authority) return null;
  const transactionId = authority.row.transaction_id;
  if (authority.row.participant_set_state !== PARTICIPANT_SET_STATE.FROZEN ||
      authority.decision.state !== RECORDED_DECISION_STATE.ABSENT) {
    reportFailure(observeFailure, 'decision_ineligible', transactionId,
      {participantSetState: authority.row.participant_set_state,
        decisionState: authority.decision.state});
    return null;
  }
  const record = buildDecisionRecord(authority.row.transaction_id, DECISION.ROLLBACK,
    authority.pairs.map(([participantId]) => [participantId, null]));
  if (!record) {
    reportFailure(observeFailure, 'decision_record', transactionId);
    return null;
  }
  if (await applySettlement(service, settlementOf(KIND.DECIDE, authority, {
    decision: record.decision,
    decisionText: record.decisionText,
    decisionDigest: record.decisionDigest,
  })) === null) {
    reportFailure(observeFailure, 'decision_apply', transactionId);
    return null;
  }
  return readAuthority(engine, transactionId, now, observeFailure, 'decision_readback');
}

function participantAnswerComplete(decision, answer, expected) {
  const captured = participantAnswerSnapshotOf(answer, expected);
  if (captured === null) return false;
  try {
    if (decision === DECISION.COMMIT) {
      committedAnswerOf(captured);
    } else {
      rolledBackAnswerOf(captured, true);
    }
    return true;
  } catch {
    return false;
  }
}

async function settleParticipants(engine, authority, observeFailure) {
  const record = authority.decision;
  const replies = [];
  for (let index = 0; index < authority.pairs.length; index += 1) {
    const [participantId, partitionId] = authority.pairs[index];
    const recorded = record.participants[index];
    if (recorded?.[0] !== participantId) {
      reportFailure(observeFailure, 'participant_binding', authority.row.transaction_id,
        {participantId, partitionId});
      return null;
    }
    const operation = record.decision === DECISION.COMMIT ?
      QUERY_OPERATION.COMMIT : QUERY_OPERATION.ROLLBACK;
    let answer;
    try {
      answer = await engine.deliverTransactionOperation(
        authority.row.session_id,
        partitionId,
        operation,
        {transactionId: authority.row.transaction_id, participantId,
          commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
          transactionEpoch: authority.row.transaction_epoch,
          decision: record.decision, preparedDigest: recorded[1],
          decisionText: record.decisionText, decisionDigest: record.decisionDigest},
      );
    } catch (error) {
      reportFailure(observeFailure, 'participant_delivery', authority.row.transaction_id,
        {participantId, partitionId, operation,
          error: String(error?.message ?? error),
          failureCode: error?.failureCode ?? null,
          state: error?.state ?? null, outcome: error?.outcome ?? null});
      return null;
    }
    if (!participantAnswerComplete(record.decision, answer, {
      operation,
      partitionId,
      transactionId: authority.row.transaction_id,
      participantId,
    })) {
      reportFailure(observeFailure, 'participant_reply', authority.row.transaction_id,
        {participantId, partitionId, operation});
      return null;
    }
    replies.push(participantId);
  }
  return replies;
}

async function settleOne(engine, service, transactionId, now, observeFailure) {
  let authority = await readAuthority(engine, transactionId, now,
    observeFailure, 'initial_authority');
  authority = await ensureFrozen(engine, service, authority, now, observeFailure);
  authority = await ensureDecision(engine, service, authority, now, observeFailure);
  if (!authority || authority.decision.state !== RECORDED_DECISION_STATE.RECORDED) return null;
  const participantIds = await settleParticipants(engine, authority, observeFailure);
  if (participantIds === null) return null;
  const terminalStatus = TERMINAL_STATUS[authority.decision.decision];
  if (!terminalStatus) {
    reportFailure(observeFailure, 'terminal_status', transactionId,
      {decision: authority.decision.decision});
    return null;
  }
  if (await applySettlement(service,
    settlementOf(KIND.PROGRESS, authority, {
      decisionDigest: authority.decision.decisionDigest,
      status: terminalStatus,
    })) === null) {
    reportFailure(observeFailure, 'progress_apply', transactionId,
      {decision: authority.decision.decision, terminalStatus});
    return null;
  }
  const after = await readAuthority(engine, transactionId, now,
    observeFailure, 'progress_readback');
  if (!after || after.decision.state !== RECORDED_DECISION_STATE.RECORDED ||
      after.decision.decisionText !== authority.decision.decisionText ||
      after.row.status !== terminalStatus) {
    reportFailure(observeFailure, 'progress_binding', transactionId,
      {decision: authority.decision.decision, terminalStatus,
        observedStatus: after?.row?.status ?? null});
    return null;
  }
  return deepFreeze({transactionId, decision: after.decision.decision,
    decisionDigest: after.decision.decisionDigest, terminalStatus,
    participantIds: Object.freeze(participantIds)});
}

async function settleTransactionReleaseRows({engine, service, census, now = Date.now(),
  observeFailure = null}) {
  const inputInvalid = !engine ||
      typeof engine.readDistributedTransactionRecoveryState !== 'function' ||
      typeof engine.deliverTransactionOperation !== 'function' ||
      !service || typeof service.handleApplicationMessage !== 'function' ||
      census?.state !== TRANSACTION_RELEASE_CENSUS_STATE.HELD ||
      census.legacyTransactionIds?.length !== 0 ||
      !Array.isArray(census.recoverableTransactionIds);
  if (inputInvalid) {
    reportFailure(observeFailure, 'settlement_input', null, {
      enginePresent: engine !== null && engine !== undefined,
      recoveryReaderPresent:
        typeof engine?.readDistributedTransactionRecoveryState === 'function',
      participantDeliveryPresent: typeof engine?.deliverTransactionOperation === 'function',
      settlementPortPresent: typeof service?.handleApplicationMessage === 'function',
      censusState: census?.state ?? null,
      legacyTransactionCount: Array.isArray(census?.legacyTransactionIds) ?
        census.legacyTransactionIds.length : null,
      recoverableTransactionCount: Array.isArray(census?.recoverableTransactionIds) ?
        census.recoverableTransactionIds.length : null,
    });
    return null;
  }
  const transactions = [];
  for (const transactionId of census.recoverableTransactionIds) {
    const result = await settleOne(engine, service, transactionId, now, observeFailure);
    if (result === null) return null;
    transactions.push(result);
  }
  return Object.freeze(transactions);
}

function transactionReleaseProofOf({release, attempt, census, transactions}) {
  if (typeof release?.releaseId !== 'string' || !Number.isSafeInteger(attempt?.term) ||
      typeof attempt?.leaderReplicaId !== 'string' ||
      census?.state !== TRANSACTION_RELEASE_CENSUS_STATE.HELD ||
      census.legacyTransactionIds?.length !== 0 || !Array.isArray(transactions)) return null;
  const expected = census.recoverableTransactionIds;
  if (transactions.length !== expected.length || transactions.some((entry, index) =>
    !exactKeys(entry, RESULT_FIELDS) || entry.transactionId !== expected[index] ||
    !Object.values(DECISION).includes(entry.decision) ||
    typeof entry.decisionDigest !== 'string' ||
    entry.terminalStatus !== TERMINAL_STATUS[entry.decision] ||
    !Array.isArray(entry.participantIds))) return null;
  return deepFreeze({kind: RELEASE_PROOF_KIND, releaseId: release.releaseId,
    term: attempt.term, leaderReplicaId: attempt.leaderReplicaId,
    schemaVersion: census.schemaVersion, semanticVersion: census.semanticVersion,
    rowGenerationDigest: census.rowGenerationDigest,
    transactions: transactions.map((entry) => ({...entry,
      participantIds: [...entry.participantIds]}))});
}

export {settleTransactionReleaseRows, transactionReleaseProofOf};
