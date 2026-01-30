import {NUM, STRING, TIME_MS} from '../constants/index.js';
import {NODE_STATUS} from './node-constants.js';

const REPLICA_RECOVERY_SUBSYSTEM = 'replica-recovery';

const REPLICA_RECOVERY_DEFAULT = Object.freeze({
  CHECK_INTERVAL_MS: TIME_MS.SECOND * NUM.TEN,
  MIN_PARTITION_REPLICAS: NUM.THREE,
  MIN_MESSAGE_GROUP_REPLICAS: NUM.THREE,
  RECOVERY_DELAY_MS: TIME_MS.SECOND * NUM.FIVE,
});

const REPLICA_RECOVERY_LOG_MSG = Object.freeze({
  INITIALIZED: 'Replica recovery service initialized',
  STARTING_MONITORING: 'Starting replica recovery monitoring',
  CHECK_ERROR: 'Error during replica recovery check',
  STOPPED_MONITORING: 'Stopped replica recovery monitoring',
  PARTITION_BELOW_MIN: 'Partition replica count below minimum',
  MESSAGE_GROUP_BELOW_MIN: 'Message group replica count below minimum',
  NO_HEALTHY_NODES_PARTITION: 'No healthy nodes available for partition recovery',
  NO_HEALTHY_NODES_MESSAGE_GROUP: 'No healthy nodes available for message group recovery',
  CREATE_PARTITION_REPLICA: 'Creating replacement partition replica',
  CREATE_MESSAGE_GROUP_REPLICA: 'Creating replacement message group replica',
  CREATE_PARTITION_FAILED: 'Failed to create partition replica',
  CREATE_MESSAGE_GROUP_FAILED: 'Failed to create message group replica',
  SHUTDOWN: 'Replica recovery service shutdown',
});

const REPLICA_RECOVERY_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'ReplicaRecoveryService requires nodeId',
  MISSING_SYSTEM_TABLE_CACHE: 'ReplicaRecoveryService requires systemTableCache',
  MISSING_CDC_SERVICE: 'ReplicaRecoveryService requires cdcIntegrationService',
  NOT_INITIALIZED: 'ReplicaRecoveryService not initialized',
});

const REPLICA_RECOVERY_ENTITY_TYPE = Object.freeze({
  PARTITION: 'partition',
  MESSAGE_GROUP: 'message_group',
});

const REPLICA_RECOVERY_KEY_PREFIX = Object.freeze({
  PARTITION: 'partition:',
  MESSAGE_GROUP: 'message_group:',
});

const REPLICA_RECOVERY_EVENT = Object.freeze({
  REPLICA_CREATED: 'replicaCreated',
});

const REPLICA_RECOVERY_REPLICA_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  FAILED: 'failed',
  STARTING: 'starting',
  STOPPING: 'stopping',
});

const REPLICA_RECOVERY_NODE_STATUS = NODE_STATUS;

const REPLICA_RECOVERY_NUM = Object.freeze({
  ZERO: NUM.ZERO,
});

const REPLICA_RECOVERY_STRING = Object.freeze({
  UNKNOWN: STRING.UNKNOWN,
});

export {
  REPLICA_RECOVERY_DEFAULT,
  REPLICA_RECOVERY_ENTITY_TYPE,
  REPLICA_RECOVERY_ERROR_MSG,
  REPLICA_RECOVERY_EVENT,
  REPLICA_RECOVERY_KEY_PREFIX,
  REPLICA_RECOVERY_LOG_MSG,
  REPLICA_RECOVERY_NODE_STATUS,
  REPLICA_RECOVERY_NUM,
  REPLICA_RECOVERY_REPLICA_STATUS,
  REPLICA_RECOVERY_STRING,
  REPLICA_RECOVERY_SUBSYSTEM,
};
