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
