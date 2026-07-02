/**
 * Tests for StoragePressureBehavior (Task 10).
 *
 * Validates:
 * - Req 8.2: soft state reduces optional balancing, allows critical
 * - Req 8.3: hard/exhausted block non-critical storage-increasing ops
 * - Req 8.5: pressure transitions observable via logs and metrics
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  MOVE_CRITICALITY,
  PRESSURE_BEHAVIOR_DECISION,
  PRESSURE_BEHAVIOR_EVENT,
  PRESSURE_STATE,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  StoragePressureBehavior,
} from '../../src/rebalancer/storage-pressure-behavior.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Build a mock accounting service that returns a fixed pressure
 * state per node.
 * @param {Object} statesByNode - Map of nodeId to pressureState
 * @return {Object}
 */
function makeAccountingService(statesByNode) {
  return {
    getCapacitySnapshotForNode: async (nodeId) => {
      const state = statesByNode[nodeId];
      if (state === undefined) return null;
      return {nodeId, pressureState: state};
    },
  };
}

test('StoragePressureBehavior', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  // --- Req 8.2: normal state allows all moves ---

  await t.test('normal state allows critical moves', async (t) => {
    const behavior = new StoragePressureBehavior({
      accountingService: makeAccountingService({
        n1: PRESSURE_STATE.NORMAL,
      }),
    });

    const result = await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.CRITICAL,
    );

    t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.ALLOW);
    t.equal(result.pressureState, PRESSURE_STATE.NORMAL);
  });

  await t.test('normal state allows non-critical moves', async (t) => {
    const behavior = new StoragePressureBehavior({
      accountingService: makeAccountingService({
        n1: PRESSURE_STATE.NORMAL,
      }),
    });

    const result = await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.NON_CRITICAL,
    );

    t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.ALLOW);
    t.equal(result.pressureState, PRESSURE_STATE.NORMAL);
  });

  // --- Req 8.2: soft state behavior ---

  await t.test('soft state allows critical moves', async (t) => {
    const behavior = new StoragePressureBehavior({
      accountingService: makeAccountingService({
        n1: PRESSURE_STATE.SOFT,
      }),
    });

    const result = await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.CRITICAL,
    );

    t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.ALLOW);
    t.equal(result.pressureState, PRESSURE_STATE.SOFT);
  });

  await t.test('soft state allows non-critical with reduced priority',
    async (t) => {
      const behavior = new StoragePressureBehavior({
        accountingService: makeAccountingService({
          n1: PRESSURE_STATE.SOFT,
        }),
      });

      const result = await behavior.shouldAllowMove(
        'n1', MOVE_CRITICALITY.NON_CRITICAL,
      );

      t.equal(result.decision,
        PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY);
      t.equal(result.pressureState, PRESSURE_STATE.SOFT);
    });

  // --- Req 8.3: hard state behavior ---

  await t.test('hard state allows critical moves', async (t) => {
    const behavior = new StoragePressureBehavior({
      accountingService: makeAccountingService({
        n1: PRESSURE_STATE.HARD,
      }),
    });

    const result = await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.CRITICAL,
    );

    t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.ALLOW);
    t.equal(result.pressureState, PRESSURE_STATE.HARD);
  });

  await t.test('hard state denies non-critical moves', async (t) => {
    const behavior = new StoragePressureBehavior({
      accountingService: makeAccountingService({
        n1: PRESSURE_STATE.HARD,
      }),
    });

    const result = await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.NON_CRITICAL,
    );

    t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.DENY);
    t.equal(result.pressureState, PRESSURE_STATE.HARD);
  });

  // --- Req 8.3: exhausted state behavior ---

  await t.test('exhausted state allows critical moves', async (t) => {
    const behavior = new StoragePressureBehavior({
      accountingService: makeAccountingService({
        n1: PRESSURE_STATE.EXHAUSTED,
      }),
    });

    const result = await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.CRITICAL,
    );

    t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.ALLOW);
    t.equal(result.pressureState, PRESSURE_STATE.EXHAUSTED);
  });

  await t.test('exhausted state denies non-critical moves',
    async (t) => {
      const behavior = new StoragePressureBehavior({
        accountingService: makeAccountingService({
          n1: PRESSURE_STATE.EXHAUSTED,
        }),
      });

      const result = await behavior.shouldAllowMove(
        'n1', MOVE_CRITICALITY.NON_CRITICAL,
      );

      t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.DENY);
      t.equal(result.pressureState, PRESSURE_STATE.EXHAUSTED);
    });

  // --- Graceful degradation ---

  await t.test('returns normal when no accounting service',
    async (t) => {
      const behavior = new StoragePressureBehavior({});

      const result = await behavior.shouldAllowMove(
        'n1', MOVE_CRITICALITY.NON_CRITICAL,
      );

      t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.ALLOW);
      t.equal(result.pressureState, PRESSURE_STATE.NORMAL);
    });

  await t.test('returns normal when snapshot is null', async (t) => {
    const behavior = new StoragePressureBehavior({
      accountingService: makeAccountingService({}),
    });

    const result = await behavior.shouldAllowMove(
      'unknown-node', MOVE_CRITICALITY.NON_CRITICAL,
    );

    t.equal(result.decision, PRESSURE_BEHAVIOR_DECISION.ALLOW);
    t.equal(result.pressureState, PRESSURE_STATE.NORMAL);
  });

  // --- Req 8.5: transition tracking and metrics ---

  await t.test('emits metric event on pressure state transition',
    async (t) => {
      let currentState = PRESSURE_STATE.NORMAL;
      const accounting = {
        getCapacitySnapshotForNode: async () => {
          return {nodeId: 'n1', pressureState: currentState};
        },
      };

      const behavior = new StoragePressureBehavior({
        accountingService: accounting,
      });

      // First call: records initial state, no transition event
      await behavior.shouldAllowMove(
        'n1', MOVE_CRITICALITY.CRITICAL,
      );
      t.equal(behavior.getMetricEvents().length, 0,
        'no event on first observation');

      // Transition normal -> soft
      currentState = PRESSURE_STATE.SOFT;
      await behavior.shouldAllowMove(
        'n1', MOVE_CRITICALITY.CRITICAL,
      );

      const events = behavior.getMetricEvents();
      t.equal(events.length, 1, 'one transition event');
      t.equal(events[0].type,
        PRESSURE_BEHAVIOR_EVENT.PRESSURE_TRANSITION);
      t.equal(events[0].nodeId, 'n1');
      t.equal(events[0].previousState, PRESSURE_STATE.NORMAL);
      t.equal(events[0].currentState, PRESSURE_STATE.SOFT);
      t.ok(events[0].timestamp > 0,
        'timestamp should be positive');
    });

  await t.test('no event when state stays the same', async (t) => {
    const behavior = new StoragePressureBehavior({
      accountingService: makeAccountingService({
        n1: PRESSURE_STATE.HARD,
      }),
    });

    await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.CRITICAL,
    );
    await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.CRITICAL,
    );

    t.equal(behavior.getMetricEvents().length, 0,
      'no event when state unchanged');
  });

  await t.test('drainMetricEvents clears buffer', async (t) => {
    let currentState = PRESSURE_STATE.NORMAL;
    const accounting = {
      getCapacitySnapshotForNode: async () => {
        return {nodeId: 'n1', pressureState: currentState};
      },
    };

    const behavior = new StoragePressureBehavior({
      accountingService: accounting,
    });

    await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.CRITICAL,
    );
    currentState = PRESSURE_STATE.HARD;
    await behavior.shouldAllowMove(
      'n1', MOVE_CRITICALITY.CRITICAL,
    );

    const drained = behavior.drainMetricEvents();
    t.equal(drained.length, 1, 'drained one event');
    t.equal(behavior.getMetricEvents().length, 0,
      'buffer is empty after drain');
  });

  await t.test('tracks transitions per node independently',
    async (t) => {
      const states = {
        n1: PRESSURE_STATE.NORMAL,
        n2: PRESSURE_STATE.SOFT,
      };
      const accounting = {
        getCapacitySnapshotForNode: async (nodeId) => {
          return {nodeId, pressureState: states[nodeId]};
        },
      };

      const behavior = new StoragePressureBehavior({
        accountingService: accounting,
      });

      // Initial observations
      await behavior.shouldAllowMove(
        'n1', MOVE_CRITICALITY.CRITICAL,
      );
      await behavior.shouldAllowMove(
        'n2', MOVE_CRITICALITY.CRITICAL,
      );

      // Transition n1 only
      states.n1 = PRESSURE_STATE.HARD;
      await behavior.shouldAllowMove(
        'n1', MOVE_CRITICALITY.CRITICAL,
      );
      await behavior.shouldAllowMove(
        'n2', MOVE_CRITICALITY.CRITICAL,
      );

      const events = behavior.getMetricEvents();
      t.equal(events.length, 1,
        'only n1 transition emitted');
      t.equal(events[0].nodeId, 'n1');
    });
});
