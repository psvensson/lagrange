export function registerRebalanceCoordinatorTimeoutCacheVisibilityTailFinalTests({
  test,
  RebalanceCoordinator,
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  QUERY_ERROR_MSG,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  ReplicaStatus,
  PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
  EMERGENCY_PRIORITY_PARTITION_ID,
  buildTransactionCoordinator,
  createCoordinator,
}) {
test('observed progress reconciles REPLACE workflows from local owner rows ' +
  'when strict owner-rpc reads are unavailable', async (t) => {
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
    nodeId: 'node-2',
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
    'ACTIVE',
    'observed progress should promote REPLACE beyond PENDING from local owner rows even when strict owner-rpc reads are unavailable',
  );
  t.equal(
    operationRow.status,
    'active',
    'observed progress should preserve the promoted ACTIVE state until removal safety allows source removal',
  );
  t.same(
    dispatchedMessages.map(({target, request}) => ({
      target,
      type: request.type,
      replicaId: request.replicaId,
    })),
    [],
    'observed progress should not dispatch source removal until safety policy allows the remove-source phase',
  );
  t.ok(
    authoritativeReadCalls.some((call) =>
      call.tableName === 'replica_operations' &&
      call.options.requireOwnerRpcRead !== true,
    ),
    'observed progress should stay on the non-strict local owner read path',
  );
  t.ok(
    authoritativeReadCalls.every((call) =>
      call.tableName !== 'replica_operations' ||
      call.options.requireOwnerRpcRead !== true
    ),
    'observed progress should not widen replica_operations reads to strict owner-rpc',
  );
});

test('observed progress does not replay REPLACE source removal from stale ' +
  'cache state when authoritative reads stay retryable', async (t) => {
  const nowMs = Date.now();
  const operationRow = {
    operation_id: 'op-observed-progress-retryable-authoritative-gap',
    type: 'REPLACE',
    partition_id: 'control_plane_publications-p1',
    replica_id: 'control_plane_publications-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'active',
    workflow_step: 'ACTIVE',
    created_at: nowMs - 5000,
    updated_at: nowMs - 1000,
    completed_at: null,
    error_message: null,
    entity_type: 'partition',
    entity_id: 'control_plane_publications-p1',
    steps_history: JSON.stringify([
      {
        step: 'PENDING',
        timestamp: nowMs - 5000,
        sourceReplicaId: 'control_plane_publications-p1-r1',
      },
      {
        step: 'ACTIVE',
        timestamp: nowMs - 1500,
        previousStep: 'SYNCING',
      },
    ]),
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

      if (tableName === 'services') {
        return {
          success: true,
          source: 'local_partition_replica',
          rows: [{...serviceRow}],
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
    async executeQuery() {
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
        return {acknowledged: true, status: 'completed'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 3};
      },
    },
    enableTimeouts: false,
  });
  coordinator.repository.queryAuthoritativeOperationById = async (
    _operationId,
    options = {},
  ) => {
    authoritativeReadCalls.push({
      tableName: 'replica_operations',
      sql: 'SELECT * FROM replica_operations WHERE operation_id = ?',
      params: [operationRow.operation_id],
      options: {...options},
    });
    return null;
  };

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
    dispatchedMessages.length,
    0,
    'observed progress should not replay source removal from stale cache state',
  );
  t.equal(
    operationRow.workflow_step,
    'ACTIVE',
    'observed progress should leave the cached REPLACE operation untouched ' +
      'until authoritative reads recover',
  );
  t.ok(
    authoritativeReadCalls.some((call) =>
      call.tableName === 'replica_operations' &&
      call.options.requireOwnerRpcRead === true,
    ),
    'observed progress should still attempt the strict owner-rpc read first',
  );
  t.ok(
    authoritativeReadCalls.some((call) =>
      call.tableName === 'replica_operations' &&
      call.options.requireOwnerRpcRead !== true,
    ),
    'observed progress should still attempt the bounded non-strict ' +
      'authoritative fallback before giving up',
  );
});

test('observed progress defers retryable failures back onto the owner lane',
  async (t) => {
    const scheduledTimers = [];
    let nextTimerId = 1;
    let observedAttempts = 0;
    const operationId = 'op-observed-progress-deferred-retry';
    const serviceRow = {
      service_id: 'partition-1-r2',
      replica_id: 'partition-1-r2',
      partition_id: 'partition-1',
      node_id: 'node-2',
      service_type: 'partition',
      status: 'active',
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
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 3};
        },
      },
      enableTimeouts: false,
      setTimeoutFn(callback, delayMs) {
        const timer = {
          id: nextTimerId++,
          callback,
          delayMs,
        };
        scheduledTimers.push(timer);
        return timer;
      },
      clearTimeoutFn(timer) {
        if (timer) {
          timer.cleared = true;
        }
      },
    });
    coordinator.workflowOwner.findObservedProgressOperationIds = () => [
      operationId,
    ];
    coordinator.workflowOwner.reconcileObservedProgressOperation =
      async (seenOperationId) => {
        observedAttempts += 1;
        t.equal(
          seenOperationId,
          operationId,
          'deferred retry should preserve the same operation owner key',
        );
        if (observedAttempts === 1) {
          const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_ROLLBACK);
          error.retryAfterMs = 25;
          throw error;
        }
        return true;
      };

    coordinator.initialize();
    try {
      coordinator.handleObservedReplicaStateChange(
        'services',
        'UPSERT',
        serviceRow,
      );
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        observedAttempts,
        1,
        'initial observed-progress reconciliation should run immediately',
      );
      t.equal(
        scheduledTimers.length,
        1,
        'retryable failure should schedule exactly one deferred retry',
      );
      t.equal(
        scheduledTimers[0].delayMs,
        25,
        'owner retry should honor the control-plane retry hint',
      );

      await scheduledTimers[0].callback();
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        observedAttempts,
        2,
        'deferred retry should re-enter the same owner lane once',
      );
    } finally {
      await coordinator.shutdown();
    }
  });
}
