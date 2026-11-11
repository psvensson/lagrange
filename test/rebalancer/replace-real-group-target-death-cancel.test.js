/**
 * D2 target death after the source's removal began, on a REAL rs-raft group
 * {s, x, t} (2026-11-11, CANCEL_REPLICA_REMOVAL). The owner is a real
 * RebalanceCoordinator; the source is hosted by the PRODUCTION replica
 * handler over its real port (replace-real-group-harness.js, sourceHandler),
 * which answers the owner's CANCEL_REPLICA_REMOVAL through its message entry
 * point. The faults are injected at ports: the target's process dies (the
 * cluster isolates it), the failure detector's row marks it FAILED, and the
 * leader's row-driven reconcile proposes RemoveNode(s) exactly when it holds
 * a REMOVING row for s (retireRaftPeerFromAuthoritativeServiceChange's
 * condition).
 *
 * The refusal and the resumed useful work, paired:
 *  - CANCELLED: the operation records the source retained only after the
 *    source's node cancelled - its row serves, its fence lifts, its port is
 *    never retired, it stays a committed voter, nothing proposes its removal
 *    from a serving row; the group keeps quorum and takes a write; the dead
 *    target is removed and a repair ADD restores three voters.
 *  - ALREADY_REMOVED: the RemoveNode commits as the owner asks its cancel
 *    (the source's node answers ALREADY_REMOVED, or answers UNAVAILABLE
 *    while the entry is unapplied and the authority then reads the source
 *    absent - one classification either way); the outcome says the source
 *    was removed (degraded, the repair named), never "retained"; the
 *    source's teardown completes; the repair ADD restores the replica
 *    count.
 * Oracles: the committed configuration folded from a member's durable log,
 * the source's durable lifecycle row, the world's services rows.
 */

import {test} from '../../src/test-helpers/tap.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../src/raft/raft-operation-port-request.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {REPLICA_REMOVAL_CANCEL_ANSWER as CANCEL} from
  '../../src/node/replica-removal-cancel-contract.js';
import {durableHardState} from
  '../raft/raft-rs-backend/committed-membership-oracles.js';
import {durableLifecycleState} from
  '../node/replica-removal-consensus-exit-fixture.js';
import {
  ORDINARY_PARTITION_ID,
  disposeWorld,
  driveToIntent,
  electAmongLive,
  openReplaceWorld,
  readPersisted,
  setTargetRow,
  settleTurns,
} from './replace-real-group-harness.js';

const RETAINED = 'replace_target_dead_source_retained';
const REMOVED = 'replace_target_dead_source_removed';
const OWNER_ROUNDS = 16;
const QUIET_ROUNDS = 200;
const ELECTION_ROUNDS = 400;

function sourceRowStatus(world) {
  return world.cache.get('services', world.sourceReplicaId)?.status ?? null;
}

// The leader's row-driven reconcile on the row it holds for s: a REMOVING
// row makes it propose RemoveNode(s); a serving row proposes nothing.
function leaderReconcilesSourceRow(world) {
  return sourceRowStatus(world) === ReplicaStatus.REMOVING ?
    world.group.rowDrivenRemoval(world.sourceReplicaId) : null;
}

async function enterOwnerUntilTerminal(world) {
  for (let round = 0; round < OWNER_ROUNDS; round += 1) {
    const persisted = await readPersisted(world);
    if (persisted.workflowStep !== WORKFLOW_STEP.STOPPING) {
      return persisted;
    }
    await world.coordinator.reconcileOperationProgress(persisted);
    await settleTurns();
    world.group.advance(20);
  }
  return readPersisted(world);
}

function committedVoterCount(world) {
  return world.group.committedConfiguration().voters.length;
}

// A write through the group's leader, committed: the leader's durable
// commit index passes the index the proposal took.
function writeLands(world, label) {
  const leader = world.group.leader();
  if (leader === null) {
    return {leader: null};
  }
  const before = Number(durableHardState(
    world.group.cluster.replica(leader).dbFile, world.partitionId).commit);
  const answer = turnChainValue(world.group.cluster.node(leader)
    .propose(label));
  const committed = world.group.settle(() => Number(durableHardState(
    world.group.cluster.replica(leader).dbFile, world.partitionId).commit) >
    before, ELECTION_ROUNDS);
  return {leader, outcome: answer?.outcome ?? null, committed};
}

