/**
 * Actual SQL/Raft/CDC/SystemTableCache integration for claim and terminal abandonment.
 * Boots the seed, then joins the ordinary coordinator's shutdown before adding
 * a synthetic row. SQL, Raft, routing and CDC remain live until final teardown.
 * A real repository facade uses the issued boot and actual gateway/cache.
 * This intentionally isolates the write/visibility boundary: NOT full startup,
 * live reconciliation, founder admission, or physical membership acceptance.
 * All earlier founder-token and lease-interleaving failures remain evidence.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {performance} from 'node:perf_hooks';
import {emitCompleteParticipantReleaseTrace} from
  '../../scripts/quest-evidence/participant-release-trace-envelope.mjs';
import {NodeService} from '../../src/node/node-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {encodeCommittedLearnerAdmission} from '../../src/raft/raft-rs-committed-membership-context.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_MAX_PEERS, COMMITTED_MEMBERSHIP_STAMP_KIND} from
  '../../src/raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {TEST_CONFIG, createVirginSeedBootstrapService, initializeTestEnvironment,
  cleanupTestEnvironment, getUniquePort, gracefulShutdown,
  waitForPartitionLeaderElection} from './helpers/cluster-test-helpers.js';

const NODE = 'membership-claim-cache-seed';
const TABLE = 'replica_operations';
const PARTICIPANT_RELEASE_TRACE_CAP = 8192;
// Real 45-partition seed work is CPU/SQLite constrained on 4-vCPU CI.
// This is an explicitly scoped release budget, not an election timeout.
const SEED_RELEASE_BUDGET_MS = 20000;
const CLAIM_CACHE_TEST_BUDGET_MS = 90000;
const PARTICIPANT_RELEASE_COHORT_TRACE_CAP = 16;
const TRACE_ERROR_MESSAGE_CAP = 512;
const PARTICIPANT_RELEASE_TRACE_SCHEMA = 'participant-release-delivery-trace/1';

function traceErrorOf(error) {
  if (error === null || typeof error !== 'object') return null;
  const message = typeof error.message === 'string' ? error.message : null;
  const code = typeof error.code === 'string' || typeof error.code === 'number' ?
    error.code : null;
  return {name: typeof error.name === 'string' ? error.name : null, code,
    message: message === null ? null : message.slice(0, TRACE_ERROR_MESSAGE_CAP),
    messageLength: message?.length ?? null};
}

function releaseIdentityTraceOf(release) {
  if (release === null || typeof release !== 'object') return null;
  return {
    releaseId: release.releaseId ?? null,
    partitionId: release.partitionId ?? null,
    protocolVersion: release.protocolVersion ?? null,
    targetBuildDigest: release.targetBuildDigest ?? null,
    configurationKey: release.configurationKey ?? null,
    membershipGenerationIndex: release.membershipGenerationIndex ?? null,
  };
}

function generationTraceOf(generation) {
  if (generation === null || typeof generation !== 'object') return null;
  return {
    nodeId: generation.nodeId ?? null,
    ownerIncarnation: generation.ownerIncarnation ?? null,
    replicaId: generation.replicaId ?? null,
    lifecycleIncarnation: generation.lifecycleIncarnation ?? null,
    runtimeGeneration: generation.runtimeGeneration ?? null,
    connectionGeneration: generation.connectionGeneration ?? null,
    admissionGeneration: generation.admissionGeneration ?? null,
  };
}

function workTraceOf(work) {
  if (work === null || typeof work !== 'object') return null;
  return {
    sqliteTransactionOpen: work.sqliteTransactionOpen ?? null,
    participantStaging: work.participantStaging ?? null,
    participantPrepared: work.participantPrepared ?? null,
    proposals: work.proposals ?? null,
    pendingOutcomes: work.pendingOutcomes ?? null,
    appliedIndex: work.appliedIndex ?? null,
    commitIndex: work.commitIndex ?? null,
    lastIndex: work.lastIndex ?? null,
  };
}

function originTraceOf(origin) {
  if (origin === null || typeof origin !== 'object') return null;
  return {originIndex: origin.originIndex ?? null, originTerm: origin.originTerm ?? null};
}

function boundedMembershipArray(value) {
  return Array.isArray(value) ? value.slice(0, COMMITTED_MEMBERSHIP_MAX_PEERS) : null;
}

function membershipTraceOf(membership) {
  if (membership === null || typeof membership !== 'object') return null;
  const voters = boundedMembershipArray(membership.voters);
  const votersOutgoing = boundedMembershipArray(membership.votersOutgoing);
  const learners = boundedMembershipArray(membership.learners);
  const learnersNext = boundedMembershipArray(membership.learnersNext);
  const peerIds = [...new Set([...(voters ?? []), ...(votersOutgoing ?? []),
    ...(learners ?? []), ...(learnersNext ?? [])])]
    .slice(0, COMMITTED_MEMBERSHIP_MAX_PEERS);
  return {
    kind: membership.kind ?? null,
    voters,
    votersOutgoing,
    learners,
    learnersNext,
    appliedIndex: membership.appliedIndex ?? null,
    configurationKey: membership.configurationKey ?? null,
    membershipGenerationIndex: membership.membershipGenerationIndex ?? null,
    commitIndex: membership.commitIndex ?? null,
    term: membership.term ?? null,
    leaderId: membership.leaderId ?? null,
    gateOpen: membership.gateOpen ?? null,
    identities: peerIds.map((peerId) => ({peerId,
      replicaId: membership.identities?.[peerId] ?? null})),
  };
}

function attemptTraceOf(attempt) {
  if (attempt === null || typeof attempt !== 'object') return null;
  return {
    leaderReplicaId: attempt.leaderReplicaId ?? null,
    term: attempt.term ?? null,
    leaderLifecycleIncarnation: attempt.leaderLifecycleIncarnation ?? null,
    deadlineAtMs: attempt.deadlineAtMs ?? null,
  };
}

function cohortTraceOf(census) {
  if (!Array.isArray(census)) return null;
  const captured = census.slice(0, PARTICIPANT_RELEASE_COHORT_TRACE_CAP);
  return {total: census.length, captured: captured.length,
    dropped: census.length - captured.length,
    members: captured.map((facts, index) => ({ordinal: index + 1,
      partitionId: facts?.partitionId ?? null,
      generation: generationTraceOf(facts?.generation)}))};
}

function requestTraceOf(request) {
  return {
    action: request?.action ?? null,
    trigger: request?.trigger ?? null,
    partitionId: request?.partitionId ?? null,
    replicaId: request?.replicaId ?? null,
    targetBuildDigest: request?.targetBuildDigest ?? null,
    deadlineAtMs: request?.deadlineAtMs ?? null,
    release: releaseIdentityTraceOf(request?.release),
    target: generationTraceOf(request?.target),
    attempt: attemptTraceOf(request?.attempt),
    cohort: cohortTraceOf(request?.census),
  };
}

function releaseAnswerTraceOf(answer) {
  if (answer === null || typeof answer !== 'object') return null;
  return {
    outcome: answer.outcome ?? null,
    releaseId: answer.releaseId ?? null,
    partitionId: answer.partitionId ?? null,
    phase: answer.phase ?? null,
    retryAfterMs: answer.retryAfterMs ?? null,
    missingFact: answer.missingFact ?? null,
    controlPartitionId: answer.controlPartitionId ?? null,
    controlNodeId: answer.controlNodeId ?? null,
    controlOutcome: answer.controlOutcome ?? null,
    leaderReplicaId: answer.leaderReplicaId ?? null,
    leaderAddress: answer.leaderAddress ?? null,
    buildDigest: answer.buildDigest ?? null,
    release: releaseIdentityTraceOf(answer.release),
    generation: generationTraceOf(answer.generation),
    work: workTraceOf(answer.work),
    origin: originTraceOf(answer.origin),
    membership: membershipTraceOf(answer.membership),
    blockedDrain: answer.blockedDrain === null ||
        typeof answer.blockedDrain !== 'object' ? null : {
        generation: generationTraceOf(answer.blockedDrain.generation),
        work: workTraceOf(answer.blockedDrain.work),
      },
  };
}

function createParticipantReleaseDeliveryTrace() {
  const records = [];
  const installations = [];
  let callOrdinal = 0;
  let completionOrdinal = 0;
  let installationOrdinal = 0;
  let matchedCount = 0;
  let droppedCount = 0;
  let captureErrorCount = 0;

  const admitRecord = (installation, args, currentCallOrdinal) => {
    try {
      if (args[1]?.type !== PARTICIPANT_RELEASE_TYPE) return null;
      matchedCount += 1;
      if (records.length >= PARTICIPANT_RELEASE_TRACE_CAP) {
        droppedCount += 1;
        return null;
      }
      const record = {installationOrdinal: installation.trace.installationOrdinal,
        routerId: installation.trace.routerId,
        nodeId: installation.trace.nodeId,
        callOrdinal: currentCallOrdinal, completionOrdinal: null,
        targetAddress: args[0], request: requestTraceOf(args[1]),
        response: null, error: null};
      records.push(record);
      return record;
    } catch (_captureError) {
      captureErrorCount += 1;
      return null;
    }
  };

  const captureCompletion = (record, response, error) => {
    if (record === null) return;
    try {
      const responseTrace = response === null ? null : {
        acknowledged: response?.acknowledged ?? null,
        deliveryState: response?.deliveryState ?? null,
        noHandler: response?.noHandler ?? null,
        errorCode: response?.errorCode ?? null,
        answer: releaseAnswerTraceOf(response?.[PARTICIPANT_RELEASE_RESULT_FIELD]),
      };
      const errorTrace = traceErrorOf(error);
      completionOrdinal += 1;
      record.completionOrdinal = completionOrdinal;
      record.response = responseTrace;
      record.error = errorTrace;
    } catch (_captureError) {
      captureErrorCount += 1;
    }
  };

  const routerFactory = (options) => {
    const router = new MessageRouter(options);
    const originalDeliver = router.deliver;
    installationOrdinal += 1;
    const installation = {router, originalDeliver, trace: {
      installationOrdinal,
      nodeId: options.nodeId ?? null,
      nodeAddress: options.nodeAddress ?? null,
      advertisedAddress: options.advertisedAddress ?? null,
      wsPort: options.wsPort ?? null,
      bootIncarnation: options.bootIncarnation ?? null,
      routerNodeId: router.nodeId ?? null,
      routerId: router.routerId ?? null,
    }};
    router.deliver = function(...args) {
      callOrdinal += 1;
      const currentCallOrdinal = callOrdinal;
      const record = admitRecord(installation, args, currentCallOrdinal);
      let originalPromise;
      try {
        originalPromise = Reflect.apply(originalDeliver, this, args);
      } catch (error) {
        captureCompletion(record, null, error);
        throw error;
      }
      try {
        if (record !== null) {
          void Promise.prototype.then.call(originalPromise,
            (response) => captureCompletion(record, response, null),
            (error) => captureCompletion(record, null, error));
        }
      } catch (_captureError) {
        captureErrorCount += 1;
      }
      return originalPromise;
    };
    installations.push(installation);
    return router;
  };

  return {
    routerFactory,
    restore() {
      const errors = [];
      for (const {router, originalDeliver} of installations) {
        try {
          router.deliver = originalDeliver;
        } catch (error) {
          captureErrorCount += 1;
          errors.push(error);
        }
      }
      if (errors.length > 0) throw errors[0];
    },
    report() {
      return {schema: PARTICIPANT_RELEASE_TRACE_SCHEMA,
        cap: PARTICIPANT_RELEASE_TRACE_CAP, matchedCount,
        recordedCount: records.length, completionCount: completionOrdinal,
        droppedCount, captureErrorCount,
        incompleteCount: records.filter((record) => record.completionOrdinal === null).length,
        installations: installations.map((installation) => installation.trace), records};
    },
  };
}

// Each case owns a distinct row and repository facade. Only the expensive
// seed/SQL/Raft/CDC lifetime is shared; reconciliation remains quiesced.
async function exerciseSettlement(t, settlement,
  {bootstrap, port, cache, cdc, gateway, coordinator, mark}) {
  const now = Date.now();
  const id = `cache-claim-${settlement.status}-${now}`;
  const group = `cache-visibility-fixture-${settlement.status}-${now}`;
  const source = `${group}-source`;
  const target = `${group}-target`;
  const sourceAttempt = `${id}-nonexecuting-source-fixture`;
  const identity = JSON.stringify({operationId: id, groupId: group,
    sourceReplicaId: source, sourceNodeId: NODE,
    sourceCreatedAt: now, sourceCreateAttemptToken: sourceAttempt,
    targetReplicaId: target, targetPeerId: deriveRaftRsPeerId(target),
    targetNodeId: NODE, targetAddress: `ws://127.0.0.1:${port}`,
    transitionIdentity: `${id}-transition`, membershipLaneKey: `message-group:${group}`});
  const sourceClaim = JSON.stringify({replicaId: source,
    createdAt: now, stateEnteredAt: now, createAttemptToken: sourceAttempt});
  const repository = new ReplicaOperationRepository({nodeId: NODE,
    membershipOwnerBootIncarnation: bootstrap.bootIncarnation,
    systemTableCache: cache, cdcIntegrationService: cdc,
    controlPlaneSystemTableGateway: gateway, logger: coordinator.logger});
  t.after(() => repository.markShuttingDown());
  // This tuple is a non-executing test row, never a physical CREATE grant.
  // No real founder generation or live coordinator binding is overwritten.
  await repository.persistNewOperation({operationId: id,
    type: OperationType.REPLACE, partitionId: group, entityId: group,
    entityType: SERVICE_TYPE.MESSAGE_GROUP, replicaId: target,
    sourceReplicaId: source, sourceNodeId: NODE, targetNodeId: NODE,
    status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: now, updatedAt: now, completedAt: null, stepsHistory: [],
    membershipPublicationEpoch: 1,
    messageGroupMembershipLaneKey: `message-group:${group}`,
    messageGroupMembershipPhase: 'learner_requested',
    messageGroupMembershipObligationState: 'intent_recorded',
    messageGroupMembershipIdentity: identity,
    messageGroupSourceLifecycleClaim: sourceClaim,
    messageGroupMembershipOwnerClaim: null, messageGroupMembershipPermit: null,
    messageGroupLearnerStamp: null, messageGroupVoterStamp: null,
    messageGroupRemovalStamp: null});
  mark('operation-inserted');
  const nulled = await cdc.updateSystemTableRow(TABLE, {operation_id: id},
    {lease_expires_at: null});
  assert.equal(nulled.success, true, JSON.stringify(nulled));
  await cdc.waitForCacheUpdate(TABLE, id, true,
    {expectedFields: {operation_id: id, lease_expires_at: null,
      message_group_membership_identity: identity,
      message_group_membership_owner_claim: null}});
  mark('null-lease-visible');
  const before = cache.get(TABLE, id);
  assert.ok(before, 'the inserted operation must actually become visible');
  assert.equal(before.workflow_step, WORKFLOW_STEP.PENDING);
  assert.equal(before.status, ReplicaStatus.PENDING);
  assert.equal(before.lease_expires_at, null);
  assert.equal(before.message_group_membership_identity, identity);
  assert.equal(before.message_group_membership_owner_claim, null);
  const writes = [];
  const original = repository.executeOperationMutationWithRetry.bind(repository);
  repository.executeOperationMutationWithRetry = async (sql, params, ...rest) => {
    writes.push({sql, params});
    return original(sql, params, ...rest);
  };
  const claimed = await repository.claimMessageGroupMembershipOwner({operationId: id,
    identity, expectedClaim: null});
  mark('claim-returned');
  assert.equal(claimed.outcome, 'recorded', JSON.stringify(claimed));
  assert.equal(typeof claimed.claim, 'string');
  assert.ok(writes.some(({sql}) => sql.includes('lease_expires_at IS NULL')),
    'the actual NULL-lease mutation must engage');
  await cdc.waitForCacheUpdate(TABLE, id, true,
    {expectedFields: {message_group_membership_owner_claim: claimed.claim}});
  mark('claim-cache-visible');
  const visible = cache.get(TABLE, id);
  assert.equal(visible.message_group_membership_owner_claim, claimed.claim);
  for (const field of ['operation_id', 'replica_id', 'source_replica_id',
    'source_node_id', 'target_node_id', 'created_at', 'status', 'workflow_step',
    'lease_expires_at', 'message_group_membership_identity',
    'message_group_source_lifecycle_claim', 'message_group_membership_lane_key',
    'message_group_membership_permit']) {
    assert.equal(visible[field], before[field], `claim must preserve ${field}`);
  }
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
    leaderTerm: 3, leaderConfigurationStamp: {
      configurationKey: raftRsConfStateKey(sourceOnly),
      membershipGenerationIndex: 1}, proposalIndex: 5,
    replicaIdentity: target, peerId: peerOf(target)};
  // Record initial intent through actual SQL/Raft/CDC before supplying the
  // separate committed-learner fixture. This still does not propose membership.
  assert.equal(typeof repository.authorizeMessageGroupLearner, 'function',
    'initial learner authorization method must exist on the real repository');
  const initialPermit = JSON.stringify({...prior, permitState: 'in_flight', proposalIndex: null});
  const initialInput = {operationId: id, identity, permit: initialPermit};
  const intentWritesBefore = writes.length;
  assert.equal((await repository.authorizeMessageGroupLearner(initialInput)).outcome,
    'recorded', 'initial learner intent must cross the real SQL/Raft boundary');
  assert.equal(writes.length, intentWritesBefore + 1, 'one actual initial intent CAS');
  await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: {
    message_group_membership_phase: 'learner_proposal_in_flight',
    message_group_membership_permit: initialPermit,
    message_group_membership_obligation_state: 'unknown'}});
  const issued = cache.get(TABLE, id);
  assert.equal(issued.message_group_membership_lane_key, `message-group:${group}`);
  assert.equal(issued.message_group_membership_owner_claim, claimed.claim);
  assert.equal(issued.message_group_membership_identity, identity);
  assert.equal(issued.status, ReplicaStatus.PENDING);
  assert.equal(issued.workflow_step, WORKFLOW_STEP.PENDING);
  assert.equal(issued.completed_at, null);
  assert.equal(issued.message_group_learner_stamp, null);
  assert.equal(issued.message_group_voter_stamp, null);
  assert.equal(issued.message_group_removal_stamp, null);
  assert.equal((await repository.authorizeMessageGroupLearner(initialInput)).outcome, 'recorded');
  assert.equal(writes.length, intentWritesBefore + 1, 'initial replay is observation only');
  mark('initial-learner-intent-cache-visible');
  const learnerFields = {message_group_membership_phase: 'learner_committed',
    message_group_membership_obligation_state: 'unknown',
    message_group_membership_permit: JSON.stringify(prior),
    message_group_learner_stamp: JSON.stringify(committedStampOfAnswer(learnerStamp))};
  // This test isolates SQL/Raft/CDC visibility; native observation is supplied
  // explicitly here. The other integration file obtains it from the real port.
  const nativeOrigin = JSON.parse(encodeCommittedLearnerAdmission({groupId: group,
    index: '5', term: '3', context: {operationId: id, transitionIdentity: `${id}-transition`,
      permitSequence: 1, stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
      replicaIdentity: target, peerId: peerOf(target)}}));
  const result = await repository.recordMessageGroupLearnerOutcome(
    {...initialInput, executionClaim: claimed.claim}, async (query) => {
      assert.equal(query.groupId, group);
      assert.deepEqual(query.action, nativeOrigin.context);
      return {kind: 'committed-action', reason: 'learner-action-applied',
        receipt: nativeOrigin, observedAppliedIndex: 6, membership: learnerStamp};
    });
  assert.equal(result.outcome, 'recorded', 'recovered outcome must cross actual SQL/Raft/CDC');
  await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: learnerFields});
  const admitted = await repository.queryAuthoritativeOperationById(id);
  const completedAt = Date.now();
  const settled = await repository.persistOperationUpdate({...admitted,
    status: settlement.status, workflowStep: settlement.step,
    completedAt, updatedAt: completedAt}, {confirmPersistence: false,
    disableSystemWriteSession: true, returnDisposition: true,
    expectedWorkflowStep: WORKFLOW_STEP.PENDING, terminalTransition: true});
  assert.notEqual(settled?.persisted, false, JSON.stringify(settled));
  await cdc.waitForCacheUpdate(TABLE, id, true, {expectedFields: {
    status: settlement.status, workflow_step: settlement.step,
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
  if (settlement.status === ReplicaStatus.REMOVED) {
    assert.equal(selected.outcome, 'conflict',
      'live successful replacement must never authorize target abandonment');
    assert.equal(writes.length, writesBefore, 'success refusal performs no membership write');
    const current = await repository.queryAuthoritativeOperationById(id);
    assert.equal(current.status, ReplicaStatus.REMOVED);
    assert.equal(current.workflowStep, WORKFLOW_STEP.REMOVED);
    assert.equal(current.messageGroupMembershipPermit, JSON.stringify(prior));
    assert.equal(current.messageGroupMembershipPhase, 'learner_committed');
    assert.equal(current.messageGroupMembershipLaneKey, `message-group:${group}`);
    assert.deepEqual(cache.get(TABLE, id), terminalBefore);
    assert.equal(cache.getAll('services').some((row) => row.group_id === group), false);
    mark('successful-replacement-protected');
    return;
  }
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
  const beforeHlc = HLCTimestamp.fromString(terminalBefore.updated_at_hlc);
  const afterHlc = HLCTimestamp.fromString(terminalAfter.updated_at_hlc);
  assert.equal(beforeHlc.toString(), terminalBefore.updated_at_hlc);
  assert.equal(afterHlc.toString(), terminalAfter.updated_at_hlc);
  assert.ok(afterHlc.compare(beforeHlc) > 0,
    'CDC must carry a newer origin HLC for the committed membership intent');
  for (const row of [terminalBefore, terminalAfter]) {
    delete row.updated_at_hlc;
    delete row.message_group_membership_phase;
    delete row.message_group_membership_permit;
  }
  assert.deepEqual(terminalAfter, terminalBefore,
    'the same cached terminal row retains ordinary state, holder, identity and debt');
  assert.equal((await repository.selectMessageGroupMembershipBranch(input)).outcome, 'recorded');
  assert.equal(writes.length, writesBefore + 1, 'replay grants no new write');
  mark('terminal-abandonment-cache-visible');
  assert.equal(cache.getAll(TABLE).filter((row) => row.operation_id === id).length, 1);
  assert.equal(cache.getAll('services').some((row) => row.group_id === group), false,
    'this visibility witness must not instantiate a physical source or target');
}

test('repository failed and successful T1 cases share one SQL/Raft/cache seed',
  {timeout: CLAIM_CACHE_TEST_BUDGET_MS}, async (t) => {
    const started = performance.now();
    const timings = [];
    const mark = (phase) => timings.push({phase,
      elapsedMs: Math.round(performance.now() - started)});
    const participantReleaseTrace = createParticipantReleaseDeliveryTrace();
    initializeTestEnvironment({nodeId: NODE});
    let bootstrap;
    let booted;
    let primaryError = null;
    try {
      const port = getUniquePort();
      bootstrap = await createVirginSeedBootstrapService({nodeId: NODE,
        nodeAddress: `ws://127.0.0.1:${port}`, wsPort: port,
        routerFactory: participantReleaseTrace.routerFactory,
        // Eliminate fixture per-replica pacing, not runtime election safety.
        config: {...TEST_CONFIG.bootstrap,
          seedParticipantReleaseBudgetMs: SEED_RELEASE_BUDGET_MS,
          replicaStaggerDelayMs: 0}});
      booted = await bootstrap.bootstrap();
      mark('bootstrap');
      assert.equal(booted?.success, true, JSON.stringify(booted?.error));
      assert.ok(await waitForPartitionLeaderElection(booted, bootstrap,
        'replica_operations-p1', 5000), 'real operation-table leader must exist');
      const cache = NodeService.getInstance().getSystemTableCache();
      const coordinator = bootstrap.rebalanceCoordinator;
      const gateway = coordinator?.controlPlaneSystemTableGateway;
      const cdc = bootstrap.cdcIntegrationService;
      assert.ok(gateway && cdc && cache, 'use existing production owners');
      assert.ok(Number.isSafeInteger(bootstrap.bootIncarnation) && bootstrap.bootIncarnation > 0);
      // The key lane alone does not own every ordinary lease touch. Join the
      // existing reconciliation lifecycle, rather than patching its decisions.
      // All SQL/Raft/CDC/cache observations below still use the live data path.
      await coordinator.shutdown();
      mark('coordinator-quiesced');
      assert.equal(coordinator.isShuttingDown, true);
      assert.equal(coordinator.initialized, false);
      for (const settlement of [
        {status: ReplicaStatus.FAILED, step: WORKFLOW_STEP.FAILED},
        {status: ReplicaStatus.REMOVED, step: WORKFLOW_STEP.REMOVED},
      ]) {
        await t.test(settlement.status, (caseTest) => exerciseSettlement(caseTest,
          settlement, {bootstrap, port, cache, cdc, gateway, coordinator,
            mark: (phase) => mark(`${settlement.status}:${phase}`)}));
      }
    } catch (error) {
      primaryError = error;
    }

    const observationErrors = [];
    const cleanupErrors = [];
    const recordError = (errors, phase, error) => errors.push({phase, error,
      trace: traceErrorOf(error)});
    try {
      participantReleaseTrace.restore();
    } catch (error) {
      recordError(observationErrors, 'restore-deliver', error);
    }
    try {
      mark('teardown-start');
      await gracefulShutdown(bootstrap, booted, null);
      mark('bootstrap-stopped');
    } catch (error) {
      recordError(cleanupErrors, 'graceful-shutdown', error);
    }
    try {
      await cleanupTestEnvironment();
      mark('cleanup-complete');
    } catch (error) {
      recordError(cleanupErrors, 'cleanup-test-environment', error);
    }

    const elapsedMs = Math.round(performance.now() - started);
    let traceOutput = null;
    try {
      traceOutput = JSON.stringify(participantReleaseTrace.report());
    } catch (error) {
      recordError(observationErrors, 'serialize-participant-release-trace', error);
    }
    if (traceOutput !== null) {
      try {
        emitCompleteParticipantReleaseTrace(traceOutput, (line) =>
          console.log(line));
      } catch (error) {
        recordError(observationErrors, 'write-participant-release-trace', error);
      }
    }
    try {
      console.log(JSON.stringify({schema: 'membership-cache-timing/2',
        budgetMs: CLAIM_CACHE_TEST_BUDGET_MS,
        seedReleaseBudgetMs: SEED_RELEASE_BUDGET_MS,
        electionWaitBudgetMs: TEST_CONFIG.bootstrap.leadershipWaitTimeoutMs,
        elapsedMs, fixtureReplicaStaggerDelayMs: 0, timings}));
    } catch (error) {
      recordError(observationErrors, 'write-timing-trace', error);
    }
    try {
      assert.ok(elapsedMs < CLAIM_CACHE_TEST_BUDGET_MS,
        'both cases and joined teardown must fit the explicit CI hardware budget');
    } catch (error) {
      recordError(cleanupErrors, 'joined-budget', error);
    }

    if (primaryError !== null || observationErrors.length > 0 || cleanupErrors.length > 0) {
      try {
        console.log(JSON.stringify({schema: 'membership-cache-error-summary/1',
          primary: traceErrorOf(primaryError),
          observation: observationErrors.map(({phase, trace}) => ({phase, error: trace})),
          cleanup: cleanupErrors.map(({phase, trace}) => ({phase, error: trace}))}));
      } catch (_reportError) {
        // Reporting is observation only; the exact primary/cleanup error below remains authoritative.
      }
    }
    if (primaryError !== null) throw primaryError;
    if (cleanupErrors.length > 0) throw cleanupErrors[0].error;
    if (observationErrors.length > 0) throw observationErrors[0].error;
  });
