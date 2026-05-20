import {test} from '../../../../src/test-helpers/tap.js';
import {
  OPERATION_WORKFLOW_COMMAND_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_PROGRESS_STATE_VALUES,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_WAKE_STATE,
} from '../../../../src/rebalancer/operation-workflow-owner-constants.js';
import {
  decideOperationLifecycle,
} from '../../../../src/rebalancer/operation-lifecycle.js';
import {
  DETERMINISTIC_SIMULATOR_COMMAND,
  DETERMINISTIC_SIMULATOR_DROP_REASON,
  DETERMINISTIC_SIMULATOR_EVENT,
  createDeterministicSimulator,
  minimizeDeterministicTrace,
  replayDeterministicSimulation,
} from '../deterministic-simulator.js';

const NODE_A = 'node-a';
const NODE_B = 'node-b';
const MSG_DISPATCH = 'dispatch';
const MSG_ACK = 'ack';
const MSG_SLOW = 'slow-message';
const MSG_FAST = 'fast-message';
const OBS_ACK = 'ack-observed';
const OBS_LIFECYCLE = 'lifecycle-observed';
const TEST_OPERATION_KEY = 'operation-sim-1';

function buildOperationEvidence(overrides = {}) {
  return {
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    operationKey: TEST_OPERATION_KEY,
    correlationKey: 'correlation-sim-1',
    sourceRevision: 'source-sim-1',
    durableOperation: {
      recordState: OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.AVAILABLE,
      operationKey: TEST_OPERATION_KEY,
      terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
      dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
      sourceRevision: 'source-sim-1',
    },
    workflowHistory: {
      freshnessState: OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.CURRENT,
      terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
      transitionState: OPERATION_WORKFLOW_TRANSITION_STATE.BLOCKED,
      commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
      sourceRevision: 'source-sim-1',
    },
    ownerLease: {
      authorityState:
        OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.LOCAL_AUTHORITATIVE,
      freshnessState: OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.CURRENT,
      ownerNodeKey: NODE_A,
      leaseTerm: 1,
    },
    serialDependency: {
      dependencyState: OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.CLEAR,
      sourceRevision: 'source-sim-1',
    },
    timeoutBudget: {
      timeoutState: OPERATION_WORKFLOW_TIMEOUT_STATE.ACTIVE,
      staleProgressState:
        OPERATION_WORKFLOW_STALE_PROGRESS_STATE.NOT_OBSERVED,
      sourceRevision: 'source-sim-1',
    },
    publicationFence: {
      fenceState: OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT,
      requiredRevision: 1,
      observedRevision: 1,
      sourceRevision: 'source-sim-1',
    },
    dispatchObservation: {
      dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
      wakeState: OPERATION_WORKFLOW_WAKE_STATE.OBSERVED,
      commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
      sourceRevision: 'source-sim-1',
    },
    ...overrides,
  };
}

function createAckHandlers() {
  return {
    [NODE_A]: (event, simulator) => {
      if (event.type === MSG_ACK) {
        simulator.observe({
          nodeId: NODE_A,
          type: OBS_ACK,
          payload: {from: event.from},
        });
      }
    },
    [NODE_B]: (event, simulator) => {
      if (event.type === MSG_DISPATCH) {
        simulator.send({
          from: NODE_B,
          to: NODE_A,
          type: MSG_ACK,
          payload: {operationId: event.payload.operationId},
        });
      }
    },
  };
}

function runAckScript() {
  const simulator = createDeterministicSimulator({
    handlers: createAckHandlers(),
  });
  simulator.registerNode(NODE_A);
  simulator.registerNode(NODE_B);
  simulator.send({
    from: NODE_A,
    to: NODE_B,
    type: MSG_DISPATCH,
    payload: {operationId: TEST_OPERATION_KEY},
  });
  simulator.runUntilIdle();
  return simulator;
}

test('deterministic simulator replays command logs exactly', (t) => {
  const firstRun = runAckScript();
  const replay = replayDeterministicSimulation(firstRun.getEventLog(), {
    handlers: createAckHandlers(),
  });

  t.same(replay.getEventLog(), firstRun.getEventLog());
  t.end();
});

test('deterministic simulator drops partitioned links then delivers after heal',
  (t) => {
    const simulator = createDeterministicSimulator({
      handlers: createAckHandlers(),
    });
    simulator.registerNode(NODE_A);
    simulator.registerNode(NODE_B);
    simulator.partition(NODE_A, NODE_B);
    simulator.send({
      from: NODE_A,
      to: NODE_B,
      type: MSG_DISPATCH,
      payload: {operationId: TEST_OPERATION_KEY},
    });
    simulator.runUntilIdle();
    simulator.heal(NODE_A, NODE_B);
    simulator.send({
      from: NODE_A,
      to: NODE_B,
      type: MSG_DISPATCH,
      payload: {operationId: TEST_OPERATION_KEY},
    });
    simulator.runUntilIdle();

    const log = simulator.getEventLog();
    t.ok(log.some((event) =>
      event.kind === DETERMINISTIC_SIMULATOR_EVENT.DROPPED &&
      event.reason === DETERMINISTIC_SIMULATOR_DROP_REASON.LINK_PARTITIONED,
    ));
    t.ok(log.some((event) =>
      event.kind === DETERMINISTIC_SIMULATOR_EVENT.OBSERVED &&
      event.type === OBS_ACK,
    ));
    t.end();
  });

