import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  CONTROL_PLANE_TIMEOUT_DEFAULT,
} from '../../src/control-plane/timeout-budget.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';

function buildTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function createCoordinator(overrides = {}) {
  const sqlQueryEngine = overrides.sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: [], affectedRows: 0};
    },
  };
  const hasExplicitGateway =
    overrides.controlPlaneSystemTableGateway &&
    typeof overrides.controlPlaneSystemTableGateway === 'object';
  const hasLocalAuthoritativeRead =
    typeof overrides.cdcIntegrationService
      ?.executeAuthoritativeSystemTableRead === 'function';

  if (hasExplicitGateway || hasLocalAuthoritativeRead) {
    return new RebalanceCoordinator({
      ...overrides,
      sqlQueryEngine,
    });
  }

  return new RebalanceCoordinator({
    ...overrides,
    sqlQueryEngine,
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (_tableName, sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
      readRows: async (_tableName, sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
      executeQuery: async (sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
    },
  });
}

test('checkTimeouts confirms STOPPING timeout failure without cache waits',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const waitForCacheUpdateCalls = [];
    const timedOutOperationRow = {
      operation_id: 'op-stopping-timeout',
      type: 'REMOVE',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'stopping',
      workflow_step: 'STOPPING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
        {step: 'SENDING', timestamp: staleUpdatedAtMs - 900},
        {step: 'STOPPING', timestamp: staleUpdatedAtMs - 800},
      ]),
    };

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...timedOutOperationRow}],
          };
        }
        if (sql.startsWith('UPDATE replica_operations SET')) {
          timedOutOperationRow.status = params[0];
          timedOutOperationRow.workflow_step = params[1];
          timedOutOperationRow.updated_at = params[2];
          timedOutOperationRow.completed_at = params[3];
          timedOutOperationRow.error_message = params[4];
          timedOutOperationRow.steps_history = params[5];
          timedOutOperationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
          waitForCacheUpdateCalls.push({
            tableName,
            key,
            expectPresent,
            options,
          });
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine,
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(waitForCacheUpdateCalls.length, 0,
      'timeout handling should not depend on projection visibility waits');
    t.equal(timedOutOperationRow.status, 'removed');
    t.equal(timedOutOperationRow.workflow_step, 'REMOVED');
  });

test('checkTimeouts reconciles stale operations when owner-rpc reads are unavailable',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const authoritativeReadCalls = [];
    const timedOutOperationRow = {
      operation_id: 'op-owner-rpc-fallback-timeout',
      type: 'REMOVE',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'stopping',
      workflow_step: 'STOPPING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
        {step: 'SENDING', timestamp: staleUpdatedAtMs - 900},
        {step: 'STOPPING', timestamp: staleUpdatedAtMs - 800},
      ]),
    };

    const cdcIntegrationService = {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options = {},
      ) {
        authoritativeReadCalls.push({
          tableName,
          sql: String(sql),
          params: [...(Array.isArray(params) ? params : [])],
          options: {...options},
        });
        if (tableName === 'replica_operations' &&
            options.requireOwnerRpcRead === true) {
          return {
            success: false,
            error: 'owner-rpc-read-failed',
            rows: [],
          };
        }
        if (tableName === 'replica_operations') {
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{...timedOutOperationRow}],
          };
        }
        return {
          success: true,
          source: 'local_partition_replica',
          rows: [],
        };
      },
    };

    const controlPlaneSystemTableGateway = {
      async readRows(tableName, sql, params = [], options = {}) {
        return cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options,
        );
      },
      async readAuthoritativeRows(tableName, sql, params = [], options = {}) {
        return cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options,
        );
      },
      async executeQuery(sql, params = []) {
        if (String(sql).startsWith('UPDATE replica_operations SET')) {
          timedOutOperationRow.status = params[0];
          timedOutOperationRow.workflow_step = params[1];
          timedOutOperationRow.updated_at = params[2];
          timedOutOperationRow.completed_at = params[3];
          timedOutOperationRow.error_message = params[4];
          timedOutOperationRow.steps_history = params[5];
          timedOutOperationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName !== 'replica_operations') {
            return null;
          }
          return key === timedOutOperationRow.operation_id ?
            timedOutOperationRow :
            null;
        },
        getAll(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [timedOutOperationRow];
        },
      },
      cdcIntegrationService,
      controlPlaneSystemTableGateway,
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      timedOutOperationRow.workflow_step,
      'REMOVED',
      'timeout reconciliation should still complete stale operations when owner-rpc reads are unavailable',
    );
    t.ok(
      authoritativeReadCalls.some((call) =>
        call.tableName === 'replica_operations' &&
        call.options.requireOwnerRpcRead !== true,
      ),
      'timeout reconciliation should query authoritative rows without requiring strict owner-rpc reads',
    );
  });

