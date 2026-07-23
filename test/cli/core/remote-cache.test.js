import {test} from '../../../src/test-helpers/tap.js';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

test('RemoteCache - constructor initializes empty tables', async (t) => {
  const cache = new RemoteCache();

  t.ok(cache.tables.nodes instanceof Map, 'nodes is a Map');
  t.ok(cache.tables.services instanceof Map, 'services is a Map');
  t.ok(cache.tables.partitions instanceof Map, 'partitions is a Map');
  t.ok(cache.tables.tables instanceof Map, 'tables is a Map');
  t.ok(cache.tables.message_groups instanceof Map, 'message_groups is a Map');
  t.ok(cache.tables.indices instanceof Map, 'indices is a Map');
  t.ok(cache.tables.logs instanceof Map, 'logs is a Map');
  t.ok(cache.tables.config instanceof Map, 'config is a Map');
  t.ok(cache.tables.contexts instanceof Map, 'contexts is a Map');
  t.ok(cache.tables.service_definitions instanceof Map,
    'service_definitions is a Map');
  t.ok(cache.tables.service_endpoints instanceof Map,
    'service_endpoints is a Map');
  t.equal(cache.lastUpdate, null, 'lastUpdate is null');
  t.equal(cache.cdcLag, 0, 'cdcLag is 0');
});

test('RemoteCache - loadFromDump initializes cache from dump', async (t) => {
  const cache = new RemoteCache();
  const dump = {
    nodes: [
      {node_id: 'node-1', node_address: '127.0.0.1:8080', status: 'active'},
      {node_id: 'node-2', node_address: '127.0.0.1:8081', status: 'active'},
    ],
    services: [
      {service_id: 'svc-1', node_id: 'node-1', service_type: 'partition'},
    ],
    partitions: [],
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
  };

  cache.loadFromDump(dump);

  t.equal(cache.getNodes().length, 2, 'loaded 2 nodes');
  t.equal(cache.getServices().length, 1, 'loaded 1 service');
  t.equal(cache.getTables().length, 1, 'loaded 1 table');
  t.ok(cache.lastUpdate !== null, 'lastUpdate is set');
});

test('RemoteCache - applyCDCEvent INSERT adds record', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  const result = cache.applyCDCEvent({
    table: 'nodes',
    operation: 'INSERT',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'active'},
    timestamp: Date.now(),
  });

  t.equal(result.applied, true, 'event was applied');
  t.equal(cache.getNodes().length, 1, 'node was added');
  t.equal(cache.getNode('node-1').status, 'active', 'node has correct status');
});

test('RemoteCache - applyCDCEvent UPDATE modifies record', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'node-1', status: 'active'}],
  });

  cache.applyCDCEvent({
    table: 'nodes',
    operation: 'UPDATE',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'failed'},
    timestamp: Date.now(),
  });

  t.equal(cache.getNode('node-1').status, 'failed', 'node status was updated');
});

test('RemoteCache - applyCDCEvent DELETE removes record', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'node-1', status: 'active'}],
  });

  cache.applyCDCEvent({
    table: 'nodes',
    operation: 'DELETE',
    key: 'node-1',
    timestamp: Date.now(),
  });

  t.equal(cache.getNodes().length, 0, 'node was removed');
  t.equal(cache.getNode('node-1'), undefined, 'node is undefined');
});

test('RemoteCache - getServices filters by nodeId', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    services: [
      {service_id: 'svc-1', node_id: 'node-1', service_type: 'partition'},
      {service_id: 'svc-2', node_id: 'node-2', service_type: 'partition'},
      {service_id: 'svc-3', node_id: 'node-1', service_type: 'message_group'},
    ],
  });

  const filtered = cache.getServices({nodeId: 'node-1'});
  t.equal(filtered.length, 2, 'filtered to 2 services');
  t.ok(filtered.every((s) => s.node_id === 'node-1'), 'all have node-1');
});

