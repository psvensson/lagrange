// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import {RaftLogicSpikeAdapter} from '../../../src/raft/spike/raft-logic-spike-adapter.js';
import {RAFT_LOGIC_SPIKE_EVENT} from '../../../src/raft/spike/raft-logic-spike-constants.js';

const WAIT_TIMEOUT_MS = 5000;

/**
 * Wait for one EventEmitter event with timeout.
 * @param {import('events').EventEmitter} emitter
 * @param {string} eventName
 * @param {number} timeoutMs
 * @return {Promise<*>}
 */
function waitForEvent(emitter, eventName, timeoutMs = WAIT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event: ${eventName}`));
    }, timeoutMs);

    emitter.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

test('RaftLogicSpikeAdapter supports startup, leader tracking, propose, and commit', async (t) => {
  const commits = [];
  const adapter = new RaftLogicSpikeAdapter({
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    applyCommit: async (record) => {
      commits.push(record);
    },
  });

  try {
    await adapter.start();
    const leaderId = await adapter.waitForLeader();
    t.equal(leaderId, 'replica-1');
    t.equal(adapter.getLeaderId(), 'replica-1');

    const commitPromise = waitForEvent(
      adapter,
      RAFT_LOGIC_SPIKE_EVENT.COMMIT,
    );
    await adapter.propose({
      type: 'adapter_test',
      value: 'ok',
    });
    const commitRecord = await commitPromise;
    t.equal(commitRecord.command.type, 'adapter_test');
    t.equal(commits.length > 0, true);

    const status = await adapter.refreshStatus();
    t.equal(status.replicaId, 'replica-1');
    t.equal(typeof status.term, 'number');
    t.equal(adapter.isLeaderReplica(), true);
  } finally {
    await adapter.stop();
  }
});
