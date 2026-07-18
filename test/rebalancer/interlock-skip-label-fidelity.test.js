import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from '../../src/test-helpers/tap.js';
import {UnifiedRebalancerMoveExecution} from
  '../../src/rebalancer/unified-rebalancer-move-execution.js';

// Quest formation-ledger-post-spread-voter-visibility-latency: every
// operation-ledger interlock rejection is typed through
// createConcurrentOperationBudgetError, so the skip result (and the
// MOVE_SKIPPED log built from it) reads reason=budget_exceeded with a
// hard-coded limit of 1 while the TRUE reason code
// (operation_ledger_quorum_concentrated / self_move_in_flight / ...) sits
// unread in error.admissionResult — run-24 and run-27 forensics each burned a
// trail on the mislabel. The executeMoveViaCoordinator skip branch must
// attach the admission evidence when the thrown error carries it.

const QUORUM_REASON_CODE = 'operation_ledger_quorum_concentrated';
const OWNER_COMPLEXITY_BASELINE_LINES = 3814;
const OWNER_COMPLEXITY_SOURCE_FILES = Object.freeze([
  'src/rebalancer/unified-rebalancer-critical-topology-methods.js',
  'src/rebalancer/unified-rebalancer-follow-up-decision.js',
  'src/rebalancer/unified-rebalancer-follow-up-move.js',
  'src/rebalancer/unified-rebalancer-move-execution.js',
  'src/rebalancer/unified-rebalancer-priority-readiness.js',
]);
const OWNER_COMPLEXITY_METRIC_SCRIPTS = Object.freeze([
  'scripts/check-complexity.js',
  'scripts/check-cognitive-complexity.js',
]);

function sourceLineCount(filePath) {
  return readFileSync(filePath, 'utf8').split('\n').length;
}

function runScopedMetricGuard(scriptPath) {
  return spawnSync(
    process.execPath,
    [
      scriptPath,
      '--scoped',
      '--strict',
      ...OWNER_COMPLEXITY_SOURCE_FILES,
    ],
    {encoding: 'utf8'},
  );
}

function buildInterlockShapedError() {
  // Shape contract of createOperationLedgerInterlockError: BOTH channels set.
  const error = new Error(
    'Operation-ledger partition replica_operations-p1 quorum is ' +
      'concentrated on one node; operation admission deferred until the ' +
      'ledger spreads',
  );
  error.rebalanceSkipReason = 'budget_exceeded';
  error.operationType = 'REPLACE';
  error.limit = 1;
  error.admissionResult = Object.freeze({
    allowed: false,
    decisionType: 'deferred',
    reason: QUORUM_REASON_CODE,
    blockingReasons: Object.freeze([Object.freeze({code: QUORUM_REASON_CODE})]),
  });
  return error;
}

function buildExecutionSelf(thrownError) {
  const proto = UnifiedRebalancerMoveExecution.prototype;
  return {
    isShuttingDown: false,
    entityId: 'replica_operations-p1',
    entityType: 'partition',
    logger: {debug: () => {}, info: () => {}, warn: () => {}, error: () => {}},
    rebalanceCoordinator: {
      getMoveSafetyError: async () => null,
      createOperation: async () => {
        throw thrownError;
      },
    },
    resolvePublishedMembershipPlanningEpoch: () => null,
    buildSkippedMoveResult: proto.buildSkippedMoveResult ||
      Object.getPrototypeOf(proto).buildSkippedMoveResult,
    resolveCoordinatorOperationType: proto.resolveCoordinatorOperationType ||
      Object.getPrototypeOf(proto).resolveCoordinatorOperationType,
    buildRebalanceResult: proto.buildRebalanceResult ||
      Object.getPrototypeOf(proto).buildRebalanceResult,
  };
}

test('interlock skip label fidelity - skipped move result carries the admission reason code', async (t) => {
  const self = buildExecutionSelf(buildInterlockShapedError());
  // Bind the prototype chain methods the fake references lazily.
  for (const name of [
    'buildSkippedMoveResult',
    'resolveCoordinatorOperationType',
    'buildRebalanceResult',
  ]) {
    let proto = UnifiedRebalancerMoveExecution.prototype;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, name)) {
      proto = Object.getPrototypeOf(proto);
    }
    t.ok(proto, `prototype chain provides ${name}`);
    self[name] = proto[name];
  }

  const result = await UnifiedRebalancerMoveExecution.prototype
    .executeMoveViaCoordinator.call(self, {
      type: 'replace',
      partitionId: 'replica_operations-p1',
      replicaId: 'replica_operations-p1-r3',
      nodeId: 'node-4',
    });

  t.equal(result.skipped, true, 'the interlock rejection skips the move');
  t.equal(
    result.reason,
    'budget_exceeded',
    'the typed skip channel is unchanged (planner retry semantics intact)',
  );
  // THE quest assertion (RED on head): the admission evidence must ride the
  // skip result so MOVE_SKIPPED forensics see the true reason code.
  t.equal(
    result.admission?.reason,
    QUORUM_REASON_CODE,
    'the skip result carries the interlock admission reason code',
  );
});

test('mixed readiness groups stay executable without a stale skip detail', async (t) => {
  const nodeMoves = [
    {type: 'add', nodeId: 'node-4'},
    {
      type: 'add',
      nodeId: 'node-4',
      targetReadinessMode: 'defer_to_workflow_owner',
    },
  ];
  const self = {
    isShuttingDown: false,
    shouldRequireMoveTargetReadiness: (move) =>
      move.targetReadinessMode !== 'defer_to_workflow_owner',
    getNodeReadinessSkipReason: async () => 'repair_ineligible',
    normalizePreExecutionSkipDetail: (skipDetail) => skipDetail || 'none',
    groupMovesByTargetNode: () => new Map([['node-4', nodeMoves]]),
    buildPreExecutionReadinessGroups: () => [],
    buildPreExecutionHandoffSnapshot: ({executableGroups}) =>
      ({executableGroups}),
  };

  const plan = await UnifiedRebalancerMoveExecution.prototype
    .buildPreExecutionHandoffPlan.call(self, nodeMoves);
  t.equal(plan.executableGroups.length, 1, 'the mixed group stays executable');
  t.equal(
    plan.executableGroups[0].skipDetail,
    'none',
    'an executable mixed group does not retain the strict move skip detail',
  );
  t.equal(plan.executableGroups[0].skipBeforeExecute, false);
  t.equal(plan.results.length, 0, 'neither move is reported as skipped');
});

test('planning owner refactor stays below sealed size and complexity limits', (t) => {
  const lineCounts = OWNER_COMPLEXITY_SOURCE_FILES.map(sourceLineCount);
  t.ok(
    lineCounts.every((lineCount) => lineCount <= 800),
    `scoped source line counts: ${lineCounts.join(', ')}`,
  );
  t.ok(
    lineCounts.reduce((total, lineCount) => total + lineCount, 0) <
      OWNER_COMPLEXITY_BASELINE_LINES,
    'aggregate scoped lines decrease from the sealed inventory baseline',
  );
  for (const scriptPath of OWNER_COMPLEXITY_METRIC_SCRIPTS) {
    const result = runScopedMetricGuard(scriptPath);
    t.equal(
      result.status,
      0,
      `${scriptPath} passes:\n${result.stdout || result.stderr}`,
    );
  }
  t.end();
});