test('RemoteCache - getServices filters by type', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    services: [
      {service_id: 'svc-1', node_id: 'node-1', service_type: 'partition'},
      {service_id: 'svc-2', node_id: 'node-2', service_type: 'partition'},
      {service_id: 'svc-3', node_id: 'node-1', service_type: 'message_group'},
    ],
  });

  const filtered = cache.getServices({type: 'partition'});
  t.equal(filtered.length, 2, 'filtered to 2 services');
  t.ok(filtered.every((s) => s.service_type === 'partition'), 'all partitions');
});

test('RemoteCache - getServices includes runtime services from definitions/endpoints',
  async (t) => {
    const cache = new RemoteCache();
    cache.loadFromDump({
      nodes: [
        {node_id: 'node-1', node_address: '127.0.0.1:8080'},
      ],
      services: [
        {service_id: 'svc-1', node_id: 'node-1', service_type: 'partition'},
      ],
      service_definitions: [
        {
          service_id: 'sys-wasm-meta',
          service_name: 'sys-wasm-meta',
          service_profile: 'default',
          runtime_kind: 'native_js',
          runtime_ref: 'builtin://sys-wasm-meta',
          status: 'active',
        },
      ],
      service_endpoints: [
        {
          endpoint_id: 'endpoint-1',
          service_id: 'sys-wasm-meta',
          node_id: 'node-1',
          address: '127.0.0.1',
          port: 7091,
          health_status: 'healthy',
        },
      ],
    });

    const runtimeServices = cache.getServices().filter((service) => {
      return service.service_type === 'runtime_service';
    });

    t.equal(runtimeServices.length, 1, 'includes one runtime service row');
    t.equal(runtimeServices[0].service_id, 'sys-wasm-meta',
      'runtime service uses logical service id');
    t.equal(runtimeServices[0].endpoint_id, 'endpoint-1',
      'runtime service row contains endpoint id');
    t.equal(runtimeServices[0].status, 'healthy',
      'runtime service row uses endpoint health status');
    t.equal(runtimeServices[0].node_address, '127.0.0.1:8080',
      'runtime service row is enriched with node address');
  });

test('RemoteCache - runtime services support legacy id/camelCase payload fields',
  async (t) => {
    const cache = new RemoteCache();
    cache.loadFromDump({
      nodes: [
        {id: 'node-1', address: '127.0.0.1:8080'},
      ],
      service_definitions: [
        {
          id: 'sys-admin-meta',
          serviceName: 'sys-admin-meta',
          runtimeKind: 'native_js',
          status: 'active',
        },
      ],
      service_endpoints: [
        {
          id: 'endpoint-1',
          serviceId: 'sys-admin-meta',
          nodeId: 'node-1',
          address: '127.0.0.1',
          port: 7090,
          healthStatus: 'healthy',
        },
      ],
    });

    const runtimeServices = cache.getServices().filter((service) => {
      return service.service_type === 'runtime_service';
    });

    t.equal(runtimeServices.length, 1, 'includes one runtime replica row');
    t.equal(runtimeServices[0].service_id, 'sys-admin-meta',
      'runtime row resolves service ID from legacy fields');
    t.equal(runtimeServices[0].endpoint_id, 'endpoint-1',
      'runtime row resolves endpoint ID from legacy fields');
    t.equal(runtimeServices[0].node_id, 'node-1',
      'runtime row resolves node ID from legacy fields');
    t.equal(runtimeServices[0].status, 'healthy',
      'runtime row prefers endpoint health status');
    t.equal(runtimeServices[0].node_address, '127.0.0.1:8080',
      'runtime row resolves node address from legacy node field');
  });

test('RemoteCache - node filter excludes runtime definitions without endpoints',
  async (t) => {
    const cache = new RemoteCache();
    cache.loadFromDump({
      services: [
        {service_id: 'svc-1', node_id: 'node-1', service_type: 'partition'},
      ],
      service_definitions: [
        {
          service_id: 'sys-admin-meta',
          service_name: 'sys-admin-meta',
          runtime_kind: 'native_js',
          status: 'active',
        },
      ],
    });

    const filtered = cache.getServices({nodeId: 'node-1'});
    const runtimeRows = filtered.filter((service) => {
      return service.service_type === 'runtime_service';
    });
    t.equal(runtimeRows.length, 0,
      'runtime definitions without endpoints are not materialized as replicas');
  });