test('deterministic simulator delivers slow-network events by controlled time',
  (t) => {
    const simulator = createDeterministicSimulator({
      handlers: {
        [NODE_B]: (event, sim) => sim.observe({
          nodeId: NODE_B,
          type: event.type,
          payload: {timeMs: sim.nowMs},
        }),
      },
    });
    simulator.registerNode(NODE_A);
    simulator.registerNode(NODE_B);
    simulator.send({
      from: NODE_A,
      to: NODE_B,
      type: MSG_SLOW,
      delayMs: 20,
    });
    simulator.send({
      from: NODE_A,
      to: NODE_B,
      type: MSG_FAST,
      delayMs: 5,
    });
    simulator.runUntilIdle();

    const observed = simulator.getEventLog().filter((event) =>
      event.kind === DETERMINISTIC_SIMULATOR_EVENT.OBSERVED,
    );
    t.equal(observed[0].type, MSG_FAST);
    t.equal(observed[0].payload.timeMs, 5);
    t.equal(observed[1].type, MSG_SLOW);
    t.equal(observed[1].payload.timeMs, 20);
    t.end();
  });

test('deterministic simulator replays leader kill during dispatch with ' +
  'operation lifecycle proof', (t) => {
  const simulator = createDeterministicSimulator({
    handlers: {
      [NODE_B]: (event, sim) => {
        if (event.type === MSG_DISPATCH) {
          const outcome = decideOperationLifecycle(buildOperationEvidence());
          sim.observe({
            nodeId: NODE_B,
            type: OBS_LIFECYCLE,
            payload: {
              state: outcome.state,
              sideEffects: outcome.sideEffects,
            },
          });
        }
      },
    },
  });
  simulator.registerNode(NODE_A);
  simulator.registerNode(NODE_B);
  simulator.killNode(NODE_B);
  simulator.send({
    from: NODE_A,
    to: NODE_B,
    type: MSG_DISPATCH,
    payload: {operationId: TEST_OPERATION_KEY},
  });
  simulator.runUntilIdle();
  simulator.startNode(NODE_B);
  simulator.send({
    from: NODE_A,
    to: NODE_B,
    type: MSG_DISPATCH,
    payload: {operationId: TEST_OPERATION_KEY},
  });
  simulator.runUntilIdle();

  const log = simulator.getEventLog();
  t.ok(log.some((event) =>
    event.kind === DETERMINISTIC_SIMULATOR_EVENT.DROPPED &&
    event.reason === DETERMINISTIC_SIMULATOR_DROP_REASON.NODE_STOPPED,
  ));
  const lifecycleEvent = log.find((event) =>
    event.kind === DETERMINISTIC_SIMULATOR_EVENT.OBSERVED &&
    event.type === OBS_LIFECYCLE,
  );
  t.equal(
    lifecycleEvent.payload.state,
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.LOCAL_OWNER_DISPATCH_READY,
  );
  t.same(lifecycleEvent.payload.sideEffects, [
    'dispatch_local_owner_command',
  ]);
  t.end();
});

test('deterministic simulator exposes controlled scheduler and storage',
  (t) => {
    const simulator = createDeterministicSimulator({
      handlers: {
        [NODE_A]: (event, sim) => sim.storage.append('scheduled-events', {
          type: event.type,
          timeMs: sim.nowMs,
        }),
      },
    });
    simulator.registerNode(NODE_A);
    simulator.storage.write(TEST_OPERATION_KEY, {version: 0});
    const cas = simulator.storage.compareAndSwap(
      TEST_OPERATION_KEY,
      0,
      {version: 1},
    );
    simulator.schedule({
      to: NODE_A,
      type: MSG_SLOW,
      delayMs: 10,
    });
    simulator.runUntilIdle();

    t.equal(cas.applied, true);
    t.equal(simulator.storage.read(TEST_OPERATION_KEY).version, 1);
    t.same(simulator.storage.readLog('scheduled-events'), [{
      type: MSG_SLOW,
      timeMs: 10,
    }]);
    t.ok(simulator.getEventLog().some((event) =>
      event.kind === DETERMINISTIC_SIMULATOR_EVENT.SCHEDULED));
    t.end();
  });

test('deterministic simulator minimizes replayable failing traces', (t) => {
  const simulator = runAckScript();
  const minimized = minimizeDeterministicTrace(
    simulator.getEventLog(),
    (commands) => commands.some((entry) =>
      entry.command === DETERMINISTIC_SIMULATOR_COMMAND.SEND),
  );

  t.equal(minimized.length, 1);
  t.equal(minimized[0].command, DETERMINISTIC_SIMULATOR_COMMAND.SEND);
  t.end();
});
