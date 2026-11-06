import {createMockPolicyService, createMockControlPlaneReadinessService} from './test-helpers.js';
/**
 * Shared world, transport and coordinator fixtures for UnifiedRebalancer.
 * Readiness ports are constructed by test-helpers.js from explicit world
 * and callback inputs. This module owns no second readiness implementation.
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {
  ENDPOINT_SYNC_HEALTH,
} from '../../src/runtime/endpoint-sync-constants.js';
import {FIXTURE_ENDPOINT_INCARNATION} from
  '../test-helpers/endpoint-incarnation-fixture.js';

// Initialize test environment
export function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}


// Create a mock system table cache
export function createMockCache(
  nodes = [],
  services = [],
  partitions = [],
  tables = [],
  replicaOperations = [],
  nodeEndpoints = [],
  serviceEndpoints = [],
) {
  const now = Date.now();
  // Registered nodes and the endpoints they publish share the node's boot
  // incarnation (the endpoint incarnation authority), unless a test says
  // otherwise.
  const normalizedNodes = nodes.map((node) => ({
    connection_state: Object.hasOwn(node, 'connection_state') ?
      node.connection_state : 'ready',
    ready_lease_expires_at: Object.hasOwn(node, 'ready_lease_expires_at') ?
      node.ready_lease_expires_at : now + 10000,
    boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
    ...node,
  }));
  nodeEndpoints = nodeEndpoints.map((row) =>
    ({boot_incarnation: FIXTURE_ENDPOINT_INCARNATION, ...row}));
  serviceEndpoints = serviceEndpoints.map((row) =>
    ({boot_incarnation: FIXTURE_ENDPOINT_INCARNATION, ...row}));
  const cache = {
    nodes: new Map(normalizedNodes.map((node) => [node.node_id, node])),
    services: new Map(services.map((s) => [s.service_id, s])),
    partitions: new Map(partitions.map((p) => [p.partition_id, p])),
    tables: new Map(tables.map((t) => [t.table_id, t])),
    message_groups: new Map(),
    replica_operations: new Map(replicaOperations.map((op) => [op.operation_id, op])),
    node_endpoints: new Map(nodeEndpoints.map((row, index) => [index, row])),
    service_endpoints:
      new Map(serviceEndpoints.map((row, index) => [index, row])),
  };

  const mockCache = {
    get: (tableName, key) => cache[tableName]?.get(key),
    filter: (tableName, predicate) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
    getAll: (tableName) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values());
    },
  };
  return mockCache;
}

// Create mock CDC integration service
export function createMockCdcService() {
  return {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };
}

// Create mock table policy service


// Create mock message router
export function createMockMessageRouter(
  connectionState = 'connected',
  connectedNodes = [],
) {
  return {
    getConnectionState: () => connectionState,
    getConnectedNodes: () => [...connectedNodes],
    deliver: async () => (buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'})),
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

// Endpoints published by a registered node at its boot incarnation.
export function createNodeEndpoint(nodeId) {
  return {
    node_id: nodeId,
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    status: ENDPOINT_STATUS.ACTIVE,
    boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
  };
}

export function createPostgresWireEndpoint(nodeId) {
  return {
    node_id: nodeId,
    service_id: META_SERVICE_ID.POSTGRES_WIRE,
    health_status: ENDPOINT_SYNC_HEALTH.HEALTHY,
    boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
  };
}

// Create mock rebalance coordinator
export function createMockCoordinator() {
  const storageAccountingService = {
    estimateReplicaBytes: () => 1,
  };
  const storageAdmissionService = {
    checkAdd: async () => ({decision: 'allow'}),
    checkReplace: async () => ({decision: 'allow'}),
  };
  return {
    getMoveSafetyError: () => null,
    createOperation: async (move) => ({
      operationId: 'op-' + Date.now(),
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      status: 'pending',
      workflowStep: 'pending',
    }),
    executeOperation: async () => ({success: true}),
    canStartAddOperation: async () => true,
    canStartRemoveOperation: async () => true,
    // getStats is called synchronously by UnifiedRebalancer.getStats()
    getStats: () => ({
      operationsCreated: 0,
      operationsCompleted: 0,
      operationsFailed: 0,
      operationsTimedOut: 0,
      inFlightOperations: 0,
      totalOperations: 0,
    }),
    storageAccountingService,
    storageAdmissionService,
  };
}

// Create mock readiness service backed by the same cache


export function createMockMembershipPublicationService(
  publishedActiveNodeIds = [],
  publicationEpoch = 1,
  options = {},
) {
  return {
    getLatestClusterPublicationSync() {
      return {
        status: 'PUBLISHED',
        publicationEpoch,
        publishedActiveNodeIds,
        ...(options && typeof options === 'object' ? options : {}),
      };
    },
  };
}

export {createMockPolicyService, createMockControlPlaneReadinessService};
