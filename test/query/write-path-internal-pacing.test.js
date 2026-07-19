import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {DistributedWriteCoordinator}
  from '../../src/query/distributed/distributed-write-coordinator.js';
import {
  createPartitionAttemptBudget,
} from '../../src/query/query-executor-partition-attempt-budget.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
} from './sql-query-engine-test-support.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function createBudgetExecutor() {
  return {
    delay: async () => {},
    getPartitionRecord: () => null,
    isShuttingDownRequested: () => false,
    messageRouter: {
      getConnectionState: () => 'connected',
      reconnectIntervalMs: 1000,
    },
    throwIfCancelled: () => {},
  };
}

test(
  'write routing consumes the original absolute request budget',
  async (t) => {
    const configuredBudgetMs = 80;
    const timeoutBudget = {
      configuredBudgetMs,
      startedAtMs: Date.now(),
      deadlineMs: Date.now() + configuredBudgetMs,
    };
    const attemptBudget = createPartitionAttemptBudget({
      executor: createBudgetExecutor(),
      partitionId: 'ratings-p1',
      forRead: false,
      executionOptions: {
        timeoutMs: 1000,
        timeoutBudget,
      },
      routingReadinessDimension: 'loadReady',
    });

    const deliveryOptions = attemptBudget.buildRouterDeliveryOptions(
      [{address: 'node-a/partition/ratings-p1-r1'}],
      0,
      new Set(),
    );

    t.ok(
      deliveryOptions.timeoutMs > 0 &&
        deliveryOptions.timeoutMs <= configuredBudgetMs,
      'participant delivery must consume the parent deadline, not restart timeoutMs',
    );
  },
);

function createRatingsPartition(replicaId, replicaIds) {
  return new PartitionService({
    partitionId: 'ratings-p1',
    tableId: 'ratings',
    tableName: 'ratings',
    replicaId,
    replicaIds,
    peerAddresses: replicaIds.map(
      (candidateId) => `test-node/partition/${candidateId}`,
    ),
    schema: {
      columns: [
        {name: 'rating_id', type: 'INTEGER', primaryKey: true},
        {name: 'rating', type: 'REAL'},
      ],
    },
    dbPath: ':memory:',
  });
}

function createCounterPartition(replicaId, replicaIds) {
  return new PartitionService({
    partitionId: 'counters-p1',
    tableId: 'counters',
    tableName: 'counters',
    replicaId,
    replicaIds,
    peerAddresses: replicaIds.map(
      (candidateId) => `test-node/partition/${candidateId}`,
    ),
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'value', type: 'INTEGER'},
      ],
    },
    dbPath: ':memory:',
  });
}

