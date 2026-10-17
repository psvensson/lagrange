// Witness W7 of the identity-reuse safety fix, A2: a replica that opens
// under a GENESIS stamp with no durable record while it says it joins a
// group that already exists is refused DURABLE_RECORD_MISSING before the
// core is entered (owner decision O4) - it would otherwise found an empty
// log under an identity whose history the group holds elsewhere. After A3
// no message-group path produces such a replica; this is a one-branch
// fail-closed tripwire, and it refuses no legitimate opening: a true genesis
// founder, a single-node group (RF=1), a founder restarted from a record it
// never wrote past its bootstrap, and a COMMITTED-stamp joiner that includes
// itself in its bootstrap configuration (O2).
//
// Real rs-raft ports on the real WASM core (PartitionNodeCluster); the
// refusal is read off the port's thrown consensus outcome and the actual
// core-entry observer (no create_node for the refused group).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  LEADER_ROLE,
  SETTLE_ROUNDS,
  formedCluster,
} from './identity-reuse-harness.js';
import {
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';

const JOINING = Object.freeze({
  [RAFT_OPERATION_PORT_REQUEST.JOINING_EXISTING_GROUP]: true});

function createNodesFor(cluster, groupId, from) {
  return cluster.coreEntries.slice(from).filter((entry) =>
    entry.operation === 'create_node' && entry.groupId === groupId).length;
}

test('W7: a GENESIS opening that joins an existing group with no record ' +
  'is refused durable-record-missing before the core is entered', () => {
  const cluster = formedCluster('w7-refused', ['w7-a', 'w7-b', 'w7-c'], 3);
  try {
    const before = cluster.coreEntries.length;
    let refused = null;
    try {
      cluster.buildReplica('w7-d', ['w7-a', 'w7-b', 'w7-c', 'w7-d'],
        JOINING);
    } catch (error) {
      refused = error.consensus;
    }
    assert.equal(refused?.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      'the joining GENESIS replica opened');
    assert.equal(refused.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING);
    assert.equal(refused.retryable, false);
    assert.equal(createNodesFor(cluster, cluster.partitionId, before), 0,
      'the core was entered for the refused replica');
  } finally {
    cluster.dispose();
  }
});

test('W7: the tripwire refuses no legitimate opening - genesis founders, ' +
  'RF=1, a founder restarted from a bootstrap-only record, an O2 joiner',
async () => {
  // True genesis: three founders open and elect.
  const founders = formedCluster('w7-genesis', ['g-a', 'g-b', 'g-c'], 1);
  try {
    assert.equal(founders.node('g-a').readStatus().role, LEADER_ROLE);

    // An O2 joiner: a COMMITTED stamp, this replica in its own bootstrap
    // configuration, below its gate; the joining flag does not touch it.
    const stamp = founders.node('g-a')[RAFT_OPERATION
      .READ_COMMITTED_MEMBERSHIP]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
    founders.addReplica('g-t', ['g-a', 'g-b', 'g-c'], {
      [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp, ...JOINING});
    const joiner = founders.node('g-t').readStatus();
    assert.equal(joiner.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(joiner.gateOpen, false);
    assert.ok(joiner.confState.voters.includes(joiner.peerId),
      'O2: the joiner names itself in its bootstrap configuration');
  } finally {
    founders.dispose();
  }

  // RF=1: a single founder opens and leads.
  const lone = new PartitionNodeCluster({
    partitionId: 'w7-lone', replicaIds: ['l-a']});
  try {
    lone.tickers = ['l-a'];
    assert.ok(lone.settle(() =>
      lone.node('l-a').readStatus().role === LEADER_ROLE,
    {rounds: SETTLE_ROUNDS}), 'the lone founder leads');
  } finally {
    lone.dispose();
  }

  // A founder that never wrote past its bootstrap record, restarted - even
  // under the joining flag, a replica with a record is restored from it.
  const quiet = new PartitionNodeCluster({
    partitionId: 'w7-quiet', replicaIds: ['q-a', 'q-b', 'q-c']});
  try {
    const before = quiet.node('q-c').readStatus();
    assert.equal(before.term, 0, 'setup: q-c never campaigned or voted');
    quiet.replica('q-c').extraRequest = JOINING;
    quiet.restart('q-c');
    const restored = quiet.node('q-c').readStatus();
    assert.equal(restored.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(restored.gateOpen, true);
    quiet.tickers = ['q-a'];
    assert.ok(quiet.settle(() =>
      quiet.node('q-a').readStatus().role === LEADER_ROLE &&
      quiet.node('q-c').readStatus().leaderId === 'q-a',
    {rounds: SETTLE_ROUNDS}), 'the restarted founder takes part');
  } finally {
    quiet.dispose();
  }
});
