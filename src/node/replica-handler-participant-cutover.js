// The release sequence runs at the existing replica lifecycle owner, using
// only per-attempt memory. A retry reconstructs from owners; no phase marker
// grants permission, and an unavailable member keeps admission closed.
import {createHash} from 'node:crypto';
import {RAFT_ROLE} from '../raft/constants.js';
import {TABLES} from '../constants/tables.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from '../raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {readParticipantReleaseFacts, isReleaseDrained} from
  '../partition/partition-participant-release-facts.js';
import {canonicalConfiguration, parseJson, RELEASE_CONTROL_STATE,
  targetEntryOf} from '../partition/partition-participant-release-command.js';
import {raiseParticipantCutoverPause} from
  '../partition/partition-participant-transaction-pause.js';
import {readParticipantReleaseState, readPartitionWriteOrigin} from
  '../partition/partition-participant-transaction-store.js';
import {pauseParticipantAdmission, resumeParticipantAdmission} from
  '../partition/partition-participant-release-request.js';
import {releaseAnswer, releaseCensusDefect, releaseIdentityOf,
  releaseIdentityValid, releaseMemberIds} from
  '../partition/partition-participant-release-contract.js';
import {askParticipantRelease, releaseNodeOfAddress, requestParticipantRelease} from
  './participant-release-client.js';
import {settleTransactionReleaseRows, transactionReleaseProofOf} from
  '../query/distributed/distributed-transaction-release-settlement.js';
import {TRANSACTION_RELEASE_CENSUS_STATE} from
  '../query/distributed/distributed-transaction-release-census.js';
import {TRANSACTION_SCHEMA_ENFORCEMENT_STATE} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_CUTOVER_BOUND as BOUND} from
  '../partition/partition-participant-transaction-cutover-constants.js';

const RUNS = new WeakMap();

function localLeader(handler, request) {
  const hosted = [...handler.localServices.values()].filter((service) =>
    service.partitionId === request.partitionId && service.initialized && !service.isShutdown);
  return hosted.find((service) => service.raft?.readStatus().role === RAFT_ROLE.LEADER) ??
    hosted[0] ?? null;
}

function cohortOf(handler, facts) {
  const members = releaseMemberIds(facts.membership);
  if (members === null) return null;
  const routes = members.map((replicaId) => {
    if (replicaId === facts.generation.replicaId) return {replicaId, nodeId: handler.nodeId};
    const peer = facts.peers.find((item) => item.replicaIdentity === replicaId);
    const nodeId = releaseNodeOfAddress(peer?.address);
    return nodeId === null ? null : {replicaId, nodeId};
  });
  return routes.includes(null) ? null : routes;
}

async function readCohort(handler, partitionId, cohort, deadlineAtMs) {
  return Promise.all(cohort.map((member) => askParticipantRelease(handler, member.nodeId,
    {partitionId, replicaId: member.replicaId, action: ACTION.INSPECT,
      deadlineAtMs})));
}

function requestFor(release, attempt, action, facts, fields = {}) {
  return {partitionId: release.partitionId, replicaId: facts.generation.replicaId,
    release, attempt, action, target: facts.generation,
    deadlineAtMs: attempt.deadlineAtMs,
    pauseInvocationId: attempt.pauseInvocationId, ...fields};
}

function unavailableCensus(census) {
  return census.find((facts) => facts.outcome !== OUTCOME.OBSERVED) ?? null;
}

async function actOnCohort(handler, release, attempt, action, census, fields = {}) {
  return Promise.all(census.map((facts) => askParticipantRelease(handler,
    facts.generation.nodeId, requestFor(release, attempt, action, facts, fields))));
}

function waitForCutoverRetry(handler, deadlineAtMs) {
  const remaining = deadlineAtMs - handler.timeSource.now();
  if (remaining <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const handle = handler.timeSource.setTimeout(() => resolve(true),
      Math.min(BOUND.POLL_INTERVAL_MS, remaining));
    handle?.unref?.();
  });
}

function resumeRetryable(answer) {
  return answer?.outcome === OUTCOME.DRAIN_PENDING ||
    answer?.outcome === OUTCOME.UNAVAILABLE;
}

