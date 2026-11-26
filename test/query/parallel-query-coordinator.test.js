import {createHedgedFanoutState} from '../../src/query/distributed/parallel-query-hedging.js';
import {test} from '../../src/test-helpers/tap.js';
import {PartitionServiceCoreBase} from '../../src/partition/partition-service-core-base.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {ParallelQueryCoordinator} from '../../src/query/distributed/parallel-query-coordinator.js';
import {PartitionQueryMetrics, QueryExecutionMetrics} from '../../src/query/distributed/parallel-query-execution-metrics.js';
import {DistributedWriteCoordinator} from '../../src/query/distributed/distributed-write-coordinator.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {PARTITION_SERVICE_REMOTE_QUERY_METHODS} from
  '../../src/partition/partition-service-remote-query-methods.js';
import {resolvePartitionExecutionBuilders} from
  '../../src/query/query-executor-partition-request-builders.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {createAdminQueryResultMessageEnvelope} from
  '../../src/admin/admin-query-result-message-envelope.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_RESPONSE_TYPE,
} from '../../src/query/query-constants.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {NodeHandle} from '../distributed/harness/cluster.js';
import {
  createCommittedServeEligibilityOwner,
  serveEligibilityAnswer,
} from '../control-plane/serve-eligibility-test-support.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}


for (const hasWitness of [true, false]) {
  test(`parallel reads preserve ${hasWitness ? 'supplied' : 'absent'} authority`,
    async (t) => {
      const partitionId = 'services-p1';
      const sql = 'SELECT DISTINCT service_id AS learner_service_id ' +
        'FROM services WHERE service_id = ? AND service_id IS NOT NULL';
      const witness = PARTITION_SERVICE_REMOTE_QUERY_METHODS
        .buildRemoteReadAuthorityWitness.call({
          partitionId,
          nodeId: 'serving-node',
          replicaId: 'services-p1-r1',
          readOwnRaftStatus: PartitionServiceCoreBase.prototype.readOwnRaftStatus,
          raft: {observeCurrentAuthority: () => ({outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
            groupId: partitionId, replicaIdentity: 'services-p1-r1', role: 'leader',
            term: 7, currentTermApplied: true})},
          timeSource: {now: () => 12345},
        }, false);
      t.equal(witness.state, 'observed', 'remote owner supplies the witness');
      const response = {success: true, rows: [{learner_service_id: 'learner'}]};
      if (hasWitness) response.readAuthorityWitness = witness;
      const expected = hasWitness ? witness : undefined;
      const {buildSuccessResult} = resolvePartitionExecutionBuilders({
        partitionId, sql, params: ['learner'],
      });
      const raw = buildSuccessResult(response);
      t.same(raw.readAuthorityWitness, expected,
        'request owner preserves the controlled remote answer');
      let calls = 0;
      const coordinator = new ParallelQueryCoordinator({
        partitionQueryExecutor: async () => {
          calls++;
          return raw;
        },
      });
      const primary = await coordinator.executeParallel(
        sql, [partitionId], ['learner'], {forRead: true, timeoutMs: 1000});
      t.equal(calls, 1, 'ordinary fan-out executes the partition once');
      t.same(primary.results[0].rows, response.rows, 'rows are retained');
      t.same(primary.results[0].readAuthorityWitness, expected,
        'ordinary completion preserves supplied evidence or its absence');

      const metrics = new QueryExecutionMetrics('authority-hedge', 1);
      const hedging = createHedgedFanoutState([partitionId]);
      const {results, pendingPartitions} = hedging;
      const accept = (result) => {
        const speculativeMetrics = new PartitionQueryMetrics(partitionId);
        speculativeMetrics.start();
        coordinator.acceptSpeculativeResult({
          partitionId, result, speculativeMetrics, metrics,
          hedging,
        });
      };
      accept(raw);
      const accepted = results.get(partitionId);
      t.equal(hedging.signals.get(partitionId).aborted, true, 'settlement cancels losing work');
      t.equal(pendingPartitions.size, 0, 'successful hedge completes partition');
      t.same(accepted.rows, response.rows, 'winning hedge retains its rows');
      t.same(accepted.readAuthorityWitness, expected,
        'winning hedge preserves supplied evidence or its absence');
      accept({...raw,
        readAuthorityWitness: {...witness, servingNodeId: 'losing-node'}});
      t.equal(results.get(partitionId), accepted,
        'late losing hedge cannot replace the accepted answer');
      accept({success: false, error: 'controlled refusal',
        readAuthorityWitness: witness});
      t.equal(results.get(partitionId), accepted,
        'failed hedge cannot replace the accepted answer');
    });
}

