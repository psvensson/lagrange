import {test} from '../../src/test-helpers/tap.js';
import {
  buildReadinessByNodeId,
  resolveCanonicalActiveNodeIds,
} from '../../src/control-plane/active-node-projection.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

test('active-node projection requires readiness health and canonical websocket endpoints when available',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1'],
      'only readiness-healthy nodes with canonical websocket endpoints should project as active',
    );
  });

test('active-node projection falls back to ready-lease evidence when readiness owner is unavailable',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'connected',
          ready_lease_expires_at: 2000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 900,
        },
      ],
      nodeEndpointRows: [],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1'],
      'ready-lease fallback should exclude non-ready and expired nodes',
    );
  });

test('buildReadinessByNodeId normalizes node identifiers from readiness entries',
  async (t) => {
    const readinessByNodeId = buildReadinessByNodeId({
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {healthy: true}},
        {node_id: 'node-2', dimensions: {healthy: true}},
        {nodeId: '', dimensions: {healthy: true}},
      ],
    });

    t.same(
      Object.keys(readinessByNodeId).sort(),
      ['node-1', 'node-2'],
      'readiness map should index both camelCase and snake_case node identifiers',
    );
  });

test('active-node projection can retain a readiness-healthy node when the node row is missing but active service evidence remains',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
      ],
      serviceRows: [
        {
          service_id: 'svc-1',
          service_type: 'message_group',
          node_id: 'node-1',
          status: 'active',
        },
        {
          service_id: 'svc-2',
          service_type: 'message_group',
          node_id: 'node-2',
          status: 'active',
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1', 'node-2'],
      'healthy nodes with active service and endpoint evidence should remain visible even if the node row lags the cache',
    );
  });

test('active-node projection keeps readiness-healthy node rows when service evidence is present but node_endpoints lags',
  async (t) => {
    const activeNodeIds = resolveCanonicalActiveNodeIds({
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 2000,
        },
      ],
      serviceRows: [
        {
          service_id: 'svc-node-1',
          service_type: 'message_group',
          node_id: 'node-1',
          status: 'active',
          address: 'node-1/message-group/svc-node-1',
        },
        {
          service_id: 'svc-node-2',
          service_type: 'message_group',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/svc-node-2',
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
      ],
      nowMs: 1000,
    });

    t.same(
      activeNodeIds,
      ['node-1', 'node-2'],
      'healthy nodes with active service evidence should remain active even when endpoint coverage lags behind repaired discovery rows',
    );
  });
