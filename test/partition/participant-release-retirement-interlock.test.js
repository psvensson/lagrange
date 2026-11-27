// Native control, schema and placement-ledger Raft groups. The fixture supplies
// committed ADD records for formation only. No retirement is planted.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {SQL_TRANSACTIONS_SCHEMA, SCHEMA_OPERATIONS_SCHEMA, REPLICA_OPERATIONS_SCHEMA}
  from '../../src/bootstrap/system-table-schemas-constants.js';
import {classifyPlacementClass} from '../../src/bootstrap/system-partition-classification.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_ERROR as RECOVERY_ERROR,
  PARTITION_MEMBERSHIP_RECOVERY_OUTCOME as RECOVERY_OUTCOME,
  PARTITION_MEMBERSHIP_RECOVERY_STAGE as RECOVERY_STAGE,
} from '../../src/partition/partition-membership-recovery-constants.js';
import {
  deriveCanonicalPeerIdString,
  readCommittedMembershipRecoveriesIn,
  recordPartitionMemberBinding,
} from '../../src/partition/partition-membership-recovery.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_OPERATION as OP,
} from '../../src/partition/partition-service-constants.js';
import {
  readPartitionCommittedMembership,
  readPartitionReplicaMembership,
} from '../../src/partition/partition-service-raft-membership-administration.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME, PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {createLoopbackTransport} from './partition-service-test-support.js';
import {NODE, placementStatement} from './placement-admission-fixture.js';

const budgetMs = 15000;
const nodes = [NODE.A, NODE.B, NODE.C];
const leaderOf = (group) => group.services.find((service) =>
  !service.isShutdown && service.raft.readStatus().role === RAFT_ROLE.LEADER);

function bindGroupMemberGenerations(group, memberNodes, {
  bootIncarnation = 1,
  baseCreatedAt = 1000,
} = {}) {
  for (const service of group.services) {
    if (service.isShutdown) continue;
    for (const [index, nodeId] of memberNodes.entries()) {
      const memberReplicaId = `${group.services[0].partitionId}-r${index + 1}`;
      recordPartitionMemberBinding(service, {
        replicaId: memberReplicaId,
        peerId: deriveCanonicalPeerIdString(memberReplicaId),
        nodeId,
        nodeBootIncarnation: bootIncarnation,
        replicaCreatedAt: baseCreatedAt + index,
      });
    }
  }
}

async function buildGroupRecoveryDecision(group, {
  sourceIndex = 0,
  sourceNodeId = NODE.A,
  sourceNodeBootIncarnation = 1,
  sourceReplicaCreatedAt = 1000,
  targetReplicaId = `${group.services[0].partitionId}-r4`,
  targetNodeId = NODE.D,
  targetNodeBootIncarnation = 1,
  targetReplicaCreatedAt = 2000,
  decisionId = `recover-${group.services[0].partitionId}`,
} = {}) {
  const leader = leaderOf(group);
  assert.ok(leader, `expected live leader for ${group.services[0].partitionId}`);
  const membership = await readPartitionCommittedMembership(leader);
  const sourceReplicaId = group.services[sourceIndex].replicaId;
  return {
    decisionId,
    entryId: decisionId,
    partitionId: leader.partitionId,
    configurationKey: membership.configurationKey,
    membershipGenerationIndex: Number(membership.membershipGenerationIndex),
    sourcePeerId: deriveCanonicalPeerIdString(sourceReplicaId),
    sourceReplicaId,
    sourceReplicaCreatedAt,
    sourceNodeId,
    sourceNodeBootIncarnation,
    targetPeerId: deriveCanonicalPeerIdString(targetReplicaId),
    targetReplicaId,
    targetReplicaCreatedAt,
    targetNodeId,
    targetNodeBootIncarnation,
  };
}

