import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  ControlPlaneMessageType,
  getControlPlaneMessageRequiredTables,
} from '../../src/control-plane/control-plane-constants.js';
import {
  SeedInfrastructurePhase,
} from '../../src/bootstrap/phases/seed-infrastructure-phase.js';
import {
  MessageRouterSetup,
} from '../../src/bootstrap/shared/message-router-setup.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'seed-phase-test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

test(
  'SeedInfrastructurePhase only exposes initialized local message-group transport',
  async () => {
    initializeTestEnvironment();

    const originalCreate = MessageRouterSetup.create;
    let installedResolver = null;
    let createOptions = null;
    const leaderServiceCalls = [];
    const leaderService = {
      initialized: false,
      sendMessage: async () => ({acknowledged: true}),
    };
    const requiredTables = getControlPlaneMessageRequiredTables(
      ControlPlaneMessageType.NODE_STATE_UPDATE,
    );

    MessageRouterSetup.create = async (options) => {
      createOptions = options;
      return {
      hasSelfConnection() {
        return true;
      },
      setQueryMessageGroupServiceResolver(resolver) {
        installedResolver = resolver;
      },
      };
    };

    let nodeId = 'seed-phase-test-node';
    let nodeAddress = 'ws://localhost:12020';
    let messageRouter = null;

    try {
      const phase = new SeedInfrastructurePhase({
        delegates: {
          getLogger: () => ({
            info() {},
            debug() {},
            warn() {},
            error(message) {
              throw new Error(`unexpected error log: ${message}`);
            },
          }),
          getNodeId: () => nodeId,
          setNodeId(value) {
            nodeId = value;
          },
          getNodeAddress: () => nodeAddress,
          setNodeAddress(value) {
            nodeAddress = value;
          },
          getConfig: () => ({wsPort: 12020}),
          getWsPort: () => 12020,
          getLeaderMessageGroupService: (options) => {
            leaderServiceCalls.push(options);
            return leaderService;
          },
          setMessageRouter(router) {
            messageRouter = router;
          },
          setTransport() {},
          getPhase: () => 'infrastructure',
          getServiceLifecycleManager: () => ({}),
          getServiceReconciler: () => ({}),
        },
      });

      phase.initializeUnifiedLifecycleOwners = async () => {};
      phase.triggerBootstrapReconciler = async () => {};

      await phase.phaseInfrastructure();

      assert.ok(messageRouter, 'phase should store the initialized message router');
      assert.equal(
        typeof installedResolver,
        'function',
        'phase should install a query transport resolver on the router',
      );
      assert.equal(
        installedResolver(),
        null,
        'uninitialized message-group service should not be exposed as query transport',
      );
      assert.deepEqual(
        leaderServiceCalls[0],
        {requiredTables},
        'seed query transport resolver should request control-plane required tables',
      );

      leaderService.initialized = true;
      assert.equal(
        installedResolver(),
        leaderService,
        'initialized message-group service should become the query transport',
      );
      assert.deepEqual(
        leaderServiceCalls[1],
        {requiredTables},
        'seed query transport resolver should keep required-table selection stable',
      );
      assert.strictEqual(
        createOptions?.externalAdmissionEnabled,
        false,
        'seed infrastructure should keep external transport admission closed until bootstrap completes',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
      NodeService.resetInstance();
    }
  },
);
