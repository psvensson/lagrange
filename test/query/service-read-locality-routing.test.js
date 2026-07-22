/**
 * Guard tests for the per-service readLocality policy
 * (quest: service-read-locality-policy).
 *
 * Proves the end-to-end wiring of service_definitions.read_locality:
 *  1. The column is a durable service-definition field with default 'any'
 *     (serialize/deserialize round-trip, schema spec, column list).
 *  2. The query engine resolves the issuing service's policy from the
 *     node-local system cache (resolveIssuingServiceReadLocality).
 *  3. executeSelect threads the resolved preference into the query
 *     executor options (the wiring that un-dormants locality routing).
 *  4. Read routing candidate ordering honors the preference: local node
 *     first, then same-latency-group replicas, then the rest — and is
 *     UNCHANGED when the policy is off.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  SERVICE_READ_LOCALITY,
  TABLES,
} from '../../src/constants/index.js';
import {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
  serializeServiceDefinition,
  deserializeServiceDefinition,
} from '../../src/wasm-service/wasm-service-models.js';
import {
  SERVICE_DEFINITIONS_SCHEMA,
} from '../../src/bootstrap/system-table-runtime-schema-definitions.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from './sql-query-engine-test-support.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const SVC_ID = 'svc-read-local';

function definitionRow(readLocality) {
  return {
    [SD_COL.SERVICE_ID]: SVC_ID,
    [SD_COL.READ_LOCALITY]: readLocality,
  };
}

function cacheWithServiceDefinitions(baseCache, definitions) {
  const byId = new Map(definitions.map(
    (row) => [row[SD_COL.SERVICE_ID], row],
  ));
  const baseGet = baseCache.get.bind(baseCache);
  baseCache.get = function(type, key) {
    if (type === TABLES.SERVICE_DEFINITIONS) {
      return byId.get(key) || null;
    }
    return baseGet(type, key);
  };
  return baseCache;
}

test('service_definitions carries read_locality: default, round-trip, ' +
  'schema', (t) => {
  t.ok(
    SERVICE_DEFINITION_COLUMN_LIST.includes(SD_COL.READ_LOCALITY),
    'read_locality is part of the canonical column list',
  );

  const schemaColumn = SERVICE_DEFINITIONS_SCHEMA.columns.find(
    (column) => column.name === SD_COL.READ_LOCALITY,
  );
  t.ok(schemaColumn, 'read_locality has a physical schema spec');
  t.equal(schemaColumn.notNull, true, 'read_locality is NOT NULL');
  t.equal(
    schemaColumn.defaultValue,
    '\'any\'',
    'read_locality schema default is any',
  );

  const defaultRow = serializeServiceDefinition({
    serviceId: SVC_ID,
    serviceName: 'read-local-svc',
    handlerFunctionId: 'fn-1',
  });
  t.equal(
    defaultRow[SD_COL.READ_LOCALITY],
    SERVICE_READ_LOCALITY.ANY,
    'serialize defaults read_locality to any',
  );

  const explicitRow = serializeServiceDefinition({
    serviceId: SVC_ID,
    serviceName: 'read-local-svc',
    handlerFunctionId: 'fn-1',
    readLocality: SERVICE_READ_LOCALITY.SAME_GROUP,
  });
  t.equal(
    explicitRow[SD_COL.READ_LOCALITY],
    SERVICE_READ_LOCALITY.SAME_GROUP,
    'serialize preserves explicit same_group',
  );

  const roundTripped = deserializeServiceDefinition(explicitRow);
  t.equal(
    roundTripped.readLocality,
    SERVICE_READ_LOCALITY.SAME_GROUP,
    'deserialize round-trips same_group',
  );

  const legacyRow = {...explicitRow};
  delete legacyRow[SD_COL.READ_LOCALITY];
  t.equal(
    deserializeServiceDefinition(legacyRow).readLocality,
    SERVICE_READ_LOCALITY.ANY,
    'rows without the column deserialize to the any default',
  );

  t.end();
});

test('resolveIssuingServiceReadLocality reads the cached definition',
  (t) => {
    const resolveIssuingServiceReadLocality =
      SQLQueryEngine.prototype.resolveIssuingServiceReadLocality;
    const systemCache = {
      get(type, key) {
        if (type !== TABLES.SERVICE_DEFINITIONS) {
          return null;
        }
        if (key === 'svc-local') {
          return definitionRow(SERVICE_READ_LOCALITY.SAME_GROUP);
        }
        if (key === 'svc-any') {
          return definitionRow(SERVICE_READ_LOCALITY.ANY);
        }
        return null;
      },
    };

    const call = (queryOptions) =>
      resolveIssuingServiceReadLocality.call({systemCache}, queryOptions);

    t.equal(call({}), false, 'no issuing service means no preference');
    t.equal(
      call({issuingServiceId: 'svc-local'}),
      true,
      'same_group policy resolves to a locality preference',
    );
    t.equal(
      call({issuingServiceId: 'svc-any'}),
      false,
      'any policy resolves to uniform routing',
    );
    t.equal(
      call({issuingServiceId: 'svc-unknown'}),
      false,
      'missing definition resolves to uniform routing',
    );
    t.equal(
      resolveIssuingServiceReadLocality.call(
        {systemCache: null},
        {issuingServiceId: 'svc-local'},
      ),
      false,
      'missing cache resolves to uniform routing',
    );

    t.end();
  });

test('executeSelect threads the issuing service readLocality into ' +
  'executor options', async (t) => {
  const tables = [{table_name: 'orders', table_id: 'orders'}];
  const partitions = [{
    partition_id: 'orders-p1',
    table_name: 'orders',
    status: 'active',
  }];
  const cache = cacheWithServiceDefinitions(
    createMockSystemCache(tables, partitions, null),
    [definitionRow(SERVICE_READ_LOCALITY.SAME_GROUP)],
  );
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'node-a',
  });
  const capturedOptions = [];
  engine.queryExecutor = {
    executeSelect: async (_ast, _partitionIds, _params, options) => {
      capturedOptions.push(options);
      return {success: true, results: [], rows: []};
    },
  };

  await engine.executeQuery('SELECT * FROM orders', [], {
    issuingServiceId: SVC_ID,
  });
  t.equal(capturedOptions.length, 1, 'select reached the query executor');
  t.equal(
    capturedOptions[0].preferSameLatencyGroup,
    true,
    'same_group policy turns on preferSameLatencyGroup',
  );

  await engine.executeQuery('SELECT * FROM orders', [], {
    issuingServiceId: 'svc-without-definition',
  });
  t.equal(
    capturedOptions[1].preferSameLatencyGroup,
    false,
    'unknown issuing service keeps uniform routing',
  );

  await engine.executeQuery('SELECT * FROM orders', []);
  t.equal(
    capturedOptions[2].preferSameLatencyGroup,
    false,
    'no issuing service keeps uniform routing',
  );

  t.end();
});

test('end-to-end: policy-on SELECT delivers to the local-node replica ' +
  'first through the real executor chain', async (t) => {
  const partitionId = 'orders-p1';
  const tables = [{table_name: 'orders', table_id: 'orders'}];
  const partitions = [{
    partition_id: partitionId,
    table_name: 'orders',
    status: 'active',
    leader_node_id: 'node-b',
  }];
  const services = [
    {
      service_id: `${partitionId}-r1`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: 'node-b',
      raft_role: 'leader',
      address: `node-b/partition/${partitionId}-r1`,
      status: 'active',
    },
    {
      service_id: `${partitionId}-r2`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: 'node-a',
      raft_role: 'follower',
      address: `node-a/partition/${partitionId}-r2`,
      status: 'active',
    },
  ];
  const nodes = [
    {node_id: 'node-a', latency_group_id: 'group-1'},
    {node_id: 'node-b', latency_group_id: 'group-2'},
  ];
  const cache = cacheWithServiceDefinitions(
    createMockSystemCache(tables, partitions, services, nodes),
    [definitionRow(SERVICE_READ_LOCALITY.SAME_GROUP)],
  );
  const deliveredAddresses = [];
  const recordingRouter = {
    deliver: async (address, message) => {
      if (message.type === 'QUERY') {
        deliveredAddresses.push(address);
        return {acknowledged: true, success: true, rows: [], changes: 0};
      }
      return {acknowledged: true, success: true};
    },
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: recordingRouter,
    nodeId: 'node-a',
    controlPlaneReadinessService: {
      getNodeReadinessSync: () => ({dimensions: {serveEligible: true}}),
    },
  });

  const uniformResult = await engine.executeQuery('SELECT * FROM orders', []);
  t.equal(uniformResult.success, true, 'policy-off select succeeds');
  t.equal(
    deliveredAddresses[0],
    `node-b/partition/${partitionId}-r1`,
    'policy-off delivery goes to the first snapshot-order replica',
  );

  deliveredAddresses.length = 0;
  const localityResult = await engine.executeQuery(
    'SELECT * FROM orders',
    [],
    {issuingServiceId: SVC_ID},
  );
  t.equal(localityResult.success, true, 'policy-on select succeeds');
  t.equal(
    deliveredAddresses[0],
    `node-a/partition/${partitionId}-r2`,
    'policy-on delivery goes to the local-node replica first',
  );

  t.end();
});

test('read candidate ordering: policy-on prefers local node then same ' +
  'latency group; policy-off is unchanged', (t) => {
  const partitionId = 'orders-p1';
  const nodes = [
    {node_id: 'node-a', latency_group_id: 'group-1'},
    {node_id: 'node-b', latency_group_id: 'group-2'},
    {node_id: 'node-c', latency_group_id: 'group-1'},
  ];
  const services = [
    {
      service_id: `${partitionId}-r1`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: 'node-b',
      raft_role: 'leader',
      address: `node-b/partition/${partitionId}`,
      status: 'active',
    },
    {
      service_id: `${partitionId}-r2`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: 'node-c',
      raft_role: 'follower',
      address: `node-c/partition/${partitionId}`,
      status: 'active',
    },
    {
      service_id: `${partitionId}-r3`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: 'node-a',
      raft_role: 'follower',
      address: `node-a/partition/${partitionId}`,
      status: 'active',
    },
  ];
  const systemCache = {
    partitions: [{partition_id: partitionId, leader_node_id: 'node-b'}],
    services,
    nodes,
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((p) => p.partition_id === key) || null;
      }
      if (type === TABLES.NODES) {
        return this.nodes.find((n) => n.node_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    nodeId: 'node-a',
    controlPlaneReadinessService: {
      getNodeReadinessSync: () => ({dimensions: {serveEligible: true}}),
    },
  });

  const uniform = executor.getPartitionServiceCandidates(
    partitionId,
    true,
    false,
    false,
  );
  t.same(
    uniform.map((candidate) => candidate.nodeId),
    ['node-b', 'node-c', 'node-a'],
    'policy-off read order is the unchanged snapshot order',
  );

  const localityPreferred = executor.getPartitionServiceCandidates(
    partitionId,
    true,
    false,
    true,
  );
  t.same(
    localityPreferred.map((candidate) => candidate.nodeId),
    ['node-a', 'node-c', 'node-b'],
    'policy-on read order is local node, same group, then the rest',
  );

  const writePath = executor.getPartitionServiceCandidates(
    partitionId,
    false,
    false,
    true,
  );
  t.same(
    writePath.map((candidate) => candidate.nodeId),
    ['node-b'],
    'write routing stays leader-only regardless of the read policy',
  );

  t.end();
});
