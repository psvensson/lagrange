import LifeRaft from '@markwylde/liferaft';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {NUM} from '../../src/constants/index.js';

function initializeIntegrationEnvironment(nodeId) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: nodeId}});

  const loggingService = LoggingService.getInstance();
  loggingService.initialize({level: 'error'});
}

function cleanupIntegrationEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createRecordingLogger() {
  const entries = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };
  return {
    entries,
    debug(message, fields) {
      entries.debug.push({message, fields});
    },
    info(message, fields) {
      entries.info.push({message, fields});
    },
    warn(message, fields) {
      entries.warn.push({message, fields});
    },
    error(message, fields) {
      entries.error.push({message, fields});
    },
  };
}

function createReplayTestPartition(nodeId) {
  return new PartitionService({
    partitionId: 'cdc-pressure-p1',
    tableId: 'cdc_pressure_nodes',
    tableName: SYSTEM_TABLE_NAME.NODES,
    replicaId: 'cdc-pressure-p1-r1',
    replicaIds: ['cdc-pressure-p1-r1'],
    nodeId,
    dbPath: ':memory:',
  });
}

function buildBufferedNodeEvent(nodeId, sequence) {
  return {
    tableName: SYSTEM_TABLE_NAME.NODES,
    operation: CDC_OPERATION.INSERT,
    data: {node_id: nodeId, status: 'active'},
    timestamp: `${2000000000000 + sequence}`,
    sourcePartition: 'cdc-pressure-p1',
    sourceReplica: 'cdc-pressure-p1-r1',
  };
}