test('ParallelQueryCoordinator - chunk scheduling executes all partitions', async (t) => {
  const started = [];
  const partitions = new Map();
  let gateResolver = null;
  const gatePromise = new Promise((resolve) => {
    gateResolver = resolve;
  });
  let activeQueries = 0;
  let maxActiveQueries = 0;

  for (let index = 0; index < 5; index++) {
    const partitionId = `p${index}`;
    partitions.set(partitionId, {
      async executeQuery() {
        started.push(partitionId);
        activeQueries += 1;
        maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
        if (partitionId === 'p0' || partitionId === 'p1') {
          await gatePromise;
        }
        await Promise.resolve();
        activeQueries -= 1;
        return {
          rows: [{partitionId}],
          changes: 0,
        };
      },
    });
  }

  const coordinator = new ParallelQueryCoordinator({
    partitionQueryExecutor: (sql, id, params) => partitions.get(id).executeQuery(sql, params),
  });
  coordinator.speculativeExecutionEnabled = false;
  coordinator.maxParallelPartitions = 2;

  const executionPromise = coordinator.executeParallel(
    'SELECT * FROM test',
    Array.from(partitions.keys()),
    [],
  );

  await Promise.resolve();
  await Promise.resolve();
  t.same(
    started,
    ['p0', 'p1'],
    'second chunk should not start before the first chunk finishes',
  );

  gateResolver();
  const result = await executionPromise;

  t.equal(result.success, true);
  t.equal(result.results.length, 5);
  t.same(
    started,
    ['p0', 'p1', 'p2', 'p3', 'p4'],
    'all partitions should execute in deterministic chunk order',
  );
  t.ok(maxActiveQueries <= 2, 'parallelism should respect chunk size');
});

test('ParallelQueryCoordinator - per-fragment status is returned', async (t) => {
  const partitions = new Map([
    ['p1', {
      async executeQuery() {
        return {
          rows: [{id: 1}],
          changes: 0,
        };
      },
    }],
    ['p2', {
      async executeQuery() {
        throw new Error('partition failed');
      },
    }],
  ]);

  const coordinator = new ParallelQueryCoordinator({
    partitionQueryExecutor: (sql, id, params) => partitions.get(id).executeQuery(sql, params),
  });
  coordinator.speculativeExecutionEnabled = false;

  const result = await coordinator.executeParallel(
    'SELECT * FROM test',
    ['p1', 'p2'],
    [],
  );

  t.equal(result.success, true);
  t.equal(result.results.length, 2);

  const p1Result = result.results.find((entry) => entry.partitionId === 'p1');
  const p2Result = result.results.find((entry) => entry.partitionId === 'p2');
  t.equal(p1Result.status, 'completed');
  t.equal(p2Result.status, 'failed');
});

