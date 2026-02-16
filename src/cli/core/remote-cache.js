/**
 * Remote Cache - Maintains a local copy of system tables synchronized via CDC
 *
 * The Remote Cache stores system table data locally and keeps it synchronized
 * with the server through CDC (Change Data Capture) events. This enables fast
 * navigation without repeated API calls.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

/**
 * Primary key mappings for each system table
 */
const PRIMARY_KEYS = {
  nodes: 'node_id',
  services: 'service_id',
  service_definitions: 'service_id',
  service_endpoints: 'endpoint_id',
  partitions: 'partition_id',
  tables: 'table_id',
  message_groups: 'group_id',
  indices: 'index_id',
  logs: 'log_id',
  config: 'config_key',
  contexts: 'context_id',
  replica_operations: 'operation_id',
};

const LOGICAL_SERVICE_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  PARTIAL: 'partial',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown',
});

const HEALTHY_RUNTIME_STATUS = new Set([
  'healthy',
  'active',
]);

/**
 * RemoteCache class maintains a local copy of system tables synchronized via CDC
 */
export class RemoteCache {
  /**
   * Creates a new RemoteCache instance
   */
  constructor() {
    this.tables = {
      nodes: new Map(),
      services: new Map(),
      service_definitions: new Map(),
      service_endpoints: new Map(),
      partitions: new Map(),
      tables: new Map(),
      message_groups: new Map(),
      indices: new Map(),
      logs: new Map(),
      config: new Map(),
      contexts: new Map(),
      replica_operations: new Map(),
    };
    this.lastUpdate = null;
    this.cdcLag = 0;
    // Track tables affected by CDC events for selective invalidation
    this.affectedTableIds = new Set();
  }

  /**
   * Gets the primary key for a record in a given table
   * @param {string} tableName - Name of the table
   * @param {Object} record - The record to get the key from
   * @return {string} The primary key value
   */
  getPrimaryKey(tableName, record) {
    const keyField = PRIMARY_KEYS[tableName];
    if (!keyField) {
      throw new Error(`Unknown table: ${tableName}`);
    }
    const camelKeyField = keyField.replace(/_([a-z])/g, (_match, letter) => {
      return letter.toUpperCase();
    });
    return record[keyField] ?? record[camelKeyField] ?? record.id;
  }

  /**
   * Initialize cache from a full dump (initial sync)
   * Requirements: 13.1
   * @param {Object} dump - Object mapping table names to arrays of records
   */
  loadFromDump(dump) {
    for (const [tableName, records] of Object.entries(dump)) {
      if (!this.tables[tableName]) {
        continue; // Skip unknown tables
      }
      this.tables[tableName].clear();
      if (Array.isArray(records)) {
        for (const record of records) {
          const key = this.getPrimaryKey(tableName, record);
          if (key === undefined || key === null) {
            continue;
          }
          this.tables[tableName].set(key, record);
        }
      }
    }
    this.lastUpdate = Date.now();
  }

  /**
   * Apply a CDC event to update the cache
   * Requirements: 13.4, 12.10
   * @param {Object} event - CDC event with table, operation, data, key, timestamp
   * @return {Object} Change info with table, key, operation, affectedTableId
   */
  applyCDCEvent(event) {
    const {table, operation, data, key} = event;

    if (!this.tables[table]) {
      return {table, key, operation, applied: false};
    }

    // Track affected table for selective invalidation (Requirements: 12.10, 13.8)
    let affectedTableId = null;

    switch (operation) {
    case 'INSERT':
    case 'UPDATE':
      this.tables[table].set(key, data);
      // If this is a partition change, track the owning table
      if (table === 'partitions' && data && data.table_id) {
        affectedTableId = data.table_id;
        this.affectedTableIds.add(affectedTableId);
      }
      break;
    case 'DELETE':
      // For partition deletes, get the table_id before deletion
      if (table === 'partitions') {
        const existingPartition = this.tables[table].get(key);
        if (existingPartition && existingPartition.table_id) {
          affectedTableId = existingPartition.table_id;
          this.affectedTableIds.add(affectedTableId);
        }
      }
      this.tables[table].delete(key);
      break;
    default:
      return {table, key, operation, applied: false};
    }

    this.lastUpdate = Date.now();
    if (event.timestamp) {
      this.cdcLag = Date.now() - event.timestamp;
    }

    return {table, key, operation, applied: true, affectedTableId};
  }

