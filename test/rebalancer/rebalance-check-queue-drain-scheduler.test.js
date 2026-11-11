// The rebalancer's check queue declares how its drain is scheduled through the
// same construction port every OwnerKeyReconcileQueue owner uses
// (scheduleDrainFn). Left out, the queue's one production default applies: a
// drain on its own host turn (a macrotask). Declared, the declared scheduler
// is the only one used. The entry point is production's: leadership
// acquisition on a control-plane priority partition enqueues the first check.
import {test} from '../../src/test-helpers/tap.js';
import {createTestRebalancer} from './test-helpers.js';
import {drainTurn} from '../helpers/reconcile-queue-turns.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

const PRIORITY_PARTITION_ID = `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
const MICROTASK_FLUSHES = 20;

function createLeaderCandidate(extra = {}) {
  const armedTimers = [];
  const rebalancer = createTestRebalancer({
    entityId: PRIORITY_PARTITION_ID,
    // The planner's periodic check is armed on an explicit clock so the
    // witness owns every timer it creates.
    setTimeoutFn: (callback, delayMs) => {
      const handle = {callback, delayMs};
      armedTimers.push(handle);
      return handle;
    },
    clearTimeoutFn: () => {},
    ...extra,
  });
  const checks = [];
  // Observe the queue's reconcile, not the full planning pass: the subject is
  // when the drain runs.
  rebalancer.reconcileRebalanceCheck = async (reasons) => {
    checks.push([...reasons]);
  };
  return {rebalancer, checks, armedTimers};
}

async function flushMicrotasks() {
  for (let index = 0; index < MICROTASK_FLUSHES; index += 1) {
    await Promise.resolve();
  }
}

test('a production-constructed rebalancer drains its check queue on a macrotask',
  async (t) => {
    const {rebalancer, checks} = createLeaderCandidate();
    t.ok(rebalancer.isControlPlanePriorityPartition(),
      'the entity is a control-plane priority partition');
    rebalancer.setLeader(true);
    t.equal(rebalancer.rebalanceCheckQueue.isCurrentWorkIdle(), false,
      'leadership admitted a check');
    await flushMicrotasks();
    t.equal(checks.length, 0, 'no microtask chain runs the drain');
    await drainTurn();
    t.equal(checks.length, 1, 'the next host turn runs exactly one check');
    await rebalancer.awaitCurrentWorkIdle();
    rebalancer.shutdown();
  });

test('a declared drain scheduler is the only one the check queue uses',
  async (t) => {
    const scheduled = [];
    const {rebalancer, checks} = createLeaderCandidate({
      scheduleDrainFn: (callback) => scheduled.push(callback),
    });
    rebalancer.setLeader(true);
    t.equal(scheduled.length, 1, 'the first check is handed to the declared scheduler');
    await flushMicrotasks();
    await drainTurn();
    await drainTurn();
    t.equal(checks.length, 0, 'no host turn drains a queue whose scheduler is declared');
    t.equal(rebalancer.rebalanceCheckQueue.isCurrentWorkIdle(), false,
      'the held drain keeps the admitted check current');
    scheduled.shift()();
    await rebalancer.awaitCurrentWorkIdle();
    t.equal(checks.length, 1, 'running the declared drain runs the check');
    t.equal(scheduled.length, 0, 'and nothing else was scheduled');
    rebalancer.shutdown();
  });
