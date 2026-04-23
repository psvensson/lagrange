import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {TABLES} from '../../src/constants/index.js';

const CREATE_SELF_HOSTED_JOIN_METADATA_REGISTRATION_SHORTCUT_OPTION =
  'preferControlPlaneUpsert';

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

function createSelfHostedService(nodeId = 'join-node-1') {
  const service = new NodeJoiningService({
    nodeId,
    nodeAddress: 'ws://localhost:19090',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    messageGroupAssignment: {
      strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
      groupId: 'mg-self-hosted-1',
      replicaCount: 3,
    },
  };

  service.messageGroupServices.set('mg-self-hosted-1-r0', {
    groupId: 'mg-self-hosted-1',
    role: 'follower',
  });
  service.messageGroupServices.set('mg-self-hosted-1-r1', {
    groupId: 'mg-self-hosted-1',
    role: 'leader',
  });
  service.messageGroupServices.set('mg-self-hosted-1-r2', {
    groupId: 'mg-self-hosted-1',
    role: 'follower',
  });

  return service;
}

test(
  'NodeJoiningService - CREATE_SELF_HOSTED metadata registration stages ' +
    'group state locally and registers services',
  async (t) => {
    initializeTestEnvironment();

    const service = createSelfHostedService();
    const seededRows = [];
    const registerCalls = [];

    service.seedJoinTimeCacheRow = (tableName, rowData) => {
      seededRows.push({tableName, rowData});
    };

    service.registerMessageGroupService = async (groupId, replicaId, _svc, options) => {
      registerCalls.push({groupId, replicaId, options});
    };

    await service.registerCreateSelfHostedMetadata();

    t.equal(seededRows.length, 1, 'should stage one message_groups row locally');
    t.equal(seededRows[0].tableName, TABLES.MESSAGE_GROUPS);
    t.equal(seededRows[0].rowData.group_id, 'mg-self-hosted-1');
    t.equal(seededRows[0].rowData.replica_count, 3);
    t.same(
      JSON.parse(seededRows[0].rowData.policy),
      {
        ensureLocalAccess: false,
        placementConstraints: {
          spreadAcrossNodes: false,
        },
      },
      'should persist self-hosted policy that disables cluster-wide local access',
    );
    t.equal(registerCalls.length, 3, 'should register all local replica services');
    t.same(
      registerCalls.map((call) => call.replicaId).sort(),
      ['mg-self-hosted-1-r0', 'mg-self-hosted-1-r1', 'mg-self-hosted-1-r2'],
    );
    t.same(
      registerCalls.map((call) => call.options?.status),
      ['stopped', 'stopped', 'stopped'],
      'initial self-hosted replica rows should register as stopped until activation',
    );
    t.same(
      registerCalls.map(
        (call) =>
          call.options?.[
            CREATE_SELF_HOSTED_JOIN_METADATA_REGISTRATION_SHORTCUT_OPTION
          ],
      ),
      [true, true, true],
      'query-state self-hosted service registration should prefer the join-time control-plane upsert path',
    );
  },
);

test(
  'NodeJoiningService - phaseQuerySystemState stages CREATE_SELF_HOSTED ' +
    'metadata without blocking on authoritative message_groups upsert',
  async (t) => {
    initializeTestEnvironment();

    const service = createSelfHostedService('join-node-2');
    const seededRows = [];

    service.messageRouter = {};
    service.hydrateSystemCacheFromBootstrap = async () => {};
    service.waitForSystemServiceLeaders = async () => {};
    service.registerNodeInCluster = async () => {};
    service.subscribeToCDCEvents = async () => {};
    service.createCdcPipelineReadinessGate = () => ({
      waitForReady: async () => {},
    });
    service.backfillPropagatedCacheTablesFromAuthoritativeState =
      async () => {};
    service.triggerJoinReconciler = async () => {};
    service.stopJoiningLifecycleOwners = () => {};
    service.seedJoinTimeCacheRow = (tableName, rowData) => {
      seededRows.push({tableName, rowData});
    };
    service.cdcIntegrationService = {
      sqlQueryEngine: {
        setSystemCache: () => {},
        setMessageRouter: () => {},
        executeQuery: async () => ({success: true, rows: []}),
      },
      on: () => {},
      listenerCount: () => 1,
    };
    service.registerMessageGroupService = async () => {};

    await t.resolves(
      service.phaseQuerySystemState(),
      'phaseQuerySystemState should keep going when self-hosted group rows are only staged locally',
    );

    t.equal(
      seededRows.length,
      1,
      'query-state hydration should stage the message_groups row locally',
    );
    t.equal(
      seededRows[0].tableName,
      TABLES.MESSAGE_GROUPS,
      'staged row should target the message_groups table',
    );
  },
);

test(
  'NodeJoiningService - deferred CREATE_SELF_HOSTED metadata flush uses the ' +
    'retryable join-time publication path',
  async (t) => {
    initializeTestEnvironment();

    const service = createSelfHostedService('join-node-3');
    const upsertCalls = [];

    service.seedJoinTimeCacheRow = () => {};
    service.registerMessageGroupService = async () => {};
    service.upsertSystemTableRowWithRetry = async (tableName, rowData, options) => {
      upsertCalls.push({tableName, rowData, options});
      return {success: true};
    };

    await service.registerCreateSelfHostedMetadata();
    await service.createMessageGroupPhase.flushDeferredCreateSelfHostedMetadata();

    t.equal(
      upsertCalls.length,
      1,
      'deferred flush should publish one authoritative message_groups row',
    );
    t.equal(upsertCalls[0].tableName, TABLES.MESSAGE_GROUPS);
    t.equal(upsertCalls[0].rowData.group_id, 'mg-self-hosted-1');
    t.equal(
      upsertCalls[0].options?.admissionTarget,
      'create-self-hosted message-group metadata publication',
      'deferred flush should use the shared retryable admission-write owner path',
    );
  },
);
