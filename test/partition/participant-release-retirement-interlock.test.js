// Native control, schema and placement-ledger Raft groups. The fixture supplies
// committed ADD records for formation only. No retirement is planted.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {
  REPLICA_OPERATIONS_SCHEMA,
  SCHEMA_OPERATIONS_SCHEMA,
  SERVICES_SCHEMA,
  SQL_TRANSACTIONS_SCHEMA,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  registerRecoveryPublicationPartitionService,
} from '../../src/partition/partition-membership-recovery-store.js';
import {
  openParticipantTransactionStore,
} from '../../src/partition/partition-participant-transaction-store.js';
import {
  runCommittedPartitionStatement,
} from '../../src/partition/partition-statement-admission.js';
import {classifyPlacementClass} from '../../src/bootstrap/system-partition-classification.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {
  persistRecoveredServicesRowsAsync,
} from '../../src/node/replica-handler-membership-recovery-decision.js';
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
import {
  participantCutoverPauseOf,
  readParticipantReleaseFacts,
  resumeParticipantCutoverAdmission,
} from '../../src/partition/partition-participant-transaction-pause.js';
import {
  enableParticipantTransactionAdmission,
} from '../../src/partition/partition-participant-transaction-request.js';
import {
  releaseIdentityOf,
} from '../../src/partition/partition-participant-release-contract.js';
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
  'preserves materialized replica across lost reply, supersedes obsolete target boot before and ' +
  'after learner admission, and reconstructs ordinary-partition SERVICES publication via the ' +
  'registered recovery queue', {timeout: 120000}, async (t) => {
  const transport = createLoopbackTransport();
  // Use a non-priority partition id ('schema_operations-p2' is not in PRIORITY_RELEASE_PARTITION_SET)
  // to prove the per-partition recovery queue reconstructs completed SERVICES publication
  // without priority-partition special casing.
  const partitionId = SCHEMA_OPERATIONS_SCHEMA.tableName + '-p2';
  const members = nodes.map((node, i) => [partitionId + '-r' + (i + 1), node]);
  const group = await formAdmittedGroup({
    partitionId,
    members,
    transport,
    budgetMs,
    tempPrefix: 'retirement-review-findings-',
    serviceOptions: {
      tableId: SCHEMA_OPERATIONS_SCHEMA.tableName,
      tableName: SCHEMA_OPERATIONS_SCHEMA.tableName,
      schema: SCHEMA_OPERATIONS_SCHEMA,
    },
  });
  const handlers = new Map();
  t.after(async () => {
    for (const handler of handlers.values()) {
      await handler.participantReleaseRecovery.shutdown();
      for (const svc of handler.localServices.values()) {
        await svc.shutdown?.();
      }
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
        service_type: 'partition',
        address: group.addressOf(members[0]),
        created_at: 1000,
        status: 'active',
      },
      {
        service_id: group.services[1].replicaId,
        replica_id: group.services[1].replicaId,
        partition_id: partitionId,
        node_id: NODE.B,
        service_type: 'partition',
        address: group.addressOf(members[1]),
        created_at: 1001,
        status: 'active',
      },
      {
        service_id: group.services[2].replicaId,
        replica_id: group.services[2].replicaId,
        partition_id: partitionId,
        node_id: NODE.C,
        service_type: 'partition',
        address: group.addressOf(members[2]),
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
  // Divergent cache: missing founder SERVICES row at first, and conflicting NODES boot_incarnation = 77,
  // while retaining the surviving peers' transport addresses so Raft heartbeats remain routable.
  const divergentCache = createMutableSystemTableCache(
    [
      {
        service_id: group.services[1].replicaId,
        replica_id: group.services[1].replicaId,
        partition_id: partitionId,
        node_id: NODE.B,
        service_type: 'partition',
        address: group.addressOf(members[1]),
        created_at: 1001,
        status: 'active',
      },
      {
        service_id: group.services[2].replicaId,
        replica_id: group.services[2].replicaId,
        partition_id: partitionId,
        node_id: NODE.C,
        service_type: 'partition',
        address: group.addressOf(members[2]),
        created_at: 1002,
        status: 'active',
      },
    ],
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

  // Wrap transport.deliver to test:
  // (a) lost completion reply after real learner materialization on boot-2 NODE.D, and
  // (b) target NODE.D restart to boot-3 AFTER the boot-2 learner is admitted to committed Raft membership.
  const baseDeliver = transport.deliver.bind(transport);
  let dropFirstBoot2MaterializeReply = true;
  let boot2MaterializedReplicaId = null;
  transport.deliver = async (destination, payload, options) => {
    if (destination.startsWith(`${NODE.D}/`) &&
        payload?.type === 'MATERIALIZE_RECOVERY_LEARNER' &&
        payload?.targetNodeBootIncarnation === 2 &&
        dropFirstBoot2MaterializeReply) {
      dropFirstBoot2MaterializeReply = false;
      boot2MaterializedReplicaId = payload.targetReplicaId;
      // Execute real materialization on targetHandlerBoot2, then drop the reply.
      await baseDeliver(destination, payload, options);
      return {
        transport: {
          acknowledged: false,
          deliveryState: 'not_delivered',
          reasonCode: 'message_timeout',
        },
        answer: null,
      };
    }
    return baseDeliver(destination, payload, options);
  };

  // Attempt 1: Supersedes boot-1 -> commits boot-2 decision -> materializes boot-2 learner for real,
  // but its completion reply is lost.
  const lostReplyAttempt = await handlers.get(firstLeader.nodeId)
    .executePermanentMemberLossRecovery({
      ...boot1Decision,
      deadlineAtMs: handlers.get(firstLeader.nodeId).timeSource.now() + budgetMs,
    });
  assert.equal(lostReplyAttempt.success, false, 'lost materialization reply fails the first attempt');
  assert.ok(boot2MaterializedReplicaId, 'boot-2 learner was materialized before reply loss');
  const materializedBoot2Service = targetHandlerBoot2.getTrackedService(boot2MaterializedReplicaId);
  assert.ok(materializedBoot2Service, 'real boot-2 learner runtime is registered on target');
  assert.equal(
    targetHandlerBoot2.localServices.size,
    1,
    'exactly one learner runtime exists on target after lost reply',
  );
  const recoveriesAfterLostReply = readCommittedMembershipRecoveriesIn(firstLeader.db);
  assert.equal(recoveriesAfterLostReply.length, 2, 'boot-1 and boot-2 decisions committed');
  const boot2DecisionRecord = recoveriesAfterLostReply[1];
  assert.equal(boot2DecisionRecord.targetReplicaId, boot2MaterializedReplicaId);
  assert.equal(
    firstLeader.supersededRecoveryDecisionIds.has(boot2DecisionRecord.decisionId),
    false,
    'lost materialization reply must NOT mark boot-2 decision as superseded',
  );

  // Attempt 2: Retry must preserve boot-2 target identity (reusing materializedBoot2Service),
  // admit it as a committed Raft learner, and then stop at our observe timeout hook.
  const admitLearnerAttempt = await handlers.get(firstLeader.nodeId)
    .executePermanentMemberLossRecovery({
      ...boot2DecisionRecord,
      failFastOnCatchUpBehind: true,
      requiredAppliedBoundary: Number.MAX_SAFE_INTEGER,
      deadlineAtMs: handlers.get(firstLeader.nodeId).timeSource.now() + 500,
    });
  assert.equal(admitLearnerAttempt.success, false);
  assert.equal(
    targetHandlerBoot2.localServices.size,
    1,
    'retry after lost reply reused the existing boot-2 learner without allocating a second replica',
  );
  const membershipWithBoot2Learner = await readPartitionCommittedMembership(firstLeader);
  assert.ok(
    (membershipWithBoot2Learner.learners || [])
      .map(String)
      .includes(String(boot2DecisionRecord.targetPeerId)),
    'boot-2 target is now admitted in committed Raft membership.learners',
  );

  // Now simulate target NODE.D restarting to ownerIncarnation = 3 AFTER learner admission!
  // Do NOT manually shut down materializedBoot2Service in the test; transfer it into targetHandlerBoot3
  // (and also plant an abandoned superseded runtime on a DIFFERENT node NODE.C for boot-1's target)
  // so the recovery owner itself must durably reconstruct and close both superseded runtimes.
  await targetHandlerBoot2.participantReleaseRecovery.shutdown();
  targetHandlerBoot2.unregisterFromRouter(transport);
  const targetHandlerBoot3 = new ReplicaHandler({
    nodeId: NODE.D,
    ownerIncarnation: 3,
    systemTableCache: leaderCache,
    messageRouter: transport,
    timeSource: new VirtualTimeSource({startMs: 3000}),
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
  // Retain materializedBoot2Service in targetHandlerBoot3 so recovery must shut it down and remove it.
  targetHandlerBoot3.localServices.set(boot2MaterializedReplicaId, materializedBoot2Service);
  targetHandlerBoot3.setLocalReplica(boot2MaterializedReplicaId, {
    replicaId: boot2MaterializedReplicaId,
    partitionId,
    tableName: 'schema_operations',
    status: 'syncing',
    service: materializedBoot2Service,
  });
  handlers.set(NODE.D, targetHandlerBoot3);
  targetHandlerBoot3.registerWithRouter(transport);

  // Also test cross-node superseded-target cleanup: point boot-1's durable record at NODE.C,
  // clear the volatile settled-cleanup set to simulate durable reconstruction, and register
  // a live mock runtime for boot1Decision.targetReplicaId on NODE.C's handler.
  let crossNodeSupersededShutdownCount = 0;
  firstLeader.settledSupersededTargetReplicaIds?.clear?.();
  for (const member of [firstLeader, firstFollower]) {
    member.db.prepare(
      'UPDATE _partition_membership_recovery SET target_node_id = ? WHERE decision_id = ?',
    ).run(NODE.C, boot1Decision.decisionId);
  }
  handlers.get(NODE.C).localServices.set(boot1Decision.targetReplicaId, {
    replicaId: boot1Decision.targetReplicaId,
    partitionId,
    timeSource: new VirtualTimeSource({startMs: 3000}),
    isShutdown: false,
    async shutdown() {
      this.isShutdown = true;
      crossNodeSupersededShutdownCount += 1;
    },
  });

  // Step 3a: Leader discovers committed boot-2 learner's node is now at boot 3,
  // retires the obsolete committed boot-2 learner from Raft, commits superseding boot-3 decision,
  // materializes and admits boot-3 learner, and stops at the catch-up boundary hook.
  const admitBoot3LearnerAttempt = await handlers.get(firstLeader.nodeId)
    .executePermanentMemberLossRecovery({
      ...boot2DecisionRecord,
      failFastOnCatchUpBehind: true,
      requiredAppliedBoundary: Number.MAX_SAFE_INTEGER,
      deadlineAtMs: handlers.get(firstLeader.nodeId).timeSource.now() + budgetMs,
    });
  assert.equal(admitBoot3LearnerAttempt.success, false);
  const recoveriesAfterBoot3Admit = readCommittedMembershipRecoveriesIn(firstLeader.db);
  assert.equal(recoveriesAfterBoot3Admit.length, 3, 'boot-1, boot-2, and boot-3 decisions committed');
  const boot3DecisionRecord = recoveriesAfterBoot3Admit[2];
  assert.equal(boot3DecisionRecord.targetNodeBootIncarnation, 3);
  assert.equal(
    materializedBoot2Service.isShutdown,
    true,
    'recovery owner durably reconstructed and shut down superseded boot-2 learner runtime',
  );
  assert.equal(
    targetHandlerBoot3.getTrackedService(boot2MaterializedReplicaId),
    null,
    'superseded boot-2 runtime removed from target handler registry',
  );
  assert.equal(
    crossNodeSupersededShutdownCount,
    1,
    'recovery owner sent superseded-target cleanup to the old target node (NODE.C) across target-node change',
  );
  assert.equal(
    handlers.get(NODE.C).getTrackedService(boot1Decision.targetReplicaId),
    null,
    'cross-node superseded target removed from NODE.C registry',
  );
  for (const member of [firstLeader, firstFollower]) {
    member.db.prepare(
      'UPDATE _partition_membership_recovery SET target_node_id = ? WHERE decision_id = ?',
    ).run(boot1Decision.targetNodeId, boot1Decision.decisionId);
  }

  // Step 3b (P2 #1 Witness): Simulate a leader whose volatile targetNodeBoots map is empty and whose
  // NODES cache has a STALE boot_incarnation = 1 (even with status = 'failed') for NODE.D while
  // the committed recovery record and healthy admitted learner on NODE.D are at boot 3!
  firstLeader.targetNodeBoots?.clear?.();
  firstLeader.settledSupersededTargetReplicaIds?.clear?.();
  leaderCache.applySystemTableChange('nodes', 'INSERT', {
    node_id: NODE.D,
    boot_incarnation: 1,
    status: 'failed',
    connection_state: 'disconnected',
    ready_lease_expires_at: null,
  });
  const supersededRecovery = await handlers.get(firstLeader.nodeId)
    .executePermanentMemberLossRecovery({
      ...boot3DecisionRecord,
      supersededTargetReplicaId: null,
      deadlineAtMs: handlers.get(firstLeader.nodeId).timeSource.now() + budgetMs,
    });
  assert.equal(supersededRecovery.success, true, JSON.stringify(supersededRecovery));
  assert.equal(
    supersededRecovery.decisionId,
    boot3DecisionRecord.decisionId,
    'stale boot-1 NODES row must NOT supersede or retire a healthy boot-3 committed learner',
  );
  assert.equal(
    firstLeader.targetNodeBoots.get(NODE.D),
    3,
    'successful MATERIALIZE response refreshes leader targetNodeBoots to 3',
  );
  leaderCache.applySystemTableChange('nodes', 'INSERT', {
    node_id: NODE.D,
    boot_incarnation: 3,
    status: 'ready',
    connection_state: 'connected',
    ready_lease_expires_at: 999999,
  });
  assert.equal(
    targetHandlerBoot3.localServices.size,
    1,
    'exactly one target runtime exists on boot-3 target handler',
  );
  const replacementService = targetHandlerBoot3.getTrackedService(
    supersededRecovery.recovery.targetReplicaId,
  );
  assert.ok(replacementService, 'replacement learner must materialize and promote under boot 3');
  group.services.push(replacementService);

  const allRecoveriesOnFollower = readCommittedMembershipRecoveriesIn(firstFollower.db);
  assert.equal(
    allRecoveriesOnFollower.length,
    3,
    'boot-1, boot-2, and boot-3 decisions are durably recorded in log order',
  );
  assert.equal(
    allRecoveriesOnFollower[2].decisionId,
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

  // Elect the divergent-cache follower as successor leader on the surviving cohort {firstFollower, replacementService}.
  assert.ok(await group.waitFor(async () => {
    if (leaderOf(group) === firstFollower) return true;
    await firstFollower.raft.campaign();
    return leaderOf(group) === firstFollower;
  }), 'surviving cohort elects divergent-cache follower as successor leader after driving leader crash');
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
  const servicesDb = new Database(':memory:');
  t.after(async () => {
    await targetHandlerBoot2.shutdown?.();
    await targetHandlerBoot3.shutdown?.();
    await crashedLeaderHandler.shutdown?.();
    for (const h of handlers.values()) {
      await h.shutdown?.();
    }
    servicesDb.close();
  });
  servicesDb.exec(`
    CREATE TABLE services (
      service_id TEXT PRIMARY KEY,
      replica_id TEXT,
      partition_id TEXT,
      service_type TEXT NOT NULL,
      node_id TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL,
      raft_role TEXT,
      created_at INTEGER NOT NULL,
      state_entered_at INTEGER,
      updated_at INTEGER
    )
  `);
  openParticipantTransactionStore(servicesDb);
  const servicesPartition = {
    partitionId: 'services-p1',
    tableName: 'services',
    schema: SERVICES_SCHEMA,
    db: servicesDb,
    systemTableCache: divergentCache,
    logger: successorLeader.logger,
  };
  registerRecoveryPublicationPartitionService(servicesPartition, divergentCache);
  registerRecoveryPublicationPartitionService(successorLeader, divergentCache);
  for (const existingRow of divergentCache.getAll('services')) {
    servicesDb.prepare(
      `INSERT OR REPLACE INTO services (
        service_id, replica_id, partition_id, service_type, node_id, address,
        status, raft_role, created_at, state_entered_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      existingRow.service_id,
      existingRow.replica_id ?? existingRow.service_id,
      existingRow.partition_id ?? partitionId,
      existingRow.service_type ?? 'partition',
      existingRow.node_id ?? NODE.A,
      existingRow.address ?? `${existingRow.node_id ?? NODE.A}/partition/${existingRow.service_id}`,
      existingRow.status ?? 'active',
      existingRow.raft_role ?? 'follower',
      Number(existingRow.created_at) || 1000,
      Number(existingRow.state_entered_at ?? existingRow.created_at) || 1000,
      Number(existingRow.updated_at ?? existingRow.created_at) || 1000,
    );
  }
  const executeAuthoritativeServicesSql = (sql, params) =>
    runCommittedPartitionStatement(servicesPartition, {
      type: OP.EXECUTE_STATEMENT,
      sql,
      params,
    });
  successorHandler.controlPlaneSystemTableGateway = {
    async submitMutation(mutation) {
      publishedMutations.push(mutation);
      if (mutation.tableName === 'services' && mutation.row) {
        const row = mutation.row;
        try {
          const outcome = executeAuthoritativeServicesSql(
            `INSERT OR IGNORE INTO services (
              service_id, replica_id, partition_id, service_type, node_id, address,
              status, raft_role, created_at, state_entered_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.service_id,
              row.replica_id ?? row.service_id,
              row.partition_id ?? partitionId,
              row.service_type ?? 'partition',
              row.node_id,
              row.address,
              row.status ?? 'active',
              row.raft_role ?? 'follower',
              Number(row.created_at) || 1000,
              Number(row.state_entered_at ?? row.created_at) || 1000,
              Number(row.updated_at ?? row.created_at) || 1000,
            ],
          );
          for (const appliedRow of outcome.affectedRows ?? []) {
            divergentCache.applySystemTableChange('services', 'INSERT', appliedRow);
          }
        } catch (error) {
          if (error?.refusalLayer === 'excluded_recovery_service_replica') {
            return {
              success: false,
              failureCode: error.code,
              refusalLayer: error.refusalLayer,
            };
          }
          throw error;
        }
      }
      return {success: true};
    },
    async updateSystemTableRow(tableName, where, updates) {
      if (tableName === 'services' && where?.service_id) {
        try {
          const outcome = executeAuthoritativeServicesSql(
            `UPDATE services
                SET status = COALESCE(?, status),
                    raft_role = COALESCE(?, raft_role),
                    updated_at = COALESCE(?, updated_at)
              WHERE service_id = ?`,
            [
              updates?.status ?? null,
              updates?.raft_role ?? null,
              updates?.updated_at ?? null,
              where.service_id,
            ],
          );
          for (const appliedRow of outcome.affectedRows ?? []) {
            divergentCache.applySystemTableChange('services', 'UPDATE', appliedRow);
          }
        } catch (error) {
          if (error?.refusalLayer === 'excluded_recovery_service_replica') {
            return {
              success: false,
              failureCode: error.code,
              refusalLayer: error.refusalLayer,
            };
          }
          throw error;
        }
      }
      return {success: true};
    },
    async deleteSystemTableRow(tableName, where) {
      publishedDeletes.push({tableName, where});
      if (tableName === 'services' && where?.service_id) {
        executeAuthoritativeServicesSql(
          'DELETE FROM services WHERE service_id = ?',
          [where.service_id],
        );
        divergentCache.applySystemTableChange('services', 'DELETE', {
          service_id: where.service_id,
        });
      }
      return {success: true};
    },
  };

  // Step 3-5 of Finding 2 schedule: the crashed driving leader restarts (losing its volatile
  // lastCompletedMembershipRecovery) and rejoins before census, so all 3 current voters answer
  // and participant cutover succeeds on the ordinary partition.
  const firstLeaderIndex = group.services.indexOf(firstLeader);
  const reopenedFirstLeader = await group.reopen(firstLeaderIndex);
  t.after(() => reopenedFirstLeader.shutdown());
  assert.equal(reopenedFirstLeader.lastCompletedMembershipRecovery ?? null, null);
  crashedLeaderHandler.localServices.set(reopenedFirstLeader.replicaId, reopenedFirstLeader);
  crashedLeaderHandler.registerWithRouter(transport);
  handlers.set(reopenedFirstLeader.nodeId, crashedLeaderHandler);
  const activeVoters = [reopenedFirstLeader, successorLeader, replacementService];
  const originEnabled = await enableParticipantTransactionAdmission(successorLeader);
  assert.equal(originEnabled.success, true, JSON.stringify(originEnabled));
  let resumed = null;
  assert.ok(await group.waitFor(async () => {
    const census = await Promise.all(
      activeVoters.map((v) => readParticipantReleaseFacts(handlers.get(v.nodeId), v)),
    );
    const leaderFacts = census.find((f) => f.generation?.replicaId === successorLeader.replicaId);
    if (!leaderFacts?.membership || !leaderFacts?.buildDigest) return false;
    const release = releaseIdentityOf({
      partitionId: successorLeader.partitionId,
      targetBuildDigest: leaderFacts.buildDigest,
      configurationKey: leaderFacts.membership.configurationKey,
      membershipGenerationIndex: leaderFacts.membership.membershipGenerationIndex,
    });
    if (!release) return false;
    resumed = await resumeParticipantCutoverAdmission(
      successorHandler,
      successorLeader,
      {release, census},
    );
    return resumed === 'resumed';
  }), 'restarted former leader rejoins, origin replicates across all 3 voters, and participant cutover resumes');
  assert.equal(resumed, 'resumed');
  assert.equal(
    participantCutoverPauseOf(successorLeader),
    null,
    'ordinary partition is now unpaused after participant cutover succeeds',
  );
  successorLeader.lastCompletedMembershipRecovery = null;
  successorLeader.lastCompletedMembershipRecoveryPersisted = false;
  for (const liveNodeId of [NODE.B, NODE.C, NODE.D]) {
    divergentCache.applySystemTableChange('nodes', 'INSERT', {
      node_id: liveNodeId,
      boot_incarnation: liveNodeId === NODE.D ? 3 : 1,
      status: 'ready',
      connection_state: 'connected',
      ready_lease_expires_at: 999999,
    });
  }

  // Enter through the normal registered per-partition recovery queue (wake -> dispatch -> reconcile)
  // on this ordinary non-priority partition rather than calling tryAutonomousPermanentMemberLossRecovery directly.
  successorHandler.participantReleaseRecovery.wake(partitionId, 0);
  assert.ok(
    await group.waitFor(() => {
      successorHandler.timeSource.advance(10);
      return publishedMutations.some((m) =>
        m.tableName === 'services' &&
        m.row?.service_id === supersededRecovery.recovery.targetReplicaId &&
        m.row?.status === 'active') &&
      publishedDeletes.some((d) =>
        d.tableName === 'services' &&
        d.where?.service_id === founderReplicaId);
    }),
    'registered per-partition recovery queue must reconstruct and publish SERVICES upsert + delete on an unpaused ordinary partition',
  );
  assert.equal(
    divergentCache.get('services', supersededRecovery.recovery.targetReplicaId)?.status,
    'active',
    'replacement voter SERVICES row is active in metadata projection',
  );
  assert.equal(
    divergentCache.get('services', founderReplicaId),
    null,
    'retired source SERVICES row is deleted from metadata projection',
  );

  // P1 #1 Witness: A stale MATERIALIZE_RECOVERY_LEARNER request (with an older targetNodeBootIncarnation)
  // arriving at targetHandlerBoot3 must be refused with SOURCE_GENERATION_MISMATCH WITHOUT shutting down
  // or removing the live promoted voter runtime (replacementService).
  const staleMaterializeReply = await targetHandlerBoot3.handleMaterializeRecoveryLearner({
    type: 'MATERIALIZE_RECOVERY_LEARNER',
    partitionId,
    targetNodeId: NODE.D,
    targetReplicaId: supersededRecovery.recovery.targetReplicaId,
    targetNodeBootIncarnation: 1,
    targetReplicaCreatedAt: supersededRecovery.recovery.targetReplicaCreatedAt,
    supersededTargetReplicaId: supersededRecovery.recovery.targetReplicaId,
  });
  assert.equal(staleMaterializeReply.status, 'error');
  assert.equal(staleMaterializeReply.failureCode, RECOVERY_ERROR.SOURCE_GENERATION_MISMATCH);
  assert.equal(
    replacementService.isShutdown,
    false,
    'stale MATERIALIZE_RECOVERY_LEARNER request must NOT shut down a live voter runtime',
  );
  assert.equal(
    targetHandlerBoot3.getTrackedService(supersededRecovery.recovery.targetReplicaId),
    replacementService,
    'live voter runtime remains tracked after stale materialization refusal',
  );

  // P2 #2 & Finding #3 Witness (Effect fence across leader loss and old-publisher failure):
  // (a) Fail-closed when leaderService authority is unavailable before write:
  const mutationsBeforeClosed = publishedMutations.length;
  const closedPublished = await persistRecoveredServicesRowsAsync(
    successorHandler,
    supersededRecovery.recovery,
    null,
    {isShutdown: true},
  );
  assert.equal(closedPublished, false, 'unavailable authority must fail closed and retain publication debt');
  assert.equal(publishedMutations.length, mutationsBeforeClosed, 'unavailable authority submits no mutations');

  // (b) P2 #2 Witness: Losing publication authority (election / step-down) AFTER a successful
  // INSERT/UPDATE while the target is still a valid voter must NOT delete the valid SERVICES row:
  let stepDownAfterInsert = false;
  const realReadStatus = successorLeader.raft.readStatus.bind(successorLeader.raft);
  const baseSubmitForStepDown = successorHandler.controlPlaneSystemTableGateway.submitMutation;
  successorHandler.controlPlaneSystemTableGateway.submitMutation = async (mutation) => {
    const res = await baseSubmitForStepDown(mutation);
    if (mutation.tableName === 'services' &&
        mutation.row?.service_id === supersededRecovery.recovery.targetReplicaId) {
      stepDownAfterInsert = true;
    }
    return res;
  };
  const stepDownLeaderView = Object.create(successorLeader);
  stepDownLeaderView.raft = {
    ...successorLeader.raft,
    readStatus: () => {
      const s = realReadStatus();
      return stepDownAfterInsert ? {...s, role: 'follower'} : s;
    },
  };
  const deletesBeforeStepDown = publishedDeletes.filter(
    (d) => d.where?.service_id === supersededRecovery.recovery.targetReplicaId,
  ).length;
  const stepDownPublished = await persistRecoveredServicesRowsAsync(
    successorHandler,
    supersededRecovery.recovery,
    null,
    stepDownLeaderView,
  );
  successorHandler.controlPlaneSystemTableGateway.submitMutation = baseSubmitForStepDown;
  assert.equal(
    stepDownPublished,
    false,
    'step-down during publication returns false so debt remains unconfirmed',
  );
  assert.equal(
    publishedDeletes.filter(
      (d) => d.where?.service_id === supersededRecovery.recovery.targetReplicaId,
    ).length,
    deletesBeforeStepDown,
    'losing leadership after INSERT must NOT delete a valid voter SERVICES row',
  );
  assert.equal(
    divergentCache.get('services', supersededRecovery.recovery.targetReplicaId)?.status,
    'active',
    'replacement voter SERVICES row remains active after publisher loses leadership',
  );

  // (c) Finding #3 Witness: An OLD publisher (crashedLeaderHandler) starts publishing R1 (A -> D),
  // its INSERT for D is delayed in flight, and while delayed:
  //   1) the old publisher fails before compensation (crashedLeaderHandler.shuttingDown = true,
  //      reopenedFirstLeader shuts down), and
  //   2) the new leader (successorHandler / successorLeader) commits and publishes a later
  //      recovery R2 (D -> E) retiring D.
  // When the old publisher's delayed INSERT for D finally executes, the shared recovery publication
  // fence must block D from landing in SERVICES even though the old publisher failed before compensation.
  let releaseDelayedInsert = null;
  const delayedInsertGate = new Promise((resolve) => {
    releaseDelayedInsert = resolve;
  });
  crashedLeaderHandler.controlPlaneSystemTableGateway = {
    async submitMutation(mutation) {
      if (mutation.tableName === 'services' &&
          mutation.row?.service_id === supersededRecovery.recovery.targetReplicaId) {
        await delayedInsertGate;
      }
      return baseSubmitForStepDown(mutation);
    },
    async updateSystemTableRow(tableName, where, updates) {
      return successorHandler.controlPlaneSystemTableGateway
        .updateSystemTableRow(tableName, where, updates);
    },
    async deleteSystemTableRow(tableName, where) {
      return successorHandler.controlPlaneSystemTableGateway
        .deleteSystemTableRow(tableName, where);
    },
  };
  const fakeOldLeaderView = Object.create(reopenedFirstLeader);
  fakeOldLeaderView.raft = {
    readStatus: () => ({...realReadStatus(), role: 'leader'}),
    readCommittedMembership: (...args) => successorLeader.raft.readCommittedMembership(...args),
  };
  const inFlightOldPublish = persistRecoveredServicesRowsAsync(
    crashedLeaderHandler,
    supersededRecovery.recovery,
    null,
    fakeOldLeaderView,
  );
  // Wait a tick so inFlightOldPublish passes the pre-check and is suspended inside submitMutation(INSERT D).
  await new Promise((resolve) => setTimeout(resolve, 20));
  // Old publisher fails before compensation!
  await crashedLeaderHandler.shutdown();
  fakeOldLeaderView.isShutdown = true;
  // Meanwhile, New Leader (successorLeader / successorHandler) commits and publishes R2 (D -> E) retiring D!
  const r2Record = {
    decisionId: 'recover-d-to-e',
    entryId: 'recover-d-to-e',
    partitionId,
    configurationKey: supersededRecovery.recovery.configurationKey,
    membershipGenerationIndex: supersededRecovery.recovery.membershipGenerationIndex + 1,
    sourcePeerId: supersededRecovery.recovery.targetPeerId,
    sourceReplicaId: supersededRecovery.recovery.targetReplicaId,
    sourceReplicaCreatedAt: supersededRecovery.recovery.targetReplicaCreatedAt,
    sourceNodeId: supersededRecovery.recovery.targetNodeId,
    sourceNodeBootIncarnation: supersededRecovery.recovery.targetNodeBootIncarnation,
    targetPeerId: deriveCanonicalPeerIdString('replace-replica-e-final'),
    targetReplicaId: 'replace-replica-e-final',
    targetReplicaCreatedAt: 9000,
    targetNodeId: NODE.B,
    targetNodeBootIncarnation: 1,
    intentLogIndex: 999,
    intentTerm: 3,
  };
  successorLeader.db.prepare(
    `INSERT INTO _partition_membership_recovery (
      decision_id, entry_id, partition_id, configuration_key, membership_generation_index,
      source_peer_id, source_replica_id, source_replica_created_at, source_node_id, source_node_boot_incarnation,
      target_peer_id, target_replica_id, target_replica_created_at, target_node_id, target_node_boot_incarnation,
      intent_log_index, intent_term
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r2Record.decisionId, r2Record.entryId, r2Record.partitionId,
    r2Record.configurationKey, r2Record.membershipGenerationIndex,
    r2Record.sourcePeerId, r2Record.sourceReplicaId, r2Record.sourceReplicaCreatedAt,
    r2Record.sourceNodeId, r2Record.sourceNodeBootIncarnation,
    r2Record.targetPeerId, r2Record.targetReplicaId, r2Record.targetReplicaCreatedAt,
    r2Record.targetNodeId, r2Record.targetNodeBootIncarnation,
    r2Record.intentLogIndex, r2Record.intentTerm,
  );
  await persistRecoveredServicesRowsAsync(
    successorHandler,
    supersededRecovery.recovery,
    null,
    successorLeader,
  );
  const r2CommittedLeaderView = Object.create(successorLeader);
  r2CommittedLeaderView.raft = {
    ...successorLeader.raft,
    readStatus: () => ({...realReadStatus(), role: 'leader'}),
    readCommittedMembership: async () => ({
      kind: 'committed',
      voters: [
        deriveCanonicalPeerIdString(reopenedFirstLeader.replicaId),
        deriveCanonicalPeerIdString(successorLeader.replicaId),
        r2Record.targetPeerId,
      ],
      learners: [],
    }),
  };
  await persistRecoveredServicesRowsAsync(
    successorHandler,
    r2Record,
    null,
    r2CommittedLeaderView,
  );
  assert.equal(
    servicesDb
      .prepare('SELECT * FROM services WHERE service_id = ?')
      .get(supersededRecovery.recovery.targetReplicaId),
    undefined,
    'new leader R2 publication deletes retired D from authoritative SQLite SERVICES table',
  );
  assert.equal(
    divergentCache.get('services', supersededRecovery.recovery.targetReplicaId),
    null,
    'new leader reconciliation after R2 deletes retired D from SERVICES cache projection',
  );
  // Now release the crashed old leader's delayed INSERT for D!
  releaseDelayedInsert();
  await inFlightOldPublish;
  assert.equal(
    divergentCache.recoveryServiceCacheFenceInstalled,
    undefined,
    'systemTableCache must not install a cache-hiding filter on applySystemTableChange',
  );
  assert.equal(
    servicesDb
      .prepare('SELECT * FROM services WHERE service_id = ?')
      .get(supersededRecovery.recovery.targetReplicaId),
    undefined,
    'authoritative SQLite SERVICES boundary must reject the delayed INSERT for retired D',
  );
  assert.equal(
    servicesDb
      .prepare('SELECT * FROM services WHERE service_id = ?')
      .get(r2Record.targetReplicaId)?.status,
    'active',
    'successor replacement voter E remains active in authoritative SQLite SERVICES',
  );
  const independentObserverCache = new SystemTableCache();
  for (const authoritativeRow of servicesDb.prepare('SELECT * FROM services').all()) {
    independentObserverCache.applySystemTableChange('services', 'INSERT', authoritativeRow);
  }
  assert.equal(
    independentObserverCache.get('services', supersededRecovery.recovery.targetReplicaId) ?? null,
    null,
    'independent observer hydrated from authoritative SQLite SERVICES must not see retired D',
  );
  assert.equal(
    independentObserverCache.get('services', r2Record.targetReplicaId)?.status,
    'active',
    'independent observer hydrated from authoritative SQLite SERVICES sees active replacement E',
  );
  assert.equal(
    divergentCache.get('services', supersededRecovery.recovery.targetReplicaId),
    null,
    'shared recovery publication fence must prevent a crashed old leader delayed INSERT from landing after a later recovery',
  );
});