async function resumeCohort(handler, release, attempt, census, fields) {
  let answers = null;
  do {
    answers = await Promise.all(census.map((facts) =>
      askParticipantRelease(handler, facts.generation.nodeId,
        requestFor(release, attempt, ACTION.RESUME, facts, {...fields,
          controlAuthorization: {...fields.controlAuthorization,
            targetReplicaIdentity: facts.generation.replicaId}}))));
    const hardRefusal = answers.find((answer) =>
      answer.outcome !== OUTCOME.RESUMED && !resumeRetryable(answer));
    if (hardRefusal !== undefined) return {answers, refusal: hardRefusal};
    if (answers.every((answer) => answer.outcome === OUTCOME.RESUMED)) {
      return {answers, refusal: null};
    }
  } while (await waitForCutoverRetry(handler, attempt.deadlineAtMs));
  return {answers, refusal: attemptRefusal({release, action: ACTION.RESUME},
    OUTCOME.UNAVAILABLE, {missingFact: 'release_deadline',
      lastOutcomes: answers?.map((answer) => ({outcome: answer.outcome,
        missingFact: answer.missingFact ?? null})) ?? []})};
}

function canonicalTargetEntriesText(census) {
  if (!Array.isArray(census) || census.length === 0) return null;
  const targets = census.map(targetEntryOf);
  if (targets.includes(null)) return null;
  targets.sort((left, right) => left.replicaIdentity.localeCompare(right.replicaIdentity));
  return new Set(targets.map((target) => target.replicaIdentity)).size === targets.length ?
    JSON.stringify(targets) : null;
}

function canonicalConfigurationText(census) {
  if (!Array.isArray(census) || census.length === 0) return null;
  const configuration = canonicalConfiguration(census[0]?.membership);
  const text = configuration === null ? null : JSON.stringify(configuration);
  return text !== null && census.every((facts) =>
    JSON.stringify(canonicalConfiguration(facts?.membership)) === text) ? text : null;
}

function releaseAttemptFromFacts(request, release, facts) {
  return Object.freeze({leaderReplicaId: facts.leaderReplicaId,
    term: facts.membership.term,
    leaderLifecycleIncarnation: facts.generation.lifecycleIncarnation,
    deadlineAtMs: request.deadlineAtMs,
    pauseInvocationId: releaseAuthorizationId(
      `retained:${release.releaseId}`, `${release.releaseId}:pause`)});
}

function attemptRefusal(request, outcome, fields = {}) {
  return releaseAnswer(outcome, request,
    {retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS, ...fields});
}

function queryDrainRefusalFields(census) {
  if (census === null || typeof census !== 'object') return {};
  return {
    legacyTransactionIds: Array.isArray(census.legacyTransactionIds) ?
      [...census.legacyTransactionIds] : [],
    querySchemaVersion: census.schemaVersion ?? null,
    querySchemaDigest: census.enforcement?.schemaDigest ?? null,
    queryEnforcerDigest: census.enforcement?.enforcerDigest ?? null,
    queryRowGenerationDigest: census.rowGenerationDigest ?? null,
  };
}

function releaseQueryEngine(handler, service) {
  const serviceEngine = service.sqlQueryEngine ?? null;
  const bridgeEngine = handler.cdcIntegrationService?.sqlQueryEngine ?? null;
  return serviceEngine !== null && bridgeEngine !== null && serviceEngine !== bridgeEngine ?
    null : serviceEngine ?? bridgeEngine;
}

function querySettlementStage(service, attempt, startedAtMs, stage, fields = {}) {
  const observedAtMs = service.timeSource.now();
  return Object.freeze({stage, transactionId: null, observedAtMs,
    elapsedMs: observedAtMs - startedAtMs,
    originalRemainingMs: attempt.deadlineAtMs - startedAtMs,
    remainingMs: attempt.deadlineAtMs - observedAtMs, ...fields});
}

