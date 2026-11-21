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

const REPAIR_AUTHORITY = Object.freeze({UNAVAILABLE: 'unavailable', READY: 'ready'});
const UNAVAILABLE = Object.freeze({state: REPAIR_AUTHORITY.UNAVAILABLE});
const READ_OPTIONS = Object.freeze({authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: LEADER_MODE.REQUIRED});
const READ_IDS_PREFIX = 'SELECT * FROM replica_operations WHERE operation_id IN (';
const SQL_SEPARATOR = ', ';
const SQL_PARAMETER = '?';

function readPlan(attempt) {
  if (attempt.occupancy) return {...retainedRepairCensusRead(attempt.operation.operationId), ids: null};
  const ids = attempt.blockers === null ? [attempt.operation.operationId] :
    [attempt.operation.operationId, ...attempt.blockers.map((row) => row.operationId)];
  return {sql: READ_IDS_PREFIX + ids.map(() => SQL_PARAMETER).join(SQL_SEPARATOR) + ')',
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

function completeRows(repository, rows, attempt, plan) {
  const columns = Object.keys(buildCanonicalReplicaOperationRow(attempt.operation,
    attempt.operation.ownerLeaseExpiresAt ?? null));
  const ids = new Set();
  return rows.every((row) => {
    if (row === null || typeof row !== 'object') return false;
    if (!columns.every((column) => Object.hasOwn(row, column)) || ids.has(row.operation_id)) {
      return false;
    }
    try {
      assertOperationUpdateRecord(repository.rowToOperation(row));
    } catch {
      return false;
    }
    ids.add(row.operation_id);
    return plan.ids === null || plan.ids.has(row.operation_id);
  });
}

async function readRetainedRepairAuthority(repository, attempt) {
  const plan = readPlan(attempt);
  const answer = await repository.executeReplicaOperationsRead(plan.sql, plan.params, READ_OPTIONS);
  if (!isCompleteAuthoritativeReadResult(answer) ||
      !currentWitness(answer.readAuthorityWitness, attempt) ||
      !completeRows(repository, answer.rows, attempt, plan)) return UNAVAILABLE;
  return {state: REPAIR_AUTHORITY.READY, rows: answer.rows,
    census: answer.rows.map(censusRowOf), completeCensus: plan.ids === null};
}

export {REPAIR_AUTHORITY, readRetainedRepairAuthority};
