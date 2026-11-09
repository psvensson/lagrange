// V2 (verification O1 round 1, verify-o1-noop-redrive-chain rebuilt), the
// production admission path end to end: PartitionService replicas on real
// rs-raft ports; the target's admission request, answered from its committed
// replica operation (quest replica-admission-from-committed-operation),
// lands in the same turn as a pending configuration change. At ab7669fd0 the AddNode was dropped by the crate behind the
// pending change, recorded PROPOSED and latched in flight; a change that
// applied without changing the configuration key raised no
// MEMBERSHIP_CHANGED, so nothing re-drove it, and every later admission
// answered IN_FLIGHT: the target was never admitted.
//
// Ranged over the pending kinds the admission path meets in production:
// the no-op RemoveNode (R-1f's documented repeat), the no-op AddNode, and
// the effective RemoveNode of a retiring row (F2: a REMOVING row retires its
// peer) - the last with "no re-admission of the just-removed source" as an
// explicit cell. Oracle: the leader's durable applied configuration.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  configure,
  createCommittedMembershipHarness,
  formGroup,
  serviceRow,
  waitFor,
} from './committed-membership-harness.js';
import {durableAppliedState} from './committed-membership-oracles.js';
import {TABLES} from '../../../src/constants/index.js';
import {CDCOperation} from '../../../src/partition/partition-service.js';
import {retirePartitionRaftPeer} from
  '../../../src/partition/partition-service-raft-membership-administration.js';
import {retireRaftPeerFromAuthoritativeServiceChange} from
  '../../../src/partition/partition-service-raft-peer-cache-reconciliation.js';
import {RAFT_MEMBERSHIP_OPERATION} from
  '../../../src/raft/raft-operation-port-constants.js';
import {committedAddOperation} from
  '../../partition/committed-operation-gateway-fixture.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';
import {buildFailedCreateCleanupToken} from
  '../../../src/rebalancer/failed-create-cleanup-token.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';

const ADMISSION_BOUND_MS = 4000;
const FOUNDERS = Object.freeze([
  ['ar-a', 'node-a'], ['ar-b', 'node-b'], ['ar-c', 'node-c']]);
const TARGET = Object.freeze(['ar-t', 'node-t']);

// Each kind leaves a configuration change pending on the leader and says
// which founder (if any) the group is removing.
const PENDING_KINDS = Object.freeze({
  'no-op RemoveNode (a non-member)': ({leader}) => {
    retirePartitionRaftPeer(leader, 'ar-gone');
    return null;
  },
  'no-op AddNode (a member)': ({leader, harness}) => {
    const member = FOUNDERS.find(([replicaId]) =>
      replicaId !== leader.replicaId);
    harness.services.get(leader.replicaId).raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaIdentity: member[0],
      nodeId: member[1]});
    return null;
  },
  // F2: a founder's row reads REMOVING; the leader's row-driven retirement
  // proposes its RemoveNode when the cache change reaches it.
  'effective RemoveNode (a retiring row)': async ({leader, cache}) => {
    const retiring = FOUNDERS.find(([replicaId]) =>
      replicaId !== leader.replicaId);
    cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.UPDATE, {
      ...serviceRow(leader.partitionId, retiring),
      status: ReplicaStatus.REMOVING,
    });
    await new Promise((resolve) => setImmediate(resolve));
    return retiring;
  },
  'effective RemoveNode (a claimed failed-create row)': async ({leader, cache}) => {
    const failedCreate = FOUNDERS.find(([replicaId]) =>
      replicaId !== leader.replicaId);
    assert.equal(
      retireRaftPeerFromAuthoritativeServiceChange(
        leader,
        CDCOperation.UPDATE,
        {
          ...serviceRow(leader.partitionId, failedCreate),
          status: ReplicaStatus.FAILED,
          cleanup_token: null,
        },
      ),
      false,
      'an unclaimed FAILED row (cleanup_token null) never retires a Raft peer',
    );
    cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.UPDATE, {
      ...serviceRow(leader.partitionId, failedCreate),
      status: ReplicaStatus.FAILED,
      cleanup_token: buildFailedCreateCleanupToken('op-failed-create-claim'),
    });
    await new Promise((resolve) => setImmediate(resolve));
    return failedCreate;
  },
});

for (const [kind, pend] of Object.entries(PENDING_KINDS)) {
  test(`V2 chain: a requested AddNode landing behind a pending ${kind} is ` +
    'admitted within the bound; later requests are never latched',
  async () => {
    configure();
    const partitionId = `admission-redrive-${
      Object.keys(PENDING_KINDS).indexOf(kind)}`;
    const harness = createCommittedMembershipHarness(partitionId);
    try {
      await formGroup(harness, FOUNDERS);
      const leader = harness.leader();
      const leaderMember = harness.leaderMember();
      const dbFile = harness.dbPathOf(leaderMember);
      const cache = harness.caches.get(leaderMember[0]);
      const removed = await pend({leader, harness, cache});
      // The target's row lands (discovery only) and its admission request
      // reaches the leader, in the same turn as the pending change.
      cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT,
        serviceRow(partitionId, TARGET));
      const operation = committedAddOperation(partitionId, TARGET);
      harness.operations.push(operation);
      const request = {partitionId, replicaIdentity: TARGET[0],
        operationId: operation.operation_id};
      await leader.handleReplicaAdmissionRequest(request);
      const voters = () => durableAppliedState(dbFile, partitionId).voters;
      const targetPeerId = deriveRaftRsPeerId(TARGET[0]);
      const admitted = await waitFor(() => voters().includes(targetPeerId),
        ADMISSION_BOUND_MS);
      assert.equal(admitted, true,
        `the target is admitted within ${ADMISSION_BOUND_MS} ms (voters ${
          JSON.stringify(voters())})`);
      const again = await leader.handleReplicaAdmissionRequest(request);
      assert.equal(again.admission.outcome, 'already_member',
        'a later admission reads it a member, never IN_FLIGHT');
      if (removed !== null) {
        const removedPeerId = deriveRaftRsPeerId(removed[0]);
        assert.equal(await waitFor(() => !voters().includes(removedPeerId),
          ADMISSION_BOUND_MS), true, 'the retiring founder is removed');
        // Every re-drive this group runs from here on (settlements, a
        // leadership gain) reads its retiring row: it is not re-admitted.
        cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.UPDATE, {
          ...serviceRow(partitionId, TARGET), status: ReplicaStatus.ACTIVE});
        await waitFor(() => false, 500);
        assert.equal(voters().includes(removedPeerId), false,
          'no re-admission of the just-removed source');
      }
    } finally {
      await harness.dispose();
    }
  });
}