async function settleQueryRelease(handler, service, release, attempt, cohort, census) {
  if (service.tableName !== TABLES.SQL_TRANSACTIONS) {
    return {census, transactions: null, queryDrainProof: null};
  }
  const local = census.find((facts) =>
    facts.generation.replicaId === service.replicaId);
  if (local?.queryCensus?.state !== TRANSACTION_RELEASE_CENSUS_STATE.HELD) {
    return {census, transactions: null, queryDrainProof: null};
  }
  const startedAtMs = service.timeSource.now();
  const serviceEngine = service.sqlQueryEngine ?? null;
  const bridgeEngine = handler.cdcIntegrationService?.sqlQueryEngine ?? null;
  const engine = releaseQueryEngine(handler, service);
  const engineFacts = Object.freeze({
    serviceEnginePresent: serviceEngine !== null,
    bridgeEnginePresent: bridgeEngine !== null,
    engineAgreement: serviceEngine === null || bridgeEngine === null ||
      serviceEngine === bridgeEngine,
  });
  let querySettlementFailure = null;
  const transactions = await settleTransactionReleaseRows({
    engine,
    service,
    census: local.queryCensus,
    now: startedAtMs,
    observeFailure: (failure) => {
      querySettlementFailure ??= querySettlementStage(service, attempt, startedAtMs,
        failure.stage, {...failure, ...engineFacts});
    },
  });
  if (transactions === null) return {failure: querySettlementFailure ??
    querySettlementStage(service, attempt, startedAtMs, 'settlement_unknown', engineFacts)};
  const refreshed = await readCohort(handler, service.partitionId, cohort,
    attempt.deadlineAtMs);
  const unavailable = unavailableCensus(refreshed);
  if (unavailable !== null) return {failure: querySettlementStage(service, attempt,
    startedAtMs, 'refreshed_census', {...engineFacts,
      outcome: unavailable.outcome ?? null,
      missingFact: unavailable.missingFact ?? null,
      reason: unavailable.reason ?? null,
      replicaId: unavailable.target?.replicaId ?? unavailable.replicaId ?? null})};
  const current = refreshed.find((facts) =>
    facts.generation.replicaId === service.replicaId);
  const queryDrainProof = transactionReleaseProofOf({release, attempt,
    census: current?.queryCensus, transactions});
  return queryDrainProof === null ? {failure: querySettlementStage(service, attempt,
    startedAtMs, 'release_proof', {...engineFacts,
      reason: 'fresh_census_did_not_bind_settlement',
      transactionCount: transactions.length,
      recoverableTransactionCount:
        current?.queryCensus?.recoverableTransactionIds?.length ?? null})} :
    {census: refreshed, transactions, queryDrainProof,
      settlementStartedAtMs: startedAtMs, settlementEngineFacts: engineFacts};
}

function controlReleaseAnswerValid(answer, targetBuildDigest) {
  return answer?.outcome === OUTCOME.CUT_OVER &&
    releaseIdentityValid(answer.release) &&
    answer.release.partitionId === INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS] &&
    answer.release.targetBuildDigest === targetBuildDigest &&
    answer.attempt?.leaderReplicaId && Array.isArray(answer.census) &&
    answer.census.length > 0 && answer.census.every((facts) =>
    facts?.outcome === OUTCOME.OBSERVED && facts.buildDigest === targetBuildDigest &&
    facts.origin !== null && facts.connection?.servedLegacy === false &&
    facts.queryCensus !== null &&
    facts.queryCensus.enforcement?.state ===
      TRANSACTION_SCHEMA_ENFORCEMENT_STATE.ENFORCED);
}

async function releaseControlOwnerFirst(handler, service, request) {
  if (service.tableName === TABLES.SQL_TRANSACTIONS) return null;
  const partitionId = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
  const localControlLeader = [...handler.localServices.values()].find((candidate) =>
    candidate.initialized && !candidate.isShutdown &&
    candidate.partitionId === partitionId &&
    candidate.raft?.readStatus().role === RAFT_ROLE.LEADER);
  const topologyOwner = releaseQueryEngine(handler, service)?.queryExecutor
    ?.bootstrapTopologySnapshotOwner;
  const nodeId = localControlLeader ? handler.nodeId :
    topologyOwner?.resolveCanonicalPartitionLeaderNodeId?.(partitionId) ?? null;
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'current_control_owner_fact'});
  }
  if (localControlLeader !== undefined && localControlLeader !== null) {
    const observed = await observeCurrentControlOwner(handler, localControlLeader,
      request);
    if (observed !== null) return observed;
  }
  const authorization = handler.participantReleaseAuthorizationOwner
    .authorizeControlFrom(request.authorization, partitionId,
      request.targetBuildDigest);
  const answer = await requestParticipantRelease(handler, {partitionId, nodeId,
    targetBuildDigest: request.targetBuildDigest, trigger: request.trigger,
    deadlineAtMs: request.deadlineAtMs, authorization});
  if (answer?.outcome === OUTCOME.BUILD_MISMATCH) {
    return releaseAnswer(OUTCOME.BUILD_MISMATCH, request,
      {controlPartitionId: partitionId});
  }
  if (!controlReleaseAnswerValid(answer, request.targetBuildDigest)) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'current_control_owner_fact', controlPartitionId: partitionId,
        controlNodeId: nodeId, controlOutcome: answer?.outcome ?? null,
        controlMissingFact: answer?.missingFact ?? null,
        controlReason: answer?.reason ?? null,
        controlDetail: answer?.finalized ?? null,
        controlDispatch: answer?.dispatched ?? null,
        controlQuerySettlementFailure: answer?.querySettlementFailure ?? null});
  }
  return answer;
}

