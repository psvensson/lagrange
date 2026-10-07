import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {OperationState, PartitionSplitMergeManager} from
  '../../src/partition/partition-split-merge-manager.js';
import {createSplitMergeSimulation} from './split-merge-load-simulation.js';

ConfigurationManager.getInstance().initialize({node: {id: 'scheduler-test'}});
LoggingService.getInstance().initialize({level: 'error'});

function buildScheduler() {
  let nowMs = 1_000_000;
  const requests = [];
  const manager = new PartitionSplitMergeManager({now: () => nowMs});
  manager.requestEvaluation = (context) => requests.push(context);
  return {
    manager,
    requests,
    setNow(value) {
      nowMs = value;
    },
    flushAt(value) {
      nowMs = value;
      clearTimeout(manager.deferredRetryEvaluationTimer);
      manager.deferredRetryEvaluationTimer = null;
      manager.flushDeferredRetryEvaluation();
    },
  };
}

function context(reasonCode, partitionId) {
  return {reasonCode, partitionId};
}

for (const arrivalOrder of ['future-first', 'early-first']) {
  test(`deferred scheduler retains future obligations when ${arrivalOrder}`,
    async (t) => {
      const scheduler = buildScheduler();
      const early = context('managed_split_retry_due', 'split-p1');
      const future = context('merge_traffic_span_follow_up', 'merge-pair');
      const earlyDue = 1_000_010;
      const futureDue = 1_000_100;
      const entries = arrivalOrder === 'future-first' ?
        [[futureDue, future], [earlyDue, early]] :
        [[earlyDue, early], [futureDue, future]];
      for (const [dueAt, request] of entries) {
        scheduler.manager.armDeferredEvaluation(dueAt, request);
      }

      scheduler.flushAt(earlyDue);
      t.same(scheduler.requests, [{reasonCodes: [early.reasonCode],
        partitionIds: [early.partitionId]}],
      'the early deadline dispatches only its eligible obligation');
      t.equal(
        scheduler.manager.getEvaluationDiagnostics()
          .deferredRetryEvaluationDueAtMs,
        futureDue,
        'the not-yet-due obligation remains armed at its own deadline',
      );

      scheduler.flushAt(futureDue);
      t.same(scheduler.requests[1], {reasonCodes: [future.reasonCode],
        partitionIds: [future.partitionId]},
      'the retained future obligation dispatches when it becomes due');
      scheduler.manager.shutdown();
    });
}

test('equal deadlines and duplicate requests coalesce once through ' +
  'requestEvaluation', async (t) => {
  const scheduler = buildScheduler();
  const dueAt = 1_000_050;
  const split = context('managed_split_retry_due', 'split-p1');
  const merge = context('merge_traffic_span_follow_up', 'merge-pair');
  scheduler.manager.armDeferredEvaluation(dueAt, split);
  scheduler.manager.armDeferredEvaluation(dueAt, split);
  scheduler.manager.armDeferredEvaluation(dueAt, merge);
  scheduler.flushAt(dueAt);

  t.same(scheduler.requests, [{
    reasonCodes: [split.reasonCode, merge.reasonCode],
    partitionIds: [split.partitionId, merge.partitionId],
  }], 'one due batch reaches the existing requestEvaluation owner');
  t.equal(scheduler.manager.getEvaluationDiagnostics()
    .deferredRetryEvaluationPending, false,
  'the due batch is removed exactly once');
  scheduler.manager.shutdown();
});

test('shutdown discards every retained obligation and prevents later ' +
  'dispatch', async (t) => {
  const scheduler = buildScheduler();
  scheduler.manager.armDeferredEvaluation(1_000_010,
    context('managed_split_retry_due', 'split-p1'));
  scheduler.manager.armDeferredEvaluation(1_000_100,
    context('merge_traffic_span_follow_up', 'merge-pair'));
  scheduler.manager.shutdown();
  scheduler.setNow(1_000_200);
  scheduler.manager.flushDeferredRetryEvaluation();

  t.same(scheduler.requests, [], 'shutdown leaves no dispatchable context');
  t.equal(scheduler.manager.getEvaluationDiagnostics()
    .deferredRetryEvaluationPending, false,
  'shutdown clears retained scheduler state');
});

