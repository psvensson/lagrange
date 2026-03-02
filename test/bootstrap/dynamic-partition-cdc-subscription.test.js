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

async function withCapturedReplicaFactory(service, t, assertFactory) {
  const cache = new SystemTableCache();
  let capturedCreatePartitionService = null;
  const subscribedTables = [];
  const handshakeSubscriberIds = [];
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
    service.messageGroupServices = new Map([
      ['mg-1', {
        groupId: 'mg-1',
        isLeaderReplica: () => true,
        getLeaderId: () => null,
        subscribeToCDC: async (tableName) => {
          subscribedTables.push(tableName);
        },
      }],
    ]);
    if (typeof service.createCdcIntegrationService === 'function') {
      service.createCdcIntegrationService = () => ({
        updateSystemTableRow: async () => true,
        upsertSystemTableRow: async () => true,
      });
    } else {
      service.cdcIntegrationService = {
        updateSystemTableRow: async () => true,
        upsertSystemTableRow: async () => true,
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