async function observeCurrentControlOwner(handler, service, request) {
  const own = await readParticipantReleaseFacts(handler, service,
    COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT);
  if (own.outcome !== OUTCOME.OBSERVED || own.origin === null) return null;
  const release = releaseIdentityOf({partitionId: service.partitionId,
    targetBuildDigest: request.targetBuildDigest,
    configurationKey: own.membership.configurationKey,
    membershipGenerationIndex: own.membership.membershipGenerationIndex});
  const cohort = release === null ? null : cohortOf(handler, own);
  if (cohort === null) return null;
  const census = await readCohort(handler, service.partitionId, cohort,
    request.deadlineAtMs);
  if (unavailableCensus(census) !== null || census.some((facts) => facts.paused === true)) {
    return null;
  }
  const authorization = parseJson(readParticipantReleaseState(service.db).authorizationText);
  if (authorization?.dependentReleaseText !== JSON.stringify(release) ||
      authorization.targetEntriesText !== canonicalTargetEntriesText(census) ||
      authorization.targetConfigurationText !== canonicalConfigurationText(census)) return null;
  const local = census.find((facts) => facts.generation.replicaId === service.replicaId);
  const attempt = releaseAttemptFromFacts(request, release, own);
  if (releaseCensusDefect(release, census, local,
    {attempt, pausedRequired: false}) !== null) return null;
  return releaseAnswer(OUTCOME.CUT_OVER, {...request, release},
    {release, census, attempt, queryDrainProof: null,
      controlAuthorization: Object.freeze({
        controlPartitionId: service.partitionId,
        authorizationId: authorization.controlAuthorizationId,
        authorizationRevision: authorization.controlAuthorizationRevision})});
}

function releaseAuthorizationId(rootAuthorizationId, dependentReleaseId) {
  return createHash('sha256').update(JSON.stringify(
    [rootAuthorizationId, dependentReleaseId])).digest('hex');
}

function controlLeaderFactsOf(control) {
  return control.census.find((facts) =>
    facts.generation.replicaId === control.attempt.leaderReplicaId) ?? null;
}

async function authorizeDependentRelease(handler, request, control, dependent) {
  const root = handler.participantReleaseAuthorizationOwner
    .reference(request.authorization);
  const leader = controlLeaderFactsOf(control);
  if (leader === null) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'current_control_authorization_route'});
  }
  const rootAuthorizationId = root?.authorizationId ??
    `existing:${dependent.release.releaseId}`;
  const authorizationId = releaseAuthorizationId(rootAuthorizationId,
    dependent.release.releaseId);
  return askParticipantRelease(handler, leader.generation.nodeId, {
    partitionId: control.release.partitionId,
    replicaId: leader.generation.replicaId,
    action: ACTION.AUTHORIZE,
    release: control.release,
    attempt: control.attempt,
    target: leader.generation,
    deadlineAtMs: request.deadlineAtMs,
    controlCensus: control.census,
    controlQueryDrainProof: control.queryDrainProof,
    dependentRelease: dependent.release,
    dependentAttempt: dependent.attempt,
    dependentLeaderReplicaId: dependent.attempt.leaderReplicaId,
    dependentCensus: dependent.census,
    dependentQueryDrainProof: dependent.queryDrainProof,
    retainedAuthorization: dependent.retainedAuthorization ?? null,
    controlAuthorization: {controlPartitionId: control.release.partitionId,
      authorizationId},
  });
}

async function confirmDependentRelease(handler, request, control,
  controlAuthorization, receipts) {
  const leader = controlLeaderFactsOf(control);
  if (leader === null) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'current_control_confirmation_route'});
  }
  return askParticipantRelease(handler, leader.generation.nodeId, {
    partitionId: control.release.partitionId,
    replicaId: leader.generation.replicaId,
    action: ACTION.CONFIRM,
    release: control.release,
    attempt: control.attempt,
    target: leader.generation,
    deadlineAtMs: request.deadlineAtMs,
    controlAuthorization,
    receipts,
  });
}

