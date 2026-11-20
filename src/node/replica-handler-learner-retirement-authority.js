import {COLUMN, SERVICE_STATUS, TABLES} from '../constants/index.js';
import {
  NODE_LIFECYCLE_AUTHORITATIVE_READ,
  SELECT_NODE_ROW_SQL,
} from '../control-plane/node-lifecycle-publication.js';
import {isAuthoritativeControlPlaneRowReadSuccessful, readAuthoritativeControlPlaneRows} from
  '../control-plane/control-plane-system-table-gateway.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {OPERATION_METADATA_KEY, OperationType} from '../rebalancer/replica-operation-progress.js';
import {memoizedParseStepsHistoryString} from '../rebalancer/steps-history-parse-memo.js';
import {PLACEMENT_TRANSITION_KIND} from '../rebalancer/replica-placement-owner-constants.js';
import {observesCommittedNodeLoss} from '../rebalancer/replica-placement-owner-deficits.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {observeScopedLearnerCleanup} from './replica-cleanup-tombstone-owner.js';
import {
  LEARNER_LIFECYCLE_CUSTODY,
  acquireLearnerRetirementCustody,
  learnerRetirementToken,
  observeLearnerRetirementCustody,
} from './replica-learner-retirement-lifecycle.js';

const SELECT_OPERATION = 'SELECT * FROM replica_operations WHERE operation_id = ?';
const ADMITTED_SCOPE = Object.freeze([
  'nodeBootIncarnation', 'replicaCreatedAt', 'lifecycleVersion', 'lifecycleVersionColumn',
]);

async function readOne(handler, table, sql, key) {
  try {
    const result = await readAuthoritativeControlPlaneRows(
      handler.getControlPlaneSystemTableGateway(), table, sql, [key],
      NODE_LIFECYCLE_AUTHORITATIVE_READ);
    if (isAuthoritativeControlPlaneRowReadSuccessful(result) &&
        result.rowSetComplete === true && result.partial !== true &&
        Array.isArray(result.rows) && result.rows.length === 1) {
      return result.rows[0];
    }
  } catch (error) {
    handler.logger.debug('learner retirement source authority unavailable',
      {table, key, error: error.message});
  }
  return null;
}

function admittedScopeMatches(operation, scope) {
  if (operation?.operation_id !== scope.operationId || operation.type !== OperationType.REMOVE ||
      operation.completed_at !== null || operation.partition_id !== scope.partitionId ||
      operation.replica_id !== scope.replicaId || operation.target_node_id !== scope.targetNodeId ||
      typeof operation.steps_history !== 'string') return false;
  const history = memoizedParseStepsHistoryString(operation.steps_history);
  const admission = history[0]?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION];
  return admission?.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT &&
    ADMITTED_SCOPE.every((field) => admission.learnerRetirement?.[field] === scope[field]);
}

async function observesCurrentRisk(handler, scope, row) {
  const node = await readOne(handler, TABLES.NODES, SELECT_NODE_ROW_SQL, scope.targetNodeId);
  if (node === null) return LEARNER_LIFECYCLE_CUSTODY.UNKNOWN;
  const status = row[COLUMN.STATUS];
  const relevantLoss = observesCommittedNodeLoss(node) || status === ReplicaStatus.FAILED ||
    status === SERVICE_STATUS.STOPPED;
  return node[COLUMN.NODE_ID] === scope.targetNodeId &&
    node[COLUMN.BOOT_INCARNATION] === scope.nodeBootIncarnation && relevantLoss &&
    isCatchupLearnerRaftRole(row[COLUMN.RAFT_ROLE]) ?
    LEARNER_LIFECYCLE_CUSTODY.ACQUIRED : LEARNER_LIFECYCLE_CUSTODY.CHANGED;
}

async function admitsLearnerRetirement(handler, scope) {
  return admittedScopeMatches(await readOne(handler, TABLES.REPLICA_OPERATIONS,
    SELECT_OPERATION, scope.operationId), scope);
}

async function handOffAbsentLearnerCleanup(handler, scope) {
  if (!await admitsLearnerRetirement(handler, scope)) return null;
  if (await observeScopedLearnerCleanup(handler.getControlPlaneSystemTableGateway(), scope)) {
    return learnerRetirementToken(scope.operationId);
  }
  const node = await readOne(handler, TABLES.NODES, SELECT_NODE_ROW_SQL, scope.targetNodeId);
  if (node?.[COLUMN.NODE_ID] !== scope.targetNodeId || !observesCommittedNodeLoss(node)) {
    return null;
  }
  try {
    const adopted = await handler.getReplicaCleanupTombstoneOwner().takeOverAbsentLearner(scope);
    return adopted?.ownerToken ?? null;
  } catch (error) {
    handler.logger.debug('offline learner cleanup takeover unavailable',
      {operationId: scope.operationId, error: error.message});
    return null;
  }
}

async function claimNativeLearnerRetirement(handler, scope) {
  if (!await admitsLearnerRetirement(handler, scope)) {
    return {state: LEARNER_LIFECYCLE_CUSTODY.UNKNOWN, row: null};
  }
  const held = await observeLearnerRetirementCustody(handler.replicaStateMachine, scope);
  if (held.state !== LEARNER_LIFECYCLE_CUSTODY.UNKNOWN || held.row === null) return held;
  const risk = await observesCurrentRisk(handler, scope, held.row);
  return risk === LEARNER_LIFECYCLE_CUSTODY.ACQUIRED ?
    acquireLearnerRetirementCustody(handler.replicaStateMachine, scope, held.row) :
    {state: risk, row: null};
}

export {claimNativeLearnerRetirement, handOffAbsentLearnerCleanup};
