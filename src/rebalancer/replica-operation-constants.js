/**
 * Replica operation message schema constants.
 */

import {FIELD, MESSAGE_TYPE} from '../constants/index.js';

const ReplicaOperationMessageType = Object.freeze({
  CREATE_REPLICA: MESSAGE_TYPE.CREATE_REPLICA,
  REMOVE_REPLICA: MESSAGE_TYPE.REMOVE_REPLICA,
});

const ReplicaOperationField = Object.freeze({
  TYPE: FIELD.TYPE,
  OPERATION_ID: FIELD.OPERATION_ID,
  PARTITION_ID: FIELD.PARTITION_ID,
  REPLICA_ID: FIELD.REPLICA_ID,
  SOURCE_NODE_ID: FIELD.SOURCE_NODE_ID,
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
