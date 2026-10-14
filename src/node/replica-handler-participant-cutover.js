// The release sequence runs at the existing replica lifecycle owner, using
// only per-attempt memory. A retry reconstructs from owners; no phase marker
// grants permission, and an unavailable member keeps admission closed.
import {RAFT_ROLE} from '../raft/constants.js';
import {TABLES} from '../constants/tables.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR} from '../raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {raiseParticipantCutoverPause, readParticipantReleaseFacts} from
  '../partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from
  '../partition/partition-participant-transaction-store.js';
import {isReleaseDrained, releaseAnswer, releaseCensusDefect, releaseIdentityOf,
  releaseIdentityValid, releaseMemberIds, originEqual,
  sameReplicaGeneration} from
  '../partition/partition-participant-release-contract.js';
import {askParticipantRelease, releaseNodeOfAddress, requestParticipantRelease} from
  './participant-release-client.js';
import {captureParticipantReleaseDiagnosticTrigger,
  participantReleaseAttemptAgeObservation, readParticipantReleaseClock} from
  './participant-release-diagnostic-observation.js';
import {settleTransactionReleaseRows, transactionReleaseProofOf} from
  '../query/distributed/distributed-transaction-release-settlement.js';
import {TRANSACTION_RELEASE_CENSUS_STATE} from
  '../query/distributed/distributed-transaction-release-census.js';
import {TRANSACTION_SCHEMA_ENFORCEMENT_STATE} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_RELEASE_CONTROL_WAVE_FIELD as WAVE_FIELD,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT,
  PARTICIPANT_RELEASE_TRIGGER as TRIGGER} from
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

async function enableAndObserveCohort(handler, release, attempt, census, local,
  queryDrainProof) {
  const enabled = await askParticipantRelease(handler, handler.nodeId,
    requestFor(release, attempt, ACTION.ENABLE, local,
      {census, queryDrainProof}));
  if (enabled.outcome !== OUTCOME.OBSERVED) return enabled;
  const applied = await actOnCohort(handler, release, attempt,
    ACTION.OBSERVE_APPLIED_POSITION, census, {origin: enabled.origin});
  return unavailableCensus(applied);
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
  if (Object.hasOwn(request, WAVE_FIELD)) {
    return currentSeedControlWave(handler, request);
  }
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
      {missingFact: MISSING_FACT.CURRENT_CONTROL_OWNER});
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
      {missingFact: MISSING_FACT.CURRENT_CONTROL_OWNER, controlPartitionId: partitionId,
        controlNodeId: nodeId, controlOutcome: answer?.outcome ?? null});
  }
  return null;
}

// A post-origin, empty coordinator cohort needs no second ENABLE or origin
// replication. This is a *fresh*, paused current-member proof, not a reused
// CUT_OVER answer. The normal full release remains authoritative for a dirty,
// unavailable or schema-incomplete cohort.
function cleanCurrentControlCohort(service, release, attempt, census) {
  if (service.tableName !== TABLES.SQL_TRANSACTIONS ||
      service.partitionId !== INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS]) return false;
  const local = census.find((facts) =>
    facts?.generation?.replicaId === service.replicaId);
  return local !== undefined &&
    census.every((facts) =>
      facts?.queryCensus?.state === TRANSACTION_RELEASE_CENSUS_STATE.CLEAR &&
      facts.queryCensus.enforcement?.state ===
        TRANSACTION_SCHEMA_ENFORCEMENT_STATE.ENFORCED) &&
    releaseCensusDefect(release, census, local, {attempt}) === null;
}

// RUNS is the one authoritative in-flight cutover owner. A seed wave is one
// exceptional, bounded *held CLOSED* control invocation on that same key.
// Its opaque token only correlates callers; each check re-reads authoritative
// current member facts and validates the original seed authorization.
const SEED_WAVE_KIND = 'seed-control-wave';
const SEED_WAVE_STATE = Object.freeze({
  PREPARING: 'preparing', HELD: 'held', ENDING: 'ending', RETIRED: 'retired',
});
const CONTROL_PARTITION = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];

function runsFor(handler) {
  let runs = RUNS.get(handler);
  if (runs === undefined) {
    runs = new Map();
    RUNS.set(handler, runs);
  }
  return runs;
}