test('a live ledger quorum needs control release to authorize new retirement after founder loss',
  {timeout: 120000}, async (t) => {
    const transport = createLoopbackTransport();
    const groups = [];
    const handlers = new Map();
    t.after(async () => {
      for (const handler of handlers.values()) {
        await handler.participantReleaseRecovery.shutdown();
        handler.unregisterFromRouter(transport);
      }
      const disposed = await Promise.allSettled(groups.map((group) => group.dispose()));
      const errors = disposed.filter((answer) => answer.status === 'rejected');
      if (errors.length) throw new AggregateError(errors.map((answer) => answer.reason));
    });
    for (const schema of [
      SQL_TRANSACTIONS_SCHEMA,
      SCHEMA_OPERATIONS_SCHEMA,
      REPLICA_OPERATIONS_SCHEMA,
    ]) {
      const partitionId = schema.tableName + '-p1';
      const members = nodes.map((node, i) => [partitionId + '-r' + (i + 1), node]);
      groups.push(await formAdmittedGroup({partitionId, members, transport, budgetMs,
        tempPrefix: 'retirement-interlock-', serviceOptions: {
          tableId: schema.tableName, tableName: schema.tableName, schema}}));
    }
    const [control, schemaGroup, ledger] = groups;
    for (const [i, nodeId] of nodes.entries()) {
      const service = control.services[i];
      const handler = new ReplicaHandler({nodeId, ownerIncarnation: 1,
        systemTableCache: service.systemTableCache, messageRouter: transport,
        timeSource: new VirtualTimeSource({startMs: 1000}),
        dataDir: path.dirname(control.dbFileOf([service.replicaId, nodeId])),
        createPartitionService: (options) => new PartitionService(options),
        cdcIntegrationService: {sqlQueryEngine: {queryExecutor: {bootstrapTopologySnapshotOwner: {
          resolveCanonicalPartitionLeaderNodeId: () => leaderOf(control)?.nodeId,
        }}}}});
      handlers.set(nodeId, handler);
      handler.registerWithRouter(transport);
      for (const group of groups) {
        const member = group.services[i];
        handler.localServices.set(member.replicaId, member);
      }
    }
    const build = await runtimeBuildProvenance();
    assert.equal(build.state, 'measured');
    const release = (group) => {
      const leader = leaderOf(group);
      const handler = handlers.get(leader.nodeId);
      return handler.participantReleaseRecovery.releaseOperator({partitionId: leader.partitionId,
        targetBuildDigest: build.digest, deadlineAtMs: handler.timeSource.now() + budgetMs});
    };
    for (const group of groups) {
      assert.equal(leaderOf(group), group.services[0]);
      const answer = await release(group);
      assert.equal(answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(answer));
    }
    const lost = handlers.get(NODE.A);
    await lost.participantReleaseRecovery.shutdown();
    lost.unregisterFromRouter(transport);
    handlers.delete(NODE.A);
    await Promise.all(groups.map((group) => group.services[0].shutdown()));
    for (const group of groups) {
      assert.ok(await group.waitFor(async () => {
        const leader = leaderOf(group);
        if (!leader) return false;
        const responses = await Promise.all(group.services.slice(1).map((member) =>
          readPartitionReplicaMembership(member, group.services[0].replicaId)));
        return responses.every((answer) => answer.gateOpen && answer.state === 'voter' &&
          answer.leaderReplicaId === leader.replicaId &&
          answer.term === leader.raft.readStatus().term &&
          answer.voterReplicaIds.length === 3);
      }), 'both survivors confirm their leader and their retained dead voter');
    }
    for (const group of [schemaGroup, ledger]) {
      const answer = await release(group);
      assert.equal(answer.missingFact, MISSING.CURRENT_CONTROL_OWNER, JSON.stringify(answer));
      assert.equal(answer.controlNodeId, leaderOf(control).nodeId);
      assert.equal(answer.controlMissingFact, MISSING.REPLICA_RELEASE_REPLY);
      assert.equal(answer.controlPhase, ACTION.INSPECT);
      assert.equal(answer.inspectNodeId, NODE.A);
      assert.equal(answer.inspectReplicaId, control.services[0].replicaId);
    }
    const ledgerLeader = leaderOf(ledger);
    for (const group of [control, schemaGroup]) {
      const dead = group.services[0];
      const readRows = () => ledgerLeader.db.prepare(
        'SELECT operation_id FROM replica_operations WHERE partition_id = ?').all(dead.partitionId);
      assert.deepEqual(readRows(), []);
      const answer = await requestPlacementAdmission(ledgerLeader, {
        entryId: 'replace-' + dead.replicaId, body: placementStatement({
          partitionId: dead.partitionId,
          placementClass: classifyPlacementClass(dead.partitionId),
          type: OperationType.REPLACE,
          source: NODE.B,
          target: NODE.D,
          sourceReplicaId: dead.replicaId,
        })});
      assert.equal(answer.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED,
        JSON.stringify(answer));
      assert.deepEqual(readRows(), [], 'the refused request created no retirement authority');
    }

    // Discriminator 2 (Negative safety controls):
    const controlLeader = leaderOf(control);
    const controlLeaderHandler = handlers.get(controlLeader.nodeId);
    const baseControlDecision = await buildGroupRecoveryDecision(control);

    // 2a. Durable source binding absent on group -> refused with BINDING_ABSENT.
    const unboundAttempt = await controlLeaderHandler.stagePermanentMemberLossRecovery(
      baseControlDecision,
    );
    assert.equal(unboundAttempt.success, false);
    assert.equal(unboundAttempt.failureCode, RECOVERY_ERROR.BINDING_ABSENT);
    assert.deepEqual(readCommittedMembershipRecoveriesIn(controlLeader.db), []);

    // Record authoritative member generation bindings on all groups.
    for (const group of groups) {
      bindGroupMemberGenerations(group, nodes, {bootIncarnation: 1, baseCreatedAt: 1000});
    }

    // 2b. Absent required binding field in decision -> refused with BINDING_ABSENT.
    const missingFieldAttempt = await controlLeaderHandler.stagePermanentMemberLossRecovery({
      ...baseControlDecision,
      sourceNodeBootIncarnation: null,
    });
    assert.equal(missingFieldAttempt.success, false);
    assert.equal(missingFieldAttempt.failureCode, RECOVERY_ERROR.BINDING_ABSENT);
    assert.deepEqual(readCommittedMembershipRecoveriesIn(controlLeader.db), []);

    // 2c. Noncurrent nodeBootIncarnation or replicaCreatedAt -> refused with SOURCE_GENERATION_MISMATCH.
    const staleBootAttempt = await controlLeaderHandler.stagePermanentMemberLossRecovery({
      ...baseControlDecision,
      sourceNodeBootIncarnation: 2,
    });
    assert.equal(staleBootAttempt.success, false);
    assert.equal(staleBootAttempt.failureCode, RECOVERY_ERROR.SOURCE_GENERATION_MISMATCH);

    const staleBirthAttempt = await controlLeaderHandler.stagePermanentMemberLossRecovery({
      ...baseControlDecision,
      sourceReplicaCreatedAt: 9999,
    });
    assert.equal(staleBirthAttempt.success, false);
    assert.equal(staleBirthAttempt.failureCode, RECOVERY_ERROR.SOURCE_GENERATION_MISMATCH);
    assert.deepEqual(readCommittedMembershipRecoveriesIn(controlLeader.db), []);

    // 2d. Stale configurationKey or membershipGenerationIndex -> refused with CONFIGURATION_STALE.
    const staleConfigAttempt = await controlLeaderHandler.stagePermanentMemberLossRecovery({
      ...baseControlDecision,
      membershipGenerationIndex: baseControlDecision.membershipGenerationIndex + 5,
    });
    assert.equal(staleConfigAttempt.success, false);
    assert.equal(staleConfigAttempt.failureCode, RECOVERY_ERROR.CONFIGURATION_STALE);

    // 2e. 1-of-3 non-leader survivor cannot unilaterally authorize or commit recovery.
    const controlFollower = control.services.slice(1).find((service) =>
      service !== controlLeader);
    const followerAttempt = await controlFollower.stageMembershipRecoveryIntent(
      baseControlDecision,
    );
    assert.equal(followerAttempt.success, false);
    assert.equal(followerAttempt.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER);
    assert.deepEqual(readCommittedMembershipRecoveriesIn(controlLeader.db), []);

    // 2f. Stage valid old-quorum intent (Step 1): replay is idempotent, different payload conflicts,
    // and staging alone does not reopen ordinary SQL or PLACEMENT_ADMIT.
    const stagedControl = await controlLeaderHandler.stagePermanentMemberLossRecovery(
      baseControlDecision,
    );
    assert.equal(stagedControl.success, true, JSON.stringify(stagedControl));
    assert.equal(stagedControl.recovery.decisionId, baseControlDecision.decisionId);

    const replayedControl = await controlLeaderHandler.stagePermanentMemberLossRecovery(
      baseControlDecision,
    );
    assert.equal(replayedControl.success, true);
    assert.equal(replayedControl.replayed, true);
    assert.deepEqual(replayedControl.recovery, stagedControl.recovery);

    const conflictingControl = await controlLeaderHandler.stagePermanentMemberLossRecovery({
      ...baseControlDecision,
      targetReplicaId: 'sql_transactions-p1-r99',
      targetPeerId: deriveCanonicalPeerIdString('sql_transactions-p1-r99'),
    });
    assert.equal(conflictingControl.success, false);
    assert.equal(conflictingControl.failureCode, RECOVERY_ERROR.INTENT_CONFLICT);

    const pausedAfterStage = await requestPlacementAdmission(ledgerLeader, {
      entryId: 'replace-after-stage-only',
      body: placementStatement({
        partitionId: control.services[0].partitionId,
        placementClass: classifyPlacementClass(control.services[0].partitionId),
        type: OperationType.REPLACE,
        source: NODE.B,
        target: NODE.D,
        sourceReplicaId: control.services[0].replicaId,
      }),
    });
    assert.equal(pausedAfterStage.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED);

    // Register replacement target node handler NODE.D.
    const replacementHandler = new ReplicaHandler({
      nodeId: NODE.D,
      ownerIncarnation: 1,
      systemTableCache: controlLeader.systemTableCache,
      messageRouter: transport,
      timeSource: new VirtualTimeSource({startMs: 1000}),
      dataDir: path.dirname(control.dbFileOf([control.services[0].replicaId, NODE.A])),
      createPartitionService: (options) => new PartitionService(options),
      cdcIntegrationService: {
        sqlQueryEngine: {
          queryExecutor: {
            bootstrapTopologySnapshotOwner: {
              resolveCanonicalPartitionLeaderNodeId: () => leaderOf(control)?.nodeId,
            },
          },
        },
      },
    });
    handlers.set(NODE.D, replacementHandler);
    replacementHandler.registerWithRouter(transport);

    // 2g. Target below requiredAppliedBoundary -> refused with TARGET_CATCHUP_INCOMPLETE,
    // leaving the lost voter still in committed voters.
    const behindBoundaryAttempt =
      await controlLeaderHandler.executePermanentMemberLossRecovery({
        ...baseControlDecision,
        requiredAppliedBoundary: 999_999,
        failFastOnCatchUpBehind: true,
        deadlineAtMs: controlLeaderHandler.timeSource.now() + budgetMs,
      });
    assert.equal(behindBoundaryAttempt.success, false);
    assert.equal(
      behindBoundaryAttempt.failureCode,
      RECOVERY_ERROR.TARGET_CATCHUP_INCOMPLETE,
    );
    const membershipAfterRefusedPromote = await readPartitionReplicaMembership(
      controlLeader,
      control.services[0].replicaId,
    );
    assert.equal(membershipAfterRefusedPromote.state, 'voter');

    // Discriminator 1 (Positive native RF3 loss recovery across all 3 groups):
    for (const group of groups) {
      const leader = leaderOf(group);
      const handler = handlers.get(leader.nodeId);
      const decision = group === control ?
        baseControlDecision :
        await buildGroupRecoveryDecision(group);
      const recovered = await handler.executePermanentMemberLossRecovery({
        ...decision,
        deadlineAtMs: handler.timeSource.now() + budgetMs,
      });
      assert.equal(recovered.success, true, JSON.stringify(recovered));
      assert.equal(recovered.outcome, RECOVERY_OUTCOME.COMMITTED);
      assert.equal(recovered.stage, RECOVERY_STAGE.SOURCE_RETIRED);
      const replacementService = replacementHandler.getTrackedService(
        decision.targetReplicaId,
      );
      assert.ok(replacementService, `expected replacement service ${decision.targetReplicaId}`);
      if (!group.services.includes(replacementService)) {
        group.services.push(replacementService);
      }
      const liveCohort = group.services.slice(1);
      assert.equal(liveCohort.length, 3);
      assert.ok(await group.waitFor(async () => {
        const currentLeader = leaderOf(group);
        if (!currentLeader) return false;
        const observations = await Promise.all(liveCohort.map((member) =>
          readPartitionReplicaMembership(member, group.services[0].replicaId)));
        return observations.every((obs) =>
          obs.gateOpen === true &&
          obs.state === 'absent' &&
          obs.voterReplicaIds.length === 3 &&
          obs.voterReplicaIds.includes(decision.targetReplicaId) &&
          !obs.voterReplicaIds.includes(group.services[0].replicaId) &&
          obs.votersOutgoingReplicaIds.length === 0);
      }), `old voter excluded and replacement voter active for ${leader.partitionId}`);
    }

    // Current-cohort release now succeeds across control, schemaGroup, and ledger.
    for (const group of groups) {
      const released = await release(group);
      assert.equal(released.outcome, OUTCOME.CUT_OVER, JSON.stringify(released));
      assert.equal(released.census.length, 3);
    }

    // Discriminator 2 (Returning-source fence after restart):
    const restartedSource = await control.reopen(0);
    const fencedAdmission = await restartedSource.requestReplicaAdmission(
      'rejoin-retired-founder',
    );
    assert.equal(fencedAdmission.state, 'refused');
    assert.equal(
      fencedAdmission.failureCode,
      RECOVERY_ERROR.RETIRED_MEMBER_FENCED,
    );
    const delayedWrite = await restartedSource.applyWrite({
      type: OP.INSERT,
      entryId: 'delayed-retired-founder-write',
      sql: 'INSERT INTO sql_transactions (transaction_id, session_id, ' +
        'transaction_epoch, status, participant_set_state, participant_set_text, ' +
        'commit_mode, frozen_participant_count, timeout_deadline, transaction_mode) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        'f'.repeat(32),
        'retired-session',
        1,
        'ACTIVE',
        'OPEN',
        '[]',
        'NOT_SELECTED',
        0,
        9000,
        'EXPLICIT',
      ],
    });
    assert.equal(delayedWrite.success, false);
    assert.equal(
      delayedWrite.failureCode,
      RECOVERY_ERROR.RETIRED_MEMBER_FENCED,
    );
    for (const member of control.services.slice(1)) {
      const count = member.db.prepare(
        'SELECT count(*) AS n FROM sql_transactions WHERE transaction_id = ?',
      ).get('f'.repeat(32)).n;
      assert.equal(count, 0, 'retired source write must not cross the fence');
    }
  });