test('ParallelQueryCoordinator - preserves bounded participant failure diagnostics',
  async (t) => {
    const coordinator = new ParallelQueryCoordinator({
      partitionQueryExecutor: async (_sql, partitionId) => {
        if (partitionId === 'p1') {
          return {
            success: true,
            rows: [{id: 1}],
            changes: 0,
          };
        }
        return {
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
          retryAfterMs: 250,
          deferRetry: true,
          participantNodeId: 'node-pressure',
          participantAddress: 'ws://node-pressure:7001',
          backpressured: true,
          failedTable: 'replica_operations',
        };
      },
    });
    coordinator.speculativeExecutionEnabled = false;

    const result = await coordinator.executeParallel(
      'SELECT * FROM replica_operations',
      ['p1', 'p2'],
      [],
    );

    const failedResult = result.results.find((entry) => entry.partitionId === 'p2');
    t.equal(failedResult?.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE',
      'failed partition should preserve error code');
    t.equal(failedResult?.retryAfterMs, 250,
      'failed partition should preserve retry-after metadata');
    t.equal(failedResult?.participantNodeId, 'node-pressure',
      'failed partition should preserve participant node id');
    t.equal(failedResult?.participantAddress, 'ws://node-pressure:7001',
      'failed partition should preserve participant address');
    t.equal(failedResult?.backpressured, true,
      'failed partition should preserve backpressure state');
    t.equal(failedResult?.failedTable, 'replica_operations',
      'failed partition should preserve the failed table name');
    t.equal(
      result.metrics?.firstFailedParticipant?.participantNodeId,
      'node-pressure',
      'fanout metrics should expose the first failed participant summary',
    );
    t.equal(
      result.metrics?.firstFailedParticipant?.failedTable,
      'replica_operations',
      'fanout metrics should expose the failed table name',
    );
    t.equal(
      result.metrics?.firstFailedParticipant?.durationMs >= 0,
      true,
      'fanout metrics should preserve per-participant duration',
    );
  });

test('ParallelQueryCoordinator requires the partition executor', (t) => {
  t.throws(() => new ParallelQueryCoordinator(), /requires a partitionQueryExecutor/);
  t.end();
});

test('ParallelQueryCoordinator - failed speculative replica cannot win result',
  async (t) => {
    const coordinator = new ParallelQueryCoordinator({
      partitionQueryExecutor: async () => ({
        success: false, error: 'Partition service not found', rows: [],
      }),
    });

    const metrics = new QueryExecutionMetrics('q-speculative-test', 1);
    const speculativePromises = new Map();
    const hedging = createHedgedFanoutState(['p1']);
    const {results, pendingPartitions} = hedging;
    hedging.primaryExecutionOptions.hedgeDeliveryObserver({
      partitionId: 'p1', address: 'primary', nodeId: 'primary', candidateCount: 2,
    });

    coordinator.startSpeculativeExecution(
      'p1',
      'SELECT * FROM replica_operations',
      [],
      metrics,
      speculativePromises,
      hedging,
    );

    const speculative = speculativePromises.get('p1');
    t.ok(speculative, 'speculative execution should be registered');

    const result = await speculative;
    t.equal(hedging.signals.get('p1').aborted, false, 'failed hedge leaves the primary live');
    t.equal(result.success, false, 'speculative failure should be reported');
    t.equal(
      result.error,
      'Partition service not found',
      'speculative failure preserves retryable error',
    );
    t.equal(
      results.has('p1'),
      false,
      'failed speculative result should not complete the partition',
    );
    t.equal(
      pendingPartitions.has('p1'),
      true,
      'primary execution should remain pending after speculative failure',
    );
    t.equal(metrics.speculativeExecutions, 1);
  });

