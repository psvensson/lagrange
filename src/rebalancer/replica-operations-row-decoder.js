/**
 * The one decoder of a stored `replica_operations` row (quest
 * system-table-row-decoders). It is the only module that reads a
 * replica_operations row's stored column names; ReplicaOperationRepository
 * #rowToOperation builds the runtime operation from its result, and every
 * other consumer reads either that operation or this frozen canonical
 * object (camelCase fields, `projection` marker, `stepsHistory` decoded
 * from its JSON text). Decoding rules and refusals:
 * ../control-plane/system-table-row-decoding.js.
 *
 * Closed domains: `type` (REPLICA_OPERATIONS_ROW_TYPE), `status`
 * (REPLICA_OPERATIONS_ROW_STATUS) and `workflow_step` (WORKFLOW_STEP); a
 * stored value outside them decodes to ROW_UNRECOGNISED carrying the stored
 * text. A partial SELECT decodes through a projection its query declares
 * with defineReplicaOperationsProjection, beside the query.
 */
import {REPLICA_OPERATIONS_SCHEMA} from '../bootstrap/system-table-schemas-constants.js';
import {BOOTSTRAP_API_ASSIGNMENT} from '../bootstrap/bootstrap-api-constants.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {
  decodeSystemTableRow,
  defineNotObservedReading,
  defineSystemTableDecoding,
  defineSystemTableProjection,
} from '../control-plane/system-table-row-decoding.js';
import {OperationType, ReplicaStatus} from './replica-operation-progress.js';

// Every value a src writer stores (writer census in the quest notes): the
// coordinator's operation types plus the bootstrap move-assignment
// reservation row; ReplicaStatus without HELD, which is never persisted.
const REPLICA_OPERATIONS_ROW_TYPE = Object.freeze({
  ...OperationType,
  MOVE_ASSIGNMENT: BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
});
const REPLICA_OPERATIONS_ROW_STATUS = Object.freeze(Object.fromEntries(
  Object.entries(ReplicaStatus).filter(([name]) => name !== 'HELD')));

const REPLICA_OPERATIONS_DECODING = defineSystemTableDecoding({
  schema: REPLICA_OPERATIONS_SCHEMA,
  states: {
    type: Object.values(REPLICA_OPERATIONS_ROW_TYPE),
    status: Object.values(REPLICA_OPERATIONS_ROW_STATUS),
    workflow_step: Object.values(WORKFLOW_STEP),
  },
  jsonArrays: ['steps_history'],
  // A steps_history text holding no array is refused (earlier ruling: HEAD
  // logged it and read []; the column is NOT NULL JSON written only by
  // buildReplicaOperationRow).
  refusingJsonArrays: ['steps_history'],
});

/**
 * Declare the projection of a query that selects only some
 * replica_operations columns.
 * @param {string} name the projection's name
 * @param {Array<string>} columns the stored columns the query selects
 * @return {Object} the projection
 */
function defineReplicaOperationsProjection(name, columns) {
  return defineSystemTableProjection(REPLICA_OPERATIONS_DECODING, name, columns);
}

/**
 * Declare one replica_operations reader's reading of ROW_NOT_OBSERVED, field by field
 * (system-table-row-decoding.js defineNotObservedReading).
 * @param {string} reader the reader's name
 * @param {Object} readings `{field: reading}` for every field it reads
 * @return {Object} the frozen reading
 */
function defineReplicaOperationsNotObservedReading(reader, readings) {
  return defineNotObservedReading(REPLICA_OPERATIONS_DECODING, reader, readings);
}

/**
 * Decode one stored replica_operations row.
 * @param {Object} row the stored row
 * @param {Object} projection the query's projection (default: every column)
 * @return {Object} the frozen canonical replica_operations row
 */
function decodeReplicaOperationsRow(row, projection = REPLICA_OPERATIONS_DECODING.fullRow) {
  return decodeSystemTableRow(REPLICA_OPERATIONS_DECODING, row, projection);
}

export {
  REPLICA_OPERATIONS_ROW_STATUS,
  REPLICA_OPERATIONS_ROW_TYPE,
  decodeReplicaOperationsRow,
  defineReplicaOperationsNotObservedReading,
  defineReplicaOperationsProjection,
};
