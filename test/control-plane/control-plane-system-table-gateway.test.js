import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {TABLES} from '../../src/constants/index.js';

test('ControlPlaneSystemTableGateway readRows uses authoritative repair-' +
  'eligible defaults', async (t) => {
  const calls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('should not fall back to raw SQL');
      },
    },
  });

  const result = await gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
  );

  t.equal(result.success, true, 'authoritative read should succeed');
  t.equal(calls.length, 1, 'authoritative path should be used once');
  t.equal(
    calls[0].options.localReadConsistency,
    'local_leader',
    'gateway should prefer local authoritative reads',
  );
  t.equal(
    calls[0].options.replicaFallbackConsistency,
    'any_replica',
    'gateway should keep bounded replica fallback',
  );
  t.equal(
    calls[0].options.queryOptions.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    'gateway should route internal reads through repairEligible',
  );
});

test('ControlPlaneSystemTableGateway readRows falls back to repair-' +
  'eligible SQL when authoritative reads fail', async (t) => {
  const sqlCalls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          success: false,
          error: 'authoritative read unavailable',
          rows: [],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql, params, options) {
        sqlCalls.push({sql, params, options});
        return {
          success: true,
          rows: [{service_id: 'svc-1'}],
        };
      },
    },
  });

  const result = await gateway.readRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_id = ?',
    ['svc-1'],
  );

  t.equal(result.success, true, 'SQL fallback should succeed');
  t.equal(sqlCalls.length, 1, 'fallback SQL path should run once');
  t.equal(
    sqlCalls[0].options.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    'fallback SQL should preserve repairEligible routing',
  );
});

test('ControlPlaneSystemTableGateway updateSystemTableRow routes writes ' +
  'through repairEligible', async (t) => {
  const updateCalls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, options) {
        updateCalls.push({tableName, whereClause, data, options});
        return {success: true};
      },
    },
  });

  await gateway.updateSystemTableRow(
    TABLES.NODE_ENDPOINTS,
    {endpoint_id: 'ep-1'},
    {address: 'ws://127.0.0.1:8080'},
  );

  t.equal(updateCalls.length, 1, 'write should be delegated once');
  t.equal(
    updateCalls[0].options.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    'control-plane writes should use repairEligible',
  );
});

test('ControlPlaneSystemTableGateway supportsReadRows only when a readable ' +
  'backend is configured', async (t) => {
  const emptyGateway = new ControlPlaneSystemTableGateway();
  t.equal(
    emptyGateway.supportsReadRows(),
    false,
    'gateway without authoritative or SQL owner should not claim readability',
  );

  const authoritativeGateway = new ControlPlaneSystemTableGateway({
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {success: true, rows: []};
      },
    },
  });
  t.equal(
    authoritativeGateway.supportsReadRows(),
    true,
    'authoritative owner should make the gateway readable',
  );

  const sqlGateway = new ControlPlaneSystemTableGateway({
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
  });
  t.equal(
    sqlGateway.supportsReadRows(),
    true,
    'SQL owner should make the gateway readable',
  );
});
