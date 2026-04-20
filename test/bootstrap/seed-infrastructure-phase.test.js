import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
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
    const leaderService = {
      initialized: false,
      sendMessage: async () => ({acknowledged: true}),
    };
    let currentSelection = {
      service: leaderService,
      ready: false,
      reason: 'operational message-group ingress not ready',
      retryAfterMs: 25,
      route: 'leader',
    };

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
          getLeaderMessageGroupService: () => {
            throw new Error(
              'seed query transport should not bypass the selection owner',
            );
          },
          resolveQueryTransportMessageGroupSelection: () => currentSelection,
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
      assert.deepEqual(
        installedResolver(),
        {
          service: null,
          reason: 'operational message-group ingress not ready',
          retryAfterMs: 25,
        },
        'deferred query transport selection should stay deferred while the service is uninitialized',
      );

      leaderService.initialized = true;
      currentSelection = {
        ...currentSelection,
        ready: true,
        reason: null,
        retryAfterMs: 0,
      };

      assert.deepEqual(
        installedResolver(),
        currentSelection,
        'initialized message-group service should become the query transport selection',
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

test(
  'SeedInfrastructurePhase uses the dedicated query transport selection owner',
  async () => {
    initializeTestEnvironment();

    const originalCreate = MessageRouterSetup.create;
    let installedResolver = null;
    let currentSelection = {
      service: null,
      ready: false,
      reason: 'operational message-group ingress not ready',
      retryAfterMs: 25,
      route: null,
    };
    const relayService = {
      initialized: true,
      sendMessage: async () => ({acknowledged: true}),
    };

    MessageRouterSetup.create = async () => {
      return {
        hasSelfConnection() {
          return true;
        },
        setQueryMessageGroupServiceResolver(resolver) {
          installedResolver = resolver;
        },
      };
    };

    let nodeId = 'seed-phase-selection-node';
    let nodeAddress = 'ws://localhost:12021';

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
          getConfig: () => ({wsPort: 12021}),
          getWsPort: () => 12021,
          getLeaderMessageGroupService: () => {
            throw new Error(
              'seed query transport should use the dedicated selection owner',
            );
          },
          resolveQueryTransportMessageGroupSelection: () => currentSelection,
          setMessageRouter() {},
          setTransport() {},
          getPhase: () => 'infrastructure',
          getServiceLifecycleManager: () => ({}),
          getServiceReconciler: () => ({}),
        },
      });

      phase.initializeUnifiedLifecycleOwners = async () => {};
      phase.triggerBootstrapReconciler = async () => {};

      await phase.phaseInfrastructure();

      assert.equal(
        typeof installedResolver,
        'function',
        'phase should install a query transport resolver on the router',
      );
      assert.deepEqual(
        installedResolver(),
        {
          service: null,
          reason: 'operational message-group ingress not ready',
          retryAfterMs: 25,
        },
        'deferred query transport selection should preserve structured retry context',
      );

      currentSelection = {
        service: relayService,
        ready: true,
        reason: null,
        retryAfterMs: 0,
        route: 'relay',
      };

      const resolvedSelection = installedResolver();
      assert.equal(
        resolvedSelection.service,
        relayService,
        'initialized relay should become the bound query transport service',
      );
      assert.equal(
        resolvedSelection.route,
        'relay',
        'resolver should preserve the dedicated route classification',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
      NodeService.resetInstance();
    }
  },
);
