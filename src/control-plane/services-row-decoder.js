/**
 * The one decoder of a stored `services` row (quest
 * system-table-row-decoders). It is the only module that reads a services
 * row's stored column names; every consumer reads the frozen canonical
 * object it returns (camelCase fields, `projection` marker). Decoding rules
 * and refusals: system-table-row-decoding.js.
 *
 * Closed domains: `status` (SERVICES_ROW_STATUS) and `raft_role`
 * (SERVICES_ROW_RAFT_ROLE); a stored value outside them decodes to
 * ROW_UNRECOGNISED carrying the stored text. A partial SELECT decodes
 * through a projection its query declares with defineServicesProjection,
 * beside the query.
 */
import {SERVICES_SCHEMA} from '../bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  ROW_ABSENT,
  decodeSystemTableRow,
  decodeSystemTableRowColumn,
  defineNormalizerReading,
  defineNotObservedReading,
  readDecodedColumn,
  readDecodedRow,
  defineSystemTableDecoding,
  defineSystemTableProjection,
} from './system-table-row-decoding.js';

// Every value a src writer stores in services.status (writer census in the
// quest notes).
const SERVICES_ROW_STATUS = Object.freeze({
  PENDING: 'pending',
  CREATING: 'creating',
  SYNCING: 'syncing',
  ACTIVE: 'active',
  REMOVING: 'removing',
  REMOVED: 'removed',
  FAILED: 'failed',
  STOPPED: 'stopped',
  // The runtime replica projection (RUNTIME_REPLICA_STATUS.CREATED).
  CREATED: 'created',
  // ReplicaRecoveryService rows (REPLICA_RECOVERY_REPLICA_STATUS.STARTING).
  STARTING: 'starting',
  // Cleanup tombstones (REPLICA_CLEANUP_AUTHORITY_KIND).
  CLEANUP_OWNED: 'cleanup_owned',
  CLEANUP_COMPLETE: 'cleanup_complete',
});

const SERVICES_ROW_RAFT_ROLE = RAFT_ROLE;

const SERVICES_DECODING = defineSystemTableDecoding({
  schema: SERVICES_SCHEMA,
  states: {
    status: Object.values(SERVICES_ROW_STATUS),
    raft_role: Object.values(SERVICES_ROW_RAFT_ROLE),
  },
});

/**
 * Declare the projection of a query that selects only some services
 * columns.
 * @param {string} name the projection's name
 * @param {Array<string>} columns the stored columns the query selects
 * @return {Object} the projection
 */
function defineServicesProjection(name, columns) {
  return defineSystemTableProjection(SERVICES_DECODING, name, columns);
}

/**
 * Declare one services reader's reading of ROW_NOT_OBSERVED, field by field
 * (system-table-row-decoding.js defineNotObservedReading).
 * @param {string} reader the reader's name
 * @param {Object} readings `{field: reading}` for every field it reads
 * @return {Object} the frozen reading
 */
function defineServicesNotObservedReading(reader, readings) {
  return defineNotObservedReading(SERVICES_DECODING, reader, readings);
}

/**
 * Decode one stored services row.
 * @param {Object} row the stored row
 * @param {Object} projection the query's projection (default: every column)
 * @return {Object} the frozen canonical services row
 */
function decodeServicesRow(row, projection = SERVICES_DECODING.fullRow) {
  return decodeSystemTableRow(SERVICES_DECODING, row, projection);
}

/**
 * Decode one column of a stored full services row (a prefilter that selects
 * rows before decoding the selected rows whole).
 * @param {Object} row the stored full row
 * @param {string} column the stored column name
 * @return {*} the decoded value (ROW_ABSENT for SQL NULL)
 */
function decodeServicesRowColumn(row, column) {
  return decodeSystemTableRowColumn(SERVICES_DECODING, row, column);
}

// The reading of the readers that read a services row through the folded
// normaliser before the decoders (normalizeServiceRow, HEAD 730225bf1: the
// nine fields below; readText read a missing key, a stored NULL and a
// stored '' alike, and readLowerText lower-cased service_type, raft_role
// and status). A NOT NULL column reads '' when missing or NULL; a nullable
// one reads ROW_ABSENT (round 2: the decoded stored NULL, so a partial row
// and the same row with a stored NULL stay equal, as at HEAD); every stored
// value reads as the normaliser's text, lower-cased where it lower-cased.
// Every such reader reads through this one table (they read through one
// normaliser).
const SERVICES_ROW_NORMALIZER_READING = defineNormalizerReading(
  SERVICES_DECODING,
  'normalizeServiceRow readers',
  {
    serviceId: '',
    serviceType: '',
    nodeId: '',
    partitionId: ROW_ABSENT,
    groupId: ROW_ABSENT,
    replicaId: ROW_ABSENT,
    raftRole: ROW_ABSENT,
    status: '',
    address: ROW_ABSENT,
  },
  ['serviceType', 'raftRole', 'status'],
);

/**
 * The normaliser readers' view of one decoded services row: the nine fields
 * of SERVICES_ROW_NORMALIZER_READING, frozen, no named state, each read as
 * normalizeServiceRow read the stored value.
 * @param {Object} service a decoded services row (full row)
 * @return {Object} the frozen view
 */
function readServicesRowView(service) {
  return readDecodedRow(SERVICES_ROW_NORMALIZER_READING, service);
}

/**
 * Decode one column of a stored full services row into the normaliser
 * readers' reading (SERVICES_ROW_NORMALIZER_READING): a prefilter's view.
 * @param {Object} row the stored full row
 * @param {string} column the stored column name (a field of the table)
 * @return {*} the value as the normaliser read it
 */
function decodeServicesRowColumnView(row, column) {
  return readDecodedColumn(SERVICES_ROW_NORMALIZER_READING, column,
    decodeServicesRowColumn(row, column));
}

/**
 * Decode every stored services row of a full-row read once into the
 * normaliser readers' view (readServicesRowView), for a consumer that reads
 * the set repeatedly.
 * @param {Array<Object>} rows the stored rows
 * @return {Array<Object>} the frozen views
 */
function decodeServicesRows(rows) {
  return rows.map((row) => readServicesRowView(decodeServicesRow(row)));
}

export {
  SERVICES_ROW_RAFT_ROLE,
  SERVICES_ROW_STATUS,
  decodeServicesRow,
  decodeServicesRowColumn,
  decodeServicesRowColumnView,
  decodeServicesRows,
  defineServicesNotObservedReading,
  defineServicesProjection,
  readServicesRowView,
};
