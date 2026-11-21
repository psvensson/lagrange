// The retained owner consumes one complete leader read per coalesced hint.
// Known blockers need only exact IDs; capacity needs the whole current census.
// This authorizes at most a native retry; committed apply still grants the row.
import {isValidLeaderReadAuthorityWitness} from '../control-plane/control-plane-authoritative-read-witness.js';
import {isCompleteAuthoritativeReadResult} from '../control-plane/control-plane-system-table-gateway-read-strategies.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER_MODE} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {LEDGER_PARTITION_ID, censusRowOf, retainedRepairCensusRead} from '../partition/partition-placement-admission-decision.js';
import {assertOperationUpdateRecord} from './replica-operation-update-outcome.js';
import {buildCanonicalReplicaOperationRow} from './replica-operation-repository-mutation-row-methods.js';

const REPAIR_READ_SCOPE = Object.freeze({CURRENT: 'current_refusal',
  SUBJECT: 'subject', RECEIVER: 'receiver', CENSUS: 'census'});
const REPAIR_AUTHORITY = Object.freeze({UNAVAILABLE: 'unavailable', READY: 'ready'});
const REPAIR_AUTHORITY_REFUSAL = Object.freeze({READ_FAILED: 'owner_read_failed',
  UNQUALIFIED: 'unqualified_authority', INVALID_ROW: 'invalid_operation_row'});

function unavailableRepairAuthority(reason) {
  return {state: REPAIR_AUTHORITY.UNAVAILABLE, reason};
}
const READ_OPTIONS = Object.freeze({authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: LEADER_MODE.REQUIRED});
const READ_IDS_PREFIX = 'SELECT * FROM replica_operations WHERE operation_id IN (';
const SQL_SEPARATOR = ', ';
const SQL_PARAMETER = '?';
const SQL_IN_END = ')';

function readPlan(attempt, scope) {
  const receiverCensus = scope === REPAIR_READ_SCOPE.CENSUS ||
    (scope === REPAIR_READ_SCOPE.RECEIVER && attempt.blockers === null);
  if (scope !== REPAIR_READ_SCOPE.SUBJECT && (attempt.occupancy || receiverCensus)) {
    return {...retainedRepairCensusRead(attempt.operation.operationId), ids: null};
  }
  const ids = scope === REPAIR_READ_SCOPE.SUBJECT || attempt.blockers === null ?
    [attempt.operation.operationId] :
    [attempt.operation.operationId, ...attempt.blockers.map((row) => row.operationId)];
  return {sql: READ_IDS_PREFIX + ids.map(() => SQL_PARAMETER).join(SQL_SEPARATOR) + SQL_IN_END,
    params: ids, ids: new Set(ids)};
}

function witnessMatchesExpectedOwner(witness, attempt) {
  return attempt.expectedOwner === null ||
    (witness.servingNodeId === attempt.expectedOwner.nodeId &&
      witness.servingReplicaId === attempt.expectedOwner.replicaId);
}

function currentWitness(witness, attempt) {
  return isValidLeaderReadAuthorityWitness(witness, LEDGER_PARTITION_ID) &&
    Number.isSafeInteger(witness.appliedIndex) &&
    witness.appliedIndex >= attempt.minimumLedgerIndex &&
    Number.isSafeInteger(witness.commitIndex) && witness.commitIndex === witness.appliedIndex &&
    Number.isSafeInteger(witness.term) && witness.term >= attempt.minimumLedgerTerm &&
    witnessMatchesExpectedOwner(witness, attempt);
}

function canonicalRowObservation(repository, row) {
  try {
    assertOperationUpdateRecord(repository.rowToOperation(row));
    return {state: REPAIR_AUTHORITY.READY};
  } catch {
    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.INVALID_ROW);
  }
}

function completeRows(repository, rows, attempt, plan) {
  const columns = Object.keys(buildCanonicalReplicaOperationRow(attempt.operation,
    attempt.operation.ownerLeaseExpiresAt ?? null));
  const ids = new Set();
  return rows.every((row) => {
    if (row === null || typeof row !== 'object') return false;
    if (!columns.every((column) => Object.hasOwn(row, column)) || ids.has(row.operation_id)) {
      return false;
    }
    if (canonicalRowObservation(repository, row).state !== REPAIR_AUTHORITY.READY) return false;
    ids.add(row.operation_id);
    return plan.ids === null || plan.ids.has(row.operation_id);
  });
}

async function readRetainedRepairAuthority(repository, attempt, scope) {
  const plan = readPlan(attempt, scope);
  let answer;
  try {
    answer = await repository.executeReplicaOperationsRead(plan.sql, plan.params, READ_OPTIONS);
  } catch {
    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.READ_FAILED);
  }
  if (!isCompleteAuthoritativeReadResult(answer) ||
      !currentWitness(answer.readAuthorityWitness, attempt) ||
      !completeRows(repository, answer.rows, attempt, plan)) {
    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED);
  }
  return {state: REPAIR_AUTHORITY.READY, rows: answer.rows,
    census: answer.rows.map(censusRowOf), completeCensus: plan.ids === null,
    witness: answer.readAuthorityWitness};
}

export {REPAIR_AUTHORITY, REPAIR_READ_SCOPE, readRetainedRepairAuthority};