test('checkTimeouts merges authoritative incomplete operations when the ' +
  'local cache only exposes a subset', async (t) => {
  const nowMs = Date.now();
  const staleUpdatedAtMs = nowMs - 70000;
  const cacheVisibleOperationRow = {
    operation_id: 'op-cache-visible-syncing',
    type: 'ADD',
    partition_id: 'partition-cache-visible',
    replica_id: 'partition-cache-visible-r2',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'syncing',
    workflow_step: 'SYNCING',
    created_at: staleUpdatedAtMs - 5000,
    updated_at: staleUpdatedAtMs,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    entity_type: 'partition',
    entity_id: 'partition-cache-visible',
  };
  const authoritativeOnlyOperationRow = {
    operation_id: 'op-authoritative-only-syncing',
    type: 'ADD',
    partition_id: 'partition-authoritative-only',
    replica_id: 'partition-authoritative-only-r2',
    source_node_id: 'node-1',
    target_node_id: 'node-3',
    status: 'syncing',
    workflow_step: 'SYNCING',
    created_at: staleUpdatedAtMs - 5000,
    updated_at: staleUpdatedAtMs,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    entity_type: 'partition',
    entity_id: 'partition-authoritative-only',
  };
  const operationRows = new Map([
    [cacheVisibleOperationRow.operation_id, cacheVisibleOperationRow],
    [authoritativeOnlyOperationRow.operation_id, authoritativeOnlyOperationRow],
  ]);
  const serviceRowsByReplicaId = new Map([
    [cacheVisibleOperationRow.replica_id, {
      service_id: cacheVisibleOperationRow.replica_id,
      replica_id: cacheVisibleOperationRow.replica_id,
      partition_id: cacheVisibleOperationRow.partition_id,
      node_id: cacheVisibleOperationRow.target_node_id,
      service_type: 'partition',
      status: 'active',
      raft_role: 'follower',
    }],
    [authoritativeOnlyOperationRow.replica_id, {
      service_id: authoritativeOnlyOperationRow.replica_id,
      replica_id: authoritativeOnlyOperationRow.replica_id,
      partition_id: authoritativeOnlyOperationRow.partition_id,
      node_id: authoritativeOnlyOperationRow.target_node_id,
      service_type: 'partition',
      status: 'active',
      raft_role: 'follower',
    }],
  ]);
  const authoritativeReplicaOperationReads = [];

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      if (sql.includes('FROM replica_operations')) {
        authoritativeReplicaOperationReads.push({
          sql: String(sql),
          params: [...params],
        });
        return {
          success: true,
          rows: [...operationRows.values()].map((row) => ({...row})),
          affectedRows: 0,
        };
      }
      if (sql.startsWith('UPDATE replica_operations SET')) {
        const operationRow = operationRows.get(params[7]);
        operationRow.status = params[0];
        operationRow.workflow_step = params[1];
        operationRow.updated_at = params[2];
        operationRow.completed_at = params[3];
        operationRow.error_message = params[4];
        operationRow.steps_history = params[5];
        operationRow.replica_id = params[6];
        return {
          success: true,
          affectedRows: 1,
        };
      }
      if (sql.includes('FROM services WHERE service_id = ?')) {
        const serviceRow = serviceRowsByReplicaId.get(params[0]) || null;
        return {
          success: true,
          rows: serviceRow ? [{...serviceRow}] : [],
          affectedRows: serviceRow ? 1 : 0,
        };
      }
      if (sql.includes('FROM services') &&
          sql.includes('WHERE partition_id = ? AND node_id = ?')) {
        const serviceRow = [...serviceRowsByReplicaId.values()].find((row) =>
          row.partition_id === params[0] &&
          row.node_id === params[1],
        ) || null;
        return {
          success: true,
          rows: serviceRow ? [{...serviceRow}] : [],
          affectedRows: serviceRow ? 1 : 0,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: 0,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: 'node-1',
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== 'replica_operations') {
          return null;
        }
        return key === cacheVisibleOperationRow.operation_id ?
          cacheVisibleOperationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [cacheVisibleOperationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [cacheVisibleOperationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'completed'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    sqlQueryEngine,
    enableTimeouts: false,
  });

  coordinator.initialize();
  try {
    await coordinator.checkTimeouts();
  } finally {
    await coordinator.shutdown();
  }

  t.equal(
    authoritativeReplicaOperationReads.length > 0,
    true,
    'timeout reconciliation should still consult authoritative owner rows when cache visibility is partial',
  );
  t.equal(cacheVisibleOperationRow.workflow_step, 'ACTIVE');
  t.equal(cacheVisibleOperationRow.status, 'active');
  t.equal(authoritativeOnlyOperationRow.workflow_step, 'ACTIVE');
  t.equal(authoritativeOnlyOperationRow.status, 'active');
});

test('checkTimeouts applies bounded SYNCING timeout to priority control-plane partitions',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 130000;
    const prioritySyncingOperationRow = {
      operation_id: 'op-priority-syncing-timeout',
      type: 'REPLACE',
      partition_id: 'sql_write_operations-p1',
      replica_id: 'sql_write_operations-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'syncing',
      workflow_step: 'SYNCING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1200},
        {step: 'SENDING', timestamp: staleUpdatedAtMs - 1100},
        {step: 'CREATING', timestamp: staleUpdatedAtMs - 1000},
        {step: 'SYNCING', timestamp: staleUpdatedAtMs - 900},
      ]),
    };

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...prioritySyncingOperationRow}],
          };
        }
        if (sql.startsWith('UPDATE replica_operations SET')) {
          prioritySyncingOperationRow.status = params[0];
          prioritySyncingOperationRow.workflow_step = params[1];
          prioritySyncingOperationRow.updated_at = params[2];
          prioritySyncingOperationRow.completed_at = params[3];
          prioritySyncingOperationRow.error_message = params[4];
          prioritySyncingOperationRow.steps_history = params[5];
          prioritySyncingOperationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine,
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      prioritySyncingOperationRow.workflow_step,
      'FAILED',
      'priority control-plane SYNCING operations should time out within the bounded timeout window',
    );
    t.match(
      prioritySyncingOperationRow.error_message || '',
      /Timeout in SYNCING step/,
      'bounded SYNCING timeout failure should report the timed out step',
    );
  });

