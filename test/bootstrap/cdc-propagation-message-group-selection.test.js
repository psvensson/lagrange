import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';

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
    };
    service.messageGroupServices = new Map([
      ['mg-1-r2', leaderMessageGroup],
    ]);

    const resolved = service.resolveCdcPropagationMessageGroup(
      preferredMessageGroup,
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
  'BootstrapService does not reuse preferred CDC propagation service when leader is unavailable',
  async (t) => {
    setupEnvironment();

    const service = new BootstrapService({nodeId: 'node-a'});
    const preferredMessageGroup = {id: 'preferred'};
    service.messageGroupServices = new Map([
      ['mg-1-r1', {
        initialized: true,
        isLeaderReplica: () => false,
        isMetadataIngressReady: () => false,
      }],
    ]);

    const resolved = service.resolveCdcPropagationMessageGroup(
      preferredMessageGroup,
    );

    assert.equal(
      resolved,
      null,
      'should fail closed when no operational leader message group is available',
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
      isMetadataIngressReady: () => true,
    };
    service.messageGroupServices = new Map([
      ['mg-1-r2', leaderMessageGroup],
    ]);

    const resolved = service.resolveCdcPropagationMessageGroup(
      preferredMessageGroup,
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
  'NodeJoiningService does not reuse preferred CDC propagation service when leader is unavailable',
  async (t) => {
    setupEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'node-a',
      seedNodeAddress: 'http://seed-node:8080',
    });
    const preferredMessageGroup = {id: 'preferred'};
    service.messageGroupServices = new Map([
      ['mg-1-r1', {
        initialized: true,
        isLeaderReplica: () => false,
        isMetadataIngressReady: () => false,
      }],
    ]);

    const resolved = service.resolveCdcPropagationMessageGroup(
      preferredMessageGroup,
    );

    assert.equal(
      resolved,
      null,
      'should fail closed when no operational leader message group is available',
    );

    teardownEnvironment();
    t.end();
  },
);
