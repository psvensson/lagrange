// T3 witness (owner decision O1, committed-read amendment 1, section 3.2):
// the target validates the dispatched stamp on arrival and never falls back
// to rows.
//   - no stamp, or any stamp defect, is STAMP_INVALID with the defect named;
//     the defect table is keyed by the production enumeration, so a defect
//     added without a case turns this red;
//   - GENESIS is refused where a group exists (this replica's durable record,
//     or a discovered replica outside the founders);
//   - a COMMITTED stamp that already names the target a voter, with no
//     durable record for it, is refused DURABLE_RECORD_MISSING at the port;
//   - learners in the answer reach the target's configuration;
//   - the stamp kind, not a row count, decides the join mode.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  addressOf,
  configure,
  createCommittedMembershipHarness,
  createJoinOperation,
  formGroup,
  metadataCache,
  serviceRow,
  statusOf,
  waitFor,
  buildTargetFromOperation,
} from './committed-membership-harness.js';
import {
  durableAppliedState,
  durableLog,
  logFold,
} from './committed-membership-oracles.js';
import {
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RUNTIME_PHASE} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {PARTITION_CONSENSUS_STARTUP_OUTCOME} from
  '../../../src/partition/partition-service-constants.js';
import {reservePartitionRaftPeerIdentity} from
  '../../../src/partition/partition-service-raft-membership-administration.js';
import {ReplicaOperationField} from
  '../../../src/rebalancer/replica-operation-constants.js';

const PARTITION_ID = 'o1-validate';
const FOUNDERS = Object.freeze([
  ['o1v-a', 'node-a'], ['o1v-b', 'node-b'], ['o1v-c', 'node-c']]);
const TARGET = Object.freeze(['o1v-t', 'node-t']);

function resolveFor(harness, stamp, cache = metadataCache(PARTITION_ID,
  FOUNDERS)) {
  const handler = harness.handlerOf(TARGET[1]);
  handler.systemTableCache = cache;
  return handler.resolveReplicaContext(PARTITION_ID, TARGET[0], {
    bootstrapReplicaIds: FOUNDERS.map(([replicaId]) => replicaId),
    bootstrapPeerAddresses: FOUNDERS.map(addressOf),
    bootstrapMembership: stamp,
  });
}

function refusalOf(work) {
  try {
    work();
  } catch (error) {
    return error;
  }
  return null;
}

async function committedStamp(harness) {
  const created = await createJoinOperation(harness, {
    target: TARGET,
    rows: FOUNDERS.map((member) => serviceRow(PARTITION_ID, member)),
    leaderHint: harness.leaderMember()[1],
  });
  assert.equal(created.error, undefined, created.error?.message);
  return created.operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP];
}

// One case per defect of the production enumeration: how a valid COMMITTED
// stamp (or the stamp itself) is broken to exhibit it.
const DEFECT_CASES = Object.freeze({
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.MISSING]: () => null,
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.UNKNOWN_KIND]: (stamp) =>
    ({...stamp, kind: 'unknown-kind'}),
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED]: (stamp) =>
    Object.create(stamp),
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_BOOTSTRAP_INDEX]: (stamp) =>
    ({...stamp, appliedIndex: 0}),
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.JOINT]: (stamp) =>
    ({...stamp, votersOutgoing: [stamp.voters[0]]}),
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_VOTERS]: (stamp) =>
    ({...stamp, voters: []}),
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.IDENTITY_MISMATCH]: (stamp) =>
    ({...stamp, identities: {...stamp.identities,
      [stamp.voters[0]]: 'o1v-not-that-replica'}}),
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.IDENTITY_UNRESOLVED]: (stamp) =>
    ({...stamp, identities: {...stamp.identities, [stamp.voters[0]]: null}}),
  [COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_FOUNDERS]: () =>
    ({kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS, founders: []}),
});

