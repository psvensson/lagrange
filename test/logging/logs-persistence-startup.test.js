import {EventEmitter} from 'node:events';
import {test} from '../../src/test-helpers/tap.js';
import {READINESS_EVENT} from '../../src/bootstrap/bootstrap-readiness-state-constants.js';
import {
  startLogsTablePersistenceOnReadiness,
} from '../../src/logging/logs-persistence-startup.js';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class FakeReadinessState extends EventEmitter {
  constructor(snapshot = {}) {
    super();
    this.snapshot = {
      ready: false,
      phase: 'INIT',
      state: 'bootstrapping',
      reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
      ...snapshot,
    };
  }

  getSnapshot() {
    return {...this.snapshot};
  }

  setSnapshot(nextSnapshot) {
    const previousSnapshot = this.getSnapshot();
    this.snapshot = {
      ...this.snapshot,
      ...nextSnapshot,
    };
    this.emit(READINESS_EVENT.TRANSITION, {
      ...this.snapshot,
      previousState: previousSnapshot.state,
      previousReady: previousSnapshot.ready,
      degradedReasons: nextSnapshot.degradedReasons || [],
      timestamp: Date.now(),
    });
  }
}

const TEST_LOGGER = Object.freeze({
  warn: () => {},
});

test('startLogsTablePersistenceOnReadiness starts immediately without readiness gate',
  async (t) => {
    let startCount = 0;
    const expectedService = {serviceId: 'logs-table'};
    const startup = startLogsTablePersistenceOnReadiness({
      logger: TEST_LOGGER,
      delayMs: 5,
      start: async () => {
        startCount += 1;
        return expectedService;
      },
    });

    const service = await startup.promise;

    t.equal(startCount, 1, 'should start immediately when no readiness gate is provided');
    t.equal(service, expectedService, 'should resolve with the started service');
    t.equal(startup.getService(), expectedService, 'should retain the started service');
  });

test('startLogsTablePersistenceOnReadiness waits for ready transition and grace window',
  async (t) => {
    const readinessState = new FakeReadinessState();
    let startCount = 0;
    const expectedService = {serviceId: 'logs-table'};
    const startup = startLogsTablePersistenceOnReadiness({
      readinessState,
      logger: TEST_LOGGER,
      delayMs: 20,
      start: async () => {
        startCount += 1;
        return expectedService;
      },
    });

    await sleep(25);
    t.equal(startCount, 0, 'should not start before readiness becomes true');

    readinessState.setSnapshot({
      ready: true,
      phase: 'TRAFFIC_READY',
      state: 'join_ready',
      reasons: [],
    });

    await sleep(10);
    t.equal(startCount, 0, 'should still wait for the grace window after ready transition');

    await sleep(20);
    t.equal(startCount, 1, 'should start exactly once after the grace window');

    const service = await startup.promise;
    t.equal(service, expectedService, 'should resolve with the started service');
  });

test('startLogsTablePersistenceOnReadiness cancels deferred startup when readiness degrades',
  async (t) => {
    const readinessState = new FakeReadinessState();
    let startCount = 0;
    const startup = startLogsTablePersistenceOnReadiness({
      readinessState,
      logger: TEST_LOGGER,
      delayMs: 20,
      start: async () => {
        startCount += 1;
        return {serviceId: 'logs-table'};
      },
    });

    readinessState.setSnapshot({
      ready: true,
      phase: 'TRAFFIC_READY',
      state: 'join_ready',
      reasons: [],
    });
    await sleep(10);
    readinessState.setSnapshot({
      ready: false,
      phase: 'DEGRADED',
      state: 'degraded',
      reasons: ['LEADER_METADATA_INCOMPLETE'],
    });

    await sleep(25);
    t.equal(startCount, 0, 'should cancel the deferred startup when readiness drops');

    startup.cancel();
    const service = await startup.promise;
    t.equal(service, null, 'should resolve to null when cancelled before startup begins');
    t.equal(startup.getService(), null, 'should not retain a service after cancellation');
  });
