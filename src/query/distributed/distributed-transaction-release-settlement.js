/**
 * One release invocation's settlement of complete sql_transactions rows.
 *
 * This owner never upgrades legacy rows and never treats a terminal status as
 * proof. It reads each exact durable row through the early SQLQueryEngine,
 * uses the fixed settlement command for freeze/decision/progress, re-drives
 * every participant through the normal transaction wire, then binds those
 * replies to a fresh row census and the current release attempt.
 *
 * Once a transaction's participant fanout and terminal progress row have been
 * settled for a database, its immutable terminal settlement fact is memoized in
 * the module-owned SETTLED_RELEASE_TRANSACTIONS WeakMap (bounded by
 * MAX_SETTLED_RELEASE_TRANSACTIONS and pruned to the current census's
 * recoverableTransactionIds). Every read of the memo verifies the live durable
 * sql_transactions row (FROZEN state, terminal status, decision, decisionDigest
 * and participant_set_text) before reusing the proof, while permission for each
 * release action remains governed by the current cohort, generation, schema,
 * drain and rowGenerationDigest checks.
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
import {canonicalTransactionSettlementResult,
  TRANSACTION_SETTLEMENT_KIND as KIND,
  TRANSACTION_SETTLEMENT_OUTCOME as SETTLEMENT_OUTCOME} from
  './distributed-transaction-settlement.js';
import {TRANSACTION_RELEASE_CENSUS_STATE,
  TRANSACTION_RELEASE_TERMINAL_STATUS as TERMINAL_STATUS} from
  './distributed-transaction-release-census.js';
import {
  isTerminalParticipantDecisionAnswer,
} from '../sql-query-engine-participant-wire.js';
import {transactionReleaseProofValid} from
  '../../partition/partition-participant-release-contract.js';

const RELEASE_PROOF_KIND = 'transaction_release_invocation_v1';
// No readable release authority: the transaction is not settled this turn.
const NO_RELEASE_AUTHORITY = null;
const MAX_SETTLED_RELEASE_TRANSACTIONS = 1024;
const SETTLEMENT_BATCH_SIZE = 16;
const PROMISE_SETTLED_FULFILLED = 'fulfilled';
const SETTLED_RELEASE_TRANSACTIONS = new WeakMap([]);
const SETTLED_ROW_SQL =
  'SELECT * FROM sql_transactions WHERE transaction_id = ?';
const RESULT_FIELDS = Object.freeze(['transactionId', 'decision',
  'decisionDigest', 'terminalStatus', 'participantIds']);

function settledTransactionMapKey(service) {
  return service?.db instanceof Object ? service.db : NO_RELEASE_AUTHORITY;
}

function pruneSettledTransactions(service, recoverableTransactionIds) {
  const key = settledTransactionMapKey(service);
  const settled = key ? SETTLED_RELEASE_TRANSACTIONS.get(key) : undefined;
  if (!settled) return;
  const activeIds = new Set(recoverableTransactionIds);
  for (const transactionId of settled.keys()) {
    if (!activeIds.has(transactionId)) {
      settled.delete(transactionId);
    }
  }
}

function readSettledRow(db, transactionId) {
  try {
    return db.prepare(SETTLED_ROW_SQL).get(transactionId);
  } catch {
    return NO_RELEASE_AUTHORITY;
  }
}

function isSettledEntryValidForAuthority(entry, validated) {
  if (!validated ||
      validated.row.participant_set_state !== PARTICIPANT_SET_STATE.FROZEN ||
      validated.row.status !== entry.result.terminalStatus ||
      validated.row.participant_set_text !== entry.participantSetText) {
    return false;
  }
  return validated.decision.state === RECORDED_DECISION_STATE.RECORDED &&
    validated.decision.decision === entry.result.decision &&
    validated.decision.decisionText === entry.decisionText &&
    validated.decision.decisionDigest === entry.result.decisionDigest;
}

function readSettledTransactionResult(service, transactionId, now = Date.now()) {
  const db = settledTransactionMapKey(service);
  const settled = db ? SETTLED_RELEASE_TRANSACTIONS.get(db) : undefined;
  const entry = settled ? settled.get(transactionId) : undefined;
  if (!entry) return NO_RELEASE_AUTHORITY;
  const row = readSettledRow(db, transactionId);
  const validated = releaseRowOf(
    {
      state: TRANSACTION_AUTHORITY_STATE.AVAILABLE,
      transaction: row,
      participants: [],
    },
    transactionId,
    now,
  );
  if (!isSettledEntryValidForAuthority(entry, validated)) {
    settled.delete(transactionId);
    return NO_RELEASE_AUTHORITY;
  }
  return entry.result;
}

function recordSettledTransactionResult(service, transactionId, settledEntry) {
  const key = settledTransactionMapKey(service);
  if (!key || !settledEntry?.result) return;
  let settled = SETTLED_RELEASE_TRANSACTIONS.get(key);
  if (!settled) {
    settled = new Map();
    SETTLED_RELEASE_TRANSACTIONS.set(key, settled);
  }
  if (settled.has(transactionId)) {
    settled.delete(transactionId);
  } else if (settled.size >= MAX_SETTLED_RELEASE_TRANSACTIONS) {
    const firstKey = settled.keys().next().value;
    if (firstKey !== undefined) {
      settled.delete(firstKey);
    }
  }
  settled.set(transactionId, Object.freeze({
    result: settledEntry.result,
    decisionText: settledEntry.decisionText,
    participantSetText: settledEntry.participantSetText,
  }));
}

function exactKeys(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function isReleaseRowHeaderValid(row, transactionId) {
  if (!row || row.transaction_id !== transactionId) return false;
  if (typeof row.session_id !== 'string' || row.session_id.length === 0) return false;
  return isCanonicalTransactionEpoch(row.transaction_epoch) &&
    Number.isFinite(row.timeout_deadline) && row.timeout_deadline >= 0 &&
    Object.values(TRANSACTION_MODE).includes(row.transaction_mode);
}

function isReleaseParticipantSetConsistent(row, pairs) {
  const frozen = row.participant_set_state === PARTICIPANT_SET_STATE.FROZEN;
  if (!frozen && row.participant_set_state !== PARTICIPANT_SET_STATE.OPEN) {
    return false;
  }
  const expectedMode = frozen ? COMMIT_MODE.TWO_PHASE_COMMIT : COMMIT_MODE.NOT_SELECTED;
  const expectedCount = frozen ? pairs.length : 0;
  return row.commit_mode === expectedMode && row.frozen_participant_count === expectedCount;
}

function isReleaseDecisionConsistent(decision, frozen, pairs) {
  if (decision.state === RECORDED_DECISION_STATE.INVALID) return false;
  if (decision.state === RECORDED_DECISION_STATE.ABSENT) return true;
  return frozen &&
    decision.participants.length === pairs.length &&
    decision.participants.every(([id], index) => id === pairs[index][0]);
}

function isValidReleaseRowState(row, transactionId, pairs, decision) {
  return Boolean(
    isReleaseRowHeaderValid(row, transactionId) &&
    pairs &&
    isReleaseParticipantSetConsistent(row, pairs) &&
    isReleaseDecisionConsistent(decision,
      row.participant_set_state === PARTICIPANT_SET_STATE.FROZEN, pairs),
  );
}

function releaseRowOf(payload, transactionId, now) {
  if (!payload || payload.state !== TRANSACTION_AUTHORITY_STATE.AVAILABLE ||
      !Array.isArray(payload.participants)) {
    return null;
  }
  const row = payload.transaction;
  const pairs = readParticipantSet(transactionId, row?.participant_set_text);
  const decision = decisionRecordOfRow(row, transactionId);
  if (!isValidReleaseRowState(row, transactionId, pairs, decision)) {
    return null;
  }
  const admitted = new Map(pairs);
  const participantRows = new Map();
  for (const participant of payload.participants) {
    if (!participant || participant.transaction_id !== transactionId ||
        admitted.get(participant.participant_id) !== participant.partition_id ||
        participantRows.has(participant.participant_id)) {
      return null;
    }
    participantRows.set(participant.participant_id, participant);
  }
  return {row, pairs, participantRows, decision,
    expired: row.timeout_deadline <= now};
}

function settlementOf(kind, authority, fields = {}) {
  return {kind, transactionId: authority.row.transaction_id,
    sessionId: authority.row.session_id,
    transactionEpoch: authority.row.transaction_epoch,
    participantSetText: authority.row.participant_set_text, ...fields};
}

async function applySettlement(service, settlement) {
  const answer = await service.handleApplicationMessage({
    type: COORDINATOR_SETTLEMENT_TYPE,
    settlement,
  });
  const result = canonicalTransactionSettlementResult(
    answer?.[COORDINATOR_SETTLEMENT_RESULT]);
  const satisfied = answer?.committed === true ?
    [SETTLEMENT_OUTCOME.APPLIED, SETTLEMENT_OUTCOME.REPLAYED,
      SETTLEMENT_OUTCOME.ALREADY_RECORDED].includes(result?.outcome) :
    answer?.success === true &&
      [SETTLEMENT_OUTCOME.REPLAYED,
        SETTLEMENT_OUTCOME.ALREADY_RECORDED].includes(result?.outcome);
  if (!satisfied || result === null) return null;
  return result;
}

async function readAuthority(engine, transactionId, now) {
  try {
    return releaseRowOf(
      await engine.readDistributedTransactionRecoveryState(transactionId),
      transactionId,
      now,
    );
  } catch {
    return NO_RELEASE_AUTHORITY;
  }
}

async function ensureFrozen(engine, service, authority, now) {
  if (authority === NO_RELEASE_AUTHORITY) return NO_RELEASE_AUTHORITY;
  if (authority.row.participant_set_state === PARTICIPANT_SET_STATE.FROZEN) {
    return authority;
  }
  if (!authority.expired || authority.decision.state !== RECORDED_DECISION_STATE.ABSENT ||
      await applySettlement(service, settlementOf(KIND.FREEZE, authority)) === null) {
    return NO_RELEASE_AUTHORITY;
  }
  return readAuthority(engine, authority.row.transaction_id, now);
}

async function ensureDecision(engine, service, authority, now) {
  if (authority?.decision.state === RECORDED_DECISION_STATE.RECORDED) return authority;
  if (!authority || !authority.expired ||
      authority.row.participant_set_state !== PARTICIPANT_SET_STATE.FROZEN ||
      authority.decision.state !== RECORDED_DECISION_STATE.ABSENT) return NO_RELEASE_AUTHORITY;
  const record = buildDecisionRecord(authority.row.transaction_id, DECISION.ROLLBACK,
    authority.pairs.map(([participantId]) => [participantId, null]));
  if (!record || await applySettlement(service, settlementOf(KIND.DECIDE, authority, {
    decision: record.decision,
    decisionText: record.decisionText,
    decisionDigest: record.decisionDigest,
  })) === null) return NO_RELEASE_AUTHORITY;
  return readAuthority(engine, authority.row.transaction_id, now);
}

function participantAnswerComplete(decision, answer, expected) {
  return isTerminalParticipantDecisionAnswer(decision, answer, expected);
}

async function settleSingleParticipant({
  engine,
  authority,
  record,
  operation,
  participantId,
  partitionId,
  preparedDigest,
}) {
  const answer = await engine.deliverTransactionOperation(
    authority.row.session_id,
    partitionId,
    operation,
    {
      transactionId: authority.row.transaction_id,
      participantId,
      commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
      transactionEpoch: authority.row.transaction_epoch,
      decision: record.decision,
      preparedDigest,
      decisionText: record.decisionText,
      decisionDigest: record.decisionDigest,
    },
  );
  return participantAnswerComplete(record.decision, answer, {
    operation,
    partitionId,
    transactionId: authority.row.transaction_id,
    participantId,
  }) ? participantId : null;
}

async function settleParticipants(engine, authority) {
  const record = authority.decision;
  for (let index = 0; index < authority.pairs.length; index += 1) {
    if (record.participants[index]?.[0] !== authority.pairs[index][0]) {
      return null;
    }
  }
  const operation = record.decision === DECISION.COMMIT ?
    QUERY_OPERATION.COMMIT :
    QUERY_OPERATION.ROLLBACK;
  const settled = await Promise.allSettled(
    authority.pairs.map(([participantId, partitionId], index) =>
      settleSingleParticipant({
        engine,
        authority,
        record,
        operation,
        participantId,
        partitionId,
        preparedDigest: record.participants[index][1],
      }),
    ),
  );
  const replies = [];
  for (const outcome of settled) {
    if (outcome.status !== PROMISE_SETTLED_FULFILLED || !outcome.value) return null;
    replies.push(outcome.value);
  }
  return replies;
}

async function settleOne(engine, service, transactionId, now) {
  let authority = await readAuthority(engine, transactionId, now);
  authority = await ensureFrozen(engine, service, authority, now);
  authority = await ensureDecision(engine, service, authority, now);
  if (!authority || authority.decision.state !== RECORDED_DECISION_STATE.RECORDED) return null;
  const participantIds = await settleParticipants(engine, authority);
  if (participantIds === null) return null;
  const terminalStatus = TERMINAL_STATUS[authority.decision.decision];
  if (!terminalStatus ||
      (authority.row.status !== terminalStatus && await applySettlement(service,
        settlementOf(KIND.PROGRESS, authority, {
          decisionDigest: authority.decision.decisionDigest,
          status: terminalStatus,
        })) === null)) return null;
  const after = await readAuthority(engine, transactionId, now);
  if (!after || after.decision.state !== RECORDED_DECISION_STATE.RECORDED ||
      after.decision.decisionText !== authority.decision.decisionText ||
      after.row.status !== terminalStatus) return null;
  const result = deepFreeze({transactionId, decision: after.decision.decision,
    decisionDigest: after.decision.decisionDigest, terminalStatus,
    participantIds: Object.freeze(participantIds)});
  recordSettledTransactionResult(service, transactionId, {
    result,
    decisionText: after.decision.decisionText,
    participantSetText: after.row.participant_set_text,
  });
  return result;
}

function isHeldRecoverableCensus(census) {
  return Boolean(
    census &&
    census.state === TRANSACTION_RELEASE_CENSUS_STATE.HELD &&
    census.legacyTransactionIds?.length === 0 &&
    Array.isArray(census.recoverableTransactionIds),
  );
}

async function settleTransactionReleaseRows({engine, service, census, now = Date.now()}) {
  if (!engine || !service || !isHeldRecoverableCensus(census) ||
      typeof engine.readDistributedTransactionRecoveryState !== 'function' ||
      typeof engine.deliverTransactionOperation !== 'function' ||
      typeof service.handleApplicationMessage !== 'function') {
    return null;
  }
  pruneSettledTransactions(service, census.recoverableTransactionIds);
  const transactions = [];
  const ids = census.recoverableTransactionIds;
  for (let start = 0; start < ids.length; start += SETTLEMENT_BATCH_SIZE) {
    const batch = ids.slice(start, start + SETTLEMENT_BATCH_SIZE);
    const settledBatch = await Promise.all(batch.map((transactionId) =>
      readSettledTransactionResult(service, transactionId, now) ??
      settleOne(engine, service, transactionId, now),
    ));
    if (settledBatch.includes(null)) return null;
    transactions.push(...settledBatch);
  }
  return Object.freeze(transactions);
}

function areProofEntriesShaped(transactions) {
  return Array.isArray(transactions) &&
    transactions.every(
      (entry) => exactKeys(entry, RESULT_FIELDS) && Array.isArray(entry.participantIds),
    );
}

function transactionReleaseProofOf({release, attempt, census, transactions}) {
  if (!release || !attempt || !census || !areProofEntriesShaped(transactions)) {
    return null;
  }
  if (census.state !== TRANSACTION_RELEASE_CENSUS_STATE.HELD ||
      census.legacyTransactionIds?.length !== 0) {
    return null;
  }
  const proof = deepFreeze({kind: RELEASE_PROOF_KIND, releaseId: release.releaseId,
    term: attempt.term, leaderReplicaId: attempt.leaderReplicaId,
    schemaVersion: census.schemaVersion, semanticVersion: census.semanticVersion,
    rowGenerationDigest: census.rowGenerationDigest,
    transactions: transactions.map((entry) => ({...entry,
      participantIds: [...entry.participantIds]}))});
  return transactionReleaseProofValid(proof, {release, attempt, census}) ? proof : null;
}

export {
  MAX_SETTLED_RELEASE_TRANSACTIONS,
  settleTransactionReleaseRows,
  transactionReleaseProofOf,
};
