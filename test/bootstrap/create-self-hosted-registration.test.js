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
  'NodeJoiningService - CREATE_SELF_HOSTED metadata registration upserts group and services',
  async (t) => {
    initializeTestEnvironment();

    const service = createSelfHostedService();
    const upsertCalls = [];
    const registerCalls = [];

    service.upsertSystemTableRow = async (tableName, rowData) => {
      upsertCalls.push({tableName, rowData});
      return {success: true};
    };

    service.registerMessageGroupService = async (groupId, replicaId, _svc) => {
      registerCalls.push({groupId, replicaId});
    };

    await service.registerCreateSelfHostedMetadata();

    t.equal(upsertCalls.length, 1, 'should upsert one message_groups row');
    t.equal(upsertCalls[0].tableName, TABLES.MESSAGE_GROUPS);
    t.equal(upsertCalls[0].rowData.group_id, 'mg-self-hosted-1');
    t.equal(upsertCalls[0].rowData.replica_count, 3);
    t.same(
      JSON.parse(upsertCalls[0].rowData.policy),
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
  },
);

test(
  'NodeJoiningService - phaseQuerySystemState fails when CREATE_SELF_HOSTED metadata upsert fails',
  async (t) => {
    initializeTestEnvironment();

    const service = createSelfHostedService('join-node-2');

    service.messageRouter = {};
    service.hydrateSystemCacheFromBootstrap = async () => {};
    service.waitForSystemServiceLeaders = async () => {};
    service.registerNodeInCluster = async () => {};
    service.subscribeToCDCEvents = async () => {};
    service.cdcIntegrationService = {
      sqlQueryEngine: {
        setSystemCache: () => {},
        setMessageRouter: () => {},
        executeQuery: async () => ({success: true, rows: []}),
      },
      on: () => {},
      listenerCount: () => 1,
    };
    service.upsertSystemTableRow = async () => {
      throw new Error('forced metadata upsert failure');
    };
    service.registerMessageGroupService = async () => {};

    await t.rejects(
      service.phaseQuerySystemState(),
      /forced metadata upsert failure/,
      'phaseQuerySystemState should fail when required metadata upsert fails',
    );
  },
);