async function completeAuthorizedRelease(handler, service, request, control, dependent) {
  const authorized = await authorizeDependentRelease(handler, request, control, dependent);
  if (authorized.outcome !== OUTCOME.AUTHORIZED) return authorized;
  const controlAuthorization = Object.freeze({
    controlPartitionId: control.release.partitionId,
    authorizationId: authorized.authorizationId,
    authorizationRevision: authorized.authorizationRevision,
  });
  const controlLeader = controlLeaderFactsOf(control);
  const controlRetirementOwner = controlLeader === null ? null : Object.freeze({
    partitionId: control.release.partitionId,
    nodeId: controlLeader.generation.nodeId,
    replicaId: controlLeader.generation.replicaId,
    release: control.release,
    attempt: control.attempt,
    generation: controlLeader.generation,
    target: targetEntryOf(controlLeader),
  });
  if (controlRetirementOwner === null || controlRetirementOwner.target === null) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'current_control_retirement_route'});
  }
  const durableResume = await resumeParticipantAdmission(service, {
    dependentRelease: dependent.release,
    controlPartitionId: controlAuthorization.controlPartitionId,
    controlAuthorizationId: controlAuthorization.authorizationId,
    controlAuthorizationRevision: controlAuthorization.authorizationRevision,
    census: dependent.census,
  });
  if (durableResume?.outcome !== 'RESUMED') {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'committed_dependent_resume', resumed: durableResume});
  }
  const resumedResult = await resumeCohort(handler, dependent.release,
    dependent.attempt, dependent.census,
    {census: dependent.census, queryDrainProof: dependent.queryDrainProof,
      controlAuthorization, controlOwner: controlRetirementOwner});
  if (resumedResult.refusal !== null) return resumedResult.refusal;
  const receipts = resumedResult.answers.map((answer, index) => ({
    ...targetEntryOf(dependent.census[index]),
    resumeEntryId: answer.resumeEntryId,
    authorizationIndex: answer.authorizationIndex,
    authorizationTerm: answer.authorizationTerm,
    pauseGeneration: answer.pauseGeneration,
  }));
  const confirmed = await confirmDependentRelease(handler, request, control,
    controlAuthorization, receipts);
  return confirmed.outcome !== OUTCOME.CONFIRMED ? confirmed :
    releaseAnswer(OUTCOME.CUT_OVER, {...request, release: dependent.release},
      {release: dependent.release, census: dependent.census,
        attempt: dependent.attempt, queryDrainProof: dependent.queryDrainProof,
        controlAuthorization, confirmation: confirmed});
}

async function continueDurableRelease(handler, service, request, controlOwner) {
  const state = readParticipantReleaseState(service.db);
  const retainedAuthorization = parseJson(state.authorizationText);
  const retainedRelease = parseJson(retainedAuthorization?.dependentReleaseText);
  if (retainedRelease === null ||
      retainedRelease.partitionId !== service.partitionId ||
      retainedRelease.targetBuildDigest !== request.targetBuildDigest) return null;
  const rootAuthorizationId = handler.participantReleaseAuthorizationOwner
    .reference(request.authorization)?.authorizationId ??
    `existing:${retainedRelease.releaseId}`;
  if (retainedAuthorization.controlAuthorizationId !==
      releaseAuthorizationId(rootAuthorizationId, retainedRelease.releaseId)) return null;
  const own = await readParticipantReleaseFacts(handler, service,
    COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT);
  if (own.outcome !== OUTCOME.OBSERVED) return own;
  const currentRelease = releaseIdentityOf({partitionId: service.partitionId,
    targetBuildDigest: request.targetBuildDigest,
    configurationKey: own.membership.configurationKey,
    membershipGenerationIndex: own.membership.membershipGenerationIndex});
  if (currentRelease === null ||
      JSON.stringify(currentRelease) !== retainedAuthorization.dependentReleaseText) return null;
  const cohort = cohortOf(handler, own);
  if (cohort === null) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'committed_replica_routes'});
  }
  const census = await readCohort(handler, service.partitionId, cohort,
    request.deadlineAtMs);
  const unavailable = unavailableCensus(census);
  if (unavailable !== null) return unavailable;
  if (canonicalTargetEntriesText(census) !== retainedAuthorization.targetEntriesText ||
      canonicalConfigurationText(census) !==
        retainedAuthorization.targetConfigurationText) return null;
  const local = census.find((facts) => facts.generation.replicaId === service.replicaId);
  const attempt = releaseAttemptFromFacts(request, currentRelease, own);
  const defect = releaseCensusDefect(currentRelease, census, local,
    {attempt, pausedRequired: false});
  if (defect !== null) return attemptRefusal({...request, release: currentRelease}, defect);
  const control = service.tableName === TABLES.SQL_TRANSACTIONS ?
    {release: currentRelease, census, attempt, queryDrainProof: null} : controlOwner;
  if (control === null || control === undefined) return null;
  return completeAuthorizedRelease(handler, service, request, control,
    {release: currentRelease, census, attempt, queryDrainProof: null,
      retainedAuthorization});
}

