import {createSystemTableCacheFixture} from './system-table-cache-fixture.js';
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
  return createSystemTableCacheFixture({
    nodes: normalizedNodes,
    services,
    partitions,
    tables,
    replica_operations: replicaOperations,
    node_endpoints: nodeEndpoints,
    service_endpoints: serviceEndpoints,
  });
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
    endpoint_id: `${nodeId}-ws`,
    node_id: nodeId,
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    status: ENDPOINT_STATUS.ACTIVE,
    boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
  };
}

export function createPostgresWireEndpoint(nodeId) {
  return {
    endpoint_id: `${nodeId}-postgres-wire`,
    node_id: nodeId,
    service_id: META_SERVICE_ID.POSTGRES_WIRE,
    health_status: ENDPOINT_SYNC_HEALTH.HEALTHY,
    boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
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