function sameWaveMember(held, current) {
  return held !== undefined && current !== undefined &&
    sameReplicaGeneration(held.generation, current.generation) &&
    originEqual(held.origin, current.origin) &&
    held.queryCensus?.rowGenerationDigest === current.queryCensus?.rowGenerationDigest &&
    held.queryCensus?.enforcement?.schemaDigest ===
      current.queryCensus?.enforcement?.schemaDigest &&
    held.queryCensus?.enforcement?.enforcerDigest ===
      current.queryCensus?.enforcement?.enforcerDigest;
}

function waveMemberCensusCurrent(record, current) {
  const {service, release, attempt, census} = record;
  if (!Array.isArray(current) || current.length !== census.length ||
      !cleanCurrentControlCohort(service, release, attempt, current)) return false;
  return current.every((facts) => sameWaveMember(
    census.find((held) => held.generation.replicaId === facts.generation.replicaId),
    facts));
}

function currentWaveLeader(handler, record) {
  return !handler.shuttingDown && !record.service.isShutdown &&
    handler.localServices.get(record.service.replicaId) === record.service &&
    localLeader(handler, {partitionId: CONTROL_PARTITION}) === record.service;
}

async function readWaveCensus(handler, record) {
  if (!currentWaveLeader(handler, record)) return null;
  const current = await readCohort(handler, CONTROL_PARTITION, record.cohort,
    record.deadlineAtMs);
  // The registry/lifecycle may change while readCohort awaits remote members.
  // The old object never inherits the newer owner's permission.
  return currentWaveLeader(handler, record) &&
    unavailableCensus(current) === null &&
    waveMemberCensusCurrent(record, current) ? current : null;
}

function waveRefusal(request, fact = MISSING_FACT.CURRENT_CONTROL_OWNER) {
  return attemptRefusal(request, OUTCOME.UNAVAILABLE,
    {missingFact: fact, controlPartitionId: CONTROL_PARTITION});
}

async function currentSeedControlWave(handler, request) {
  const record = RUNS.get(handler)?.get(CONTROL_PARTITION);
  if (record?.kind !== SEED_WAVE_KIND ||
      record.state !== SEED_WAVE_STATE.HELD ||
      record.token !== request[WAVE_FIELD] ||
      request.trigger !== TRIGGER.FRESH_SEED ||
      request.deadlineAtMs !== record.deadlineAtMs ||
      request.targetBuildDigest !== record.targetBuildDigest ||
      !record.partitions.includes(request.partitionId) ||
      !handler.participantReleaseAuthorizationOwner.validatesFreshSeed(
        request.authorization, {partitionId: request.partitionId,
          targetBuildDigest: request.targetBuildDigest})) {
    return waveRefusal(request);
  }
  if (handler.timeSource.now() >= record.deadlineAtMs) {
    return waveRefusal(request, MISSING_FACT.RELEASE_DEADLINE);
  }
  const current = await readWaveCensus(handler, record);
  return current === null ? waveRefusal(request) : null;
}

