import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {STATE} from '../../src/constants/index.js';

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
}

test('NodeJoiningService sends READY heartbeats over NODE_STATE_UPDATE messages',
  async (t) => {
    initializeTestEnvironment();

    const deliveries = [];
    const service = new NodeJoiningService({
      nodeId: 'joiner-node',
      nodeAddress: 'ddb-test-reuse-3-2:8080',
      seedNodeAddress: 'http://ddb-test-reuse-3-1:3000',
    });

    service.messageRouter = {
      deliver: async (targetAddress, message) => {
        deliveries.push({targetAddress, message});
        return {acknowledged: true};
      },
    };
    service.resolveControlPlaneTargetAddress = ({allowBootstrapHints} = {}) =>
      allowBootstrapHints === false ?
        null :
        'seed-node/message-group/mg-1-r1';

    await service.sendControlPlaneNodeStateUpdate({
      state: STATE.READY,
      capabilities: ['partition_replica'],
      heartbeatAt: 123,
      readyLeaseExpiresAt: 456,
      nodeRow: {cpu_cores: 4, memory_mb: 256},
    });

    t.equal(deliveries.length, 1, 'should send exactly one node-state update');
    t.equal(
      deliveries[0].targetAddress,
      'seed-node/message-group/mg-1-r1',
      'should deliver to resolved control-plane target',
    );
    t.equal(
      deliveries[0].message[ControlPlaneField.TYPE],
      ControlPlaneMessageType.NODE_STATE_UPDATE,
      'should send NODE_STATE_UPDATE control-plane message',
    );
    t.equal(
      deliveries[0].message[ControlPlaneField.STATE],
      STATE.READY,
      'should preserve READY state',
    );
    t.same(
      deliveries[0].message[ControlPlaneField.NODE_ROW],
      {cpu_cores: 4, memory_mb: 256},
      'should attach the full node-row heartbeat payload',
    );
    t.equal(
      service.controlPlaneTargetAddress,
      'seed-node/message-group/mg-1-r1',
      'should cache the resolved control-plane target',
    );
  });

test('NodeJoiningService treats unacknowledged control-plane heartbeats as failures',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joiner-node',
      nodeAddress: 'ddb-test-reuse-3-3:8080',
      seedNodeAddress: 'http://ddb-test-reuse-3-1:3000',
    });

    service.messageRouter = {
      deliver: async () => ({
        acknowledged: false,
        error: 'Message timeout',
      }),
    };
    service.resolveControlPlaneTargetAddress = ({allowBootstrapHints} = {}) =>
      allowBootstrapHints === false ?
        null :
        'seed-node/message-group/mg-1-r1';

    await t.rejects(
      service.sendControlPlaneNodeStateUpdate({
        state: STATE.READY,
        capabilities: ['partition_replica'],
      }),
      /Message timeout/,
      'should surface unacknowledged delivery as a failure',
    );
  });

test('NodeJoiningService does not block READY heartbeats on cluster mesh reconciliation',
  async (t) => {
    initializeTestEnvironment();

    const deliveries = [];
    let connectAttempts = 0;
    const service = new NodeJoiningService({
      nodeId: 'joiner-node',
      nodeAddress: 'ddb-test-reuse-3-4:8080',
      seedNodeAddress: 'http://ddb-test-reuse-3-1:3000',
    });

    service.messageRouter = {
      deliver: async (targetAddress, message) => {
        deliveries.push({targetAddress, message});
        return {acknowledged: true};
      },
    };
    service.shouldReconnectClusterMesh = () => true;
    service.connectToClusterNodes = async () => {
      connectAttempts++;
      await new Promise(() => {});
    };
    service.resolveControlPlaneTargetAddress = ({allowBootstrapHints} = {}) =>
      allowBootstrapHints === false ?
        null :
        'seed-node/message-group/mg-1-r1';

    const outcome = await Promise.race([
      service.sendControlPlaneNodeStateUpdate({
        state: STATE.READY,
        capabilities: ['partition_replica'],
      }).then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 50)),
    ]);

    t.equal(
      outcome,
      'completed',
      'should send READY state update without waiting for mesh reconciliation',
    );
    t.equal(
      connectAttempts,
      1,
      'should still trigger background mesh reconciliation',
    );
    t.equal(deliveries.length, 1, 'should deliver the node-state update once');
  });
