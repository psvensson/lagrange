/**
 * Replica operation message schema constants.
 */

import {FIELD, MESSAGE_TYPE} from '../constants/index.js';

const ReplicaOperationMessageType = Object.freeze({
  CREATE_REPLICA: MESSAGE_TYPE.CREATE_REPLICA,
  REMOVE_REPLICA: MESSAGE_TYPE.REMOVE_REPLICA,
  STEP_DOWN_REPLICA: MESSAGE_TYPE.STEP_DOWN_REPLICA,
});

const ReplicaOperationField = Object.freeze({
  TYPE: FIELD.TYPE,
  OPERATION_ID: FIELD.OPERATION_ID,
  OPERATION_TYPE: FIELD.OPERATION_TYPE,
  PARTITION_ID: FIELD.PARTITION_ID,
  REPLICA_ID: FIELD.REPLICA_ID,
  REPLICA_IDS: FIELD.REPLICA_IDS,
  PEER_ADDRESSES: FIELD.PEER_ADDRESSES,
  BOOTSTRAP_TABLE_METADATA: FIELD.BOOTSTRAP_TABLE_METADATA,
  BOOTSTRAP_PARTITION_METADATA: FIELD.BOOTSTRAP_PARTITION_METADATA,
  SOURCE_NODE_ID: FIELD.SOURCE_NODE_ID,
  ENTITY_TYPE: FIELD.ENTITY_TYPE,
  ENTITY_ID: FIELD.ENTITY_ID,
  REASON: FIELD.REASON,
});

const ReplicaOperationResponseStatus = Object.freeze({
  INITIATED: 'initiated',
  ALREADY_EXISTS: 'already_exists',
  IN_PROGRESS: 'in_progress',
  NOT_FOUND: 'not_found',
  COMPLETED: 'completed',
  ERROR: 'error',
});

export {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
};
