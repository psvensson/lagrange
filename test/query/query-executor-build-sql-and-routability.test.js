/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  mockPartitionData,
  createMockMessageRouter,
  createMockSystemCache,
  parseSQL,
} from './query-executor-test-support.js';
import {
  COLUMN,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
} from '../../src/query/canonical-leader-routing.js';
import {
} from '../../src/partition/partition-service-constants.js';
import {
} from './routing-repair-test-helpers.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

function createReadinessCache({nodes = [], services = []} = {}) {
  const nodeRows = new Map(nodes.map((row) => [row[COLUMN.NODE_ID], row]));
  const serviceRows = new Map(
    services.map((row) => [row[COLUMN.SERVICE_ID], row]),
  );
  const listeners = new Set();

  function notify(tableName, operation, row) {
    for (const listener of listeners) {
      listener(tableName, operation, row, null);
    }
  }

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()].filter(predicate);
      }
      return [];
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [...nodeRows.values()];
      }
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()];
      }
      return [];
    },
    applySystemTableChange(tableName, operation, row) {
      const normalizedOperation = String(operation || '').toUpperCase();
      if (tableName === TABLES.NODES) {
        const key = row?.[COLUMN.NODE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          nodeRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = nodeRows.get(key) || {};
        nodeRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, nodeRows.get(key));
        return;
      }
      if (tableName === TABLES.SERVICES) {
        const key = row?.[COLUMN.SERVICE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          serviceRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = serviceRows.get(key) || {};
        serviceRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, serviceRows.get(key));
      }
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
  };
}

function createReadinessPublicationService(snapshot) {
  return {
    getPublicationModeDiagnostics() {
      return snapshot;
    },
  };
}

test('QueryExecutor - buildExpressionSQL emits searched CASE WHEN',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'case',
      operand: null,
      conditions: [
        {
          when: {
            type: 'binary',
            operator: '>',
            left: {type: 'column_ref', table: null, column: 'age'},
            right: {type: 'literal', value: 18},
          },
          then: {type: 'literal', value: 'adult'},
        },
      ],
      elseExpr: {type: 'literal', value: 'minor'},
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'CASE WHEN (age > 18) THEN \'adult\' ELSE \'minor\' END');
  });

test('QueryExecutor - buildExpressionSQL emits CASE with multiple WHEN',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'case',
      operand: null,
      conditions: [
        {
          when: {
            type: 'binary',
            operator: '=',
            left: {type: 'column_ref', table: null, column: 'status'},
            right: {type: 'literal', value: 'active'},
          },
          then: {type: 'literal', value: 1},
        },
        {
          when: {
            type: 'binary',
            operator: '=',
            left: {type: 'column_ref', table: null, column: 'status'},
            right: {type: 'literal', value: 'pending'},
          },
          then: {type: 'literal', value: 2},
        },
      ],
      elseExpr: {type: 'literal', value: 0},
    };
    const sql = executor.buildExpressionSQL(expr);

    t.match(sql, /CASE WHEN/);
    t.match(sql, /THEN 1/);
    t.match(sql, /THEN 2/);
    t.match(sql, /ELSE 0 END/);
  });

test('QueryExecutor - buildExpressionSQL emits simple CASE with operand',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'case',
      operand: {type: 'column_ref', table: null, column: 'status'},
      conditions: [
        {
          when: {type: 'literal', value: 'active'},
          then: {type: 'literal', value: 1},
        },
      ],
      elseExpr: null,
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'CASE status WHEN \'active\' THEN 1 END');
  });

// --- Subquery expression reconstruction tests (Requirements: 9.4) ---

test('QueryExecutor - buildExpressionSQL emits subquery',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'subquery',
      query: {
        type: 'SELECT',
        columns: [{type: 'column_ref', table: null, column: 'id'}],
        from: {type: 'table', name: 'users', alias: null},
        joins: [],
        where: null,
        groupBy: null,
        having: null,
        orderBy: null,
        limit: null,
      },
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, '(SELECT id FROM users)');
  });