async function reopenCohort(handler, service, request, release, attempt, census) {
  // Reopen followers before transferring leadership. The transfer answer
  // means requested; a fresh attempt must observe the new term and cohort.
  const dirtyFollowers = census.filter((facts) => facts.connection.servedLegacy &&
    facts.generation.replicaId !== service.replicaId);
  for (const facts of dirtyFollowers) {
    const reopened = await askParticipantRelease(handler, facts.generation.nodeId,
      requestFor(release, attempt, ACTION.REOPEN, facts));
    if (reopened.outcome !== OUTCOME.REOPENED) return reopened;
  }
  if (dirtyFollowers.length > 0) return attemptRefusal(request, OUTCOME.STALE);
  const own = census.find((facts) => facts.generation.replicaId === service.replicaId);
  if (!own.connection.servedLegacy) return null;
  if (own.membership.voters.length > 1) {
    const voterIds = own.membership.voters.map((id) => own.membership.identities[id]);
    const successor = census.find((facts) => facts.generation.replicaId !== service.replicaId &&
      voterIds.includes(facts.generation.replicaId) && facts.connection.servedLegacy === false);
    if (!successor) return attemptRefusal(request, OUTCOME.REOPEN_REQUIRED);
    const transfer = await service.requestLeadershipTransfer({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: successor.generation.replicaId});
    return attemptRefusal(request, OUTCOME.STALE, {transfer});
  }
  const reopened = await askParticipantRelease(handler, handler.nodeId,
    requestFor(release, attempt, ACTION.REOPEN, own));
  return reopened.outcome === OUTCOME.REOPENED ?
    attemptRefusal(request, OUTCOME.STALE, {reopened}) : reopened;
}

