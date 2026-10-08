      // Supply the committed-learner basis as a synthetic row fixture only.
      // The real repository mutation below must travel SQL/Raft -> CDC -> cache;
      // this does not claim that a physical learner exists or may be removed.
      const holder = JSON.parse(claimed.claim);
      const peerOf = deriveRaftRsPeerId;
      const sourceOnly = {voters: [peerOf(source)], votersOutgoing: [],
        learners: [], learnersNext: [], autoLeave: false};
      const withLearner = {...sourceOnly, learners: [peerOf(target)]};
      const learnerStamp = {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
        voters: withLearner.voters, votersOutgoing: [], learners: withLearner.learners,
        learnersNext: [], appliedIndex: 6, commitIndex: 6,
        membershipGenerationIndex: 5, term: 3,
        configurationKey: raftRsConfStateKey(withLearner), leaderId: source,
        gateOpen: true, identities: {[peerOf(source)]: source, [peerOf(target)]: target}};
      assert.ok(committedStampOfAnswer(learnerStamp), 'typed supplied learner basis must validate');
      const prior = {version: 2, transitionIdentity: `${id}-transition`,
        permitSequence: 1, permitStage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
        permitState: 'committed', workflowOwnerNodeId: NODE,
        workflowOwnerFence: `${NODE}:${holder.ownerBootIncarnation}:${holder.generation}`,
        membershipLeaseExpiresAt: holder.expiresAt, proposerNodeId: NODE,
        proposerBootIncarnation: bootstrap.bootIncarnation, destinationNodeId: NODE,
        destinationBootIncarnation: bootstrap.bootIncarnation,
        replicaLifecycleIncarnation: `${id}-nonexecuting-runtime-fixture`, runtimeGeneration: 1,
        leaderTerm: 3, leaderConfigurationStamp: {configurationKey: raftRsConfStateKey(sourceOnly),
          membershipGenerationIndex: 1}, proposalIndex: 5,
        replicaIdentity: target, peerId: peerOf(target)};
      const learnerFields = {message_group_membership_phase: 'learner_committed',
        message_group_membership_obligation_state: 'unknown',
        message_group_membership_permit: JSON.stringify(prior),
        message_group_learner_stamp: JSON.stringify(learnerStamp)};
      assert.equal((await cdc.updateSystemTableRow(TABLE, {operation_id: id}, learnerFields))
        .success, true);
      await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: learnerFields});
      const admitted = await repository.queryAuthoritativeOperationById(id);
      const completedAt = Date.now();
      const settled = await repository.persistOperationUpdate({...admitted,
        status: ReplicaStatus.FAILED, workflowStep: WORKFLOW_STEP.FAILED,
        completedAt, updatedAt: completedAt}, {confirmPersistence: false,
        disableSystemWriteSession: true, returnDisposition: true,
        expectedWorkflowStep: WORKFLOW_STEP.PENDING, terminalTransition: true});
      assert.notEqual(settled?.persisted, false, JSON.stringify(settled));
      await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: {
        status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED,
        completed_at: completedAt, ...learnerFields}});
      const terminalBefore = {...cache.get(TABLE, id)};
      const nextPermit = JSON.stringify({...prior, permitSequence: 2,
        permitStage: RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE, permitState: 'in_flight',
        proposalIndex: null, leaderConfigurationStamp: {
          configurationKey: learnerStamp.configurationKey, membershipGenerationIndex: 5}});
      const input = {operationId: id, identity, priorPermit: JSON.stringify(prior),
        nextPermit, branch: 'abort_learner'};
      const writesBefore = writes.length;
      const selected = await repository.selectMessageGroupMembershipBranch(input);
      assert.equal(selected.outcome, 'recorded', 'T1 must record exact terminal abandonment');
      assert.equal(writes.length, writesBefore + 1, 'one membership intent mutation');
      const mutation = writes[writesBefore];
      assert.ok(mutation.sql.includes('completed_at = ?'), 'exact terminal SQL arm must engage');
      assert.ok(mutation.sql.includes('message_group_membership_owner_claim = ?'));
      assert.ok(mutation.params.includes(completedAt));
      await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: {
        message_group_membership_phase: 'target_removal_proposal_in_flight',
        message_group_membership_permit: nextPermit,
        message_group_membership_lane_key: `message-group:${group}`,
        status: ReplicaStatus.FAILED, completed_at: completedAt}});
      const terminalAfter = {...cache.get(TABLE, id)};
      assert.equal(terminalAfter.message_group_membership_permit, nextPermit);
      assert.equal(terminalAfter.message_group_membership_phase, 'target_removal_proposal_in_flight');
      for (const row of [terminalBefore, terminalAfter]) {
        delete row.message_group_membership_phase;
        delete row.message_group_membership_permit;
      }
      assert.deepEqual(terminalAfter, terminalBefore,
        'the same cached terminal row retains ordinary state, holder, identity and debt');
      assert.equal((await repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
      assert.equal(writes.length, writesBefore + 1, 'replay grants no new write');
      mark('terminal-abandonment-cache-visible');