test('RemoteCache - getLogicalServices aggregates definitions and endpoints',
  async (t) => {
    const cache = new RemoteCache();
    cache.loadFromDump({
      service_definitions: [
        {
          service_id: 'sys-admin-meta',
          service_name: 'sys-admin-meta',
          runtime_kind: 'native_js',
          runtime_ref: 'builtin://sys-admin-meta',
          replica_count: 2,
        },
      ],
      service_endpoints: [
        {
          endpoint_id: 'admin-ep-node-1',
          service_id: 'sys-admin-meta',
          node_id: 'node-1',
          address: '127.0.0.1',
          port: 7091,
          health_status: 'healthy',
        },
        {
          endpoint_id: 'admin-ep-node-2',
          service_id: 'sys-admin-meta',
          node_id: 'node-2',
          address: '127.0.0.2',
          port: 7091,
          health_status: 'healthy',
        },
      ],
    });

    const logicalServices = cache.getLogicalServices();
    t.equal(logicalServices.length, 1, 'returns one logical service');
    t.equal(logicalServices[0].service_id, 'sys-admin-meta',
      'returns expected service_id');
    t.equal(logicalServices[0].replica_count, 2,
      'includes desired replica count from definition');
    t.equal(logicalServices[0].replica_count_observed, 2,
      'includes observed replica count from endpoints');
    t.equal(logicalServices[0].healthy_replica_count, 2,
      'includes healthy replica count from endpoints');
    t.equal(logicalServices[0].status, 'healthy',
      'marks service healthy when desired replicas are healthy');
  });

test('RemoteCache - reports system-policy targets for Binding Cells',
  async (t) => {
    const cache = new RemoteCache();
    const serviceId = `binding-service-${'a'.repeat(64)}`;
    cache.loadFromDump({
      service_definitions: [{
        service_id: serviceId,
        service_name: 'orders-api',
        runtime_kind: 'wasm_component',
        replica_count: 0,
        binding_version_id: `binding-version-${'b'.repeat(64)}`,
      }],
      service_endpoints: [{
        endpoint_id: 'orders-api-node-1',
        service_id: serviceId,
        node_id: 'node-1',
        health_status: 'healthy',
      }],
    });

    const [service] = cache.getLogicalServices();
    t.equal(service.replica_count, 3,
      'desired count is the runtime-service policy output');
    t.equal(service.replica_count_observed, 1);
    t.equal(service.status, 'partial');
  });

test('RemoteCache - getLogicalServices supports nodeId filter', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    service_definitions: [
      {service_id: 'svc-a', service_name: 'svc-a', replica_count: 1},
      {service_id: 'svc-b', service_name: 'svc-b', replica_count: 1},
    ],
    service_endpoints: [
      {endpoint_id: 'a-1', service_id: 'svc-a', node_id: 'node-1', health_status: 'healthy'},
      {endpoint_id: 'b-1', service_id: 'svc-b', node_id: 'node-2', health_status: 'healthy'},
    ],
  });

  const nodeOneServices = cache.getLogicalServices({nodeId: 'node-1'});
  t.equal(nodeOneServices.length, 1,
    'filters logical services to those hosted on selected node');
  t.equal(nodeOneServices[0].service_id, 'svc-a',
    'returns logical service hosted on node-1');
});

test('RemoteCache - getPartitions filters by tableId', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1'},
      {partition_id: 'p-2', table_id: 'tbl-1'},
      {partition_id: 'p-3', table_id: 'tbl-2'},
    ],
  });

  const filtered = cache.getPartitions({tableId: 'tbl-1'});
  t.equal(filtered.length, 2, 'filtered to 2 partitions');
  t.ok(filtered.every((p) => p.table_id === 'tbl-1'), 'all for tbl-1');
});

