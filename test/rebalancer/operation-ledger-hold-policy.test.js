import {test} from '../../src/test-helpers/tap.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  LEDGER_QUORUM_SPREAD_CURE_MOVE_TYPES,
  OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES,
  OPERATION_LEDGER_HOLD,
  OPERATION_LEDGER_HOLD_ENGAGEMENT_BY_MOVE_CLASS,
  OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME,
  OPERATION_LEDGER_HOLD_MOVE_CLASS,
  OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION,
  OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION_BY_LIFECYCLE_EVIDENCE,
  OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE,
  classifyOperationLedgerHoldMove,
  classifyOperationLedgerSelfMoveLifecycleEvidence,
  isDisruptiveOperationLedgerSelfMove,
  orderLedgerQuorumCureMovesFirst,
  resolveOperationLedgerHoldEngagement,
  resolveOperationLedgerSelfMoveHoldAction,
} from '../../src/rebalancer/operation-ledger-hold-policy.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

// Red-on-revert pin for the single-owner hold-engagement relation (quest
// hold-engagement-single-owner-table, CL-013 lineage). The rows' exact
// memberships and the (hold x move class) outcomes are the contract: every
// widening/narrowing must fail here first and be an explicit incident-class
// decision.

// A ledger partition id in the canonical <table>-p<n> shape and an emergency
// control-plane sibling; user partitions never classify.
const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const PUBLICATIONS_PARTITION_ID =
  `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
const USER_PARTITION_ID = 'orders-p1';

test('CL-013 lineage rows keep their sealed memberships', (t) => {
  t.strictSame(
    [...OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES].sort(),
    [OperationType.REMOVE, OperationType.REPLACE].sort(),
    'disruptive self-move covers exactly {REPLACE,REMOVE} — ADD is the ' +
      'CL-013 spread-recovery lane and must stay out');
  t.strictSame(
    [...LEDGER_QUORUM_SPREAD_CURE_MOVE_TYPES].sort(),
    [OperationType.ADD, OperationType.REPLACE].sort(),
    'the quorum-spread cure admits first REPLACE and final expand ADD');
  t.end();
});

test('the (hold x move class) relation keeps its sealed outcomes', (t) => {
  const selfMove = OPERATION_LEDGER_HOLD_ENGAGEMENT_BY_MOVE_CLASS.get(
    OPERATION_LEDGER_HOLD.SELF_MOVE_SERIALIZATION,
  );
  const quorumSpread = OPERATION_LEDGER_HOLD_ENGAGEMENT_BY_MOVE_CLASS.get(
    OPERATION_LEDGER_HOLD.QUORUM_SPREAD,
  );
  t.equal(
    selfMove.get(OPERATION_LEDGER_HOLD_MOVE_CLASS.DISRUPTIVE_LEDGER_SELF_MOVE),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.IDLE_ONLY,
    'the disruptive self-move admits only into an idle ledger (run-20)');
  t.equal(
    selfMove.get(
      OPERATION_LEDGER_HOLD_MOVE_CLASS.EMERGENCY_QUORUM_RESTORE_ADD,
    ),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT,
    'emergency quorum-restore ADDs stay admissible through the interlock');
  t.equal(
    selfMove.get(OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.DEFER);
  t.equal(
    quorumSpread.get(
      OPERATION_LEDGER_HOLD_MOVE_CLASS.DISRUPTIVE_LEDGER_SELF_MOVE,
    ),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT,
    'the self-move IS the concentration cure and must pass its own hold');
  t.equal(
    quorumSpread.get(
      OPERATION_LEDGER_HOLD_MOVE_CLASS.EMERGENCY_QUORUM_RESTORE_ADD,
    ),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT);
  t.equal(
    quorumSpread.get(OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.DEFER,
    'dependents defer until placement actuals show the quorum spread (run-22)');
  // Cartesian completeness: every hold declares every move class.
  for (const holdRows of OPERATION_LEDGER_HOLD_ENGAGEMENT_BY_MOVE_CLASS
    .values()) {
    t.strictSame(
      [...holdRows.keys()].sort(),
      Object.values(OPERATION_LEDGER_HOLD_MOVE_CLASS).sort());
  }
  t.end();
});

test('the move classifier owns the conjuncts, disruptive first', (t) => {
  t.equal(
    classifyOperationLedgerHoldMove(OperationType.REPLACE, LEDGER_PARTITION_ID),
    OPERATION_LEDGER_HOLD_MOVE_CLASS.DISRUPTIVE_LEDGER_SELF_MOVE);
  t.equal(
    classifyOperationLedgerHoldMove(OperationType.REMOVE, LEDGER_PARTITION_ID),
    OPERATION_LEDGER_HOLD_MOVE_CLASS.DISRUPTIVE_LEDGER_SELF_MOVE);
  t.equal(
    classifyOperationLedgerHoldMove(OperationType.ADD, LEDGER_PARTITION_ID),
    OPERATION_LEDGER_HOLD_MOVE_CLASS.EMERGENCY_QUORUM_RESTORE_ADD,
    'a ledger ADD is the CL-013 spread-recovery lane, never disruptive');
  t.equal(
    classifyOperationLedgerHoldMove(
      OperationType.ADD,
      PUBLICATIONS_PARTITION_ID,
    ),
    OPERATION_LEDGER_HOLD_MOVE_CLASS.EMERGENCY_QUORUM_RESTORE_ADD,
    'publications ADD restores the control-plane spine');
  t.equal(
    classifyOperationLedgerHoldMove(
      OperationType.REPLACE,
      PUBLICATIONS_PARTITION_ID,
    ),
    OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT,
    'a publications REPLACE is not a ledger self-move and not an ADD');
  t.equal(
    classifyOperationLedgerHoldMove(OperationType.ADD, USER_PARTITION_ID),
    OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT);
  t.equal(
    classifyOperationLedgerHoldMove(OperationType.REPLACE, USER_PARTITION_ID),
    OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT);
  t.equal(
    classifyOperationLedgerHoldMove(null, LEDGER_PARTITION_ID),
    OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT,
    'an unknown move type never classifies into an exempt or idle-only lane');
  t.end();
});

test('ingress normalization unifies both consumer domains', (t) => {
  t.ok(isDisruptiveOperationLedgerSelfMove('replace', LEDGER_PARTITION_ID),
    'planner-cased move types resolve the same rows (CL-013 precedent: ' +
      'case-sensitive comparison here was fail-open)');
  t.ok(isDisruptiveOperationLedgerSelfMove(
    OperationType.REPLACE, LEDGER_PARTITION_ID));
  t.notOk(isDisruptiveOperationLedgerSelfMove('add', LEDGER_PARTITION_ID));
  t.notOk(isDisruptiveOperationLedgerSelfMove(
    OperationType.REPLACE, USER_PARTITION_ID));
  t.end();
});

test('unknown holds and move classes fail closed to DEFER', (t) => {
  t.equal(
    resolveOperationLedgerHoldEngagement('no_such_hold',
      OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.DEFER);
  t.equal(
    resolveOperationLedgerHoldEngagement(
      OPERATION_LEDGER_HOLD.SELF_MOVE_SERIALIZATION, 'no_such_class'),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.DEFER,
    'an undeclared combination must never silently bypass a hold');
  t.end();
});

test('self-move lifecycle evidence has one fail-closed hold action table', (t) => {
  t.strictSame(
    [...OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION_BY_LIFECYCLE_EVIDENCE],
    [
      [
        OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_TERMINAL,
        OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.RELEASE,
      ],
      [
        OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_REGISTERED,
        OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.REGISTERED,
      ],
      [
        OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE
          .AUTHORITATIVE_NON_TERMINAL,
        OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD,
      ],
      [
        OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_FOREIGN_ROW,
        OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD,
      ],
      [
        OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.UNRESOLVED,
        OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD,
      ],
    ],
    'only the holder\'s own authoritative terminal workflow evidence ' +
      'releases serialization; a registered, not yet dispatch-admissible ' +
      'waiter is REGISTERED; a foreign row and an unresolved read hold',
  );

  const terminal = {status: 'removed'};
  const nonTerminal = {status: 'sending', workflowStep: 'SENDING'};
  const registered = {status: 'pending', workflowStep: 'PENDING'};
  const isTerminal = (operation) => operation.status === 'removed';
  const targetNotReady = () => false;
  const targetReady = () => true;
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(terminal, isTerminal),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_TERMINAL,
  );
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(nonTerminal, isTerminal),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE
      .AUTHORITATIVE_NON_TERMINAL,
    'durable age is not an input: every authoritative non-terminal row holds',
  );
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(
      registered,
      isTerminal,
      targetNotReady,
    ),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_REGISTERED,
    'a PENDING self-move whose target is not dispatch-admissible is a ' +
      'registered waiter (the hold engages at dispatch admissibility)',
  );
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(
      registered,
      isTerminal,
      targetReady,
    ),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_NON_TERMINAL,
    'a PENDING self-move whose target holds a READY lease is live',
  );
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(
      nonTerminal,
      isTerminal,
      targetNotReady,
    ),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_NON_TERMINAL,
    'a self-move whose owner claimed dispatch is live regardless of the ' +
      'target lease',
  );
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(registered, isTerminal),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_NON_TERMINAL,
    'without dispatch-admissibility evidence a PENDING self-move fails closed',
  );
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(null, isTerminal),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.UNRESOLVED,
  );
  const heldOperationId = 'replace-op-held';
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(
      {...terminal, operationId: 'add-op-other'},
      isTerminal,
      targetReady,
      heldOperationId,
    ),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_FOREIGN_ROW,
    'a terminal row of another operation is foreign evidence: it never ' +
      'releases the held self-move (GCP run 23-51-32 duplicate self-move)',
  );
  t.equal(
    classifyOperationLedgerSelfMoveLifecycleEvidence(
      {...terminal, operationId: heldOperationId},
      isTerminal,
      targetReady,
      heldOperationId,
    ),
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_TERMINAL,
    'the holder\'s own terminal row releases',
  );
  t.equal(
    resolveOperationLedgerSelfMoveHoldAction('unknown_evidence'),
    OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD,
    'unknown lifecycle evidence fails closed',
  );
  t.end();
});

test('cure-first ordering owns the cure-move typing', (t) => {
  const cure = {type: 'replace', partitionId: LEDGER_PARTITION_ID};
  const implicitCure = {type: 'replace'};
  const add = {type: 'add', partitionId: LEDGER_PARTITION_ID};
  const otherPartitionReplace = {type: 'replace', partitionId: 'orders-p1'};
  t.strictSame(
    orderLedgerQuorumCureMovesFirst(
      [add, otherPartitionReplace, cure, implicitCure],
      LEDGER_PARTITION_ID,
    ),
    [add, cure, implicitCure, otherPartitionReplace],
    'declared ADD/REPLACE cures move first without changing their order');
  t.strictSame(
    orderLedgerQuorumCureMovesFirst(null, LEDGER_PARTITION_ID),
    [],
    'non-array input degrades to an empty plan');
  t.end();
});
