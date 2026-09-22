import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
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
