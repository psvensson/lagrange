/**
 * R09 supersession alignment: sealed quest
 * `serve-eligibility-committed-epoch-read`
 * (`solve/quests/serve-eligibility-committed-epoch-read/quest.json`, commit
 * `2f83f97fdc48`) deleted the internal admission-convergence polling loop in
 * `SQLQueryEngine.waitForProvisionTargetNodeIds` and replaced it with a single
 * parent-deadline-bounded `controlPlaneReadinessService.readServeEligibility({
 * timeoutMs, timeoutBudget, cancellationToken})` call when the committed
 * serving cohort is unavailable.
 *
 * This suite binds `createDeadlineFixture` directly to a real
 * `ServeEligibilityOwner` on a deterministic virtual clock so the parent
 * `timeoutBudget` capping (`30ms < 10_000ms`), in-budget `readServeEligibility`
 * completion (`29ms < 45ms`), repeated uncommitted refresh wakeups stopping at
 * the original deadline, caller `CancellationToken` abort, and C6
 * `waitForPartitionServiceMetadata` post-wait cancellation fence are all
 * exercised through the live `waitForProvisionTargetNodeIds` /
 * `provisionInitialTablePartition` code paths.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {
  ServeEligibilityOwner,
} from '../../src/control-plane/serve-eligibility-owner.js';
import {createTimeoutBudget} from '../../src/control-plane/timeout-budget.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  createMockMessageRouter,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';
import {
  committedMembershipPublicationRow,
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const OWNER_READ_TIMEOUT_MS = 10_000;
const REFRESH_STEP_MS = 5;
const LEASE_DURATION_MS = 3_600_000;
const MICROTASK_DRAIN_TURNS = 12;

const HOLD = Object.freeze({
  allowed: false,
  decisionType: 'deferred',
  admissionResult: {
    allowed: false,
    decisionType: 'deferred',
    blockingReasons: ['operation_ledger_quorum_concentrated'],
  },
});
const ADMIT = Object.freeze({
  allowed: true,
  decisionType: 'admitted',
  admissionResult: {allowed: true, decisionType: 'admitted'},
});

function buildCommittedNodeRows(nowMs) {
  return NODE_IDS.map((nodeId) => ({
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.BOOT_INCARNATION]: 1,
    [COLUMN.LAST_HEARTBEAT]: nowMs,
    [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + LEASE_DURATION_MS,
  }));
}

async function flushMicrotasks() {
  for (let i = 0; i < MICROTASK_DRAIN_TURNS; i += 1) {
    await Promise.resolve();
  }
}

function createVirtualTimerQueue(getNowMs) {
  let nextId = 0;
  const entries = [];
  return {
    setTimeout(callback, delayMs) {
      nextId += 1;
      const entry = {
        id: nextId,
        dueAtMs: getNowMs() + Math.max(0, Number(delayMs) || 0),
        callback,
        cleared: false,
      };
      entries.push(entry);
      return entry;
    },
    clearTimeout(entry) {
      if (entry && typeof entry === 'object') {
        entry.cleared = true;
      }
    },
    popEarliest() {
      let bestIndex = -1;
      for (let i = 0; i < entries.length; i += 1) {
        const candidate = entries[i];
        if (candidate.cleared) continue;
        if (
          bestIndex < 0 ||
          candidate.dueAtMs < entries[bestIndex].dueAtMs ||
          (candidate.dueAtMs === entries[bestIndex].dueAtMs &&
            candidate.id < entries[bestIndex].id)
        ) {
          bestIndex = i;
        }
      }
      if (bestIndex < 0) return null;
      const [picked] = entries.splice(bestIndex, 1);
      return picked;
    },
  };
}

function createDeadlineFixture(options = {}) {
  let nowMs = options.nowMs || 0;
  let refreshProbeCount = 0;
  let lastReadOptions = null;
  const admitAtMs = options.admitAtMs ?? Number.POSITIVE_INFINITY;
  const cancellationToken = options.cancellationToken || null;
  const nodes = NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    status: 'active',
  }));
  const services = [];
  const systemCache = {
    getAll(tableName) {
      if (tableName === TABLES.NODES) return nodes;
      if (tableName === TABLES.SERVICES) return services;
      return [];
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
  };

  const timerQueue = createVirtualTimerQueue(() => nowMs);
  const delayVirtualMs = (delayMs) =>
    new Promise((resolve) => {
      timerQueue.setTimeout(resolve, delayMs);
    });

  let serveEligibilityOwner = null;
  serveEligibilityOwner = new ServeEligibilityOwner({
    async readCommittedRows(tableName) {
      if (tableName === TABLES.NODES) {
        return {success: true, rows: buildCommittedNodeRows(nowMs)};
      }
      if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
        refreshProbeCount += 1;
        const stepMs = Number.isFinite(admitAtMs) ?
          Math.min(REFRESH_STEP_MS, Math.max(0, admitAtMs - nowMs)) :
          REFRESH_STEP_MS;
        await delayVirtualMs(stepMs);
        if (nowMs >= admitAtMs) {
          return {
            success: true,
            rows: [committedMembershipPublicationRow(NODE_IDS, nowMs)],
          };
        }
        // Source wakeups continue arriving while publication has not yet
        // committed, keeping the refresh loop active until caller deadline.
        serveEligibilityOwner.noteNodeSourceChange({
          [COLUMN.NODE_ID]: NODE_IDS[0],
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        });
        return {success: true, rows: []};
      }
      return {success: false, rows: []};
    },
    isNodeLoadReady: () => true,
    now: () => nowMs,
    readTimeoutMs: OWNER_READ_TIMEOUT_MS,
    setTimeout: (fn, ms) => timerQueue.setTimeout(fn, ms),
    clearTimeout: (handle) => timerQueue.clearTimeout(handle),
  });

  const baseReadiness = createProvisioningReadyService(systemCache);
  const controlPlaneReadinessService = {
    ...baseReadiness,
    answerServeEligibility(nodeId) {
      return serveEligibilityOwner.answer(nodeId);
    },
    answerServeCohort(nodeIds) {
      return serveEligibilityOwner.answerCohort(nodeIds);
    },
    async readServeEligibility(readOptions = {}) {
      lastReadOptions = readOptions;
      let cancelTimer = null;
      if (
        cancellationToken &&
        Number.isFinite(options.cancelAtMs) &&
        !cancellationToken.isCancelled()
      ) {
        cancelTimer = timerQueue.setTimeout(() => {
          cancellationToken.cancel('caller cancelled provisioning');
        }, Math.max(0, options.cancelAtMs - nowMs));
      }
      let pendingWait = true;
      const readPromise = serveEligibilityOwner
        .readServeEligibility(readOptions)
        .finally(() => {
          pendingWait = false;
          if (cancelTimer) {
            timerQueue.clearTimeout(cancelTimer);
          }
        });
      // Prevent unhandled rejection noise while pumping microtasks prior to
      // returning `readPromise` to `waitForProvisionTargetNodeIds`.
      readPromise.catch(() => {});
      await flushMicrotasks();
      while (pendingWait) {
        const nextTimer = timerQueue.popEarliest();
        if (!nextTimer) break;
        nowMs = nextTimer.dueAtMs;
        nextTimer.callback();
        await flushMicrotasks();
      }
      return readPromise;
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission() {
      return nowMs >= admitAtMs ? ADMIT : HOLD;
    },
    async createOperation(move) {
      return {
        operationId: `op-${move.nodeId}`,
        replicaId: `${move.partitionId}-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id: operation.replicaId,
        replica_id: operation.replicaId,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === 'node-a' ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    controlPlaneReadinessService,
    nowFn: () => nowMs,
    tablePartitionProvisioningTimeoutMs:
      options.innerProvisioningTimeoutMs || 90,
    tablePartitionTargetNodeConvergenceTimeoutMs: OWNER_READ_TIMEOUT_MS,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  if (options.cancelAfterMetadataWait === true) {
    const cancelAfterMetadata = async () => {
      cancellationToken?.cancel('caller cancelled after metadata wait');
    };
    engine.waitForPartitionServiceMetadata = cancelAfterMetadata;
    engine.waitForMinimumRoutableReplicaMetadata = cancelAfterMetadata;
  } else {
    engine.waitForPartitionServiceMetadata = async () => {};
  }
  engine.sleep = async (durationMs) => {
    nowMs += Math.max(0, durationMs);
  };
  return {
    engine,
    getLastReadOptions: () => lastReadOptions,
    getRefreshProbeCount: () => refreshProbeCount,
    getNowMs: () => nowMs,
  };
}

function createParentBudget(configuredBudgetMs, now) {
  return createTimeoutBudget({configuredBudgetMs, now});
}

// The caller-owned deadline enters at the provisioning owner: the durable
// CREATE TABLE job provisions with no caller budget, while managed split and
// merge workflows call `provisionInitialTablePartition` with theirs.
async function executeCreate(engine, timeoutBudget, cancellationToken = null) {
  try {
    const summary = await engine.provisionInitialTablePartition({
      partitionId: 'tbl-deadline-probe-p1',
      replicaCount: NODE_IDS.length,
      minimumRoutableReplicaCount: 2,
      minimumRoutableReplicaCountWasDefaulted: true,
      timeoutBudget,
      cancellationToken,
    });
    return {success: true, summary};
  } catch (error) {
    return {success: false, error: error.message};
  }
}

test('provisioning parent deadline - outer 30ms budget clamps an inner ' +
  '10000ms readiness refresh', async (t) => {
  const fixture = createDeadlineFixture({admitAtMs: 31});
  const budget = createParentBudget(30, fixture.getNowMs);

  const result = await executeCreate(fixture.engine, budget);

  t.equal(result.success, false,
    'progress after the caller deadline cannot make provisioning succeed');
  t.equal(
    fixture.getLastReadOptions()?.timeoutMs,
    OWNER_READ_TIMEOUT_MS,
    'waitForProvisionTargetNodeIds passes its 10s convergence window',
  );
  t.equal(
    fixture.getLastReadOptions()?.timeoutBudget,
    budget,
    'waitForProvisionTargetNodeIds forwards the caller timeoutBudget',
  );
  t.equal(fixture.getNowMs(), budget.deadlineMs,
    'virtual time stops at the 30ms caller-owned deadline (< 10000ms)');
});

test('provisioning parent deadline - readServeEligibility completion before ' +
  'parent deadline (29ms < 45ms) succeeds', async (t) => {
  const fixture = createDeadlineFixture({admitAtMs: 29});
  const budget = createParentBudget(45, fixture.getNowMs);

  const result = await executeCreate(fixture.engine, budget);

  t.equal(result.success, true,
    'readServeEligibility completion inside the parent budget succeeds');
  t.equal(fixture.getNowMs(), 29,
    'the in-budget committed refresh settles at 29ms (< 45ms parent budget)');
});

test('provisioning parent deadline - repeated wakeups and no progress stop at ' +
  'the original deadline', async (t) => {
  const fixture = createDeadlineFixture();
  const budget = createParentBudget(30, fixture.getNowMs);

  const result = await executeCreate(fixture.engine, budget);

  t.equal(result.success, false);
  t.equal(fixture.getNowMs(), budget.deadlineMs,
    'parent timeoutBudget caps the 10000ms readServeEligibility wait at 30ms');
  t.ok(fixture.getRefreshProbeCount() > 3,
    'the fixture exercises repeated committed-refresh wakeups before stopping');
});

test('provisioning parent deadline - an already-expired budget never creates ' +
  'a replacement wait', async (t) => {
  const fixture = createDeadlineFixture({nowMs: 10});
  const budget = Object.freeze({
    configuredBudgetMs: 5,
    startedAtMs: 0,
    deadlineMs: 5,
  });

  const result = await executeCreate(fixture.engine, budget);

  t.equal(result.success, false);
  t.equal(fixture.getNowMs(), 10,
    'negative remaining time is clamped to zero without waiting');
});

test('provisioning parent deadline - caller cancellation interrupts the ' +
  'readServeEligibility wait cooperatively', async (t) => {
  const cancellationToken = new CancellationToken();
  const fixture = createDeadlineFixture({
    cancellationToken,
    cancelAtMs: 4,
  });
  const budget = createParentBudget(30, fixture.getNowMs);

  const result = await executeCreate(
    fixture.engine,
    budget,
    cancellationToken,
  );

  t.equal(result.success, false);
  t.equal(fixture.getNowMs(), 4,
    'the readiness wait aborts immediately on caller cancellation');
  t.match(result.error, /caller cancelled provisioning/);
});

test('provisioning parent deadline - cancellation observed by an early-success ' +
  'metadata wait cannot leak into later provisioning phases', async (t) => {
  const cancellationToken = new CancellationToken();
  const fixture = createDeadlineFixture({
    cancellationToken,
    admitAtMs: 0,
    cancelAfterMetadataWait: true,
  });
  const budget = createParentBudget(30, fixture.getNowMs);

  const result = await executeCreate(
    fixture.engine,
    budget,
    cancellationToken,
  );

  t.equal(result.success, false);
  t.equal(fixture.getNowMs(), 0);
  t.match(result.error, /caller cancelled after metadata wait/);
});

test('provisioning parent deadline - a direct cache-success wait still honors ' +
  'an already-cancelled caller', async (t) => {
  const cancellationToken = new CancellationToken();
  cancellationToken.cancel('caller cancelled before cache success');
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(),
  });
  engine.hasServiceMetadata = () => true;

  await t.rejects(
    engine.waitForPartitionServiceMetadata('replica-ready', null, {
      cancellationToken,
    }),
    /caller cancelled before cache success/,
  );
});
