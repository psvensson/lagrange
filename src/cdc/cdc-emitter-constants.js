/**
 * Constants for CDCEmitter - composable CDC event generation and
 * subscriber management.
 * Encapsulates CDC event creation, subscriber lifecycle, and
 * event delivery.
 *
 * @module cdc/cdc-emitter-constants
 */

import {CDC_OPERATION} from '../constants/index.js';

/**
 * CDC operation types for emitted events.
 * Re-exported from shared constants for CDCEmitter consumers.
 */
const CDC_EMITTER_OPERATION = Object.freeze({
  INSERT: CDC_OPERATION.INSERT,
  UPDATE: CDC_OPERATION.UPDATE,
  DELETE: CDC_OPERATION.DELETE,
});

/**
 * CDC event field names used when constructing event objects.
 */
const CDC_EMITTER_FIELD = Object.freeze({
  TABLE_NAME: 'tableName',
  OPERATION: 'operation',
  DATA: 'data',
  TIMESTAMP: 'timestamp',
  SOURCE_PARTITION: 'sourcePartition',
  SOURCE_REPLICA: 'sourceReplica',
});

/**
 * Error messages for CDCEmitter validation and runtime errors.
 */
const CDC_EMITTER_ERROR_MSG = Object.freeze({
  MISSING_OPERATION: 'CDCEmitter.emit requires operation',
  MISSING_DATA: 'CDCEmitter.emit requires data',
  MISSING_PARTITION_ID: 'CDCEmitter requires partitionId',
  MISSING_REPLICA_ID: 'CDCEmitter requires replicaId',
  MISSING_TABLE_NAME: 'CDCEmitter requires tableName',
  MISSING_HLC_CLOCK: 'CDCEmitter requires hlcClock',
  subscriberDeliveryFailed: (index) =>
    `CDC subscriber delivery failed at index ${index}`,
});

/**
 * Log messages emitted by CDCEmitter during lifecycle operations.
 */
const CDC_EMITTER_LOG_MSG = Object.freeze({
  EMITTING_EVENT: 'Emitting CDC event',
  SUBSCRIBER_ADDED: 'CDC subscriber added',
  SUBSCRIBER_REMOVED: 'CDC subscriber removed',
  SUBSCRIBER_DELIVERY_FAILED: 'CDC subscriber delivery failed',
  SHUTDOWN: 'CDCEmitter shutting down',
  SHUTDOWN_COMPLETE: 'CDCEmitter shutdown complete',
});

export {
  CDC_EMITTER_ERROR_MSG,
  CDC_EMITTER_FIELD,
  CDC_EMITTER_LOG_MSG,
  CDC_EMITTER_OPERATION,
};
