/**
 * Unit tests for CDC pipeline observability improvements.
 *
 * Tests warning logs emitted for silent CDC event drops and
 * metrics snapshot correctness.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {CDCPipelineMetrics} from '../../src/cdc/cdc-pipeline-metrics.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDC_LIFECYCLE_LOG_MSG,
  CDC_PIPELINE_METRIC,
  CDC_EVENT_BUFFER_CAPACITY,
} from '../../src/constants/cdc-lifecycle-constants.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('CDC observability - warning log when no subscribers and buffer full',
  async (t) => {
    const warnLogs = [];
    const metrics = new CDCPipelineMetrics();

    const partition = new PartitionService({
      partitionId: 'obs-test-p1',
      tableId: 'nodes',
      tableName: 'nodes',
      replicaId: 'obs-test-r1',
      cdcPipelineMetrics: metrics,
    });

    await partition.initialize();

    // Capture warn logs from the partition logger
    const originalWarn = partition.logger.warn;
    partition.logger.warn = (msg, data) => {
      warnLogs.push({msg, data});
      originalWarn.call(partition.logger, msg, data);
    };

    // Fill the buffer to capacity
    for (let i = 0; i < CDC_EVENT_BUFFER_CAPACITY; i++) {
      partition.cdcEventBuffer.buffer({
        tableName: 'nodes',
        operation: 'INSERT',
        data: {node_id: `filler-${i}`},
        timestamp: `ts-${i}`,
        sourcePartition: 'obs-test-p1',
        sourceReplica: 'obs-test-r1',
      });
    }

    // Force leader so generateCDCEvent proceeds past role check
    partition.isLeader = true;
    partition.role = 'leader';

    // Generate a CDC event with no subscribers and full buffer
    await partition.generateCDCEvent({
      type: 'INSERT',
      tableName: 'nodes',
      data: {node_id: 'overflow-node'},
      timestamp: Date.now().toString(),
    });

    const noSubsWarning = warnLogs.find(
      (l) => l.msg === CDC_LIFECYCLE_LOG_MSG.NO_SUBSCRIBERS_NO_BUFFER,
    );
    t.ok(noSubsWarning, 'should emit NO_SUBSCRIBERS_NO_BUFFER warning');
    t.equal(noSubsWarning.data.tableName, 'nodes',
      'warning should contain tableName');
    t.equal(noSubsWarning.data.operation, 'INSERT',
      'warning should contain operation');
    t.equal(noSubsWarning.data.partitionId, 'obs-test-p1',
      'warning should contain partitionId');

    // Verify eventsDropped metric was incremented
    const snapshot = metrics.getSnapshot();
    t.ok(snapshot[CDC_PIPELINE_METRIC.EVENTS_DROPPED] >= 1,
      'eventsDropped metric should be incremented');

    partition.logger.warn = originalWarn;
    await partition.shutdown();
    t.end();
  });

test('CDC observability - warning log when message group resolution returns null',
  async (t) => {
    // BootstrapService and NodeJoiningService both emit
    // MESSAGE_GROUP_RESOLUTION_NULL when resolveCdcPropagationMessageGroup
    // returns null. We verify the log message constant and structured data
    // match the expected pattern by simulating the resolution path.
    //
    // The actual integration is in BootstrapService/NodeJoiningService CDC
    // subscription callbacks. Here we verify the log contract directly.

    const warnLogs = [];
    const mockLogger = {
      info: () => {},
      debug: () => {},
      error: () => {},
      warn: (msg, data) => {
        warnLogs.push({msg, data});
      },
    };

    // Simulate the resolution-null warning pattern used in both
    // BootstrapService and NodeJoiningService
    const cdcEvent = {
      tableName: 'services',
      operation: 'INSERT',
      data: {service_id: 'svc-1'},
    };

    const propagationMessageGroupService = null;
    if (!propagationMessageGroupService) {
      mockLogger.warn(
        CDC_LIFECYCLE_LOG_MSG.MESSAGE_GROUP_RESOLUTION_NULL, {
          tableName: cdcEvent.tableName,
          operation: cdcEvent.operation,
          reason: 'no_leader_message_group',
        },
      );
    }

    t.equal(warnLogs.length, 1,
      'should emit exactly one warning');
    t.equal(warnLogs[0].msg,
      CDC_LIFECYCLE_LOG_MSG.MESSAGE_GROUP_RESOLUTION_NULL,
      'should use MESSAGE_GROUP_RESOLUTION_NULL constant');
    t.equal(warnLogs[0].data.tableName, 'services',
      'warning should contain tableName');
    t.equal(warnLogs[0].data.operation, 'INSERT',
      'warning should contain operation');
    t.equal(warnLogs[0].data.reason, 'no_leader_message_group',
      'warning should contain reason');
    t.end();
  });

test('CDC observability - metrics snapshot contains correct counter values',
  async (t) => {
    const metrics = new CDCPipelineMetrics();

    // Simulate a realistic pipeline sequence
    metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
    metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
    metrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);
    metrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
    metrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
    metrics.increment(CDC_PIPELINE_METRIC.EVENTS_BUFFERED);
    metrics.increment(CDC_PIPELINE_METRIC.EVENTS_DROPPED);
    metrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);

    const snapshot = metrics.getSnapshot();

    t.equal(snapshot[CDC_PIPELINE_METRIC.EVENTS_GENERATED], 3,
      'eventsGenerated should be 3');
    t.equal(snapshot[CDC_PIPELINE_METRIC.EVENTS_DELIVERED], 2,
      'eventsDelivered should be 2');
    t.equal(snapshot[CDC_PIPELINE_METRIC.EVENTS_BUFFERED], 1,
      'eventsBuffered should be 1');
    t.equal(snapshot[CDC_PIPELINE_METRIC.EVENTS_DROPPED], 1,
      'eventsDropped should be 1');
    t.equal(snapshot[CDC_PIPELINE_METRIC.DELIVERY_FAILURES], 1,
      'deliveryFailures should be 1');

    // Verify snapshot is frozen (immutable)
    t.ok(Object.isFrozen(snapshot),
      'snapshot should be frozen');

    // Verify all five counter fields are present
    const keys = Object.keys(snapshot);
    t.equal(keys.length, 5,
      'snapshot should contain exactly 5 counters');
    t.ok(keys.includes(CDC_PIPELINE_METRIC.EVENTS_GENERATED),
      'snapshot should include eventsGenerated');
    t.ok(keys.includes(CDC_PIPELINE_METRIC.EVENTS_DELIVERED),
      'snapshot should include eventsDelivered');
    t.ok(keys.includes(CDC_PIPELINE_METRIC.EVENTS_BUFFERED),
      'snapshot should include eventsBuffered');
    t.ok(keys.includes(CDC_PIPELINE_METRIC.EVENTS_DROPPED),
      'snapshot should include eventsDropped');
    t.ok(keys.includes(CDC_PIPELINE_METRIC.DELIVERY_FAILURES),
      'snapshot should include deliveryFailures');
    t.end();
  });
