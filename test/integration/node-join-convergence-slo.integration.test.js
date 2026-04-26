/**
 * Integration test: node-join convergence SLOs.
 *
 * Validates that after a node join:
 * 1. Leadership changes stay bounded.
 * 2. Partition voter counts do not remain above target.
 * 3. The system settles within a fixed window.
 */

import tap, {test} from '../../src/test-helpers/tap.js';
import {request as httpRequest} from 'node:http';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {
  TEST_CONFIG,
  cleanupTestEnvironment,
  createInProcHttpPost,
  floodBufferedLogs,
  getUniquePort,
  installTransientBootstrapLeaderGateFixture,
  installTransientLeaderMetadataFixture,
  installTransientSqlReadinessFixture,
  gracefulJoiningShutdown,
  gracefulShutdown,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const TARGET_VOTER_COUNT = 3;
const SETTLE_TIMEOUT_MS = 20000;
const QUIET_WINDOW_MS = 5000;
const MAX_SUSTAINED_OVERTARGET_MS = 2000;
const SAMPLE_INTERVAL_MS = 250;
const INTEGRATION_TEST_TIMEOUT_MS = 60000;
const REAL_NETWORK_READINESS_TIMEOUT_MS = 12000;
const REAL_NETWORK_READINESS_INTERVAL_MS = 100;
const READINESS_STRESS_PROBE_TIMEOUT_MS = 120;
const READINESS_STRESS_PROBE_ATTEMPTS = 40;
const READINESS_STRESS_PROBE_INTERVAL_MS = 100;
const READINESS_STRESS_BLOCKING_WRITE_MS = 5;
const READINESS_STRESS_BUFFERED_LOGS = 300;
const READINESS_STRESS_LOG_BATCH_SIZE = 20;
const READINESS_STRESS_MAX_EVENT_LOOP_LAG_MS = 1500;
const READINESS_STRESS_MAX_ABORTED_PROBES = 3;
const READINESS_STRESS_MIN_READY_PROBES = READINESS_STRESS_PROBE_ATTEMPTS -
  READINESS_STRESS_MAX_ABORTED_PROBES;

tap.setTimeout(INTEGRATION_TEST_TIMEOUT_MS);

function sleepForMs(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function probeBootstrapReadyRaw(seedApiPort, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0 ?
    Math.floor(options.timeoutMs) :
    null;
  const path = typeof options.path === 'string' && options.path.length > 0 ?
    options.path :
    '/bootstrap/ready';

  return new Promise((resolve) => {
    let settled = false;
    const complete = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const request = httpRequest({
      host: '127.0.0.1',
      port: seedApiPort,
      path,
      method: 'GET',
      headers: {
        Connection: 'close',
      },
      agent: false,
    }, (response) => {
      let rawBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        rawBody += chunk;
      });
      response.on('end', () => {
        complete({
          statusCode: Number.isInteger(response.statusCode) ?
            response.statusCode :
            null,
          rawBody,
          aborted: false,
        });
      });
      response.on('error', () => {
        complete({
          statusCode: null,
          rawBody,
          aborted: true,
        });
      });
    });

    request.on('error', () => {
      complete({
        statusCode: null,
        rawBody: '',
        aborted: true,
      });
    });

    if (timeoutMs !== null) {
      request.setTimeout(timeoutMs, () => {
        request.destroy();
        complete({
          statusCode: null,
          rawBody: '',
          aborted: true,
        });
      });
    }

    request.end();
  });
}

async function probeBootstrapReadyWithTimeout(seedApiPort, timeoutMs, options = {}) {
  const probe = await probeBootstrapReadyRaw(seedApiPort, {
    ...options,
    timeoutMs,
  });
  return {
    statusCode: probe.statusCode,
    aborted: probe.aborted,
  };
}

async function probeBootstrapReady(seedApiPort, options = {}) {
  const response = await probeBootstrapReadyRaw(seedApiPort, options);
  const rawBody = response.rawBody;
  let parsedBody = null;
  if (rawBody.length > 0) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (parseError) {
      // Non-JSON response body during bootstrap probe is expected
      // while the node is still initializing
      console.warn('bootstrap probe JSON parse failed', parseError);
      parsedBody = null;
    }
  }
  return {
    statusCode: response.statusCode,
    body: parsedBody,
  };
}

