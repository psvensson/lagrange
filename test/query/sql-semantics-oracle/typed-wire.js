/**
 * The query-result wire as the oracle crosses it, and the one place the
 * oracle reads a value the coordinator holds.
 *
 * Frames: a request crosses the router's own outbound encoder
 * (encodeDeliveryMessage, the non-duration branch a QUERY delivery takes),
 * the inbound dispatch's JSON.parse, and the answer crosses sendRaw (the
 * SERVICE_RESPONSE writer) and JSON.parse again. Local delivery hands the
 * answer object over by reference (message-router-delivery-behaviors.js
 * deliverLocal), so it crosses no frame.
 *
 * Retarget point (WP1). Today no value codec exists: a partition answer
 * carries better-sqlite3 values read with safeIntegers(false), so the
 * coordinator holds a JS number with no storage class, a Buffer only when the
 * delivery was local, and {type:'Buffer',data} after a frame. CURRENT_WIRE
 * names exactly that. When src/query/sql-value-codec.js exists, WP1 replaces
 * CURRENT_WIRE's three functions with the codec's decode and its strict
 * refusal; every expectation in this module and in the layer-B cases stays
 * as written, because each one is SQLite's own typed answer.
 */

import {
  decodeTypedRowSet,
  encodeTypedParams,
} from '../../../src/query/sql-value-codec.js';
import {encodeDeliveryMessage} from
  '../../../src/transport/message-router-delivery-encoding.js';
import {sendRaw} from '../../../src/transport/message-router-delivery-behaviors.js';
import {MESSAGE_ROUTER_SHARED} from '../../../src/transport/message-router-shared.js';

const {ROUTER_ADDRESS, RouterMessageType, WebSocket} = MESSAGE_ROUTER_SHARED;

// The grant a QUERY delivery would hold; the non-duration branch only asks
// whether it is open, so any positive value takes the production branch.
const OPEN_GRANT_MS = 60000;

const CELL_CLASS = Object.freeze({
  NULL: 'null',
  INTEGER: 'integer',
  REAL: 'real',
  TEXT: 'text',
  BLOB: 'blob',
  // A JS number whose storage class the wire did not carry.
  NUMERIC_UNCLASSIFIED: 'numeric-unclassified',
  // A value that is not a SQL value at all (e.g. {type:'Buffer',data}).
  FOREIGN: 'foreign',
  MISSING: 'missing-column',
});

function canonicalNumber(value) {
  return Object.is(value, -0) ? '-0' : String(value);
}

function cell(storageClass, value) {
  return Object.freeze({c: storageClass, v: value});
}

/**
 * SQLite's own typed value, read with safeIntegers(true): a BigInt is an
 * INTEGER and a number is always a REAL.
 * @param {*} value
 * @return {{c: string, v: string}}
 */
function sqliteCell(value) {
  if (value === null || value === undefined) return cell(CELL_CLASS.NULL, '');
  if (typeof value === 'bigint') return cell(CELL_CLASS.INTEGER, value.toString());
  if (typeof value === 'number') return cell(CELL_CLASS.REAL, canonicalNumber(value));
  if (typeof value === 'string') return cell(CELL_CLASS.TEXT, value);
  if (Buffer.isBuffer(value)) return cell(CELL_CLASS.BLOB, value.toString('base64'));
  return cell(CELL_CLASS.FOREIGN, JSON.stringify(value));
}

