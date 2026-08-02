import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {wirePartitionRaftLifecycleEvents} from
  '../../src/partition/partition-service-raft-lifecycle-wiring.js';

const TRANSITION_MESSAGE = 'Raft leadership transition evidence';

function buildService() {
  const records = [];
  const raft = new EventEmitter();
  let term = 7;
  const service = {
    raft,
    role: 'follower',
    isLeader: false,
    leaderId: null,
    nodeId: 'node-b',
    partitionId: 'orders-p1',
    replicaId: 'orders-p1-r2',
    replicaIds: ['orders-p1-r3', 'orders-p1-r1', 'orders-p1-r2'],
    storage: {currentTerm: 0},
    logger: {
      info(message, fields) {
        records.push({message, ...fields});
      },
      debug() {},
    },
    raftProvider: {
      getCurrentTerm() {
        return term;
      },
    },
    normalizeLeaderReplicaId(value) {
      return value;
    },
    clearPendingCommittedWrites() {},
    cancelLeaderOwnedActivation() {},
    updateRebalancerLeadership() {},
    scheduleLeaderOwnedActivation() {},
  };
  return {
    raft,
    records,
    service,
    setTerm(value) {
      term = value;
    },
  };
}

test('partition raft lifecycle records campaign, election, and leader change',
  () => {
    const fixture = buildService();
    wirePartitionRaftLifecycleEvents(fixture.service, () => false);

    fixture.raft.emit('candidate');
    fixture.setTerm(8);
    fixture.raft.emit('leader');
    fixture.setTerm(9);
    fixture.raft.emit('leader change', 'orders-p1-r1');

    const evidence = fixture.records.filter(
      (record) => record.message === TRANSITION_MESSAGE,
    );
    assert.deepEqual(
      evidence.map(({eventType, role, trigger, term}) => ({
        eventType,
        role,
        trigger,
        term,
      })),
      [
        {
          eventType: 'role_transition',
          role: 'candidate',
          trigger: 'campaign_started',
          term: 7,
        },
        {
          eventType: 'role_transition',
          role: 'leader',
          trigger: 'quorum_elected',
          term: 8,
        },
        {
          eventType: 'role_transition',
          role: 'follower',
          trigger: 'leader_change',
          term: 9,
        },
        {
          eventType: 'leader_observation',
          role: 'follower',
          trigger: 'leader_change',
          term: 9,
        },
      ],
    );
    assert.deepEqual(evidence[0].peerCohort, [
      'orders-p1-r1',
      'orders-p1-r2',
      'orders-p1-r3',
    ]);
    assert.equal(evidence[3].previousLeader, 'orders-p1-r2');
    assert.equal(evidence[3].newLeader, 'orders-p1-r1');
    assert.equal(evidence[3].partitionId, 'orders-p1');
    assert.equal(evidence[3].nodeId, 'node-b');
  });
