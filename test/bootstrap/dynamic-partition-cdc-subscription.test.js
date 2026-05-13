import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReplicaHandlerSetup} from '../../src/bootstrap/shared/replica-handler-setup.js';
import {TABLES} from '../../src/constants/index.js';
import {
  BOOTSTRAP_PHASE,
  JOINING_PHASE,
} from '../../src/bootstrap/bootstrap-constants.js';

const TEST_CAPTURED_MESSAGE_GROUP_ID = 'mg-captured';
const TEST_CONTROL_PLANE_PUBLICATIONS_TABLE =
  TABLES.CONTROL_PLANE_PUBLICATIONS;
const TEST_METADATA_INGRESS_NOT_READY_REASON =
  'operational message-group ingress not ready';
const TEST_METADATA_INGRESS_RETRY_AFTER_MS = 25;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

function createCapturedIngressMessageGroupServices(subscribedTables) {
  return new Map([
    [TEST_CAPTURED_MESSAGE_GROUP_ID, {
      groupId: TEST_CAPTURED_MESSAGE_GROUP_ID,
      initialized: true,
      isLeaderReplica: () => true,
      getMetadataIngressReadiness: () => ({
        ready: false,
        reason: TEST_METADATA_INGRESS_NOT_READY_REASON,
        retryAfterMs: TEST_METADATA_INGRESS_RETRY_AFTER_MS,
      }),
      getLeaderId: () => null,
      subscribeToCDC: async (tableName) => {
        subscribedTables.push(tableName);
      },
    }],
  ]);
}

async function withCapturedReplicaFactory(
  service,
  t,
  assertFactory,
  options = {},
) {
  const cache = new SystemTableCache();
  let capturedCreatePartitionService = null;
  const subscribedTables = [];
  const handshakeSubscriberIds = [];
  const fallbackCdcIntegrationService = {
    updateSystemTableRow: async () => true,
    upsertSystemTableRow: async () => true,
  };
  const hasCustomCreateCdcIntegrationService =
    Object.prototype.hasOwnProperty.call(
      service,
      'createCdcIntegrationService',
    );
  const originalReplicaHandlerCreate = ReplicaHandlerSetup.create;
  const originalGetNodeService = NodeService.getInstance;
  const originalInitialize = PartitionService.prototype.initialize;
  const originalSubscribeToCDCWithHandshake =
    PartitionService.prototype.subscribeToCDCWithHandshake;

  try {
    service.messageRouter = {registerHandler() {}, unregisterHandler() {}};
    service.transport = {unregister() {}};
    service.systemTableCache = cache;
    service.systemCacheHydrated = true;
    service.tablePolicyService = {};
    service.rebalanceCoordinator = {};
    service.messageGroupServices =
      typeof options.createMessageGroupServices === 'function' ?
        options.createMessageGroupServices({subscribedTables}) :
        new Map([
          ['mg-1', {
            groupId: 'mg-1',
            initialized: true,
            isLeaderReplica: () => true,
            getMetadataIngressReadiness: () => ({ready: true}),
            getLeaderId: () => null,
            subscribeToCDC: async (tableName) => {
              subscribedTables.push(tableName);
            },
          }],
        ]);
    if (typeof service.createCdcIntegrationService === 'function' &&
        hasCustomCreateCdcIntegrationService) {
      const originalCreateCdcIntegrationService =
        service.createCdcIntegrationService.bind(service);
      service.createCdcIntegrationService = () => ({
        ...fallbackCdcIntegrationService,
        ...(originalCreateCdcIntegrationService() || {}),
      });
    } else if (typeof service.createCdcIntegrationService === 'function') {
      service.createCdcIntegrationService = () => ({
        ...fallbackCdcIntegrationService,
      });
    } else {
      service.cdcIntegrationService = {
        ...fallbackCdcIntegrationService,
        ...(service.cdcIntegrationService || {}),
      };
    }

    if (typeof service.getLeaderMessageGroupService === 'function') {
      service.getLeaderMessageGroupService = () => {
        for (const messageGroupService of service.messageGroupServices.values()) {
          return messageGroupService;
        }
        return null;
      };
    }

    NodeService.getInstance = () => ({
      getSystemTableCache() {
        return cache;
      },
    });

    PartitionService.prototype.initialize = async function() {};
    PartitionService.prototype.subscribeToCDCWithHandshake =
      async function(_subscriber, options = {}) {
        handshakeSubscriberIds.push(options.subscriberId);
        return {
          subscriberId: options.subscriberId || 'sub-1',
          subscriptionEpoch: 1,
          catchup: {
            mode: 'none',
            bufferedEventsReplayed: 0,
          },
        };
      };

    ReplicaHandlerSetup.create = ({createPartitionService}) => {
      capturedCreatePartitionService = createPartitionService;
      return {
        replicaHandler: {},
        replicaStateMachine: {
          registerReplicaSnapshot() {
            return true;
          },
          getStateCounts() {
            return {};
          },
        },
      };
    };

    service.initializeReplicaHandler();

    t.equal(
      typeof capturedCreatePartitionService,
      'function',
      'should capture a replica partition factory',
    );

    await assertFactory({
      cache,
      subscribedTables,
      handshakeSubscriberIds,
      createPartitionService: capturedCreatePartitionService,
    });
  } finally {
    ReplicaHandlerSetup.create = originalReplicaHandlerCreate;
    NodeService.getInstance = originalGetNodeService;
    PartitionService.prototype.initialize = originalInitialize;
    PartitionService.prototype.subscribeToCDCWithHandshake =
      originalSubscribeToCDCWithHandshake;
  }
}

