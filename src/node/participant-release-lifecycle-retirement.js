import {createHash} from 'node:crypto';
import {TABLES} from '../constants/tables.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {clearParticipantReleaseLocalRetirement,
  readParticipantReleaseLocalCurrent, readParticipantReleaseLocalRetirement,
  retainParticipantReleaseLocalRetirement} from
  '../partition/partition-participant-release-local-current.js';
import {raiseParticipantCutoverPause} from
  '../partition/partition-participant-transaction-pause.js';
import {releaseIdentityOf} from
  '../partition/partition-participant-release-contract.js';
import {parseJson, targetEntryOf, targetEntryValid} from
  '../partition/partition-participant-release-command.js';
import {readParticipantReleaseState} from
  '../partition/partition-participant-transaction-store.js';
import {readParticipantReleaseFacts} from
  '../partition/partition-participant-release-facts.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {askParticipantRelease, releaseNodeOfAddress} from './participant-release-client.js';

function retirementIdOf(current) {
  return createHash('sha256').update(JSON.stringify([
    current.authorizationId, current.target,
  ])).digest('hex');
}

function topologyOwnerOf(handler, service) {
  const serviceEngine = service.sqlQueryEngine ?? null;
  const bridgeEngine = handler.cdcIntegrationService?.sqlQueryEngine ?? null;
  if (serviceEngine !== null && bridgeEngine !== null && serviceEngine !== bridgeEngine) {
    return null;
  }
  return (serviceEngine ?? bridgeEngine)?.queryExecutor
    ?.bootstrapTopologySnapshotOwner ?? null;
}

function topologyControlHint(handler, service, partitionId) {
  const local = [...handler.localServices.values()].find((candidate) =>
    candidate.initialized && !candidate.isShutdown &&
    candidate.partitionId === partitionId &&
    candidate.raft?.readStatus().role === RAFT_ROLE.LEADER);
  if (local) return {nodeId: handler.nodeId, replicaId: local.replicaId};
  const owner = topologyOwnerOf(handler, service);
  const identity = owner?.resolveCanonicalPartitionLeaderIdentity?.(partitionId);
  const nodeId = identity?.leaderNodeId;
  if (typeof nodeId !== 'string' || nodeId.length === 0) return null;
  const rows = owner.getPublishedBootstrapAuthoritativeTableRows(TABLES.SERVICES)
    .filter((row) => row?.partition_id === partitionId && row?.node_id === nodeId &&
      typeof row?.replica_id === 'string' && row.replica_id.length > 0);
  const leaders = rows.filter((row) => String(row.raft_role).toLowerCase() === 'leader');
  const candidates = leaders.length > 0 ? leaders : rows;
  const replicaIds = [...new Set(candidates.map((row) => row.replica_id))];
  return replicaIds.length === 1 ? {nodeId, replicaId: replicaIds[0]} : null;
}

async function reconstructDurableRetirement(handler, service) {
  const state = readParticipantReleaseState(service.db);
  const authorization = parseJson(state.authorizationText);
  const targets = parseJson(authorization?.targetEntriesText);
  if (!Array.isArray(targets) || targets.some((target) => !targetEntryValid(target)) ||
      typeof authorization?.controlAuthorizationId !== 'string' ||
      typeof authorization?.controlPartitionId !== 'string') return null;
  const retiredTarget = targets.find((target) =>
    target.replicaIdentity === service.replicaId) ?? null;
  if (retiredTarget === null) return null;
  const facts = await readParticipantReleaseFacts(handler, service);
  if (facts?.outcome !== OUTCOME.OBSERVED) {
    throw new Error('Current participant release retirement generation unavailable');
  }
  const currentTarget = targetEntryOf(facts);
  if (currentTarget === null) {
    throw new Error('Current participant release retirement generation unavailable');
  }
  if (JSON.stringify(currentTarget) === JSON.stringify(retiredTarget)) {
    return null;
  }
  const hint = topologyControlHint(handler, service, authorization.controlPartitionId);
  if (hint === null) {
    throw new Error('Current participant release retirement route unavailable');
  }
  return Object.freeze({version: 1,
    authorizationId: authorization.controlAuthorizationId,
    retiredTarget,
    controlOwner: Object.freeze({partitionId: authorization.controlPartitionId,
      nodeId: hint.nodeId, replicaId: hint.replicaId,
      attempt: Object.freeze({pauseInvocationId:
        `retained:${authorization.controlAuthorizationId}`})})});
}