test('periodic reset admits a new pair follow-up only after the prior ' +
  'obligation is serviced', async (t) => {
  const scheduler = buildScheduler();
  const manager = scheduler.manager;
  t.equal(manager.scheduleMergeTrafficSpanFollowUp('left', 'right'), true,
    'the first pair follow-up is admitted');
  const dueAt = manager.getEvaluationDiagnostics()
    .deferredRetryEvaluationDueAtMs;
  scheduler.flushAt(dueAt);
  t.equal(manager.scheduleMergeTrafficSpanFollowUp('left', 'right'), false,
    'the pair remains bounded between periodic evaluations');

  await manager.evaluateAllPartitions({triggerReason: 'periodic_timer'});
  t.equal(manager.scheduleMergeTrafficSpanFollowUp('left', 'right'), true,
    'the periodic owner resets the pair admission guard');
  t.equal(manager.getEvaluationDiagnostics().deferredRetryEvaluationPending,
    true, 'the reset admits a newly retained obligation');
  manager.shutdown();
});

test('due obligations preserve requestEvaluation busy and backpressure ' +
  'semantics', async (t) => {
  let busyEvaluations = 0;
  const busy = new PartitionSplitMergeManager({
    reactiveEvaluationDebounceMs: 0,
  });
  busy.evaluateAllPartitions = async () => {
    busyEvaluations += 1;
    return {evaluated: true};
  };
  busy.state = OperationState.EVALUATING;
  busy.armDeferredEvaluation(busy.now(),
    context('managed_split_retry_due', 'split-p1'));
  clearTimeout(busy.deferredRetryEvaluationTimer);
  busy.deferredRetryEvaluationTimer = null;
  busy.flushDeferredRetryEvaluation();
  await new Promise((resolve) => setTimeout(resolve, 0));
  t.equal(busyEvaluations, 0,
    'the existing request owner retains a due batch while evaluation is busy');
  busy.state = OperationState.IDLE;
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.equal(busyEvaluations, 1,
    'the existing request owner dispatches the retained batch after idle');
  busy.shutdown();

  let pressureEvaluations = 0;
  const pressure = new PartitionSplitMergeManager({
    reactiveEvaluationDebounceMs: 0,
    pressureGovernor: {
      evaluate: () => ({action: 'defer', retryAfterMs: 20}),
    },
  });
  pressure.evaluateAllPartitions = async () => {
    pressureEvaluations += 1;
    return {evaluated: true};
  };
  pressure.armDeferredEvaluation(pressure.now(),
    context('merge_traffic_span_follow_up', 'merge-pair'));
  clearTimeout(pressure.deferredRetryEvaluationTimer);
  pressure.deferredRetryEvaluationTimer = null;
  pressure.flushDeferredRetryEvaluation();
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.equal(pressureEvaluations, 0,
    'the existing request owner preserves pressure deferral');
  await new Promise((resolve) => setTimeout(resolve, 25));
  t.equal(pressureEvaluations, 1,
    'the due batch dispatches after the pressure retry window');
  pressure.shutdown();
});

test('managed split retry injections do not consume an idle merge span ' +
  'follow-up', async (t) => {
  let interruptions = 0;
  const simulation = createSplitMergeSimulation({
    evaluation: 'periodic-only',
    onEvaluation(results, now) {
      if (results.mergeIneligible?.some((entry) =>
        entry.reason === 'traffic_span_too_long')) {
        simulation.manager.scheduleDeferredManagedSplitRetry('other-partition', {
          success: false,
          state: 'deferred',
          retry: {nextAttemptAt: new Date(now + 5000).toISOString()},
        });
        interruptions += 1;
      }
    },
  });
  await simulation.splitRequest(simulation.rows[0].partition_id);
  await simulation.run(14_400, () => 0);

  t.ok(interruptions > 0, 'the unrelated managed split retry was injected');
  t.equal(simulation.count('merge'), 1,
    'the retained merge follow-up makes the idle pair eligible and merges it');
  t.equal(simulation.partitionCount(), 1,
    'the table converges back to one partition');
  simulation.manager.shutdown();
});