test(
  'one client write reroutes after stale-leader demotion and commits once',
  async (t) => {
    const replicaIds = ['ratings-r1', 'ratings-r2', 'ratings-r3'];
    const staleLeader = createRatingsPartition(replicaIds[0], replicaIds);
    const currentLeader = createRatingsPartition(replicaIds[1], replicaIds);
    await staleLeader.initialize();
    await currentLeader.initialize();

    staleLeader.role = 'leader';
    staleLeader.isLeader = true;
    staleLeader.leaderId = staleLeader.replicaId;
    staleLeader.raft.state = LifeRaft.LEADER;
    staleLeader.raftProvider.propose = async () => {};

    currentLeader.role = 'leader';
    currentLeader.isLeader = true;
    currentLeader.leaderId = currentLeader.replicaId;
    currentLeader.raft.state = LifeRaft.LEADER;
    currentLeader.raftProvider.propose = async (_raft, entry) => {
      currentLeader.applyCommittedEntry(entry);
    };

    const staleAddress = 'node-stale/partition/ratings-r1';
    const currentAddress = 'node-current/partition/ratings-r2';
    const deliveries = [];
    const servicesByAddress = new Map([
      [staleAddress, staleLeader],
      [currentAddress, currentLeader],
    ]);
    const systemCache = {
      partitions: [{
        partition_id: 'ratings-p1',
        table_name: 'ratings',
        leader_node_id: 'node-stale',
      }],
      services: [
        {
          service_id: 'ratings-r1',
          service_type: 'partition',
          partition_id: 'ratings-p1',
          node_id: 'node-stale',
          raft_role: 'leader',
          address: staleAddress,
          status: 'active',
        },
        {
          service_id: 'ratings-r2',
          service_type: 'partition',
          partition_id: 'ratings-p1',
          node_id: 'node-current',
          raft_role: 'follower',
          address: currentAddress,
          status: 'active',
        },
      ],
      get(type, key) {
        if (type === 'partitions') {
          return this.partitions.find(
            (partition) => partition.partition_id === key,
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
      async deliver(address, message) {
        deliveries.push(address);
        const service = servicesByAddress.get(address);
        const response = service.handleRemoteQuery(message);
        if (address === staleAddress) {
          await Promise.resolve();
          staleLeader.raft.change({state: LifeRaft.FOLLOWER});
        }
        return response;
      },
    };
    const executor = new QueryExecutor({messageRouter, systemCache});
    executor.leaderRetryDelayMs = 1;
    const clientSubmissions = 1;
    const timeoutMs = 250;

    const result = await executor.executeOnPartition(
      'ratings-p1',
      'INSERT INTO ratings (rating_id, rating) VALUES (?, ?)',
      [33001, 4.5],
      false,
      false,
      false,
      {
        timeoutMs,
        timeoutBudget: {
          configuredBudgetMs: timeoutMs,
          startedAtMs: Date.now(),
          deadlineMs: Date.now() + timeoutMs,
        },
      },
    );

    t.equal(clientSubmissions, 1, 'the logical write is submitted once');
    t.equal(result.success, true, 'the write owner should absorb the demotion');
    t.same(
      deliveries,
      [staleAddress, currentAddress],
      'routing should move from the stale owner to the live leader candidate',
    );
    t.equal(
      staleLeader.db
        .prepare('SELECT COUNT(*) AS count FROM ratings')
        .get()
        .count,
      0,
      'the stale leader must not expose an uncommitted copy',
    );
    t.equal(
      currentLeader.db
        .prepare('SELECT COUNT(*) AS count FROM ratings')
        .get()
        .count,
      1,
      'the live leader should commit the logical row exactly once',
    );

    await staleLeader.shutdown();
    await currentLeader.shutdown();
  },
);

test(
  'a genuinely stuck write stops at the original request deadline',
  async (t) => {
    const timeoutMs = 20;
    let deliveries = 0;
    const systemCache = {
      partitions: [{
        partition_id: 'ratings-p1',
        table_name: 'ratings',
        leader_node_id: 'node-stuck',
      }],
      services: [{
        service_id: 'ratings-r1',
        service_type: 'partition',
        partition_id: 'ratings-p1',
        node_id: 'node-stuck',
        raft_role: 'leader',
        address: 'node-stuck/partition/ratings-r1',
        status: 'active',
      }],
      get(type, key) {
        if (type === 'partitions') {
          return this.partitions.find(
            (partition) => partition.partition_id === key,
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
    const executor = new QueryExecutor({
      systemCache,
      messageRouter: {
        async deliver() {
          deliveries += 1;
          return {
            acknowledged: true,
            success: false,
            error: 'No leader available for write operation',
          };
        },
      },
    });
    executor.leaderRetryDelayMs = 1;
    const startedAtMs = Date.now();

    const result = await executor.executeOnPartition(
      'ratings-p1',
      'INSERT INTO ratings (rating_id, rating) VALUES (?, ?)',
      [33002, 3.5],
      false,
      false,
      false,
      {
        timeoutMs: 1000,
        timeoutBudget: {
          configuredBudgetMs: timeoutMs,
          startedAtMs,
          deadlineMs: startedAtMs + timeoutMs,
        },
      },
    );
    const elapsedMs = Date.now() - startedAtMs;

    t.equal(result.success, false, 'stuck leadership must still fail loudly');
    t.ok(deliveries > 0, 'the owner should make a bounded recovery attempt');
    t.ok(
      deliveries <= 40,
      'the existing write-attempt ceiling must remain bounded',
    );
    t.ok(
      elapsedMs < 250,
      'the participant loop must not restart the 1000ms child timeout',
    );
  },
);

test(
  'response-loss retry reuses one participant identity and commits once',
  async (t) => {
    const replicaIds = ['counters-r1', 'counters-r2', 'counters-r3'];
    const leader = createCounterPartition(replicaIds[0], replicaIds);
    await leader.initialize();
    leader.db
      .prepare('INSERT INTO counters (id, value) VALUES (?, ?)')
      .run(1, 0);
    leader.role = 'leader';
    leader.isLeader = true;
    leader.leaderId = leader.replicaId;
    leader.raft.state = LifeRaft.LEADER;
    leader.raftProvider.propose = async (_raft, entry) => {
      leader.applyCommittedEntry(entry);
    };

    const address = 'node-leader/partition/counters-r1';
    const deliveredEntryIds = [];
    let deliveries = 0;
    const systemCache = {
      partitions: [{
        partition_id: 'counters-p1',
        table_name: 'counters',
        leader_node_id: 'node-leader',
      }],
      services: [{
        service_id: 'counters-r1',
        service_type: 'partition',
        partition_id: 'counters-p1',
        node_id: 'node-leader',
        raft_role: 'leader',
        address,
        status: 'active',
      }],
      get(type, key) {
        if (type === 'partitions') {
          return this.partitions.find(
            (partition) => partition.partition_id === key,
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
      async deliver(_address, message) {
        deliveries += 1;
        deliveredEntryIds.push(message.entryId || null);
        const response = await leader.handleRemoteQuery(message);
        if (deliveries === 1) {
          return {
            acknowledged: false,
            success: false,
            error: 'Message timeout after committed response loss',
          };
        }
        return response;
      },
    };
    const executor = new QueryExecutor({messageRouter, systemCache});
    executor.leaderRetryDelayMs = 1;
    const coordinator = new DistributedWriteCoordinator({
      partitionResolver: {},
      queryExecutor: executor,
      getTablePartitions: () => [],
      getTableInfo: () => ({primaryKey: 'id'}),
      maxRetries: 0,
    });
    const ast = new SQLParser(
      'UPDATE counters SET value = 1 WHERE id = 1',
    ).parse();
    ast.assignments[0].value = {
      type: 'binary',
      operator: '+',
      left: {type: 'column_ref', table: null, column: 'value'},
      right: {type: 'literal', value: 1},
    };
    const plan = coordinator.createWritePlan(ast, [], {
      partitionIds: ['counters-p1'],
      sessionId: 'response-loss-client-write',
    });
    const timeoutMs = 250;

    const result = await coordinator.executePlan(plan, [], {
      timeoutMs,
      timeoutBudget: {
        configuredBudgetMs: timeoutMs,
        startedAtMs: Date.now(),
        deadlineMs: Date.now() + timeoutMs,
      },
    });

    t.equal(result.success, true, 'the owner should absorb response loss');
    t.equal(deliveries, 2, 'the lost response should cause one internal retry');
    t.type(
      deliveredEntryIds[0],
      'string',
      'participant delivery should carry a stable entry identity',
    );
    t.same(
      new Set(deliveredEntryIds).size,
      1,
      'all attempts for one participant must reuse that identity',
    );
    t.equal(
      leader.db.prepare('SELECT value FROM counters WHERE id = 1').get().value,
      1,
      'ambiguous response loss must not apply a non-idempotent UPDATE twice',
    );

    const nextPlan = coordinator.createWritePlan(ast, [], {
      partitionIds: ['counters-p1'],
      sessionId: 'response-loss-client-write',
    });
    const nextResult = await coordinator.executePlan(nextPlan, [], {
      timeoutMs,
      timeoutBudget: {
        configuredBudgetMs: timeoutMs,
        startedAtMs: Date.now(),
        deadlineMs: Date.now() + timeoutMs,
      },
    });

    t.not(
      nextPlan.operationId,
      plan.operationId,
      'a separate byte-identical submission must mint a new identity',
    );
    t.equal(nextResult.success, true, 'the separate submission should commit');
    t.equal(
      leader.db.prepare('SELECT value FROM counters WHERE id = 1').get().value,
      2,
      'a separate byte-identical submission must not be deduplicated',
    );

    await leader.shutdown();
  },
);

test(
  'participant identity is unique per submission and explicit when requested',
  (t) => {
    const coordinator = new DistributedWriteCoordinator();
    const ast = new SQLParser(
      'UPDATE counters SET value = ? WHERE id = ?',
    ).parse();
    const options = {
      partitionIds: ['counters-p1'],
      sessionId: 'reused-client-session',
    };
    const firstPlan = coordinator.createWritePlan(ast, [4, 1], options);
    const repeatedPlan = coordinator.createWritePlan(ast, [4, 1], options);
    const nextPlan = coordinator.createWritePlan(ast, [5, 1], options);
    const explicitPlan = coordinator.createWritePlan(ast, [4, 1], {
      ...options,
      idempotencyKey: 'caller-owned-idempotency-key',
    });

    t.not(
      firstPlan.operationId,
      repeatedPlan.operationId,
      'separate byte-identical submissions must receive unique identities',
    );
    t.not(
      firstPlan.operationId,
      nextPlan.operationId,
      'new bound values in a reused session must form a new logical write',
    );
    t.equal(
      explicitPlan.idempotencyKey,
      'caller-owned-idempotency-key',
      'an explicit caller idempotency key must remain authoritative',
    );
    t.end();
  },
);

test(
  'write routing refuses a new attempt after the parent deadline',
  async (t) => {
    const attemptBudget = createPartitionAttemptBudget({
      executor: createBudgetExecutor(),
      partitionId: 'ratings-p1',
      forRead: false,
      executionOptions: {
        timeoutMs: 1000,
        timeoutBudget: {
          configuredBudgetMs: 80,
          startedAtMs: Date.now() - 100,
          deadlineMs: Date.now() - 20,
        },
      },
      routingReadinessDimension: 'loadReady',
    });

    t.equal(
      attemptBudget.buildRouterDeliveryOptions(
        [{address: 'node-a/partition/ratings-p1-r1'}],
        0,
        new Set(),
      ),
      null,
      'an expired parent budget must prevent another participant delivery',
    );
  },
);

test(
  'SQL write ownership forwards the parent deadline to partition routing',
  async (t) => {
    const timeoutBudget = {
      configuredBudgetMs: 250,
      startedAtMs: Date.now(),
      deadlineMs: Date.now() + 250,
    };
    let capturedExecutionOptions = null;
    const distributedWriteCoordinator = {
      createWritePlan(ast) {
        return {
          operationId: 'write-parent-budget',
          idempotencyKey: 'write-parent-budget',
          statementType: 'INSERT',
          partitionStatements: new Map([
            ['ratings-p1', {
              ast,
              role: 'primary',
              executionOptions: {},
            }],
          ]),
        };
      },
      async executePlan(_plan, _params, executionOptions) {
        capturedExecutionOptions = executionOptions;
        return {
          success: true,
          affectedRows: 1,
          rows: [],
          retryCount: 0,
        };
      },
    };
    const engine = new SQLQueryEngine({
      systemCache: createMockSystemCache(
        [{table_name: 'ratings', primaryKey: 'rating_id'}],
        [{
          partition_id: 'ratings-p1',
          table_name: 'ratings',
          partition_key_start: null,
          partition_key_end: null,
        }],
      ),
      messageRouter: createMockMessageRouter(),
      distributedWriteCoordinator,
    });

    const result = await engine.executeQuery(
      'INSERT INTO ratings (rating_id, rating) VALUES (?, ?)',
      [33000, 4.5],
      {
        sessionId: 'load-batch-66',
        timeoutMs: 250,
        timeoutBudget,
      },
    );

    t.equal(result.success, true, 'fixture write should succeed');
    t.equal(
      capturedExecutionOptions.timeoutBudget,
      timeoutBudget,
      'the SQL owner must preserve the original absolute deadline object',
    );
  },
);