test('RemoteCache - getLogs filters by multiple criteria', async (t) => {
  const now = Date.now();
  const cache = new RemoteCache();
  cache.loadFromDump({
    logs: [
      {log_id: 'l-1', level: 'ERROR', node_id: 'n-1', timestamp: now - 1000},
      {log_id: 'l-2', level: 'INFO', node_id: 'n-1', timestamp: now - 500},
      {log_id: 'l-3', level: 'ERROR', node_id: 'n-2', timestamp: now - 200},
    ],
  });

  const byLevel = cache.getLogs({level: 'ERROR'});
  t.equal(byLevel.length, 2, 'filtered by level');

  const byNode = cache.getLogs({nodeId: 'n-1'});
  t.equal(byNode.length, 2, 'filtered by nodeId');

  const byTime = cache.getLogs({startTime: now - 600});
  t.equal(byTime.length, 2, 'filtered by startTime');
});

test('RemoteCache - getContexts filters by type and namePattern', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    contexts: [
      {context_id: 'c-1', context_type: 'function', name: 'myFunc'},
      {context_id: 'c-2', context_type: 'trigger', name: 'myTrigger'},
      {context_id: 'c-3', context_type: 'function', name: 'otherFunc'},
    ],
  });

  const byType = cache.getContexts({type: 'function'});
  t.equal(byType.length, 2, 'filtered by type');

  const byPattern = cache.getContexts({namePattern: 'my'});
  t.equal(byPattern.length, 2, 'filtered by namePattern');
});

test('RemoteCache - serialize and deserialize round-trip', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'node-1', status: 'active'}],
    services: [{service_id: 'svc-1', node_id: 'node-1'}],
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
  });

  const serialized = cache.serialize();
  const newCache = new RemoteCache();
  newCache.deserialize(serialized);

  t.equal(newCache.getNodes().length, 1, 'nodes restored');
  t.equal(newCache.getServices().length, 1, 'services restored');
  t.equal(newCache.getTables().length, 1, 'tables restored');
  t.equal(newCache.getNode('node-1').status, 'active', 'node data correct');
});

test('RemoteCache - clear removes all data', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'node-1'}],
    services: [{service_id: 'svc-1'}],
  });

  cache.clear();

  t.equal(cache.getNodes().length, 0, 'nodes cleared');
  t.equal(cache.getServices().length, 0, 'services cleared');
  t.equal(cache.lastUpdate, null, 'lastUpdate cleared');
});

test('RemoteCache - getStats returns cache statistics', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'n-1'}, {node_id: 'n-2'}],
    services: [{service_id: 's-1'}],
  });

  const stats = cache.getStats();

  t.ok(stats.lastUpdate !== null, 'lastUpdate is set');
  t.equal(stats.tableCounts.nodes, 2, 'nodes count is 2');
  t.equal(stats.tableCounts.services, 1, 'services count is 1');
});

test('RemoteCache - isInitialized returns correct state', async (t) => {
  const cache = new RemoteCache();
  t.equal(cache.isInitialized(), false, 'not initialized initially');

  cache.loadFromDump({nodes: []});
  t.equal(cache.isInitialized(), true, 'initialized after loadFromDump');
});

test('RemoteCache - isStale checks CDC lag', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  cache.cdcLag = 1000;
  t.equal(cache.isStale(5000), false, 'not stale with low lag');

  cache.cdcLag = 10000;
  t.equal(cache.isStale(5000), true, 'stale with high lag');
});

test('RemoteCache - applyCDCEvent handles unknown table', async (t) => {
  const cache = new RemoteCache();

  const result = cache.applyCDCEvent({
    table: 'unknown_table',
    operation: 'INSERT',
    key: 'key-1',
    data: {id: 'key-1'},
  });

  t.equal(result.applied, false, 'event was not applied');
});

test('RemoteCache - applyCDCEvent handles unknown operation', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  const result = cache.applyCDCEvent({
    table: 'nodes',
    operation: 'UNKNOWN',
    key: 'node-1',
    data: {node_id: 'node-1'},
  });

  t.equal(result.applied, false, 'event was not applied');
});