// --- EXISTS expression reconstruction tests (Requirements: 9.4) ---

test('QueryExecutor - buildExpressionSQL emits EXISTS subquery',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'exists',
      query: {
        type: 'SELECT',
        columns: [{type: 'literal', value: 1}],
        from: {type: 'table', name: 'orders', alias: null},
        joins: [],
        where: {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', table: 'orders', column: 'user_id'},
          right: {type: 'column_ref', table: 'u', column: 'id'},
        },
        groupBy: null,
        having: null,
        orderBy: null,
        limit: null,
      },
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(
      sql,
      'EXISTS (SELECT 1 FROM orders' +
      ' WHERE (orders.user_id = u.id))',
    );
  });

// --- Function call expression reconstruction tests (Requirements: 6.4) ---

test('QueryExecutor - buildExpressionSQL emits function_call',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'function_call',
      name: 'LOWER',
      args: [
        {type: 'column_ref', table: null, column: 'name'},
      ],
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'LOWER(name)');
  });

test('QueryExecutor - buildExpressionSQL emits function_call with multiple args',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'function_call',
      name: 'COALESCE',
      args: [
        {type: 'column_ref', table: null, column: 'nickname'},
        {type: 'column_ref', table: null, column: 'name'},
        {type: 'literal', value: 'unknown'},
      ],
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'COALESCE(nickname, name, \'unknown\')');
  });

test('QueryExecutor - buildExpressionSQL emits function_call with no args',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'function_call',
      name: 'datetime',
      args: [{type: 'literal', value: 'now'}],
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'datetime(\'now\')');
  });

// --- CTE prefix reconstruction tests (Requirements: 10.2) ---

test('QueryExecutor - buildSelectSQL emits CTE prefix',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {type: 'table', name: 'active_users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      ctes: [{
        name: 'active_users',
        query: {
          type: 'SELECT',
          columns: [{type: 'column_ref', table: null, column: '*'}],
          from: {type: 'table', name: 'users', alias: null},
          joins: [],
          where: {
            type: 'binary',
            operator: '=',
            left: {type: 'column_ref', table: null, column: 'status'},
            right: {type: 'literal', value: 'active'},
          },
          groupBy: null,
          having: null,
          orderBy: null,
          limit: null,
        },
        recursive: false,
      }],
      recursive: false,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /^WITH active_users AS \(/);
    t.match(sql, /SELECT \* FROM users WHERE/);
    t.match(sql, /\) SELECT \* FROM active_users$/);
  });

test('QueryExecutor - buildSelectSQL emits WITH RECURSIVE prefix',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {type: 'table', name: 'tree', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      ctes: [{
        name: 'tree',
        query: {
          type: 'SELECT',
          columns: [{type: 'column_ref', table: null, column: 'id'}],
          from: {type: 'table', name: 'nodes', alias: null},
          joins: [],
          where: null,
          groupBy: null,
          having: null,
          orderBy: null,
          limit: null,
        },
        recursive: true,
      }],
      recursive: true,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /^WITH RECURSIVE tree AS \(/);
  });

test('QueryExecutor - buildSelectSQL emits multiple CTEs',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const innerSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {type: 'table', name: 'cte_a', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      ctes: [
        {name: 'cte_a', query: innerSelect, recursive: false},
        {name: 'cte_b', query: innerSelect, recursive: false},
      ],
      recursive: false,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /^WITH cte_a AS \(/);
    t.match(sql, /cte_b AS \(/);
    t.match(sql, /SELECT \* FROM cte_a$/);
  });

test('QueryExecutor - buildSelectSQL omits CTE when ctes is empty',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const ast = parseSQL('SELECT * FROM users');
    const sql = executor.buildSelectSQL(ast);

    t.notMatch(sql, /WITH/);
  });

// --- Set operation reconstruction tests (Requirements: 13.2) ---

