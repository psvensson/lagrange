import {EventEmitter} from 'events';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';
import {NODE_STATUS} from '../../src/node/node-constants.js';
import {STATE} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {
  initializeTestEnvironment as initTestEnv,
} from './helpers/cluster-test-helpers.js';

async function shutdownOrFail(t, promise, label) {
  try {
    await promise;
  } catch (error) {
    t.comment(`${label}: ${error.message}`);
    throw error;
  }
}

const TEST_TIMEOUTS = {
  CDC_FLUSH_INTERVAL: 50,
  CDC_PROPAGATION_DELAY: 25,
  HEARTBEAT_INTERVAL: 100,
  READY_LEASE_DURATION: 200,
  SUSPICION_THRESHOLD: 150,
  FAILURE_THRESHOLD: 300,
  STABILIZATION_PERIOD: 100,
  LEASE_SWEEP_INTERVAL: 50,
  TEST_TIMEOUT: 2000,
  CONFIG_STABILIZATION_PERIOD: 1000,
  CONFIG_PERIODIC_CHECK_INTERVAL: 1000,
  CONFIG_PERIODIC_CHECK_JITTER: 100,
};

function initializeTestEnvironment() {
  initTestEnv({nodeId: 'test-node'});
}

class _LatencySimulatingCDCHandler extends CDCHandler {
  constructor(cache, options = {}) {
    super(cache, {
      ...options,
      flushIntervalMs: TEST_TIMEOUTS.CDC_FLUSH_INTERVAL,
    });
    this.propagationDelayMs = options.propagationDelayMs ||
      TEST_TIMEOUTS.CDC_PROPAGATION_DELAY;
    this.delayedEvents = [];
  }

  handleEvent(event) {
    const delayedEvent = {
      event,
      deliverAt: Date.now() + this.propagationDelayMs,
    };
    this.delayedEvents.push(delayedEvent);

    setTimeout(() => {
      const idx = this.delayedEvents.indexOf(delayedEvent);
      if (idx >= 0) {
        this.delayedEvents.splice(idx, 1);
        super.handleEvent(event);
      }
    }, this.propagationDelayMs);

    return true;
  }

  getInFlightCount() {
    return this.delayedEvents.length;
  }

  async waitForDelivery(timeoutMs = 500) {
    const start = Date.now();
    while (this.delayedEvents.length > 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 10));
    }
    this.flushAllBuffers();
  }
}

function createRealisticCDCService(sourceCache, targetCaches = [], options = {}) {
  const propagationDelayMs = options.propagationDelayMs ||
    TEST_TIMEOUTS.CDC_PROPAGATION_DELAY;
  const pendingPropagations = [];
  let propagationTimers = [];

  const service = {
    pendingPropagations,
    sqlQueryEngine: {
      executeQuery: async () => ({success: true, rows: []}),
    },

    async insertSystemTableRow(tableName, data) {
      sourceCache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, data);

      for (const targetCache of targetCaches) {
        const timer = setTimeout(() => {
          targetCache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, data);
        }, propagationDelayMs);
        propagationTimers.push(timer);
      }

      return {
        success: true,
        operation: 'INSERT',
        tableName,
        data,
        affectedRows: 1,
        partitionResult: {affectedRows: 1},
      };
    },

    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {
        ...whereClause,
        ...data,
        updated_at: Number.isFinite(Number(data?.updated_at)) ?
          Number(data.updated_at) :
          Date.now(),
      };
      sourceCache.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, merged);

      for (const targetCache of targetCaches) {
        const timer = setTimeout(() => {
          targetCache.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, merged);
        }, propagationDelayMs);
        propagationTimers.push(timer);
      }

      return {
        success: true,
        operation: 'UPDATE',
        tableName,
        data: merged,
        affectedRows: 1,
        partitionResult: {affectedRows: 1},
      };
    },

    async upsertSystemTableRow(tableName, data) {
      sourceCache.applySystemTableChange(tableName, CDC_OPERATIONS.UPSERT, data);

      for (const targetCache of targetCaches) {
        const timer = setTimeout(() => {
          targetCache.applySystemTableChange(tableName, CDC_OPERATIONS.UPSERT, data);
        }, propagationDelayMs);
        propagationTimers.push(timer);
      }

      return {
        success: true,
        operation: 'UPSERT',
        tableName,
        data,
        affectedRows: 1,
        partitionResult: {affectedRows: 1},
      };
    },

    async deleteSystemTableRow(tableName, whereClause) {
      sourceCache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, whereClause);

      for (const targetCache of targetCaches) {
        const timer = setTimeout(() => {
          targetCache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, whereClause);
        }, propagationDelayMs);
        propagationTimers.push(timer);
      }

      return {
        success: true,
        operation: 'DELETE',
        tableName,
        affectedRows: 1,
        partitionResult: {affectedRows: 1},
      };
    },

    async waitForPropagation(_timeoutMs = 500) {
      await new Promise((r) => setTimeout(r, propagationDelayMs + 10));
    },

    cleanup() {
      for (const timer of propagationTimers) {
        clearTimeout(timer);
      }
      propagationTimers = [];
    },
  };

  return service;
}

