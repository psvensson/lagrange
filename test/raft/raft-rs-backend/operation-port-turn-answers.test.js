// The operation port answers every protocol operation with the runtime's
// named turn (src/raft/raft-rs-turn-answer.js), produced once where the turn
// ran: {settled: true, result} when the work completed within the call,
// {settled: false, pending} when it waits. No answer is a bare value or a
// bare promise, so no consumer inspects one for a `then`. A status read
// never waits and answers the status itself.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_OPERATION} from '../../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const REPLICA = 'turn-answer-replica';

function assertTurn(answer, label) {
  assert.equal(Object.isFrozen(answer), true, `${label}: a frozen turn`);
  if (answer.settled === true) {
    assert.deepEqual(Object.keys(answer).sort(), ['result', 'settled'],
      `${label}: a settled turn carries its result`);
    assert.equal(typeof answer.result?.outcome, 'string',
      `${label}: the settled result is the port's outcome record`);
    return;
  }
  assert.equal(answer.settled, false, `${label}: settled is named`);
  assert.deepEqual(Object.keys(answer).sort(), ['pending', 'settled'],
    `${label}: a pending turn carries its promise`);
  assert.equal(answer.pending instanceof Promise, true,
    `${label}: pending is the promise of the result`);
}

test('every protocol operation of the port answers a named turn', async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'operation-port-turn-answers',
    replicaIds: [REPLICA],
  });
  try {
    const port = cluster.node(REPLICA);
    const status = port.readStatus();
    assert.equal(typeof status.outcome, 'string',
      'a status read answers the status itself');
    assert.equal(Object.hasOwn(status, 'settled'), false,
      'a status read is never a turn: it never waits');
    const answers = {
      campaign: port.campaign(),
      tick: port.tick(),
      step: port.step({groupId: 'wrong-group', to: 'x', message: {}}),
      configureTick: port.configureTick(10),
      startScheduling: port.startScheduling(),
      probePeerProgress: port.probePeerProgress('absent-peer'),
      transferLeadership: port.transferLeadership({}),
      proposeConfChange: port.proposeConfChange({}),
      proposeMembershipTransition:
        port[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION]({}),
      propose: port.propose('turn-answer-entry'),
    };
    for (const [label, answer] of Object.entries(answers)) {
      assertTurn(answer, label);
      const result = await turnChainValue(answer);
      assert.equal(typeof result?.outcome, 'string',
        `${label}: the turn's result is the port's outcome record`);
    }
    assert.equal(answers.configureTick.settled, true,
      'reconfiguring the tick is synchronous work');
    assert.equal(answers.step.settled, true,
      'a refused envelope is refused within the call');
    port.stopScheduling();
    port.close();
    const closed = port.tick();
    assertTurn(closed, 'tick after close');
    assert.equal(closed.settled, true);
    assert.equal(closed.result.reason, 'closed');
  } finally {
    cluster.dispose();
  }
});