async function currentControlRoute(handler, obligation, deadlineAtMs) {
  let nodeId = obligation.controlOwner.nodeId;
  let replicaId = obligation.controlOwner.replicaId;
  for (let reads = 0; reads < 2; reads += 1) {
    const facts = await askParticipantRelease(handler, nodeId, {
      partitionId: obligation.controlOwner.partitionId,
      replicaId,
      action: ACTION.INSPECT,
      leaderCohort: true,
      deadlineAtMs,
    });
    if (facts?.outcome !== OUTCOME.OBSERVED) return null;
    if (facts.leaderReplicaId !== facts.generation.replicaId) {
      const leader = facts.peers.find((peer) =>
        peer.replicaIdentity === facts.leaderReplicaId);
      const leaderNodeId = releaseNodeOfAddress(leader?.address);
      if (leaderNodeId === null) return null;
      nodeId = leaderNodeId;
      replicaId = facts.leaderReplicaId;
      continue;
    }
    const release = releaseIdentityOf({partitionId: facts.partitionId,
      targetBuildDigest: facts.buildDigest,
      configurationKey: facts.membership.configurationKey,
      membershipGenerationIndex: facts.membership.membershipGenerationIndex});
    const target = targetEntryOf(facts);
    if (release === null || target === null) return null;
    return Object.freeze({nodeId, replicaId, release, target: facts.generation,
      attempt: Object.freeze({leaderReplicaId: facts.leaderReplicaId,
        term: facts.membership.term,
        leaderLifecycleIncarnation: facts.generation.lifecycleIncarnation,
        deadlineAtMs,
        pauseInvocationId: obligation.controlOwner.attempt.pauseInvocationId})});
  }
  return null;
}

// A controlled replacement first closes this process's projection, then asks
// the same replicated control slot that granted it to order its retirement.
// The returned result carries no authority by itself: only the committed
// RETIRE apply permits the caller to publish a successor service.
async function retireParticipantReleaseBeforeReplacement(handler, service,
  {deadlineAtMs} = {}) {
  const current = readParticipantReleaseLocalCurrent(service);
  let obligation = readParticipantReleaseLocalRetirement(service);
  if (!Number.isSafeInteger(deadlineAtMs) || deadlineAtMs <= handler.timeSource.now()) {
    throw new Error('Current participant release has no retirement owner');
  }
  if (obligation === null) {
    obligation = current === null ?
      await reconstructDurableRetirement(handler, service) :
      retainParticipantReleaseLocalRetirement(service, current);
  }
  if (obligation === null) return Object.freeze({retired: false});
  raiseParticipantCutoverPause(service);
  const route = await currentControlRoute(handler, obligation, deadlineAtMs);
  if (route === null) {
    throw new Error('Current participant release retirement route unavailable');
  }
  const request = {
    controlOwnerNodeId: route.nodeId,
    partitionId: route.release.partitionId,
    replicaId: route.replicaId,
    release: route.release,
    attempt: route.attempt,
    target: route.target,
    action: ACTION.RETIRE,
    deadlineAtMs,
    controlAuthorization: {
      controlPartitionId: route.release.partitionId,
      authorizationId: obligation.authorizationId,
    },
    retiredTarget: obligation.retiredTarget,
    retirementId: retirementIdOf({authorizationId: obligation.authorizationId,
      target: obligation.retiredTarget}),
  };
  const answer = await askParticipantRelease(handler,
    request.controlOwnerNodeId, request);
  if (answer.outcome !== OUTCOME.RETIRED) {
    throw new Error('Participant release retirement held replacement: ' +
      JSON.stringify(answer));
  }
  clearParticipantReleaseLocalRetirement(service, obligation);
  return Object.freeze({retired: true, answer});
}

export {retireParticipantReleaseBeforeReplacement};
