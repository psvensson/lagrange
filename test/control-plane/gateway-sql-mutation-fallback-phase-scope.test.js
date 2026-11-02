/**
 * The gateway's SQL mutation path for a node with no CDC integration owner
 * yet is gated by the write's phase scope alone (quest
 * replica-admission-from-committed-operation attempt 2 deleted the
 * skipCacheWait half of the gate; lead decision 2026-11-02). A write
 * without a phase scope - a bootstrap-API write included - is still refused
 * CDC_REQUIRED and reaches no SQL; a phase-scoped write commits through the
 * SQL engine; a phase-scoped membership-publication write stays fenced.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_PHASE_SCOPE,
  GATEWAY_ERROR_MSG,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';

function gatewayWithoutCdc() {
  const sql = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'fallback-node',
    sqlQueryEngine: {
      async executeQuery(statement, params) {
        sql.push({statement, params});
        return {success: true, affectedRows: 1};
      },
    },
  });
  return {gateway, sql};
}

const NODE_ROW = Object.freeze({node_id: 'fallback-node',
  node_address: '127.0.0.1:1', status: 'joining'});

test('without a phase scope a write with no CDC owner is refused ' +
  'CDC_REQUIRED and reaches no SQL', async (t) => {
  const {gateway, sql} = gatewayWithoutCdc();
  const refusal = await gateway.submitMutation(
    {operation: 'insert', tableName: 'nodes', row: {...NODE_ROW}}, {})
    .then(() => null, (error) => error);
  t.equal(refusal?.message, GATEWAY_ERROR_MSG.CDC_REQUIRED);
  t.equal(sql.length, 0, 'no SQL was issued');
});

test('a phase-scoped write with no CDC owner commits through the SQL ' +
  'engine', async (t) => {
  const {gateway, sql} = gatewayWithoutCdc();
  await gateway.submitMutation(
    {operation: 'insert', tableName: 'nodes', row: {...NODE_ROW}},
    {phaseScope: CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP});
  t.equal(sql.length, 1, 'one SQL write');
});

test('a phase-scoped membership publication write stays fenced off the ' +
  'SQL path', async (t) => {
  const {gateway, sql} = gatewayWithoutCdc();
  const refusal = await gateway.submitMutation({operation: 'insert',
    tableName: 'control_plane_publications',
    row: {publication_id: 'p-1'}},
  {phaseScope: CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP})
    .then(() => null, (error) => error);
  t.equal(refusal?.message, GATEWAY_ERROR_MSG.CDC_REQUIRED);
  t.equal(sql.length, 0, 'no SQL was issued');
});