class MockMessageGroupService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.groupId = options.groupId || 'mg-test';
    this.replicaId = options.replicaId || 'mg-test-r1';
    this.nodeId = options.nodeId || 'node-1';
    this._isLeader = options.isLeader !== false;
    this.sentMessages = [];
    this.acks = [];
  }

  isLeaderReplica() {
    return this._isLeader;
  }

  setLeader(isLeader) {
    this._isLeader = isLeader;
  }

  getLeaderId() {
    return this._isLeader ? this.replicaId : 'other-replica';
  }

  buildPeerAddress(replicaId) {
    return `${this.nodeId}/message-group/${replicaId}`;
  }

  async sendMessage(target, payload) {
    this.sentMessages.push({target, payload, timestamp: Date.now()});
    return {messageId: `msg-${Date.now()}`, status: 'sent'};
  }

  async acknowledgeMessage(messageId) {
    this.acks.push({messageId, timestamp: Date.now()});
  }

  simulateMessageReceived(payload) {
    this.emit('messageReceived', {payload, messageId: `msg-${Date.now()}`});
  }

  simulateCdcApplied(tableName, operation, data) {
    this.emit('cdcApplied', {tableName, operation, data});
  }
}

function createMockMessageRouter(options = {}) {
  const connectionStates = new Map();
  const outboundQueues = new Map();

  return {
    connectionStates,
    outboundQueues,

    setConnectionState(nodeId, state) {
      connectionStates.set(nodeId, state);
    },

    getConnectionState(nodeId) {
      return connectionStates.get(nodeId) || options.defaultState || 'connected';
    },

    setOutboundQueueAvailable(nodeId, available) {
      outboundQueues.set(nodeId, available);
    },

    isOutboundQueueAvailable(nodeId) {
      const available = outboundQueues.get(nodeId);
      return available !== undefined ? available : true;
    },

    async pingNode(_nodeId, _timeoutMs) {
      return options.pingResult !== undefined ? options.pingResult : true;
    },

    async deliver(target, payload) {
      return {acknowledged: true, status: 'initiated', target, payload};
    },
  };
}

function createMockTablePolicyService() {
  return {
    getDefaultPolicy: () => ({...DEFAULT_TABLE_POLICY}),
    getTablePolicy: () => ({...DEFAULT_TABLE_POLICY}),
    getPolicyForPartition: () => ({...DEFAULT_TABLE_POLICY}),
  };
}

function createMockRebalanceCoordinator() {
  let counter = 0;
  const operations = [];

  return {
    operations,
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true}),
      checkReplace: async () => ({allowed: true}),
    },
    storageAccountingService: {
      estimateReplicaBytes: () => 0,
    },
    getMoveSafetyError: () => null,
    async createOperation({type, partitionId, nodeId, replicaId}) {
      counter += 1;
      const op = {
        operationId: `op-${counter}`,
        type,
        partitionId,
        replicaId,
        targetNodeId: nodeId,
      };
      operations.push(op);
      return op;
    },
    async executeOperation(operation) {
      operations.push({...operation, executed: true});
      return {success: true};
    },
    getStats: () => ({operationsCreated: counter}),
    shutdown: () => {},
  };
}

function createCacheSqlQueryEngine(cache) {
  return {
    executeQuery: async (sql, _params) => {
      if (sql.includes('FROM nodes')) {
        const rows = cache.getAll(SYSTEM_TABLE_NAME.NODES) || [];
        return {success: true, rows};
      }
      if (sql.includes('FROM services')) {
        const rows =
          cache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [];
        return {success: true, rows};
      }
      if (sql.includes('FROM replica_operations')) {
        const rows = cache.getAll(
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        ) || [];
        return {success: true, rows};
      }
      return {success: true, rows: []};
    },
  };
}