  /**
   * Get and clear the set of table IDs affected by CDC events
   * Requirements: 12.10, 13.8
   * @return {Set} Set of affected table IDs
   */
  getAndClearAffectedTables() {
    const affected = new Set(this.affectedTableIds);
    this.affectedTableIds.clear();
    return affected;
  }

  /**
   * Check if a specific table has been affected by CDC events
   * Requirements: 12.10, 13.8
   * @param {string} tableId - The table ID to check
   * @return {boolean} True if the table was affected
   */
  isTableAffected(tableId) {
    return this.affectedTableIds.has(tableId);
  }

  /**
   * Clear the affected tables tracking
   */
  clearAffectedTables() {
    this.affectedTableIds.clear();
  }

  /**
   * Get all nodes
   * Requirements: 13.2
   * @return {Array} Array of node records
   */
  getNodes() {
    return Array.from(this.tables.nodes.values());
  }

  /**
   * Get a specific node by ID
   * @param {string} nodeId - The node ID
   * @return {Object|undefined} The node record or undefined
   */
  getNode(nodeId) {
    return this.tables.nodes.get(nodeId);
  }

  /**
   * Get replica rows with optional filtering.
   * Requirements: 13.2
   * @param {Object} filter - Optional filters (nodeId, type, partitionId, groupId, serviceId)
   * @return {Array} Array of replica records
   */
  getServices(filter = {}) {
    let services = Array.from(this.tables.services.values());
    services = services.concat(this.getRuntimeServices());
    if (filter.nodeId) {
      services = services.filter((service) => {
        return this.resolveNodeId(service) === filter.nodeId;
      });
    }
    if (filter.type) {
      services = services.filter((service) => {
        return this.resolveServiceType(service) === filter.type;
      });
    }
    if (filter.partitionId) {
      services = services.filter((service) => {
        return service.partition_id === filter.partitionId;
      });
    }
    if (filter.groupId) {
      services = services.filter((service) => {
        return service.group_id === filter.groupId;
      });
    }
    if (filter.serviceId) {
      services = services.filter((service) => {
        return this.resolveServiceId(service) === filter.serviceId ||
          service.logical_service_id === filter.serviceId;
      });
    }

    // Enrich services with node_address from nodes table
    return services.map((service) => {
      if (service.node_address) {
        return service;
      }
      const node = this.tables.nodes.get(this.resolveNodeId(service));
      const nodeAddress = this.resolveNodeAddress(node);
      if (nodeAddress) {
        return {...service, node_address: nodeAddress};
      }
      return service;
    });
  }

  /**
   * Get logical service rows (service definitions joined with endpoints).
   * @param {Object} filter - Optional filters (nodeId, serviceId).
   * @return {Array<Object>}
   */
  getLogicalServices(filter = {}) {
    const logicalServices = [];
    const definitions = Array.from(this.tables.service_definitions.values());
    const endpointsByServiceId = this.getEndpointsByServiceId();

    for (const definition of definitions) {
      const serviceId = this.resolveServiceId(definition);
      if (!serviceId) {
        continue;
      }

      const endpoints = endpointsByServiceId.get(serviceId) || [];
      const nodes = this.collectEndpointNodeIds(endpoints);
      if (filter.nodeId && !nodes.includes(filter.nodeId)) {
        continue;
      }
      if (filter.serviceId && serviceId !== filter.serviceId) {
        continue;
      }

      const desiredReplicaCount = this.resolveReplicaCount(definition);
      const observedReplicaCount = endpoints.length;
      const healthyReplicaCount = this.countHealthyEndpoints(endpoints);

      logicalServices.push({
        ...definition,
        service_id: serviceId,
        service_name: definition.service_name || definition.serviceName || serviceId,
        service_type: definition.service_type || definition.serviceType || 'runtime_service',
        runtime_kind: definition.runtime_kind || definition.runtimeKind || null,
        runtime_ref: definition.runtime_ref || definition.runtimeRef || null,
        replica_count: desiredReplicaCount,
        replica_count_observed: observedReplicaCount,
        healthy_replica_count: healthyReplicaCount,
        node_count: nodes.length,
        nodes,
        nodes_summary: nodes.length > 0 ? nodes.join(', ') : 'none',
        status: this.resolveLogicalServiceStatus(
          desiredReplicaCount,
          observedReplicaCount,
          healthyReplicaCount,
        ),
      });
    }

    return logicalServices;
  }

