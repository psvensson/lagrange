// When a steady node heartbeat writes its row and when it coalesces: the
// write-coalescing decisions of heartbeat-service-write-coalescing.js.
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  createHeartbeatUpdateRow,
  createMockCache,
  createMockCdc,
  HeartbeatService,
  HEARTBEAT_RECOVERY_FAILURE_RETRY_REASON,
  initEnv,
  insertViaUpsert,
} from './heartbeat-memory-trend-test-helpers.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {cdcCommittedWriteAnswer} from '../test-helpers/committed-write-answer.js';

test('HeartbeatService coalesces unchanged node heartbeat writes within min interval',
  async (t) => {
    initEnv();

    const counters = {
      nodeUpdates: 0,
      endpointUpserts: 0,
    };
    const service = new HeartbeatService({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-e',
      nodeAddress: '10.0.0.5:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, rowData, options) => {
          counters.nodeUpdates += 1;
          return cdcCommittedWriteAnswer('updateSystemTableRow',
            [tableName, whereClause, rowData, options]);
        },
        insertSystemTableRow(...args) {
          return insertViaUpsert(this, args);
        },
        upsertSystemTableRow: async (tableName, rowData, options) => {
          counters.endpointUpserts += 1;
          return cdcCommittedWriteAnswer('upsertSystemTableRow', [tableName, rowData, options]);
        },
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 5000,
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, null);
      now += 10;
      await service.sendHeartbeat(null, null);
      now += 10;
      await service.sendHeartbeat(null, null);

      t.equal(
        counters.nodeUpdates,
        1,
        'unchanged node metadata should be coalesced within min update interval',
      );
      t.equal(
        counters.endpointUpserts,
        1,
        'endpoint upsert should still be coalesced independently',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('steady heartbeat publishes placement pressure transitions within unchanged host buckets',
  async (t) => {
    initEnv();
    try {
      const writes = [];
      const cdc = createMockCdc();
      cdc.updateSystemTableRow = async (...args) => {
        if (args[0] === 'nodes') writes.push(args[2]);
        return cdcCommittedWriteAnswer('updateSystemTableRow', args);
      };
      let at = 100;
      let latest;
      const service = new HeartbeatService({
        bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'node-pressure', nodeAddress: 'n:8080',
        cdcIntegrationService: cdc, systemTableCache: createMockCache(), now: () => at,
        nodeMetadataMinUpdateIntervalMs: 1000, nodeMetadataMaxStalenessMs: 5000,
        resourceDiagnosticsSampler: {getSharedReport: () => ({latest})},
      });
      const base = {hostCpuUtilizationPercent: 10, sampleIntervalMs: 100,
        eventLoopUtilizationPercent: 40, eventLoopDelayMs: 2, mainThreadCpuPercent: 20};
      const stats = {cpu: {count: 4}, memory: {totalBytes: 1024 ** 3, usagePercent: 20},
        diskGb: 100, diskUsagePercent: 30};
      const observe = async (fields, expected) => {
        at += 20;
        latest = {timestamp: at, sampleId: at, process: {...base, ...fields}};
        const count = writes.length;
        await service.sendHeartbeat(stats, []);
        t.equal(writes.length - count, expected ? 1 : 0);
        if (expected) t.equal(writes.at(-1)?.telemetry_sample_id, at);
      };
      await observe({}, true);
      await observe({mainThreadCpuPercent: 30}, false);
      await observe({mainThreadCpuPercent: 90, eventLoopDelayMs: 20}, true);
      await observe({mainThreadCpuPercent: 98, eventLoopDelayMs: 40}, true);
      await observe({mainThreadCpuPercent: 99, eventLoopDelayMs: 42}, false);
      await observe({eventLoopUtilizationPercent: 99, eventLoopDelayMs: 90}, true);
      await observe({sampleIntervalMs: null}, true);
      await observe({sampleIntervalMs: null}, false);
      await observe({mainThreadCpuPercent: 0, eventLoopDelayMs: 0}, true);
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService forces node heartbeat refresh once max staleness elapses',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    const service = new HeartbeatService({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-f',
      nodeAddress: '10.0.0.6:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, rowData, options) => {
          nodeUpdates += 1;
          return cdcCommittedWriteAnswer('updateSystemTableRow',
            [tableName, whereClause, rowData, options]);
        },
        insertSystemTableRow(...args) {
          return insertViaUpsert(this, args);
        },
        upsertSystemTableRow: async (...args) =>
          cdcCommittedWriteAnswer('upsertSystemTableRow', args),
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 50,
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, null);
      now += 10;
      await service.sendHeartbeat(null, null);
      now += 60;
      await service.sendHeartbeat(null, null);

      t.equal(
        nodeUpdates,
        2,
        'liveness refresh should force a write when max staleness is reached',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService routes confirmed stale refreshes through the ' +
  'heartbeat maintenance mode', async (t) => {
  initEnv();

  const service = new HeartbeatService({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-maintenance-refresh',
    nodeAddress: '10.0.0.62:8080',
    cdcIntegrationService: createMockCdc(),
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 1000,
    nodeMetadataMaxStalenessMs: 5000,
  });

  const updateRow = createHeartbeatUpdateRow(service.nodeAddress);
  service.recordConfirmedNodeHeartbeatWrite(updateRow, 0);

  const decision = service.resolveNodeHeartbeatWriteDecision(updateRow, 6000);

  t.same(
    decision,
    {
      shouldWrite: true,
      reason: 'max_staleness',
      publicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
    },
    'confirmed stale refreshes should use the maintenance owner path',
  );
  t.match(
    service.buildNodeHeartbeatWriteOptions(1000, decision.publicationMode),
    {
      deferOnPressure: false,
      deliveryPriority: 'critical',
      workloadClass: 'node_state_publication_critical',
      workClass: 'critical',
    },
    'mandatory lease maintenance should enter the critical non-deferred write lane',
  );
  t.match(
    service.buildNodeHeartbeatWriteOptions(
      1000,
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY,
    ),
    {
      deferOnPressure: true,
      deliveryPriority: 'background',
      workloadClass: 'node_state_publication_background',
      workClass: 'background',
    },
    'steady heartbeat churn should remain contained on the background lane',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService escalates stale refreshes back to recovery after ' +
  'one failed maintenance attempt', async (t) => {
  initEnv();

  const service = new HeartbeatService({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-maintenance-recovery',
    nodeAddress: '10.0.0.63:8080',
    cdcIntegrationService: createMockCdc(),
    systemTableCache: createMockCache(),
    nodeMetadataMinUpdateIntervalMs: 1000,
    nodeMetadataMaxStalenessMs: 5000,
  });

  const updateRow = createHeartbeatUpdateRow(service.nodeAddress);
  service.recordConfirmedNodeHeartbeatWrite(updateRow, 0);
  service.lastHeartbeatPublicationDecision = {
    publicationMode:
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
  };
  service.heartbeatConsecutiveFailures = 1;

  const decision = service.resolveNodeHeartbeatWriteDecision(updateRow, 6000);

  t.same(
    decision,
    {
      shouldWrite: true,
      reason: HEARTBEAT_RECOVERY_FAILURE_RETRY_REASON,
      publicationMode:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
    },
    'a failed maintenance attempt should re-enter the recovery owner path',
  );

  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('HeartbeatService suppresses bucket-equivalent utilization churn even after min interval',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    const service = new HeartbeatService({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-f1',
      nodeAddress: '10.0.0.61:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, rowData, options) => {
          nodeUpdates += 1;
          return cdcCommittedWriteAnswer('updateSystemTableRow',
            [tableName, whereClause, rowData, options]);
        },
        insertSystemTableRow(...args) {
          return insertViaUpsert(this, args);
        },
        upsertSystemTableRow: async (...args) =>
          cdcCommittedWriteAnswer('upsertSystemTableRow', args),
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 5000,
      nodeMetadataUsagePercentBucketSize: 5,
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat({
        cpu: {count: 4},
        memory: {totalBytes: 128 * 1024 * 1024, usagePercent: 21},
        diskGb: 100,
        diskUsagePercent: 31,
      }, ['partition_replica']);
      now += 1500;
      await service.sendHeartbeat({
        cpu: {count: 4},
        memory: {totalBytes: 128 * 1024 * 1024, usagePercent: 22},
        diskGb: 100,
        diskUsagePercent: 33,
      }, ['partition_replica']);

      t.equal(
        nodeUpdates,
        1,
        'usage jitter within the same bucket should not trigger another write',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('HeartbeatService writes immediately when structural metadata changes',
  async (t) => {
    initEnv();

    let nodeUpdates = 0;
    const service = new HeartbeatService({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-f2',
      nodeAddress: '10.0.0.62:8080',
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, rowData, options) => {
          nodeUpdates += 1;
          return cdcCommittedWriteAnswer('updateSystemTableRow',
            [tableName, whereClause, rowData, options]);
        },
        insertSystemTableRow(...args) {
          return insertViaUpsert(this, args);
        },
        upsertSystemTableRow: async (...args) =>
          cdcCommittedWriteAnswer('upsertSystemTableRow', args),
      },
      systemTableCache: createMockCache(),
      nodeMetadataMinUpdateIntervalMs: 1000,
      nodeMetadataMaxStalenessMs: 5000,
      nodeMetadataUsagePercentBucketSize: 5,
    });

    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;
    try {
      await service.sendHeartbeat(null, ['partition_replica']);
      now += 10;
      await service.sendHeartbeat(null, ['partition_replica', 'leader']);

      t.equal(
        nodeUpdates,
        2,
        'structural metadata changes should bypass the min-interval coalescing',
      );
    } finally {
      Date.now = originalNow;
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