const CURRENT_WIRE = Object.freeze({
  name: 'typed-row-set-v1',
  carriesStorageClass: true,
  /**
   * What the coordinator holds for one result cell.
   * @param {*} value - The cell as decoded.
   * @return {{c: string, v: string}}
   */
  observeCell(value) {
    if (value === undefined) return cell(CELL_CLASS.MISSING, '');
    if (value === null) return cell(CELL_CLASS.NULL, '');
    if (typeof value === 'number') return cell(CELL_CLASS.REAL, canonicalNumber(value));
    if (typeof value === 'bigint') return cell(CELL_CLASS.INTEGER, value.toString());
    if (typeof value === 'string') return cell(CELL_CLASS.TEXT, value);
    if (Buffer.isBuffer(value)) return cell(CELL_CLASS.BLOB, value.toString('base64'));
    return cell(CELL_CLASS.FOREIGN, JSON.stringify(value));
  },
  /**
   * The rows of one partition answer, in the given column order.
   * @param {Object} answer - A partition QUERY answer as delivered.
   * @param {string[]} columns - Column names.
   * @return {Array<Array<{c: string, v: string}>>}
   */
  observeAnswerRows(answer, columns) {
    if (answer?.rowSet) {
      const decoded = decodeTypedRowSet(answer.rowSet);
      return decoded.rows.map((row) =>
        columns.map((column) => {
          const idx = decoded.columns.indexOf(column);
          return CURRENT_WIRE.observeCell(idx >= 0 ? row[idx] : undefined);
        }),
      );
    }
    return (answer?.rows || []).map((row) =>
      columns.map((column) => CURRENT_WIRE.observeCell(row?.[column])));
  },
  /**
   * Replace the first answer cell with a value that is not a canonical cell
   * of this wire.
   * @param {Object} answer - A successful partition QUERY answer.
   * @return {Object} The answer with one corrupted cell.
   */
  corruptFirstCell(answer) {
    if (answer?.rowSet && Array.isArray(answer.rowSet.rows) && answer.rowSet.rows.length > 0) {
      const [firstRow, ...restRows] = answer.rowSet.rows;
      return {
        ...answer,
        rowSet: {
          ...answer.rowSet,
          rows: [
            [firstRow[0], {type: 'Buffer', data: [0x41]}, ...firstRow.slice(2)],
            ...restRows,
          ],
        },
      };
    }
    const [first, ...rest] = answer.rows;
    const column = Object.keys(first)[0];
    return {...answer,
      rows: [{...first, [column]: {type: 'Buffer', data: [0x41]}}, ...rest]};
  },
});

// Layer B witnesses (§4.1 B): every storage class, int64 extremes, 2^53±1,
// REAL -0, ±Infinity and ties, unicode TEXT (no invalid UTF-8 and no lone
// surrogates: partitions store those as U+FFFD before any wire), and empty
// and non-empty BLOBs. Each row witness is a SQL expression the partition
// evaluates; each parameter witness is a client value bound at the partition.
// SQLite's own answer for the same expression or binding is the expectation.
const ROW_VALUE_WITNESSES = Object.freeze([
  ['null', 'NULL'],
  ['integer-zero', '0'],
  ['integer-negative', '-7'],
  ['integer-2^53-1', '9007199254740991'],
  ['integer-2^53', '9007199254740992'],
  ['integer-2^53+1', '9007199254740993'],
  ['integer-minus-2^53-1', '-9007199254740993'],
  ['integer-int64-max', '9223372036854775807'],
  ['integer-int64-min', 'CAST(\'-9223372036854775808\' AS INTEGER)'],
  ['real-integral', '2.0'],
  ['real-half', '2.5'],
  ['real-negative-zero', '-0.0'],
  ['real-tie', '0.9365'],
  ['real-max', '1.7976931348623157e308'],
  ['real-inexact-sum', '0.1 + 0.2'],
  ['real-positive-infinity', '9e999'],
  ['real-negative-infinity', '-9e999'],
  ['text-empty', '\'\''],
  ['text-latin', '\'é ß\''],
  ['text-astral', '\'😀\''],
  ['text-halfwidth', '\'ｱ\''],
  ['text-quote', '\'a\'\'b\''],
  ['text-nul', '\'x\' || char(0) || \'y\''],
  ['blob-empty', 'x\'\''],
  ['blob-one-byte', 'x\'41\''],
  ['blob-binary', 'x\'00ff\''],
].map(([id, expression]) => Object.freeze({id, expression})));

const PARAMETER_WITNESSES = Object.freeze([
  ['null', null],
  ['bigint-small', 5n],
  ['bigint-2^53+1', 9007199254740993n],
  ['bigint-int64-max', 9223372036854775807n],
  ['number-integral', 2],
  ['number-half', 2.5],
  ['number-negative-zero', -0],
  ['number-infinity', Infinity],
  ['text-empty', ''],
  ['text-astral', '😀'],
  ['blob-empty', Buffer.alloc(0)],
  ['blob-one-byte', Buffer.from('A')],
].map(([id, value]) => Object.freeze({id, value})));

let frameSequence = 0;

/**
 * Encode one QUERY request through the router's outbound frame encoder.
 * @param {Object} request
 * @return {string} The frame bytes.
 */