test('QueryExecutor - buildSelectSQL emits UNION',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const rightSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'archived_users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      setOperation: {type: 'UNION', right: rightSelect},
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /SELECT id FROM users UNION SELECT id FROM archived_users/);
  });

test('QueryExecutor - buildSelectSQL emits UNION ALL',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const rightSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'name'}],
      from: {type: 'table', name: 'contacts', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'name'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      setOperation: {type: 'UNION ALL', right: rightSelect},
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /UNION ALL SELECT name FROM contacts/);
  });

test('QueryExecutor - buildSelectSQL emits INTERSECT',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const rightSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'premium', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      setOperation: {type: 'INTERSECT', right: rightSelect},
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /INTERSECT SELECT id FROM premium/);
  });

test('QueryExecutor - buildSelectSQL emits EXCEPT',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const rightSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'banned', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      setOperation: {type: 'EXCEPT', right: rightSelect},
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /EXCEPT SELECT id FROM banned/);
  });

test('QueryExecutor - buildSelectSQL omits set operation when absent',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const ast = parseSQL('SELECT id FROM users');
    const sql = executor.buildSelectSQL(ast);

    t.notMatch(sql, /UNION|INTERSECT|EXCEPT/);
  });


// --- Service routability contract tests (Requirements: 1.4, 4.1, 4.3) ---
// Routing paths use serveEligible dimension via isRoutablePartitionService.

test('QueryExecutor - isRoutablePartitionService rejects active service ' +
  'on non-serve-eligible node', (t) => {
  const readinessService = {
    getNodeReadinessSync: (nodeId) => {
      if (nodeId === 'node-down') {
        return {
          dimensions: {
            serveEligible: false,
            repairEligible: true,
          },
        };
      }
      return {dimensions: {serveEligible: true}};
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-down',
    address: 'node-down/partition/p1',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'active service on non-serve-eligible node must not be routable',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService accepts active service ' +
  'when sync readiness has no capacity snapshot but node is serve-ready',
(t) => {
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createReadinessCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-nocap',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.READY_LEASE_EXPIRES_AT]: 3000,
        [COLUMN.LAST_HEARTBEAT]: 1000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 10,
        [COLUMN.DISK_USAGE_PERCENT]: 10,
      }],
      services: [{
        [COLUMN.SERVICE_ID]: 'p1-r1',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        partition_id: 'p1',
        [COLUMN.NODE_ID]: 'node-nocap',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'node-nocap/partition/p1',
      }],
    }),
    cdcGroupPropagationService: createReadinessPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-nocap',
    address: 'node-nocap/partition/p1',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'missing capacity data must not make an active healthy replica unroutable',
  );
  t.end();
});

