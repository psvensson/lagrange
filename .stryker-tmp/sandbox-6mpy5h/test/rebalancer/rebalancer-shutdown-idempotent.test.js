// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {createTestRebalancer} from './test-helpers.js';

test('UnifiedRebalancer shutdown is idempotent — no error on second call',
  async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'tables-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'test-node',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    // Force active timers so shutdown has real work to do.
    // scheduleNextCheck creates scheduledCheck timer.
    // recordStateChange creates stabilizationTimer.
    rebalancer.cancelScheduledCheck();
    rebalancer.scheduleNextCheck();
    rebalancer.recordStateChange('test_trigger');

    t.equal(
      rebalancer.scheduledCheck,
      null,
      'recordStateChange clears the stale scheduledCheck timer',
    );
    t.ok(rebalancer.stabilizationTimer, 'stabilizationTimer is active');

    // First shutdown — clears timers, sets isShuttingDown.
    rebalancer.shutdown();

    t.equal(rebalancer.isShuttingDown, true, 'isShuttingDown set after first');
    t.equal(rebalancer.scheduledCheck, null, 'scheduledCheck cleared');
    t.equal(rebalancer.stabilizationTimer, null, 'stabilizationTimer cleared');

    // Second shutdown — must not throw and timers stay cleared.
    rebalancer.shutdown();

    t.equal(rebalancer.isShuttingDown, true, 'isShuttingDown still true');
    t.equal(rebalancer.scheduledCheck, null, 'scheduledCheck still null');
    t.equal(rebalancer.stabilizationTimer, null, 'stabilizationTimer still null');
  });
