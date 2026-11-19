// Shared fixture of the PLACEMENT_ADMIT falsifiers (quest
// replica-placement-admission-owner, design section 5 WP-E, F1-F10): a real
// replica_operations-p1 PartitionService with the canonical schema executed
// by SQLite and the production committed apply path, under the controllable
// consensus port (the test decides what commits and when). Statements are
// built by the owner's admission-statement module; every row a test plants
// in the ledger goes through a committed SQL statement of the same apply path.
import {REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {PARTITION_SERVICE_EVENT, PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {requestPlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {buildFoundingAdmissionStatement, buildPlacementAdmissionStatement} from
  '../../src/rebalancer/replica-placement-owner-admission-statement.js';
import {PLACEMENT_CLASS} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType, ReplicaStatus, WORKFLOW_STEP_TO_STATUS} from
  '../../src/rebalancer/replica-operation-progress.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {applyCommitted, awaitProposal, shutdownAll, startLeader, track} from
  '../test-helpers/participant-transaction-fixture.js';

const LEDGER_PARTITION_ID = 'replica_operations-p1';
const NODE = Object.freeze({A: 'node-a', B: 'node-b', C: 'node-c', D: 'node-d'});
const FORMATION_LATCH_EPOCH = 4;
const STEP_PROPOSER = 'placement-fixture-proposer';
const ROWS_SQL = 'SELECT * FROM replica_operations ORDER BY operation_id';

/**
 * Run `measure(leader, proposed)` on a fresh ledger leader.
 * @param {Function} measure - The witness.
 * @param {Object} [extra] - More fixture options (timeSource, systemTableCache).
 * @return {Promise<*>} The witness's result.
 */
async function onLedgerLeader(measure, extra = {}) {
  const {leader, proposed} = await startLeader({tableName:
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, schema: REPLICA_OPERATIONS_SCHEMA, ...extra},
  LEDGER_PARTITION_ID);
  try {
    return await measure(leader, proposed);
  } finally {
    await shutdownAll(leader);
  }
}

/**
 * The owner's statement of one PLACEMENT move.
 * @param {Object} input - {partitionId, type, target, source, placementClass,
 *   repair, sourceReplicaId, replicaId, repairWaitingOn}.
 * @return {Object} The canonical statement.
 */
function placementStatement({partitionId, type = OperationType.ADD, target,
  source = NODE.A, placementClass = PLACEMENT_CLASS.SYSTEM, repair = false,
  sourceReplicaId = null, replicaId = null, repairWaitingOn = []}) {
  const copies = type !== OperationType.REMOVE;
  return buildPlacementAdmissionStatement({partitionId, placementClass, repair,
    move: {type, targetNodeId: target, sourceReplicaId, replicaId,
      copySourceNodeId: copies ? source : null}},
  {sourceNodeId: NODE.A, repairWaitingSourceNodeIds: new Set(repairWaitingOn),
    formationLatchEpoch: FORMATION_LATCH_EPOCH, membershipPublicationEpoch: 7,
    positions: {ledgerAppliedIndex: 1, nodesEpoch: 3}});
}

/**
 * The FOUND statement of a user partition's founding set.
 * @param {string} partitionId - The partition.
 * @param {Array<string>} targetNodeIds - The founders' nodes.
 * @return {Object} The canonical statement.
 */
function foundingStatement(partitionId, targetNodeIds,
  placementClass = PLACEMENT_CLASS.USER) {
  return buildFoundingAdmissionStatement({partitionId, placementClass,
    foundingIntentId: `schema-job-1:${partitionId}`, targetNodeIds,
    sourceNodeId: NODE.A, formationLatchEpoch: FORMATION_LATCH_EPOCH,
    positions: {ledgerAppliedIndex: 1}});
}

/**
 * Request one admission on the leader, commit its proposal, answer it.
 * @param {Object} leader - The ledger leader.
 * @param {Array<Object>} proposed - The leader's proposals.
 * @param {string} entryId - The attempt's entryId.
 * @param {Object} body - The statement.
 * @return {Promise<Object>} {command, apply, answer}.
 */
async function admitOnLeader(leader, proposed, entryId, body) {
  const pending = track(requestPlacementAdmission(leader, {entryId, body}));
  const command = await awaitProposal(proposed, (entry) => entry.entryId === entryId);
  const apply = command === null ? 'not proposed' : applyCommitted(leader, command);
  return {command, apply, answer: await pending.promise};
}

/**
 * Commit one SQL statement on the ledger through the committed apply path
 * (a workflow transition of a test row).
 * @param {Object} leader - The ledger leader.
 * @param {string} entryId - The statement's entryId.
 * @param {string} sql - The statement.
 * @param {Array} params - Its parameters.
 * @return {string|null} The apply answer (null when applied).
 */
function commitLedgerStatement(leader, entryId, sql, params) {
  return applyCommitted(leader, {type: PARTITION_SERVICE_OPERATION.QUERY, entryId,
    sql, params, timestamp: leader.hlcClock.now().toString(),
    proposedBy: STEP_PROPOSER, proposedAt: 0});
}

/**
 * Move a ledger row to a workflow step through a committed statement.
 * @param {Object} leader - The ledger leader.
 * @param {string} operationId - The row.
 * @param {string} step - The WORKFLOW_STEP.
 * @return {string|null} The apply answer.
 */
function stepLedgerRow(leader, operationId, step) {
  return commitLedgerStatement(leader, `step:${operationId}:${step}`,
    'UPDATE replica_operations SET workflow_step = ?, status = ? WHERE operation_id = ?',
    [step, step === WORKFLOW_STEP.FAILED ? ReplicaStatus.FAILED :
      WORKFLOW_STEP_TO_STATUS[step], operationId]);
}

function ledgerRows(leader) {
  return leader.db.prepare(ROWS_SQL).all();
}

/**
 * Count the leader's ENTRY_COMMITTED emissions from now on.
 * @param {Object} leader - The ledger leader.
 * @return {Object} {commands: the committed commands seen, stop()}.
 */
function watchEntryCommitted(leader) {
  const commands = [];
  const listener = ({command}) => commands.push(command);
  leader.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, listener);
  return {commands, stop: () => leader.off(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED,
    listener)};
}

export {
  LEDGER_PARTITION_ID,
  NODE,
  admitOnLeader,
  commitLedgerStatement,
  foundingStatement,
  ledgerRows,
  onLedgerLeader,
  placementStatement,
  stepLedgerRow,
  watchEntryCommitted,
};