function getNonIgnorableActiveHandles() {
  const isIgnorableHandle = (handle) => {
    return handle === process.stdin ||
      handle === process.stdout ||
      handle === process.stderr ||
      handle?._isStdio === true;
  };

  return process._getActiveHandles().filter((handle) => {
    return !isIgnorableHandle(handle);
  });
}

function isVoterReadyPartitionReplica(row) {
  if (!row) {
    return false;
  }
  if (row.service_type !== 'partition') {
    return false;
  }
  if (row.status !== ReplicaStatus.ACTIVE) {
    return false;
  }
  const raftRole = typeof row.raft_role === 'string' ?
    row.raft_role.toLowerCase() :
    null;
  // Require an explicit non-learner raft role to count as a voter.
  // Transitional rows without role metadata are not voter-ready yet.
  if (!raftRole || raftRole === 'learner') {
    return false;
  }
  if (!row.address) {
    return false;
  }
  return true;
}

function collectPartitionVoterCounts(systemTableCache) {
  const rows = systemTableCache.filter(
    SYSTEM_TABLE_NAME.SERVICES,
    (row) => isVoterReadyPartitionReplica(row),
  ) || [];

  const byPartition = new Map();
  for (const row of rows) {
    const partitionId = row.partition_id;
    if (!partitionId) {
      continue;
    }
    byPartition.set(partitionId, (byPartition.get(partitionId) || 0) + 1);
  }
  return byPartition;
}

function updateOverTargetState(overTargetState, countsByPartition, now) {
  const partitionIds = new Set([
    ...countsByPartition.keys(),
    ...overTargetState.keys(),
  ]);

  for (const partitionId of partitionIds) {
    const count = countsByPartition.get(partitionId) || 0;
    const state = overTargetState.get(partitionId) || {
      inOverTargetSince: null,
      maxOverTargetMs: 0,
    };

    if (count > TARGET_VOTER_COUNT) {
      if (state.inOverTargetSince === null) {
        state.inOverTargetSince = now;
      }
    } else if (state.inOverTargetSince !== null) {
      const duration = now - state.inOverTargetSince;
      state.maxOverTargetMs = Math.max(state.maxOverTargetMs, duration);
      state.inOverTargetSince = null;
    }

    overTargetState.set(partitionId, state);
  }
}

function finalizeOverTargetState(overTargetState, endTimeMs) {
  for (const state of overTargetState.values()) {
    if (state.inOverTargetSince !== null) {
      const duration = endTimeMs - state.inOverTargetSince;
      state.maxOverTargetMs = Math.max(state.maxOverTargetMs, duration);
      state.inOverTargetSince = null;
    }
  }
}

function registerLeaderChangeTracking(partitionServices, counter) {
  const subscriptions = [];
  if (!partitionServices || typeof partitionServices.values !== 'function') {
    return () => {};
  }

  for (const service of partitionServices.values()) {
    const partitionId = service?.partitionId;
    if (!partitionId) {
      continue;
    }
    const handler = () => {
      counter.total++;
      counter.lastChangeAt = Date.now();
      counter.byPartition.set(
        partitionId,
        (counter.byPartition.get(partitionId) || 0) + 1,
      );
    };
    service.on(PARTITION_SERVICE_EVENT.LEADER_ELECTED, handler);
    subscriptions.push({service, handler});
  }

  return () => {
    for (const subscription of subscriptions) {
      subscription.service.off(
        PARTITION_SERVICE_EVENT.LEADER_ELECTED,
        subscription.handler,
      );
    }
  };
}

