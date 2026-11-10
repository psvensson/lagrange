/**
 * The one decoder of a stored `nodes` row (quest system-table-row-decoders).
 * It is the only module that reads a nodes row's stored column names; every
 * consumer reads the frozen canonical object it returns (camelCase fields,
 * `projection` marker, `capabilities` decoded from its JSON text). Decoding
 * rules and refusals: system-table-row-decoding.js.
 *
 * Closed domains: `status` (NODES_ROW_STATUS) and `connection_state`
 * (NODES_ROW_CONNECTION_STATE); a stored value outside them decodes to
 * ROW_UNRECOGNISED carrying the stored text. A partial SELECT decodes
 * through a projection its query declares with defineNodesProjection,
 * beside the query.
 */
import {NODES_SCHEMA} from '../bootstrap/system-table-schemas-constants.js';
import {
  decodeSystemTableRow,
  defineNormalizerReading,
  defineSystemTableDecoding,
  defineSystemTableProjection,
  readDecodedRow,
} from './system-table-row-decoding.js';

// Every value a src writer stores in nodes.status (writer census in the
// quest notes).
const NODES_ROW_STATUS = Object.freeze({
  JOINING: 'joining',
  ACTIVE: 'active',
  STOPPED: 'stopped',
  SUSPECTED: 'suspected',
  FAILED: 'failed',
  RECOVERING: 'recovering',
});

// Every value a src writer stores in nodes.connection_state (`connecting`
// only in admission peer-hint rows a joiner hydrates into its cache).
const NODES_ROW_CONNECTION_STATE = Object.freeze({
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  DISCONNECTED: 'disconnected',
  READY: 'ready',
});

const NODES_DECODING = defineSystemTableDecoding({
  schema: NODES_SCHEMA,
  states: {
    status: Object.values(NODES_ROW_STATUS),
    connection_state: Object.values(NODES_ROW_CONNECTION_STATE),
  },
  jsonArrays: ['capabilities'],
});

/**
 * Declare the projection of a query that selects only some nodes columns.
 * @param {string} name the projection's name
 * @param {Array<string>} columns the stored columns the query selects
 * @return {Object} the projection
 */
function defineNodesProjection(name, columns) {
  return defineSystemTableProjection(NODES_DECODING, name, columns);
}

/**
 * Decode one stored nodes row.
 * @param {Object} row the stored row
 * @param {Object} projection the query's projection (default: every column)
 * @return {Object} the frozen canonical nodes row
 */
function decodeNodesRow(row, projection = NODES_DECODING.fullRow) {
  return decodeSystemTableRow(NODES_DECODING, row, projection);
}

// The reading of the readers that read a nodes row through the folded
// normaliser before the decoders (normalizeNodeRow, HEAD 730225bf1: nodeId,
// status, connectionState, each NOT NULL; readText read a missing key and a
// stored NULL as '', and readLowerText lower-cased status and
// connection_state). Every such reader reads through this one table (they
// read through one normaliser).
const NODES_ROW_NORMALIZER_READING = defineNormalizerReading(
  NODES_DECODING,
  'normalizeNodeRow readers',
  {nodeId: '', status: '', connectionState: ''},
  ['status', 'connectionState'],
);

/**
 * Decode one stored nodes row into the normaliser readers' view: nodeId,
 * status and connectionState (NODES_ROW_NORMALIZER_READING) as
 * normalizeNodeRow read them, frozen, no named state.
 * @param {Object} row the stored full row
 * @return {Object} the frozen view
 */
function decodeNodesRowView(row) {
  return readDecodedRow(NODES_ROW_NORMALIZER_READING, decodeNodesRow(row));
}

/**
 * The normaliser readers' views (decodeNodesRowView) of a multi-row read.
 * @param {Iterable<Object>} rows the stored full rows of the read
 * @return {Array<Object>} the frozen views
 */
function decodeNodesRowViews(rows) {
  return [...rows].map(decodeNodesRowView);
}

export {
  NODES_ROW_CONNECTION_STATE,
  NODES_ROW_STATUS,
  decodeNodesRow,
  decodeNodesRowView,
  decodeNodesRowViews,
  defineNodesProjection,
};
