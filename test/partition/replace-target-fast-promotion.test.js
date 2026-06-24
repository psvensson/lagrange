/**
 * Falsifier + safety pins for the REPLACE-target fast learner-promotion lever
 * (default-off LAGRANGE_PR_REPLACE_TARGET_FAST_PROMOTION).
 *
 * Rolling-restart gate stat-gate-20260624T051927Z run1 stalled on
 * `operation_drain_stalled` / `critical_system_spread_open`: a critical-system
 * partition (replica_operations-p1) held at 2/3 voter-ready distinct nodes
 * because the REPLACE-target replica on a healthy steady-state member never
 * reached voter-ready inside the ~30s quiescence window. The two existing
 * fast-promotion predicates only fire for fresh-formation (isJoiningExistingGroup)
 * and restart-recovery (PRIORITY_CONTROL_PLANE_RECOVERY_PENDING) nodes, so a
 * REPLACE target on a steady-state member fell through to the slow
 * learnerPromotionDelayMs and never promoted in budget.
 *
 * This lever recognizes the REPLACE-target case and gives it the same fast
 * delay. The promotion itself still passes the unchanged quorum-membership gate
 * in checkLearnerPromotion (this only schedules the first check earlier).
 *
 * This test pins: the flag-off gap (slow delay = the falsifier), the flag-on fix
 * (fast delay), and the safety scopes (non-priority / non-REPLACE / wrong-target
 * / terminal op stay on the slow path).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createPartitionServiceLearnerPromotionMethods,
} from '../../src/partition/partition-service-learner-promotion-methods.js';
import {
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
} from '../../src/partition/partition-service-constants.js';

const LEARNER_PROMOTION_METHODS =
  createPartitionServiceLearnerPromotionMethods();

const FLAG = 'LAGRANGE_PR_REPLACE_TARGET_FAST_PROMOTION';
const FAST_MS = 5000;
const SLOW_MS = 30000;
const LOCAL_NODE = 'node-local';
const PRIORITY_PARTITION = 'replica_operations-p1';

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

// Real prototype so resolveLearnerPromotionDelayMs + the predicate +
// getPriorityRecoveryOperationContextsForLearnerPromotion all run for real;
// only the cache + node identity + delay constants are injected. The two
// OTHER fast-path predicates are forced false so this lever is isolated.
function buildProbe({partitionId = PRIORITY_PARTITION, operationRows = []} = {}) {
  const probe = Object.assign({}, LEARNER_PROMOTION_METHODS, {
    nodeId: LOCAL_NODE,
    partitionId,
    learnerPromotionDelayMs: SLOW_MS,
    learnerPromotionPriorityRecoveryDelayMs: FAST_MS,
    learnerCatchUpCheckIntervalMs: 1000,
    isJoiningExistingGroup: false,
    systemTableCache: {
      filter: (_table, predicate) =>
        operationRows.filter((row) => predicate(row)),
    },
    // Isolate this lever from the other two fast-path predicates.
    isPriorityRecoveryPendingForLearnerPromotion: () => false,
    isPriorityControlPlaneFormationLearnerPromotion: () => false,
  });
  return probe;
}

function replaceRow(overrides = {}) {
  return {
    operation_id: 'op-1',
    partition_id: PRIORITY_PARTITION,
    type: 'REPLACE',
    status: 'syncing',
    workflow_step: 'SYNCING',
    target_node_id: LOCAL_NODE,
    source_node_id: 'node-other',
    ...overrides,
  };
}

function delayMs(probe) {
  return probe.resolveLearnerPromotionDelayMs(
    PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.INITIAL_DELAY,
  );
}

test('FALSIFIER (flag-off): a REPLACE-target critical-system learner gets the SLOW delay',
  (t) => {
    withFlag(t, undefined);
    const probe = buildProbe({operationRows: [replaceRow()]});
    t.equal(probe.isPriorityControlPlaneReplaceTargetLearnerPromotion(), false,
      'predicate is inert with the flag off');
    t.equal(delayMs(probe), SLOW_MS,
      'falls to learnerPromotionDelayMs (30s) — too late for the 30s window');
    t.end();
  });

test('FIX (flag-on): a REPLACE-target critical-system learner gets the FAST delay',
  (t) => {
    withFlag(t, 'true');
    const probe = buildProbe({operationRows: [replaceRow()]});
    t.equal(probe.isPriorityControlPlaneReplaceTargetLearnerPromotion(), true,
      'predicate fires: local node is the target of an in-flight REPLACE');
    t.equal(delayMs(probe), FAST_MS,
      'takes the fast priority-recovery delay so it promotes inside the window');
    t.end();
  });

test('safety scope (flag-on): non-priority partition stays on the slow path',
  (t) => {
    withFlag(t, 'true');
    const probe = buildProbe({
      partitionId: 'user_data-p7',
      operationRows: [replaceRow({partition_id: 'user_data-p7'})],
    });
    t.equal(probe.isPriorityControlPlaneReplaceTargetLearnerPromotion(), false,
      'only priority control-plane partitions are accelerated');
    t.equal(delayMs(probe), SLOW_MS);
    t.end();
  });

test('safety scope (flag-on): a REPLACE targeting ANOTHER node does not accelerate us',
  (t) => {
    withFlag(t, 'true');
    const probe = buildProbe({
      operationRows: [replaceRow({target_node_id: 'node-other'})],
    });
    t.equal(probe.isPriorityControlPlaneReplaceTargetLearnerPromotion(), false,
      'we are not the REPLACE target');
    t.equal(delayMs(probe), SLOW_MS);
    t.end();
  });

test('safety scope (flag-on): an ADD targeting us does NOT take the REPLACE-target path',
  (t) => {
    withFlag(t, 'true');
    const probe = buildProbe({
      operationRows: [replaceRow({type: 'ADD'})],
    });
    t.equal(probe.isPriorityControlPlaneReplaceTargetLearnerPromotion(), false,
      'scoped to REPLACE — an ADD is not a critical-system rebuild-in-place');
    t.equal(delayMs(probe), SLOW_MS);
    t.end();
  });

test('safety scope (flag-on): a TERMINAL REPLACE is excluded (only in-flight ops accelerate)',
  (t) => {
    withFlag(t, 'true');
    // TERMINAL_STATUSES = active|removed|failed; by the time the op reaches
    // these the learner has already promoted, so it must not re-accelerate.
    for (const status of ['removed', 'active', 'failed']) {
      const probe = buildProbe({
        operationRows: [replaceRow({status, workflow_step: 'REMOVED'})],
      });
      t.equal(probe.isPriorityControlPlaneReplaceTargetLearnerPromotion(), false,
        `a terminal (${status}) REPLACE no longer needs fast promotion`);
      t.equal(delayMs(probe), SLOW_MS, `${status} stays on the slow path`);
    }
    t.end();
  });

test('flag-on with NO matching op: stays on the slow path (no spurious acceleration)',
  (t) => {
    withFlag(t, 'true');
    const probe = buildProbe({operationRows: []});
    t.equal(probe.isPriorityControlPlaneReplaceTargetLearnerPromotion(), false);
    t.equal(delayMs(probe), SLOW_MS);
    t.end();
  });
