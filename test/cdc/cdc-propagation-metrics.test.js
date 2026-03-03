/**
 * CDC Propagation Metrics Tests
 * Verifies metrics.cdc.propagation log emission for CDC event handlers.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCEventHandler} from '../../src/cdc/cdc-event-handler.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CDC_OPERATION, METRICS_LOG_TAG,
} from '../../src/constants/index.js';
import {CDC_EPOCH_CONFIG_KEY} from '../../src/cdc/cdc-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  AssignmentEpochManager,
} from '../../src/rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';
import {NodeState} from
  '../../src/node/node-lifecycle-state-machine.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createMockEventContext(overrides = {}) {
  const events = [];
  return {
    epochManager: overrides.epochManager || null,
    rebalancer: overrides.rebalancer || null,
    messageRouter: overrides.messageRouter || null,
    events,
    emit(eventName, data) {
      events.push({eventName, data});
    },
    incrementEpochChanges: overrides.incrementEpochChanges ||
      (() => {}),
    incrementNodeStateChanges:
      overrides.incrementNodeStateChanges || (() => {}),
  };
}

function collectInfoCalls(handler) {
  const calls = [];
  const originalInfo = handler.logger.info.bind(handler.logger);
  handler.logger.info = function(tag, data) {
    calls.push({tag, data});
    return originalInfo(tag, data);
  };
  return calls;
}

// =============================================================
// handleEpochChangeCDC propagation metrics
// =============================================================

test('handleEpochChangeCDC emits metrics.cdc.propagation',
  async (t) => {
    const epochManager =
      new AssignmentEpochManager({nodeId: 'test-node'});
    epochManager.initialize();

    const context = createMockEventContext({epochManager});
    const handler = new CDCEventHandler({
      nodeId: 'test-node',
      eventContext: context,
    });
    const infoCalls = collectInfoCalls(handler);

    const newEpoch = new AssignmentEpoch({
      epoch: 1,
      assignments: {'p-1': ['node-1', 'node-2']},
      timestamp: Date.now().toString(),
      proposedBy: 'other-node',
    });

    handler.handleEpochChangeCDC({
      tableName: 'config',
      operation: CDC_OPERATION.UPDATE,
      data: {
        config_key: CDC_EPOCH_CONFIG_KEY,
        config_value: JSON.stringify(newEpoch.toObject()),
      },
    });

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_PROPAGATION,
    );
    t.ok(metric, 'metrics.cdc.propagation log emitted');
    t.equal(metric.data.tableName, 'config');
    t.equal(metric.data.operation, CDC_OPERATION.UPDATE);
    t.equal(typeof metric.data.handlerDurationMs, 'number');
    t.ok(
      metric.data.handlerDurationMs >= 0,
      'handlerDurationMs non-negative',
    );
    t.equal(
      metric.data.eventAgeMs, undefined,
      'eventAgeMs omitted when no timestamp',
    );
    t.end();
  });

test('handleEpochChangeCDC includes eventAgeMs when timestamp present',
  async (t) => {
    const epochManager =
      new AssignmentEpochManager({nodeId: 'test-node'});
    epochManager.initialize();

    const context = createMockEventContext({epochManager});
    const handler = new CDCEventHandler({
      nodeId: 'test-node',
      eventContext: context,
    });
    const infoCalls = collectInfoCalls(handler);

    const newEpoch = new AssignmentEpoch({
      epoch: 1,
      assignments: {'p-1': ['node-1']},
      timestamp: Date.now().toString(),
      proposedBy: 'other-node',
    });

    handler.handleEpochChangeCDC({
      tableName: 'config',
      operation: CDC_OPERATION.UPDATE,
      timestamp: Date.now() - 50,
      data: {
        config_key: CDC_EPOCH_CONFIG_KEY,
        config_value: JSON.stringify(newEpoch.toObject()),
      },
    });

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_PROPAGATION,
    );
    t.ok(metric, 'metrics.cdc.propagation log emitted');
    t.equal(typeof metric.data.eventAgeMs, 'number');
    t.ok(metric.data.eventAgeMs >= 0, 'eventAgeMs non-negative');
    t.end();
  });

// =============================================================
// handleNodeStateCDC propagation metrics
// =============================================================

test('handleNodeStateCDC emits metrics.cdc.propagation on state change',
  async (t) => {
    const context = createMockEventContext();
    const handler = new CDCEventHandler({
      nodeId: 'test-node',
      eventContext: context,
    });
    const infoCalls = collectInfoCalls(handler);

    handler.handleNodeStateCDC({
      tableName: SYSTEM_TABLE_NAME.NODES,
      operation: CDC_OPERATION.UPDATE,
      data: {
        node_id: 'node-1',
        status: NodeState.READY,
      },
    });

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_PROPAGATION,
    );
    t.ok(metric, 'metrics.cdc.propagation log emitted');
    t.equal(metric.data.tableName, SYSTEM_TABLE_NAME.NODES);
    t.equal(metric.data.operation, CDC_OPERATION.UPDATE);
    t.equal(typeof metric.data.handlerDurationMs, 'number');
    t.ok(
      metric.data.handlerDurationMs >= 0,
      'handlerDurationMs non-negative',
    );
    t.equal(
      metric.data.eventAgeMs, undefined,
      'eventAgeMs omitted when no timestamp',
    );
    t.end();
  });

test('handleNodeStateCDC includes eventAgeMs when timestamp present',
  async (t) => {
    const context = createMockEventContext();
    const handler = new CDCEventHandler({
      nodeId: 'test-node',
      eventContext: context,
    });
    const infoCalls = collectInfoCalls(handler);

    handler.handleNodeStateCDC({
      tableName: SYSTEM_TABLE_NAME.NODES,
      operation: CDC_OPERATION.UPDATE,
      timestamp: Date.now() - 30,
      data: {
        node_id: 'node-1',
        status: NodeState.READY,
      },
    });

    const metric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_PROPAGATION,
    );
    t.ok(metric, 'metrics.cdc.propagation log emitted');
    t.equal(typeof metric.data.eventAgeMs, 'number');
    t.ok(metric.data.eventAgeMs >= 0, 'eventAgeMs non-negative');
    t.end();
  });

test('handleNodeStateCDC uses info level not debug for metrics',
  async (t) => {
    const context = createMockEventContext();
    const handler = new CDCEventHandler({
      nodeId: 'test-node',
      eventContext: context,
    });

    const debugCalls = [];
    const originalDebug =
      handler.logger.debug.bind(handler.logger);
    handler.logger.debug = function(tag, data) {
      debugCalls.push({tag, data});
      return originalDebug(tag, data);
    };

    const infoCalls = collectInfoCalls(handler);

    handler.handleNodeStateCDC({
      tableName: SYSTEM_TABLE_NAME.NODES,
      operation: CDC_OPERATION.UPDATE,
      data: {
        node_id: 'node-1',
        status: NodeState.READY,
      },
    });

    const infoMetric = infoCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_PROPAGATION,
    );
    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.CDC_PROPAGATION,
    );
    t.ok(infoMetric, 'metric emitted at info level');
    t.notOk(debugMetric, 'metric not emitted at debug level');
    t.end();
  });