async function createPartition(createPartitionService, tableName, nodeId) {
  const partition = await createPartitionService({
    partitionId: `${tableName}-p1`,
    tableId: tableName,
    tableName,
    schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
    keyRange: {start: null, end: null},
    replicaId: `${tableName}-r1`,
    replicaIds: [`${tableName}-r1`],
    peerAddresses: [],
    nodeId,
    isJoiningExistingGroup: true,
  });
  if (partition && typeof partition.shutdown === 'function') {
    await partition.shutdown();
  }
}

test('BootstrapService dynamic user partition CDC subscription', async (t) => {
  initializeTestEnvironment();

  const service = new BootstrapService({
    nodeId: 'seed-node',
    nodeAddress: 'ws://localhost:9001',
  });

  await withCapturedReplicaFactory(service, t, async ({
    subscribedTables,
    handshakeSubscriberIds,
    createPartitionService,
  }) => {
    await createPartition(createPartitionService, 'benchmark_events', 'seed-node');
    await createPartition(createPartitionService, TABLES.LOGS, 'seed-node');

    t.notOk(
      subscribedTables.includes('benchmark_events'),
      'dynamic user-table partitions should not attach system-table CDC propagation subscriptions',
    );
    t.notOk(
      handshakeSubscriberIds.some((subscriberId) =>
        String(subscriberId || '').includes('benchmark_events')),
      'dynamic user-table partitions should not register system-table CDC handshakes',
    );
    t.notOk(
      subscribedTables.includes(TABLES.LOGS),
      'non-propagated internal system tables should not join default CDC propagation',
    );
  });
});

test('NodeJoiningService dynamic user partition CDC subscription', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'join-node',
    nodeAddress: 'ws://localhost:9002',
    seedNodeAddress: 'http://localhost:8080',
  });

  await withCapturedReplicaFactory(service, t, async ({
    subscribedTables,
    handshakeSubscriberIds,
    createPartitionService,
  }) => {
    await createPartition(createPartitionService, 'benchmark_events', 'join-node');
    await createPartition(createPartitionService, TABLES.LOGS, 'join-node');

    t.notOk(
      subscribedTables.includes('benchmark_events'),
      'joining-node user partitions should not attach system-table CDC propagation subscriptions',
    );
    t.notOk(
      handshakeSubscriberIds.some((subscriberId) =>
        String(subscriberId || '').includes('benchmark_events')),
      'joining-node user partitions should not register system-table CDC handshakes',
    );
    t.notOk(
      subscribedTables.includes(TABLES.LOGS),
      'joining-node non-propagated system tables should stay out of default CDC propagation',
    );
  });
});

test('BootstrapService dynamic system partition CDC subscription reuses captured ingress during metadata readiness churn',
  async (t) => {
    initializeTestEnvironment();

    const service = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://localhost:9001',
    });

    await withCapturedReplicaFactory(service, t, async ({
      subscribedTables,
      handshakeSubscriberIds,
      createPartitionService,
    }) => {
      await createPartition(
        createPartitionService,
        TEST_CONTROL_PLANE_PUBLICATIONS_TABLE,
        'seed-node',
      );

      t.ok(
        subscribedTables.includes(TEST_CONTROL_PLANE_PUBLICATIONS_TABLE),
        'bootstrap dynamic system partition should reuse captured CDC ingress',
      );
      t.ok(
        handshakeSubscriberIds.some((subscriberId) =>
          String(subscriberId || '')
            .includes(TEST_CONTROL_PLANE_PUBLICATIONS_TABLE)),
        'bootstrap dynamic system partition should register a CDC handshake',
      );
    }, {
      createMessageGroupServices: ({subscribedTables}) =>
        createCapturedIngressMessageGroupServices(subscribedTables),
    });
  });

