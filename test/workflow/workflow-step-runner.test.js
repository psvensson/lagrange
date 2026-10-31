import {test} from '../../src/test-helpers/tap.js';
import {TIMEOUT_BUDGET_CLASSIFICATION} from
  '../../src/control-plane/timeout-budget.js';
import {TimeoutPolicy} from '../../src/workflow/timeout-policy.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {WorkflowStepRunner} from '../../src/workflow/workflow-step-runner.js';
import {
  ROLLUP_DECISION_OUTCOME,
  ROLLUP_DEFAULT_CONFIG,
  ROLLUP_RESOLUTION_MS,
} from '../../src/workflow/partition-feature-rollup-constants.js';
import {
  PartitionFeatureRollupStore,
} from '../../src/workflow/partition-feature-rollup-store.js';
import {
  EpochLazyFeatureBackfillCoordinator,
} from '../../src/workflow/epoch-lazy-feature-backfill.js';
import {
  evaluateRawWindowOracle,
  runScenarioCRollupComparison,
} from '../distributed/harness/scenario-c-rollup-comparator.js';

const FIXTURE_NOW_MS = 5000;

test('WorkflowStepRunner requires an explicit workflow coordinator owner',
  (t) => {
    t.throws(
      () => new WorkflowStepRunner(),
      /workflow coordinator/,
    );
    t.end();
  });

test('WorkflowStepRunner advances a durable workflow through the shared ' +
  'owner lane', async (t) => {
  const persisted = [];
  const workflowCoordinator = new DurableWorkflowCoordinator({
    persistWorkflow: async (workflow) => {
      persisted.push({
        workflowId: workflow.workflowId,
        step: workflow.step,
        status: workflow.status,
      });
    },
    now: () => FIXTURE_NOW_MS,
  });
  await workflowCoordinator.registerWorkflow({
    workflowId: 'wf-1',
    ownerKey: 'partition:p-1',
    step: 'admission_pending',
    status: 'admission_pending',
    transitionHistory: [],
  });

  const runner = new WorkflowStepRunner({
    workflowCoordinator,
    timeoutPolicy: new TimeoutPolicy({
      operationName: 'split',
      configuredBudgetMs: 1000,
      now: () => FIXTURE_NOW_MS,
    }),
    now: () => FIXTURE_NOW_MS,
  });

  const result = await runner.runStep({
    workflowId: 'wf-1',
    stepName: 'prepare_split',
    requestedBudgetMs: 400,
    classification:
      TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
    timeoutError: 'prepare split timed out',
    execute: async ({workflow, timeoutBudget}) => {
      t.equal(workflow.workflowId, 'wf-1');
      t.equal(timeoutBudget.configuredBudgetMs, 400);
      return {
        nextStep: 'split_preparing',
        reason: 'prepared',
        updates: {
          status: 'split_preparing',
          metadata: {prepared: true},
        },
        result: {ok: true},
      };
    },
  });

  const workflow = workflowCoordinator.getWorkflowById('wf-1');
  t.same(result, {ok: true});
  t.equal(workflow.step, 'split_preparing');
  t.equal(workflow.status, 'split_preparing');
  t.same(workflow.metadata, {prepared: true});
  t.equal(persisted.at(-1).step, 'split_preparing');
});

test('PartitionFeatureRollupStore maintains decomposable micro-buckets', async (t) => {
  const store = new PartitionFeatureRollupStore({
    bucketDurationMs: ROLLUP_RESOLUTION_MS.ONE_MINUTE,
  });
  const baseTs = 1700000000000;
  store.applyCommittedEvent({
    entityId: 'acct-100',
    timestampMs: baseTs,
    amountCents: 2000,
    deviceId: 'dev-a',
    merchantId: 'merch-1',
  });
  store.applyCommittedEvent({
    entityId: 'acct-100',
    timestampMs: baseTs + 20 * ROLLUP_RESOLUTION_MS.ONE_MINUTE,
    amountCents: 5000,
    deviceId: 'dev-b',
    merchantId: 'merch-2',
  });

  const nowMs = baseTs + 20 * ROLLUP_RESOLUTION_MS.ONE_MINUTE;
  const rollup15m = store.evaluateWindowRollup({
    entityId: 'acct-100',
    nowMs,
    windowMs: ROLLUP_DEFAULT_CONFIG.DEFAULT_WINDOW_MS,
  });
  t.equal(rollup15m.eventCount, 1);
  t.equal(rollup15m.amountCentsSum, 5000);
  t.equal(rollup15m.maxAmountCents, 5000);
  t.equal(rollup15m.distinctDevices, 1);
  t.equal(rollup15m.distinctMerchants, 1);

  const rollup30m = store.evaluateWindowRollup({
    entityId: 'acct-100',
    nowMs,
    windowMs: ROLLUP_DEFAULT_CONFIG.EXTENDED_WINDOW_MS,
  });
  t.equal(rollup30m.eventCount, 2);
  t.equal(rollup30m.amountCentsSum, 7000);
  t.equal(rollup30m.maxAmountCents, 5000);
  t.equal(rollup30m.distinctDevices, 2);
  t.equal(rollup30m.distinctMerchants, 2);
  t.equal(rollup30m.decision, ROLLUP_DECISION_OUTCOME.REVIEW);
});