// This is explicitly a single-process fresh-SEED owner interaction. A
// serialized JSON transport copies the token, so remote or replayed calls
// cannot pass identity and must remain unavailable until normal recovery.
async function withFreshSeedControlWave(handler, options, execute) {
  const {targetBuildDigest, deadlineAtMs, controlAuthorization, partitionIds} = options;
  if (typeof execute !== 'function' || handler.shuttingDown ||
      !Array.isArray(partitionIds) || partitionIds.length === 0 ||
      new Set(partitionIds).size !== partitionIds.length ||
      partitionIds.includes(CONTROL_PARTITION) ||
      !Number.isSafeInteger(deadlineAtMs) ||
      handler.timeSource.now() >= deadlineAtMs ||
      !handler.participantReleaseAuthorizationOwner.validatesFreshSeed(
        controlAuthorization, {partitionId: CONTROL_PARTITION, targetBuildDigest})) {
    throw new Error('Fresh-seed current-control wave authority unavailable');
  }
  const runs = runsFor(handler);
  if (runs.has(CONTROL_PARTITION)) {
    throw new Error('Current control owner has an earlier release obligation');
  }
  const record = {kind: SEED_WAVE_KIND, state: SEED_WAVE_STATE.PREPARING,
    targetBuildDigest, deadlineAtMs, token: Object.freeze(Object.create(null)),
    partitions: Object.freeze([...partitionIds]), service: null,
    cohort: null, release: null, attempt: null, census: null};
  runs.set(CONTROL_PARTITION, record);
  let error = null;
  let value;
  let paused = false;
  let resumedControl = false;
  try {
    const request = {partitionId: CONTROL_PARTITION, targetBuildDigest,
      deadlineAtMs, trigger: TRIGGER.FRESH_SEED,
      authorization: controlAuthorization};
    const leader = localLeader(handler, request);
    if (leader === null || leader.raft?.readStatus().role !== RAFT_ROLE.LEADER) {
      throw new Error('Fresh-seed control leader unavailable');
    }
    // Existing durable origin decides whether initial full release is needed.
    // This read does NOT grant permission: the full pause/census below does.
    if (readPartitionWriteOrigin(leader.db) === null) {
      const initial = await runCutoverAttempt(handler, request);
      if (initial.outcome !== OUTCOME.CUT_OVER) {
        throw new Error('Initial SQL control release refused: ' +
          JSON.stringify(initial));
      }
    }
    if (handler.timeSource.now() >= deadlineAtMs) {
      throw new Error('Fresh-seed control wave deadline expired');
    }
    record.service = leader;
    raiseParticipantCutoverPause(leader);
    paused = true;
    const own = await readParticipantReleaseFacts(handler, leader,
      COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT);
    if (own.outcome !== OUTCOME.OBSERVED) {
      throw new Error('Current control leader facts unavailable');
    }
    const release = releaseIdentityOf({partitionId: CONTROL_PARTITION,
      targetBuildDigest, configurationKey: own.membership.configurationKey,
      membershipGenerationIndex: own.membership.membershipGenerationIndex});
    const cohort = cohortOf(handler, own);
    if (release === null || cohort === null) {
      throw new Error('Current control committed cohort unavailable');
    }
    const attempt = Object.freeze({leaderReplicaId: leader.replicaId,
      term: own.membership.term, leaderLifecycleIncarnation: own.generation.lifecycleIncarnation,
      deadlineAtMs});
    const before = await readCohort(handler, CONTROL_PARTITION, cohort, deadlineAtMs);
    if (unavailableCensus(before) !== null) {
      throw new Error('Current control initial member census unavailable');
    }
    const held = await actOnCohort(handler, release, attempt, ACTION.PAUSE, before);
    if (unavailableCensus(held) !== null ||
        !cleanCurrentControlCohort(leader, release, attempt, held) ||
        !currentWaveLeader(handler, record)) {
      throw new Error('Current control member PAUSE, identity or drain unavailable');
    }
    Object.assign(record, {release, cohort, attempt, census: held,
      state: SEED_WAVE_STATE.HELD});
    try {
      value = await execute(record.token);
    } catch (cause) {
      error = cause;
    }
    record.state = SEED_WAVE_STATE.ENDING;
    if (handler.timeSource.now() >= deadlineAtMs) {
      throw new Error('Current control wave END deadline expired');
    }
    const current = await readWaveCensus(handler, record);
    if (current === null) throw new Error('Current control wave END census refused');
    const resumed = await actOnCohort(handler, release, attempt, ACTION.RESUME,
      current, {census: current});
    if (resumed.some((answer) => answer.outcome !== OUTCOME.RESUMED)) {
      throw new Error('Current control wave final member RESUME refused');
    }
    resumedControl = true;
  } catch (cause) {
    error = error === null ? cause :
      new AggregateError([error, cause], 'seed control wave AND cleanup refused');
  } finally {
    record.state = SEED_WAVE_STATE.RETIRED;
    if (runs.get(CONTROL_PARTITION) === record) runs.delete(CONTROL_PARTITION);
    // Only an incomplete control wave retains volatile recovery debt. After
    // successful RESUME, no redundant recovery wake should compete with the
    // next seed partition. A failing wake retains its exact original error.
    if (paused && !resumedControl) {
      try {
        handler.participantReleaseRecovery?.requestRecovery(CONTROL_PARTITION);
      } catch (wakeError) {
        error = error === null ? wakeError : new AggregateError([error, wakeError],
          'Control wave refusal and recovery wake both failed');
      }
    }
  }
  if (error !== null) throw error;
  return value;
}