function createMutableSystemTableCache(initialServices = [], initialNodes = []) {
  const services = new Map(initialServices.map((row) => [row.service_id, {...row}]));
  const nodesMap = new Map(initialNodes.map((row) => [row.node_id, {...row}]));
  return {
    services,
    nodes: nodesMap,
    get(table, id) {
      if (table === 'services') return services.get(id) ?? null;
      if (table === 'nodes') return nodesMap.get(id) ?? null;
      return null;
    },
    getAll(table) {
      if (table === 'services') return [...services.values()];
      if (table === 'nodes') return [...nodesMap.values()];
      return [];
    },
    filter(table, predicate) {
      return this.getAll(table).filter(predicate);
    },
    applySystemTableChange(table, op, row) {
      if (table === 'services' && row?.service_id) {
        if (op === 'DELETE') {
          services.delete(row.service_id);
        } else {
          services.set(row.service_id, {...(services.get(row.service_id) || {}), ...row});
        }
      }
      if (table === 'nodes' && row?.node_id) {
        if (op === 'DELETE') {
          nodesMap.delete(row.node_id);
        } else {
          nodesMap.set(row.node_id, {...(nodesMap.get(row.node_id) || {}), ...row});
        }
      }
    },
  };
}

test('committed recovery application is deterministic across divergent voter metadata caches, ' +
  'supersedes obsolete target boot incarnations, and reconstructs post-removal SERVICES ' +
  'publication after driving leader crash', {timeout: 120000}, async (t) => {
  const transport = createLoopbackTransport();
  const partitionId = SQL_TRANSACTIONS_SCHEMA.tableName + '-p1';
  const members = nodes.map((node, i) => [partitionId + '-r' + (i + 1), node]);
  const group = await formAdmittedGroup({
    partitionId,
    members,
    transport,
    budgetMs,
    tempPrefix: 'retirement-review-findings-',
    serviceOptions: {
      tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
      tableName: SQL_TRANSACTIONS_SCHEMA.tableName,
      schema: SQL_TRANSACTIONS_SCHEMA,
    },
  });
  const handlers = new Map();
  t.after(async () => {
    for (const handler of handlers.values()) {
      await handler.participantReleaseRecovery.shutdown();
      handler.unregisterFromRouter(transport);
    }
    await group.dispose();
  });

  // Deliberately configure each voter with a different SystemTableCache projection,
  // and do NOT call bindGroupMemberGenerations beforehand.
  const founderReplicaId = group.services[0].replicaId;
  const leaderCache = createMutableSystemTableCache(
    [
      {
        service_id: founderReplicaId,
        replica_id: founderReplicaId,
        partition_id: partitionId,
        node_id: NODE.A,
        created_at: 1000,
        status: 'active',
      },
      {
        service_id: group.services[1].replicaId,
        replica_id: group.services[1].replicaId,
        partition_id: partitionId,
        node_id: NODE.B,
        created_at: 1001,
        status: 'active',
      },
      {
        service_id: group.services[2].replicaId,
        replica_id: group.services[2].replicaId,
        partition_id: partitionId,
        node_id: NODE.C,
        created_at: 1002,
        status: 'active',
      },
    ],
    [
      {
        node_id: NODE.A,
        boot_incarnation: 1,
        status: 'failed',
        connection_state: 'disconnected',
        ready_lease_expires_at: null,
      },
      {
        node_id: NODE.B,
        boot_incarnation: 1,
        status: 'ready',
        connection_state: 'connected',
        ready_lease_expires_at: 999999,
      },
      {
        node_id: NODE.C,
        boot_incarnation: 1,
        status: 'ready',
        connection_state: 'connected',
        ready_lease_expires_at: 999999,
      },
      {
        node_id: NODE.D,
        boot_incarnation: 1,
        status: 'ready',
        connection_state: 'connected',
        ready_lease_expires_at: 999999,
      },
    ],
  );
  // Divergent cache: missing founder SERVICES row at first, and conflicting NODES boot_incarnation = 77.
  const divergentCache = createMutableSystemTableCache(
    [],
    [
      {
        node_id: NODE.A,
        boot_incarnation: 77,
        status: 'failed',
        connection_state: 'disconnected',
        ready_lease_expires_at: null,
      },
    ],
  );

  // Stop NODE.A founder and elect a surviving leader on {NODE.B, NODE.C}.
  await group.services[0].shutdown();
  assert.ok(await group.waitFor(() => Boolean(leaderOf(group))),
    'surviving voters elect a leader');
  const firstLeader = leaderOf(group);
  const firstFollower = group.services.slice(1).find((s) => s !== firstLeader);
  firstLeader.systemTableCache = leaderCache;
  firstFollower.systemTableCache = divergentCache;

  for (const service of [firstLeader, firstFollower]) {
    const handler = new ReplicaHandler({
      nodeId: service.nodeId,
      ownerIncarnation: 1,
      systemTableCache: service.systemTableCache,
      messageRouter: transport,
      timeSource: new VirtualTimeSource({startMs: 1000}),
      dataDir: path.dirname(group.dbFileOf([service.replicaId, service.nodeId])),
      createPartitionService: (options) => new PartitionService(options),
      cdcIntegrationService: {
        sqlQueryEngine: {
          queryExecutor: {
            bootstrapTopologySnapshotOwner: {
              resolveCanonicalPartitionLeaderNodeId: () => leaderOf(group)?.nodeId,
            },
          },
        },
      },
    });
    handlers.set(service.nodeId, handler);
    handler.registerWithRouter(transport);
    handler.localServices.set(service.replicaId, service);
  }

  // Finding 1 Witness: commit recovery intent for boot-1 NODE.D while follower has a divergent cache.
  const boot1Decision = await buildGroupRecoveryDecision(group, {
    targetReplicaId: `${partitionId}-r4-boot1`,
    targetNodeId: NODE.D,
    targetNodeBootIncarnation: 1,
    decisionId: `recover-${partitionId}-boot1`,
  });
  const stagedBoot1 = await handlers.get(firstLeader.nodeId)
    .stagePermanentMemberLossRecovery(boot1Decision);
  assert.equal(stagedBoot1.success, true, JSON.stringify(stagedBoot1));
  assert.equal(stagedBoot1.recovery.decisionId, boot1Decision.decisionId);

  assert.ok(await group.waitFor(() =>
    readCommittedMembershipRecoveriesIn(firstFollower.db).length === 1),
  'follower with divergent SystemTableCache deterministically commits the same recovery intent');
  assert.deepEqual(
    readCommittedMembershipRecoveriesIn(firstFollower.db),
    readCommittedMembershipRecoveriesIn(firstLeader.db),
    'leader and divergent-cache follower must record identical committed recovery records',
  );

  // Even when the follower's local cache contradicts the durable binding (created_at=9999, boot=77),
  // durable binding remains authoritative across replay.
  divergentCache.applySystemTableChange('services', 'INSERT', {
    service_id: founderReplicaId,
    replica_id: founderReplicaId,
    partition_id: partitionId,
    node_id: NODE.A,
    created_at: 9999,
    status: 'failed',
  });
  const replayedOnLeader = await handlers.get(firstLeader.nodeId)
    .stagePermanentMemberLossRecovery(boot1Decision);
  assert.equal(replayedOnLeader.success, true);
  assert.equal(replayedOnLeader.replayed, true);

  // Finding 3 Witness: Target NODE.D restarts to ownerIncarnation = 2 BEFORE learner materialization.
  const targetHandlerBoot2 = new ReplicaHandler({
    nodeId: NODE.D,
    ownerIncarnation: 2,
    systemTableCache: leaderCache,
    messageRouter: transport,
    timeSource: new VirtualTimeSource({startMs: 2000}),
    dataDir: path.dirname(group.dbFileOf([founderReplicaId, NODE.A])),
    createPartitionService: (options) => new PartitionService(options),
    cdcIntegrationService: {
      sqlQueryEngine: {
        queryExecutor: {
          bootstrapTopologySnapshotOwner: {
            resolveCanonicalPartitionLeaderNodeId: () => leaderOf(group)?.nodeId,
          },
        },
      },
    },
  });
  handlers.set(NODE.D, targetHandlerBoot2);
  targetHandlerBoot2.registerWithRouter(transport);

  // Finding 4 Witness setup: Leader 1's metadata gateway fails SERVICES publication so that
  // after Raft source removal commits, Leader 1 crashes before SERVICES rows are published.
  let leader1GatewayAttempted = 0;
  handlers.get(firstLeader.nodeId).controlPlaneSystemTableGateway = {
    async submitMutation() {
      leader1GatewayAttempted += 1;
      return {success: false};
    },
    async updateSystemTableRow() {
      return {success: false};
    },
    async deleteSystemTableRow() {
      return {success: false};
    },
  };

  const supersededRecovery = await handlers.get(firstLeader.nodeId)
    .executePermanentMemberLossRecovery({
      ...boot1Decision,
      deadlineAtMs: handlers.get(firstLeader.nodeId).timeSource.now() + budgetMs,
    });
  assert.equal(supersededRecovery.success, true, JSON.stringify(supersededRecovery));
  assert.notEqual(
    supersededRecovery.decisionId,
    boot1Decision.decisionId,
    'obsolete target boot-1 intent must be superseded by a new committed decisionId',
  );
  assert.equal(
    supersededRecovery.recovery.targetNodeBootIncarnation,
    2,
    'superseding committed recovery decision must bind targetNodeBootIncarnation = 2',
  );
  const replacementService = targetHandlerBoot2.getTrackedService(
    supersededRecovery.recovery.targetReplicaId,
  );
  assert.ok(replacementService, 'replacement learner must materialize and promote under boot 2');
  group.services.push(replacementService);

  const allRecoveriesOnFollower = readCommittedMembershipRecoveriesIn(firstFollower.db);
  assert.equal(
    allRecoveriesOnFollower.length,
    2,
    'both original boot-1 and superseding boot-2 decisions are durably recorded in log order',
  );
  assert.equal(
    allRecoveriesOnFollower[1].decisionId,
    supersededRecovery.decisionId,
  );

  // Wait for Leader 1's failed gateway attempt, then crash/stop Leader 1 before SERVICES publication settles.
  assert.ok(await group.waitFor(() => leader1GatewayAttempted > 0),
    'driving leader attempted SERVICES publication before crashing');
  assert.equal(
    firstLeader.lastCompletedMembershipRecoveryPersisted,
    false,
    'SERVICES publication did not complete on Leader 1 before crash',
  );

  const crashedLeaderHandler = handlers.get(firstLeader.nodeId);
  await crashedLeaderHandler.participantReleaseRecovery.shutdown();
  crashedLeaderHandler.unregisterFromRouter(transport);
  handlers.delete(firstLeader.nodeId);
  await firstLeader.shutdown();

  // Elect successor leader on the surviving cohort {firstFollower, replacementService}.
  assert.ok(await group.waitFor(() => {
    const next = leaderOf(group);
    return Boolean(next && next !== firstLeader);
  }), 'surviving cohort elects successor leader after driving leader crash');
  const successorLeader = leaderOf(group);
  const successorHandler = handlers.get(successorLeader.nodeId);
  assert.equal(
    successorLeader,
    firstFollower,
    'the follower with the divergent metadata cache is elected successor leader',
  );
  const replayedBoot1AfterElection = await successorHandler
    .stagePermanentMemberLossRecovery(boot1Decision);
  assert.equal(replayedBoot1AfterElection.success, true);
  assert.equal(replayedBoot1AfterElection.replayed, true);
  assert.deepEqual(
    replayedBoot1AfterElection.recovery,
    stagedBoot1.recovery,
    'post-election replay on divergent-cache voter returns the identical committed boot-1 record',
  );
  const replayedBoot2AfterElection = await successorHandler
    .stagePermanentMemberLossRecovery(supersededRecovery.recovery);
  assert.equal(replayedBoot2AfterElection.success, true);
  assert.equal(replayedBoot2AfterElection.replayed, true);
  assert.deepEqual(
    replayedBoot2AfterElection.recovery,
    supersededRecovery.recovery,
    'post-election replay on divergent-cache voter returns the identical committed boot-2 record',
  );

  const publishedMutations = [];
  const publishedDeletes = [];
  successorHandler.controlPlaneSystemTableGateway = {
    async submitMutation(mutation) {
      publishedMutations.push(mutation);
      return {success: true};
    },
    async updateSystemTableRow() {
      return {success: true};
    },
    async deleteSystemTableRow(tableName, where) {
      publishedDeletes.push({tableName, where});
      return {success: true};
    },
  };

  // Run autonomous permanent-loss recovery on successor leader: sourcePeerId is already removed
  // from Raft voters, so successor must reconstruct the completed transition from
  // _partition_membership_recovery and finish SERVICES publication.
  const postCrashAutonomous = await successorHandler
    .tryAutonomousPermanentMemberLossRecovery(successorLeader);
  assert.equal(
    postCrashAutonomous,
    null,
    'once completed recovery SERVICES publication settles on successor leader, no retry remains',
  );
  assert.ok(
    publishedMutations.some((m) =>
      m.tableName === 'services' &&
      m.row?.service_id === supersededRecovery.recovery.targetReplicaId &&
      m.row?.status === 'active'),
    'successor leader must reconstruct and publish the promoted replacement SERVICES row',
  );
  assert.ok(
    publishedDeletes.some((d) =>
      d.tableName === 'services' &&
      d.where?.service_id === founderReplicaId),
    'successor leader must reconstruct and delete the retired source SERVICES row',
  );
});
