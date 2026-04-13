import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {
  JOIN_PHASE_OWNER,
  createJoiningPhaseOwners,
} from '../../src/bootstrap/owners/join-phase-owners.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'join-owner-routing-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

test('NodeJoiningService initializeJoiningLifecycleOwners uses ' +
  'StartupServiceLifecycleOwner as the canonical owner path', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'join-owner-routing-node',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  let called = 0;
  service.startupServiceLifecycleOwner.ensureOwners = async () => {
    called += 1;
  };

  await service.initializeJoiningLifecycleOwners();

  t.equal(
    called,
    1,
    'join lifecycle initialization must route through StartupServiceLifecycleOwner',
  );
});

test('NodeJoiningService triggerJoinReconciler uses ' +
  'StartupServiceLifecycleOwner trigger path', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'join-owner-routing-node',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  let receivedReason = null;
  service.startupServiceLifecycleOwner.triggerReconciler = async (reason) => {
    receivedReason = reason;
  };

  await service.triggerJoinReconciler('join_owner_path_test');

  t.equal(
    receivedReason,
    'join_owner_path_test',
    'join reconciler triggers must route through StartupServiceLifecycleOwner',
  );
});

test('NodeJoiningService notifyLocalAdminRuntimeReady uses ' +
  'StartupRuntimeSurfaceOwner as the canonical owner path', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'join-owner-routing-node',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  let called = 0;
  service.runtimeSurfaceOwner.notifyLocalAdminRuntimeReady = async () => {
    called += 1;
  };

  await service.notifyLocalAdminRuntimeReady();

  t.equal(
    called,
    1,
    'local admin readiness must route through StartupRuntimeSurfaceOwner',
  );
});

test('createJoiningPhaseOwners routes directly to extracted phase owners ' +
  'instead of NodeJoiningService wrapper methods', async (t) => {
  const calls = [];
  const service = Object.create({
    async phaseContactSeed() {
      throw new Error('wrapper path must not be called');
    },
    async phaseConnectWebSocket() {
      throw new Error('wrapper path must not be called');
    },
    async phaseCreateSelfHostedMessageGroup() {
      throw new Error('wrapper path must not be called');
    },
    async phaseJoinExistingMessageGroup() {
      throw new Error('wrapper path must not be called');
    },
    async phaseWaitForLeadership() {
      throw new Error('wrapper path must not be called');
    },
    async phaseQuerySystemState() {
      throw new Error('wrapper path must not be called');
    },
  });
  Object.assign(service, {
    contactSeedPhase: {
      async phaseContactSeed() {
        calls.push(JOIN_PHASE_OWNER.CONTACT_SEED);
        return 'contact';
      },
    },
    connectWebSocketPhase: {
      async phaseConnectWebSocket() {
        calls.push(JOIN_PHASE_OWNER.CONNECT_WEBSOCKET);
        return 'websocket';
      },
    },
    createMessageGroupPhase: {
      async phaseCreateSelfHostedMessageGroup(assignment) {
        calls.push([JOIN_PHASE_OWNER.CREATE_SELF_HOSTED_MESSAGE_GROUP, assignment]);
        return assignment;
      },
    },
    joinMessageGroupRuntimeOwner: {
      async phaseJoinExistingMessageGroup(assignment) {
        calls.push([JOIN_PHASE_OWNER.JOIN_EXISTING_MESSAGE_GROUP, assignment]);
        return assignment;
      },
    },
    waitForLeadershipPhase: {
      async phaseWaitForLeadership() {
        calls.push(JOIN_PHASE_OWNER.WAIT_FOR_LEADERSHIP);
        return 'leadership';
      },
    },
    querySystemStatePhase: {
      async phaseQuerySystemState() {
        calls.push(JOIN_PHASE_OWNER.QUERY_SYSTEM_STATE);
        return 'query';
      },
    },
  });

  const owners = createJoiningPhaseOwners(service);

  t.equal(await owners[JOIN_PHASE_OWNER.CONTACT_SEED](), 'contact');
  t.equal(await owners[JOIN_PHASE_OWNER.CONNECT_WEBSOCKET](), 'websocket');
  t.same(
    await owners[JOIN_PHASE_OWNER.CREATE_SELF_HOSTED_MESSAGE_GROUP]({
      groupId: 'mg-1',
    }),
    {groupId: 'mg-1'},
  );
  t.same(
    await owners[JOIN_PHASE_OWNER.JOIN_EXISTING_MESSAGE_GROUP]({
      groupId: 'mg-2',
    }),
    {groupId: 'mg-2'},
  );
  t.equal(await owners[JOIN_PHASE_OWNER.WAIT_FOR_LEADERSHIP](), 'leadership');
  t.equal(await owners[JOIN_PHASE_OWNER.QUERY_SYSTEM_STATE](), 'query');
  t.same(
    calls,
    [
      JOIN_PHASE_OWNER.CONTACT_SEED,
      JOIN_PHASE_OWNER.CONNECT_WEBSOCKET,
      [JOIN_PHASE_OWNER.CREATE_SELF_HOSTED_MESSAGE_GROUP, {groupId: 'mg-1'}],
      [JOIN_PHASE_OWNER.JOIN_EXISTING_MESSAGE_GROUP, {groupId: 'mg-2'}],
      JOIN_PHASE_OWNER.WAIT_FOR_LEADERSHIP,
      JOIN_PHASE_OWNER.QUERY_SYSTEM_STATE,
    ],
    'join phase registry must invoke extracted phase owners directly',
  );
});