test('EpochLazyFeatureBackfillCoordinator coordinates lazy and background cutover', async (t) => {
  const store = new PartitionFeatureRollupStore();
  const baseTs = 1700000000000;
  const rawLogs = new Map([
    ['hot-acct', [{entityId: 'hot-acct', timestampMs: baseTs, amountCents: 1000, deviceId: 'd1', merchantId: 'm1', crossBorder: 1}]],
    ['cold-acct', [{entityId: 'cold-acct', timestampMs: baseTs, amountCents: 1500, deviceId: 'd2', merchantId: 'm2', crossBorder: 1}]],
  ]);

  const coordinator = new EpochLazyFeatureBackfillCoordinator({
    rollupStore: store,
    getEntityEvents: (id) => rawLogs.get(id) || [],
  });
  for (const events of rawLogs.values()) {
    for (const ev of events) {
      coordinator.ingestCommittedEvent(ev);
    }
  }

  const deploy2 = coordinator.deployRuleChange({
    ruleEpoch: 2,
    windowMs: ROLLUP_DEFAULT_CONFIG.EXTENDED_WINDOW_MS,
    requiresRawReplay: false,
  });
  t.equal(deploy2.decisionDowntimeMs, 0);
  t.equal(deploy2.backfillPendingCount, 0);
  t.equal(store.getEntityFeatureEpoch('hot-acct'), 2);

  const deploy3 = coordinator.deployRuleChange({
    ruleEpoch: 3,
    requiresRawReplay: true,
    customAttributeExtractor: (ev) => (ev.crossBorder ? 1 : 0),
    customAttributeWeight: 40,
  });
  t.equal(deploy3.backfillPendingCount, 2);

  const hotDecision = coordinator.evaluateDecision({
    entityId: 'hot-acct',
    nowMs: baseTs,
  });
  t.equal(hotDecision.lazyCutoverApplied, true);
  t.equal(hotDecision.staleRead, false);
  t.equal(hotDecision.customAttributeSum, 1);

  const step = coordinator.stepBackgroundBackfill({batchSize: 10});
  t.equal(step.skippedAlreadyUpgraded, 1);
  t.equal(step.upgradedInBatch, 1);
  t.equal(step.remainingPendingCount, 0);
  t.equal(step.wanBytesTransferred, 0);
});

test('runScenarioCRollupComparison proves 100% score and decision parity', async (t) => {
  const oracle = evaluateRawWindowOracle({
    entityId: 'acct-1',
    events: [{entityId: 'acct-1', timestampMs: 60000, amountCents: 1000, deviceId: 'd1', merchantId: 'm1'}],
    nowMs: 60000,
  });
  t.equal(oracle.eventCount, 1);
  const report = runScenarioCRollupComparison({entityCount: 8, hotEntityCount: 2});
  t.equal(report.parityMismatches, 0);
  t.equal(report.staleReads, 0);
  t.equal(report.decisionDowntimeMs, 0);
  t.equal(report.wanBytesTransferred, 0);
  t.equal(report.lazyCutoverCount, 2);
  t.equal(report.skippedAlreadyUpgradedCount, 2);
  t.equal(report.backgroundUpgradedCount, 6);
  t.ok(report.rollupBucketsScannedTotal < report.rawEventsScannedTotal);
});
