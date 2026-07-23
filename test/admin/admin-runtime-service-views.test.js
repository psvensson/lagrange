/**
 * Tests for admin-runtime-service-views.
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  handleListRuntimeServiceReplicas,
  groupReplicasByLogicalService,
  formatReplicaRow,
  formatEndpointUri,
  resolveLogicalServiceHealth,
  isBuiltInRuntimeService,
  countHealthyReplicas,
  collectUniqueNodes,
} from '../../src/admin/admin-runtime-service-views.js';
import {
  LOGICAL_SERVICE_HEALTH,
  VIEW_ROW_KIND,
  PROTOCOL_URI_SCHEME,
  BUILT_IN_RUNTIME_SERVICE_IDS,
} from '../../src/admin/admin-runtime-service-view-constants.js';
import {META_SERVICE_ID, TABLES} from '../../src/constants/index.js';
import {
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_HEALTH_STATUS,
} from '../../src/wasm-service/wasm-service-constants.js';
import {EP_COL} from '../../src/wasm-service/service-endpoint-builder.js';

// --- Mock data helpers ---

function createEndpoint(overrides = {}) {
  return {
    [EP_COL.ENDPOINT_ID]: 'ep-1',
    [EP_COL.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
    [EP_COL.NODE_ID]: 'node-1',
    [EP_COL.PROTOCOL]: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    [EP_COL.ADDRESS]: '127.0.0.1',
    [EP_COL.PORT]: 5432,
    [EP_COL.HEALTH_STATUS]: WASM_SERVICE_HEALTH_STATUS.HEALTHY,
    [EP_COL.METADATA]: '{}',
    ...overrides,
  };
}

function createDefinition(overrides = {}) {
  return {
    service_id: META_SERVICE_ID.POSTGRES_WIRE,
    service_name: 'PostgreSQL Wire',
    runtime_kind: 'native_js',
    replica_count: 3,
    ...overrides,
  };
}

describe('admin-runtime-service-views', () => {
  describe('handleListRuntimeServiceReplicas', () => {
    it('returns unfiltered SQL with no params', () => {
      const result = handleListRuntimeServiceReplicas({});
      assert.equal(result.success, true);
      assert.ok(result.sql.includes(TABLES.SERVICE_ENDPOINTS));
      assert.ok(!result.sql.includes('WHERE'));
      assert.deepEqual(result.params, []);
    });

    it('filters by serviceId', () => {
      const result = handleListRuntimeServiceReplicas({
        serviceId: META_SERVICE_ID.POSTGRES_WIRE,
      });
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('WHERE'));
      assert.ok(result.sql.includes(EP_COL.SERVICE_ID));
      assert.deepEqual(result.params, [META_SERVICE_ID.POSTGRES_WIRE]);
    });

    it('filters by nodeId', () => {
      const result = handleListRuntimeServiceReplicas({
        nodeId: 'node-1',
      });
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('WHERE'));
      assert.ok(result.sql.includes(EP_COL.NODE_ID));
      assert.deepEqual(result.params, ['node-1']);
    });

    it('combines serviceId and nodeId filters', () => {
      const result = handleListRuntimeServiceReplicas({
        serviceId: META_SERVICE_ID.ADMIN_META,
        nodeId: 'node-2',
      });
      assert.equal(result.success, true);
      assert.ok(result.sql.includes('AND'));
      assert.deepEqual(
        result.params,
        [META_SERVICE_ID.ADMIN_META, 'node-2'],
      );
    });

    it('handles null params gracefully', () => {
      const result = handleListRuntimeServiceReplicas(null);
      assert.equal(result.success, true);
      assert.ok(!result.sql.includes('WHERE'));
      assert.deepEqual(result.params, []);
    });
  });

  describe('groupReplicasByLogicalService', () => {
    it('groups endpoints under their logical service', () => {
      const endpoints = [
        createEndpoint({
          [EP_COL.ENDPOINT_ID]: 'ep-1',
          [EP_COL.NODE_ID]: 'node-1',
        }),
        createEndpoint({
          [EP_COL.ENDPOINT_ID]: 'ep-2',
          [EP_COL.NODE_ID]: 'node-2',
        }),
      ];
      const definitions = [createDefinition()];

      const groups = groupReplicasByLogicalService(
        endpoints, definitions,
      );

      assert.equal(groups.length, 1);
      assert.equal(
        groups[0].service_id,
        META_SERVICE_ID.POSTGRES_WIRE,
      );
      assert.equal(groups[0].observed_replica_count, 2);
      assert.equal(groups[0].replicas.length, 2);
      assert.equal(
        groups[0].row_kind,
        VIEW_ROW_KIND.LOGICAL_SERVICE,
      );
    });

    it('groups multiple services separately', () => {
      const endpoints = [
        createEndpoint({
          [EP_COL.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [EP_COL.ENDPOINT_ID]: 'pg-ep-1',
        }),
        createEndpoint({
          [EP_COL.SERVICE_ID]: META_SERVICE_ID.ADMIN_META,
          [EP_COL.ENDPOINT_ID]: 'admin-ep-1',
        }),
        createEndpoint({
          [EP_COL.SERVICE_ID]: META_SERVICE_ID.WASM_META,
          [EP_COL.ENDPOINT_ID]: 'wasm-ep-1',
        }),
      ];
      const definitions = [
        createDefinition({
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
        }),
        createDefinition({
          service_id: META_SERVICE_ID.ADMIN_META,
          service_name: 'Admin Meta',
        }),
        createDefinition({
          service_id: META_SERVICE_ID.WASM_META,
          service_name: 'WASM Meta',
        }),
      ];

      const groups = groupReplicasByLogicalService(
        endpoints, definitions,
      );

      assert.equal(groups.length, 3);
      const ids = groups.map((g) => g.service_id);
      assert.ok(ids.includes(META_SERVICE_ID.POSTGRES_WIRE));
      assert.ok(ids.includes(META_SERVICE_ID.ADMIN_META));
      assert.ok(ids.includes(META_SERVICE_ID.WASM_META));
    });

    it('includes health summary per logical service', () => {
      const endpoints = [
        createEndpoint({
          [EP_COL.HEALTH_STATUS]:
            WASM_SERVICE_HEALTH_STATUS.HEALTHY,
        }),
        createEndpoint({
          [EP_COL.ENDPOINT_ID]: 'ep-2',
          [EP_COL.NODE_ID]: 'node-2',
          [EP_COL.HEALTH_STATUS]:
            WASM_SERVICE_HEALTH_STATUS.UNHEALTHY,
        }),
      ];
      const definitions = [createDefinition({replica_count: 3})];

      const groups = groupReplicasByLogicalService(
        endpoints, definitions,
      );

      assert.equal(groups[0].healthy_replica_count, 1);
      assert.equal(groups[0].health, LOGICAL_SERVICE_HEALTH.PARTIAL);
    });

    it('reports the system-policy target for Binding-derived Cells', () => {
      const serviceId = `binding-service-${'a'.repeat(64)}`;
      const endpoints = [createEndpoint({
        [EP_COL.SERVICE_ID]: serviceId,
      })];
      const definitions = [createDefinition({
        service_id: serviceId,
        replica_count: 0,
        binding_version_id: `binding-version-${'b'.repeat(64)}`,
      })];

      const groups = groupReplicasByLogicalService(endpoints, definitions);

      assert.equal(groups[0].desired_replica_count, 3);
      assert.equal(groups[0].observed_replica_count, 1);
      assert.equal(groups[0].health, LOGICAL_SERVICE_HEALTH.PARTIAL);
    });

    it('collects unique nodes per group', () => {
      const endpoints = [
        createEndpoint({
          [EP_COL.ENDPOINT_ID]: 'ep-1',
          [EP_COL.NODE_ID]: 'node-1',
        }),
        createEndpoint({
          [EP_COL.ENDPOINT_ID]: 'ep-2',
          [EP_COL.NODE_ID]: 'node-2',
        }),
        createEndpoint({
          [EP_COL.ENDPOINT_ID]: 'ep-3',
          [EP_COL.NODE_ID]: 'node-1',
        }),
      ];
      const definitions = [createDefinition()];

      const groups = groupReplicasByLogicalService(
        endpoints, definitions,
      );

      assert.deepEqual(groups[0].nodes, ['node-1', 'node-2']);
    });

    it('skips endpoints with no service_id', () => {
      const endpoints = [
        createEndpoint({[EP_COL.SERVICE_ID]: null}),
      ];
      const definitions = [];

      const groups = groupReplicasByLogicalService(
        endpoints, definitions,
      );

      assert.equal(groups.length, 0);
    });

    it('handles empty inputs', () => {
      const groups = groupReplicasByLogicalService([], []);
      assert.equal(groups.length, 0);
    });
  });

  describe('formatReplicaRow', () => {
    it('formats PG wire endpoint with protocol URI', () => {
      const ep = createEndpoint();
      const row = formatReplicaRow(ep);

      assert.equal(row.row_kind, VIEW_ROW_KIND.REPLICA);
      assert.equal(row.protocol, WASM_SERVICE_PROTOCOL.POSTGRESQL);
      assert.equal(row.address, '127.0.0.1');
      assert.equal(row.port, 5432);
      assert.equal(
        row.health_status,
        WASM_SERVICE_HEALTH_STATUS.HEALTHY,
      );
      assert.equal(
        row.endpoint_uri,
        'postgresql://127.0.0.1:5432',
      );
    });

    it('formats websocket endpoint with ws:// URI', () => {
      const ep = createEndpoint({
        [EP_COL.PROTOCOL]: WASM_SERVICE_PROTOCOL.WEBSOCKET,
        [EP_COL.PORT]: 8081,
      });
      const row = formatReplicaRow(ep);

      assert.equal(row.protocol, WASM_SERVICE_PROTOCOL.WEBSOCKET);
      assert.equal(row.endpoint_uri, 'ws://127.0.0.1:8081');
    });

    it('includes node_id and service_id', () => {
      const ep = createEndpoint({
        [EP_COL.NODE_ID]: 'node-42',
        [EP_COL.SERVICE_ID]: META_SERVICE_ID.ADMIN_META,
      });
      const row = formatReplicaRow(ep);

      assert.equal(row.node_id, 'node-42');
      assert.equal(row.service_id, META_SERVICE_ID.ADMIN_META);
    });

    it('uses defaults for missing fields', () => {
      const row = formatReplicaRow({});

      assert.equal(row.row_kind, VIEW_ROW_KIND.REPLICA);
      assert.equal(row.protocol, WASM_SERVICE_PROTOCOL.WEBSOCKET);
      assert.equal(row.address, 'unknown');
      assert.equal(row.port, 'unknown');
    });
  });

  describe('formatEndpointUri', () => {
    it('formats postgresql protocol URI', () => {
      const uri = formatEndpointUri(
        WASM_SERVICE_PROTOCOL.POSTGRESQL, '10.0.0.1', 5432,
      );
      assert.equal(uri, 'postgresql://10.0.0.1:5432');
    });

    it('formats websocket protocol URI', () => {
      const uri = formatEndpointUri(
        WASM_SERVICE_PROTOCOL.WEBSOCKET, 'localhost', 8080,
      );
      assert.equal(uri, 'ws://localhost:8080');
    });

    it('defaults unknown protocols to ws://', () => {
      const uri = formatEndpointUri('grpc', '10.0.0.1', 9090);
      assert.equal(uri, 'ws://10.0.0.1:9090');
    });
  });

  describe('resolveLogicalServiceHealth', () => {
    it('returns healthy when healthy >= desired', () => {
      assert.equal(
        resolveLogicalServiceHealth(3, 3, 3),
        LOGICAL_SERVICE_HEALTH.HEALTHY,
      );
    });

    it('returns partial when some healthy but below desired', () => {
      assert.equal(
        resolveLogicalServiceHealth(3, 3, 2),
        LOGICAL_SERVICE_HEALTH.PARTIAL,
      );
    });

    it('returns degraded when zero healthy', () => {
      assert.equal(
        resolveLogicalServiceHealth(3, 3, 0),
        LOGICAL_SERVICE_HEALTH.DEGRADED,
      );
    });

    it('returns unknown when desired is zero and none observed', () => {
      assert.equal(
        resolveLogicalServiceHealth(0, 0, 0),
        LOGICAL_SERVICE_HEALTH.UNKNOWN,
      );
    });

    it('returns healthy when desired is zero but some observed', () => {
      assert.equal(
        resolveLogicalServiceHealth(0, 2, 2),
        LOGICAL_SERVICE_HEALTH.HEALTHY,
      );
    });
  });

  describe('isBuiltInRuntimeService', () => {
    it('recognizes sys-postgres-wire', () => {
      assert.equal(
        isBuiltInRuntimeService(META_SERVICE_ID.POSTGRES_WIRE),
        true,
      );
    });

    it('recognizes sys-admin-meta', () => {
      assert.equal(
        isBuiltInRuntimeService(META_SERVICE_ID.ADMIN_META),
        true,
      );
    });

    it('recognizes sys-wasm-meta', () => {
      assert.equal(
        isBuiltInRuntimeService(META_SERVICE_ID.WASM_META),
        true,
      );
    });

    it('rejects unknown service IDs', () => {
      assert.equal(isBuiltInRuntimeService('my-custom-svc'), false);
    });
  });

  describe('countHealthyReplicas', () => {
    it('counts healthy endpoints', () => {
      const endpoints = [
        createEndpoint({
          [EP_COL.HEALTH_STATUS]:
            WASM_SERVICE_HEALTH_STATUS.HEALTHY,
        }),
        createEndpoint({
          [EP_COL.HEALTH_STATUS]:
            WASM_SERVICE_HEALTH_STATUS.UNHEALTHY,
        }),
        createEndpoint({
          [EP_COL.HEALTH_STATUS]:
            WASM_SERVICE_HEALTH_STATUS.HEALTHY,
        }),
      ];
      assert.equal(countHealthyReplicas(endpoints), 2);
    });

    it('returns zero for empty array', () => {
      assert.equal(countHealthyReplicas([]), 0);
    });
  });

  describe('collectUniqueNodes', () => {
    it('returns sorted unique node IDs', () => {
      const endpoints = [
        createEndpoint({[EP_COL.NODE_ID]: 'node-b'}),
        createEndpoint({[EP_COL.NODE_ID]: 'node-a'}),
        createEndpoint({[EP_COL.NODE_ID]: 'node-b'}),
      ];
      assert.deepEqual(
        collectUniqueNodes(endpoints),
        ['node-a', 'node-b'],
      );
    });

    it('returns empty array for empty input', () => {
      assert.deepEqual(collectUniqueNodes([]), []);
    });
  });

  describe('BUILT_IN_RUNTIME_SERVICE_IDS', () => {
    it('includes all three built-in services', () => {
      assert.equal(BUILT_IN_RUNTIME_SERVICE_IDS.length, 3);
      assert.ok(
        BUILT_IN_RUNTIME_SERVICE_IDS.includes(
          META_SERVICE_ID.POSTGRES_WIRE,
        ),
      );
      assert.ok(
        BUILT_IN_RUNTIME_SERVICE_IDS.includes(
          META_SERVICE_ID.ADMIN_META,
        ),
      );
      assert.ok(
        BUILT_IN_RUNTIME_SERVICE_IDS.includes(
          META_SERVICE_ID.WASM_META,
        ),
      );
    });

    it('is frozen', () => {
      assert.ok(Object.isFrozen(BUILT_IN_RUNTIME_SERVICE_IDS));
    });
  });

  describe('VIEW_ROW_KIND', () => {
    it('distinguishes logical services from replicas', () => {
      assert.notEqual(
        VIEW_ROW_KIND.LOGICAL_SERVICE,
        VIEW_ROW_KIND.REPLICA,
      );
    });
  });

  describe('PROTOCOL_URI_SCHEME', () => {
    it('has postgresql scheme', () => {
      assert.equal(
        PROTOCOL_URI_SCHEME.POSTGRESQL,
        'postgresql://',
      );
    });

    it('has websocket scheme', () => {
      assert.equal(PROTOCOL_URI_SCHEME.WEBSOCKET, 'ws://');
    });
  });
});
