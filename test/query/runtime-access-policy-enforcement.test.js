import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {RUNTIME_ACCESS_POLICY_DECISION} from
  '../../src/control-plane/owners/runtime-access-policy-owner.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

const silentLogger = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

function createEngine(owner) {
  const engine = new SQLQueryEngine({
    autoStartDistributedTransactionRecovery: false,
    messageRouter: {deliver: async () => ({success: true})},
    runtimeAccessPolicyOwner: owner,
  });
  engine.logger = silentLogger;
  engine.executeSelect = async () => ({
    count: 1,
    rows: [{id: 1}],
    success: true,
  });
  return engine;
}

describe('runtime access policy query enforcement', () => {
  test('checks the parsed AST before service-attributed execution', async () => {
    const calls = [];
    const engine = createEngine({
      async authorizeStatement(serviceId, ast) {
        calls.push({ast, serviceId});
        return ast.from?.name === 'orders' ? {
          decision: RUNTIME_ACCESS_POLICY_DECISION.ALLOWED,
        } : {
          access: {operation: 'read', table: 'table:global.secret'},
          decision: RUNTIME_ACCESS_POLICY_DECISION.DENIED,
          reason: 'access_not_granted',
        };
      },
    });

    const allowed = await engine.executeQuery(
      'SELECT * FROM orders',
      [],
      {issuingServiceId: 'binding-service-orders'},
    );
    assert.equal(allowed.success, true);
    assert.equal(calls[0].ast.type, 'SELECT');
    assert.equal(calls[0].ast.from.name, 'orders');

    const denied = await engine.executeQuery(
      'SELECT * FROM secret',
      [],
      {issuingServiceId: 'binding-service-orders'},
    );
    assert.equal(denied.success, false);
    assert.equal(denied.errorCode, QUERY_ERROR_CODE.RUNTIME_ACCESS_DENIED);
    assert.equal(denied.reasonCode, 'access_not_granted');
    assert.deepEqual(
      denied.access,
      {operation: 'read', table: 'table:global.secret'},
    );
  });

  test('fails closed when the owner is absent and leaves external SQL unchanged',
    async () => {
      const engine = createEngine(null);
      const denied = await engine.executeQuery(
        'SELECT * FROM orders',
        [],
        {issuingServiceId: 'binding-service-orders'},
      );
      assert.equal(denied.success, false);
      assert.equal(denied.errorCode, QUERY_ERROR_CODE.RUNTIME_ACCESS_DENIED);
      assert.equal(denied.reasonCode, 'policy_owner_unavailable');

      const external = await engine.executeQuery('SELECT * FROM orders');
      assert.equal(external.success, true);
    });

  test('binds service identity to canonical SqlRequest execution', async () => {
    const policy = {
      status: 'resolved',
      policy: {tables: []},
    };
    const engine = createEngine({
      getRuntimePolicy: async () => policy,
    });
    let factory;
    engine.setServiceRuntimeLifecycle({
      setQueryExecutorFactory(value) {
        factory = value;
      },
      setStateProjectionWriter() {},
    });
    engine.executeRequest = async (_request, options) => options;

    const executor = factory('binding-service-orders');
    const execution = await executor.executeRequest({});
    assert.equal(
      execution.issuingServiceId,
      'binding-service-orders',
    );
    assert.equal(
      await executor.getRuntimeAccessPolicy(),
      policy,
    );
  });
});
