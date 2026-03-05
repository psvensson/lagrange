import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';

function parseSQL(sql) {
  const parser = new SQLParser(sql);
  return parser.parse();
}

test('system writes stay routable across transient leader gaps', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const partitionId = 'node_endpoints-p1';
  const services = [
    {
      service_id: 'node_endpoints-p1-r2',
      service_type: 'partition',
      partition_id: partitionId,
      node_id: 'node-follower',
      raft_role: 'follower',
      address: 'node-follower/partition/node_endpoints-p1-r2',
      status: 'active',
    },
  ];

  const deliveries = [];
  const messageRouter = {
    deliver: async (address, _message) => {
      deliveries.push(address);
      if (address === 'node-leader/partition/node_endpoints-p1-r1') {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
        };
      }
      return {
        acknowledged: true,
        success: false,
        noHandler: true,
        error: `No handler for address ${address}`,
      };
    },
  };

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'node-leader',
      },
    ],
    filter: (tableName, predicate) => {
      if (tableName === 'partitions') {
        return systemCache.partitions.filter(predicate);
      }
      if (tableName !== 'services') {
        return [];
      }
      return services.filter(predicate);
    },
    get: (tableName, key) => {
      if (tableName === 'partitions') {
        return systemCache.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
  };

  const executor = new QueryExecutor({
    nodeId: 'seed-node',
    messageRouter,
    systemCache,
  });

  const promoteLeaderTimer = setTimeout(() => {
    services.push({
      service_id: 'node_endpoints-p1-r1',
      service_type: 'partition',
      partition_id: partitionId,
      node_id: 'node-leader',
      raft_role: 'leader',
      address: 'node-leader/partition/node_endpoints-p1-r1',
      status: 'active',
    });
  }, 600);

  try {
    const ast = parseSQL(
      'INSERT INTO node_endpoints (endpoint_id) VALUES (\'ep-transient\')',
    );
    const result = await executor.executeInsert(ast, partitionId);

    t.equal(result.success, true, 'write should succeed after leader is restored');
    t.ok(
      deliveries.includes('node-leader/partition/node_endpoints-p1-r1'),
      'writer should eventually route to the restored leader address',
    );
  } finally {
    clearTimeout(promoteLeaderTimer);
    ConfigurationManager.resetInstance();
  }
});

test('split routing fails closed when canonical leader owner metadata is missing',
  async (t) => {
    ConfigurationManager.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize();

    const partitionId = 'node_endpoints-p1';
    const services = [
      {
        service_id: 'node_endpoints-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-stale',
        raft_role: 'leader',
        address: 'node-stale/partition/node_endpoints-p1-r2',
        status: 'active',
      },
    ];
    const deliveries = [];

    const systemCache = {
      partitions: [
        {
          partition_id: partitionId,
          leader_node_id: null,
        },
      ],
      filter: (tableName, predicate) => {
        if (tableName === 'partitions') {
          return systemCache.partitions.filter(predicate);
        }
        if (tableName !== 'services') {
          return [];
        }
        return services.filter(predicate);
      },
      get: (tableName, key) => {
        if (tableName === 'partitions') {
          return systemCache.partitions.find(
            (partition) => partition.partition_id === key,
          ) || null;
        }
        return null;
      },
    };

    const executor = new QueryExecutor({
      nodeId: 'seed-node',
      messageRouter: {
        deliver: async (address) => {
          deliveries.push(address);
          return {
            acknowledged: true,
            success: true,
            changes: 1,
          };
        },
      },
      systemCache,
    });
    executor.leaderRetryAttempts = 1;
    executor.leaderRetryDelayMs = 1;

    const ast = parseSQL(
      'INSERT INTO node_endpoints (endpoint_id) VALUES (\'ep-missing-owner\')',
    );
    await t.rejects(
      executor.executeInsert(ast, partitionId),
      /No leader available for write operation/i,
      'write should fail closed without canonical leader owner',
    );
    t.equal(deliveries.length, 0, 'no writes should route via stale service metadata');

    ConfigurationManager.resetInstance();
  });
