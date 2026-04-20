import {SERVICE_TYPE} from '../../src/constants/index.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  REPLICA_STATE_MACHINE_STATE,
} from '../../src/node/replica-state-machine-constants.js';

const PROPERTY_TEST_NODE_ID = 'test-node';
const PROPERTY_TEST_REASON = 'property-test';
const CANONICAL_PARTITION_LEADER_CLEAR_STATES = new Set([
  REPLICA_STATE_MACHINE_STATE.REMOVING,
  REPLICA_STATE_MACHINE_STATE.REMOVED,
  REPLICA_STATE_MACHINE_STATE.FAILED,
]);

function buildReplicaStatePropertyContext(partitionId, reason = PROPERTY_TEST_REASON) {
  return {
    partitionId,
    nodeId: PROPERTY_TEST_NODE_ID,
    reason,
    serviceType: SERVICE_TYPE.PARTITION,
  };
}

function countCanonicalPartitionLeaderClears(sequence = []) {
  return sequence.filter((state) =>
    CANONICAL_PARTITION_LEADER_CLEAR_STATES.has(state),
  ).length;
}

function getExpectedReplicaStateMutationBundleCount(sequence = []) {
  return sequence.length + countCanonicalPartitionLeaderClears(sequence);
}

function isServiceMutationCall(call) {
  return call?.tableName === TABLES.SERVICES;
}

function isCanonicalPartitionLeaderClearCall(call, partitionId) {
  return call?.tableName === TABLES.PARTITIONS &&
    call?.whereClause?.partition_id === partitionId &&
    call?.whereClause?.leader_node_id === PROPERTY_TEST_NODE_ID &&
    call?.data?.leader_node_id === null;
}

function getServiceMutationCalls(calls = []) {
  return calls.filter(isServiceMutationCall);
}

function getCanonicalPartitionLeaderClearCalls(calls = [], partitionId) {
  return calls.filter((call) =>
    isCanonicalPartitionLeaderClearCall(call, partitionId),
  );
}

export {
  buildReplicaStatePropertyContext,
  CANONICAL_PARTITION_LEADER_CLEAR_STATES,
  getCanonicalPartitionLeaderClearCalls,
  getExpectedReplicaStateMutationBundleCount,
  getServiceMutationCalls,
  isCanonicalPartitionLeaderClearCall,
  isServiceMutationCall,
  PROPERTY_TEST_NODE_ID,
  PROPERTY_TEST_REASON,
};
