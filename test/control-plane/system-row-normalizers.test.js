import {test} from '../../src/test-helpers/tap.js';
import {
  canonicalizeSystemTableRow,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
} from '../../src/control-plane/system-row-normalizers.js';
import {TABLES} from '../../src/constants/index.js';

test('normalizeNodeRow canonicalizes snake_case and camelCase node metadata',
  (t) => {
    t.same(normalizeNodeRow({
      nodeId: 'node-b',
      status: 'ACTIVE',
      connectionState: 'CONNECTED',
    }), {
      nodeId: 'node-b',
      status: 'active',
      connectionState: 'connected',
    });
    t.end();
  });

test('normalizeServiceRow canonicalizes service identity and lifecycle fields',
  (t) => {
    t.same(normalizeServiceRow({
      serviceId: 'svc-1',
      serviceType: 'MESSAGE_GROUP',
      nodeId: 'node-a',
      partitionId: 'partition-1',
      groupId: 'group-1',
      replicaId: 'replica-1',
      raftRole: 'LEADER',
      status: 'ACTIVE',
      address: 'node-a/service/svc-1',
    }), {
      serviceId: 'svc-1',
      serviceType: 'message_group',
      nodeId: 'node-a',
      partitionId: 'partition-1',
      groupId: 'group-1',
      replicaId: 'replica-1',
      raftRole: 'leader',
      status: 'active',
      address: 'node-a/service/svc-1',
    });
    t.end();
  });

test('normalizeNodeEndpointRow canonicalizes endpoint transport fields',
  (t) => {
    t.same(normalizeNodeEndpointRow({
      node_id: 'node-c',
      transportType: 'WEBSOCKET',
      status: 'ACTIVE',
      address: 'ws://node-c',
    }), {
      nodeId: 'node-c',
      status: 'active',
      transportType: 'websocket',
      address: 'ws://node-c',
    });
    t.end();
  });

test('normalizeServiceEndpointRow canonicalizes endpoint health fields', (t) => {
  t.same(normalizeServiceEndpointRow({
    nodeId: 'node-d',
    service_id: 'sys-postgres-wire',
    healthStatus: 'HEALTHY',
    endpoint: 'tcp://node-d:5432',
  }), {
    nodeId: 'node-d',
    serviceId: 'sys-postgres-wire',
    healthStatus: 'healthy',
    endpoint: 'tcp://node-d:5432',
  });
  t.end();
});

// Regression: canonicalization must preserve the origin write HLC so the cache
// LWW compare and DELETE-tombstone fence reach control_plane_publications — the
// publication serializer's field whitelist previously dropped it silently,
// degrading the most convergence-critical table to wall-clock ordering.
test('canonicalizeSystemTableRow preserves updated_at_hlc for publications', (t) => {
  const canonical = canonicalizeSystemTableRow(TABLES.CONTROL_PLANE_PUBLICATIONS, {
    publication_id: 'pub-1',
    publication_epoch: 1,
    status: 'published',
    updated_at: 1000,
    updated_at_hlc: '1000.0.node-a',
  });
  t.equal(canonical.updated_at_hlc, '1000.0.node-a',
    'origin HLC survives the publication serializer whitelist');
  t.end();
});

test('canonicalizeSystemTableRow leaves non-publication rows (and their HLC) intact',
  (t) => {
    const row = {service_id: 'svc-1', updated_at_hlc: '2000.1.node-b'};
    t.same(canonicalizeSystemTableRow(TABLES.SERVICES, row), row,
      'non-publication rows pass through unchanged, carrying their HLC');
    t.end();
  });