  /**
   * Build runtime service rows from service definitions and endpoints.
   * @return {Array<Object>} Runtime-backed service rows.
   */
  getRuntimeServices() {
    const runtimeServices = [];
    const definitions = Array.from(this.tables.service_definitions.values());
    const endpointsByServiceId = this.getEndpointsByServiceId();

    for (const definition of definitions) {
      const serviceId = this.resolveServiceId(definition);
      if (!serviceId) {
        continue;
      }

      const endpoints = endpointsByServiceId.get(serviceId) || [];
      for (const endpoint of endpoints) {
        runtimeServices.push(this.createRuntimeServiceRow(definition, endpoint));
      }
    }

    return runtimeServices;
  }

  /**
   * Create one runtime service row for service inventory views.
   * @param {Object} definition - service_definitions row.
   * @param {Object} endpoint - service_endpoints row.
   * @return {Object}
   */
  createRuntimeServiceRow(definition, endpoint) {
    const serviceId = this.resolveServiceId(definition);
    const endpointId = this.resolveEndpointId(endpoint);
    const endpointAddress = this.formatEndpointAddress(endpoint);
    const status = this.resolveRuntimeStatus(definition, endpoint);
    const nodeId = this.resolveNodeId(endpoint);

    return {
      ...definition,
      service_id: serviceId,
      logical_service_id: serviceId,
      service_type: 'runtime_service',
      status,
      node_id: nodeId,
      endpoint_id: endpointId,
      replica_id: endpointId,
      address: endpointAddress,
      row_key: `runtime:${serviceId}:${endpointId}`,
    };
  }

  /**
   * Format endpoint address with optional port.
   * @param {Object|null} endpoint - Endpoint record.
   * @return {string|null}
   */
  formatEndpointAddress(endpoint) {
    const address = this.resolveNodeAddress(endpoint);
    if (!address) {
      return null;
    }
    const port = endpoint.port ?? endpoint.ws_port ?? endpoint.wsPort;
    if (port === undefined || port === null) {
      return address;
    }
    return `${address}:${port}`;
  }

  /**
   * Resolve a service identifier from snake_case, camelCase, or id fallback.
   * @param {Object|undefined|null} row
   * @return {string}
   */
  resolveServiceId(row) {
    if (!row) {
      return '';
    }
    return row.service_id || row.serviceId || row.id || '';
  }

  /**
   * Resolve a node identifier from snake_case or camelCase fields.
   * @param {Object|undefined|null} row
   * @return {string|null}
   */
  resolveNodeId(row) {
    if (!row) {
      return null;
    }
    return row.node_id || row.nodeId || null;
  }

  /**
   * Resolve a service type from snake_case or legacy aliases.
   * @param {Object|undefined|null} row
   * @return {string|null}
   */
  resolveServiceType(row) {
    if (!row) {
      return null;
    }
    return row.service_type || row.serviceType || row.type || null;
  }

  /**
   * Resolve endpoint identifier from snake_case, camelCase, or id fallback.
   * @param {Object|undefined|null} endpoint
   * @return {string|null}
   */
  resolveEndpointId(endpoint) {
    if (!endpoint) {
      return null;
    }
    return endpoint.endpoint_id || endpoint.endpointId || endpoint.id || null;
  }

  /**
   * Resolve display address from common node/endpoint field variants.
   * @param {Object|undefined|null} row
   * @return {string|null}
   */
  resolveNodeAddress(row) {
    if (!row) {
      return null;
    }
    return row.node_address || row.nodeAddress || row.address || row.host || null;
  }

  /**
   * Resolve runtime service status from endpoint health or definition status.
   * @param {Object} definition
   * @param {Object|null|undefined} endpoint
   * @return {string}
   */
  resolveRuntimeStatus(definition, endpoint) {
    return endpoint?.health_status ||
      endpoint?.healthStatus ||
      endpoint?.status ||
      definition?.status ||
      definition?.state ||
      'unknown';
  }

  /**
   * Group endpoint rows by service_id.
   * @return {Map<string, Array<Object>>}
   */
  getEndpointsByServiceId() {
    const endpointsByServiceId = new Map();
    for (const endpoint of this.tables.service_endpoints.values()) {
      const serviceId = this.resolveServiceId(endpoint);
      if (!serviceId) {
        continue;
      }
      if (!endpointsByServiceId.has(serviceId)) {
        endpointsByServiceId.set(serviceId, []);
      }
      endpointsByServiceId.get(serviceId).push(endpoint);
    }
    return endpointsByServiceId;
  }

