import {test} from '../../src/test-helpers/tap.js';
import {
  buildSuccessorReplaceIntentIdentity,
} from '../../src/rebalancer/rebalance-replace-intent-identity.js';
import {
  createCoordinatorSqlStore,
  createMockControlPlaneSystemTableGateway,
  createTestCoordinator,
} from './test-helpers.js';

const REPLACE = 'REPLACE';
const PENDING = 'PENDING';
const FAILED = 'FAILED';
const PARTITION_ID = 'sql_transactions-p1';
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r2`;

function createSharedOperationGateway() {
  const operations = new Map();
  const reservations = new Map();
  let readable = true;

  function read(tableName, sql, params = []) {
    if (!readable) {
      return {success: true, rows: []};
    }
    if (tableName === 'storage_reservations') {
      const row = reservations.get(params[0]);
      return {success: true, rows: row ? [row] : []};
    }
    if (sql.includes('operation_id = ?')) {
      const row = operations.get(params[0]);
      return {success: true, rows: row ? [row] : []};
    }
    return {success: true, rows: Array.from(operations.values())};
  }

  return {
    operations,
    reservations,
    setReadable(value) {
      readable = value === true;
    },
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    readAuthoritativeRows: async (tableName, sql, params) =>
      read(tableName, sql, params),
    readRows: async (tableName, sql, params) => read(tableName, sql, params),
    executeQuery: async (sql, params) => read(null, sql, params),
    async submitMutation(mutation) {
      if (mutation?.tableName !== 'replica_operations') {
        return {success: true, partitionResult: {affectedRows: 1}};
      }
      const operationId = mutation.row.operation_id;
      if (operations.has(operationId)) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      operations.set(operationId, {...mutation.row});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
}

function createBarrier(parties) {
  let arrivals = 0;
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    arrivals++;
    if (arrivals === parties) {
      release();
    }
    await released;
    return null;
  };
}

function configureCoordinator(coordinator, options = {}) {
  const counters = {reservations: 0};
  coordinator.assertLocalControlPlaneMutationReady = () => {};
  coordinator.runOperationLedgerInterlockAccountedCreate = async (_move, create) =>
    create();
  coordinator.getRetiredReplaceSourceMoveSafetyError = async () => null;
  coordinator.queryExistingInFlightOperation = options.queryExisting ||
    (async () => null);
  coordinator.ensurePriorityControlPlaneRemoveLaneAvailable = async () => {};
  coordinator.ensureEntityAddLikeCreateLaneAvailable = async () => {};
  coordinator.ensureCriticalPartitionCreateLaneAvailable = async () => {};
  coordinator.ensureCreateTopologyGuardAllowed = async () => {};
  coordinator.shouldEnforceConcurrentOperationBudget = () => false;
  coordinator.ensureProvisioningAdmissionAllowed = async () => {};
  coordinator.buildOperationBootstrapTopology = () => null;
  coordinator.createReservationForOperation = async (operation) => {
    if (options.gateway.reservations.has(operation.operationId)) {
      return {outcome: 'already_active'};
    }
    options.gateway.reservations.set(operation.operationId, {
      operation_id: operation.operationId,
      status: 'active',
    });
    counters.reservations++;
    return {outcome: 'created'};
  };
  coordinator.queryShutdownIncompleteOperations = async () => [];
  return counters;
}

function createCoordinator(nodeId, gateway, options = {}) {
  const coordinator = createTestCoordinator({
    nodeId,
    controlPlaneSystemTableGateway: gateway,
    enableTimeouts: false,
  });
  return {
    coordinator,
    counters: configureCoordinator(coordinator, {...options, gateway}),
  };
}

function buildMove(targetNodeId, overrides = {}) {
  return {
    type: REPLACE,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    nodeId: targetNodeId,
    sourceNodeId: 'source-node',
    replicaId: SOURCE_REPLICA_ID,
    enforceConcurrentOperationBudget: true,
    ...overrides,
  };
}

test('coordinator-managed REPLACE creation has one durable cluster-wide identity', async (t) => {
  const gateway = createSharedOperationGateway();
  const queryBarrier = createBarrier(2);
  const left = createCoordinator('creator-left', gateway, {
    queryExisting: queryBarrier,
  });
  const right = createCoordinator('creator-right', gateway, {
    queryExisting: queryBarrier,
  });
  t.teardown(async () => {
    await left.coordinator.shutdown();
    await right.coordinator.shutdown();
  });

  const move = buildMove('target-node');
  const [leftOperation, rightOperation] = await Promise.all([
    left.coordinator.createOperation(move),
    right.coordinator.createOperation(move),
  ]);

  t.equal(leftOperation.operationId, rightOperation.operationId,
    'both coordinators converge on one operation identity');
  t.equal(leftOperation.replicaId, rightOperation.replicaId,
    'both coordinators converge on one target replica identity');
  t.equal(gateway.operations.size, 1, 'one replica_operations row is durable');
  t.equal(left.coordinator.stats.operationsCreated +
    right.coordinator.stats.operationsCreated, 1,
  'only the insert winner records operation creation');
  t.equal(left.counters.reservations + right.counters.reservations, 1,
    'only the insert winner creates a reservation');
});

test('a terminal deterministic REPLACE advances one durable generation', async (t) => {
  const gateway = createSharedOperationGateway();
  const first = createCoordinator('creator-first', gateway);
  const retry = createCoordinator('creator-retry', gateway);
  t.teardown(async () => {
    await first.coordinator.shutdown();
    await retry.coordinator.shutdown();
  });

  const move = buildMove('target-node');
  const terminalOperation = await first.coordinator.createOperation(move);
  const terminalRow = gateway.operations.get(terminalOperation.operationId);
  gateway.operations.set(terminalOperation.operationId, {
    ...terminalRow,
    status: 'failed',
    workflow_step: FAILED,
    completed_at: Date.now(),
  });

  const successor = await retry.coordinator.createOperation(move);
  retry.coordinator.recentOperationIntents.clear();
  const successorRetry = await retry.coordinator.createOperation(move);

  t.not(successor.operationId, terminalOperation.operationId,
    'a terminal row deterministically advances the operation generation');
  t.not(successor.replicaId, terminalOperation.replicaId,
    'the successor generation owns a new deterministic target replica');
  t.equal(successorRetry.operationId, successor.operationId,
    'the nonterminal successor is reused instead of advancing again');
  t.equal(successorRetry.replicaId, successor.replicaId,
    'the reused successor keeps its target replica identity');
  t.equal(gateway.operations.size, 2,
    'terminal history and its one successor remain durable');
  t.equal(successor.workflowStep, PENDING, 'the successor starts pending');
});

test('a deterministic REPLACE successor rejects an identity cycle', (t) => {
  const identity = {
    baseOperationIntentId: 'replace-op-base',
    operationIntentId: 'replace-op-base',
    replicaIntentId: 'replace-replica-base',
    collidedOperationIntentIds: [],
  };
  const successor = buildSuccessorReplaceIntentIdentity(
    identity,
    'replace-op-terminal',
  );

  t.throws(
    () => buildSuccessorReplaceIntentIdentity({
      ...identity,
      collidedOperationIntentIds: [successor.operationIntentId],
    }, 'replace-op-terminal'),
    /REPLACE intent generation revisited a durable operation ID/u,
    'a revisited successor generation fails instead of recurring forever',
  );
  t.end();
});

test('persist-give-up plus critical target churn reuses the durable intent', async (t) => {
  const gateway = createSharedOperationGateway();
  const owner = createCoordinator('creator-one', gateway);
  t.teardown(async () => owner.coordinator.shutdown());

  const persistNewOperation = owner.coordinator.persistNewOperation.bind(
    owner.coordinator,
  );
  let loseFirstOutcome = true;
  owner.coordinator.persistNewOperation = async (...args) => {
    const outcome = await persistNewOperation(...args);
    if (loseFirstOutcome) {
      loseFirstOutcome = false;
      throw new Error('synthetic post-persist outcome loss');
    }
    return outcome;
  };

  await t.rejects(
    owner.coordinator.createOperation(buildMove('target-a')),
    /synthetic post-persist outcome loss/u,
    'the first creator gives up after the row became durable',
  );
  t.equal(owner.coordinator.recentOperationIntents.size, 0,
    'the failed create has no coordinator intent memory');
  const retry = await owner.coordinator.createOperation(buildMove('target-b'));

  t.equal(retry.targetNodeId, 'target-a',
    'the first durable target remains the lifecycle owner');
  t.equal(gateway.operations.size, 1,
    'target churn cannot mint a twin replacement');
  t.equal(gateway.reservations.size, 1,
    'the collision retry repairs the missing first-creator reservation');
  t.equal(owner.coordinator.stats.operationsCreated, 0,
    'the collision retry does not claim a second creation');
});

test('explicit caller operation and replica intent IDs remain authoritative', async (t) => {
  const gateway = createSharedOperationGateway();
  const owner = createCoordinator('creator-explicit', gateway);
  t.teardown(async () => owner.coordinator.shutdown());

  const operation = await owner.coordinator.createOperation(buildMove(
    'target-node',
    {
      operationIntentId: 'caller-operation-id',
      replicaIntentId: 'caller-replica-id',
    },
  ));

  t.equal(operation.operationId, 'caller-operation-id');
  t.equal(operation.replicaId, 'caller-replica-id');
});

test('collision visibility loss defers only the colliding move identity', async (t) => {
  const gateway = createSharedOperationGateway();
  const owner = createCoordinator('creator-visibility', gateway);
  owner.coordinator.repository.replicaOperationAuthoritativeVisibilityTimeoutMs =
    0;
  t.teardown(async () => owner.coordinator.shutdown());

  const userMove = {
    partitionId: 'user-orders-p1',
    entityId: 'user-orders-p1',
    replicaId: 'user-orders-p1-r1',
  };
  const first = await owner.coordinator.createOperation(buildMove(
    'target-a',
    userMove,
  ));
  owner.coordinator.recentOperationIntents.clear();
  gateway.setReadable(false);

  await t.rejects(
    owner.coordinator.createOperation(buildMove('target-a', userMove)),
    /Authoritative replica operation not confirmed/u,
    'the exact colliding move defers without authoritative collision proof',
  );
  const unrelatedTarget = await owner.coordinator.createOperation(buildMove(
    'target-b',
    userMove,
  ));
  gateway.setReadable(true);

  t.not(unrelatedTarget.operationId, first.operationId,
    'a distinct target retains its own move identity');
  t.equal(gateway.operations.size, 2,
    'collision visibility loss does not blanket-block unrelated healing');
});

function createCommittedCreationFixture(t, {hideCensus = false} = {}) {
  const ledger = createCoordinatorSqlStore({});
  const readCalls = [];
  let beforeInsert = null;
  let readMode = 'normal';
  let insertCount = 0;
  const gateway = createMockControlPlaneSystemTableGateway({
    executeQuery(sql, params) {
      if (!sql.includes('FROM replica_operations')) {
        return ledger.execute(sql, params);
      }
      const result = ledger.execute(sql, params);
      const isPoint = sql.includes('WHERE operation_id = ?');
      readCalls.push({isPoint, result});
      if (isPoint && readMode === 'unavailable') {
        return {success: false, error: 'owner not reachable'};
      }
      if (isPoint && readMode === 'absent') {
        return ledger.execute(sql, ['missing-commit-at-owner']);
      }
      if (isPoint && readMode === 'foreign') {
        return {...result, rows: result.rows.map((row) => ({
          ...row, operation_id: 'foreign-owner-record',
        }))};
      }
      if (!isPoint && hideCensus) {
        return {...result, rows: []};
      }
      return result;
    },
  });
  gateway.reservations = new Map();
  gateway.submitMutation = async (mutation) => {
    if (mutation.tableName === 'replica_operations' && mutation.operation === 'insert') {
      insertCount++;
      await beforeInsert?.(mutation);
    }
    return ledger.submitMutation(mutation);
  };
  const {coordinator} = createCoordinator('creator-sqlite', gateway);
  delete coordinator.queryExistingInFlightOperation;
  coordinator.repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 0;
  t.teardown(async () => {
    await coordinator.shutdown();
    ledger.suspend();
  });
  return {
    coordinator,
    readCalls,
    get insertCount() {
      return insertCount;
    },
    setReadMode(mode) {
      readMode = mode;
    },
    setBeforeInsert(callback) {
      beforeInsert = callback;
    },
    rows() {
      return ledger.execute(
        'SELECT operation_id, target_node_id FROM replica_operations ORDER BY operation_id',
      ).rows;
    },
  };
}

function captureCreation(promise) {
  return promise.then((operation) => ({operation}), (error) => ({error}));
}

test('one critical lane serializes concurrent subjects and replays the exact winner', async (t) => {
  const fixture = createCommittedCreationFixture(t);
  const {coordinator} = fixture;
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  fixture.setBeforeInsert(async () => {
    entered.resolve();
    await release.promise;
  });
  const original = buildMove('target-a');
  const first = coordinator.createOperation(original);
  await entered.promise;
  const matching = captureCreation(coordinator.createOperation(original));
  const conflicting = captureCreation(coordinator.createOperation(buildMove('target-b')));
  await new Promise((resolve) => setImmediate(resolve));
  t.same(fixture.rows(), [], 'both callers arrive before the first insert');
  release.resolve();

  const [winner, replay, conflict] = await Promise.all([first, matching, conflicting]);
  t.equal(replay.operation?.operationId, winner.operationId);
  t.equal(replay.operation?.targetNodeId, original.nodeId);
  t.notOk(conflict.operation, 'a different move cannot receive a successful operation');
  t.ok(conflict.error?.rebalanceSkipReason, 'the contender receives a typed refusal');
  t.same(fixture.rows(), [{operation_id: winner.operationId, target_node_id: original.nodeId}]);
  t.equal(fixture.insertCount, 1, 'only the winner invokes the insert');
});

test('a remembered operation requires exact live owner evidence before replay', async (t) => {
  const fixture = createCommittedCreationFixture(t);
  const {coordinator} = fixture;
  const move = buildMove('target-a');
  const first = await coordinator.createOperation(move);
  for (const answer of ['unavailable', 'absent', 'foreign']) {
    fixture.setReadMode(answer);
    const result = await captureCreation(coordinator.createOperation(move));
    t.notOk(result.operation, `the ${answer} owner answer cannot authorize replay`);
    t.ok(result.error?.rebalanceSkipReason, `the ${answer} owner answer defers the caller`);
    t.same(fixture.rows(), [{operation_id: first.operationId, target_node_id: move.nodeId}]);
  }
  fixture.setReadMode('normal');
  const replay = await coordinator.createOperation(move);
  t.equal(replay.operationId, first.operationId, 'positive owner evidence restores exact replay');
  t.equal(fixture.insertCount, 1, 'failed replay observations never attempted a second write');
});

test('the critical follower can acquire its own subject after a pre-insert failure', async (t) => {
  const fixture = createCommittedCreationFixture(t);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  fixture.setBeforeInsert(async () => {
    if (fixture.insertCount !== 1) return;
    entered.resolve();
    await release.promise;
    throw new Error('original insert was refused before SQLite');
  });
  const first = captureCreation(fixture.coordinator.createOperation(buildMove('target-a')));
  await entered.promise;
  const second = captureCreation(fixture.coordinator.createOperation(buildMove('target-b')));
  await new Promise((resolve) => setImmediate(resolve));
  release.resolve();

  const [refused, recovered] = await Promise.all([first, second]);
  t.ok(refused.error);
  t.equal(recovered.operation?.targetNodeId, 'target-b',
    'the distinct caller runs its own admission after the original rejection');
  t.same(fixture.rows(), recovered.operation ? [{
    operation_id: recovered.operation.operationId, target_node_id: 'target-b',
  }] : [], 'only the independently admitted request committed');
});

test('persistent collision retains the winner and only its physical subject can recover', async (t) => {
  const fixture = createCommittedCreationFixture(t, {hideCensus: true});
  const {coordinator} = fixture;
  const original = buildMove('target-a');
  const winner = await coordinator.createOperation(original);
  coordinator.recentOperationIntents.clear();

  const conflict = await captureCreation(coordinator.createOperation(buildMove('target-b')));
  t.notOk(conflict.operation, 'a durable insert collision cannot adopt another target');
  t.ok(conflict.error?.rebalanceSkipReason, 'the collision reports typed contention');
  const replay = await coordinator.createOperation(original);
  t.equal(replay.operationId, winner.operationId);
  t.equal(replay.targetNodeId, original.nodeId);
  t.same(fixture.rows(), [{operation_id: winner.operationId, target_node_id: original.nodeId}]);
  t.ok(fixture.insertCount > 1, 'SQLite evaluated the contention at the insert boundary');
});
