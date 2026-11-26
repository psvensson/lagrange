// Custody discriminator for permanent-member-loss recovery. Exercises election
// with old membership intact, checkpoint refusal while PREPARED is pending,
// old-quorum voter replacement while PREPARED is retained via committed log
// catch-up, refusal to synthesize rollback without coordinator decision, and
// current-cohort release cutover once the immutable decision settles PREPARED.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {
  PARTITION_MEMBERSHIP_RECOVERY_OUTCOME as RECOVERY_OUTCOME,
  PARTITION_MEMBERSHIP_RECOVERY_STAGE as RECOVERY_STAGE,
} from '../../src/partition/partition-membership-recovery-constants.js';
import {
  deriveCanonicalPeerIdString,
  recordPartitionMemberBinding,
} from '../../src/partition/partition-membership-recovery.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME as CUTOVER_OUTCOME,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {readParticipantTransactionRow} from
  '../../src/partition/partition-participant-transaction-store.js';
import {PARTITION_SERVICE_OPERATION as OP} from '../../src/partition/partition-service-constants.js';
import {
  readPartitionCommittedMembership,
  readPartitionReplicaMembership,
} from '../../src/partition/partition-service-raft-membership-administration.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_CHECKPOINT_CREATION_OUTCOME} from
  '../../src/raft/snapshot-checkpoint-constants.js';
import {createSqliteStateMachineCheckpoint} from
  '../../src/raft/snapshot-checkpoint-store.js';
import {resolveReplicaCheckpointsRoot} from '../../src/raft/snapshot-install.js';
import {commitMessage, prepareMessage, send} from '../test-helpers/participant-transaction-fixture.js';
import {coordinatorIntent, recordRollback} from './participant-release-tx1-decision-fixture.js';
import {INSERT_SQL, nativeFixture} from './participant-release-tx1-native-fixture.js';