function encodeRequestFrame({sourceNodeId, targetAddress, payload}) {
  frameSequence += 1;
  const lifetime = Object.freeze({
    durationField: undefined,
    prepareMessage: (message) => message,
    remainingMs: () => OPEN_GRANT_MS,
  });
  return encodeDeliveryMessage({
    type: RouterMessageType.SERVICE_MESSAGE,
    messageId: `oracle-${frameSequence}`,
    targetAddress,
    sourceAddress: ROUTER_ADDRESS.buildSourceAddress(sourceNodeId),
    sourceNodeId,
    payload,
    timestamp: frameSequence,
  }, lifetime).stamp();
}

/**
 * The inbound dispatch's frame parse (message-router-inbound-dispatch.js).
 * @param {string|Buffer} bytes
 * @return {Object}
 */
function decodeFrame(bytes) {
  return JSON.parse(bytes.toString());
}

/**
 * Encode the handler's answer the way the inbound side answers a
 * SERVICE_MESSAGE: sendRaw writes a SERVICE_RESPONSE frame to the socket.
 * @param {Object} inbound - The parsed request frame.
 * @param {*} result - The handler's answer.
 * @return {string} The response frame bytes.
 */
function encodeResponseFrame(inbound, result) {
  const written = [];
  const socket = {readyState: WebSocket.OPEN, send: (data) => written.push(data)};
  sendRaw(null, socket, {
    type: RouterMessageType.SERVICE_RESPONSE,
    messageId: inbound.messageId,
    sourceAddress: inbound.sourceAddress,
    result,
  });
  return written[0];
}

function prepareWirePayload(payload) {
  if (
    payload &&
    payload.type === 'QUERY' &&
    Array.isArray(payload.params) &&
    payload.typedParams === undefined
  ) {
    const typedParams = encodeTypedParams(payload.params);
    const jsonSafeParams = payload.params.map((val) =>
      (typeof val === 'bigint' ? val.toString() : val));
    return {...payload, params: jsonSafeParams, typedParams};
  }
  return payload;
}

function attachAnswerColumnShape(answer) {
  if (
    answer &&
    typeof answer === 'object' &&
    answer.rowSet &&
    Array.isArray(answer.rowSet.columns) &&
    Array.isArray(answer.rowSet.rows) &&
    !Array.isArray(answer.rows)
  ) {
    const template = Object.fromEntries(answer.rowSet.columns.map((col) => [col, null]));
    return {
      ...answer,
      rows: answer.rowSet.rows.map(() => ({...template})),
    };
  }
  return answer;
}

/**
 * Deliver one request to a partition's registered transport handler.
 * @param {Object} options
 * @param {Object} options.service - A real PartitionService.
 * @param {string} options.sourceNodeId
 * @param {string} options.targetAddress
 * @param {Object} options.payload - The QUERY message.
 * @param {boolean} options.remote - Cross the frames (true) or deliver by
 *   reference like deliverLocal (false).
 * @return {Promise<Object>} The answer as the coordinator receives it.
 */
async function deliverToPartition({service, sourceNodeId, targetAddress, payload, remote}) {
  const effectivePayload = prepareWirePayload(payload);
  if (!remote) {
    const localAnswer = await service.handleTransportMessage({
      messageId: 'oracle-local', sourceAddress: ROUTER_ADDRESS.buildSourceAddress(sourceNodeId),
      sourceNodeId, targetAddress, payload: effectivePayload, timestamp: 0,
    });
    return attachAnswerColumnShape(localAnswer);
  }
  const inbound = decodeFrame(encodeRequestFrame({
    sourceNodeId,
    targetAddress,
    payload: effectivePayload,
  }));
  const answer = await service.handleTransportMessage({
    messageId: inbound.messageId,
    sourceAddress: inbound.sourceAddress,
    sourceNodeId: inbound.sourceNodeId,
    targetAddress: inbound.targetAddress,
    payload: inbound.payload,
    timestamp: inbound.timestamp,
  });
  const framedAnswer = decodeFrame(encodeResponseFrame(inbound, answer)).result;
  return attachAnswerColumnShape(framedAnswer);
}

export {
  CELL_CLASS,
  CURRENT_WIRE,
  PARAMETER_WITNESSES,
  ROW_VALUE_WITNESSES,
  deliverToPartition,
  sqliteCell,
};