test('Node join convergence SLO', {timeout: INTEGRATION_TEST_TIMEOUT_MS}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment({
      raft: {
        electionTimeoutMinMs: 300,
        electionTimeoutMaxMs: 900,
        heartbeatIntervalMs: 75,
      },
      rebalancer: {
        periodicCheckIntervalMs: 4000,
        periodicCheckJitterMs: 500,
        criticalCheckDelayMs: 1000,
        stabilizationPeriodMs: 2000,
      },
      replicaHandler: {
        syncTimeoutMs: 15000,
      },
    });
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('settles after join without prolonged over-target voters', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440201';
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440202';
    const seedWsPort = getUniquePort();
    const joiningWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;
    let removeSeedSubscriptions = () => {};
    let removeJoiningSubscriptions = () => {};

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const seedQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });
      await seedApi.initialize(0, {listen: false});
      seedApi.setSqlQueryEngine(seedQueryEngine);

      const leaderCounter = {
        total: 0,
        byPartition: new Map(),
        lastChangeAt: Date.now(),
      };

      removeSeedSubscriptions = registerLeaderChangeTracking(
        bootstrapResult.partitionServices,
        leaderCounter,
      );

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 12000,
        },
        httpPost: createInProcHttpPost(seedApi),
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'joining node should join successfully');

      removeJoiningSubscriptions = registerLeaderChangeTracking(
        joinResult.partitionServices,
        leaderCounter,
      );

      const nodeReadyObserved = await waitFor(async () => {
        const nodeRow = systemTableCache.get(SYSTEM_TABLE_NAME.NODES, joiningNodeId);
        return !!nodeRow &&
          nodeRow.status === 'active' &&
          nodeRow.connection_state === 'ready';
      }, 10000, 100);
      t.equal(nodeReadyObserved, true, 'joining node should become ready in cache');

      const overTargetState = new Map();
      let settled = false;
      let finalCounts = new Map();
      const settleStart = Date.now();
      const settleDeadline = settleStart + SETTLE_TIMEOUT_MS;

      while (Date.now() <= settleDeadline) {
        const now = Date.now();
        finalCounts = collectPartitionVoterCounts(systemTableCache);
        updateOverTargetState(overTargetState, finalCounts, now);

        const hasCurrentOverTarget = [...finalCounts.values()].some(
          (count) => count > TARGET_VOTER_COUNT,
        );
        const quietElapsedMs = now - leaderCounter.lastChangeAt;
        if (!hasCurrentOverTarget && quietElapsedMs >= QUIET_WINDOW_MS) {
          settled = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
      }

      finalizeOverTargetState(overTargetState, Date.now());

      const systemPartitionCount = new Set(
        [...bootstrapResult.partitionServices.values()].map((service) => service.partitionId),
      ).size;
      const maxAllowedLeaderChanges = systemPartitionCount * 4;
      const maxObservedOverTargetMs = Math.max(
        0,
        ...[...overTargetState.values()].map((state) => state.maxOverTargetMs),
      );

      t.equal(settled, true, 'cluster should settle within convergence SLO window');
      t.ok(
        leaderCounter.total <= maxAllowedLeaderChanges,
        `leadership changes should stay bounded (${leaderCounter.total} <= ` +
          `${maxAllowedLeaderChanges})`,
      );
      t.ok(
        maxObservedOverTargetMs <= MAX_SUSTAINED_OVERTARGET_MS,
        'over-target voter duration should stay bounded (' +
          `${maxObservedOverTargetMs}ms <= ${MAX_SUSTAINED_OVERTARGET_MS}ms)`,
      );
      t.notOk(
        [...finalCounts.values()].some((count) => count > TARGET_VOTER_COUNT),
        'final voter counts should not exceed target',
      );
    } finally {
      removeSeedSubscriptions();
      removeJoiningSubscriptions();
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });
});

