import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ConnectionState,
  MessageRouter,
} from '../../src/transport/message-router.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {
  ControllableConsensusPort,
  createControllablePartitionService,
} from './partition-service-test-support.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'node-rs-transport'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('PartitionService routes semantic raft-rs transport envelopes to the operation port',
  async (t) => {
    const consensusPort = new ControllableConsensusPort();
    const handlers = new Map();
    const transport = {
      register(address, handler) {
        handlers.set(address, handler);
      },
      getRegisteredHandler(address) {
        return handlers.get(address) ?? null;
      },
      unregisterExact(address, handler) {
        if (handlers.get(address) !== handler) return false;
        handlers.delete(address);
        return true;
      },
      async deliver() {
        return buildDeliveryEnvelope({acknowledged: true});
      },
    };
    const partition = createControllablePartitionService({
      partitionId: 'raft-rs-transport-p1',
      tableId: 'raft_rs_transport',
      tableName: 'raft_rs_transport',
      replicaId: 'raft-rs-transport-p1-r2',
      replicaIds: ['raft-rs-transport-p1-r1', 'raft-rs-transport-p1-r2'],
      peerAddresses: ['node-r1/partition/raft-rs-transport-p1-r1'],
      nodeId: 'node-r2',
      transport,
      dbPath: ':memory:',
      deferElection: true,
    }, consensusPort);

    await partition.initialize();
    try {
      const semanticEnvelope = {
        protocol: 'raft-rs',
        groupId: 'raft-rs-transport-p1',
        from: '101',
        to: '202',
        message: {
          msgType: 3,
          from: '101',
          to: '202',
          term: '1',
          logTerm: '0',
          index: '0',
          commit: '0',
          entries: [],
        },
      };

      const result = await partition.handleTransportMessage({
        payload: semanticEnvelope,
      });

      t.equal(result, null,
        'consensus traffic has no application answer');
      t.equal(consensusPort.steps.length, 1,
        'exactly one semantic step crosses the existing operation port');
      t.same(consensusPort.steps[0], semanticEnvelope,
        'the semantic envelope crosses unchanged; no native packet is fabricated');
    } finally {
      await partition.shutdown();
    }
  });


test('raft-rs runtime emits a semantic envelope instead of a native packet',
  async (t) => {
    const sent = [];
    const replicaIds = ['transport-a', 'transport-b', 'transport-c'];
    const cluster = new PartitionNodeCluster({
      partitionId: 'runtime-semantic-transport-envelope',
      replicaIds,
      sendFor: (fromReplicaId, peerAddress, packet) => {
        sent.push({fromReplicaId, peerAddress, packet});
        return buildDeliveryEnvelope({acknowledged: true});
      },
    });
    try {
      for (let turn = 0; turn < 40 && sent.length === 0; turn += 1) {
        await Promise.resolve(turnChainValue(cluster.tick(replicaIds[0])));
      }
      t.ok(sent.length > 0, 'a real raft-rs participant emits traffic');
      const first = sent[0];
      t.equal(first.packet.protocol, 'raft-rs',
        'runtime output carries the semantic protocol discriminator');
      t.equal(first.packet.groupId, 'runtime-semantic-transport-envelope',
        'runtime output carries the owning group id');
      t.equal(first.packet.from, first.packet.message?.from,
        'sender identity is the core message sender');
      t.equal(first.packet.to, first.packet.message?.to,
        'recipient identity is the core message recipient');
      t.equal(first.packet.type, undefined,
        'the runtime never fabricates a native packet type');
    } finally {
      cluster.dispose();
    }
  });

test('MessageRouter direct Raft delivery accepts the semantic raft-rs envelope',
  async (t) => {
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-r1', inProcess: true});
    let transmitted = null;
    const ws = {
      readyState: 1,
      send(value) {
        transmitted = JSON.parse(value);
      },
    };
    router.nodeConnections.set('node-r2', {
      nodeId: 'node-r2',
      state: ConnectionState.CONNECTED,
      ws,
    });
    const payload = {
      protocol: 'raft-rs',
      groupId: 'transport-p1',
      from: '101',
      to: '202',
      message: {
        msgType: 3,
        from: '101',
        to: '202',
        term: '1',
        logTerm: '0',
        index: '0',
        commit: '0',
        entries: [],
      },
    };

    const result = router.tryDeliverRaftDirect(
      'node-r2/partition/transport-p1-r2',
      'raft-rs-message-1',
      payload,
      'node-r2',
    );

    t.equal(result.acknowledged, true,
      'semantic raft-rs traffic uses the existing consensus fast path');
    t.equal(transmitted?.oneWay, true,
      'direct Raft delivery stamps oneWay: true on the wire frame');
    t.same(transmitted?.payload, payload,
      'MessageRouter preserves the semantic envelope unchanged');
    t.equal(transmitted?.payload?.type, undefined,
      'MessageRouter does not fabricate a native packet type');

    const inboundFramesSent = [];
    const recipientRouter = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'node-r2',
      inProcess: true,
    });
    let handledEnvelope = null;
    recipientRouter.register('node-r2/partition/transport-p1-r2', (envelope) => {
      handledEnvelope = envelope;
      return null;
    });
    recipientRouter.handleServiceMessage(
      {
        readyState: 1,
        send(value) {
          inboundFramesSent.push(JSON.parse(value));
        },
      },
      transmitted,
    );
    await new Promise((resolve) => setImmediate(resolve));
    t.same(handledEnvelope?.payload, payload,
      'recipient dispatches the one-way Raft frame to its handler');
    t.equal(inboundFramesSent.length, 0,
      'recipient does not emit orphaned ACK or SERVICE_RESPONSE frames for oneWay Raft traffic');
  });
