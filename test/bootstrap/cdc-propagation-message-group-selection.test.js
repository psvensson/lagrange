import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {
  ControlPlaneMessageType,
  getControlPlaneMessageRequiredTables,
} from '../../src/control-plane/control-plane-constants.js';

function setupEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test(
  'BootstrapService runtime leader selection ignores bootstrap-only non-leader replicas',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({nodeId: 'node-a'});
    service.messageGroupServices = new Map([
      ['mg-1-r1', {
        initialized: true,
        isLeaderReplica: () => false,
        isMetadataIngressReady: () => false,
      }],
    ]);

    const resolved = service.getLeaderMessageGroupService();

    assert.equal(
      resolved,
      null,
      'should not reuse a bootstrap-only replica as operational runtime ingress',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'BootstrapService resolves CDC propagation service to current leader',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({nodeId: 'node-a'});
    const preferredMessageGroup = {id: 'preferred'};
    const leaderMessageGroup = {
      id: 'leader',
      initialized: true,
      isLeaderReplica: () => true,
      getMetadataIngressReadiness: () => ({ready: true}),
    };
    service.messageGroupServices = new Map([
      ['mg-1-r2', leaderMessageGroup],
    ]);

    const resolved = await service.seedCacheHydrationPhase
      .resolveCdcPropagationMessageGroup(
        preferredMessageGroup,
        {requiredTables: ['services']},
      );

    assert.equal(
      resolved,
      leaderMessageGroup,
      'should use current leader message group when available',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'BootstrapService reuses preferred CDC propagation service when ingress remains ready',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({nodeId: 'node-a'});
    const preferredMessageGroup = {
      id: 'preferred',
      initialized: true,
      isLeaderReplica: () => false,
      getMetadataIngressReadiness: () => ({
        ready: false,
        reason: 'operational message-group ingress not ready',
        retryAfterMs: 25,
      }),
      resolveMetadataIngressForwardSelection: async () => ({
        localIngress: true,
        strictForwardRetryAfterMs: 25,
        targets: [],
        suppressedCount: 0,
      }),
    };
    service.messageGroupServices = new Map([
      ['mg-1-r1', {
        initialized: true,
        isLeaderReplica: () => false,
        getMetadataIngressReadiness: () => ({ready: false}),
      }],
    ]);

    const resolved = await service.seedCacheHydrationPhase
      .resolveCdcPropagationMessageGroup(
        preferredMessageGroup,
        {requiredTables: ['services']},
      );

    assert.equal(
      resolved,
      preferredMessageGroup,
      'should reuse the captured ingress when it still satisfies metadata-ingress readiness',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'BootstrapService routes bootstrap and operational selection through the owner',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({nodeId: 'node-a'});
    const bootstrapMessageGroupService = {id: 'bootstrap'};
    const syncSelection = {service: {id: 'leader'}};
    const asyncSelection = {service: {id: 'leader-async'}};
    const ownerNotReadyError = new Error('owner not ready');

    service.messageGroupSelectionOwner.getBootstrapMessageGroupService =
      () => bootstrapMessageGroupService;
    service.messageGroupSelectionOwner
      .resolveOperationalMessageGroupSelection =
        () => syncSelection;
    service.messageGroupSelectionOwner
      .resolveOperationalMessageGroupSelectionAsync =
        async () => asyncSelection;
    service.messageGroupSelectionOwner
      .buildMessageGroupOwnerNotReadyError =
        () => ownerNotReadyError;

    assert.equal(
      service.getBootstrapMessageGroupService(),
      bootstrapMessageGroupService,
      'service bootstrap selection should route through the owner',
    );
    assert.equal(
      service.seedMessageGroupsPhase.getBootstrapMessageGroupService(),
      bootstrapMessageGroupService,
      'seed phase bootstrap selection should reuse the same owner',
    );
    assert.equal(
      service.resolveOperationalMessageGroupSelection(),
      syncSelection,
      'service operational selection should route through the owner',
    );
    assert.equal(
      await service.seedMessageGroupsPhase
        .resolveOperationalMessageGroupSelectionAsync(),
      asyncSelection,
      'seed phase async operational selection should reuse the same owner',
    );
    assert.equal(
      service.buildMessageGroupOwnerNotReadyError(),
      ownerNotReadyError,
      'service owner-not-ready error should route through the owner',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'NodeJoiningService resolves CDC propagation service to current leader',
  async (t) => {
    setupEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'node-a',
      seedNodeAddress: 'http://seed-node:8080',
    });
    const preferredMessageGroup = {id: 'preferred'};
    const leaderMessageGroup = {
      id: 'leader',
      initialized: true,
      isLeaderReplica: () => true,
      getMetadataIngressReadiness: () => ({ready: true}),
    };
    service.messageGroupServices = new Map([
      ['mg-1-r2', leaderMessageGroup],
    ]);

    const resolved = await service.resolveCdcPropagationMessageGroup(
      preferredMessageGroup,
      {requiredTables: ['services']},
    );

    assert.equal(
      resolved,
      leaderMessageGroup,
      'should use current leader message group when available',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'NodeJoiningService reuses preferred CDC propagation service when ingress remains ready',
  async (t) => {
    setupEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'node-a',
      seedNodeAddress: 'http://seed-node:8080',
    });
    const preferredMessageGroup = {
      id: 'preferred',
      initialized: true,
      isLeaderReplica: () => false,
      getMetadataIngressReadiness: () => ({
        ready: false,
        reason: 'operational message-group ingress not ready',
        retryAfterMs: 25,
      }),
      resolveMetadataIngressForwardSelection: async () => ({
        localIngress: true,
        strictForwardRetryAfterMs: 25,
        targets: [],
        suppressedCount: 0,
      }),
    };
    service.messageGroupServices = new Map([
      ['mg-1-r1', {
        initialized: true,
        isLeaderReplica: () => false,
        getMetadataIngressReadiness: () => ({ready: false}),
      }],
    ]);

    const resolved = await service.resolveCdcPropagationMessageGroup(
      preferredMessageGroup,
      {requiredTables: ['services']},
    );

    assert.equal(
      resolved,
      preferredMessageGroup,
      'should reuse the captured ingress when it still satisfies metadata-ingress readiness',
    );

    teardownEnvironment();
    t.end();
  },
);

test(
  'NodeJoiningService routes selection through the owner and preserves ' +
    'default required tables',
  async (t) => {
    setupEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'node-a',
      seedNodeAddress: 'http://seed-node:8080',
    });
    const expectedRequiredTables = getControlPlaneMessageRequiredTables(
      ControlPlaneMessageType.NODE_STATE_UPDATE,
    );
    const querySelection = {service: {id: 'relay'}};
    const syncSelection = {service: {id: 'leader'}};
    const asyncSelection = {service: {id: 'leader-async'}};
    const ownerNotReadyError = new Error('owner not ready');
    let syncOptions = null;
    let asyncOptions = null;

    service.messageGroupSelectionOwner
      .resolveOperationalMessageGroupSelection =
        (options = {}) => {
          syncOptions = options;
          return syncSelection;
        };
    service.messageGroupSelectionOwner
      .resolveOperationalMessageGroupSelectionAsync =
        async (options = {}) => {
          asyncOptions = options;
          return asyncSelection;
        };
    service.messageGroupSelectionOwner
      .resolveQueryTransportMessageGroupSelection =
        () => querySelection;
    service.messageGroupSelectionOwner
      .buildMessageGroupOwnerNotReadyError =
        () => ownerNotReadyError;

    assert.equal(
      service.resolveOperationalMessageGroupSelection(),
      syncSelection,
      'sync operational selection should route through the owner',
    );
    assert.deepEqual(
      syncOptions,
      {requiredTables: expectedRequiredTables},
      'sync operational selection should preserve default required tables',
    );
    assert.equal(
      await service.resolveOperationalMessageGroupSelectionAsync(),
      asyncSelection,
      'async operational selection should route through the owner',
    );
    assert.deepEqual(
      asyncOptions,
      {requiredTables: expectedRequiredTables},
      'async operational selection should preserve default required tables',
    );
    assert.equal(
      service.resolveQueryTransportMessageGroupSelection(),
      querySelection,
      'query transport selection should route through the owner',
    );
    assert.equal(
      service.buildMessageGroupOwnerNotReadyError(),
      ownerNotReadyError,
      'owner-not-ready error should route through the owner',
    );

    teardownEnvironment();
    t.end();
  },
);