  /**
   * Resolve desired replica count from definition fields.
   * @param {Object} definition
   * @return {number}
   */
  resolveReplicaCount(definition) {
    const raw = definition?.replica_count ?? definition?.replicaCount ?? 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }

  /**
   * Collect unique node IDs from endpoint rows.
   * @param {Array<Object>} endpoints
   * @return {Array<string>}
   */
  collectEndpointNodeIds(endpoints) {
    const uniqueNodeIds = new Set();
    for (const endpoint of endpoints) {
      const nodeId = this.resolveNodeId(endpoint);
      if (nodeId) {
        uniqueNodeIds.add(nodeId);
      }
    }
    return Array.from(uniqueNodeIds.values()).sort();
  }

  /**
   * Count endpoints in a healthy state.
   * @param {Array<Object>} endpoints
   * @return {number}
   */
  countHealthyEndpoints(endpoints) {
    return endpoints.reduce((count, endpoint) => {
      const status = this.resolveRuntimeStatus(null, endpoint);
      return HEALTHY_RUNTIME_STATUS.has(String(status).toLowerCase()) ?
        count + 1 :
        count;
    }, 0);
  }

  /**
   * Resolve logical-service health state from desired/observed counts.
   * @param {number} desiredReplicaCount
   * @param {number} observedReplicaCount
   * @param {number} healthyReplicaCount
   * @return {string}
   */
  resolveLogicalServiceStatus(
    desiredReplicaCount,
    observedReplicaCount,
    healthyReplicaCount,
  ) {
    if (desiredReplicaCount <= 0) {
      return observedReplicaCount === 0 ?
        LOGICAL_SERVICE_STATUS.UNKNOWN :
        LOGICAL_SERVICE_STATUS.HEALTHY;
    }
    if (healthyReplicaCount >= desiredReplicaCount) {
      return LOGICAL_SERVICE_STATUS.HEALTHY;
    }
    if (healthyReplicaCount === 0) {
      return LOGICAL_SERVICE_STATUS.DEGRADED;
    }
    return LOGICAL_SERVICE_STATUS.PARTIAL;
  }

  /**
   * Get a specific service by ID
   * @param {string} serviceId - The service ID
   * @return {Object|undefined} The service record or undefined
   */
  getService(serviceId) {
    return this.tables.services.get(serviceId);
  }

  /**
   * Get all tables (raw, without computed metadata)
   * Requirements: 13.2
   * @return {Array} Array of table records
   */
  getTables() {
    return Array.from(this.tables.tables.values());
  }

  /**
   * Get a specific table by ID
   * @param {string} tableId - The table ID
   * @return {Object|undefined} The table record or undefined
   */
  getTable(tableId) {
    return this.tables.tables.get(tableId);
  }

  /**
   * Get partitions with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with tableId
   * @return {Array} Array of partition records
   */
  getPartitions(filter = {}) {
    let partitions = Array.from(this.tables.partitions.values());
    if (filter.tableId) {
      partitions = partitions.filter((p) => p.table_id === filter.tableId);
    }
    return partitions;
  }

  /**
   * Get a specific partition by ID
   * @param {string} partitionId - The partition ID
   * @return {Object|undefined} The partition record or undefined
   */
  getPartition(partitionId) {
    return this.tables.partitions.get(partitionId);
  }

  /**
   * Get all message groups
   * Requirements: 13.2
   * @return {Array} Array of message group records
   */
  getMessageGroups() {
    return Array.from(this.tables.message_groups.values());
  }

  /**
   * Get a specific message group by ID
   * @param {string} groupId - The message group ID
   * @return {Object|undefined} The message group record or undefined
   */
  getMessageGroup(groupId) {
    return this.tables.message_groups.get(groupId);
  }

  /**
   * Get all indices
   * Requirements: 13.2
   * @return {Array} Array of index records
   */
  getIndices() {
    return Array.from(this.tables.indices.values());
  }

  /**
   * Get logs with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with level, nodeId, serviceId, startTime, endTime
   * @return {Array} Array of log records
   */
  getLogs(filter = {}) {
    let logs = Array.from(this.tables.logs.values());
    if (filter.level) {
      logs = logs.filter((l) => l.level === filter.level);
    }
    if (filter.nodeId) {
      logs = logs.filter((l) => l.node_id === filter.nodeId);
    }
    if (filter.serviceId) {
      logs = logs.filter((l) => l.service_id === filter.serviceId);
    }
    if (filter.startTime) {
      logs = logs.filter((l) => l.timestamp >= filter.startTime);
    }
    if (filter.endTime) {
      logs = logs.filter((l) => l.timestamp <= filter.endTime);
    }
    if (filter.messagePattern) {
      const pattern = new RegExp(filter.messagePattern, 'i');
      logs = logs.filter((l) => pattern.test(l.message || ''));
    }
    return logs;
  }

