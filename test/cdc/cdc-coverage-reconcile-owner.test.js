import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'node:events';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  registerCdcCoverageLifecycle,
  retireCdcCoverageLifecycle,
} from '../../src/cdc/cdc-coverage-lifecycle-owner.js';
import {
  CDC_COVERAGE_RECONCILE_DEFAULT,
  CDC_COVERAGE_RECONCILE_REASON,
  CDC_COVERAGE_RECONCILE_STATE,
  armCdcCoverageReconcile,
  readCdcCoverageReconcileDiagnostics,
} from '../../src/cdc/cdc-coverage-reconcile-owner.js';
import {readCdcCoverageTransferDiagnostics, releaseCdcCoverageTransfer,
  reserveCdcCoverageTransfer, retireCdcCoverageTransferOwner} from
  '../../src/cdc/cdc-coverage-transfer-owner.js';
import {CDCIntegrationService} from
  '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TRANSPORT_EVENT} from '../../src/constants/transport.js';

function owner(timeSource = new VirtualTimeSource({startMs: 1000})) {
  const service = {timeSource,
    systemTableCache: {}, cacheMutationTarget: {}, isShuttingDown: false,
    logger: {warn() {}}};
  registerCdcCoverageLifecycle(service);
  return service;
}

class HeldTimerTimeSource {
  constructor(startMs) {
    this.current = startMs;
    this.nextId = 0;
    this.timers = new Map();
  }

  now() {
    return this.current;
  }