test('QueryExecutor - filters self routed-read candidates when canonical ' +
  'readiness reports local query transport deferred', async (t) => {
  const nodeId = 'node-self-routing-gate';
  const cache = createReadinessCache({
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 3000,
      [COLUMN.LAST_HEARTBEAT]: 1000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 10,
      [COLUMN.DISK_USAGE_PERCENT]: 10,
    }],
    services: [{
      [COLUMN.SERVICE_ID]: 'p-self-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p-self',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p-self`,
      raft_role: 'leader',
    }],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          reason: 'query ingress owner not ready',
          retryAfterMs: 777,
        };
      },
    },
    storageAccountingService: {
      async getCapacitySnapshotForNode(targetNodeId) {
        return {
          nodeId: targetNodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        };
      },
    },
    cdcGroupPropagationService: createReadinessPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const warnings = [];
  executor.logger = {
    warn(message, context) {
      warnings.push({message, context});
    },
  };

  const candidates = executor.getPartitionServiceCandidates('p-self', true);

  t.same(
    candidates,
    [],
    'self candidate should be filtered through canonical readiness while local query transport is deferred',
  );
  t.equal(warnings.length, 1);
  t.equal(
    warnings[0].context.routingSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
  );
  t.ok(
    warnings[0].context.routingSnapshot.deniedByNodeId[nodeId]
      .reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
      ),
    'routing denial should expose the local query transport gating reason',
  );
  t.end();
});

test('QueryExecutor - consumes canonical participation contract for self ' +
  'routed-read gating', async (t) => {
  const nodeId = 'node-self-participation-gate';
  const cache = createReadinessCache({
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 3000,
      [COLUMN.LAST_HEARTBEAT]: 1000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 10,
      [COLUMN.DISK_USAGE_PERCENT]: 10,
    }],
    services: [{
      [COLUMN.SERVICE_ID]: 'p-self-participation-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p-self-participation',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p-self-participation`,
      raft_role: 'leader',
    }],
  });
  let participationCalls = 0;
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: {
      getControlPlaneParticipationSync(targetNodeId) {
        participationCalls += 1;
        return {
          nodeId: targetNodeId,
          eligible: false,
          decision: 'defer',
          decisionDimension: 'repairEligible',
          reasonCode:
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
          reasonCodes: [
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
          ],
          retryAfterMs: 654,
          deferRetry: true,
          summary: {
            decisionDimension: 'repairEligible',
            observedAt: '2026-03-22T00:00:00.000Z',
            lifecycleState: SERVICE_STATUS.ACTIVE,
            reasonCodes: [
              CONTROL_PLANE_READINESS_REASON
                .LOCAL_QUERY_TRANSPORT_NOT_READY,
            ],
            failedDimensions: ['routingReady', 'repairEligible'],
            [READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]: {
              state: RUNTIME_AUTHORITY_STATE.ESTABLISHING,
              visibility: {
                state: RUNTIME_AUTHORITY_VISIBILITY_STATE.PENDING_PUBLICATION,
              },
            },
          },
        };
      },
    },
  });
  const warnings = [];
  executor.logger = {
    warn(message, context) {
      warnings.push({message, context});
    },
  };

  const candidates = executor.getPartitionServiceCandidates(
    'p-self-participation',
    true,
  );

  t.same(
    candidates,
    [],
    'routed reads should defer through the shared participation contract',
  );
  t.equal(participationCalls, 1,
    'query routing should consult the canonical participation contract');
  t.equal(warnings.length, 1);
  t.equal(
    warnings[0].context.routingSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
  );
  t.ok(
    warnings[0].context.routingSnapshot.deniedByNodeId[nodeId]
      .reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
      ),
    'routing denial should preserve the canonical participation reason',
  );
  t.equal(
    warnings[0].context.routingSnapshot.deniedByNodeId[nodeId][
      READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY
    ]?.state,
    RUNTIME_AUTHORITY_STATE.ESTABLISHING,
    'routing denial should preserve runtime authority state',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService reuses fresher stored ' +
  'readiness evidence when the visible cache row regresses', async (t) => {
  let now = 100000;
  const nodeId = 'node-cache-lag';
  const freshHeartbeat = now - 100;
  const freshLease = now + 15000;
  const cache = createReadinessCache({
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: freshLease,
      [COLUMN.LAST_HEARTBEAT]: freshHeartbeat,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 10,
      [COLUMN.DISK_USAGE_PERCENT]: 10,
    }],
    services: [{
      [COLUMN.SERVICE_ID]: 'p1-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p1',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p1`,
    }],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcGroupPropagationService: createReadinessPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });
  await readinessService.getNodeReadiness(nodeId);

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.LAST_HEARTBEAT]: now - 60000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
  });

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: nodeId,
    address: `${nodeId}/partition/p1`,
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'routing should continue to accept the replica while the stored snapshot is fresher',
  );

  now = freshLease + 1;
  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'routing must stop using the stored snapshot after the ready lease expires',
  );
  t.end();
});

test('QueryExecutor routes control-plane recovery reads through the ' +
  'dedicated recovery participation kind', (t) => {
  const nodeId = 'node-recovery-routing';
  let receivedOptions = null;
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createReadinessCache({
      nodes: [{
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.READY_LEASE_EXPIRES_AT]: 3000,
        [COLUMN.LAST_HEARTBEAT]: 1000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 10,
        [COLUMN.DISK_USAGE_PERCENT]: 10,
      }],
      services: [{
        [COLUMN.SERVICE_ID]: 'p-recovery-r1',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        partition_id: 'p-recovery',
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: `${nodeId}/partition/p-recovery`,
        raft_role: 'leader',
      }],
    }),
    controlPlaneReadinessService: {
      getControlPlaneParticipationSync(targetNodeId, options) {
        receivedOptions = {targetNodeId, ...options};
        return {
          nodeId: targetNodeId,
          eligible: true,
          decision: 'ready',
          decisionDimension: options?.decisionDimension || null,
          reasonCodes: [],
          failedDimensions: [],
          summary: {
            decisionDimension: options?.decisionDimension || null,
            observedAt: '2026-03-24T00:00:00.000Z',
            lifecycleState: SERVICE_STATUS.ACTIVE,
            reasonCodes: [],
            failedDimensions: [],
          },
        };
      },
    },
  });

  const service = {
    [COLUMN.SERVICE_ID]: 'p-recovery-r1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    partition_id: 'p-recovery',
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/p-recovery`,
    raft_role: 'leader',
  };
  const routable = executor.isRoutablePartitionService(
    service,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.equal(routable, true, 'recovery-routed services should stay routable');
  t.match(receivedOptions, {
    targetNodeId: nodeId,
    participationKind:
      CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY,
    decisionDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });
  t.end();
});

test('QueryExecutor - sync-only readiness checks retain fresher remote-node ' +
  'evidence when the visible cache row regresses', (t) => {
  let now = 120000;
  const nodeId = 'node-sync-only-cache-lag';
  const freshHeartbeat = now - 100;
  const freshLease = now + 15000;
  const cache = createReadinessCache({
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: freshLease,
      [COLUMN.LAST_HEARTBEAT]: freshHeartbeat,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 10,
      [COLUMN.DISK_USAGE_PERCENT]: 10,
    }],
    services: [{
      [COLUMN.SERVICE_ID]: 'p1-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p1',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p1`,
    }],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcGroupPropagationService: createReadinessPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: nodeId,
    address: `${nodeId}/partition/p1`,
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'first sync routing check should accept the healthy remote replica',
  );

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.LAST_HEARTBEAT]: now - 60000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
  });

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'later sync routing checks should reuse the fresher sync snapshot',
  );

  now = freshLease + 1;
  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'sync routing must stop reusing the stored snapshot after lease expiry',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService accepts active service ' +
  'on serve-eligible node', (t) => {
  const readinessService = {
    getNodeReadinessSync: () => ({
      dimensions: {serveEligible: true},
    }),
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-ok',
    address: 'node-ok/partition/p1',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'active service on serve-eligible node must be routable',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService rejects non-active service ' +
  'even on serve-eligible node', (t) => {
  const readinessService = {
    getNodeReadinessSync: () => ({
      dimensions: {serveEligible: true},
    }),
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-ok',
    address: 'node-ok/partition/p1',
    status: 'creating',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'non-active service must not be routable regardless of node readiness',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService rejects service without ' +
  'address even when active and serve-eligible', (t) => {
  const readinessService = {
    getNodeReadinessSync: () => ({
      dimensions: {serveEligible: true},
    }),
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-ok',
    address: '',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'service without published address must not be routable',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService fails closed when ' +
  'readiness snapshot has no dimensions', (t) => {
  const readinessService = {
    getNodeReadinessSync: () => ({dimensions: null}),
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-ok',
    address: 'node-ok/partition/p1',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'must fail closed when readiness dimensions are unavailable',
  );
  t.end();
});
