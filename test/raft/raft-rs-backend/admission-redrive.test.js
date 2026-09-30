// T6 witness (committed-read amendment 1, section 3.5, B10): the leader's
// row-driven admission re-runs on its port's MEMBERSHIP_CHANGED, so an
// AddNode the core dropped - proposed while another configuration change was
// unapplied, which raft-rs answers Ok and replaces with an empty entry - is
// proposed again without a poll and without another row change; and a
// leader keeps at most one admission proposal per identity in flight in one
// applied configuration.
//
// Real PartitionService replicas on rs-raft (committed-membership harness):
// two joins are created from their leader's committed read and both rows
// reach the members in one turn. Oracles: the leader's durable applied
// configuration on a connection of the test's own, and the proposals the
// leader's port was actually asked for.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  buildTargetFromOperation,
  configure,
  createCommittedMembershipHarness,
  createJoinOperation,
  formGroup,
  metadataCache,
  serviceRow,
  statusOf,
  waitFor,
} from './committed-membership-harness.js';
import {durableAppliedState} from './committed-membership-oracles.js';
import {CDCOperation} from '../../../src/partition/partition-service.js';
import {TABLES} from '../../../src/constants/index.js';
import {
  RAFT_EVENT,
  RAFT_MEMBERSHIP_OPERATION,
} from '../../../src/raft/raft-operation-port-constants.js';
import {createRaftOperationPort} from '../../../src/raft/raft-operation-port.js';

const PARTITION_ID = 'o1-redrive';
const FOUNDERS = Object.freeze([
  ['rd-a', 'node-a'], ['rd-b', 'node-b'], ['rd-c', 'node-c']]);
const JOINS = Object.freeze([['rd-t1', 'node-t1'], ['rd-t2', 'node-t2']]);
const ADMISSION_BOUND_MS = 6000;

// The leader's port, observed: every membership proposal it is asked for,
// with the applied configuration epoch (count of MEMBERSHIP_CHANGED seen)
// it was asked in.
function observeProposals(leader) {
  const realPort = leader.raft;
  const proposals = [];
  let epoch = 0;
  realPort.subscribe(RAFT_EVENT.MEMBERSHIP_CHANGED, () => {
    epoch += 1;
  });
  leader.raft = createRaftOperationPort({
    ...realPort,
    proposeConfChange: (change) => {
      proposals.push({identity: change.replicaIdentity, type: change.type,
        epoch, voters: [...statusOf(leader).confState.voters].map(String)});
      return realPort.proposeConfChange(change);
    },
  });
  return proposals;
}

test('T6: an AddNode the core dropped behind an unapplied one is re-driven ' +
  'by the membership change, with at most one proposal per identity in ' +
  'flight per configuration', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    await formGroup(harness, FOUNDERS);
    const leader = harness.leader();
    const leaderMember = harness.leaderMember();
    const targets = [];
    for (const join of JOINS) {
      const created = await createJoinOperation(harness, {target: join,
        rows: FOUNDERS.map((member) => serviceRow(PARTITION_ID, member)),
        leaderHint: leaderMember[1]});
      assert.equal(created.error, undefined, created.error?.message);
      const {service} = await buildTargetFromOperation(harness, {
        target: join, operation: created.operation,
        cache: metadataCache(PARTITION_ID, [])});
      targets.push(service);
    }
    const proposals = observeProposals(leader);

    // Both rows reach every member in one turn: the leader's reconcile pass
    // proposes both AddNodes back to back.
    for (const [replicaId] of FOUNDERS) {
      for (const join of JOINS) {
        harness.caches.get(replicaId).applySystemTableChange(TABLES.SERVICES,
          CDCOperation.INSERT, serviceRow(PARTITION_ID, join));
      }
    }
    const peerIds = targets.map((service) => String(statusOf(service).peerId));
    const admitted = await waitFor(() => {
      const voters = durableAppliedState(harness.dbPathOf(leaderMember),
        PARTITION_ID).voters;
      return peerIds.every((peerId) => voters.includes(peerId));
    }, ADMISSION_BOUND_MS);

    const adds = proposals.filter((proposal) =>
      proposal.type === RAFT_MEMBERSHIP_OPERATION.ADD_PEER);
    const [first, second] = [JOINS[0][0], JOINS[1][0]].map((identity) =>
      adds.find((proposal) => proposal.identity === identity));
    assert.ok(first && second, 'setup: both joins were proposed');
    const [firstPeerId] = peerIds;
    assert.equal(second.voters.includes(firstPeerId), false,
      'setup: the second AddNode was proposed while the first was unapplied');
    assert.equal(admitted, true,
      'both joins are admitted: the dropped AddNode was re-driven by the ' +
        'membership change, with no row change and no poll');
    const perEpoch = new Map();
    for (const proposal of adds) {
      const key = `${proposal.identity}@${proposal.epoch}`;
      perEpoch.set(key, (perEpoch.get(key) || 0) + 1);
    }
    assert.ok([...perEpoch.values()].every((count) => count === 1),
      'at most one admission proposal per identity per applied ' +
        `configuration (${JSON.stringify([...perEpoch])})`);
  } finally {
    await harness.dispose();
  }
});