test('a primary result aborts an in-flight speculative partition execution', async (t) => {
  const partitionId = 'p1';
  const caller = new AbortController();
  const hedging = createHedgedFanoutState([partitionId], {signal: caller.signal});
  const entered = Promise.withResolvers();
  const coordinator = new ParallelQueryCoordinator({
    partitionQueryExecutor: async (_sql, _id, _params, {signal, excludeDeliveryAddresses}) => {
      t.same(excludeDeliveryAddresses, ['primary']);
      entered.resolve(signal);
      await new Promise((resolve) => signal.addEventListener('abort', resolve, {once: true}));
      signal.throwIfAborted();
    },
  });
  hedging.primaryExecutionOptions.hedgeDeliveryObserver({
    partitionId, address: 'primary', nodeId: 'node-a', candidateCount: 2,
  });
  const attempts = new Map();
  coordinator.startSpeculativeExecution(partitionId, 'SELECT 1', [],
    new QueryExecutionMetrics('cancel-hedge', 1), attempts, hedging);
  const losingSignal = await entered.promise;
  const primary = {success: true, rows: [{value: 1}]};
  coordinator.settleHedgedAttemptOutcome(hedging, partitionId, primary);
  t.equal(losingSignal.aborted, true);
  t.equal(caller.signal.aborted, false);
  t.equal((await attempts.get(partitionId)).success, false);
  t.equal(hedging.results.get(partitionId), primary);
});

test('ParallelQueryCoordinator - emits fanout metrics log', async (t) => {
  const partitions = new Map([
    ['p1', {
      async executeQuery() {
        return {rows: [{id: 1}], changes: 0};
      },
    }],
    ['p2', {
      async executeQuery() {
        return {rows: [{id: 2}, {id: 3}], changes: 0};
      },
    }],
  ]);

  const coordinator = new ParallelQueryCoordinator({
    partitionQueryExecutor: (sql, id, params) => partitions.get(id).executeQuery(sql, params),
  });
  coordinator.speculativeExecutionEnabled = false;

  const infoCalls = [];
  const origInfo = coordinator.logger.info.bind(coordinator.logger);
  coordinator.logger.info = (tag, data) => {
    infoCalls.push({tag, data});
    origInfo(tag, data);
  };

  await coordinator.executeParallel(
    'SELECT * FROM test',
    ['p1', 'p2'],
    [],
  );

  const metricsCall = infoCalls.find(
    (c) => c.tag === 'metrics.fanout.complete',
  );
  t.ok(metricsCall, 'should emit metrics.fanout.complete log');

  const d = metricsCall.data;
  t.ok(typeof d.queryId === 'string', 'queryId is a string');
  t.equal(d.partitionCount, 2, 'partitionCount matches');
  t.ok(
    Number.isInteger(d.totalLatencyMs) && d.totalLatencyMs >= 0,
    'totalLatencyMs is a non-negative integer',
  );
  t.ok(d.medianLatencyMs >= 0, 'medianLatencyMs is non-negative');
  t.ok(
    Number.isInteger(d.maxPartitionLatencyMs) &&
      d.maxPartitionLatencyMs >= 0,
    'maxPartitionLatencyMs is a non-negative integer',
  );
  t.equal(d.totalRows, 3, 'totalRows sums across partitions');
  t.ok(typeof d.totalBytes === 'number', 'totalBytes is a number');
  t.ok(
    Number.isInteger(d.stragglerCount) && d.stragglerCount >= 0,
    'stragglerCount is a non-negative integer',
  );
  t.ok(
    Number.isInteger(d.speculativeExecutions) &&
      d.speculativeExecutions >= 0,
    'speculativeExecutions is a non-negative integer',
  );

  // Verify no metrics log uses debug level
  const debugCalls = infoCalls.filter(
    (c) => c.tag && c.tag.startsWith('metrics.'),
  );
  t.ok(
    debugCalls.every((c) => c.tag === metricsCall.tag),
    'metrics logs only emitted at info level',
  );
});