async function runCutoverAttempt(handler, request) {
  if (Number.isSafeInteger(request.deadlineAtMs) &&
      handler.timeSource.now() >= request.deadlineAtMs) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'release_deadline'});
  }
  const service = localLeader(handler, request);
  if (service === null) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'hosted_partition'});
  }
  const status = service.raft.readStatus();
  if (status.role !== RAFT_ROLE.LEADER) {
    return releaseAnswer(OUTCOME.NOT_LEADER, request,
      {leaderAddress: status.leaderAddress, leaderReplicaId: status.leaderId});
  }
  if (readPartitionWriteOrigin(service.db) === null &&
      !await handler.participantReleaseAuthorizationOwner.validates(
        request.authorization,
        {partitionId: service.partitionId,
          targetBuildDigest: request.targetBuildDigest})) {
    return releaseAnswer(OUTCOME.OPERATOR_REQUIRED, request,
      {missingFact: 'fresh_storage_or_operator_authority'});
  }
  const controlOwner = await releaseControlOwnerFirst(handler, service, request);
  if (service.tableName !== TABLES.SQL_TRANSACTIONS &&
      !controlReleaseAnswerValid(controlOwner, request.targetBuildDigest)) {
    return controlOwner;
  }
  const continued = await continueDurableRelease(handler, service, request, controlOwner);
  if (continued !== null) return continued;
  // Close the current leader before any awaited remote observation. A
  // missing member cannot leave reachable members open on a failed release.
  raiseParticipantCutoverPause(service);
  const own = await readParticipantReleaseFacts(handler, service,
    COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT);
  if (own.outcome !== OUTCOME.OBSERVED) return own;
  const release = releaseIdentityOf({partitionId: service.partitionId,
    targetBuildDigest: request.targetBuildDigest,
    configurationKey: own.membership.configurationKey,
    membershipGenerationIndex: own.membership.membershipGenerationIndex});
  if (release === null) return releaseAnswer(OUTCOME.INVALID, request);
  const attempt = Object.freeze({leaderReplicaId: service.replicaId,
    term: own.membership.term, leaderLifecycleIncarnation: own.generation.lifecycleIncarnation,
    deadlineAtMs: request.deadlineAtMs,
    pauseInvocationId: releaseAuthorizationId(
      handler.participantReleaseAuthorizationOwner.reference(request.authorization)
        ?.authorizationId ?? `existing:${release.releaseId}`,
      `${release.releaseId}:pause`)});
  const cohort = cohortOf(handler, own);
  if (cohort === null) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'committed_replica_routes'});
  }
  let census = await readCohort(handler, service.partitionId, cohort,
    request.deadlineAtMs);
  let unavailable = unavailableCensus(census);
  if (unavailable !== null) {
    await actOnCohort(handler, release, attempt, ACTION.PAUSE,
      census.filter((facts) => facts.outcome === OUTCOME.OBSERVED));
    return unavailable;
  }
  // The current leader owns the one replicated PAUSE. Every recipient closes
  // its local gate, then observes these exact committed bytes. Retrying a
  // lost reply reads the durable entry ID instead of appending another PAUSE.
  const committedPause = await pauseParticipantAdmission(service, attempt);
  if (committedPause?.outcome !== 'PAUSED') {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: 'committed_dependent_pause', paused: committedPause});
  }
  // PAUSE application itself advances the local admission generation. Read
  // each target again so the recipient validates the post-pause lifetime,
  // while retaining the same release/membership attempt and command bytes.
  census = await readCohort(handler, service.partitionId, cohort,
    request.deadlineAtMs);
  unavailable = unavailableCensus(census);
  if (unavailable !== null) return unavailable;
  census = await actOnCohort(handler, release, attempt, ACTION.PAUSE, census);
  unavailable = unavailableCensus(census);
  if (unavailable !== null) return unavailable;
  if (census.some((facts) => !isReleaseDrained(facts.work))) {
    return attemptRefusal({...request, release}, OUTCOME.DRAIN_PENDING, {
      heldReplicas: census.filter((facts) => !isReleaseDrained(facts.work))
        .map((facts) => ({
          replicaId: facts.generation.replicaId,
          work: facts.work,
        })),
    });
  }
  const reopened = await reopenCohort(handler, service, request, release, attempt, census);
  if (reopened !== null) return reopened;
  const queryRelease = await settleQueryRelease(handler, service, release, attempt,
    cohort, census);
  if (queryRelease?.queryDrainProof === undefined &&
      queryRelease?.transactions === undefined) {
    const queryCensus = census.find((facts) =>
      facts.generation.replicaId === service.replicaId)?.queryCensus ?? null;
    return attemptRefusal({...request, release}, OUTCOME.QUERY_DRAIN_PENDING,
      {...queryDrainRefusalFields(queryCensus),
        querySettlementFailure: queryRelease?.failure ?? null});
  }
  census = queryRelease.census;
  const local = census.find((facts) => facts.generation.replicaId === service.replicaId);
  const defect = releaseCensusDefect(release, census, local, {originRequired: false,
    attempt, queryDrainProof: queryRelease.queryDrainProof});
  if (defect !== null) {
    return attemptRefusal({...request, release}, defect,
      {...(defect === OUTCOME.TOPOLOGY_PENDING ? {topology: local.topology} : {}),
      querySettlementFailure: querySettlementStage(service, attempt,
        queryRelease.settlementStartedAtMs ?? service.timeSource.now(),
        'pre_enable_release_census', {...(queryRelease.settlementEngineFacts ?? {}),
          reason: defect,
          transactionCount: queryRelease.transactions?.length ?? null,
          recoverableTransactionCount:
            local?.queryCensus?.recoverableTransactionIds?.length ?? null})});
  }
  if (readPartitionWriteOrigin(service.db) === null &&
      !await handler.participantReleaseAuthorizationOwner.validates(
        request.authorization,
        {partitionId: service.partitionId,
          targetBuildDigest: request.targetBuildDigest})) {
    return attemptRefusal({...request, release}, OUTCOME.STALE,
      {missingFact: 'current_release_authority'});
  }
  const enabled = await askParticipantRelease(handler, handler.nodeId,
    requestFor(release, attempt, ACTION.ENABLE, local,
      {census, queryDrainProof: queryRelease.queryDrainProof}));
  if (enabled.outcome !== OUTCOME.OBSERVED) return enabled;
  census = await readCohort(handler, service.partitionId, cohort,
    request.deadlineAtMs);
  unavailable = unavailableCensus(census);
  if (unavailable !== null) {
    const startedAtMs = queryRelease.settlementStartedAtMs ?? service.timeSource.now();
    return Object.freeze({...unavailable,
      querySettlementFailure: querySettlementStage(service, attempt, startedAtMs,
        'post_enable_census', {...(queryRelease.settlementEngineFacts ?? {}),
          outcome: unavailable.outcome ?? null,
          missingFact: unavailable.missingFact ?? null,
          reason: unavailable.reason ?? null,
          replicaId: unavailable.target?.replicaId ?? unavailable.replicaId ?? null})});
  }
  const finalLocal = census.find((facts) => facts.generation.replicaId === service.replicaId);
  const finalQueryDrainProof = queryRelease.transactions === null ? null :
    transactionReleaseProofOf({release, attempt, census: finalLocal?.queryCensus,
      transactions: queryRelease.transactions});
  if (queryRelease.transactions !== null && finalQueryDrainProof === null) {
    return attemptRefusal({...request, release}, OUTCOME.QUERY_DRAIN_PENDING,
      {...queryDrainRefusalFields(finalLocal?.queryCensus ?? null),
        querySettlementFailure: querySettlementStage(service, attempt,
          queryRelease.settlementStartedAtMs ?? service.timeSource.now(),
          'post_enable_proof', {...(queryRelease.settlementEngineFacts ?? {}),
            reason: 'final_census_did_not_bind_settlement',
            transactionCount: queryRelease.transactions.length,
            recoverableTransactionCount:
              finalLocal?.queryCensus?.recoverableTransactionIds?.length ?? null})});
  }
  const finalDefect = releaseCensusDefect(release, census, finalLocal,
    {attempt, queryDrainProof: finalQueryDrainProof});
  if (finalDefect !== null) {
    return attemptRefusal({...request, release}, finalDefect,
      {...(finalDefect === OUTCOME.TOPOLOGY_PENDING ?
        {topology: finalLocal.topology} : {}),
      querySettlementFailure: querySettlementStage(service, attempt,
        queryRelease.settlementStartedAtMs ?? service.timeSource.now(),
        'post_enable_release_census', {...(queryRelease.settlementEngineFacts ?? {}),
          reason: finalDefect})});
  }
  // The control release already completed through this invocation's original
  // deadline before the dependent was paused. Re-entering that release here
  // would create a new dependent PAUSE after its durable confirmation. The
  // final committed authorization below revalidates the control configuration
  // against the applied Raft state; lifecycle invalidation is ordered through
  // the same control slot.
  const currentControlOwner = service.tableName === TABLES.SQL_TRANSACTIONS ?
    null : controlOwner;
  if (service.tableName !== TABLES.SQL_TRANSACTIONS &&
      !controlReleaseAnswerValid(currentControlOwner, request.targetBuildDigest)) {
    return currentControlOwner;
  }
  const control = currentControlOwner ?? {release, census, attempt,
    queryDrainProof: finalQueryDrainProof};
  return completeAuthorizedRelease(handler, service, request, control,
    {release, census, attempt, queryDrainProof: finalQueryDrainProof});
}

async function runParticipantCutover(handler, request) {
  let runs = RUNS.get(handler);
  if (runs === undefined) {
    runs = new Map();
    RUNS.set(handler, runs);
  }
  const current = runs.get(request.partitionId);
  if (current) {
    return current.targetBuildDigest === request.targetBuildDigest ?
      current.promise : releaseAnswer(OUTCOME.INVALID, request);
  }
  const running = runCutoverAttempt(handler, request).catch((error) =>
    attemptRefusal(request, OUTCOME.UNAVAILABLE, {reason: String(error?.message ?? error)}));
  const record = {targetBuildDigest: request.targetBuildDigest, promise: running};
  runs.set(request.partitionId, record);
  try {
    return await running;
  } finally {
    if (runs.get(request.partitionId) === record) runs.delete(request.partitionId);
  }
}

export {runParticipantCutover};
