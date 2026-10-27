import assert from 'node:assert/strict';
import test from 'node:test';
import {wirePartitionRaftLifecycleEvents} from
  '../../src/partition/partition-service-raft-lifecycle-wiring.js';
import {
  RAFT_MEMBERSHIP_TRANSITION_REASON,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {ControllableConsensusPort} from
  './partition-service-test-support.js';

const TRANSITION_MESSAGE = 'Raft leadership transition evidence';

test('controllable consensus refuses semantic membership without an owner',
  () => {
    const consensusPort = new ControllableConsensusPort();
    const raft = consensusPort.createOperationPort({peerId: 'orders-p1-r2'});
    const refused = raft.proposeMembershipTransition({operationId: 'op-1'});
    assert.equal(refused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(
      refused.reason,
      RAFT_MEMBERSHIP_TRANSITION_REASON.CONFIGURATION_GENERATION_UNAVAILABLE,
    );

    consensusPort.setMembershipTransitionHandler(() => ({
      outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
      reason: RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED,
    }));
    const proposed = raft.proposeMembershipTransition({operationId: 'op-2'});
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.deepEqual(consensusPort.membershipTransitions, [
      {operationId: 'op-1'},
      {operationId: 'op-2'},
    ]);
  });

function buildService() {
  const records = [];
  const consensusPort = new ControllableConsensusPort({term: 7});
  const raft = consensusPort.createOperationPort({peerId: 'orders-p1-r2'});
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
    normalizeLeaderReplicaId(value) {
      return value;
    },
    releasePendingCommittedWrites() {},
    cancelLeaderOwnedActivation() {},
    updateRebalancerLeadership() {},
    scheduleLeaderOwnedActivation() {},
  };
  return {consensusPort, records, service};
}

test('partition raft lifecycle records campaign, election, and leader change',
  () => {
    const fixture = buildService();
    wirePartitionRaftLifecycleEvents(fixture.service, () => false);

    fixture.consensusPort.setRole('candidate');
    fixture.consensusPort.setTerm(8);
    fixture.consensusPort.setRole('leader');
    fixture.consensusPort.setTerm(9);
    fixture.consensusPort.emitLeaderChange('orders-p1-r1');

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
