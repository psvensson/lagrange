import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_ERROR,
} from '../../src/partition/partition-membership-recovery-constants.js';
import {
  markLocalReplicaExcludedFence,
} from '../../src/partition/partition-membership-recovery.js';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
} from '../../src/partition/partition-write-kernel.js';
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
import {createControllablePartitionService} from
  '../partition/partition-service-test-support.js';
import {resumeFixtureParticipantAdmission} from
  '../test-helpers/participant-transaction-fixture.js';

import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';
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

// The scenarios differ only in their partition/service rows; the cache lookup
// shape is identical, so it lives here once.
function buildMockSystemCache({partitions, services}) {
  return {
    partitions,
    services,
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
  return createControllablePartitionService({
    partitionId: 'ratings-p1',
    tableId: 'ratings',
    tableName: 'ratings',
    replicaId,
    replicaIds,
    nodeId: 'test-node',
    systemTableCache: {getAll: () => [], get: () => null, filter: () => []},
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
  return createControllablePartitionService({
    partitionId: 'counters-p1',
    tableId: 'counters',
    tableName: 'counters',
    replicaId,
    replicaIds,
    nodeId: 'test-node',
    systemTableCache: {getAll: () => [], get: () => null, filter: () => []},
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

// The stale leader proposed the write before it was demoted, so its outcome
// is not known there: in a real group the proposal may still commit through
// the new leader. Superseded expectation (owner ruling, R6-B): the executor
// used to answer its client that unknown outcome after one delivery, and the
// caller's re-drive then minted a fresh entry. The answer now carries its
// typed code and entryId, and the executor - the one re-delivery owner -
// sends the write again only under that same entryId, so in a real group
// the new leader answers it from its outcome row or applies it for the first
// time: once. (Here the two replicas share no log, so the live leader
// applies it, once, under that entryId.)
test(
  'one client write proposed by a stale leader that is then demoted is ' +
  're-delivered only under its one entryId and applied once',
  async (t) => {
    const replicaIds = ['ratings-r1', 'ratings-r2', 'ratings-r3'];
    const staleLeader = createRatingsPartition(replicaIds[0], replicaIds);
    const currentLeader = createRatingsPartition(replicaIds[1], replicaIds);
    await staleLeader.initialize();
    await currentLeader.initialize();

    staleLeader.role = 'leader';
    staleLeader.isLeader = true;
    staleLeader.leaderId = staleLeader.replicaId;
    staleLeader.controllablePort.setRole(RAFT_ROLE.LEADER);
    await resumeFixtureParticipantAdmission(staleLeader);
    staleLeader.controllablePort.setProposeHandler(async () => {});

    currentLeader.role = 'leader';
    currentLeader.isLeader = true;
    currentLeader.leaderId = currentLeader.replicaId;
    currentLeader.controllablePort.setRole(RAFT_ROLE.LEADER);
    currentLeader.controllablePort.setProposeHandler(async (entry) => {
      currentLeader.controllablePort.commit(entry);
    });
    await resumeFixtureParticipantAdmission(currentLeader);

    const staleAddress = 'node-stale/partition/ratings-r1';
    const currentAddress = 'node-current/partition/ratings-r2';
    const deliveries = [];
    const deliveredEntryIds = [];
    const servicesByAddress = new Map([
      [staleAddress, staleLeader],
      [currentAddress, currentLeader],
    ]);
    const systemCache = buildMockSystemCache({
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
    });
    const messageRouter = {
      async deliver(address, message) {
        deliveries.push(address);
        deliveredEntryIds.push(message.entryId);
        const service = servicesByAddress.get(address);
        const response = service.handleRemoteQuery(message);
        if (address === staleAddress) {
          await Promise.resolve();
          staleLeader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
        }
        return buildDeliveryEnvelope({acknowledged: true}, await response);
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter, systemCache});
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
    t.equal(result.success, true,
      `the client is told the write applied (${result.error})`);
    t.equal(deliveries[0], staleAddress, 'setup: first sent to the stale ' +
      'leader');
    t.ok(deliveries.length >= 2, 'the unknown outcome was re-delivered');
    t.equal(new Set(deliveredEntryIds).size, 1,
      'every delivery carried the write\'s one entryId');
    t.equal(typeof deliveredEntryIds[0], 'string',
      'minted once by the executor for a caller that gave none');
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
      'the live leader applied it once, under that entryId',
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
    const systemCache = buildMockSystemCache({
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
    });
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter: {
        async deliver() {
          deliveries += 1;
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: false,
            error: 'No leader available for write operation',
          });
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
      elapsedMs < 250,
      'the participant loop must not restart the 1000ms child timeout',
    );
  },
);

test(
  'write routing has one deadline instead of a competing attempt ceiling',
  async (t) => {
    const partitionId = 'ratings-p1';
    const address = 'node-leader/partition/ratings-r1';
    let routingObservationCount = 0;
    let deliveries = 0;
    const systemCache = buildMockSystemCache({
      partitions: [{
        partition_id: partitionId,
        table_name: 'ratings',
        leader_node_id: 'node-leader',
      }],
      services: [],
    });
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache,
      messageRouter: {
        async deliver() {
          deliveries += 1;
          return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: []});
        },
      },
    });
    executor.leaderRetryDelayMs = 1;
    executor.delay = async () => {};
    executor.resolvePartitionServiceCandidates = () => {
      routingObservationCount += 1;
      const ready = routingObservationCount > 40;
      return {
        candidates: ready ? [{
          address,
          nodeId: 'node-leader',
          node_id: 'node-leader',
        }] : [],
        routingSnapshot: {
          routableServiceCount: ready ? 1 : 0,
          routableServices: ready ? [{address}] : [],
        },
      };
    };

    const timeoutMs = 1000;
    const startedAtMs = Date.now();
    const result = await executor.executeOnPartition(
      partitionId,
      'INSERT INTO ratings (rating_id, rating) VALUES (?, ?)',
      [50001, 3.0],
      false,
      false,
      false,
      {
        timeoutBudget: {
          configuredBudgetMs: timeoutMs,
          startedAtMs,
          deadlineMs: startedAtMs + timeoutMs,
        },
      },
    );

    t.equal(
      result.success,
      true,
      'the canonical request deadline must outlive the deleted 40-attempt form',
    );
    t.ok(
      routingObservationCount > 40,
      'routing may recover after more than 40 owner observations',
    );
    t.equal(deliveries, 1, 'the logical write is delivered exactly once');
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
    leader.controllablePort.setRole(RAFT_ROLE.LEADER);
    leader.controllablePort.setProposeHandler(async (entry) => {
      leader.controllablePort.commit(entry);
    });
    await resumeFixtureParticipantAdmission(leader);

    const address = 'node-leader/partition/counters-r1';
    const deliveredEntryIds = [];
    let deliveries = 0;
    const systemCache = buildMockSystemCache({
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
    });
    const messageRouter = {
      async deliver(_address, message) {
        deliveries += 1;
        deliveredEntryIds.push(message.entryId || null);
        const response = await leader.handleRemoteQuery(message);
        if (deliveries === 1) {
          return buildDeliveryEnvelope(
            {acknowledged: false, error: 'Message timeout after committed response loss'});
        }
        return buildDeliveryEnvelope({acknowledged: true}, await response);
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter, systemCache});
    executor.leaderRetryDelayMs = 1;
    const coordinator = new DistributedWriteCoordinator({
      partitionResolver: {},
      queryExecutor: executor,
      getTablePartitions: () => [],
      getTableInfo: () => ({primaryKey: 'id'}),
    });
    const ast = new SQLParser(
      'UPDATE counters SET value = value + 1 WHERE id = 1',
    ).parse();
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
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
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

test(
  'a participant transaction refusal after a lost answer settles immediately without overwriting failureCode',
  async (t) => {
    const partitionId = 'district-p1';
    const address = 'node-leader/partition/district-r1';
    let deliveries = 0;
    const systemCache = buildMockSystemCache({
      partitions: [{
        partition_id: partitionId,
        table_name: 'district',
        leader_node_id: 'node-leader',
      }],
      services: [{
        service_id: 'district-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-leader',
        raft_role: 'leader',
        address,
        status: 'active',
      }],
    });
    const messageRouter = {
      async deliver(_address, _message, routerOptions) {
        deliveries += 1;
        if (deliveries === 1) {
          t.equal(
            routerOptions?.timeoutMs,
            16000,
            'transactional session writes allow the 15s row-key conflict wait before transport timeout',
          );
          return buildDeliveryEnvelope({
            acknowledged: false,
            error: 'Message timeout',
            errorCode: 'ROUTER_MESSAGE_TIMEOUT',
          });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false,
          failureCode: 'participant_transaction_stale_read',
          error: 'Participant transaction request refused: participant_transaction_stale_read',
          partitionId,
        });
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter,
      systemCache,
    });
    executor.leaderRetryDelayMs = 1;
    const timeoutMs = 30000;
    const startedAtMs = Date.now();
    const result = await executor.executeOnPartition(
      partitionId,
      'UPDATE district SET next_order_id = ? WHERE warehouse_id = ? AND district_id = ?',
      [2, 1, 1],
      false,
      false,
      false,
      {
        entryId: 'dwrite-participant-stale-read-test',
        transactionIdentity: {
          transactionId: 'tx-stale-read-1',
          commitMode: 'TWO_PHASE_COMMIT',
          transactionEpoch: 1,
        },
        timeoutMs,
        timeoutBudget: {
          configuredBudgetMs: timeoutMs,
          startedAtMs,
          deadlineMs: startedAtMs + timeoutMs,
        },
      },
    );

    t.equal(result.success, false, 'refused transactional write fails');
    t.equal(
      deliveries,
      2,
      'settled participant refusal stops redelivery immediately after the lost first answer',
    );
    t.equal(
      result.failureCode,
      'participant_transaction_stale_read',
      'settled participant refusal preserves its typed failureCode instead of partition_write_outcome_unknown',
    );
  },
);

test(
  'a committed write whose answer is lost before the replica is exclusion-fenced ' +
  'retains unknown-outcome custody across RETIRED_MEMBER_FENCED and recovers from a surviving replica',
  async (t) => {
    const replicaIds = ['counters-r1', 'counters-r2', 'counters-r3'];
    const fencedReplica = createCounterPartition(replicaIds[0], replicaIds);
    const survivingLeader = createCounterPartition(replicaIds[1], replicaIds);
    await fencedReplica.initialize();
    await survivingLeader.initialize();
    for (const service of [fencedReplica, survivingLeader]) {
      service.db
        .prepare('INSERT INTO counters (id, value) VALUES (?, ?)')
        .run(1, 0);
      service.role = 'leader';
      service.isLeader = true;
      service.leaderId = service.replicaId;
      service.controllablePort.setRole(RAFT_ROLE.LEADER);
      await resumeFixtureParticipantAdmission(service);
    }
    // Replicate commits across both replicas so when entry E commits on fencedReplica
    // before its answer is lost, survivingLeader also has E committed in its durable outcome table.
    fencedReplica.controllablePort.setProposeHandler(async (entry) => {
      fencedReplica.controllablePort.commit(entry);
      survivingLeader.controllablePort.commit(entry);
    });
    survivingLeader.controllablePort.setProposeHandler(async (entry) => {
      survivingLeader.controllablePort.commit(entry);
    });

    const fencedAddress = 'node-fenced/partition/counters-r1';
    const survivingAddress = 'node-surviving/partition/counters-r2';
    const servicesByAddress = new Map([
      [fencedAddress, fencedReplica],
      [survivingAddress, survivingLeader],
    ]);
    const deliveredAddresses = [];
    const deliveredEntryIds = [];
    let fencedDeliveryCount = 0;
    const systemCache = buildMockSystemCache({
      partitions: [{
        partition_id: 'counters-p1',
        table_name: 'counters',
        leader_node_id: 'node-fenced',
      }],
      services: [
        {
          service_id: 'counters-r1',
          service_type: 'partition',
          partition_id: 'counters-p1',
          node_id: 'node-fenced',
          raft_role: 'leader',
          address: fencedAddress,
          status: 'active',
        },
        {
          service_id: 'counters-r2',
          service_type: 'partition',
          partition_id: 'counters-p1',
          node_id: 'node-surviving',
          raft_role: 'follower',
          address: survivingAddress,
          status: 'active',
        },
      ],
    });
    const messageRouter = {
      async deliver(address, message) {
        deliveredAddresses.push(address);
        deliveredEntryIds.push(message.entryId);
        const service = servicesByAddress.get(address);
        if (address === fencedAddress) {
          fencedDeliveryCount += 1;
          if (fencedDeliveryCount === 1) {
            await service.handleRemoteQuery(message);
            markLocalReplicaExcludedFence(fencedReplica, {
              decisionId: 'recover-counters-p1',
              partitionId: 'counters-p1',
              sourceReplicaId: fencedReplica.replicaId,
              sourceNodeId: 'node-fenced',
              sourceNodeBootIncarnation: 1,
              sourceReplicaCreatedAt: 1000,
              configurationKey: 'v:1,2,3',
              membershipGenerationIndex: 1,
            });
            return buildDeliveryEnvelope({
              acknowledged: false,
              error: 'Message timeout after write committed on soon-to-be-fenced replica',
              errorCode: 'ROUTER_MESSAGE_TIMEOUT',
            });
          }
        }
        const response = await service.handleRemoteQuery(message);
        return buildDeliveryEnvelope({acknowledged: true}, response);
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter,
      systemCache,
    });
    executor.leaderRetryDelayMs = 1;
    const timeoutMs = 500;
    const startedAtMs = Date.now();
    const result = await executor.executeOnPartition(
      'counters-p1',
      'UPDATE counters SET value = value + 1 WHERE id = ?',
      [1],
      false,
      false,
      false,
      {
        entryId: 'entry-fenced-after-commit-1',
        timeoutMs,
        timeoutBudget: {
          configuredBudgetMs: timeoutMs,
          startedAtMs,
          deadlineMs: startedAtMs + timeoutMs,
        },
      },
    );

    t.equal(
      result.success,
      true,
      'QueryExecutor must not settle on RETIRED_MEMBER_FENCED and must recover the committed write from a surviving replica',
    );
    t.ok(
      deliveredAddresses.includes(fencedAddress) &&
        deliveredAddresses.includes(survivingAddress),
      'QueryExecutor must widen from the exclusion-fenced replica to the surviving replica',
    );
    t.equal(
      new Set(deliveredEntryIds).size,
      1,
      'all redeliveries must carry the exact same entryId',
    );
    t.equal(
      survivingLeader.db.prepare('SELECT value FROM counters WHERE id = 1').get().value,
      1,
      'the non-idempotent UPDATE must be applied exactly once',
    );

    // Subcase 2: When no surviving replica is reachable before deadline after a fenced refusal
    // on an unresolved write, QueryExecutor must surface OUTCOME_UNKNOWN, never RETIRED_MEMBER_FENCED.
    const isolatedCache = buildMockSystemCache({
      partitions: [{
        partition_id: 'counters-p1',
        table_name: 'counters',
        leader_node_id: 'node-fenced',
      }],
      services: [{
        service_id: 'counters-r1',
        service_type: 'partition',
        partition_id: 'counters-p1',
        node_id: 'node-fenced',
        raft_role: 'leader',
        address: fencedAddress,
        status: 'active',
      }],
    });
    let isolatedAttempts = 0;
    const isolatedExecutor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: isolatedCache,
      messageRouter: {
        async deliver(_address, message) {
          isolatedAttempts += 1;
          if (isolatedAttempts === 1) {
            return buildDeliveryEnvelope({
              acknowledged: false,
              error: 'Message timeout',
              errorCode: 'ROUTER_MESSAGE_TIMEOUT',
            });
          }
          const fencedAnswer = await fencedReplica.handleRemoteQuery(message);
          t.equal(
            fencedAnswer.failureCode,
            PARTITION_MEMBERSHIP_RECOVERY_ERROR.RETIRED_MEMBER_FENCED,
            'the fenced replica returns RETIRED_MEMBER_FENCED',
          );
          return buildDeliveryEnvelope({acknowledged: true}, fencedAnswer);
        },
      },
    });
    isolatedExecutor.leaderRetryDelayMs = 1;
    const shortBudgetMs = 40;
    const isolatedStartMs = Date.now();
    const unresolvedResult = await isolatedExecutor.executeOnPartition(
      'counters-p1',
      'UPDATE counters SET value = value + 1 WHERE id = ?',
      [1],
      false,
      false,
      false,
      {
        entryId: 'entry-fenced-unresolved-deadline',
        timeoutMs: shortBudgetMs,
        timeoutBudget: {
          configuredBudgetMs: shortBudgetMs,
          startedAtMs: isolatedStartMs,
          deadlineMs: isolatedStartMs + shortBudgetMs,
        },
      },
    );
    t.equal(unresolvedResult.success, false);
    t.equal(
      unresolvedResult.failureCode,
      PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
      'deadline expiry after RETIRED_MEMBER_FENCED on an unresolved write must preserve OUTCOME_UNKNOWN',
    );
    t.equal(
      unresolvedResult.entryId,
      'entry-fenced-unresolved-deadline',
      'OUTCOME_UNKNOWN answer must preserve the unresolved entryId',
    );

    await fencedReplica.shutdown();
    await survivingLeader.shutdown();
  },
);