test('the surviving quorum keeps its prepared record across founder loss and settles only the matching decision',
  {timeout: 60000}, async (t) => {
    const fixture = await nativeFixture(t);
    const {control} = fixture.owners;
    const baseline = await fixture.owners.release(control.partitionId);
    assert.equal(baseline.outcome, 'cut_over');
    assert.equal(fixture.leader, fixture.group.services[0]);
    const lostFounder = fixture.leader;
    const identity = await fixture.stage('e');
    const intent = await coordinatorIntent(control, identity, fixture.leader.partitionId);
    const prepared = await send(fixture.leader, prepareMessage(identity));
    assert.equal(prepared.state, 'PREPARED');
    await fixture.waitRows(identity, 'PREPARED');
    const survivors = fixture.group.services.filter((service) => service !== fixture.leader);
    const oldTerm = fixture.leader.raft.readStatus().term;
    await fixture.leader.shutdown();
    const elected = () => survivors.find((service) => {
      const status = service.raft.readStatus();
      return status.role === RAFT_ROLE.LEADER && status.term > oldTerm;
    });
    assert.ok(await fixture.group.waitFor(() => Boolean(elected())));
    const leader = elected();
    const rows = (cohort = survivors) => cohort.map((service) =>
      readParticipantTransactionRow(service.db, identity));
    assert.ok(rows().every((row) => row.state === 'PREPARED' &&
      row.preparedDigest === prepared.preparedDigest &&
      row.prepareIndex === prepared.prepareIndex));
    const write = await leader.applyWrite({type: OP.INSERT, entryId: 'after-founder-loss',
      sql: INSERT_SQL, params: ['unrelated', 'closed']});
    assert.equal(write.failureCode, 'partition_write_cutover_paused');
    const wrong = await send(leader, commitMessage(identity, '0'.repeat(64)));
    assert.equal(wrong.failureCode, 'participant_transaction_decision_digest_mismatch');
    assert.ok(rows().every((row) => row.state === 'PREPARED'));

    // While PREPARED is pending, checkpoint creation refuses with
    // PREPARED_TRANSACTIONS_PENDING, retaining the committed log catch-up path.
    const checkpointAttempt = await createSqliteStateMachineCheckpoint({
      db: leader.db,
      raftRsGroupId: leader.partitionId,
      checkpointsRoot: resolveReplicaCheckpointsRoot(leader.dbPath),
      identity: {
        clusterId: 'prepared-loss-cluster',
        raftGroupId: leader.partitionId,
        entity: {kind: 'partition', id: leader.partitionId},
        membershipEpoch: 1,
      },
    });
    assert.equal(
      checkpointAttempt.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.PREPARED_TRANSACTIONS_PENDING,
    );

    // Record durable member bindings and retire/replace the lost founder voter
    // under old-quorum authority while the PREPARED row is still undecided.
    for (const service of survivors) {
      for (const [index, member] of fixture.group.services.entries()) {
        recordPartitionMemberBinding(service, {
          replicaId: member.replicaId,
          peerId: deriveCanonicalPeerIdString(member.replicaId),
          nodeId: member.nodeId,
          nodeBootIncarnation: 1,
          replicaCreatedAt: 1000 + index,
        });
      }
    }
    const replacementNodeId = 'release-tx1-node-d';
    const replacementReplicaId = `${leader.partitionId}-r4`;
    const leaderHandler = fixture.owners.handlers.get(leader.nodeId);
    const membershipBeforeRecovery = await readPartitionCommittedMembership(leader);
    const decisionId = `recover-${leader.partitionId}-prepared`;

    const ReplicaHandlerClass = leaderHandler.constructor;
    const PartitionServiceClass = leader.constructor;
    const replacementHandler = new ReplicaHandlerClass({
      nodeId: replacementNodeId,
      ownerIncarnation: 1,
      systemTableCache: leader.systemTableCache,
      cdcIntegrationService: {},
      createPartitionService: (options) => new PartitionServiceClass(options),
      messageRouter: leader.transport,
      dataDir: path.dirname(leader.dbPath),
    });
    replacementHandler.registerWithRouter(leader.transport);
    fixture.owners.handlers.set(replacementNodeId, replacementHandler);

    const recoveredOnReplacementNode =
      await leaderHandler.executePermanentMemberLossRecovery({
        decisionId,
        entryId: decisionId,
        partitionId: leader.partitionId,
        configurationKey: membershipBeforeRecovery.configurationKey,
        membershipGenerationIndex: Number(
          membershipBeforeRecovery.membershipGenerationIndex,
        ),
        sourcePeerId: deriveCanonicalPeerIdString(lostFounder.replicaId),
        sourceReplicaId: lostFounder.replicaId,
        sourceReplicaCreatedAt: 1000,
        sourceNodeId: lostFounder.nodeId,
        sourceNodeBootIncarnation: 1,
        targetPeerId: deriveCanonicalPeerIdString(replacementReplicaId),
        targetReplicaId: replacementReplicaId,
        targetReplicaCreatedAt: 2000,
        targetNodeId: replacementNodeId,
        targetNodeBootIncarnation: 1,
      });
    assert.equal(
      recoveredOnReplacementNode.success,
      true,
      JSON.stringify(recoveredOnReplacementNode),
    );
    assert.equal(recoveredOnReplacementNode.outcome, RECOVERY_OUTCOME.COMMITTED);
    assert.equal(recoveredOnReplacementNode.stage, RECOVERY_STAGE.SOURCE_RETIRED);

    const replacementService = replacementHandler.getTrackedService(
      replacementReplicaId,
    );
    assert.ok(replacementService);
    fixture.group.services.push(replacementService);
    const currentCohort = [...survivors, replacementService];

    // All 3 current voters (including the replacement voter caught up via log)
    // hold the exact same PREPARED row and exclude the lost founder voter.
    assert.ok(await fixture.group.waitFor(async () => {
      const observations = await Promise.all(currentCohort.map((member) =>
        readPartitionReplicaMembership(member, lostFounder.replicaId)));
      return observations.every((obs) =>
        obs.gateOpen === true &&
        obs.state === 'absent' &&
        obs.voterReplicaIds.length === 3 &&
        obs.voterReplicaIds.includes(replacementReplicaId) &&
        !obs.voterReplicaIds.includes(lostFounder.replicaId));
    }));
    assert.ok(rows(currentCohort).every((row) =>
      row !== null &&
      row.state === 'PREPARED' &&
      row.preparedDigest === prepared.preparedDigest &&
      row.prepareIndex === prepared.prepareIndex));

    // A missing coordinator decision cannot synthesize a rollback: release
    // stays closed with DRAIN_PENDING while PREPARED is undecided.
    const releaseWhilePrepared = await fixture.owners.releaseOnce(
      leader.partitionId,
    );
    assert.equal(releaseWhilePrepared.outcome, CUTOVER_OUTCOME.DRAIN_PENDING);
    assert.equal(releaseWhilePrepared.blockedDrain?.work?.participantPrepared, 1);
    assert.ok(rows(currentCohort).every((row) => row.state === 'PREPARED'));

    // Incompatible decision digest is still refused on the new cohort.
    const wrongAfterReplace = await send(
      leader,
      commitMessage(identity, '0'.repeat(64)),
    );
    assert.equal(
      wrongAfterReplace.failureCode,
      'participant_transaction_decision_digest_mismatch',
    );
    assert.ok(rows(currentCohort).every((row) => row.state === 'PREPARED'));

    // Replay the immutable coordinator decision while ordinary SQL admission is closed.
    const decision = await recordRollback(control, intent, identity, prepared.preparedDigest);
    // Discard the original answer and reconcile from applied state.
    await send(leader, decision.message);
    assert.ok(await fixture.group.waitFor(() => rows(currentCohort).every((row) =>
      row.state === 'ROLLED_BACK' && row.decisionDigest === decision.row.decision_digest)));
    const index = rows(currentCohort)[0].decisionIndex;
    const replay = await send(leader, decision.message);
    assert.equal(replay.success, true);
    assert.equal(replay.decisionIndex, index);
    for (const service of currentCohort) {
      assert.equal(readParticipantTransactionRow(service.db, identity).decisionIndex, index);
      assert.equal(service.db.prepare('SELECT count(*) AS n FROM release_tx1_rows').get().n, 0);
    }

    // Current-cohort release now succeeds (CUT_OVER) on the new 3-voter cohort.
    const releasedAfterDecision = await fixture.owners.release(leader.partitionId);
    assert.equal(releasedAfterDecision.outcome, CUTOVER_OUTCOME.CUT_OVER);
    assert.equal(releasedAfterDecision.census.length, 3);
  });
