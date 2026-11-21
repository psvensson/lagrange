// Startup SQL is selected by its JOIN owner's gateway construction.
import {NodeRegistrationOwner} from '../../src/bootstrap/shared/node-registration-owner.js';
import {test} from '../../src/test-helpers/tap.js';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_PHASE_SCOPE,
  GATEWAY_ERROR_MSG,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';

function gatewayWithoutCdc(startupJoin = false) {
  const sql = [];
  const nodeId = 'fallback-node';
  const sqlQueryEngine = {
    async executeQuery(statement, params) {
      sql.push({statement, params});
      return {success: true, affectedRows: 1};
    },
  };
  // The JOIN owner as the query-system-state phase constructs it: its
  // declared host and its required system-table cache getter (this fixture
  // world holds no cache rows), plus the join-admission SQL engine.
  const gateway = startupJoin ?
    new NodeRegistrationOwner({nodeId, hostId: LOCAL_MACHINE_HOST_ID, delegates: {
      getJoinAdmissionSqlQueryEngine: () => sqlQueryEngine,
      getSystemTableCache: () => null,
    }}).getJoinAdmissionControlPlaneSystemTableGateway() :
    new ControlPlaneSystemTableGateway({nodeId, sqlQueryEngine});
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

test('the actual JOIN owner selects startup SQL when constructed for that ' +
  'phase', async (t) => {
  const {gateway, sql} = gatewayWithoutCdc(true);
  await gateway.submitMutation(
    {operation: 'insert', tableName: 'nodes', row: {...NODE_ROW}},
    {phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN});
  t.equal(sql.length, 1, 'one SQL write');
});

test('a phase-scoped membership publication write stays fenced off the ' +
  'SQL path', async (t) => {
  const {gateway, sql} = gatewayWithoutCdc(true);
  const refusal = await gateway.submitMutation({operation: 'insert',
    tableName: 'control_plane_publications',
    row: {publication_id: 'p-1'}},
  {phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN})
    .then(() => null, (error) => error);
  t.equal(refusal?.message, GATEWAY_ERROR_MSG.CDC_REQUIRED);
  t.equal(sql.length, 0, 'no SQL was issued');
});

test('guarded mutations retain NULL and refuse unknown predicate fields before SQL', async (t) => {
  const {gateway, sql} = gatewayWithoutCdc(true);
  const options = {phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN};
  const mutation = {
    operation: 'update', tableName: 'nodes', data: {status: 'active'},
    whereClause: {node_id: 'fallback-node', ready_lease_expires_at: null},
  };
  await gateway.submitMutation(mutation, options);
  t.same(sql, [{
    statement: 'UPDATE nodes SET status = ? WHERE node_id = ? AND ready_lease_expires_at IS NULL',
    params: ['active', 'fallback-node'],
  }], 'ordinary guarded SQL preserves all predicate values');

  for (const extra of [{misspelled_lease: null}, {ready_lease_expires_at: undefined}]) {
    await t.rejects(gateway.submitMutation({...mutation,
      whereClause: {...mutation.whereClause, ...extra}}, options),
    {message: GATEWAY_ERROR_MSG.MUTATION_WHERE_INVALID});
  }
  t.equal(sql.length, 1, 'invalid predicates cannot become a broader SQL update');
});

test('a runtime phase label does not authorize a different writer when the CDC owner is absent',
  async (t) => {
    const {gateway, sql} = gatewayWithoutCdc();
    await t.rejects(gateway.submitMutation(
      {operation: 'insert', tableName: 'nodes', row: {...NODE_ROW}},
      {phaseScope: CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP}),
    {message: GATEWAY_ERROR_MSG.CDC_REQUIRED});
    t.equal(sql.length, 0, 'no SQL write');
  });