function createCacheControlPlaneGateway(cache, mutationService = null) {
  return {
    async readRows(tableName, sql, params = []) {
      const normalizedTable = String(tableName || '').toLowerCase();
      const normalizedSql = String(sql || '').toLowerCase();

      if (normalizedTable === SYSTEM_TABLE_NAME.NODES ||
          normalizedSql.includes('from nodes')) {
        let rows = cache.getAll(SYSTEM_TABLE_NAME.NODES) || [];
        const [nodeId] = Array.isArray(params) ? params : [];
        if (typeof nodeId === 'string' &&
            nodeId.length > 0 &&
            normalizedSql.includes('where node_id = ?')) {
          rows = rows.filter((row) => row.node_id === nodeId);
        }
        return {success: true, rows};
      }

      if (normalizedTable === SYSTEM_TABLE_NAME.SERVICES ||
          normalizedSql.includes('from services')) {
        let rows = cache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [];
        const [nodeId, serviceType] = Array.isArray(params) ? params : [];
        if (typeof nodeId === 'string' && nodeId.length > 0) {
          rows = rows.filter((row) => row.node_id === nodeId);
        }
        if (typeof serviceType === 'string' && serviceType.length > 0) {
          rows = rows.filter((row) => row.service_type === serviceType);
        }
        return {success: true, rows};
      }

      if (normalizedTable === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
          normalizedSql.includes('from replica_operations')) {
        return {
          success: true,
          rows: cache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || [],
        };
      }

      return {success: true, rows: []};
    },

    async submitMutation(request) {
      const operation = String(request?.operation || '').toLowerCase();
      const tableName = request?.tableName;
      const whereClause = request?.whereClause || {};
      const data = request?.data || {};
      const row = request?.row || data;

      if (operation === 'insert') {
        if (mutationService &&
            typeof mutationService.insertSystemTableRow === 'function') {
          return mutationService.insertSystemTableRow(tableName, row);
        }
        cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, row);
        return {
          success: true,
          affectedRows: 1,
          partitionResult: {affectedRows: 1},
        };
      }

      if (operation === 'update') {
        if (mutationService &&
            typeof mutationService.updateSystemTableRow === 'function') {
          return mutationService.updateSystemTableRow(tableName, whereClause, data);
        }
        cache.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, {
          ...whereClause,
          ...data,
        });
        return {
          success: true,
          affectedRows: 1,
          partitionResult: {affectedRows: 1},
        };
      }

      if (operation === 'upsert') {
        if (mutationService &&
            typeof mutationService.upsertSystemTableRow === 'function') {
          return mutationService.upsertSystemTableRow(tableName, row);
        }
        cache.applySystemTableChange(tableName, CDC_OPERATIONS.UPSERT, row);
        return {
          success: true,
          affectedRows: 1,
          partitionResult: {affectedRows: 1},
        };
      }

      if (operation === 'delete') {
        if (mutationService &&
            typeof mutationService.deleteSystemTableRow === 'function') {
          return mutationService.deleteSystemTableRow(tableName, whereClause);
        }
        cache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, whereClause);
        return {
          success: true,
          affectedRows: 1,
          partitionResult: {affectedRows: 1},
        };
      }

      return {
        success: false,
        affectedRows: 0,
        partitionResult: {affectedRows: 0},
      };
    },
  };
}

function createNodeEntry(nodeId, overrides = {}) {
  const now = Date.now();
  return {
    node_id: nodeId,
    node_address: `ws://${nodeId}:9000`,
    cpu_cores: 4,
    memory_mb: 1024,
    disk_gb: 10,
    cpu_usage_percent: 10,
    memory_usage_percent: 20,
    disk_usage_percent: 30,
    status: NODE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    capabilities: '[]',
    last_heartbeat: now,
    ready_lease_expires_at: now + TEST_TIMEOUTS.READY_LEASE_DURATION,
    created_at: now,
    ...overrides,
  };
}

function createCacheBackedReadinessService(cache) {
  return {
    getNodeReadinessSync(nodeId) {
      const node = cache.get(SYSTEM_TABLE_NAME.NODES, nodeId);
      if (!node) {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
        };
      }
      const status = String(node.status || '').toLowerCase();
      const connectionState = String(node.connection_state || '').toLowerCase();
      const leaseExpiresAt = Number(node.ready_lease_expires_at);
      const leaseValid = Number.isFinite(leaseExpiresAt) &&
        leaseExpiresAt > Date.now();
      const ready = status === String(NODE_STATUS.ACTIVE).toLowerCase() &&
        connectionState === String(STATE.READY).toLowerCase() &&
        leaseValid;
      return {
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: ready,
        },
      };
    },
  };
}

async function waitForCondition(
  condition,
  timeoutMs = TEST_TIMEOUTS.TEST_TIMEOUT,
  intervalMs = 10,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export {
  MockMessageGroupService,
  TEST_TIMEOUTS,
  createCacheBackedReadinessService,
  createCacheControlPlaneGateway,
  createCacheSqlQueryEngine,
  createMockMessageRouter,
  createMockRebalanceCoordinator,
  createMockTablePolicyService,
  createNodeEntry,
  createRealisticCDCService,
  initializeTestEnvironment,
  shutdownOrFail,
  waitForCondition,
};