test('NodeJoiningService dynamic system partition CDC subscription reuses captured ingress during metadata readiness churn',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'join-node',
      nodeAddress: 'ws://localhost:9002',
      seedNodeAddress: 'http://localhost:8080',
    });

    await withCapturedReplicaFactory(service, t, async ({
      subscribedTables,
      handshakeSubscriberIds,
      createPartitionService,
    }) => {
      await createPartition(
        createPartitionService,
        TEST_CONTROL_PLANE_PUBLICATIONS_TABLE,
        'join-node',
      );

      t.ok(
        subscribedTables.includes(TEST_CONTROL_PLANE_PUBLICATIONS_TABLE),
        'joining dynamic system partition should reuse captured CDC ingress',
      );
      t.ok(
        handshakeSubscriberIds.some((subscriberId) =>
          String(subscriberId || '')
            .includes(TEST_CONTROL_PLANE_PUBLICATIONS_TABLE)),
        'joining dynamic system partition should register a CDC handshake',
      );
    }, {
      createMessageGroupServices: ({subscribedTables}) =>
        createCapturedIngressMessageGroupServices(subscribedTables),
    });
  });

test('BootstrapService keeps CDC propagation attached after bootstrap completes',
  async (t) => {
    initializeTestEnvironment();

    const service = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://localhost:9001',
    });
    service.phase = BOOTSTRAP_PHASE.COMPLETE;

    await withCapturedReplicaFactory(service, t, async ({
      subscribedTables,
      handshakeSubscriberIds,
      createPartitionService,
    }) => {
      await createPartition(createPartitionService, TABLES.SERVICES, 'seed-node');

      t.ok(
        subscribedTables.includes(TABLES.SERVICES),
        'bootstrap-complete runtime partitions should still attach CDC propagation',
      );
      t.ok(
        handshakeSubscriberIds.some((subscriberId) =>
          String(subscriberId || '').includes(TABLES.SERVICES)),
        'bootstrap-complete runtime partitions should still register CDC handshakes',
      );
    });
  });

test('NodeJoiningService keeps CDC propagation attached after join completes',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'join-node',
      nodeAddress: 'ws://localhost:9002',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.phase = JOINING_PHASE.COMPLETE;

    await withCapturedReplicaFactory(service, t, async ({
      subscribedTables,
      handshakeSubscriberIds,
      createPartitionService,
    }) => {
      await createPartition(createPartitionService, TABLES.SERVICES, 'join-node');

      t.ok(
        subscribedTables.includes(TABLES.SERVICES),
        'join-complete runtime partitions should still attach CDC propagation',
      );
      t.ok(
        handshakeSubscriberIds.some((subscriberId) =>
          String(subscriberId || '').includes(TABLES.SERVICES)),
        'join-complete runtime partitions should still register CDC handshakes',
      );
    });
  });

test('BootstrapService dynamic partition factory injects the current SQL engine',
  async (t) => {
    initializeTestEnvironment();

    const service = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://localhost:9001',
    });
    const sqlQueryEngine = {managedSplitWorkflow: {workflowId: 'wf-1'}};

    service.cdcIntegrationService = {
      sqlQueryEngine,
      updateSystemTableRow: async () => true,
      upsertSystemTableRow: async () => true,
    };

    await withCapturedReplicaFactory(service, t, async ({
      createPartitionService,
    }) => {
      const partition = await createPartitionService({
        partitionId: 'benchmark_events-p1',
        tableId: 'benchmark_events',
        tableName: 'benchmark_events',
        schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
        keyRange: {start: null, end: null},
        replicaId: 'benchmark_events-r1',
        replicaIds: ['benchmark_events-r1'],
        peerAddresses: [],
        nodeId: 'seed-node',
        isJoiningExistingGroup: true,
      });

      t.equal(
        partition.sqlQueryEngine,
        sqlQueryEngine,
        'bootstrap-created partitions should receive the current SQL engine',
      );

      await partition.shutdown();
    });
  });

test('NodeJoiningService dynamic partition factory injects the current SQL engine',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'join-node',
      nodeAddress: 'ws://localhost:9002',
      seedNodeAddress: 'http://localhost:8080',
    });
    const sqlQueryEngine = {managedSplitWorkflow: {workflowId: 'wf-join'}};

    service.createCdcIntegrationService = () => ({
      sqlQueryEngine,
      updateSystemTableRow: async () => true,
      upsertSystemTableRow: async () => true,
    });

    await withCapturedReplicaFactory(service, t, async ({
      createPartitionService,
    }) => {
      const partition = await createPartitionService({
        partitionId: 'benchmark_events-p1',
        tableId: 'benchmark_events',
        tableName: 'benchmark_events',
        schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
        keyRange: {start: null, end: null},
        replicaId: 'benchmark_events-r1',
        replicaIds: ['benchmark_events-r1'],
        peerAddresses: [],
        nodeId: 'join-node',
        isJoiningExistingGroup: true,
      });

      t.equal(
        partition.sqlQueryEngine,
        sqlQueryEngine,
        'join-created partitions should receive the current SQL engine',
      );

      await partition.shutdown();
    });
  });
