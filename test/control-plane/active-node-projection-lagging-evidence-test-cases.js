import {test} from '../../src/test-helpers/tap.js';
import {
  resolveCanonicalActiveNodeIds,
} from '../../src/control-plane/active-node-projection.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

export function registerActiveNodeProjectionLaggingEvidenceTests() {
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
  test('active-node projection tolerates transient stopped node rows when ready heartbeats remain fresh',
    async (t) => {
      const activeNodeIds = resolveCanonicalActiveNodeIds({
        nodeRows: [
          {
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 2000,
            last_heartbeat: 995,
          },
          {
            node_id: 'node-2',
            status: 'stopped',
            connection_state: 'ready',
            ready_lease_expires_at: 950,
            last_heartbeat: 995,
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
          {
            endpoint_id: 'node-2-ws',
            node_id: 'node-2',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-2:8082',
          },
        ],
        nowMs: 1000,
      });

      t.same(
        activeNodeIds,
        ['node-1', 'node-2'],
        'recent heartbeat evidence should keep a ready node active even when its status row transiently regresses to stopped',
      );
    });
  test('active-node projection excludes stopped nodes after heartbeat grace expires',
    async (t) => {
      const activeNodeIds = resolveCanonicalActiveNodeIds({
        nodeRows: [
          {
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 71000,
            last_heartbeat: 70995,
          },
          {
            node_id: 'node-2',
            status: 'stopped',
            connection_state: 'ready',
            ready_lease_expires_at: 1000,
            last_heartbeat: 1000,
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
          {
            endpoint_id: 'node-2-ws',
            node_id: 'node-2',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-2:8082',
          },
        ],
        nowMs: 70000,
      });

      t.same(
        activeNodeIds,
        ['node-1'],
        'heartbeat grace should not keep a stopped node active indefinitely once its liveness evidence has aged out',
      );
    });
  test('active-node projection excludes stopped nodes at the heartbeat grace boundary',
    async (t) => {
      const activeNodeIds = resolveCanonicalActiveNodeIds({
        nodeRows: [
          {
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 71000,
            last_heartbeat: 70995,
          },
          {
            node_id: 'node-2',
            status: 'stopped',
            connection_state: 'ready',
            ready_lease_expires_at: 1000,
            last_heartbeat: 1000,
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
          {
            endpoint_id: 'node-2-ws',
            node_id: 'node-2',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-2:8082',
          },
        ],
        nowMs: 61000,
      });

      t.same(
        activeNodeIds,
        ['node-1'],
        'heartbeat evidence at the exact grace cutoff should no longer keep a stopped node projected active',
      );
    });
}