test('checkTimeouts keeps non-priority SYNCING operations pending within configured timeout',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 130000;
    const nonPrioritySyncingOperationRow = {
      operation_id: 'op-non-priority-syncing',
      type: 'REPLACE',
      partition_id: 'tables-p1',
      replica_id: 'tables-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'syncing',
      workflow_step: 'SYNCING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1200},
        {step: 'SENDING', timestamp: staleUpdatedAtMs - 1100},
        {step: 'CREATING', timestamp: staleUpdatedAtMs - 1000},
        {step: 'SYNCING', timestamp: staleUpdatedAtMs - 900},
      ]),
    };

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...nonPrioritySyncingOperationRow}],
          };
        }
        if (sql.startsWith('UPDATE replica_operations SET')) {
          nonPrioritySyncingOperationRow.status = params[0];
          nonPrioritySyncingOperationRow.workflow_step = params[1];
          nonPrioritySyncingOperationRow.updated_at = params[2];
          nonPrioritySyncingOperationRow.completed_at = params[3];
          nonPrioritySyncingOperationRow.error_message = params[4];
          nonPrioritySyncingOperationRow.steps_history = params[5];
          nonPrioritySyncingOperationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine,
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      nonPrioritySyncingOperationRow.workflow_step,
      'SYNCING',
      'non-priority SYNCING operations should keep the configured longer timeout budget',
    );
    t.equal(
      nonPrioritySyncingOperationRow.error_message,
      null,
      'non-priority SYNCING operations should not fail early under the bounded priority timeout path',
    );
  });

test('checkTimeouts resolves operation state from authoritative owner rows ' +
  'before reconciling stale cache entries', async (t) => {
  const deliveries = [];
  const staleCacheRow = {
    operation_id: 'op-stale-cache',
    type: 'REPLACE',
    partition_id: 'control_plane_publications-p1',
    replica_id: 'control_plane_publications-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'syncing',
    workflow_step: 'SYNCING',
    created_at: Date.now() - 10000,
    updated_at: Date.now() - 5000,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([
      {step: 'PENDING', timestamp: Date.now() - 7000},
      {step: 'SENDING', timestamp: Date.now() - 6000},
      {step: 'CREATING', timestamp: Date.now() - 5500},
      {step: 'SYNCING', timestamp: Date.now() - 5000},
    ]),
  };
  const authoritativeTerminalRow = {
    ...staleCacheRow,
    status: 'removed',
    workflow_step: 'REMOVED',
    completed_at: Date.now() - 1000,
    updated_at: Date.now() - 1000,
    steps_history: JSON.stringify([
      ...JSON.parse(staleCacheRow.steps_history),
      {step: 'REMOVED', timestamp: Date.now() - 1000},
    ]),
  };

  const coordinator = createCoordinator({
    nodeId: 'node-1',
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== 'replica_operations') {
          return null;
        }
        return key === staleCacheRow.operation_id ? staleCacheRow : null;
      },
      getAll(tableName) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [staleCacheRow];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver() {
        deliveries.push(true);
        return {acknowledged: true, status: 'completed'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql) {
        if (sql.includes('FROM replica_operations WHERE operation_id = ?')) {
          return {
            success: true,
            rows: [{...authoritativeTerminalRow}],
            affectedRows: 1,
          };
        }
        return {success: true, rows: [], affectedRows: 0};
      },
    },
    enableTimeouts: false,
  });

  coordinator.initialize();
  try {
    await coordinator.checkTimeouts();
  } finally {
    await coordinator.shutdown();
  }

  t.equal(deliveries.length, 0,
    'stale cache rows should not trigger dispatch when authoritative row is terminal');
});

