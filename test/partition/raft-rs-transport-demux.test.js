import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ConnectionState,
  MessageRouter,
} from '../../src/transport/message-router.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {
  ControllablePartitionRaftProvider,
} from './partition-service-test-support.js';

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
    const raftProvider = new ControllablePartitionRaftProvider();
    const transport = {
      register() {},
      unregister() {},
      async deliver() {
        return {acknowledged: true};
      },
    };
    const partition = new PartitionService({
      partitionId: 'raft-rs-transport-p1',
      tableId: 'raft_rs_transport',
      tableName: 'raft_rs_transport',
      replicaId: 'raft-rs-transport-p1-r2',
      replicaIds: ['raft-rs-transport-p1-r1', 'raft-rs-transport-p1-r2'],
      peerAddresses: ['node-r1/partition/raft-rs-transport-p1-r1'],
      nodeId: 'node-r2',
      transport,
      dbPath: ':memory:',
      raftProvider,
      deferElection: true,
    });

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

      t.equal(result.acknowledged, true,
        'the transport envelope is consumed as consensus traffic');
      t.equal(raftProvider.steps.length, 1,
        'exactly one semantic step crosses the existing operation port');
      t.same(raftProvider.steps[0], semanticEnvelope,
        'the semantic envelope crosses unchanged; no fake Liferaft packet is built');
    } finally {
      await partition.shutdown();
    }
  });


test('raft-rs runtime emits a semantic envelope instead of a Liferaft packet',
  async (t) => {
    const sent = [];
    const replicaIds = ['transport-a', 'transport-b', 'transport-c'];
    const cluster = new PartitionNodeCluster({
      partitionId: 'runtime-semantic-transport-envelope',
      replicaIds,
      sendFor: (fromReplicaId, peerAddress, packet) => {
        sent.push({fromReplicaId, peerAddress, packet});
        return {acknowledged: true};
      },
    });
    try {
      for (let turn = 0; turn < 40 && sent.length === 0; turn += 1) {
        await Promise.resolve(cluster.tick(replicaIds[0]));
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
        'the runtime never fabricates a Liferaft packet type');
    } finally {
      cluster.dispose();
    }
  });

test('MessageRouter direct Raft delivery accepts the semantic raft-rs envelope',
  async (t) => {
    const router = new MessageRouter({nodeId: 'node-r1', inProcess: true});
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

    t.equal(result?.direct, true,
      'semantic raft-rs traffic uses the existing consensus fast path');
    t.same(transmitted?.payload, payload,
      'MessageRouter preserves the semantic envelope unchanged');
    t.equal(transmitted?.payload?.type, undefined,
      'MessageRouter does not fabricate a Liferaft packet type');
  });