test('Node join convergence SLO real-network readiness path',
  {timeout: INTEGRATION_TEST_TIMEOUT_MS}, async (t) => {
    initializeTestEnvironment({
      raft: {
        electionTimeoutMinMs: 300,
        electionTimeoutMaxMs: 900,
        heartbeatIntervalMs: 75,
      },
      rebalancer: {
        periodicCheckIntervalMs: 4000,
        periodicCheckJitterMs: 500,
        criticalCheckDelayMs: 1000,
        stabilizationPeriodMs: 2000,
      },
      replicaHandler: {
        syncTimeoutMs: 15000,
      },
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655440211';
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440212';
    const seedWsPort = getUniquePort();
    const joiningWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');
      if (!bootstrapResult.success) {
        return;
      }

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const seedQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      const readinessState = new BootstrapReadinessState({
        readyStableWindowMs: 120,
        demotionFailureThreshold: 2,
        retryAfterMs: 100,
      });
      const readinessTransitions = [];
      readinessState.on('transition', (transition) => {
        readinessTransitions.push(transition);
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
        readinessState,
      });

      await seedApi.initialize(0, {listen: true});
      const listenerAddress = seedApi.getFastify().server.address();
      const seedApiPort = listenerAddress &&
      typeof listenerAddress === 'object' &&
      Number.isInteger(listenerAddress.port) ?
        listenerAddress.port :
        0;
      t.ok(seedApiPort > 0, 'seed API should listen on a concrete network port');

      const initialProbe = await probeBootstrapReady(seedApiPort);
      t.equal(initialProbe.statusCode, 503,
        'readiness probe should be not-ready before SQL engine is wired');
      t.equal(initialProbe.body?.ready, false,
        'readiness probe payload should expose ready=false before wiring');

      seedApi.setSqlQueryEngine(seedQueryEngine);

      let observedReady = false;
      const readyProbeObserved = await waitFor(async () => {
        const probe = await probeBootstrapReady(seedApiPort);
        if (probe.statusCode === 200 && probe.body?.ready === true) {
          observedReady = true;
          return true;
        }
        return false;
      }, REAL_NETWORK_READINESS_TIMEOUT_MS, REAL_NETWORK_READINESS_INTERVAL_MS);

      t.equal(readyProbeObserved, true,
        'readiness probe should transition to ready over real network listener');
      t.equal(observedReady, true,
        'readiness probe should eventually expose ready=true over HTTP');
      // The HTTP probe may return ready=true via bootstrap-join scope
      // projection while the internal state is still in JOIN_READY phase
      // (waiting for the stable window). Either an actual ready=true
      // transition or reaching JOIN_READY satisfies the contract.
      t.ok(
        readinessTransitions.some((tr) =>
          tr.ready === true ||
        tr.phase === LIFECYCLE_PHASE.JOIN_READY),
        'readiness transitions should reach JOIN_READY or ready=true',
      );

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: `http://127.0.0.1:${seedApiPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 12000,
        },
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'joining node should join successfully');

      const nodeReadyObserved = await waitFor(async () => {
        const nodeRow = systemTableCache.get(SYSTEM_TABLE_NAME.NODES, joiningNodeId);
        return !!nodeRow &&
        nodeRow.status === 'active' &&
        nodeRow.connection_state === 'ready';
      }, 10000, 100);
      t.equal(nodeReadyObserved, true, 'joining node should become ready in cache');
    } finally {
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      await cleanupTestEnvironment();
    }
  });

test('Readiness endpoint remains reachable during background log buffer flush',
  {timeout: INTEGRATION_TEST_TIMEOUT_MS}, async (t) => {
    initializeTestEnvironment({
      raft: {
        electionTimeoutMinMs: 300,
        electionTimeoutMaxMs: 900,
        heartbeatIntervalMs: 75,
      },
      rebalancer: {
        periodicCheckIntervalMs: 4000,
        periodicCheckJitterMs: 500,
        criticalCheckDelayMs: 1000,
        stabilizationPeriodMs: 2000,
      },
      replicaHandler: {
        syncTimeoutMs: 15000,
      },
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655440221';
    const seedWsPort = getUniquePort();
    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let logsTableService = null;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');
      if (!bootstrapResult.success) {
        return;
      }

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const seedQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      const readinessState = new BootstrapReadinessState({
        readyStableWindowMs: 120,
        demotionFailureThreshold: 2,
        retryAfterMs: 100,
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
        readinessState,
      });

      await seedApi.initialize(0, {listen: true});
      const listenerAddress = seedApi.getFastify().server.address();
      const seedApiPort = listenerAddress &&
        typeof listenerAddress === 'object' &&
        Number.isInteger(listenerAddress.port) ?
        listenerAddress.port :
        0;
      t.ok(seedApiPort > 0, 'seed API should listen on a concrete network port');

      seedApi.setSqlQueryEngine(seedQueryEngine);
      const readyProbeObserved = await waitFor(async () => {
        const probe = await probeBootstrapReady(seedApiPort);
        return probe.statusCode === 200 && probe.body?.ready === true;
      }, REAL_NETWORK_READINESS_TIMEOUT_MS, REAL_NETWORK_READINESS_INTERVAL_MS);
      t.equal(readyProbeObserved, true,
        'readiness probe should be healthy before stress flush starts');

      const loggingService = LoggingService.getInstance();
      loggingService.logger = {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        flush: () => {},
      };
      for (let index = 0; index < READINESS_STRESS_BUFFERED_LOGS; index++) {
        loggingService.error('readiness.stress.log-entry', {index});
      }
      t.ok(
        loggingService.getBufferSize() >= READINESS_STRESS_BUFFERED_LOGS,
        'stress setup should buffer logs before logs-table hookup',
      );

      logsTableService = LogsTableService.getInstance();
      logsTableService.initialize({
        batchSize: READINESS_STRESS_LOG_BATCH_SIZE,
        logsOwner: {
          async upsertLog() {
            await sleepForMs(READINESS_STRESS_BLOCKING_WRITE_MS);
          },
        },
      });
      const flushedCount = await logsTableService.connectToLoggingService();
      t.equal(
        flushedCount,
        READINESS_STRESS_BUFFERED_LOGS,
        'stress hookup should schedule full buffered flush',
      );

      let abortedCount = 0;
      let nonSuccessCount = 0;
      let readyCount = 0;
      let maxProbeLagMs = 0;
      let nextProbeAt = Date.now();
      for (let attempt = 0; attempt < READINESS_STRESS_PROBE_ATTEMPTS; attempt++) {
        const probeStartedAt = Date.now();
        const probeLagMs = Math.max(0, probeStartedAt - nextProbeAt);
        if (probeLagMs > maxProbeLagMs) {
          maxProbeLagMs = probeLagMs;
        }

        const probe = await probeBootstrapReadyWithTimeout(
          seedApiPort,
          READINESS_STRESS_PROBE_TIMEOUT_MS,
        );
        if (probe.aborted) {
          abortedCount += 1;
        } else if (probe.statusCode === 200) {
          readyCount += 1;
        } else {
          nonSuccessCount += 1;
        }

        nextProbeAt += READINESS_STRESS_PROBE_INTERVAL_MS;
        const delayMs = Math.max(0, nextProbeAt - Date.now());
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      t.ok(
        abortedCount <= READINESS_STRESS_MAX_ABORTED_PROBES,
        'readiness probes should avoid repeated timeouts during background logs flush ' +
          `(timeouts=${abortedCount})`,
      );
      t.equal(
        nonSuccessCount,
        0,
        'readiness probes should not return non-200 statuses during stress flush',
      );
      t.ok(
        readyCount >= READINESS_STRESS_MIN_READY_PROBES,
        'readiness probes should remain healthy for nearly all stress attempts ' +
          `(ready=${readyCount})`,
      );
      t.ok(
        maxProbeLagMs <= READINESS_STRESS_MAX_EVENT_LOOP_LAG_MS,
        'readiness probing cadence should not suffer large event-loop stalls ' +
          `(maxLag=${maxProbeLagMs}ms)`,
      );
    } finally {
      if (logsTableService) {
        await logsTableService.shutdown().catch(() => {});
      }
      LogsTableService.resetInstance();
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      await cleanupTestEnvironment();
    }
  });

test('Real-listener join retries through transient SQL/metadata blockers under class-C flood',
  {timeout: INTEGRATION_TEST_TIMEOUT_MS}, async (t) => {
    initializeTestEnvironment({
      raft: {
        electionTimeoutMinMs: 300,
        electionTimeoutMaxMs: 900,
        heartbeatIntervalMs: 75,
      },
      rebalancer: {
        periodicCheckIntervalMs: 4000,
        periodicCheckJitterMs: 500,
        criticalCheckDelayMs: 1000,
        stabilizationPeriodMs: 2000,
      },
      replicaHandler: {
        syncTimeoutMs: 15000,
      },
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655440231';
    const seedWsPort = getUniquePort();
    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;
    let logsTableService = null;
    let sqlFixture = null;
    let leaderProbeFixture = null;
    let leaderGateFixture = null;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');
      if (!bootstrapResult.success) {
        return;
      }

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const seedQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      const readinessState = new BootstrapReadinessState({
        readyStableWindowMs: 100,
        demotionFailureThreshold: 2,
        retryAfterMs: 100,
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
        readinessState,
      });

      await seedApi.initialize(0, {listen: true});
      const listenerAddress = seedApi.getFastify().server.address();
      const seedApiPort = listenerAddress &&
        typeof listenerAddress === 'object' &&
        Number.isInteger(listenerAddress.port) ?
        listenerAddress.port :
        0;
      t.ok(seedApiPort > 0, 'seed API should listen on a real network port');

      seedApi.setSqlQueryEngine(seedQueryEngine);
      sqlFixture = installTransientSqlReadinessFixture(seedApi, {
        blockedEvaluations: 20,
      });
      leaderProbeFixture = installTransientLeaderMetadataFixture(seedApi, {
        blockedEvaluations: 20,
      });
      leaderGateFixture = installTransientBootstrapLeaderGateFixture(seedApi, {
        blockedCalls: 3,
      });

      const loggingService = LoggingService.getInstance();
      loggingService.logger = {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        flush: () => {},
      };
      const buffered = floodBufferedLogs(loggingService, {
        count: READINESS_STRESS_BUFFERED_LOGS,
        message: 'readiness.join.fixture.log',
      });
      t.ok(buffered >= READINESS_STRESS_BUFFERED_LOGS,
        'fixture should flood buffered logs before logs-table connection');

      logsTableService = LogsTableService.getInstance();
      logsTableService.initialize({
        batchSize: READINESS_STRESS_LOG_BATCH_SIZE,
        logsOwner: {
          async upsertLog() {
            await sleepForMs(READINESS_STRESS_BLOCKING_WRITE_MS);
          },
        },
      });
      await logsTableService.connectToLoggingService();

      let sawReadinessUnavailable = false;
      const readyObserved = await waitFor(async () => {
        const strictProbe = await probeBootstrapReady(seedApiPort, {
          path: '/readyz',
        });
        if (strictProbe.statusCode === 503) {
          sawReadinessUnavailable = true;
        }
        const bootstrapProbe = await probeBootstrapReady(seedApiPort);
        return bootstrapProbe.statusCode === 200 &&
          bootstrapProbe.body?.ready === true;
      }, REAL_NETWORK_READINESS_TIMEOUT_MS, REAL_NETWORK_READINESS_INTERVAL_MS);
      t.equal(readyObserved, true,
        'bootstrap-join readiness probe should recover to 200 after transient blockers clear');
      t.equal(sawReadinessUnavailable, true,
        'strict readiness should expose unavailable state while transient blockers are active');

      joiningService = new NodeJoiningService({
        nodeId: '550e8400-e29b-41d4-a716-446655440232',
        nodeAddress: `ws://localhost:${getUniquePort()}`,
        seedNodeAddress: `http://127.0.0.1:${seedApiPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: getUniquePort(),
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 1200,
          leadershipWaitTimeoutMs: 12000,
          leadershipWaitInitialDelayMs: 50,
          leadershipWaitMaxDelayMs: 100,
        },
      });

      const realHttpPost = joiningService.httpPost.bind(joiningService);
      let bootstrapAttempts = 0;
      joiningService.httpPostImpl = async (url, body) => {
        bootstrapAttempts += 1;
        return realHttpPost(url, body);
      };

      await joiningService.phaseContactSeed();
      t.ok(bootstrapAttempts > 1,
        'joining service should retry bootstrap while transient blockers persist');
      t.equal(joiningService.bootstrapResponse?.success, true,
        'joining service should eventually receive bootstrap response');
    } finally {
      if (sqlFixture) {
        sqlFixture.restore();
      }
      if (leaderProbeFixture) {
        leaderProbeFixture.restore();
      }
      if (leaderGateFixture) {
        leaderGateFixture.restore();
      }
      if (logsTableService) {
        await logsTableService.shutdown().catch(() => {});
      }
      LogsTableService.resetInstance();
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
      await cleanupTestEnvironment();
    }
  });

test('Node-join convergence tests do not leak ref-ed handles', async (t) => {
  await cleanupTestEnvironment();
  LogsTableService.resetInstance();
  LoggingService.resetInstance();

  const drained = await waitFor(() => {
    return getNonIgnorableActiveHandles().length === 0;
  }, 2000, 50);
  const remainingHandles = getNonIgnorableActiveHandles();
  const handleNames = remainingHandles.map((handle) => {
    return handle?.constructor?.name || 'unknown';
  });
  const handleDetails = remainingHandles.map((handle) => {
    return {
      name: handle?.constructor?.name || 'unknown',
      fd: handle?.fd ?? null,
      localPort: handle?.localPort ?? null,
      remotePort: handle?.remotePort ?? null,
      destroyed: handle?.destroyed ?? null,
      connecting: handle?.connecting ?? null,
      pending: handle?.pending ?? null,
      readable: handle?.readable ?? null,
      writable: handle?.writable ?? null,
      isStdio: handle?._isStdio ?? null,
    };
  });
  t.equal(drained, true, 'ref-ed handles should drain after cleanup');
  t.equal(
    remainingHandles.length,
    0,
    `test should not leak ref-ed handles (remaining=${handleNames.join(', ')} details=${JSON.stringify(handleDetails)})`,
  );

  if (process.env.TAP === '1') {
    setTimeout(() => {
      process.exit(0);
    }, 0);
  }
});
