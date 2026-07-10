import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {TABLES} from '../../src/constants/index.js';
import {createTimeoutBudget} from '../../src/control-plane/timeout-budget.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createMockMessageRouter} from './sql-query-engine-test-support.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

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

function createDeadlineFixture(options = {}) {
  let nowMs = options.nowMs || 0;
  let admissionProbeCount = 0;
  const cancellationToken = options.cancellationToken || null;
  const nodes = ['node-a', 'node-b', 'node-c'].map((nodeId) => ({
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
  const rebalanceCoordinator = {
    async checkProvisioningAdmission() {
      admissionProbeCount += 1;
      return nowMs >= (options.admitAtMs ?? Number.POSITIVE_INFINITY) ?
        ADMIT :
        HOLD;
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
    nowFn: () => nowMs,
    tablePartitionProvisioningTimeoutMs:
      options.innerProvisioningTimeoutMs || 90,
    tablePartitionTargetNodeConvergenceTimeoutMs: 5,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.tableCreationService.setControlPlaneSystemTableGateway({
    async readRows() {
      return {success: true, rows: []};
    },
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  engine.waitForPartitionServiceMetadata = async () => {};
  if (options.cancelAfterMetadataWait === true) {
    engine.waitForMinimumRoutableReplicaMetadata = async () => {
      cancellationToken?.cancel('caller cancelled after metadata wait');
    };
  }
  engine.sleep = async (durationMs) => {
    nowMs += Math.max(0, durationMs);
    if (
      cancellationToken &&
      Number.isFinite(options.cancelAtMs) &&
      nowMs >= options.cancelAtMs
    ) {
      cancellationToken.cancel('caller cancelled provisioning');
    }
  };
  return {
    engine,
    getAdmissionProbeCount: () => admissionProbeCount,
    getNowMs: () => nowMs,
  };
}

function createParentBudget(configuredBudgetMs, now) {
  return createTimeoutBudget({configuredBudgetMs, now});
}

async function executeCreate(engine, timeoutBudget, cancellationToken = null) {
  return engine.executeRequest({
    ...createSqlRequest({
      statement: 'CREATE TABLE deadline_probe (id TEXT PRIMARY KEY)',
      sessionId: 'provisioning-parent-deadline',
    }),
    timeoutBudget,
    cancellationToken,
  });
}

test('provisioning parent deadline - outer 30ms budget clamps an inner 90ms ' +
  'progress re-wait', async (t) => {
  const fixture = createDeadlineFixture({admitAtMs: 31});
  const budget = createParentBudget(30, fixture.getNowMs);

  const result = await executeCreate(fixture.engine, budget);

  t.equal(result.success, false,
    'progress after the caller deadline cannot make CREATE succeed');
  t.ok(fixture.getNowMs() <= budget.deadlineMs,
    'virtual time never advances past the caller-owned deadline');
});

test('provisioning parent deadline - progress one millisecond before expiry ' +
  'may complete', async (t) => {
  const fixture = createDeadlineFixture({admitAtMs: 29});
  const budget = createParentBudget(30, fixture.getNowMs);

  const result = await executeCreate(fixture.engine, budget);

  t.equal(result.success, true,
    'progress observed inside the original budget remains usable');
  t.equal(fixture.getNowMs(), 29,
    'the final in-budget probe completes without minting extra time');
});

test('provisioning parent deadline - repeated wakeups and no progress stop at ' +
  'the original deadline', async (t) => {
  const fixture = createDeadlineFixture();
  const budget = createParentBudget(30, fixture.getNowMs);

  const result = await executeCreate(fixture.engine, budget);

  t.equal(result.success, false);
  t.equal(fixture.getNowMs(), budget.deadlineMs);
  t.ok(fixture.getAdmissionProbeCount() > 3,
    'the fixture exercises repeated admission wakeups, not an immediate exit');
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
    'negative remaining time is clamped to zero without sleeping');
});

test('provisioning parent deadline - caller cancellation interrupts the ' +
  'progress wait cooperatively', async (t) => {
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
    'the provisioning loop stops on caller cancellation');
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
