// The release sequence runs at the existing replica lifecycle owner, using
// only per-attempt memory. A retry reconstructs from owners; no phase marker
// grants permission, and an unavailable member keeps admission closed.
import {RAFT_ROLE} from '../raft/constants.js';
import {TABLES} from '../constants/tables.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from '../raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {readParticipantReleaseFacts, isReleaseDrained} from
  '../partition/partition-participant-release-facts.js';
import {raiseParticipantCutoverPause} from
  '../partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../partition/partition-participant-transaction-store.js';
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
    deadlineAtMs: attempt.deadlineAtMs, ...fields};
}

function unavailableCensus(census) {
  return census.find((facts) => facts.outcome !== OUTCOME.OBSERVED) ?? null;
}

async function actOnCohort(handler, release, attempt, action, census, fields = {}) {
  return Promise.all(census.map((facts) => askParticipantRelease(handler,
    facts.generation.nodeId, requestFor(release, attempt, action, facts, fields))));
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

async function settleQueryRelease(handler, service, release, attempt, cohort, census) {
  if (service.tableName !== TABLES.SQL_TRANSACTIONS) {
    return {census, transactions: null, queryDrainProof: null};
  }
  const local = census.find((facts) =>
    facts.generation.replicaId === service.replicaId);
  if (local?.queryCensus?.state !== TRANSACTION_RELEASE_CENSUS_STATE.HELD) {
    return {census, transactions: null, queryDrainProof: null};
  }
  const transactions = await settleTransactionReleaseRows({
    engine: releaseQueryEngine(handler, service),
    service,
    census: local.queryCensus,
    now: service.timeSource.now(),
  });
  if (transactions === null) return null;
  const refreshed = await readCohort(handler, service.partitionId, cohort,
    attempt.deadlineAtMs);
  if (unavailableCensus(refreshed) !== null) return null;
  const current = refreshed.find((facts) =>
    facts.generation.replicaId === service.replicaId);
  const queryDrainProof = transactionReleaseProofOf({release, attempt,
    census: current?.queryCensus, transactions});
  return queryDrainProof === null ? null :
    {census: refreshed, transactions, queryDrainProof};
}

function controlReleaseAnswerValid(answer, targetBuildDigest) {
  return answer?.outcome === OUTCOME.CUT_OVER &&
    releaseIdentityValid(answer.release) &&
    answer.release.partitionId === INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS] &&
    answer.release.targetBuildDigest === targetBuildDigest &&
    Array.isArray(answer.census) &&
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
        controlNodeId: nodeId, controlOutcome: answer?.outcome ?? null});
  }
  return null;
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
      !handler.participantReleaseAuthorizationOwner.validates(
        request.authorization,
        {partitionId: service.partitionId,
          targetBuildDigest: request.targetBuildDigest})) {
    return releaseAnswer(OUTCOME.OPERATOR_REQUIRED, request,
      {missingFact: 'fresh_storage_or_operator_authority'});
  }
  const controlOwner = await releaseControlOwnerFirst(handler, service, request);
  if (controlOwner !== null) return controlOwner;
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
    deadlineAtMs: request.deadlineAtMs});
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
  census = await actOnCohort(handler, release, attempt, ACTION.PAUSE, census);
  unavailable = unavailableCensus(census);
  if (unavailable !== null) return unavailable;
  if (census.some((facts) => !isReleaseDrained(facts.work))) {
    return attemptRefusal({...request, release}, OUTCOME.DRAIN_PENDING);
  }
  const reopened = await reopenCohort(handler, service, request, release, attempt, census);
  if (reopened !== null) return reopened;
  const queryRelease = await settleQueryRelease(handler, service, release, attempt,
    cohort, census);
  if (queryRelease === null) {
    const queryCensus = census.find((facts) =>
      facts.generation.replicaId === service.replicaId)?.queryCensus ?? null;
    return attemptRefusal({...request, release}, OUTCOME.QUERY_DRAIN_PENDING,
      queryDrainRefusalFields(queryCensus));
  }
  census = queryRelease.census;
  const local = census.find((facts) => facts.generation.replicaId === service.replicaId);
  const defect = releaseCensusDefect(release, census, local, {originRequired: false,
    attempt, queryDrainProof: queryRelease.queryDrainProof});
  if (defect !== null) return attemptRefusal({...request, release}, defect,
    defect === OUTCOME.TOPOLOGY_PENDING ? {topology: local.topology} : {});
  const enabled = await askParticipantRelease(handler, handler.nodeId,
    requestFor(release, attempt, ACTION.ENABLE, local,
      {census, queryDrainProof: queryRelease.queryDrainProof}));
  if (enabled.outcome !== OUTCOME.OBSERVED) return enabled;
  census = await readCohort(handler, service.partitionId, cohort,
    request.deadlineAtMs);
  unavailable = unavailableCensus(census);
  if (unavailable !== null) return unavailable;
  const finalLocal = census.find((facts) => facts.generation.replicaId === service.replicaId);
  const finalQueryDrainProof = queryRelease.transactions === null ? null :
    transactionReleaseProofOf({release, attempt, census: finalLocal?.queryCensus,
      transactions: queryRelease.transactions});
  if (queryRelease.transactions !== null && finalQueryDrainProof === null) {
    return attemptRefusal({...request, release}, OUTCOME.QUERY_DRAIN_PENDING,
      queryDrainRefusalFields(finalLocal?.queryCensus ?? null));
  }
  const finalDefect = releaseCensusDefect(release, census, finalLocal,
    {attempt, queryDrainProof: finalQueryDrainProof});
  if (finalDefect !== null) return attemptRefusal({...request, release}, finalDefect,
    finalDefect === OUTCOME.TOPOLOGY_PENDING ?
      {topology: finalLocal.topology} : {});
  const currentControlOwner = await releaseControlOwnerFirst(handler, service, request);
  if (currentControlOwner !== null) return currentControlOwner;
  const resumed = await actOnCohort(handler, release, attempt, ACTION.RESUME, census,
    {census, queryDrainProof: finalQueryDrainProof});
  const refusal = resumed.find((answer) => answer.outcome !== OUTCOME.RESUMED);
  return refusal ?? releaseAnswer(OUTCOME.CUT_OVER, {...request, release},
    {release, census});
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
