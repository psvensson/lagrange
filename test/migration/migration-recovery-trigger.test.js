import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {
  MIGRATION_RECOVERY_ERROR,
  wireMigrationRecoveryOnLeaderElection,
} from '../../src/migration/migration-recovery-trigger.js';
import {PartitionServiceRegistry} from
  '../../src/bootstrap/shared/partition-service-registry.js';
import {PRESSURE_GOVERNOR_ACTION} from
  '../../src/control-plane/pressure-governor.js';
import {
  PARTITION_SERVICE_EVENT,
} from '../../src/partition/partition-service-constants.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The node's real partition-service registry, holding stand-in partition
// services that only emit (the trigger reads nothing else of them).
function createPartitionServices() {
  const registry = new PartitionServiceRegistry();
  registry.set('r1', new EventEmitter());
  registry.set('r2', new EventEmitter());
  return registry;
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
  // Deterministic clock and scheduler: the coalescing window is
  // timing-exact, so the test drives time explicitly instead of racing
  // real 5/25/35ms timers against host scheduling (this exact burst
  // assertion failed on a loaded CI runner when a >25ms event-loop stall
  // fired the cooldown before the not-yet check).
  let clockMs = 0;
  const scheduled = [];
  const detach = wireMigrationRecoveryOnLeaderElection({
    sqlQueryEngine: createSqlQueryEngine(recoverCalls),
    partitionServices,
    leaderElectionCooldownMs: 25,
    now: () => clockMs,
    scheduleTimeout: (callback, delayMs) => {
      const entry = {callback, dueAtMs: clockMs + delayMs, cleared: false};
      scheduled.push(entry);
      return entry;
    },
    cancelTimeout: (entry) => {
      if (entry) {
        entry.cleared = true;
      }
    },
    logger: {
      info() {},
      debug() {},
      error() {},
    },
  });
  const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));
  const fireDueTimers = async () => {
    for (const entry of scheduled.splice(0)) {
      if (!entry.cleared && entry.dueAtMs <= clockMs) {
        entry.callback();
      }
    }
    await flushMicrotasks();
  };

  await flushMicrotasks();
  t.equal(
    recoverCalls.length,
    1,
    'node restart should trigger the initial recovery once',
  );

  for (const partitionService of partitionServices.values()) {
    partitionService.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
    partitionService.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
  }

  await flushMicrotasks();
  t.equal(
    recoverCalls.length,
    1,
    'bursty leader-election events should not start immediate duplicate recoveries',
  );
  t.equal(
    scheduled.filter((entry) => !entry.cleared).length,
    1,
    'the burst should coalesce into exactly one scheduled follow-up recovery',
  );

  clockMs += 25;
  await fireDueTimers();
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

const SILENT_LOGGER = Object.freeze({info() {}, debug() {}, error() {}});

function manualScheduler() {
  const scheduled = [];
  return {
    scheduled,
    scheduleTimeout: (callback, delayMs) => {
      const entry = {callback, delayMs, cleared: false};
      scheduled.push(entry);
      return entry;
    },
    cancelTimeout: (entry) => {
      if (entry) entry.cleared = true;
    },
    fire: async () => {
      for (const entry of scheduled.splice(0)) {
        if (!entry.cleared) entry.callback();
      }
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test('a partition registered after the trigger armed starts migration ' +
  'recovery when it elects a leader (PartitionServiceRegistry)', async (t) => {
  const recoverCalls = [];
  const partitionServices = new PartitionServiceRegistry();
  const scheduler = manualScheduler();
  const detach = wireMigrationRecoveryOnLeaderElection({
    sqlQueryEngine: createSqlQueryEngine(recoverCalls),
    partitionServices,
    leaderElectionCooldownMs: 0,
    now: () => 0,
    scheduleTimeout: scheduler.scheduleTimeout,
    cancelTimeout: scheduler.cancelTimeout,
    pressureGovernor: {
      evaluate: () => ({action: PRESSURE_GOVERNOR_ACTION.ALLOW, retryAfterMs: 0}),
    },
    logger: SILENT_LOGGER,
  });
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(recoverCalls.length, 1, 'node restart recovery ran once');

  const later = new EventEmitter();
  partitionServices.set('r-later', later);
  later.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
  await scheduler.fire();
  t.equal(recoverCalls.length, 2,
    'the later partition\'s leader election triggered recovery');

  const leading = Object.assign(new EventEmitter(), {isLeader: true});
  partitionServices.set('r-leading', leading);
  await scheduler.fire();
  t.equal(recoverCalls.length, 3,
    'a partition already leading when registered announces at registration');

  detach();
  later.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
  await scheduler.fire();
  t.equal(recoverCalls.length, 3, 'detach unsubscribes from the registry');
  partitionServices.delete('r-later');
  later.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
  t.equal(later.listenerCount(PARTITION_SERVICE_EVENT.LEADER_ELECTED), 0,
    'a removed partition keeps no relay listener');
});

test('migration recovery refuses an enumerated partition map: the registry ' +
  'is required (typed)', async (t) => {
  t.throws(() => wireMigrationRecoveryOnLeaderElection({
    sqlQueryEngine: createSqlQueryEngine([]),
    partitionServices: new Map([['r1', new EventEmitter()]]),
    logger: SILENT_LOGGER,
  }), {code: MIGRATION_RECOVERY_ERROR.REGISTRY_REQUIRED.code});
  t.throws(() => wireMigrationRecoveryOnLeaderElection({
    sqlQueryEngine: null,
    partitionServices: new PartitionServiceRegistry(),
    logger: SILENT_LOGGER,
  }), {code: MIGRATION_RECOVERY_ERROR.ENGINE_REQUIRED.code});
});
