from pathlib import Path
p=Path('test/integration/message-group-learner-runtime-authorization.integration.test.js')
s=p.read_text()
old="import {validateCheckpointDescriptor} from '../../src/raft/snapshot-checkpoint-format.js';"
assert s.count(old)==1
s=s.replace(old,old+'''
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME, RAFT_SNAPSHOT_INSTALL_REJECTION} from
  '../../src/raft/snapshot-install-constants.js';
import {ReplicaCreateAdmissionOwner} from '../../src/node/replica-create-admission-owner.js';
import {buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken} from
  '../../src/rebalancer/replica-create-admission-token.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../../src/raft/raft-operation-port-request.js';
''')
old='  gateway.readRows = gateway.readAuthoritativeRows;';assert s.count(old)==1
s=s.replace(old,old+'''
  gateway.updateSystemTableRow = async (table, where, data) => {
    assert.equal(table, 'replica_operations');
    const changed = execute(`UPDATE replica_operations SET ${Object.keys(data)
      .map((key) => `${key} = ?`).join(', ')} WHERE ${Object.keys(where)
      .map((key) => `${key} IS ?`).join(' AND ')}`, [...Object.values(data), ...Object.values(where)]);
    return {success: true, outcome: changed.affectedRows === 1 ? 'applied' : 'no_op'};
  };''')
assert s.count('request, receiver, observe, db, transport,')==1
s=s.replace('request, receiver, observe, db, transport,','request, receiver, observe, db, gateway, transport,')
anchor='async function settleOperation(f, successful = false) {';assert s.count(anchor)==1
helper='''async function installationAdmission(t, f) {
  const owner = new ReplicaCreateAdmissionOwner({gateway: f.gateway,
    nodeId: SUCCESSOR, ownerIncarnation: 1, now: () => NOW + 10});
  const before = await f.repository.queryAuthoritativeOperationById(O);
  // Fixture actuation through the real repository, NOT a production driver.
  // This witness composes current native descriptor, CREATE CAS and install.
  await f.repository.persistOperationUpdate({...before, workflowStep: WORKFLOW_STEP.SENDING,
    updatedAt: NOW + 2}, {confirmPersistence: false, disableSystemWriteSession: true,
    returnDisposition: true, expectedWorkflowStep: WORKFLOW_STEP.PENDING});
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.SENDING);
  const admissionToken = buildReplicaCreateAdmissionToken({operationId: O,
    replicaId: TARGET, targetNodeId: SUCCESSOR, workflowUpdatedAt: NOW + 2});
  const request = {operationId: O, operationType: OperationType.REPLACE,
    entityType: SERVICE_TYPE.MESSAGE_GROUP, entityId: GROUP, partitionId: GROUP,
    replicaId: TARGET, workflowUpdatedAt: NOW + 2, admissionToken,
    attemptToken: buildReplicaCreateAttemptToken(admissionToken, 1), attemptSeq: 1};
  const evidence = await owner.claim(request);
  const worker = await owner.claimPhysicalWorker(evidence);
  assert.ok(worker, 'the existing CREATE owner must grant the actual sole worker');
  t.after(() => owner.releasePhysicalWorker(worker));
  return {owner, evidence, worker};
}
'''
s=s.replace(anchor,helper+anchor)
anchor="    await t.test('checkpoint validates origin against both payload and applied boundary',";assert s.count(anchor)==1
new='''    await t.test('actual origin-bearing image installs and reopens on the exact fresh learner',
      async (t) => {
        const f = await fixture(t);
        const proposed = await f.run(); assertCommittedLearner(f, proposed);
        const original = await readLearnerAction(f);
        const stamp = await f.port.readCommittedMembership({
          purpose: membershipRead.COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
        assert.equal(stamp.kind, membershipRead.COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
        assert.ok(stamp.learners.includes(deriveRaftRsPeerId(TARGET)),
          'a current native join descriptor, not just historical origin, is required');
        const created = await learnerCheckpoint(f);
        const targetDbPath = f.cluster.dbFileOf(TARGET);
        const receiverRoot = path.join(f.cluster.directory, 'target-checkpoints');
        const generation = created.descriptor.lastIncludedIndex;
        fs.cpSync(created.checkpointDir, path.join(receiverRoot, String(generation)),
          {recursive: true});
        const options = {replicaDbPath: targetDbPath, checkpointsRoot: receiverRoot,
          generationIndex: generation, expectedIdentity: {clusterId: 'origin-cluster',
            raftGroupId: GROUP, entity: {kind: 'message-group', id: GROUP},
            membershipEpoch: created.descriptor.membershipEpoch},
          expectedReplicaIdentity: TARGET, expectedPeerId: deriveRaftRsPeerId(TARGET)};
        const direct = await requestSnapshotInstall(options);
        assert.equal(direct.reason, RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED);
        assert.equal(fs.existsSync(targetDbPath), false,
          'a historical receipt and checkpoint cannot bypass physical CREATE authority');
        const admission = await installationAdmission(t, f);
        assert.equal(await admission.owner.claimPhysicalWorker(admission.evidence), false,
          'a second physical worker must not be admitted for the same generation');
        const installed = await requestSnapshotInstall({...options,
          createAdmissionOwner: admission.owner, createAdmissionEvidence: admission.evidence,
          createPhysicalWorkerClaim: admission.worker});
        assert.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
          'the actual origin-bearing snapshot must install under exact CREATE admission');
        const disk = new Database(targetDbPath, {readonly: true});
        try {
          assert.equal(disk.prepare('SELECT COUNT(*) AS n FROM _raft_rs_log').get().n, 0,
            'target recovery must not borrow the sender log');
          const encoded = disk.prepare('SELECT learner_admission FROM raft_rs_peer_identity ' +
            'WHERE replica_identity = ?').get(TARGET).learner_admission;
          assert.deepEqual(JSON.parse(encoded), original.receipt);
        } finally {
          disk.close();
        }
        const joined = f.cluster.addReplica(TARGET, FOUNDERS, {
          [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp,
          [RAFT_OPERATION_PORT_REQUEST.JOINING_EXISTING_GROUP]: true});
        assert.equal(joined.node.readStatus().outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
        assertExactLearnerOrigin(f, await readLearnerAction(f, TARGET), proposed.proposalIndex);
        assert.equal((await readLearnerAction(f, TARGET, {operationId: 'wrong-operation'})).kind,
          membershipRead.COMMITTED_LEARNER_ACTION_KIND.REFUSED);
        const oldPort = joined.node;
        const oldDb = joined.db;
        const reopened = f.cluster.restart(TARGET);
        assert.equal(oldDb.open, false, 'the previous target database must actually close');
        assert.equal(reopened.db === oldDb, false, 'reopen must acquire another real connection');
        assert.equal(reopened.node === oldPort, false, 'reopen must acquire another native port');
        assertExactLearnerOrigin(f, await readLearnerAction(f, TARGET), proposed.proposalIndex);
        assert.equal((await oldPort.readCommittedMembership(learnerActionQuery(f))).kind,
          membershipRead.COMMITTED_LEARNER_ACTION_KIND.REFUSED);
        assert.ok(reopened.node.readStatus().confState.learners.includes(deriveRaftRsPeerId(TARGET)));
        assert.equal(f.row().message_group_membership_permit, f.request.permit,
          'checkpoint recovery cannot refresh the original issued action');
      });
'''
s=s.replace(anchor,new+anchor)
p.write_text(s)