async function proveCurrentControlCohort(handler, service, request,
  release, attempt, cohort, pausedCensus) {
  if (!cleanCurrentControlCohort(service, release, attempt, pausedCensus)) return null;
  // A new INSPECT of every current member after the first validation is
  // mandatory: a previous reply never authorizes subsequent resume.
  const current = await readCohort(handler, service.partitionId, cohort,
    attempt.deadlineAtMs);
  const unavailable = unavailableCensus(current);
  if (unavailable !== null) return unavailable;
  if (!cleanCurrentControlCohort(service, release, attempt, current)) {
    // The source raced a current-member mutation after PAUSE. Keep it closed
    // and defer to a *new* release attempt instead of falling through to
    // ENABLE or treating the earlier, now stale facts as permission.
    return attemptRefusal({...request, release}, OUTCOME.STALE);
  }
  const resumed = await actOnCohort(handler, release, attempt, ACTION.RESUME,
    current, {census: current});
  const refusal = resumed.find((answer) => answer.outcome !== OUTCOME.RESUMED);
  return refusal ?? releaseAnswer(OUTCOME.CUT_OVER, {...request, release},
    {release, census: current});
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
      {missingFact: MISSING_FACT.RELEASE_DEADLINE});
  }
  const service = localLeader(handler, request);
  if (service === null) {
    return attemptRefusal(request, OUTCOME.UNAVAILABLE,
      {missingFact: MISSING_FACT.HOSTED_PARTITION});
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
      {missingFact: MISSING_FACT.FRESH_STORAGE_OR_OPERATOR_AUTHORITY});
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
      {missingFact: MISSING_FACT.COMMITTED_REPLICA_ROUTES});
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
  const blockedDrain = census.find((facts) => !isReleaseDrained(facts.work));
  if (blockedDrain !== undefined) {
    return attemptRefusal({...request, release}, OUTCOME.DRAIN_PENDING,
      {blockedDrain: {generation: blockedDrain.generation, work: blockedDrain.work}});
  }
  const currentControl = await proveCurrentControlCohort(handler, service,
    request, release, attempt, cohort, census);
  if (currentControl !== null) return currentControl;
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
  if (defect !== null) return attemptRefusal({...request, release}, defect);
  const application = await enableAndObserveCohort(handler, release, attempt,
    census, local, queryRelease.queryDrainProof);
  if (application !== null) return application;
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
  if (finalDefect !== null) return attemptRefusal({...request, release}, finalDefect);
  const currentControlOwner = await releaseControlOwnerFirst(handler, service, request);
  if (currentControlOwner !== null) return currentControlOwner;
  const resumed = await actOnCohort(handler, release, attempt, ACTION.RESUME, census,
    {census, queryDrainProof: finalQueryDrainProof});
  const refusal = resumed.find((answer) => answer.outcome !== OUTCOME.RESUMED);
  return refusal ?? releaseAnswer(OUTCOME.CUT_OVER, {...request, release},
    {release, census});
}

async function joinParticipantCutover(handler, current) {
  const joinObservation = readParticipantReleaseClock(handler.timeSource);
  const answer = await current.promise;
  const terminalObservation = readParticipantReleaseClock(handler.timeSource);
  if (answer.outcome === OUTCOME.CUT_OVER) return answer;
  const joinedAttempt = participantReleaseAttemptAgeObservation(
    current.startObservation,
    joinObservation,
    terminalObservation,
    current.originalTrigger,
  );
  return releaseAnswer(answer.outcome, answer, {...answer, joinedAttempt});
}

async function runParticipantCutover(handler, request) {
  const runs = runsFor(handler);
  const current = runs.get(request.partitionId);
  if (current) {
    // A held control wave has no ordinary CUT_OVER promise to join. Recovery
    // and unrelated operator attempts cannot accidentally reopen its members.
    if (current.kind === SEED_WAVE_KIND) return waveRefusal(request);
    return current.targetBuildDigest === request.targetBuildDigest ?
      joinParticipantCutover(handler, current) : releaseAnswer(OUTCOME.INVALID, request);
  }
  const originalTrigger = captureParticipantReleaseDiagnosticTrigger(request);
  const startObservation = readParticipantReleaseClock(handler.timeSource);
  const running = runCutoverAttempt(handler, request).catch((error) =>
    attemptRefusal(request, OUTCOME.UNAVAILABLE, {reason: String(error?.message ?? error)}));
  const record = {targetBuildDigest: request.targetBuildDigest, originalTrigger,
    startObservation, promise: running};
  runs.set(request.partitionId, record);
  try {
    return await running;
  } finally {
    if (runs.get(request.partitionId) === record) runs.delete(request.partitionId);
  }
}

export {runParticipantCutover, withFreshSeedControlWave};
