import {QueryExecutor} from '../../src/query/query-executor.js';
import {TABLES} from '../../src/constants/index.js';

export function registerQueryExecutorDeferredControlPlaneWriteTests({test}) {
  test('QueryExecutor - executeOnPartition widens deferred priority ' +
    'control-plane transport failures to another live replica', async (t) => {
    const deliveries = [];
    const partitionId = 'replica_operations-p1';
    const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
    const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
    let leaderAttempts = 0;

    const systemCache = {
      partitions: [
        {
          partition_id: partitionId,
          leader_node_id: 'leader-node',
          table_name: TABLES.REPLICA_OPERATIONS,
        },
      ],
      services: [
        {
          service_id: 'replica_operations-p1-r1',
          service_type: 'partition',
          partition_id: partitionId,
          node_id: 'leader-node',
          raft_role: 'leader',
          address: leaderAddress,
          status: 'active',
        },
        {
          service_id: 'replica_operations-p1-r2',
          service_type: 'partition',
          partition_id: partitionId,
          node_id: 'follower-node',
          raft_role: 'follower',
          address: fallbackAddress,
          status: 'active',
        },
      ],
      get(type, key) {
        if (type === 'partitions') {
          return this.partitions.find((partition) =>
            partition.partition_id === key,
          ) || null;
        }
        return null;
      },
      filter(type, predicate) {
        if (type === 'services') {
          return this.services.filter(predicate);
        }
        if (type === 'partitions') {
          return this.partitions.filter(predicate);
        }
        return [];
      },
    };

    const messageRouter = {
      async deliver(address) {
        deliveries.push(address);
        if (address === leaderAddress) {
          leaderAttempts += 1;
          if (leaderAttempts === 1) {
            return {
              acknowledged: true,
              success: false,
              error: 'Connection to node leader-node closed',
              errorCode: 'ROUTER_CONNECTION_CLOSED',
              deferRetry: true,
              retryAfterMs: 250,
            };
          }
          return {
            acknowledged: true,
            success: true,
            changes: 1,
            rows: [],
          };
        }
        if (address === fallbackAddress) {
          return {
            acknowledged: true,
            success: true,
            changes: 1,
            rows: [],
          };
        }
        return {
          acknowledged: true,
          success: false,
          error: 'unexpected fallback delivery',
        };
      },
    };

    const executor = new QueryExecutor({
      messageRouter,
      systemCache,
      nodeId: 'local-node',
    });

    const result = await executor.executeOnPartition(
      partitionId,
      'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
      ['active', 'op-1'],
      false,
    );

    t.equal(result.success, true);
    t.same(
      deliveries,
      [leaderAddress, fallbackAddress],
      'priority recovery should widen to another live replica after a deferred ' +
        'leader-unavailable transport failure',
    );
  });

  test('QueryExecutor - executeOnPartition keeps deferred non-priority ' +
    'system-table transport failures on the same leader address', async (t) => {
    const deliveries = [];
    const retryDelays = [];
    const partitionId = 'services-p1';
    const leaderAddress = 'leader-node/partition/services-p1-r1';
    let leaderAttempts = 0;

    const systemCache = {
      partitions: [
        {
          partition_id: partitionId,
          leader_node_id: 'leader-node',
          table_name: TABLES.SERVICES,
        },
      ],
      services: [
        {
          service_id: 'services-p1-r1',
          service_type: 'partition',
          partition_id: partitionId,
          node_id: 'leader-node',
          raft_role: 'leader',
          address: leaderAddress,
          status: 'active',
        },
        {
          service_id: 'services-p1-r2',
          service_type: 'partition',
          partition_id: partitionId,
          node_id: 'follower-node',
          raft_role: 'follower',
          address: 'follower-node/partition/services-p1-r2',
          status: 'active',
        },
      ],
      get(type, key) {
        if (type === 'partitions') {
          return this.partitions.find((partition) =>
            partition.partition_id === key,
          ) || null;
        }
        return null;
      },
      filter(type, predicate) {
        if (type === 'services') {
          return this.services.filter(predicate);
        }
        if (type === 'partitions') {
          return this.partitions.filter(predicate);
        }
        return [];
      },
    };

    const messageRouter = {
      async deliver(address) {
        deliveries.push(address);
        if (address === leaderAddress) {
          leaderAttempts += 1;
          if (leaderAttempts === 1) {
            return {
              acknowledged: true,
              success: false,
              error: 'Connection to node leader-node closed',
              errorCode: 'ROUTER_CONNECTION_CLOSED',
              deferRetry: true,
              retryAfterMs: 250,
            };
          }
          return {
            acknowledged: true,
            success: true,
            changes: 1,
            rows: [],
          };
        }
        return {
          acknowledged: true,
          success: false,
          error: 'unexpected fallback delivery',
        };
      },
    };

    const executor = new QueryExecutor({
      messageRouter,
      systemCache,
      nodeId: 'local-node',
    });
    executor.delay = async (delayMs) => {
      retryDelays.push(delayMs);
    };

    const result = await executor.executeOnPartition(
      partitionId,
      'UPDATE services SET status = ? WHERE service_id = ?',
      ['active', 'svc-1'],
      false,
    );

    t.equal(result.success, true);
    t.same(
      deliveries,
      [leaderAddress, leaderAddress],
      'non-priority system-table writes should keep the bounded same-address ' +
        'retry contract after a deferred transport failure',
    );
    t.equal(retryDelays.length, 1,
      'deferred failures should schedule one bounded partition retry');
    t.ok(retryDelays[0] >= 250,
      'deferred partition retry should honor retryAfterMs');
  });

  test('QueryExecutor - executeOnPartition bounds deferred control-plane write ' +
    'retries by the per-call timeout budget', async (t) => {
    const deliveries = [];
    const retryDelays = [];
    const partitionId = 'replica_operations-p1';
    const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';

    const systemCache = {
      partitions: [
        {
          partition_id: partitionId,
          leader_node_id: 'leader-node',
          table_name: TABLES.REPLICA_OPERATIONS,
        },
      ],
      services: [
        {
          service_id: 'replica_operations-p1-r1',
          service_type: 'partition',
          partition_id: partitionId,
          node_id: 'leader-node',
          raft_role: 'leader',
          address: leaderAddress,
          status: 'active',
        },
      ],
      get(type, key) {
        if (type === 'partitions') {
          return this.partitions.find((partition) =>
            partition.partition_id === key,
          ) || null;
        }
        return null;
      },
      filter(type, predicate) {
        if (type === 'services') {
          return this.services.filter(predicate);
        }
        if (type === 'partitions') {
          return this.partitions.filter(predicate);
        }
        return [];
      },
    };

    const messageRouter = {
      async deliver(address) {
        deliveries.push(address);
        return {
          acknowledged: true,
          success: false,
          error: 'Connection to node leader-node closed',
          errorCode: 'ROUTER_CONNECTION_CLOSED',
          deferRetry: true,
          retryAfterMs: 250,
        };
      },
    };

    const executor = new QueryExecutor({
      messageRouter,
      systemCache,
      nodeId: 'local-node',
    });
    executor.delay = async (delayMs) => {
      retryDelays.push(delayMs);
    };

    const result = await executor.executeOnPartition(
      partitionId,
      'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
      ['active', 'op-1'],
      false,
      false,
      false,
      {
        timeoutMs: 200,
      },
    );

    t.equal(result.success, false,
      'bounded control-plane retries should surface the deferred failure once the budget is exhausted');
    t.same(
      deliveries,
      [leaderAddress],
      'per-call timeout budget should prevent extra retry attempts when retryAfterMs exceeds the remaining budget',
    );
    t.equal(retryDelays.length, 0,
      'per-call timeout budget should not sleep past the remaining execution budget');
    t.equal(result.deferRetry, true,
      'bounded timeout exhaustion should preserve defer-retry semantics for upstream owners');
    t.equal(result.retryAfterMs, 250,
      'bounded timeout exhaustion should preserve retryAfterMs for the next owner-level retry');
  });
}
