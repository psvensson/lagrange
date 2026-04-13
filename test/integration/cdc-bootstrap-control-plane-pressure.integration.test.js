import LifeRaft from '@markwylde/liferaft';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {NUM, TABLES} from '../../src/constants/index.js';

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

function createEmptySystemTableCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

function createSaturatedControlPlaneRouter() {
  return {
    getStats() {
      return {
        outboundQueues: {
          'node-pressure-target': {
            pending: 44,
            pendingCritical: 16,
            pendingBackground: 28,
            criticalReserve: 16,
            backgroundPendingLimit: 48,
            maxPending: 64,
          },
        },
      };
    },
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
      const transientCdcWarnings = cdcLogger.entries.warn.filter((entry) =>
        entry.message === 'Transient CDC SQL error, retrying',
      );
      const terminalCdcWarning = cdcLogger.entries.warn.find((entry) =>
        entry.message === 'Failed to upsert system table row',
      );
      t.equal(
        transientCdcWarnings.length > 0,
        true,
        'cdc write should emit bounded transient retry diagnostics',
      );
      t.ok(
        terminalCdcWarning,
        'cdc write should emit a terminal structured warning',
      );
      t.equal(
        terminalCdcWarning?.message,
        'Failed to upsert system table row',
      );
      t.equal(
        terminalCdcWarning?.fields?.causeId,
        'integration-control-plane-pressure',
      );
      t.equal(
        terminalCdcWarning?.fields?.operation,
        CDC_OPERATION.UPSERT,
      );
      t.equal(
        terminalCdcWarning?.fields?.primaryKey?.service_id,
        'svc-pressure-1',
      );
      t.equal(
        terminalCdcWarning?.fields?.writeMode,
        'sql-routed',
      );

      const forwardRejection = messageGroupLogger.entries.warn.find((entry) =>
        entry.message === 'CDC forward to leader rejected',
      );
      t.ok(
        forwardRejection,
        'forward rejection should emit structured warning diagnostics',
      );
      t.equal(
        forwardRejection?.message,
        'CDC forward to leader rejected',
      );
      t.equal(
        forwardRejection?.fields?.leaderServiceId,
        'mg-pressure-r1',
      );
      t.equal(
        forwardRejection?.fields?.deliveryRejectedByHandler,
        true,
      );
      t.equal(
        forwardRejection?.fields?.strictForwardRetryAfterMs,
        250,
      );
      t.equal(
        forwardRejection?.fields?.deliveryPriority,
        'background',
        'noisy control-plane metadata forwards should stay off the critical lane',
      );

      const raftProposeFailure = messageGroupLogger.entries.error.find((entry) =>
        entry.message === 'Raft CDC command failed',
      );
      t.ok(
        raftProposeFailure,
        'raft propose failure should emit structured error diagnostics',
      );
      t.equal(
        raftProposeFailure?.message,
        'Raft CDC command failed',
      );
      t.equal(
        raftProposeFailure?.fields?.leaderTargetSource,
        'forward_to_leader',
      );
      t.equal(
        raftProposeFailure?.fields?.isCurrentRaftLeader,
        false,
      );
      t.equal(
        raftProposeFailure?.fields?.configuredRetryBudget > 0,
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

  await t.test(
    'join-critical bootstrap query and mutation stay available under ' +
      'saturated control-plane pressure',
    async (t) => {
      initializeIntegrationEnvironment('integration-pressure-node');

      const messageRouter = createSaturatedControlPlaneRouter();
      let readQueryCalls = NUM.ZERO;
      let mutationQueryCalls = NUM.ZERO;
      const sqlQueryEngine = {
        async executeQuery(sql) {
          if (String(sql || '').toUpperCase().startsWith('SELECT')) {
            readQueryCalls += NUM.ONE;
            return {
              success: true,
              rows: [{service_id: 'svc-pressure'}],
            };
          }
          mutationQueryCalls += NUM.ONE;
          return {
            success: true,
            affectedRows: 1,
            rows: [],
          };
        },
      };

      const cdcIntegrationService = new CDCIntegrationService({
        nodeId: 'integration-pressure-node',
        sqlQueryEngine,
        messageRouter,
      });
      cdcIntegrationService.initialize();

      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'integration-pressure-node',
        cdcIntegrationService,
        sqlQueryEngine,
        messageRouter,
      });

      const api = new BootstrapAPI({
        seedNodeId: 'integration-pressure-node',
        seedNodeAddress: 'ws://127.0.0.1:7999',
        systemTableCache: createEmptySystemTableCache(),
        sqlQueryEngine,
        cdcIntegrationService,
        controlPlaneSystemTableGateway: gateway,
        messageRouter,
      });

      const queryResult = await api.executeBootstrapControlPlaneQuery(
        'SELECT * FROM services WHERE service_id = ?',
        ['svc-pressure'],
      );
      t.equal(queryResult.success, true,
        'join-critical bootstrap query should remain available under pressure');

      const mutationResult = await api.executeBootstrapControlPlaneMutation(
        {
          operation: 'upsert',
          tableName: TABLES.SERVICES,
          row: {
            service_id: 'svc-pressure',
            service_type: 'message_group',
            node_id: 'integration-pressure-node',
          },
        },
        {
          skipCacheWait: true,
        },
      );
      t.equal(mutationResult.success, true,
        'join-critical bootstrap mutation should remain available under pressure');
      t.equal(
        readQueryCalls,
        1,
        'bootstrap query should execute through the SQL owner path',
      );
      t.equal(
        mutationQueryCalls,
        1,
        'bootstrap mutation should execute through the SQL owner path',
      );
    },
  );
});
