// The retained owner consumes one complete leader read per coalesced hint.
// Known blockers need only exact IDs; capacity needs the whole current census.
// This authorizes at most a native retry; committed apply still grants the row.
// A read that cannot serve as authority is a typed outcome with its real cause.
import {isValidLeaderReadAuthorityWitness} from '../control-plane/control-plane-authoritative-read-witness.js';
import {isCompleteAuthoritativeReadResult} from '../control-plane/control-plane-system-table-gateway-read-strategies.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER_MODE} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {LEDGER_PARTITION_ID, censusRowOf, retainedRepairCensusRead} from '../partition/partition-placement-admission-decision.js';
import {assertOperationUpdateRecord} from './replica-operation-update-outcome.js';
import {buildCanonicalReplicaOperationRow} from './replica-operation-repository-mutation-row-methods.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RETAINED_REPAIR_BINDING as BINDING, RETAINED_REPAIR_BLOCKER as BLOCKER} from
  './replica-operation-retained-repair-record.js';

const REPAIR_READ_SCOPE = Object.freeze({CURRENT: 'current_refusal',
  SUBJECT: 'subject', RECEIVER: 'receiver', CENSUS: 'census'});
const REPAIR_AUTHORITY = Object.freeze({UNAVAILABLE: 'unavailable', READY: 'ready'});
// READ_FAILED, UNQUALIFIED_LEADERSHIP (the serving replica is not leader) and
// UNQUALIFIED_POSITION are transient: the continuation owns a bounded retry.
// SHAPE and INVALID_ROW are typed refusals that arm no timer; their wake is a
// change of the offending row or of the binding. UNQUALIFIED_BINDING (served
// by another replica than the decision bound) waits for the route publication.
const REPAIR_AUTHORITY_REFUSAL = Object.freeze({READ_FAILED: 'owner_read_failed',
  UNQUALIFIED_LEADERSHIP: 'unqualified_leadership', UNQUALIFIED_POSITION: 'unqualified_position',
  UNQUALIFIED_BINDING: 'unqualified_binding', UNQUALIFIED_SHAPE: 'unqualified_shape',
  INVALID_ROW: 'invalid_operation_row'});
const TRANSIENT_AUTHORITY_REFUSALS = new Set([REPAIR_AUTHORITY_REFUSAL.READ_FAILED,
  REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_LEADERSHIP, REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_POSITION]);
const OBSERVED_WITNESS = 'observed';

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
  const blocker = attempt.blocker;
  const knownOperations = blocker.kind === BLOCKER.OPERATIONS;
  const receiverCensus = scope === REPAIR_READ_SCOPE.CENSUS ||
    (scope === REPAIR_READ_SCOPE.RECEIVER && !knownOperations);
  if (scope !== REPAIR_READ_SCOPE.SUBJECT &&
      (blocker.kind === BLOCKER.OCCUPANCY || receiverCensus)) {
    return {...retainedRepairCensusRead(attempt.operation.operationId), ids: null};
  }
  const ids = scope === REPAIR_READ_SCOPE.SUBJECT || !knownOperations ?
    [attempt.operation.operationId] :
    [attempt.operation.operationId, ...blocker.operations.map((row) => row.operationId)];
  return {sql: READ_IDS_PREFIX + ids.map(() => SQL_PARAMETER).join(SQL_SEPARATOR) + SQL_IN_END,
    params: ids, ids: new Set(ids)};
}

// A read is judged against the binding its decision resolved when it began.
function witnessServesBinding(witness, binding) {
  if (binding.state !== BINDING.LOCAL && binding.state !== BINDING.REMOTE) return false;
  return witness.servingNodeId === binding.nodeId &&
    witness.servingReplicaId === binding.replicaId;
}

function witnessPosition(witness, attempt) {
  return Number.isSafeInteger(witness.appliedIndex) &&
    witness.appliedIndex >= attempt.minimumLedgerIndex &&
    Number.isSafeInteger(witness.commitIndex) && witness.commitIndex === witness.appliedIndex &&
    Number.isSafeInteger(witness.term) && witness.term >= attempt.minimumLedgerTerm;
}

function witnessRefusal(witness, attempt, binding) {
  if (witness?.state === OBSERVED_WITNESS && witness.partitionId === LEDGER_PARTITION_ID &&
      witness.role !== RAFT_ROLE.LEADER) {
    return REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_LEADERSHIP;
  }
  if (!isValidLeaderReadAuthorityWitness(witness, LEDGER_PARTITION_ID)) {
    return REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_SHAPE;
  }
  if (!witnessPosition(witness, attempt)) return REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_POSITION;
  return witnessServesBinding(witness, binding) ? null :
    REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_BINDING;
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

async function readRetainedRepairAuthority(repository, attempt, scope, binding) {
  const plan = readPlan(attempt, scope);
  let answer;
  try {
    answer = await repository.executeReplicaOperationsRead(plan.sql, plan.params, READ_OPTIONS);
  } catch {
    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.READ_FAILED);
  }
  if (answer?.success !== true) {
    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.READ_FAILED);
  }
  if (!isCompleteAuthoritativeReadResult(answer)) {
    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_SHAPE);
  }
  const refusal = witnessRefusal(answer.readAuthorityWitness, attempt, binding);
  if (refusal !== null) return unavailableRepairAuthority(refusal);
  if (!completeRows(repository, answer.rows, attempt, plan)) {
    return unavailableRepairAuthority(REPAIR_AUTHORITY_REFUSAL.INVALID_ROW);
  }
  return {state: REPAIR_AUTHORITY.READY, rows: answer.rows,
    census: answer.rows.map(censusRowOf), completeCensus: plan.ids === null,
    witness: answer.readAuthorityWitness};
}

export {REPAIR_AUTHORITY, REPAIR_AUTHORITY_REFUSAL, REPAIR_READ_SCOPE,
  TRANSIENT_AUTHORITY_REFUSALS, readRetainedRepairAuthority};
