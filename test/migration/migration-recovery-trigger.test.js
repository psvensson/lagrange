import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {
  wireMigrationRecoveryOnLeaderElection,
} from '../../src/migration/migration-recovery-trigger.js';
import {
  PARTITION_SERVICE_EVENT,
} from '../../src/partition/partition-service-constants.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPartitionServices() {
  return new Map([
    ['r1', new EventEmitter()],
    ['r2', new EventEmitter()],
  ]);
}

function createSqlQueryEngine(recoverCalls) {
  return {
    nodeId: 'node-a',
    messageRouter: null,
    migrationCoordinator: {
      async recoverMigrations() {
        recoverCalls.push(Date.now());
        return {success: true, recovered: 0};
      },
    },
  };
}

test('wireMigrationRecoveryOnLeaderElection coalesces bursty leader ' +
  'elections into one follow-up recovery', async (t) => {
  const recoverCalls = [];
  const partitionServices = createPartitionServices();
  const detach = wireMigrationRecoveryOnLeaderElection({
    sqlQueryEngine: createSqlQueryEngine(recoverCalls),
    partitionServices,
    leaderElectionCooldownMs: 25,
    logger: {
      info() {},
      debug() {},
      error() {},
    },
  });

  await wait(5);
  t.equal(
    recoverCalls.length,
    1,
    'node restart should trigger the initial recovery once',
  );

  for (const partitionService of partitionServices.values()) {
    partitionService.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
    partitionService.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
  }

  await wait(5);
  t.equal(
    recoverCalls.length,
    1,
    'bursty leader-election events should not start immediate duplicate recoveries',
  );

  await wait(35);
  t.equal(
    recoverCalls.length,
    2,
    'one coalesced recovery should run after the cooldown window',
  );

  detach();
});

test('wireMigrationRecoveryOnLeaderElection defers leader-election ' +
  'recovery while the node is backpressured', async (t) => {
  const recoverCalls = [];
  const partitionServices = createPartitionServices();
  const detach = wireMigrationRecoveryOnLeaderElection({
    sqlQueryEngine: createSqlQueryEngine(recoverCalls),
    partitionServices,
    leaderElectionCooldownMs: 0,
    pressureGovernor: {
      evaluate() {
        return {
          action: 'defer',
          retryAfterMs: 30,
          summary: {backpressured: true},
        };
      },
    },
    logger: {
      info() {},
      debug() {},
      error() {},
    },
  });

  await wait(5);
  t.equal(
    recoverCalls.length,
    1,
    'node restart should still trigger the initial recovery',
  );

  partitionServices.get('r1').emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
  partitionServices.get('r2').emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);

  await wait(5);
  t.equal(
    recoverCalls.length,
    1,
    'pressure-deferred leader-election recovery should not run immediately',
  );

  await wait(40);
  t.equal(
    recoverCalls.length,
    2,
    'pressure-deferred leader-election recovery should resume after retryAfterMs',
  );

  detach();
});