  setTimeout(callback, delayMs) {
    const id = ++this.nextId;
    this.timers.set(id, {callback, dueAt: this.current + delayMs});
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  jumpWithoutTimers(ms) {
    this.current += ms;
  }

  pendingTimerCount() {
    return this.timers.size;
  }
}

function request(service, windowMs = 1000) {
  return {partitionId: 'nodes-initial', tableName: 'nodes', windowMs,
    deadlineMs: service.timeSource.now() + windowMs};
}

async function flush() {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
}

test('C17 reconcile owner coalesces one exact table generation', async (t) => {
  const service = owner();
  let launches = 0;
  let finish;
  const execute = () => {
    launches += 1;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = armCdcCoverageReconcile(service, request(service), execute);
  const joined = armCdcCoverageReconcile(service, request(service), execute);
  await flush();
  t.not(first, joined, 'each caller owns an independently bounded promise');
  t.equal(launches, 1, 'only one request is in flight');
  finish({success: true});
  t.equal((await first).state, CDC_COVERAGE_RECONCILE_STATE.COMPLETE);
  t.same(readCdcCoverageReconcileDiagnostics(service), [],
    'semantic completion clears debt');
  retireCdcCoverageLifecycle(service);
  t.end();
});

test('C17 short joiner expires without replacing the shared generation',
  async (t) => {
    const service = owner();
    let finish;
    let firstLaunches = 0;
    let joiningLaunches = 0;
    const long = armCdcCoverageReconcile(service, request(service, 1000), () => {
      firstLaunches += 1;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await flush();
    const short = armCdcCoverageReconcile(service, request(service, 50), () => {
      joiningLaunches += 1;
      return {success: true};
    });
    service.timeSource.advance(50);
    await flush();
    t.equal((await short).state, CDC_COVERAGE_RECONCILE_STATE.SPENT,
      'short caller observes its own deadline');
    t.equal(firstLaunches, 1, 'one shared read remains in flight');
    t.equal(joiningLaunches, 0, 'joiner cannot replace shared execute');
    t.equal(readCdcCoverageReconcileDiagnostics(service)[0].waiters, 1,
      'expired caller waiter and references are removed');
    finish({success: true});
    t.equal((await long).state, CDC_COVERAGE_RECONCILE_STATE.COMPLETE,
      'long caller receives legitimate shared completion');
    retireCdcCoverageLifecycle(service);
    t.end();
  });

test('C17 completion synchronously rejects an expired queued waiter',
  async (t) => {
    const clock = new HeldTimerTimeSource(1000);
    const service = owner(clock);
    let finish;
    let installed = false;
    const long = armCdcCoverageReconcile(service,
      {...request(service, 1000), deadlineMs: 2000}, () =>
        new Promise((resolve) => {
          finish = (value) => {
            installed = true;
            resolve(value);
          };
        }));
    await flush();
    const short = armCdcCoverageReconcile(service,
      {...request(service, 50), deadlineMs: 1050}, () => {
        throw new Error('joining execute must remain unreachable');
      });
    clock.jumpWithoutTimers(40);
    clock.jumpWithoutTimers(20);
    finish({success: true});
    await flush();
    const [longOutcome, shortOutcome] = await Promise.all([long, short]);
    t.equal(clock.now(), 1060, 'synchronous work crosses caller deadline');
    t.equal(shortOutcome.state, CDC_COVERAGE_RECONCILE_STATE.SPENT,
      'completion checks deadline without waiting for queued timer');
    t.equal(longOutcome.state, CDC_COVERAGE_RECONCILE_STATE.COMPLETE,
      'shared generation and long caller remain valid');
    t.equal(installed, true, 'valid installed fact is not retracted');
    t.equal(clock.pendingTimerCount(), 0, 'both caller timers are removed');
    retireCdcCoverageLifecycle(service);
    t.end();
  });

test('C17 caller cancellation is exact before and after admission',
  async (t) => {
    const service = owner();
    const alreadyCancelled = new AbortController();
    alreadyCancelled.abort();
    let launches = 0;
    const before = await armCdcCoverageReconcile(service,
      {...request(service), signal: alreadyCancelled.signal}, () => {
        launches += 1;
        return {success: true};
      });
    t.equal(before.state, CDC_COVERAGE_RECONCILE_STATE.CANCELLED);
    t.equal(readCdcCoverageReconcileDiagnostics(service).length, 0,
      'pre-cancelled caller retains no debt or waiter');

    let finish;
    const long = armCdcCoverageReconcile(service, request(service), () => {
      launches += 1;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await flush();
    const controller = new AbortController();
    const cancelled = armCdcCoverageReconcile(service,
      {...request(service), signal: controller.signal}, () => {
        launches += 100;
        return {success: true};
      });
    controller.abort();
    controller.abort();
    const outcome = await cancelled;
    t.equal(outcome.state, CDC_COVERAGE_RECONCILE_STATE.CANCELLED);
    t.equal(outcome.reasonCode,
      CDC_COVERAGE_RECONCILE_REASON.CALLER_CANCELLED);
    t.equal(readCdcCoverageReconcileDiagnostics(service)[0].waiters, 1,
      'duplicate cancel removes only the exact caller waiter');
    t.equal(launches, 1, 'cancel cannot replace or cancel shared execution');
    finish({success: true});
    t.equal((await long).state, CDC_COVERAGE_RECONCILE_STATE.COMPLETE);
    retireCdcCoverageLifecycle(service);
    t.end();
  });

test('C17 caller waiter admission is finite and reusable', async (t) => {
  const service = owner();
  let finish;
  const controller = new AbortController();
  const callers = [armCdcCoverageReconcile(service,
    {...request(service), signal: controller.signal}, () =>
      new Promise((resolve) => {
        finish = resolve;
      }))];
  await flush();
  for (let index = 1;
    index < CDC_COVERAGE_RECONCILE_DEFAULT.MAX_WAITERS_PER_DEBT;
    index += 1) {
    callers.push(armCdcCoverageReconcile(service, request(service), () => {
      throw new Error('bounded joiner cannot execute');
    }));
  }
  const timersAtCapacity = service.timeSource.pendingTimerCount();
  const refused = await armCdcCoverageReconcile(
    service, request(service), () => ({success: true}));
  t.equal(refused.reasonCode,
    CDC_COVERAGE_RECONCILE_REASON.CALLER_CAPACITY);
  t.equal(refused.deferRetry, true, 'capacity refusal is retryable');
  t.equal(service.timeSource.pendingTimerCount(), timersAtCapacity,
    'refused caller retains no timer or promise reaction');
  t.equal(readCdcCoverageReconcileDiagnostics(service)[0].waiters,
    CDC_COVERAGE_RECONCILE_DEFAULT.MAX_WAITERS_PER_DEBT);
  controller.abort();
  t.equal((await callers.shift()).state,
    CDC_COVERAGE_RECONCILE_STATE.CANCELLED);
  const replacement = armCdcCoverageReconcile(
    service, request(service), () => ({success: true}));
  t.equal(readCdcCoverageReconcileDiagnostics(service)[0].waiters,
    CDC_COVERAGE_RECONCILE_DEFAULT.MAX_WAITERS_PER_DEBT,
    'capacity returns to one later caller');
  finish({success: true});
  const outcomes = await Promise.all([...callers, replacement]);
  t.equal(outcomes.every((value) =>
    value.state === CDC_COVERAGE_RECONCILE_STATE.COMPLETE), true);
  retireCdcCoverageLifecycle(service);
  t.end();
});

test('C17 lifecycle replacement and shutdown settle exact active waiters',
  async (t) => {
    const timeSource = new VirtualTimeSource({startMs: 1000});
    const initialCache = new SystemTableCache();
    const service = new CDCIntegrationService({nodeId: 'waiter-lifecycle',
      timeSource, systemTableCache: initialCache,
      cacheMutationTarget: initialCache});
    const answers = [];
    const execute = () => new Promise((resolve) => answers.push(resolve));
    const first = armCdcCoverageReconcile(service, request(service), execute);
    const second = armCdcCoverageReconcile(service, request(service), execute);
    await flush();
    service.setCacheMutationTarget(new SystemTableCache());
    const replaced = await Promise.all([first, second]);
    t.equal(replaced.every((value) =>
      value.state === CDC_COVERAGE_RECONCILE_STATE.RETIRED), true,
    'replacement retires both exact old-lifecycle waiters');
    await flush();
    t.equal(answers.length, 2,
      'retained debt rearms once under the replacement lifecycle');
    const replacementWaiter = readCdcCoverageReconcileDiagnostics(service)[0];
    t.equal(replacementWaiter.waiters, 1,
      'replacement owns one new waiter, not either old waiter');
    service.markShuttingDown();
    t.same(readCdcCoverageReconcileDiagnostics(service), [],
      'shutdown synchronously clears replacement waiter and debt');
    answers[0]({success: true});
    answers[1]({success: true});
    await flush();
    t.end();
  });

test('C17 deadline fences a late answer and one cooldown re-arms debt',
  async (t) => {
    const service = owner();
    const answers = [];
    let launches = 0;
    const execute = () => new Promise((resolve) => {
      launches += 1;
      answers.push(resolve);
    });
    const first = armCdcCoverageReconcile(service, request(service), execute);
    await flush();
    service.timeSource.advance(1000);
    await flush();
    const spent = await first;
    t.equal(spent.state, CDC_COVERAGE_RECONCILE_STATE.SPENT);
    t.equal(launches, 1);
    answers[0]({success: true});
    await flush();
    t.equal(readCdcCoverageReconcileDiagnostics(service)[0].windowsSpent, 1,
      'late completion cannot clear retained debt');
    service.timeSource.advance(999);
    await flush();
    t.equal(launches, 1, 'cooldown does not launch early');
    service.timeSource.advance(1);
    await flush();
    t.equal(launches, 2, 'one cooldown wake starts one new generation');
    answers[1]({success: true});
    await flush();
    t.same(readCdcCoverageReconcileDiagnostics(service), [],
      'new generation can complete after late old answer');
    retireCdcCoverageLifecycle(service);
    t.end();
  });

test('C17 sub-minimum remainder launches no extra request', async (t) => {
  const service = owner();
  let launches = 0;
  const promise = armCdcCoverageReconcile(service, request(service, 99), () => {
    launches += 1;
    return {success: false, deferRetry: true, retryAfterMs: 1,
      reasonCode: 'no-handler'};
  });
  await flush();
  t.equal(launches, 1, 'initial request launched');
  service.timeSource.advance(98);
  await flush();
  t.equal(launches, 1, '99ms generation never rounds up a retry');
  service.timeSource.advance(1);
  await flush();
  t.equal((await promise).state, CDC_COVERAGE_RECONCILE_STATE.SPENT);
  t.equal(launches, 1, 'deadline transition launches no request');
  retireCdcCoverageLifecycle(service);
  t.end();
});

test('C17 lifecycle retirement cancels deadline and cooldown authority',
  async (t) => {
    const service = owner();
    let finish;
    let launches = 0;
    const promise = armCdcCoverageReconcile(service, request(service), () => {
      launches += 1;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await flush();
    service.isShuttingDown = true;
    retireCdcCoverageLifecycle(service);
    finish({success: true});
    await flush();
    t.equal((await promise).state, CDC_COVERAGE_RECONCILE_STATE.RETIRED);
    service.timeSource.advance(60000);
    await flush();
    t.equal(launches, 1, 'retired timers cannot launch replacement work');
    t.same(readCdcCoverageReconcileDiagnostics(service), []);
    t.end();
  });

test('C17 capacity release coalesces an immediate retained-debt wake',
  async (t) => {
    const service = owner();
    reserveCdcCoverageTransfer(service, {transferId: 'held-capacity',
      retainedBytes: 1, category: 'consumer'});
    let launches = 0;
    const first = armCdcCoverageReconcile(service, request(service, 99), () => {
      launches += 1;
      return {success: false, deferRetry: true,
        reasonCode: 'cdc_coverage_capacity_unavailable'};
    });
    await flush();
    service.timeSource.advance(99);
    await first;
    t.equal(launches, 1, 'debt waits behind one cooldown backstop');
    releaseCdcCoverageTransfer(service, 'held-capacity');
    await flush();
    t.equal(launches, 2, 'the canonical release wakes the retained debt');
    retireCdcCoverageLifecycle(service);
    t.end();
  });

test('C17 shared node capacity release wakes another endpoint owner',
  async (t) => {
    const service = owner();
    service.nodeId = 'shared-wake-node';
    const sourceEndpoint = {nodeId: 'shared-wake-node'};
    reserveCdcCoverageTransfer(sourceEndpoint, {transferId: 'source-held',
      retainedBytes: 1, category: 'source'});
    let launches = 0;
    const first = armCdcCoverageReconcile(service, request(service, 99), () => {
      launches += 1;
      return {success: false, deferRetry: true,
        reasonCode: 'cdc_coverage_capacity_unavailable'};
    });
    await flush();
    service.timeSource.advance(99);
    await first;
    t.match(readCdcCoverageTransferDiagnostics(service).held, [{
      transferId: 'source-held', category: 'source', retainedBytes: 1,
      endpointNodeId: 'shared-wake-node', partitionId: null, tableName: null,
      targetNodeId: null, targetLifecycleId: null,
      reconcileGenerationId: null,
    }], 'recipient diagnostics identify the other endpoint capacity holder');
    releaseCdcCoverageTransfer(sourceEndpoint, 'source-held');
    await flush();
    t.equal(launches, 2,
      'node-wide capacity release reaches the recipient endpoint debt');
    retireCdcCoverageLifecycle(service);
    retireCdcCoverageTransferOwner(sourceEndpoint);
    t.end();
  });

test('C17 route installation wakes retained debt through the service setter',
  async (t) => {
    const timeSource = new VirtualTimeSource({startMs: 1000});
    const service = new CDCIntegrationService({nodeId: 'route-recipient',
      timeSource, systemTableCache: new SystemTableCache()});
    let launches = 0;
    const first = armCdcCoverageReconcile(service, request(service, 99), () => {
      launches += 1;
      return {success: false, deferRetry: true, reasonCode: 'no-route'};
    });
    await flush();
    timeSource.advance(99);
    await first;
    service.setMessageRouter({});
    await flush();
    t.equal(launches, 2, 'the production route setter wakes retained debt');
    service.markShuttingDown();
    t.end();
  });

test('C17 live router connection event wakes retained debt', async (t) => {
  const timeSource = new VirtualTimeSource({startMs: 1000});
  const router = new EventEmitter();
  const service = new CDCIntegrationService({nodeId: 'event-recipient',
    timeSource, systemTableCache: new SystemTableCache()});
  service.setMessageRouter(router);
  let launches = 0;
  const first = armCdcCoverageReconcile(service, request(service, 99), () => {
    launches += 1;
    return {success: false, deferRetry: true, reasonCode: 'no-route'};
  });
  await flush();
  timeSource.advance(99);
  await first;
  router.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, {nodeId: 'source'});
  await flush();
  t.equal(launches, 2,
    'actual transport connection release reaches the coalesced owner');
  service.markShuttingDown();
  t.equal(router.listenerCount(TRANSPORT_EVENT.CONNECTION_ESTABLISHED), 0,
    'shutdown unregisters the owned route wake');
  t.end();
});

test('C17 mutation target replacement rearms retained table debt', async (t) => {
  const timeSource = new VirtualTimeSource({startMs: 1000});
  const cache = new SystemTableCache();
  const service = new CDCIntegrationService({nodeId: 'replace-recipient',
    timeSource, systemTableCache: cache, cacheMutationTarget: cache});
  let launches = 0;
  const first = armCdcCoverageReconcile(service, request(service, 99), () => {
    launches += 1;
    return {success: false, deferRetry: true, reasonCode: 'target-stale'};
  });
  await flush();
  timeSource.advance(99);
  await first;
  service.setCacheMutationTarget(new SystemTableCache());
  await flush();
  t.equal(launches, 2,
    'replacement lifecycle immediately rearms the same table identity');
  t.equal(readCdcCoverageReconcileDiagnostics(service).length, 1,
    'replacement retains one coalesced debt record');
  service.markShuttingDown();
  t.end();
});

test('C17 spent diagnostics use elapsed facts and power-of-two cadence',
  async (t) => {
    const reports = [];
    const service = owner();
    service.nodeId = 'diagnostic-node';
    service.logger = {error(_message, detail) {
      reports.push(detail);
    }};
    const execute = () => ({success: false, deferRetry: true,
      reasonCode: 'source-unavailable', pages: 2, chunks: 3,
      sourceScope: {scopeId: 'scope-1'}, transferId: 'transfer-1'});
    const first = armCdcCoverageReconcile(service, request(service, 99), execute);
    await flush();
    service.timeSource.advance(99);
    await first;
    t.equal(reports.length, 1, 'first spent window is reported');
    t.equal(reports[0].elapsedMs, 99,
      'diagnostic records actual generation elapsed time');
    t.match(reports[0].lastObserved.lastAttempt, {pages: 2, chunks: 3,
      sourceScopeId: 'scope-1', transferId: 'transfer-1'});
    t.equal(reports[0].scope.targetLifecycleId.length > 0, true,
      'diagnostic binds the exact target lifecycle');
    service.timeSource.advance(1000);
    await flush();
    service.timeSource.advance(99);
    await flush();
    t.equal(reports.length, 2, 'second power-of-two window is reported');
    service.timeSource.advance(2000);
    await flush();
    service.timeSource.advance(99);
    await flush();
    t.equal(reports.length, 2,
      'third identical window is folded by the owner cadence');
    retireCdcCoverageLifecycle(service);
    t.end();
  });

test('C17 cache publication wakes retained debt through the registered listener',
  async (t) => {
    const notifications = [];
    const cache = new SystemTableCache({
      scheduleCacheChangeNotification: (callback) => notifications.push(callback),
    });
    const timeSource = new VirtualTimeSource({startMs: 1000});
    const service = new CDCIntegrationService({nodeId: 'cache-recipient',
      timeSource, systemTableCache: cache});
    let launches = 0;
    const first = armCdcCoverageReconcile(service, request(service, 99), () => {
      launches += 1;
      return {success: false, deferRetry: true, reasonCode: 'cache-stale'};
    });
    await flush();
    timeSource.advance(99);
    await first;
    cache.applySystemTableChange('nodes', 'INSERT', {node_id: 'wake-node'});
    notifications.shift()?.();
    await flush();
    t.equal(launches, 2,
      'the production deferred cache listener wakes retained debt');
    service.markShuttingDown();
    t.end();
  });
