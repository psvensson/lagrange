import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {STATE} from '../../src/constants/index.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';

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

function setHeartbeatNodeStateUpdateTargets(service, targetAddress) {
  const resolver = () => [targetAddress];
  service.resolveNodeStateUpdateTargetCandidates = resolver;
  service.resolveControlPlaneTargetAddressCandidates = resolver;
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
      deliver: async (targetAddress, message, options) => {
        deliveries.push({targetAddress, message, options});
        return {acknowledged: true};
      },
    };
    setHeartbeatNodeStateUpdateTargets(service, 'seed-node/message-group/mg-1-r1');

    await service.sendControlPlaneNodeStateUpdate({
      state: STATE.READY,
      capabilities: ['partition_replica'],
      heartbeatAt: 123,
      readyLeaseExpiresAt: 456,
      nodeRow: {cpu_cores: 4, memory_mb: 256},
      heartbeatOnly: true,
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
      deliveries[0].message[ControlPlaneField.HEARTBEAT_ONLY],
      true,
      'READY reporter heartbeats should be heartbeat-only control-plane updates',
    );
    t.equal(
      deliveries[0].options?.timeoutMs,
      30000,
      'should use the broader control-plane delivery timeout budget',
    );
    t.equal(
      deliveries[0].options?.deliveryPriority,
      'background',
      'heartbeat-only control-plane updates should use background delivery priority',
    );
    t.equal(
      service.controlPlaneTargetAddress,
      'seed-node/message-group/mg-1-r1',
      'should cache the resolved control-plane target',
    );
  });

test('NodeJoiningService keeps steady-state control-plane reporter enabled during durable rejoin',
  async (t) => {
    initializeTestEnvironment();

    let clearedReporter = false;
    let heartbeatStarted = false;
    const service = new NodeJoiningService({
      nodeId: 'joiner-node',
      nodeAddress: 'ddb-test-reuse-3-6:8080',
      seedNodeAddress: 'http://ddb-test-reuse-3-1:3000',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });

    service.heartbeatService = {
      state: 'stopped',
      setNodeStateReporter(reporter) {
        if (reporter === null) {
          clearedReporter = true;
        }
      },
      start() {
        heartbeatStarted = true;
      },
    };

    await service.activateControlPlaneBackgroundWriters();

    t.equal(
      clearedReporter,
      false,
      'should keep the reporter path active for durable rejoin steady-state heartbeats',
    );
    t.equal(
      heartbeatStarted,
      true,
      'should still activate steady-state heartbeat writers',
    );
  });

test('NodeJoiningService disables steady-state control-plane reporter outside durable rejoin',
  async (t) => {
    initializeTestEnvironment();

    let clearedReporter = false;
    let heartbeatStarted = false;
    const service = new NodeJoiningService({
      nodeId: 'joiner-node',
      nodeAddress: 'ddb-test-reuse-3-7:8080',
      seedNodeAddress: 'http://ddb-test-reuse-3-1:3000',
    });

    service.heartbeatService = {
      state: 'stopped',
      setNodeStateReporter(reporter) {
        if (reporter === null) {
          clearedReporter = true;
        }
      },
      start() {
        heartbeatStarted = true;
      },
    };

    await service.activateControlPlaneBackgroundWriters();

    t.equal(
      clearedReporter,
      true,
      'should cut steady-state heartbeats over to direct control-plane writes outside durable rejoin',
    );
    t.equal(
      heartbeatStarted,
      true,
      'should still activate steady-state heartbeat writers',
    );
  });

test('NodeJoiningService clears join-time reporter at READY cutover when heartbeat writers already run',
  async (t) => {
    initializeTestEnvironment();

    let clearedReporter = false;
    let heartbeatStartCount = 0;
    const service = new NodeJoiningService({
      nodeId: 'joiner-node',
      nodeAddress: 'ddb-test-reuse-3-8:8080',
      seedNodeAddress: 'http://ddb-test-reuse-3-1:3000',
    });

    service.heartbeatService = {
      state: 'running',
      setNodeStateReporter(reporter) {
        if (reporter === null) {
          clearedReporter = true;
        }
      },
      start() {
        heartbeatStartCount += 1;
      },
    };
    service.runtimeHandoffOwner.delegates.flushDeferredCreateSelfHostedMetadata =
      () => {};
    service.runtimeHandoffOwner.delegates.activateDistributedTransactionRecovery =
      () => {};
    service.runtimeHandoffOwner.delegates.startLatencyTopologyLifecycle =
      () => {};
    service.startTime = 0;
    service.now = () => 100;
    service.lifecycleStateMachine.transition('connecting');
    service.lifecycleStateMachine.transition('discovering');
    service.lifecycleStateMachine.transition('joining');

    service.completeSuccessfulJoin();

    t.equal(
      clearedReporter,
      true,
      'READY cutover should clear the join-time reporter even when heartbeat writers are already active',
    );
    t.equal(
      heartbeatStartCount,
      0,
      'READY cutover should not restart heartbeat writers that are already running',
    );
  });

test('NodeJoiningService fails closed before writers when READY transition is invalid',
  (t) => {
    initializeTestEnvironment();
    const service = new NodeJoiningService({
      nodeId: 'joiner-node',
      nodeAddress: 'ddb-test-reuse-3-8:8080',
      seedNodeAddress: 'http://ddb-test-reuse-3-1:3000',
    });
    let writerActivations = 0;
    service.activateControlPlaneBackgroundWriters = () => {
      writerActivations += 1;
    };

    t.throws(
      () => service.completeSuccessfulJoin(),
      /requires the canonical lifecycle to reach READY/,
      'finalization should reject an invalid STARTING-to-READY transition',
    );
    t.equal(writerActivations, 0, 'failed finalization must not activate writers');
    t.end();
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
    setHeartbeatNodeStateUpdateTargets(service, 'seed-node/message-group/mg-1-r1');

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
    service.joinReadinessEvaluator.shouldReconnectClusterMesh =
      () => true;
    service.connectToClusterNodes = async () => {
      connectAttempts++;
      await new Promise(() => {});
    };
    setHeartbeatNodeStateUpdateTargets(service, 'seed-node/message-group/mg-1-r1');

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

test('NodeJoiningService does not block CONNECTED publication on cluster mesh reconciliation',
  async (t) => {
    initializeTestEnvironment();

    const deliveries = [];
    let connectAttempts = 0;
    const service = new NodeJoiningService({
      nodeId: 'joiner-node',
      nodeAddress: 'ddb-test-reuse-3-5:8080',
      seedNodeAddress: 'http://ddb-test-reuse-3-1:3000',
    });

    service.messageRouter = {
      deliver: async (targetAddress, message) => {
        deliveries.push({targetAddress, message});
        return {acknowledged: true};
      },
    };
    service.joinReadinessEvaluator.shouldReconnectClusterMesh =
      () => true;
    service.connectToClusterNodes = async () => {
      connectAttempts++;
      await new Promise(() => {});
    };
    setHeartbeatNodeStateUpdateTargets(service, 'seed-node/message-group/mg-1-r1');

    const outcome = await Promise.race([
      service.sendControlPlaneNodeStateUpdate({
        state: STATE.CONNECTED,
        capabilities: ['partition_replica'],
      }).then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 50)),
    ]);

    t.equal(
      outcome,
      'completed',
      'should send CONNECTED state update without waiting for mesh reconciliation',
    );
    t.equal(
      connectAttempts,
      1,
      'should still trigger background mesh reconciliation for connected-state publication',
    );
    t.equal(deliveries.length, 1, 'should deliver the node-state update once');
  });
