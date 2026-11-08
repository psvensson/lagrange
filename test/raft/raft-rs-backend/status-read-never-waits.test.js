// A status read never answers a promise. When the read is what drives the
// shared runtime's replacement and the replacement's resumption of the group
// waits on a peer delivery, the read answers at once, with the named hold of
// that recovery from the runtime's status vocabulary (R11: unavailability is
// explicit); the recovery runs on as its own operation, and a caller that
// needs its end takes the turn of the operation it asks for next.
//
// The group is a sole voter with a learner: the new core restores every
// group as a follower, a restored follower of a multi-voter group sends
// nothing on its resumption, and only a sole voter campaigns again at once -
// leading, it appends to its learner, so its resumption waits on that
// delivery.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {RUNTIME_REASON} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {coreTrappingAppend} from './core-trap-envelope.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const VOTER = 'wait-voter';
const LEARNER = 'wait-learner';
// raft-rs ConfChangeTransition Auto.
const CONF_CHANGE_AUTO_TRANSITION = 0;

test('a status read during a replacement waiting on delivery answers a named hold',
  async () => {
    const held = [];
    let holdDelivery = false;
    const cluster = new PartitionNodeCluster({
      partitionId: 'status-read-never-waits',
      replicaIds: [VOTER],
      sendFor: () => {
        if (!holdDelivery) {
          return undefined;
        }
        return new Promise((resolve) => held.push(resolve));
      },
    });
    try {
      assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null),
        true, 'setup: the sole voter leads');
      const victim = VOTER;
      cluster.addReplica(LEARNER, [VOTER]);
      cluster.proposeConfigurationChange([{
        changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
        nodeId: cluster.raftPeerIdOf(LEARNER),
      }], CONF_CHANGE_AUTO_TRANSITION, victim);
      assert.equal(cluster.settle(() => cluster.coreConfState(victim).learners
        .includes(cluster.raftPeerIdOf(LEARNER))), true,
      'setup: the learner is added');
      const before = cluster.node(victim).readStatus();
      const originalConsoleError = console.error;
      let fatal;
      try {
        console.error = () => undefined;
        await turnChainValue(cluster.node(victim).step(coreTrappingAppend({
          dbFile: cluster.replica(victim).dbFile,
          groupId: cluster.partitionId,
          status: before,
          from: cluster.raftPeerIdOf(LEARNER),
          term: String(before.term),
        })));
        fatal = await turnChainValue(cluster.node(victim).tick());
      } finally {
        console.error = originalConsoleError;
      }
      assert.equal(fatal.outcome, RAFT_OPERATION_OUTCOME.CORE_FATAL);
      holdDelivery = true;
      const status = cluster.node(victim).readStatus();
      assert.equal(typeof status?.outcome, 'string',
        'the read answers a status, never a promise of one');
      assert.equal(held.length > 0, true,
        'setup: the replacement\'s resumption waits on a held delivery');
      assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE);
      assert.equal(status.reason, RUNTIME_REASON.RECOVERY_DEFERRED,
        'the group\'s own resumption is the named hold');
      assert.equal(status.retryable, true);
      assert.equal(status.recoveryRequired, true);
      holdDelivery = false;
      for (const release of held.splice(0)) release(undefined);
      const resumed = await turnChainValue(cluster.node(victim).tick());
      assert.equal(typeof resumed.outcome, 'string');
      assert.equal(cluster.node(victim).readStatus().runtimeHealth, 'healthy');
    } finally {
      cluster.dispose();
    }
  });