test('coordinator SQL reads use shared control-plane timeout options',
  async (t) => {
    const executeQueryCalls = [];
    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql, params, options = {}) {
          executeQueryCalls.push({
            sql: String(sql),
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.queryOperationById('op-1');
      await coordinator.queryIncompleteOperations();
      await coordinator.queryExistingInFlightOperation(
        'p1',
        'node-2',
        'partition',
        'p1',
        null,
      );
      await coordinator.getAllOperations();
      await coordinator.getOperationsByEntity('partition', 'p1');
      await coordinator.getConcurrentRemoveCount();
      await coordinator.getActualReplicaStatus('p1-r1', 'p1', 'node-2');
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      executeQueryCalls.length > 0,
      true,
      'probe should execute coordinator SQL reads',
    );
    for (const call of executeQueryCalls) {
      t.equal(
        call.options.timeoutMs,
        CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
        `coordinator read should pass shared timeout on ${call.sql}`,
      );
    }
  });

test(
  'getActualReplicaStatus falls back to exact services cache observation ' +
    'when authoritative reads miss',
  async (t) => {
    const gatewayCalls = [];
    const observedServiceRow = {
      service_id: 'partition-1-r2',
      replica_id: 'partition-1-r2',
      partition_id: 'partition-1',
      node_id: 'node-2',
      status: 'active',
    };
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName !== 'services') {
            return null;
          }
          return key === observedServiceRow.service_id ? observedServiceRow : null;
        },
        getAll(tableName) {
          if (tableName !== 'services') {
            return [];
          }
          return [observedServiceRow];
        },
        filter(tableName, predicate) {
          return this.getAll(tableName).filter(predicate);
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      controlPlaneSystemTableGateway: {
        async readRows(tableName, sql, params, options) {
          gatewayCalls.push({
            tableName,
            sql: String(sql),
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
        async executeQuery() {
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          throw new Error('raw SQL path should not be used');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const actualStatus = await coordinator.getActualReplicaStatus(
        'partition-1-r2',
        'partition-1',
        'node-2',
      );

      t.equal(
        actualStatus,
        'active',
        'exact observed services row should satisfy replica status when authoritative reads miss',
      );
      t.equal(
        gatewayCalls.length,
        2,
        'coordinator should still attempt authoritative service status reads before using observed cache state',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'getActualReplicaStatus keeps active learner partition replicas in syncing ' +
    'until promotion',
  async (t) => {
    const authoritativeLearnerRow = {
      service_id: 'nodes-p1-r4',
      replica_id: 'nodes-p1-r4',
      partition_id: 'nodes-p1',
      node_id: 'node-2',
      service_type: 'partition',
      status: 'active',
      raft_role: 'learner',
      address: 'node-2/partition/nodes-p1-r4',
    };
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        filter() {
          return [];
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (sql.includes('FROM services')) {
            return {
              success: true,
              rows: [{...authoritativeLearnerRow}],
              affectedRows: 1,
            };
          }
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const actualStatus = await coordinator.getActualReplicaStatus(
        'nodes-p1-r4',
        'nodes-p1',
        'node-2',
      );

      t.equal(
        actualStatus,
        ReplicaStatus.SYNCING,
        'authoritative learner rows should remain syncing until the replacement is promoted',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test('queryIncompleteOperations prefers authoritative local reads for replica_operations',
  async (t) => {
    const authoritativeReadCalls = [];
    const sqlQueryCalls = [];
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
        async executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options = {},
        ) {
          authoritativeReadCalls.push({
            tableName,
            sql,
            params: [...params],
            options,
          });
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{
              operation_id: 'op-local-1',
              type: 'ADD',
              partition_id: 'partition-1',
              replica_id: 'partition-1-r2',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              status: 'pending',
              workflow_step: 'PENDING',
              created_at: 100,
              updated_at: 200,
              completed_at: null,
              error_message: null,
              steps_history: '[]',
            }],
          };
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql, params, options = {}) {
          sqlQueryCalls.push({sql, params, options});
          return {
            success: true,
            rows: [],
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.equal(operations.length, 1, 'owner-local authoritative read should surface the local in-flight operation');
      t.equal(
        operations[0]?.operationId,
        'op-local-1',
        'coordinator should translate the authoritative owner-local row',
      );
      t.equal(sqlQueryCalls.length, 0, 'should not reconstruct owner-local reads through the SQL query engine');
      t.equal(authoritativeReadCalls.length, 1, 'should use the authoritative local-read owner for owner rows');
      t.equal(
        authoritativeReadCalls[0]?.options?.queryOptions?.timeoutMs,
        CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
        'should preserve control-plane timeout options on owner-local authoritative reads',
      );
      t.equal(
        authoritativeReadCalls[0]?.options?.allowSqlFallback,
        true,
        'replica_operations owner reads should opt into one routed authoritative read when local source is absent',
      );
    } finally {
      await coordinator.shutdown();
  }
});

test('storage reservation cleanup reads opt into authoritative SQL fallback',
  async (t) => {
    const gatewayCalls = [];
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      controlPlaneSystemTableGateway: {
        async readRows(tableName, sql, params, options = {}) {
          gatewayCalls.push({
            tableName,
            sql: String(sql),
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          if (String(sql).includes('operation_id = ?')) {
            return {
              success: true,
              rows: [{
                reservation_id: 'res-op-1',
                operation_id: 'op-1',
              }],
            };
          }
          if (String(sql).includes('expires_at <= ?')) {
            return {
              success: true,
              rows: [{
                reservation_id: 'res-expired-1',
                operation_id: 'op-expired-1',
              }],
            };
          }
          return {
            success: true,
            rows: [{
              reservation_id: 'res-orphan-1',
              operation_id: 'op-orphan-1',
            }],
          };
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          throw new Error('raw SQL path should not be used');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    coordinator.transitionActiveReservationById = async () => ({
      success: true,
      changed: true,
    });
    coordinator.queryOperationById = async () => null;
    try {
      await coordinator.releaseReservationForOperation({
        type: 'ADD',
        operationId: 'op-1',
      });
      await coordinator.reconcileReservations();
      t.equal(
        gatewayCalls.length,
        3,
        'reservation cleanup should query active-by-operation, expired, and active sets',
      );
      for (const call of gatewayCalls) {
        t.equal(
          call.tableName,
          'storage_reservations',
          'reservation cleanup should stay on the storage_reservations system table',
        );
        t.equal(
          call.options.allowSqlFallback,
          true,
          `reservation cleanup should opt into routed authoritative SQL fallback for ${call.sql}`,
        );
        t.equal(
          call.options.timeoutMs,
          CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
          `reservation cleanup should preserve control-plane timeout options on ${call.sql}`,
        );
      }
    } finally {
      await coordinator.shutdown();
    }
  });

test('queryIncompleteOperations keeps replica_operations on the canonical ' +
  'authoritative read path when local owner rows are unavailable',
async (t) => {
  const authoritativeReadCalls = [];
  const coordinator = createCoordinator({
    nodeId: 'node-1',
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options = {},
      ) {
        authoritativeReadCalls.push({
          tableName,
          sql,
          params: [...params],
          options,
        });
        if (options.allowSqlFallback !== true) {
          return {
            success: false,
            error: 'authoritative_row_source_unavailable',
            rows: [],
          };
        }
        return {
          success: true,
          source: 'sql_query_engine',
          rows: [{
            operation_id: 'op-routed-1',
            type: 'ADD',
            partition_id: 'partition-1',
            replica_id: 'partition-1-r2',
            source_node_id: 'node-1',
            target_node_id: 'node-4',
            status: 'pending',
            workflow_step: 'PENDING',
            created_at: 100,
            updated_at: 200,
            completed_at: null,
            error_message: null,
            steps_history: '[]',
          }],
        };
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'completed'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error(
          'gateway should keep routed owner reads inside the authoritative owner path',
        );
      },
    },
    enableTimeouts: false,
  });

  coordinator.initialize();
  try {
    const operations = await coordinator.queryIncompleteOperations();
    t.equal(
      operations.length,
      1,
      'cache-empty owner scans should still recover one authoritative routed row',
    );
    t.equal(
      operations[0]?.operationId,
      'op-routed-1',
      'coordinator should surface the routed authoritative row',
    );
    t.equal(
      authoritativeReadCalls.length,
      1,
      'should execute one authoritative read through the canonical gateway',
    );
    t.equal(
      authoritativeReadCalls[0]?.options?.allowSqlFallback,
      true,
      'canonical replica_operations reads should opt into routed authoritative fallback',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('queryIncompleteOperations prefers cache observation boundary before routed SQL',
  async (t) => {
    let sqlQueryCalls = 0;
    const cacheRows = [
      {
        operation_id: 'op-cache-local-1',
        type: 'ADD',
        partition_id: 'partition-1',
        replica_id: 'partition-1-r2',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'creating',
        workflow_step: 'CREATING',
        created_at: 100,
        updated_at: 200,
        completed_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: 'partition',
        entity_id: 'partition-1',
      },
      {
        operation_id: 'op-cache-remote-1',
        type: 'ADD',
        partition_id: 'partition-2',
        replica_id: 'partition-2-r2',
        source_node_id: 'node-other',
        target_node_id: 'node-3',
        status: 'creating',
        workflow_step: 'CREATING',
        created_at: 50,
        updated_at: 60,
        completed_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: 'partition',
        entity_id: 'partition-2',
      },
    ];
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName, predicate) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return cacheRows.filter(predicate);
        },
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          throw new Error('routed SQL should not run');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.same(
        operations.map((operation) => operation.operationId),
        ['op-cache-local-1'],
        'cache observation boundary should answer incomplete owner scans',
      );
      t.equal(sqlQueryCalls, 0, 'cache-visible incomplete operations should bypass routed SQL');
    } finally {
      await coordinator.shutdown();
    }
  });

test(
  'queryIncompleteOperations reuses empty cache observation boundary while router is backpressured',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
        getOutboundPressureSummary() {
          return {backpressured: true};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          throw new Error('routed SQL should not run while router is backpressured');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.same(
        operations,
        [],
        'empty cache observation boundary should be reused during router pressure',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'router pressure should suppress routed replica_operations scans',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'queryIncompleteOperations falls back to routed SQL when cache is empty and router pressure is clear',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.same(
        operations,
        [],
        'empty cache with clear pressure should still return no in-flight operations',
      );
      t.equal(
        sqlQueryCalls,
        1,
        'empty cache with clear pressure should fall back to one routed replica_operations scan',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'canStartAddOperation reuses empty cache observation boundary before routed SQL',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const canStart = await coordinator.canStartAddOperation();
      t.equal(
        canStart,
        false,
        'empty cache should defer add scheduling until authoritative confirmation is allowed',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'add scheduling admission should not route replica_operations SQL on empty cache',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'canStartAddOperation can re-check authoritative in-flight count when ' +
    'priority recovery budget is saturated in cache',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-2',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [{
            operation_id: 'op-stale-cache',
            type: 'REPLACE',
            partition_id: 'control_plane_publications-p1',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            replica_id: 'control_plane_publications-p1-r4',
            status: 'syncing',
            workflow_step: 'SYNCING',
            created_at: 1000,
            updated_at: 1001,
            completed_at: null,
            error_message: null,
            steps_history: '[]',
          }];
        },
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    coordinator.config.maxConcurrentAdds = 1;
    try {
      const canStartFromCacheOnly = await coordinator.canStartAddOperation();
      t.equal(
        canStartFromCacheOnly,
        false,
        'cache-saturated add budget should block without an authoritative re-check',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'cache-only budget check should avoid routed SQL reads',
      );

      const canStartWithAuthoritativeConfirmation =
        await coordinator.canStartAddOperation({
          preferAuthoritativeCount: true,
        });
      t.equal(
        canStartWithAuthoritativeConfirmation,
        true,
        'priority recovery budget checks should allow scheduling when authoritative in-flight count is below limit',
      );
      t.ok(
        sqlQueryCalls > 0,
        'authoritative budget confirmation should query replica_operations',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'canStartRemoveOperation returns false without routed reads while router is backpressured',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {},
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
        getOutboundPressureSummary() {
          return {backpressured: true};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const canStart = await coordinator.canStartRemoveOperation();
      t.equal(
        canStart,
        false,
        'router pressure should pause remove scheduling admission',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'router pressure should avoid routed concurrent-remove count reads',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'canStartRemoveOperation reuses empty cache observation boundary before routed SQL',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          return {success: true, rows: []};
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const canStart = await coordinator.canStartRemoveOperation();
      t.equal(
        canStart,
        false,
        'empty cache should defer remove scheduling until authoritative confirmation is allowed',
      );
      t.equal(
        sqlQueryCalls,
        0,
        'remove scheduling admission should not route replica_operations SQL on empty cache',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'checkTimeouts reuses empty cache observation boundary before routed SQL',
  async (t) => {
    let sqlQueryCalls = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return [];
        },
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          throw new Error('timeout scans should not route replica_operations SQL');
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
      t.equal(
        sqlQueryCalls,
        0,
        'timeout scans should stay on the empty cache observation boundary',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test('queryExistingInFlightOperation falls back to cache when routed SQL read fails',
  async (t) => {
    let sqlQueryCalls = 0;
    const cacheRows = [
      {
        operation_id: 'op-cache-dedupe-1',
        type: 'ADD',
        partition_id: 'partition-1',
        replica_id: 'partition-1-r2',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'creating',
        workflow_step: 'CREATING',
        created_at: 100,
        updated_at: 200,
        completed_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: 'partition',
        entity_id: 'partition-1',
      },
    ];
    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        filter(tableName, predicate) {
          if (tableName !== 'replica_operations') {
            return [];
          }
          return cacheRows.filter(predicate);
        },
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          sqlQueryCalls += 1;
          return {
            success: false,
            error: 'synthetic read failure',
            rows: [],
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operation = await coordinator.queryExistingInFlightOperation(
        'partition-1',
        'node-2',
        'partition',
        'partition-1',
        {
          type: 'ADD',
          partitionId: 'partition-1',
          entityType: 'partition',
          entityId: 'partition-1',
          nodeId: 'node-2',
        },
      );
      t.equal(
        operation?.operationId,
        'op-cache-dedupe-1',
        'cache fallback should answer in-flight dedupe reads after SQL failure',
      );
      t.equal(sqlQueryCalls, 1, 'SQL-first dedupe path should attempt one routed read');
    } finally {
      await coordinator.shutdown();
    }
  });

test('queryIncompleteOperations scopes reads to local operation owner',
  async (t) => {
    const executeQueryCalls = [];
    const coordinator = createCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql, params, options = {}) {
          executeQueryCalls.push({
            sql: String(sql),
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.queryIncompleteOperations();
    } finally {
      await coordinator.shutdown();
    }

    const operationQuery = executeQueryCalls[0];
    t.equal(
      Boolean(operationQuery),
      true,
      'queryIncompleteOperations should execute SQL read',
    );
    t.equal(
      operationQuery.sql.includes('source_node_id = ?') &&
        operationQuery.sql.includes('target_node_id = ?'),
      true,
      'query should scope results to the local operation owner set',
    );
    t.equal(
      operationQuery.sql.includes("source_node_id IS NULL OR source_node_id = ''"),
      false,
      'query should avoid legacy target fallback predicate in owner path',
    );
    t.equal(
      operationQuery.params.includes('node-local'),
      true,
      'owner-scoped query should bind local node id',
    );
    t.equal(
      operationQuery.options.timeoutMs,
      CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS,
      'owner-scoped query should retain shared timeout budget',
    );
  });

test('queryIncompleteOperations avoids legacy OR predicate timeout path',
  async (t) => {
    const executeQueryCalls = [];
    const coordinator = createCoordinator({
      nodeId: 'node-owner-only',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql, params, options = {}) {
          const query = String(sql);
          executeQueryCalls.push({
            sql: query,
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          if (query.includes("source_node_id IS NULL OR source_node_id = ''")) {
            return {
              success: false,
              error: 'Query timeout after 5000ms',
              rows: [],
            };
          }
          return {
            success: true,
            rows: [
              {
                operation_id: 'owner-op-1',
                type: 'ADD',
                partition_id: 'partition-owner',
                replica_id: 'partition-owner-r2',
                source_node_id: 'node-owner-only',
                target_node_id: 'node-target',
                status: 'creating',
                workflow_step: 'CREATING',
                created_at: 10,
                updated_at: 20,
                completed_at: null,
                error_message: null,
                steps_history: '[]',
                entity_type: 'partition',
                entity_id: 'partition-owner',
              },
            ],
            affectedRows: 0,
          };
        },
      },
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      const operations = await coordinator.queryIncompleteOperations();
      t.equal(
        operations.length,
        1,
        'owner-scoped query should return in-flight operations without legacy OR fallback',
      );
      t.equal(
        executeQueryCalls.some((call) =>
          call.sql.includes("source_node_id IS NULL OR source_node_id = ''")),
        false,
        'query path should not execute legacy OR fallback predicate',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test(
  'checkTimeouts completes creating operations from exact cache-visible ' +
    'services rows when authoritative reads miss',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const observedServiceRow = {
      service_id: 'partition-1-r2',
      replica_id: 'partition-1-r2',
      partition_id: 'partition-1',
      node_id: 'node-2',
      status: 'active',
    };
    const operationRow = {
      operation_id: 'op-cache-visible-active',
      type: 'ADD',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r2',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
        {step: 'SENDING', timestamp: staleUpdatedAtMs - 900},
        {step: 'CREATING', timestamp: staleUpdatedAtMs - 800},
      ]),
      entity_type: 'partition',
      entity_id: 'partition-1',
    };
    const gatewayCalls = [];

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
        if (sql.includes('UPDATE replica_operations SET')) {
          operationRow.status = params[0];
          operationRow.workflow_step = params[1];
          operationRow.updated_at = params[2];
          operationRow.completed_at = params[3];
          operationRow.error_message = params[4];
          operationRow.steps_history = params[5];
          operationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...operationRow}],
            affectedRows: 0,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName === 'replica_operations') {
            return key === operationRow.operation_id ? operationRow : null;
          }
          if (tableName === 'services') {
            return key === observedServiceRow.service_id ? observedServiceRow : null;
          }
          return null;
        },
        getAll(tableName) {
          if (tableName === 'replica_operations') {
            return [operationRow];
          }
          if (tableName === 'services') {
            return [observedServiceRow];
          }
          return [];
        },
        filter(tableName, predicate) {
          return this.getAll(tableName).filter(predicate);
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      controlPlaneSystemTableGateway: {
        async readRows(tableName, sql, params, options) {
          gatewayCalls.push({
            tableName,
            sql: String(sql),
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
        async executeQuery(sql, params) {
          return sqlQueryEngine.executeQuery(sql, params);
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine,
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();

      t.equal(
        operationRow.workflow_step,
        'ACTIVE',
        'timeout reconciliation should complete the ADD operation instead of failing it',
      );
      t.equal(
        operationRow.status,
        'active',
        'completed ADD should persist active status from observed target service state',
      );
      t.equal(
        operationRow.error_message,
        null,
        'cache-visible convergence should avoid timeout failure metadata',
      );
      t.equal(
        gatewayCalls.length >= 2,
        true,
        'timeout reconciliation should still attempt authoritative service reads before using observed cache state',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'checkTimeouts completes sending operations from exact cache-visible ' +
    'services rows when authoritative reads miss',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const observedServiceRow = {
      service_id: 'partition-1-r2',
      replica_id: 'partition-1-r2',
      partition_id: 'partition-1',
      node_id: 'node-2',
      status: 'active',
      raft_role: 'follower',
      service_type: 'partition',
    };
    const operationRow = {
      operation_id: 'op-cache-visible-sending-active',
      type: 'ADD',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r2',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: 'SENDING',
      created_at: staleUpdatedAtMs - 5000,
      updated_at: staleUpdatedAtMs,
      completed_at: null,
      error_message: null,
      steps_history: JSON.stringify([
        {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
        {step: 'SENDING', timestamp: staleUpdatedAtMs - 900},
      ]),
      entity_type: 'partition',
      entity_id: 'partition-1',
    };
    const gatewayCalls = [];

    const sqlQueryEngine = {
      async executeQuery(sql, params) {
        if (sql.includes('UPDATE replica_operations SET')) {
          operationRow.status = params[0];
          operationRow.workflow_step = params[1];
          operationRow.updated_at = params[2];
          operationRow.completed_at = params[3];
          operationRow.error_message = params[4];
          operationRow.steps_history = params[5];
          operationRow.replica_id = params[6];
          return {
            success: true,
            affectedRows: 1,
          };
        }
        if (sql.includes('FROM replica_operations')) {
          return {
            success: true,
            rows: [{...operationRow}],
            affectedRows: 0,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    };

    const coordinator = createCoordinator({
      nodeId: 'node-1',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName === 'replica_operations') {
            return key === operationRow.operation_id ? operationRow : null;
          }
          if (tableName === 'services') {
            return key === observedServiceRow.service_id ? observedServiceRow : null;
          }
          return null;
        },
        getAll(tableName) {
          if (tableName === 'replica_operations') {
            return [operationRow];
          }
          if (tableName === 'services') {
            return [observedServiceRow];
          }
          return [];
        },
        filter(tableName, predicate) {
          return this.getAll(tableName).filter(predicate);
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      controlPlaneSystemTableGateway: {
        async readRows(tableName, sql, params, options) {
          gatewayCalls.push({
            tableName,
            sql: String(sql),
            params: [...(Array.isArray(params) ? params : [])],
            options,
          });
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
        async executeQuery(sql, params) {
          return sqlQueryEngine.executeQuery(sql, params);
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine,
      enableTimeouts: false,
    });

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();

      t.equal(
        operationRow.workflow_step,
        'ACTIVE',
        'timeout reconciliation should complete stale SENDING operations when observed target state is already active',
      );
      t.equal(
        operationRow.status,
        'active',
        'completed ADD should persist active status from observed target service state',
      );
      t.equal(
        operationRow.error_message,
        null,
        'cache-visible convergence should avoid timeout failure metadata',
      );
      t.equal(
        gatewayCalls.length >= 2,
        true,
        'timeout reconciliation should still attempt authoritative service reads before using observed cache state',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test('timeout checker backs off empty incomplete-operation scans', async (t) => {
  let incompleteQueryAttempts = 0;
  const coordinator = createCoordinator({
    nodeId: 'node-empty-backoff',
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'completed'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql) {
        if (String(sql).includes('FROM replica_operations')) {
          incompleteQueryAttempts += 1;
        }
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      },
    },
    enableTimeouts: false,
  });
  coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 60_000;

  coordinator.initialize();
  try {
    await coordinator.checkTimeouts();
    await coordinator.checkTimeouts();
    await coordinator.checkTimeouts();
    t.equal(
      incompleteQueryAttempts,
      1,
      'empty timeout scans should back off instead of querying on every loop',
    );

    coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs =
      Date.now() -
      coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs -
      1;
    await coordinator.checkTimeouts();
    t.equal(
      incompleteQueryAttempts,
      2,
      'query should resume once empty-scan backoff window has elapsed',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test(
  'timeout checker survives repeated replica_operations query timeouts',
  async (t) => {
    let incompleteQueryAttempts = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-timeout-loop',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (String(sql).includes('FROM replica_operations')) {
            incompleteQueryAttempts += 1;
            throw new Error('Query timeout after 5000ms');
          }
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
      },
    });
    coordinator.timeoutCheckIntervalMs = 5;

    coordinator.initialize();
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      incompleteQueryAttempts >= 2,
      true,
      'periodic timeout loop should keep running through repeated query timeouts',
    );
    t.equal(
      coordinator.timeoutCheckInFlight,
      false,
      'timeout loop should release in-flight guard after timeout errors',
    );
  },
);

test('observed progress reconciles REPLACE workflows when strict owner-rpc ' +
  'reads are unavailable', async (t) => {
  const nowMs = Date.now();
  const operationRow = {
    operation_id: 'op-observed-progress-owner-rpc-fallback',
    type: 'REPLACE',
    partition_id: 'control_plane_publications-p1',
    replica_id: 'control_plane_publications-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'creating',
    workflow_step: 'PENDING',
    created_at: nowMs - 5000,
    updated_at: nowMs - 5000,
    completed_at: null,
    error_message: null,
    entity_type: 'partition',
    entity_id: 'control_plane_publications-p1',
    steps_history: JSON.stringify([{
      step: 'PENDING',
      timestamp: nowMs - 5000,
      sourceReplicaId: 'control_plane_publications-p1-r1',
    }]),
  };
  const serviceRow = {
    service_id: 'control_plane_publications-p1-r4',
    replica_id: 'control_plane_publications-p1-r4',
    partition_id: 'control_plane_publications-p1',
    node_id: 'node-2',
    service_type: 'partition',
    status: 'active',
    raft_role: 'follower',
    address: 'node-2/partition/control_plane_publications-p1-r4',
  };
  const authoritativeReadCalls = [];
  const dispatchedMessages = [];

  const cdcIntegrationService = {
    async waitForCacheUpdate() {},
    async executeAuthoritativeSystemTableRead(
      tableName,
      sql,
      params,
      options = {},
    ) {
      authoritativeReadCalls.push({
        tableName,
        sql: String(sql),
        params: [...(Array.isArray(params) ? params : [])],
        options: {...options},
      });

      if (tableName === 'replica_operations') {
        if (options.requireOwnerRpcRead === true) {
          return {
            success: false,
            error: 'owner-rpc-read-failed',
            rows: [],
          };
        }
        return {
          success: true,
          source: 'local_partition_replica',
          rows: [{...operationRow}],
        };
      }

      if (tableName === 'services') {
        if (String(sql).includes('WHERE service_id = ?')) {
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{...serviceRow}],
          };
        }
        if (String(sql).includes('WHERE partition_id = ? AND node_id = ?')) {
          return {
            success: true,
            source: 'local_partition_replica',
            rows:
              serviceRow.partition_id === params?.[0] &&
                serviceRow.node_id === params?.[1] ?
                [{...serviceRow}] :
                [],
          };
        }
      }

      return {
        success: true,
        source: 'local_partition_replica',
        rows: [],
      };
    },
  };

  const controlPlaneSystemTableGateway = {
    async readRows(tableName, sql, params = [], options = {}) {
      return cdcIntegrationService.executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      );
    },
    async readAuthoritativeRows(tableName, sql, params = [], options = {}) {
      return cdcIntegrationService.executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      );
    },
    async executeQuery(sql, params = []) {
      if (String(sql).startsWith('UPDATE replica_operations SET')) {
        operationRow.status = params[0];
        operationRow.workflow_step = params[1];
        operationRow.updated_at = params[2];
        operationRow.completed_at = params[3];
        operationRow.error_message = params[4];
        operationRow.steps_history = params[5];
        operationRow.replica_id = params[6];
        return {
          success: true,
          affectedRows: 1,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: 0,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: 'node-1',
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName === 'replica_operations') {
          return key === operationRow.operation_id ?
            operationRow :
            null;
        }
        if (tableName === 'services') {
          return key === serviceRow.service_id ?
            serviceRow :
            null;
        }
        return null;
      },
      getAll(tableName) {
        if (tableName === 'replica_operations') {
          return [operationRow];
        }
        if (tableName === 'services') {
          return [serviceRow];
        }
        return [];
      },
      filter(tableName, predicate) {
        const rows = this.getAll(tableName);
        return rows.filter(predicate);
      },
    },
    cdcIntegrationService,
    controlPlaneSystemTableGateway,
    messageRouter: {
      async deliver(target, request) {
        dispatchedMessages.push({target, request});
        return {acknowledged: true, status: 'initiated'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 3};
      },
    },
    enableTimeouts: false,
  });

  coordinator.initialize();
  try {
    coordinator.handleObservedReplicaStateChange(
      'services',
      'UPSERT',
      serviceRow,
    );
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    await coordinator.shutdown();
  }

  t.equal(
    operationRow.workflow_step,
    'STOPPING',
    'observed progress should advance REPLACE beyond PENDING even when ' +
      'strict owner-rpc reads are unavailable',
  );
  t.equal(
    operationRow.status,
    'removing',
    'observed progress should dispatch source removal after promoting the ' +
      'replacement replica to ACTIVE',
  );
  t.same(
    dispatchedMessages.map(({target, request}) => ({
      target,
      type: request.type,
      replicaId: request.replicaId,
    })),
    [{
      target: 'node-1/service/replica-handler',
      type: 'REMOVE_REPLICA',
      replicaId: 'control_plane_publications-p1-r1',
    }],
    'observed REPLACE progress should replay the remove-source phase through ' +
      'the canonical owner path',
  );
  t.ok(
    authoritativeReadCalls.some((call) =>
      call.tableName === 'replica_operations' &&
      call.options.requireOwnerRpcRead === true,
    ),
    'observed progress should attempt the strict owner-rpc read first',
  );
  t.ok(
    authoritativeReadCalls.some((call) =>
      call.tableName === 'replica_operations' &&
      call.options.requireOwnerRpcRead !== true,
    ),
    'observed progress should fall back to a non-strict authoritative read ' +
      'when the strict owner-rpc path is unavailable',
  );
});