  /**
   * Get all config entries
   * Requirements: 13.2
   * @return {Array} Array of config records
   */
  getConfig() {
    return Array.from(this.tables.config.values());
  }

  /**
   * Get a specific config entry by key
   * @param {string} key - The config key
   * @return {Object|undefined} The config record or undefined
   */
  getConfigEntry(key) {
    return this.tables.config.get(key);
  }

  /**
   * Get contexts with optional filtering
   * Requirements: 13.2
   * @param {Object} filter - Optional filter with type and/or namePattern
   * @return {Array} Array of context records
   */
  getContexts(filter = {}) {
    let contexts = Array.from(this.tables.contexts.values());
    if (filter.type) {
      contexts = contexts.filter((c) => c.context_type === filter.type);
    }
    if (filter.namePattern) {
      const pattern = new RegExp(filter.namePattern, 'i');
      contexts = contexts.filter((c) => pattern.test(c.name || ''));
    }
    return contexts;
  }

  /**
   * Get a specific context by ID
   * @param {string} contextId - The context ID
   * @return {Object|undefined} The context record or undefined
   */
  getContext(contextId) {
    return this.tables.contexts.get(contextId);
  }

  /**
   * Get replica operations with optional filtering
   * Requirements: 4.4, 9.3
   * @param {Object} filter - Optional filter with status, type, partitionId, inFlightOnly
   * @return {Array} Array of operation records
   */
  getOperations(filter = {}) {
    let operations = Array.from(this.tables.replica_operations.values());

    if (filter.status) {
      operations = operations.filter((op) => op.status === filter.status);
    }
    if (filter.type) {
      operations = operations.filter((op) => op.type === filter.type);
    }
    if (filter.partitionId) {
      operations = operations.filter((op) => op.partition_id === filter.partitionId);
    }
    if (filter.targetNodeId) {
      operations = operations.filter((op) => op.target_node_id === filter.targetNodeId);
    }
    if (filter.inFlightOnly) {
      const terminalStatuses = ['active', 'removed', 'failed'];
      operations = operations.filter((op) => !terminalStatuses.includes(op.status));
    }

    // Sort by updated_at descending (most recent first)
    operations.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

    return operations;
  }

  /**
   * Get a specific operation by ID
   * @param {string} operationId - The operation ID
   * @return {Object|undefined} The operation record or undefined
   */
  getOperation(operationId) {
    return this.tables.replica_operations.get(operationId);
  }

  /**
   * Serialize the cache to JSON for persistence
   * Requirements: 13.7
   * @return {string} JSON string representation of the cache
   */
  serialize() {
    const data = {};
    for (const [name, map] of Object.entries(this.tables)) {
      data[name] = Array.from(map.values());
    }
    return JSON.stringify({data, lastUpdate: this.lastUpdate});
  }

  /**
   * Deserialize and load cache from JSON
   * Requirements: 13.7
   * @param {string} json - JSON string to deserialize
   */
  deserialize(json) {
    const {data, lastUpdate} = JSON.parse(json);
    this.loadFromDump(data);
    this.lastUpdate = lastUpdate;
  }

  /**
   * Clear all cached data
   */
  clear() {
    for (const map of Object.values(this.tables)) {
      map.clear();
    }
    this.lastUpdate = null;
    this.cdcLag = 0;
    this.affectedTableIds.clear();
  }

  /**
   * Get cache statistics
   * @return {Object} Statistics about the cache
   */
  getStats() {
    const stats = {
      lastUpdate: this.lastUpdate,
      cdcLag: this.cdcLag,
      tableCounts: {},
    };
    for (const [name, map] of Object.entries(this.tables)) {
      stats.tableCounts[name] = map.size;
    }
    return stats;
  }

  /**
   * Check if the cache has been initialized
   * @return {boolean} True if cache has data
   */
  isInitialized() {
    return this.lastUpdate !== null;
  }

  /**
   * Check if the cache is stale (CDC lag exceeds threshold)
   * Requirements: 13.5
   * @param {number} threshold - Staleness threshold in milliseconds
   * @return {boolean} True if cache is stale
   */
  isStale(threshold = 5000) {
    return this.cdcLag > threshold;
  }
}
