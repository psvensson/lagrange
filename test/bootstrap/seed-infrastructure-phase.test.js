import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  MessageRouterSetup,
} from '../../src/bootstrap/shared/message-router-setup.js';
import {
  TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE,
  TRANSPORT_SEMANTIC_OUTCOME_STATE,
} from '../../src/transport/transport-query-semantic-outcome.js';
import {ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE} from
  '../../src/transport/transport-error-codes.js';
import {createPreparedVirginSeedBootstrapService} from
  '../integration/helpers/cluster-test-helpers.js';

const QUERY_TRANSPORT_NOT_READY_REASON =
  'operational message-group ingress not ready';
const QUERY_TRANSPORT_RETRY_AFTER_MS = 25;

function buildDeferredQueryTransportSelectionExpectation() {
  return {
    state: TRANSPORT_SEMANTIC_OUTCOME_STATE.DEFERRED,
    ready: false,
    deferRetry: true,
    service: null,
    reason: QUERY_TRANSPORT_NOT_READY_REASON,
    reasonCode:
      TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE.QUERY_TRANSPORT_NOT_READY,
    errorCode: ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
    retryAfterMs: QUERY_TRANSPORT_RETRY_AFTER_MS,
  };
}

function buildReadyQueryTransportSelectionExpectation(service) {
  return {
    state: TRANSPORT_SEMANTIC_OUTCOME_STATE.READY,
    ready: true,
    deferRetry: false,
    reason: null,
    reasonCode: null,
    errorCode: null,
    retryAfterMs: null,
    service,
  };
}

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

const FAILING_ON_ERROR_LOGGER = Object.freeze({
  info() {},
  debug() {},
  warn() {},
  error(message) {
    throw new Error(`unexpected error log: ${message}`);
  },
});

// The phase is the bootstrap owner's own seed infrastructure phase, with its
// composed delegates, over a seed that entered the original attempt as
// production does. The witness's inputs are supplied at the service methods
// those delegates forward to: the query transport selection, and the leader
// shortcut armed to fail - those two are the subject.
function ownedSeedInfrastructurePhase(service,
  {selection, leaderBypassMessage}) {
  service.logger = FAILING_ON_ERROR_LOGGER;
  service.getLeaderMessageGroupService = () => {
    throw new Error(leaderBypassMessage);
  };
  service.resolveQueryTransportMessageGroupSelection = () => selection();
  return service.seedInfrastructurePhase;
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
      reason: QUERY_TRANSPORT_NOT_READY_REASON,
      retryAfterMs: QUERY_TRANSPORT_RETRY_AFTER_MS,
      route: 'leader',
    };

    MessageRouterSetup.create = async (options) => {
      createOptions = options;
      const router = {
        hasSelfConnection() {
          return true;
        },
        setQueryMessageGroupServiceResolver(resolver) {
          installedResolver = resolver;
        },
      };
      // The setup owner's custody seam: the startup host retains the router.
      options.retainRouter(router);
      return router;
    };

    const service = await createPreparedVirginSeedBootstrapService({
      nodeId: 'seed-phase-test-node', nodeAddress: 'ws://localhost:12020',
      wsPort: 12020,
    });

    try {
      const phase = ownedSeedInfrastructurePhase(service, {
        selection: () => currentSelection,
        leaderBypassMessage:
          'seed query transport should not bypass the selection owner',
      });

      phase.initializeUnifiedLifecycleOwners = async () => {};
      phase.triggerBootstrapReconciler = async () => {};

      await phase.phaseInfrastructure();

      assert.ok(service.messageRouter,
        'phase should store the initialized message router');
      assert.equal(
        typeof installedResolver,
        'function',
        'phase should install a query transport resolver on the router',
      );
      assert.deepEqual(
        installedResolver(),
        buildDeferredQueryTransportSelectionExpectation(),
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
        buildReadyQueryTransportSelectionExpectation(leaderService),
        'initialized message-group service should become the query transport selection',
      );
      assert.strictEqual(
        createOptions?.externalAdmissionEnabled,
        false,
        'seed infrastructure should keep external transport admission closed until bootstrap completes',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
      await service.shutdown();
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
      reason: QUERY_TRANSPORT_NOT_READY_REASON,
      retryAfterMs: QUERY_TRANSPORT_RETRY_AFTER_MS,
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

    const service = await createPreparedVirginSeedBootstrapService({
      nodeId: 'seed-phase-selection-node', nodeAddress: 'ws://localhost:12021',
      wsPort: 12021,
    });

    try {
      const phase = ownedSeedInfrastructurePhase(service, {
        selection: () => currentSelection,
        leaderBypassMessage:
          'seed query transport should use the dedicated selection owner',
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
        buildDeferredQueryTransportSelectionExpectation(),
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
      assert.deepEqual(
        resolvedSelection,
        buildReadyQueryTransportSelectionExpectation(relayService),
        'resolver should return the canonical ready transport outcome once the relay is initialized',
      );
    } finally {
      MessageRouterSetup.create = originalCreate;
      await service.shutdown();
      NodeService.resetInstance();
    }
  },
);