test('ParallelQueryCoordinator - per-query timeout override controls chunk timeout',
  async (t) => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const scheduledTimeouts = [];

    globalThis.setTimeout = (callback, timeoutMs) => {
      scheduledTimeouts.push(timeoutMs);
      globalThis.queueMicrotask(callback);
      return 1;
    };
    globalThis.clearTimeout = () => {};

    const partitionTimeouts = [];
    const coordinator = new ParallelQueryCoordinator({
      partitionQueryExecutor: (_sql, _id, _params, options) => {
        partitionTimeouts.push(options.timeoutMs);
        return new Promise(() => {});
      },
    });

    try {
      for (const {sql, forRead, outerTimeoutMs} of [
        {sql: 'SELECT * FROM test', forRead: true, outerTimeoutMs: 4321},
        {sql: 'UPDATE test SET value = 1', forRead: false, outerTimeoutMs: 4571},
      ]) {
        scheduledTimeouts.length = 0;
        await t.rejects(
          coordinator.executeParallel(sql, ['p1'], [], {forRead, timeoutMs: 4321}),
          /Query timeout after 4321ms/,
        );
        t.ok(scheduledTimeouts.includes(outerTimeoutMs),
          `expected the ${forRead ? 'read' : 'write'} outer timer at ${outerTimeoutMs}ms`);
      }
      t.same(partitionTimeouts, [4321, 4321], 'both partitions receive the caller budget');
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

test('ParallelQueryCoordinator - cooperative cancellation aborts fanout', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.setTimeout = (callback, _timeoutMs) => {
    globalThis.queueMicrotask(callback);
    return 1;
  };
  globalThis.clearTimeout = () => {};

  const partitions = new Map([
    ['p1', {
      async executeQuery() {
        return new Promise(() => {});
      },
    }],
  ]);

  const coordinator = new ParallelQueryCoordinator({
    partitionQueryExecutor: (sql, id, params) => partitions.get(id).executeQuery(sql, params),
  });
  coordinator.speculativeExecutionEnabled = false;

  const cancellationToken = new CancellationToken();
  cancellationToken.cancel('cancelled-by-test');

  try {
    await t.rejects(
      coordinator.executeParallel(
        'SELECT * FROM test',
        ['p1'],
        [],
        {
          timeoutMs: 5000,
          cancellationToken,
        },
      ),
      /cancelled-by-test/,
      'cancelled token should abort parallel fanout before timeout',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

function resolveNodeHandleError(queryId, result) {
  const envelope = createAdminQueryResultMessageEnvelope(queryId, result);
  const node = new NodeHandle('node-1', 'c1', '127.0.0.1', 'seed', {});
  let rejectedError = null;
  node._getPendingQueries('default').set(queryId, {
    operationLabel: 'query',
    timeout: null,
    resolve: () => {},
    reject: (err) => {
      rejectedError = err;
    },
  });
  node._resolvePendingQuery(envelope, 'default');
  return {envelope, rejectedError};
}

function createDeniedPartitionExecutorFixture({
  deniedNodeId = 'node-denied',
  denialReasons = ['ready_lease_expired', 'unavailable_stale'],
  readinessDimension = CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
} = {}) {
  const readinessService = createCommittedServeEligibilityOwner({
    answers: {
      'node-live': serveEligibilityAnswer(true),
      [deniedNodeId]: serveEligibilityAnswer(false, {reasons: denialReasons}),
    },
  });
  const systemCache = {
    partitions: [
      {partition_id: 'p1', leader_node_id: 'node-live'},
      {partition_id: 'p2', leader_node_id: deniedNodeId},
    ],
    services: [
      {
        service_id: 'p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'p1',
        node_id: 'node-live',
        raft_role: 'leader',
        address: 'node-live/partition/p1',
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'p2-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'p2',
        node_id: deniedNodeId,
        raft_role: 'leader',
        address: `${deniedNodeId}/partition/p2`,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find(
          (partition) => partition.partition_id === key,
        ) || null;
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
  const messageRouter = {
    getConnectionState: () => 'connected',
    deliver: async (address) => {
      if (address === 'node-live/partition/p1') {
        return buildDeliveryEnvelope(
          {acknowledged: true},
          {
            success: true,
            rows: [{id: 1}],
            changes: 1,
          },
        );
      }
      return buildDeliveryEnvelope({
        acknowledged: false,
        error: `Unexpected delivery to ${address}`,
      });
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: readinessService,
    messageRouter,
    systemCache,
  });
  executor.readRetryAttempts = 1;
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1000;
  return {
    executor,
    deniedNodeId,
    denialReasons,
    readinessDimension,
  };
}

test('fan-out cancellation before submission sends no write', async (t) => {
  const {executor} = createDeniedPartitionExecutorFixture();
  let deliveries = 0;
  executor.messageRouter.deliver = () => { deliveries++; };
  const token = new CancellationToken();
  token.cancel('cancel before submission');
  await t.rejects(executor.parallelQueryCoordinator.executeParallel(
    'UPDATE accounts SET balance = 1', ['p1'], [], {forRead: false, cancellationToken: token},
  ), /cancel before submission/);
  t.equal(deliveries, 0);
});

for (const redirect of [false, true]) {
  for (const terminal of ['success', 'committed failure', 'unknown']) {
    test(`fan-out cancellation after ${redirect ? 'redirect' : 'ordinary'} submission preserves ${terminal}`,
      async (t) => {
        const {executor} = createDeniedPartitionExecutorFixture();
        const coordinator = executor.parallelQueryCoordinator;
        coordinator.maxParallelPartitions = 1;
        const token = new CancellationToken();
        const entered = Promise.withResolvers();
        const reply = Promise.withResolvers();
        const addresses = [];
        executor.messageRouter.deliver = async (address, request) => {
          addresses.push(address);
          if (redirect && addresses.length === 1) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: false, redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
              leaderAddress: 'node-next/partition/p1',
            });
          }
          entered.resolve(request.entryId);
          return buildDeliveryEnvelope({acknowledged: true}, await reply.promise);
        };

        const running = coordinator.executeParallel('UPDATE accounts SET balance = 1',
          ['p1', 'p2'], [], {forRead: false, cancellationToken: token});
        const entryId = await entered.promise;
        token.cancel('caller stopped');
        const answer = terminal === 'success' ? {success: true, changes: 1} : {
          success: false, error: terminal, entryId,
          ...(terminal === 'unknown' ? {failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN} :
            {committed: true, failureCode: 'STATEMENT_FAILED'}),
        };
        reply.resolve(answer);
        const {results} = await running;
        t.match(results[0], terminal === 'unknown' ?
          {partitionId: 'p1', success: false, failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN, entryId,
            spentWait: {unknownAnswers: 1}} : {...answer, partitionId: 'p1'});
        t.match(results[1], {partitionId: 'p2', success: false, error: 'caller stopped'});
        t.notOk(results[1].failureCode, 'unsubmitted sibling carries no unknown write');
        t.same(addresses, redirect ?
          ['node-live/partition/p1', 'node-next/partition/p1'] : ['node-live/partition/p1']);
      });
  }
}

test('fan-out returns a committed reply after the partition deadline', async (t) => {
  const {executor} = createDeniedPartitionExecutorFixture();
  let now = Date.now();
  executor.nowFn = () => now;
  const deadlineMs = now + 500;
  executor.messageRouter.deliver = async () => {
    now = deadlineMs + 1;
    return buildDeliveryEnvelope({acknowledged: true}, {success: true, changes: 2});
  };
  const {results} = await executor.parallelQueryCoordinator.executeParallel(
    'UPDATE accounts SET balance = 1', ['p1'], [], {forRead: false, timeoutMs: 500, deadlineMs},
  );
  t.match(results, [{partitionId: 'p1', success: true, changes: 2}]);
});

test('fan-out outer deadline bounds an unanswered write with its submitted entry identity',
  async (t) => {
    const {executor} = createDeniedPartitionExecutorFixture();
    const coordinator = executor.parallelQueryCoordinator;
    const entered = Promise.withResolvers();
    const lateReply = Promise.withResolvers();
    executor.messageRouter.deliver = async (_address, request) => {
      entered.resolve(request.entryId);
      return lateReply.promise;
    };
    const running = coordinator.executeParallel('UPDATE accounts SET balance = 1',
      ['p1'], [], {forRead: false, timeoutMs: 500});
    const entryId = await entered.promise;
    const {results} = await running;
    t.match(results[0], {success: false, partitionId: 'p1', errorCode: null,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN, entryId, spentWait: {deliveries: 1, lostAnswers: 1}});
    lateReply.resolve(buildDeliveryEnvelope({acknowledged: true}, {success: true, changes: 1}));
    t.equal(coordinator.activeConnections, 0);
  });

function assertRoutingDenialSurface({
  t,
  surfaceLabel,
  surface,
  expectedDenialFields,
  deniedNodeId,
  denialReasons,
}) {
  t.match(
    surface?.participantFailures?.[0],
    expectedDenialFields,
    `${surfaceLabel} participantFailures[0] should preserve routing denial fields`,
  );
  t.match(
    surface?.firstFailedParticipant,
    expectedDenialFields,
    `${surfaceLabel} firstFailedParticipant should preserve routing denial fields`,
  );
  t.same(
    surface?.firstFailedParticipant?.deniedByNodeId?.[deniedNodeId]
      ?.reasonCodes,
    denialReasons,
    `${surfaceLabel} firstFailedParticipant should preserve deniedByNodeId`,
  );
}

for (const speculativeExecutionEnabled of [false, true]) {
  const modeLabel = speculativeExecutionEnabled ? 'hedged' : 'ordinary';
  test(
    `ParallelQueryCoordinator - ${modeLabel} SELECT preserves routing denial ` +
      'diagnostics end-to-end into participantFailures, admin envelope, and NodeHandle',
    async (t) => {
      const {
        executor,
        deniedNodeId,
        denialReasons,
        readinessDimension,
      } = createDeniedPartitionExecutorFixture();
      executor.parallelQueryCoordinator.speculativeExecutionEnabled =
        speculativeExecutionEnabled;
      const ast = new SQLParser(
        'SELECT id FROM bench_accounts WHERE id >= ?',
      ).parse();

      const selectResult = await executor.executeSelect(
        ast,
        ['p1', 'p2'],
        [1],
        {
          routingReadinessDimension: readinessDimension,
          timeoutMs: 500,
        },
      );

      t.equal(selectResult.success, false, `${modeLabel} SELECT should fail on p2`);
      const expectedDenialFields = {
        partitionId: 'p2',
        routingReasonCode:
          QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
        routingReadinessDimension: readinessDimension,
        routingDenialReasonCodes: denialReasons,
      };
      assertRoutingDenialSurface({
        t,
        surfaceLabel: `${modeLabel} SELECT`,
        surface: selectResult,
        expectedDenialFields,
        deniedNodeId,
        denialReasons,
      });
      assertRoutingDenialSurface({
        t,
        surfaceLabel: `${modeLabel} fanout metrics`,
        surface: selectResult.distributedMetrics?.fanout,
        expectedDenialFields,
        deniedNodeId,
        denialReasons,
      });

      const {envelope, rejectedError} = resolveNodeHandleError(
        `q-select-${modeLabel}`,
        selectResult,
      );
      assertRoutingDenialSurface({
        t,
        surfaceLabel: `${modeLabel} admin envelope`,
        surface: envelope,
        expectedDenialFields,
        deniedNodeId,
        denialReasons,
      });
      t.ok(rejectedError, `${modeLabel} NodeHandle should reject with formatted error`);
      assertRoutingDenialSurface({
        t,
        surfaceLabel: `${modeLabel} NodeHandle error`,
        surface: rejectedError,
        expectedDenialFields,
        deniedNodeId,
        denialReasons,
      });
    },
  );
}

test(
  'DistributedWriteCoordinator - UPDATE, DELETE, and INSERT preserve routing ' +
    'denial diagnostics end-to-end into participantFailures, admin envelope, and NodeHandle',
  async (t) => {
    const readinessDimension =
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    const {
      executor,
      deniedNodeId,
      denialReasons,
    } = createDeniedPartitionExecutorFixture({
      deniedNodeId: 'node-write-denied',
      denialReasons: ['ready_lease_expired'],
      readinessDimension,
    });
    const coordinator = new DistributedWriteCoordinator({
      partitionResolver: {
        resolvePartitionForKey(_table, keyValue) {
          return Number(keyValue) === 1 ? 'p1' : 'p2';
        },
      },
      queryExecutor: executor,
      getTablePartitions() {
        return [
          {partition_id: 'p1', partition_key_start: null, partition_key_end: '5'},
          {partition_id: 'p2', partition_key_start: '5', partition_key_end: null},
        ];
      },
      getTableInfo() {
        return {primaryKey: 'id'};
      },
    });

    const statements = [
      {
        label: 'UPDATE',
        sql: 'UPDATE bench_accounts SET balance = ? WHERE id >= ?',
        params: [100, 1],
        planOptions: {
          partitionIds: ['p1', 'p2'],
          routingReadinessDimension: readinessDimension,
        },
      },
      {
        label: 'DELETE',
        sql: 'DELETE FROM bench_accounts WHERE id >= ?',
        params: [1],
        planOptions: {
          partitionIds: ['p1', 'p2'],
          routingReadinessDimension: readinessDimension,
        },
      },
      {
        label: 'INSERT',
        sql: 'INSERT INTO bench_accounts (id, balance) VALUES (?, ?), (?, ?)',
        params: [1, 10, 9, 20],
        planOptions: {
          routingReadinessDimension: readinessDimension,
        },
      },
    ];

    for (const statement of statements) {
      const ast = new SQLParser(statement.sql).parse();
      const plan = coordinator.createWritePlan(
        ast,
        statement.params,
        statement.planOptions,
      );
      const writeResult = await coordinator.executePlan(
        plan,
        statement.params,
        {
          routingReadinessDimension: readinessDimension,
          timeoutMs: 500,
        },
      );

      t.equal(writeResult.success, false, `${statement.label} should fail on p2`);
      const expectedDenialFields = {
        partitionId: 'p2',
        routingReasonCode:
          QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
        routingReadinessDimension: readinessDimension,
        routingDenialReasonCodes: denialReasons,
      };
      t.match(
        writeResult.participantFailures?.[0],
        expectedDenialFields,
        `${statement.label} participantFailures[0] should preserve routing denial fields`,
      );
      t.same(
        writeResult.participantFailures?.[0]?.deniedByNodeId?.[deniedNodeId]
          ?.reasonCodes,
        denialReasons,
        `${statement.label} participantFailures[0] should preserve deniedByNodeId`,
      );
      t.match(
        writeResult.firstFailedParticipant,
        expectedDenialFields,
        `${statement.label} firstFailedParticipant should preserve routing denial fields`,
      );

      const {envelope, rejectedError} = resolveNodeHandleError(
        `q-write-${statement.label.toLowerCase()}`,
        writeResult,
      );
      t.match(
        envelope.firstFailedParticipant,
        expectedDenialFields,
        `${statement.label} admin envelope firstFailedParticipant should preserve routing denial fields`,
      );
      t.match(
        rejectedError?.firstFailedParticipant,
        expectedDenialFields,
        `${statement.label} NodeHandle error.firstFailedParticipant should preserve routing denial fields`,
      );
      t.same(
        rejectedError?.firstFailedParticipant?.deniedByNodeId?.[deniedNodeId]
          ?.reasonCodes,
        denialReasons,
        `${statement.label} NodeHandle error.firstFailedParticipant should preserve deniedByNodeId`,
      );
    }
  },
);