// The repair ADD: a new replica created from the leader's committed stamp
// and admitted by a real AddNode.
function repairAdd(world, replicaId) {
  const stamp = world.group.oracleStamp();
  world.group.cluster.addReplica(replicaId,
    [...Object.values(stamp.identities), replicaId],
    {[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp});
  world.group.commitChange(RAFT_MEMBERSHIP_OPERATION.ADD_PEER, replicaId);
  return committedVoterCount(world);
}

function lastStep(persisted) {
  return (persisted.stepsHistory || []).at(-1) ?? {};
}

async function openWorld() {
  const world = await openReplaceWorld({sourceHandler: true, replicaCount: 2,
    partitionId: ORDINARY_PARTITION_ID});
  const intent = await driveToIntent(world);
  return {world, intent};
}

test('CANCELLED: the target dies after the source\'s row is REMOVING; the ' +
  'source serves again, keeps voting, the group writes, and the repair ADD ' +
  'restores three voters', async (t) => {
  const {world, intent} = await openWorld();
  try {
    t.equal(intent.workflowStep, WORKFLOW_STEP.STOPPING,
      'setup: the durable removal intent');
    t.equal(sourceRowStatus(world), ReplicaStatus.REMOVING,
      'setup: the source\'s row reads REMOVING (its removal began)');
    const handler = world.sourceHandler.handler;
    const sourceDb = world.group.cluster.replica(world.sourceReplicaId).dbFile;
    world.group.kill(world.targetReplicaId);
    // The appends the dying target sent are lost with it.
    for (const replica of world.group.cluster.replicas.values()) {
      replica.inbox.length = 0;
    }
    setTargetRow(world, ReplicaStatus.FAILED);
    t.ok(electAmongLive(world) !== null, 'setup: a survivor leads');

    const persisted = await enterOwnerUntilTerminal(world);
    // The leader then reconciles the row it holds for s.
    const reconcile = leaderReconcilesSourceRow(world);
    world.group.advance(QUIET_ROUNDS);
    await settleTurns();

    t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED, 'FAILED');
    t.match(String(persisted.errorMessage), RETAINED, 'the source retained');
    t.ok(world.cancels.length >= 1, 'only after asking the source\'s node');
    t.equal(lastStep(persisted).replaceTargetDeath?.sourceRemoval?.answer,
      CANCEL.CANCELLED, 'which answered CANCELLED');
    t.equal(sourceRowStatus(world), ReplicaStatus.ACTIVE,
      'the source\'s row serves again');
    t.equal(reconcile, null, 'no survivor proposes the removal from it');
    t.equal(world.sourceHandler.service.admissionFenced, false,
      'its serving fence lifted');
    t.equal(handler.getLocalReplica(world.sourceReplicaId)?.status,
      ReplicaStatus.ACTIVE, 'its local status is ACTIVE');
    t.equal(handler.inProgressOperations.size, 0, 'its removal ended');
    t.equal(durableLifecycleState(sourceDb, world.partitionId), 'active',
      'its port was never retired');
    t.equal(world.group.cluster.node(world.sourceReplicaId).readStatus()
      .outcome, RAFT_OPERATION_OUTCOME.CORE_OK, 'its port answers');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'it stays a committed voter');
    const write = writeLands(world, 'after-cancel');
    t.same({leads: write.leader !== null, committed: write.committed},
      {leads: true, committed: true}, 'the group keeps quorum: a write lands');

    // Resumed useful work: the dead target leaves, the repair ADD restores
    // the replica count, and the group writes.
    world.group.commitChange(RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      world.targetReplicaId);
    t.equal(committedVoterCount(world), 2, 'the dead target is removed');
    t.equal(repairAdd(world, `${world.partitionId}-r5`), 3,
      'the repair ADD restores three voters');
    t.equal(writeLands(world, 'after-repair').committed, true,
      'and the repaired group writes');
  } finally {
    await disposeWorld(world);
  }
});

test('ALREADY_REMOVED: the removal commits once the target is dead; the ' +
  'outcome says the source was removed (degraded, repair named), the ' +
  'source\'s teardown completes, and the repair ADD restores the replica ' +
  'count', async (t) => {
  const {world, intent} = await openWorld();
  try {
    t.equal(intent.workflowStep, WORKFLOW_STEP.STOPPING,
      'setup: the durable removal intent');
    const sourceDb = world.group.cluster.replica(world.sourceReplicaId).dbFile;
    // The failure detector marks the target dead; its process still runs,
    // so the leader admits RemoveNode(s) (its survivors are a live quorum).
    setTargetRow(world, ReplicaStatus.FAILED);
    const deliver = world.coordinator.messageRouter.deliver;
    let injected = false;
    world.coordinator.messageRouter.deliver = async (target, payload,
      options) => {
      const type = payload?.[ReplicaOperationField.TYPE];
      // The owner's own R-1f proposal does not reach the leader's node.
      if (type === ReplicaOperationMessageType.RETIRE_REPLICA_PEER) {
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: ReplicaOperationResponseStatus.ERROR,
          error: 'replica unreachable'});
      }
      if (!injected &&
          type === ReplicaOperationMessageType.CANCEL_REPLICA_REMOVAL) {
        injected = true;
        leaderReconcilesSourceRow(world);
        world.group.settle(() =>
          !world.group.sourceCommittedVoter(world.sourceReplicaId),
        ELECTION_ROUNDS);
        await settleTurns();
      }
      return deliver(target, payload, options);
    };
    const persisted = await enterOwnerUntilTerminal(world);
    world.group.advance(QUIET_ROUNDS);
    await settleTurns();

    t.equal(injected, true, 'the cancel was asked');
    t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED, 'terminal FAILED');
    t.match(String(persisted.errorMessage), REMOVED,
      'the outcome says the source was removed, not retained');
    const death = lastStep(persisted).replaceTargetDeath;
    t.equal(death?.sourceRemoval?.answer, CANCEL.ALREADY_REMOVED,
      'the source\'s node answered ALREADY_REMOVED');
    t.same({source: death?.degraded?.removedSourceReplicaId,
      target: death?.degraded?.deadTargetReplicaId,
      repair: death?.degraded?.repair}, {source: world.sourceReplicaId,
      target: world.targetReplicaId, repair: 'durability_repair_add'},
    'the degraded group and its repair are named');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), false,
      'the source left the committed configuration');
    t.equal(durableLifecycleState(sourceDb, world.partitionId), 'retired',
      'the source\'s port retired only after its removal applied');
    t.equal(sourceRowStatus(world), null, 'its row is gone');
    t.equal(committedVoterCount(world), 2, 'the group runs on two voters');
    t.equal(repairAdd(world, `${world.partitionId}-r5`), 3,
      'the repair ADD restores three voters');
    t.equal(writeLands(world, 'after-repair').committed, true,
      'and the repaired group writes');
  } finally {
    await disposeWorld(world);
  }
});
