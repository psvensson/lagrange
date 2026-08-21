import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';

// completeOperation/failOperation report a typed transition outcome
// ({committed, disposition}); termination stubs return the committed
// shape so the drain's truthful-progress propagation sees a settled
// terminal (quest terminal-write-refusal-retry-ownership).
const TEST_COMMITTED_TRANSITION_OUTCOME = Object.freeze({
  committed: true,
  disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
});

export function registerRebalanceCoordinatorTimeoutCacheVisibilityTailFinalTests({
  test,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  QUERY_ERROR_MSG,
  ReplicaStatus,
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
    const sourceServiceRow = {
      service_id: 'control_plane_publications-p1-r1',
      replica_id: 'control_plane_publications-p1-r1',
      partition_id: 'control_plane_publications-p1',
      node_id: 'node-1',
      service_type: 'partition',
      status: 'active',
      raft_role: 'leader',
      address: 'node-1/partition/control_plane_publications-p1-r1',
    };
    const authoritativeReadCalls = [];
    const dispatchedMessages = [];

    const cdcIntegrationService = {
      refreshAuthoritativeCacheRow: async () => true,
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
          if (
            options.authoritativeReadMode === 'owner_rpc_required'
          ) {
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
      call.options.readAuthority?.authoritativeReadMode !==
        'owner_rpc_required',
      ),
      'observed progress should stay on the non-strict local owner read path',
    );
    t.ok(
      authoritativeReadCalls.every((call) =>
        call.tableName !== 'replica_operations' ||
      call.options.readAuthority?.authoritativeReadMode !==
        'owner_rpc_required',
      ),
      'observed progress should not widen replica_operations reads to strict owner-rpc',
    );
  });

  test('observed progress prefers local authoritative target status over ' +
  'routed empty status reads for locally owned priority REPLACE', async (t) => {
    const nowMs = Date.now();
    const operationRow = {
      operation_id: 'op-observed-progress-local-target-status',
      type: 'REPLACE',
      partition_id: 'control_plane_publications-p1',
      replica_id: 'control_plane_publications-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: nowMs - 5000,
      updated_at: nowMs - 1000,
      completed_at: null,
      error_message: null,
      entity_type: 'partition',
      entity_id: 'control_plane_publications-p1',
      steps_history: JSON.stringify([{
        step: 'PENDING',
        timestamp: nowMs - 5000,
        sourceReplicaId: 'control_plane_publications-p1-r1',
      }, {
        step: 'SENDING',
        timestamp: nowMs - 3000,
      }, {
        step: 'CREATING',
        timestamp: nowMs - 1000,
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
    const sourceServiceRow = {
      service_id: 'control_plane_publications-p1-r1',
      replica_id: 'control_plane_publications-p1-r1',
      partition_id: 'control_plane_publications-p1',
      node_id: 'node-1',
      service_type: 'partition',
      status: 'active',
      raft_role: 'leader',
      address: 'node-1/partition/control_plane_publications-p1-r1',
    };
    const authoritativeReadCalls = [];
    const dispatchedMessages = [];

    const cdcIntegrationService = {
      refreshAuthoritativeCacheRow: async () => true,
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
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{...operationRow}],
          };
        }

        if (tableName === 'services') {
          if (
            options.authoritativeReadMode ===
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
          ) {
            return {
              success: true,
              source: 'local_partition_replica',
              rows: [{...serviceRow}],
            };
          }
          return {
            success: true,
            source: 'owner_rpc_lane',
            rows: [],
          };
        }

        return {
          success: true,
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
            return key === operationRow.operation_id ? operationRow : null;
          }
          if (tableName === 'services') {
            return key === serviceRow.service_id ? serviceRow : null;
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
          return this.getAll(tableName).filter(predicate);
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
      'local authoritative target status should advance the REPLACE row even when routed status reads stay empty',
    );
    t.equal(
      operationRow.status,
      ReplicaStatus.ACTIVE,
      'the durable row should record the locally observed target activation',
    );
    t.same(
      dispatchedMessages.map(({target, request}) => ({
        target,
        type: request.type,
        replicaId: request.replicaId,
      })),
      [],
      'local target activation should not dispatch source removal until safety policy allows it',
    );
    t.ok(
      authoritativeReadCalls.some((call) =>
        call.tableName === 'services' &&
      call.options.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      ),
      'priority reconciliation should probe local authoritative target status before trusting routed empty status reads',
    );
  });

  test('observed progress keeps locally owned priority REPLACE in CREATING ' +
  'when target visibility is already pending', async (t) => {
    const TEST_OPERATION_ID =
      'op-observed-progress-local-pending-target-status';
    const TEST_PARTITION_ID = 'sql_transaction_participants-p1';
    const TEST_REPLICA_ID = 'sql_transaction_participants-p1-r4';
    const TEST_SOURCE_REPLICA_ID = 'sql_transaction_participants-p1-r1';
    const TEST_SOURCE_NODE_ID = 'node-1';
    const TEST_TARGET_NODE_ID = 'node-2';
    const TEST_OPERATION_TYPE_REPLACE = 'REPLACE';
    const TEST_ENTITY_TYPE_PARTITION = 'partition';
    const TEST_WORKFLOW_STEP_PENDING = 'PENDING';
    const TEST_WORKFLOW_STEP_SENDING = 'SENDING';
    const TEST_WORKFLOW_STEP_CREATING = 'CREATING';
    const TEST_RAFT_ROLE_FOLLOWER = 'follower';
    const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
    const TEST_SERVICES_TABLE = 'services';
    const TEST_CACHE_OPERATION_UPSERT = 'UPSERT';
    const TEST_UPDATE_OPERATION_SQL_PREFIX =
      'UPDATE replica_operations SET';
    const TEST_SELECT_SERVICE_ID_FRAGMENT = 'WHERE service_id = ?';
    const TEST_SELECT_PARTITION_NODE_FRAGMENT =
      'WHERE partition_id = ? AND node_id = ?';
    const TEST_EMPTY_VALUE = null;
    const nowMs = Date.now();
    const operationRow = {
      operation_id: TEST_OPERATION_ID,
      type: TEST_OPERATION_TYPE_REPLACE,
      partition_id: TEST_PARTITION_ID,
      replica_id: TEST_REPLICA_ID,
      source_node_id: TEST_SOURCE_NODE_ID,
      target_node_id: TEST_TARGET_NODE_ID,
      status: ReplicaStatus.CREATING,
      workflow_step: TEST_WORKFLOW_STEP_CREATING,
      created_at: nowMs - 5000,
      updated_at: nowMs - 1000,
      completed_at: TEST_EMPTY_VALUE,
      error_message: TEST_EMPTY_VALUE,
      entity_type: TEST_ENTITY_TYPE_PARTITION,
      entity_id: TEST_PARTITION_ID,
      steps_history: JSON.stringify([{
        step: TEST_WORKFLOW_STEP_PENDING,
        timestamp: nowMs - 5000,
        sourceReplicaId: TEST_SOURCE_REPLICA_ID,
      }, {
        step: TEST_WORKFLOW_STEP_SENDING,
        timestamp: nowMs - 3000,
      }, {
        step: TEST_WORKFLOW_STEP_CREATING,
        timestamp: nowMs - 1000,
      }]),
    };
    const serviceRow = {
      service_id: TEST_REPLICA_ID,
      replica_id: TEST_REPLICA_ID,
      partition_id: TEST_PARTITION_ID,
      node_id: TEST_TARGET_NODE_ID,
      service_type: TEST_ENTITY_TYPE_PARTITION,
      status: ReplicaStatus.PENDING,
      raft_role: TEST_RAFT_ROLE_FOLLOWER,
      address:
        `${TEST_TARGET_NODE_ID}/partition/${TEST_REPLICA_ID}`,
    };
    const authoritativeReadCalls = [];
    const dispatchedMessages = [];

    const cdcIntegrationService = {
      refreshAuthoritativeCacheRow: async () => true,
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

        if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{...operationRow}],
          };
        }

        if (tableName === TEST_SERVICES_TABLE) {
          if (String(sql).includes(TEST_SELECT_SERVICE_ID_FRAGMENT)) {
            return {
              success: true,
              source: 'local_partition_replica',
              rows: [{...serviceRow}],
            };
          }
          if (String(sql).includes(TEST_SELECT_PARTITION_NODE_FRAGMENT)) {
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
        if (String(sql).startsWith(TEST_UPDATE_OPERATION_SQL_PREFIX)) {
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
      nodeId: TEST_TARGET_NODE_ID,
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
            return key === operationRow.operation_id ?
              operationRow :
              TEST_EMPTY_VALUE;
          }
          if (tableName === TEST_SERVICES_TABLE) {
            return key === serviceRow.service_id ?
              serviceRow :
              TEST_EMPTY_VALUE;
          }
          return TEST_EMPTY_VALUE;
        },
        getAll(tableName) {
          if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
            return [operationRow];
          }
          if (tableName === TEST_SERVICES_TABLE) {
            return [serviceRow];
          }
          return [];
        },
        filter(tableName, predicate) {
          return this.getAll(tableName).filter(predicate);
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
        TEST_SERVICES_TABLE,
        TEST_CACHE_OPERATION_UPSERT,
        serviceRow,
      );
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      operationRow.workflow_step,
      TEST_WORKFLOW_STEP_CREATING,
      'observed pending target visibility should keep the durable row in CREATING',
    );
    t.equal(
      operationRow.status,
      ReplicaStatus.CREATING,
      'observed pending target visibility should preserve the creating status',
    );
    t.same(
      dispatchedMessages.map(({target, request}) => ({
        target,
        type: request.type,
        replicaId: request.replicaId,
      })),
      [],
      'observed pending target visibility should not replay create dispatch from the owner lane',
    );
    t.ok(
      authoritativeReadCalls.some((call) =>
        call.tableName === TEST_SERVICES_TABLE &&
        call.options.authoritativeReadMode ===
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      ),
      'observed pending target visibility should still reconcile through the local target-status owner read',
    );
  });

  test('replica operation row cache progress reconciles priority REPLACE ' +
  'when target service progress was already cached', async (t) => {
    const TEST_OPERATION_ID =
      'op-observed-operation-row-target-progress';
    const TEST_PARTITION_ID = 'sql_transaction_participants-p1';
    const TEST_REPLICA_ID = 'sql_transaction_participants-p1-r4';
    const TEST_SOURCE_REPLICA_ID = 'sql_transaction_participants-p1-r1';
    const TEST_SOURCE_NODE_ID = 'node-1';
    const TEST_TARGET_NODE_ID = 'node-2';
    const TEST_OPERATION_TYPE_REPLACE = 'REPLACE';
    const TEST_ENTITY_TYPE_PARTITION = 'partition';
    const TEST_WORKFLOW_STEP_PENDING = 'PENDING';
    const TEST_WORKFLOW_STEP_SENDING = 'SENDING';
    const TEST_WORKFLOW_STEP_CREATING = 'CREATING';
    const TEST_WORKFLOW_STEP_ACTIVE = 'ACTIVE';
    const TEST_RAFT_ROLE_FOLLOWER = 'follower';
    const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
    const TEST_SERVICES_TABLE = 'services';
    const TEST_CACHE_OPERATION_UPSERT = 'UPSERT';
    const TEST_UPDATE_OPERATION_SQL_PREFIX =
      'UPDATE replica_operations SET';
    const TEST_SELECT_SERVICE_ID_FRAGMENT = 'WHERE service_id = ?';
    const TEST_SELECT_PARTITION_NODE_FRAGMENT =
      'WHERE partition_id = ? AND node_id = ?';
    const TEST_EMPTY_VALUE = null;
    const nowMs = Date.now();
    const operationRow = {
      operation_id: TEST_OPERATION_ID,
      type: TEST_OPERATION_TYPE_REPLACE,
      partition_id: TEST_PARTITION_ID,
      replica_id: TEST_REPLICA_ID,
      source_node_id: TEST_SOURCE_NODE_ID,
      target_node_id: TEST_TARGET_NODE_ID,
      status: ReplicaStatus.CREATING,
      workflow_step: TEST_WORKFLOW_STEP_CREATING,
      created_at: nowMs - 5000,
      updated_at: nowMs - 1000,
      completed_at: TEST_EMPTY_VALUE,
      error_message: TEST_EMPTY_VALUE,
      entity_type: TEST_ENTITY_TYPE_PARTITION,
      entity_id: TEST_PARTITION_ID,
      steps_history: JSON.stringify([{
        step: TEST_WORKFLOW_STEP_PENDING,
        timestamp: nowMs - 5000,
        sourceReplicaId: TEST_SOURCE_REPLICA_ID,
      }, {
        step: TEST_WORKFLOW_STEP_SENDING,
        timestamp: nowMs - 3000,
      }, {
        step: TEST_WORKFLOW_STEP_CREATING,
        timestamp: nowMs - 1000,
      }]),
    };
    const serviceRow = {
      service_id: TEST_REPLICA_ID,
      replica_id: TEST_REPLICA_ID,
      partition_id: TEST_PARTITION_ID,
      node_id: TEST_TARGET_NODE_ID,
      service_type: TEST_ENTITY_TYPE_PARTITION,
      status: ReplicaStatus.ACTIVE,
      raft_role: TEST_RAFT_ROLE_FOLLOWER,
      address:
        `${TEST_TARGET_NODE_ID}/partition/${TEST_REPLICA_ID}`,
    };
    let operationVisibleInCache = false;
    const authoritativeReadCalls = [];
    const dispatchedMessages = [];

    const cdcIntegrationService = {
      refreshAuthoritativeCacheRow: async () => true,
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

        if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
          return {
            success: true,
            source: 'local_partition_replica',
            rows: [{...operationRow}],
          };
        }

        if (tableName === TEST_SERVICES_TABLE) {
          if (String(sql).includes(TEST_SELECT_SERVICE_ID_FRAGMENT)) {
            return {
              success: true,
              source: 'local_partition_replica',
              rows: [{...serviceRow}],
            };
          }
          if (String(sql).includes(TEST_SELECT_PARTITION_NODE_FRAGMENT)) {
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
        if (String(sql).startsWith(TEST_UPDATE_OPERATION_SQL_PREFIX)) {
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
      nodeId: TEST_TARGET_NODE_ID,
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
            return operationVisibleInCache &&
              key === operationRow.operation_id ?
                operationRow :
                TEST_EMPTY_VALUE;
          }
          if (tableName === TEST_SERVICES_TABLE) {
            return key === serviceRow.service_id ?
              serviceRow :
              TEST_EMPTY_VALUE;
          }
          return TEST_EMPTY_VALUE;
        },
        getAll(tableName) {
          if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
            return operationVisibleInCache ? [operationRow] : [];
          }
          if (tableName === TEST_SERVICES_TABLE) {
            return [serviceRow];
          }
          return [];
        },
        filter(tableName, predicate) {
          return this.getAll(tableName).filter(predicate);
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
        TEST_SERVICES_TABLE,
        TEST_CACHE_OPERATION_UPSERT,
        serviceRow,
      );
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        operationRow.workflow_step,
        TEST_WORKFLOW_STEP_CREATING,
        'the earlier services event should not progress without a visible operation row',
      );

      operationVisibleInCache = true;
      coordinator.handleObservedReplicaStateChange(
        TEST_REPLICA_OPERATIONS_TABLE,
        TEST_CACHE_OPERATION_UPSERT,
        operationRow,
      );
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      await coordinator.shutdown();
    }

    t.equal(
      operationRow.workflow_step,
      TEST_WORKFLOW_STEP_ACTIVE,
      'operation row visibility should wake observed progress from the cached active target service',
    );
    t.equal(
      operationRow.status,
      ReplicaStatus.ACTIVE,
      'the operation row should record the observed target activation',
    );
    t.same(
      dispatchedMessages.map(({target, request}) => ({
        target,
        type: request.type,
        replicaId: request.replicaId,
      })),
      [],
      'operation row wakeup should not dispatch source removal until safety policy allows it',
    );
    t.ok(
      authoritativeReadCalls.some((call) =>
        call.tableName === TEST_SERVICES_TABLE &&
        call.options.authoritativeReadMode ===
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      ),
      'operation row wakeup should reconcile through the local target-status owner read',
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
    const sourceServiceRow = {
      service_id: 'control_plane_publications-p1-r1',
      replica_id: 'control_plane_publications-p1-r1',
      partition_id: 'control_plane_publications-p1',
      node_id: 'node-1',
      service_type: 'partition',
      status: 'active',
      raft_role: 'leader',
      address: 'node-1/partition/control_plane_publications-p1-r1',
    };
    const authoritativeReadCalls = [];
    const dispatchedMessages = [];
    const cdcIntegrationService = {
      refreshAuthoritativeCacheRow: async () => true,
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
          const requested = Array.isArray(params) ? params[0] : null;
          const rows = [{...serviceRow}, {...sourceServiceRow}].filter(
            (row) =>
              requested === null ||
              row.service_id === requested ||
              row.partition_id === requested,
          );
          return {
            success: true,
            source: 'local_partition_replica',
            rows,
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
      call.options.authoritativeReadMode !== 'owner_rpc_required',
      ),
      'observed progress should still attempt the bounded non-strict ' +
      'owner observation before giving up',
    );
    t.ok(
      authoritativeReadCalls.every((call) =>
        call.tableName !== 'replica_operations' ||
      call.options.authoritativeReadMode !== 'owner_rpc_required',
      ),
      'observed progress should not widen ACTIVE replace reconciliation into ' +
      'strict owner-rpc while remove safety is still blocked',
    );
  });

  test('priority REMOVE drain fails (never completes) a stale undispatched ' +
    'REMOVE on unproven absence when the owner is unavailable',
  async (t) => {
      const TEST_LOCAL_NODE_ID = 'node-local-remove-drain';
      const TEST_REMOTE_TARGET_NODE_ID = 'node-remote-remove-drain';
      const TEST_PARTITION_ID = 'replica_operations-p1';
      const TEST_OPERATION_ID = 'op-priority-remove-drain-settle';
      const TEST_REPLICA_ID = `${TEST_PARTITION_ID}-r4`;
      const TEST_OPERATION_TYPE_REMOVE = 'REMOVE';
      const TEST_WORKFLOW_STEP_SENDING = 'SENDING';
      const TEST_OPERATION_STATUS_PENDING = 'pending';
      const TEST_ENTITY_TYPE_PARTITION = 'partition';
      const TEST_COMPLETION_STATE_CONVERGED = 'converged';
      const TEST_OBSERVATION_STATE_ABSENT = 'absent';
      const TEST_NULL_VALUE = null;
      const TEST_ACKNOWLEDGED = true;
      const TEST_DELIVERY_STATUS_COMPLETED = 'completed';
      const TEST_MIN_REPLICA_COUNT = 3;
      const TEST_STALE_STEP_AGE_MS = 70000;
      const observedReplicaChecks = [];
      const completedOperationIds = [];
      const failedOperationIds = [];

      const coordinator = createCoordinator({
        nodeId: TEST_LOCAL_NODE_ID,
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          get() {
            return TEST_NULL_VALUE;
          },
          filter() {
            return [];
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
          async waitForCacheUpdate() {},
        },
        messageRouter: {
          async deliver() {
            return {
              acknowledged: TEST_ACKNOWLEDGED,
              status: TEST_DELIVERY_STATUS_COMPLETED,
            };
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const workflowOwner = coordinator.workflowOwner;
        workflowOwner.repository.isOperationLocallyOwned = () => false;
        workflowOwner.getPriorityRecoveryPlanningSnapshot = async () => ({});
        workflowOwner.buildPriorityRecoveryCompletionForOperation = () => ({
          state: TEST_COMPLETION_STATE_CONVERGED,
        });
        workflowOwner.observeStoppingReplicaProgress =
          async (replicaId, partitionId, targetNodeId) => {
            observedReplicaChecks.push({
              replicaId,
              partitionId,
              targetNodeId,
            });
            return {
              state: TEST_OBSERVATION_STATE_ABSENT,
              lifecycleStatus: TEST_NULL_VALUE,
            };
          };
        workflowOwner.completeOperation = async (operation) => {
          completedOperationIds.push(operation.operationId);
          return TEST_COMMITTED_TRANSITION_OUTCOME;
        };
        workflowOwner.failOperation = async (operation) => {
          failedOperationIds.push(operation.operationId);
          return TEST_COMMITTED_TRANSITION_OUTCOME;
        };
        workflowOwner.isPriorityRecoveryDrainOwnerUnavailable = () => true;

        const reconciled =
          await workflowOwner.reconcilePriorityRecoveryOperationDrain({
            operationId: TEST_OPERATION_ID,
            type: TEST_OPERATION_TYPE_REMOVE,
            partitionId: TEST_PARTITION_ID,
            entityType: TEST_ENTITY_TYPE_PARTITION,
            entityId: TEST_PARTITION_ID,
            replicaId: TEST_REPLICA_ID,
            sourceNodeId: TEST_LOCAL_NODE_ID,
            targetNodeId: TEST_REMOTE_TARGET_NODE_ID,
            status: TEST_OPERATION_STATUS_PENDING,
            workflowStep: TEST_WORKFLOW_STEP_SENDING,
            createdAt: Date.now() - TEST_STALE_STEP_AGE_MS,
            updatedAt: Date.now() - TEST_STALE_STEP_AGE_MS,
            completedAt: TEST_NULL_VALUE,
          });

        t.equal(
          reconciled,
          true,
          'stale undispatched REMOVE with an unavailable owner should settle',
        );
        t.same(
          observedReplicaChecks,
          [{
            replicaId: TEST_REPLICA_ID,
            partitionId: TEST_PARTITION_ID,
            targetNodeId: TEST_REMOTE_TARGET_NODE_ID,
          }],
          'REMOVE drain should observe the replica targeted by the REMOVE row',
        );
        t.same(
          failedOperationIds,
          [TEST_OPERATION_ID],
          'remote settlement should fail the stale REMOVE: absence before ' +
            'a dispatched removal is not removal evidence',
        );
        t.same(
          completedOperationIds,
          [],
          'an undispatched REMOVE must not complete off unproven absence',
        );
      } finally {
        await coordinator.shutdown();
      }
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
      refreshAuthoritativeCacheRow: async () => true,
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