test('T3: a missing or defective stamp is STAMP_INVALID with its defect, ' +
  'never a row-derived membership', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    await formGroup(harness, FOUNDERS);
    const valid = await committedStamp(harness);
    assert.deepEqual(Object.keys(DEFECT_CASES).sort(),
      Object.values(COMMITTED_MEMBERSHIP_STAMP_DEFECT).sort(),
      'every stamp defect of the enumeration has a case');
    for (const [defect, breakStamp] of Object.entries(DEFECT_CASES)) {
      const refused = refusalOf(() => resolveFor(harness, breakStamp(valid)));
      assert.ok(refused, `${defect}: the context is refused, not resolved ` +
        'from the rows the target cache holds');
      assert.equal(refused.code, COMMITTED_MEMBERSHIP_REFUSAL.STAMP_INVALID,
        `${defect}: typed STAMP_INVALID`);
      assert.equal(refused.defect, defect, `${defect}: the defect is named`);
    }
    assert.equal(refusalOf(() => resolveFor(harness, valid)), null,
      'the valid stamp resolves');
  } finally {
    await harness.dispose();
  }
});

test('T3: GENESIS is refused where discovery shows a group outside the ' +
  'founders and governs the join mode where none does', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    const founders = [TARGET, ...FOUNDERS.slice(0, 2)];
    const genesis = {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
      founders: founders.map(([replicaId]) => replicaId)};
    // Rows naming established voters and a leader node: a row-derived
    // classification would make this founder a learner.
    const establishedCache = metadataCache(PARTITION_ID, founders,
      {leaderNodeId: founders[1][1]});
    const founding = resolveFor(harness, genesis, establishedCache);
    assert.equal(founding.existingReplicaCount, 0,
      'a GENESIS founder is never opened as a joining learner by rows');

    const discovered = metadataCache(PARTITION_ID,
      [...founders, ['o1v-elsewhere', 'node-e']]);
    assert.equal(refusalOf(() => resolveFor(harness, genesis, discovered))
      ?.code, COMMITTED_MEMBERSHIP_REFUSAL.GENESIS_REFUSED_GROUP_EXISTS,
    'a discovered replica outside the founders refuses GENESIS');
  } finally {
    await harness.dispose();
  }
});

// C1 (lead review): the record is the authority. A founder re-created with
// its GENESIS stamp after its index-0 applied state was written (the
// provisioner's RESTART_CREATE) restores its own group from that record:
// one genesis configuration (O-a fold over the test's founder), the log it
// already held, its gate restored open (bootstrap 0, admission 0).
function genesisOperation(founders) {
  return {type: 'ADD',
    [ReplicaOperationField.REPLICA_IDS]: founders.map(([id]) => id),
    [ReplicaOperationField.PEER_ADDRESSES]: founders.map(addressOf),
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: {
      kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
      founders: founders.map(([id]) => id)}};
}

test('T3 (C1): a GENESIS founder re-created after its index-0 write ' +
  'restores its own group from the record instead of being refused',
async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [TARGET];
  try {
    const cache = () => metadataCache(PARTITION_ID, founders);
    const {service: first} = await buildTargetFromOperation(harness, {
      target: TARGET, operation: genesisOperation(founders), cache: cache()});
    assert.ok(await waitFor(() => statusOf(first).role === 'leader'),
      'setup: the sole founder leads');
    const founderPeerId = String(statusOf(first).peerId);
    const dbFile = harness.dbPathOf(TARGET);
    assert.ok(await waitFor(() =>
      durableAppliedState(dbFile, PARTITION_ID).appliedIndex > 0),
    'setup: the founder applied its first entry');
    const logBefore = durableLog(dbFile, PARTITION_ID);
    await first.shutdown();

    let restarted = null;
    let refused = null;
    try {
      ({service: restarted} = await buildTargetFromOperation(harness, {
        target: TARGET, operation: genesisOperation(founders),
        cache: cache()}));
    } catch (error) {
      refused = error;
    }
    assert.equal(refused, null, `the RESTART_CREATE restores (${
      refused?.code} ${refused?.message})`);
    assert.ok(await waitFor(() => statusOf(restarted).role === 'leader'),
      'the restored founder leads its group again');
    const logAfter = durableLog(dbFile, PARTITION_ID);
    assert.deepEqual(logAfter.slice(0, logBefore.length).map((entry) =>
      [entry.index, entry.term]), logBefore.map((entry) =>
      [entry.index, entry.term]), 'the log it held is the same group\'s log');
    const fold = logFold(dbFile, PARTITION_ID, [founderPeerId]);
    assert.ok(fold.every((snapshot) =>
      snapshot.voters.length === 1 && snapshot.voters[0] === founderPeerId),
    'O-a: one genesis configuration at every index - no second genesis');
    const record = durableAppliedState(dbFile, PARTITION_ID);
    assert.equal(record.bootstrapIndex, 0);
    assert.equal(record.admissionIndex, 0);
    assert.equal(statusOf(restarted).gateOpen, true,
      'the founder\'s gate is restored open from the record');
  } finally {
    await harness.dispose();
  }
});