test('CDC/bootstrap/control-plane pressure integration', async (t) => {
  t.afterEach(() => {
    cleanupIntegrationEnvironment();
  });

  await t.test(
    'cdc upsert surfaces structured write, forward, and raft-propose diagnostics',
    async (t) => {
      initializeIntegrationEnvironment('integration-seed-node');

      const messageGroupLogger = createRecordingLogger();
      const transport = {
        async deliver() {
          return {
            acknowledged: true,
            success: false,
            noHandler: true,
            error: 'No handler for address: seed-node/message-group/mg-pressure-r1',
          };
        },
        async initialize() {},
        async shutdown() {},
        setServiceNodeResolver() {},
      };

      const messageGroup = new MessageGroupService({
        groupId: 'mg-pressure',
        replicaId: 'mg-pressure-r2',
        nodeId: 'integration-seed-node',
        transport,
      });
      messageGroup.logger = messageGroupLogger;
      messageGroup.raft = {state: LifeRaft.FOLLOWER};
      messageGroup.raftProvider = {
        async proposeWithLeaderRouting(_raft, command, options) {
          await options.forwardToLeader(command);
        },
      };
      messageGroup.resolveCDCForwardSelection = () => ({
        strictForwarding: true,
        strictForwardRetryAfterMs: 250,
        targets: [{
          serviceId: 'mg-pressure-r1',
          address: 'seed-node/message-group/mg-pressure-r1',
        }],
        suppressedCount: 0,
      });
      messageGroup.maybeRepairAuthoritativeForwardTopology = async () => false;
      messageGroup.shouldRepairForwardTopology = () => false;
      messageGroup.shouldSuppressForwardTarget = () => false;

      const cdcLogger = createRecordingLogger();
      const cdc = new CDCIntegrationService({
        nodeId: 'integration-seed-node',
        sqlQueryEngine: {
          async executeQuery() {
            try {
              await messageGroup.proposeCDCCommand({
                type: 'CDC',
                tableName: SYSTEM_TABLE_NAME.SERVICES,
                operation: CDC_OPERATION.UPSERT,
                data: {service_id: 'svc-pressure-1', status: 'active'},
                timestamp: '123',
                causeId: 'integration-control-plane-pressure',
              });
              return {success: true, affectedRows: 1};
            } catch (error) {
              return {
                success: false,
                error: error?.message || 'unknown_error',
                errorCode: error?.code,
                retryAfterMs: error?.retryAfterMs,
              };
            }
          },
        },
      });
      cdc.initialize();
      cdc.logger = cdcLogger;

      const error = await t.rejects(
        cdc.upsertSystemTableRow(
          SYSTEM_TABLE_NAME.SERVICES,
          {service_id: 'svc-pressure-1', status: 'active'},
          {
            skipCacheWait: true,
            causeId: 'integration-control-plane-pressure',
          },
        ),
        /Raft CDC replication failed/i,
      );

      t.equal(error?.retryAfterMs, 250,
        'cdc write failure should preserve retry-after metadata');
      t.equal(cdcLogger.entries.warn.length, 1,
        'cdc write should emit one bounded warning');
      t.equal(
        cdcLogger.entries.warn[0]?.message,
        'Failed to upsert system table row',
      );
      t.equal(
        cdcLogger.entries.warn[0]?.fields?.causeId,
        'integration-control-plane-pressure',
      );
      t.equal(
        cdcLogger.entries.warn[0]?.fields?.operation,
        CDC_OPERATION.UPSERT,
      );
      t.equal(
        cdcLogger.entries.warn[0]?.fields?.primaryKey?.service_id,
        'svc-pressure-1',
      );
      t.equal(
        cdcLogger.entries.warn[0]?.fields?.writeMode,
        'sql-routed',
      );

      t.equal(messageGroupLogger.entries.warn.length, 1,
        'forward rejection should emit one bounded warning');
      t.equal(
        messageGroupLogger.entries.warn[0]?.message,
        'CDC forward to leader rejected',
      );
      t.equal(
        messageGroupLogger.entries.warn[0]?.fields?.leaderServiceId,
        'mg-pressure-r1',
      );
      t.equal(
        messageGroupLogger.entries.warn[0]?.fields?.deliveryRejectedByHandler,
        true,
      );
      t.equal(
        messageGroupLogger.entries.warn[0]?.fields?.strictForwardRetryAfterMs,
        250,
      );

      t.equal(messageGroupLogger.entries.error.length, 1,
        'raft propose failure should emit one bounded error');
      t.equal(
        messageGroupLogger.entries.error[0]?.message,
        'Raft CDC command failed',
      );
      t.equal(
        messageGroupLogger.entries.error[0]?.fields?.leaderTargetSource,
        'forward_to_leader',
      );
      t.equal(
        messageGroupLogger.entries.error[0]?.fields?.isCurrentRaftLeader,
        false,
      );
      t.equal(
        messageGroupLogger.entries.error[0]?.fields?.configuredRetryBudget > 0,
        true,
      );
    },
  );

  await t.test(
    'buffered replay failure exposes structured retry diagnostics',
    async (t) => {
      initializeIntegrationEnvironment('integration-replay-node');

      const partition = createReplayTestPartition('integration-replay-node');
      await partition.initialize();
      t.teardown(() => partition.shutdown());

      const logger = createRecordingLogger();
      partition.logger = logger;

      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = () => ({timer: true});
      t.teardown(() => {
        globalThis.setTimeout = originalSetTimeout;
      });

      partition.bufferCDCEventForRetry(
        buildBufferedNodeEvent('node-pressure-1', NUM.ONE),
        'integration-buffer-growth',
      );
      partition.bufferCDCEventForRetry(
        buildBufferedNodeEvent('node-pressure-2', NUM.TWO),
        'integration-buffer-growth',
      );

      const handshake = await partition.subscribeToCDCWithHandshake(
        async () => {
          throw new Error('integration replay subscriber failure');
        },
        {subscriberId: 'integration-replay-subscriber'},
      );

      t.equal(
        handshake.catchup.completed,
        false,
        'handshake should surface partial catchup failure deterministically',
      );

      const replayFailure = logger.entries.warn.find((entry) =>
        entry.message === 'Buffered CDC replay failed',
      );
      t.ok(replayFailure, 'replay failure should be logged');
      t.equal(
        replayFailure?.fields?.reason,
        'handshake_catchup_replay_failed',
      );
      t.equal(
        replayFailure?.fields?.replayRetryDepth,
        1,
      );
      t.equal(
        replayFailure?.fields?.replayBufferGrowthCount,
        2,
      );
      t.equal(
        partition.getStats().cdcReplay.replayBufferGrowthCount,
        2,
      );
      t.equal(
        partition.getStats().cdcReplay.replayRetryDepth,
        1,
      );
    },
  );
});
