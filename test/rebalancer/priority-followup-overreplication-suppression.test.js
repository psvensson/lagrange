/**
 * Falsifier + fix pin for the over-target priority-recovery follow-up ADD
 * (default-off LAGRANGE_PR_SUPPRESS_OVERTARGET_FOLLOWUP_ADD).
 *
 * Diagnosis (gate stat-gate-20260624T125429Z, file:line): the binding
 * rolling-restart PASS blocker once spread+drain are cleared is leadership_unstable,
 * caused by OVER-REPLICATION. When a restarted node returns, the priority-recovery
 * follow-up (buildPriorityRecoveryFollowUpMove) selects it as an "unused eligible"
 * target; because the cohort is already at target voter-ready count and no node
 * hosts a removable surplus replica, shouldReplace is false and it falls through to
 * a BARE additive ADD (INCREASE_REPLICA_COUNT) -> 3->4 over-replication -> raft
 * majority churn -> leadership_unstable, without advancing recovery.
 *
 * This is NOT the C-2 calculatePartitionPlacement path (that path is bypassed by the
 * priority-recovery "operation_creation_required" follow-up). The fix gates the bare
 * ADD to genuine UNDER-replication only.
 *
 * This test pins: flag-off bare ADD at-target (the falsifier), flag-on suppression
 * at-target, flag-on STILL adds for genuine under-replication (no liveness loss),
 * and flag-on REPLACE (removable source) is unaffected.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancerFollowUpMove,
} from '../../src/rebalancer/unified-rebalancer-follow-up-move.js';
import {
  UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED,
} from '../../src/rebalancer/unified-rebalancer-follow-up-shared.js';

const {
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE: STATE,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON: REASON,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD: FIELD,
} = SHARED;

const FLAG = 'LAGRANGE_PR_SUPPRESS_OVERTARGET_FOLLOWUP_ADD';
const TARGET_COUNT = 3;
const RETURNED_NODE = 'returned-node';

function withFlag(t, value) {
  const previous = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  t.teardown(() => {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  });
}

// Drive the REAL buildPriorityRecoveryFollowUpMove + buildPriorityRecoveryFollowUpMoveOutcome;
// stub only the input-resolving helpers so we can pose the exact at-target / under-target
// / removable-source cases the gate witnessed.
function runFollowUp({healthyCount, sourceReplica}) {
  const probe = Object.create(UnifiedRebalancerFollowUpMove.prototype);
  const healthyReplicas = Array.from({length: healthyCount}, (_unused, index) => ({
    node_id: `incumbent-${index}`,
    replica_id: `sql_transactions-p1-r${index}`,
    status: 'active',
  }));
  probe.isPriorityRecoveryFollowUpOperationRequired = () => true;
  probe.resolvePriorityRecoveryFollowUpPartitionId = () => 'sql_transactions-p1';
  probe.resolvePriorityRecoveryFollowUpCurrentReplicas = () => healthyReplicas;
  probe.selectPriorityRecoveryFollowUpTargetNodeId = () => RETURNED_NODE;
  probe.buildPriorityRecoveryFollowUpSerialWaitMoveFields = () => ({});
  probe.getHealthyReplicas = () => healthyReplicas;
  probe.resolvePriorityRecoveryFollowUpTargetReplicaCount = () => TARGET_COUNT;
  probe.selectPriorityRecoveryFollowUpSourceReplica = () => sourceReplica;
  return probe.buildPriorityRecoveryFollowUpMove({decision: {decisionSnapshot: {}}});
}

test('FALSIFIER (flag-off): at-target cohort + no removable source emits a bare additive ADD (the over-replication)',
  (t) => {
    withFlag(t, undefined);
    const outcome = runFollowUp({healthyCount: TARGET_COUNT, sourceReplica: null});
    t.equal(outcome[FIELD.STATE], STATE.MOVE_CREATED, 'a move is created');
    t.equal(outcome.type, 'add', 'it is a bare ADD');
    t.equal(outcome.reason, 'increase_replica_count',
      'INCREASE_REPLICA_COUNT onto the returned node = 3->4 over-replication');
    t.equal(outcome.nodeId, RETURNED_NODE);
    t.end();
  });

test('FIX (flag-on): at-target cohort + no removable source is SUPPRESSED (no over-replication)',
  (t) => {
    withFlag(t, 'true');
    const outcome = runFollowUp({healthyCount: TARGET_COUNT, sourceReplica: null});
    t.equal(outcome[FIELD.STATE], STATE.OVER_REPLICATION_SUPPRESSED,
      'the bare ADD is suppressed at/above target');
    t.equal(outcome[FIELD.REASON], REASON.AT_TARGET_NO_REMOVABLE_SOURCE);
    t.equal(outcome.type, undefined, 'no move is emitted');
    t.notOk(
      UnifiedRebalancerFollowUpMove.prototype.isPriorityRecoveryFollowUpMoveCreated(
        outcome),
      'the suppressed outcome is NOT counted as a created move');
    t.end();
  });

test('LIVENESS (flag-on): genuine UNDER-replication still emits the additive ADD (restore to target)',
  (t) => {
    withFlag(t, 'true');
    const outcome = runFollowUp({healthyCount: TARGET_COUNT - 1, sourceReplica: null});
    t.equal(outcome[FIELD.STATE], STATE.MOVE_CREATED,
      'under target -> the additive ADD is still correct and NOT suppressed');
    t.equal(outcome.type, 'add');
    t.equal(outcome.reason, 'increase_replica_count');
    t.end();
  });

test('UNAFFECTED (flag-on): a removable source still yields a REPLACE (no suppression)',
  (t) => {
    withFlag(t, 'true');
    const outcome = runFollowUp({
      healthyCount: TARGET_COUNT,
      sourceReplica: {node_id: 'surplus-node', replica_id: 'sql_transactions-p1-r9'},
    });
    t.equal(outcome[FIELD.STATE], STATE.MOVE_CREATED);
    t.equal(outcome.type, 'replace', 'a real REPLACE is formed when a source exists');
    t.end();
  });