test('T3: a COMMITTED stamp already naming the target a voter, with no ' +
  'durable record, is refused DURABLE_RECORD_MISSING at the port', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    await formGroup(harness, FOUNDERS);
    const leader = harness.leader();
    reservePartitionRaftPeerIdentity(leader, TARGET[0]);
    const proposed = await leader.raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaIdentity: TARGET[0]});
    assert.equal(proposed.outcome, 'CORE_OK', 'setup: AddNode(target)');
    const zombieOf = () => statusOf(leader).peers.find((peer) =>
      peer.replicaIdentity === TARGET[0] && !peer.learner);
    assert.ok(await waitFor(() => zombieOf() !== undefined),
      'setup: the target is a committed voter with no process and no record');
    const zombie = zombieOf();
    const stamp = await committedStamp(harness);
    assert.ok(stamp.voters.includes(String(zombie.peerId)),
      'setup: the stamp names the target a voter');
    const cache = metadataCache(PARTITION_ID, FOUNDERS);
    let refused = null;
    try {
      await buildTargetFromOperation(harness, {target: TARGET, cache,
        operation: {type: 'ADD',
          [ReplicaOperationField.REPLICA_IDS]: FOUNDERS.map(([id]) => id),
          [ReplicaOperationField.PEER_ADDRESSES]: FOUNDERS.map(addressOf),
          [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: stamp}});
    } catch (error) {
      refused = error;
    }
    assert.ok(refused, 'the zombie target is not opened');
    assert.equal(refused.code,
      PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
      'surfaced as the typed consensus init refusal');
    assert.equal(refused.consensus?.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING);
    assert.equal(refused.consensus?.phase, RUNTIME_PHASE.DURABLE_RECORD_READ);
    assert.equal(refused.consensus?.retryable, false,
      'distinct from an unreadable record (retryable host failure)');
    const target = harness.services.get(TARGET[0]);
    assert.ok(target.raft === null || target.raft === undefined,
      'no port was kept');
    assert.equal(target.db, null, 'the database handle was released');
  } finally {
    await harness.dispose();
  }
});

test('T3: learners in the committed configuration reach the target, and a ' +
  'COMMITTED stamp is a join whatever the rows say', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const learner = 'o1v-learner';
  try {
    await formGroup(harness, FOUNDERS);
    const leader = harness.leader();
    reservePartitionRaftPeerIdentity(leader, learner);
    await leader.raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: learner});
    assert.ok(await waitFor(() =>
      statusOf(leader).confState.learners.length === 1),
    'setup: the group committed a learner');
    const stamp = await committedStamp(harness);
    assert.equal(stamp.learners.length, 1, 'the answer carries the learner');
    // A fresh-window partition row with no leader and no rows: a row-derived
    // classification would found a group.
    const freshCache = metadataCache(PARTITION_ID, []);
    const {service, context} = await buildTargetFromOperation(harness, {
      target: TARGET, cache: freshCache,
      operation: {type: 'ADD',
        [ReplicaOperationField.REPLICA_IDS]: FOUNDERS.map(([id]) => id),
        [ReplicaOperationField.PEER_ADDRESSES]: FOUNDERS.map(addressOf),
        [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: stamp}});
    assert.ok(context.existingReplicaCount > 0,
      'the COMMITTED stamp makes the target a joiner');
    const created = durableAppliedState(harness.dbPathOf(TARGET),
      PARTITION_ID);
    const targetPeerId = statusOf(service).peerId;
    assert.deepEqual([...created.learners].sort(),
      [...stamp.learners, String(targetPeerId)].sort(),
      'the learners pass through to the target configuration, beside the ' +
        'target itself (a learner until its AddNode is applied)');
    assert.equal(statusOf(service).gateOpen, false,
      'the joiner is below its participation gate');
  } finally {
    await harness.dispose();
  }
});
