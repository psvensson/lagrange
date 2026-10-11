import {test} from '../../src/test-helpers/tap.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  registerCdcCoverageLifecycle,
  retireCdcCoverageLifecycle,
} from '../../src/cdc/cdc-coverage-lifecycle-owner.js';
import {
  CDC_COVERAGE_RECONCILE_STATE,
  armCdcCoverageReconcile,
  readCdcCoverageReconcileDiagnostics,
} from '../../src/cdc/cdc-coverage-reconcile-owner.js';

function owner() {
  const service = {timeSource: new VirtualTimeSource({startMs: 1000}),
    systemTableCache: {}, cacheMutationTarget: {}, isShuttingDown: false,
    logger: {warn() {}}};
  registerCdcCoverageLifecycle(service);
  return service;
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
  t.equal(first, joined, 'same lifecycle/partition/table joins one promise');
  t.equal(launches, 1, 'only one request is in flight');
  finish({success: true});
  t.equal((await first).state, CDC_COVERAGE_RECONCILE_STATE.COMPLETE);
  t.same(readCdcCoverageReconcileDiagnostics(service), [],
    'semantic completion clears debt');
  retireCdcCoverageLifecycle(service);
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
