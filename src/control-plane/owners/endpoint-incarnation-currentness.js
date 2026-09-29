import {COLUMN, TABLES} from '../../constants/index.js';
import {normalizeKnownNodeBootIncarnation} from
  '../control-plane-error-classification.js';

/**
 * The endpoint currentness view of the endpoint incarnation authority
 * (invariant I9): which endpoint rows are current evidence. Pure (no
 * gateway), so every semantic reader - routing, readiness, admission,
 * placement, discovery, publication - can consume it without joining the
 * control-plane gateway's import graph. The write protocol lives in
 * endpoint-incarnation-authority.js, which consumes this view.
 */
function endpointIncarnationOf(row) {
  return normalizeKnownNodeBootIncarnation(row?.[COLUMN.BOOT_INCARNATION]);
}

/**
 * The one endpoint-validity rule: current iff the endpoint's incarnation is
 * known and equals the authoritative NODES incarnation of the same node.
 * @param {Object|null} endpointRow
 * @param {Object|null} nodeRow - The node's NODES row.
 * @return {boolean}
 */
function isEndpointCurrentForNode(endpointRow, nodeRow) {
  const endpointIncarnation = endpointIncarnationOf(endpointRow);
  return endpointIncarnation > 0 &&
    typeof endpointRow?.[COLUMN.NODE_ID] === 'string' &&
    nodeRow?.[COLUMN.NODE_ID] === endpointRow[COLUMN.NODE_ID] &&
    normalizeKnownNodeBootIncarnation(nodeRow?.[COLUMN.BOOT_INCARNATION]) ===
      endpointIncarnation;
}

/**
 * A node-row lookup from whatever NODES source a reader holds: a lookup
 * function, a Map by node id, an array of NODES rows, or a system-table
 * cache. No source means no node row: nothing is current (fail closed).
 * @param {Function|Map|Array|Object|null} nodeRows
 * @return {Function} (nodeId) => NODES row or null.
 */
function nodeRowLookupOf(nodeRows) {
  if (typeof nodeRows === 'function') return nodeRows;
  if (nodeRows instanceof Map) return (nodeId) => nodeRows.get(nodeId) || null;
  if (Array.isArray(nodeRows)) {
    const byNodeId = new Map(nodeRows.map((row) => [row?.[COLUMN.NODE_ID], row]));
    return (nodeId) => byNodeId.get(nodeId) || null;
  }
  if (typeof nodeRows?.get === 'function') {
    return (nodeId) => nodeRows.get(TABLES.NODES, nodeId) || null;
  }
  return () => null;
}

/**
 * The current endpoint view: only rows owned by their node's current
 * authoritative incarnation. Every semantic endpoint reader consumes this
 * view; stale or legacy rows may exist for cleanup but are never current.
 * @param {Array<Object>} endpointRows
 * @param {Function|Map|Array|Object|null} nodeRows - NODES source.
 * @return {Array<Object>}
 */
function selectCurrentEndpointRows(endpointRows, nodeRows) {
  const nodeRowOf = nodeRowLookupOf(nodeRows);
  return (Array.isArray(endpointRows) ? endpointRows : []).filter((row) =>
    isEndpointCurrentForNode(row, nodeRowOf(row?.[COLUMN.NODE_ID])));
}

/**
 * The current view of one endpoint table from a system-table cache, judged
 * against that cache's NODES rows.
 * @param {Object} systemTableCache
 * @param {string} tableName - node_endpoints or service_endpoints.
 * @return {Array<Object>}
 */
function readCurrentEndpointRows(systemTableCache, tableName) {
  const rows = typeof systemTableCache?.getAll === 'function' ?
    systemTableCache.getAll(tableName) || [] :
    [];
  return selectCurrentEndpointRows(rows, systemTableCache);
}

export {
  endpointIncarnationOf,
  isEndpointCurrentForNode,
  readCurrentEndpointRows,
  selectCurrentEndpointRows,
};
