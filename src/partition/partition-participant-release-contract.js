// Canonical release identity and census validation. The census consists of
// replies read from each exact current member's owners, never progress from
// a leader's replication transport. Local resume re-reads its own facts.
import {createHash} from 'node:crypto';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {COMMITTED_MEMBERSHIP_MAX_PEERS} from '../raft/raft-committed-membership-constants.js';
import {PARTITION_ROWID_LIMIT} from './partition-statement-admission-constants.js';
import {TRANSACTION_RELEASE_CENSUS_STATE, TRANSACTION_RELEASE_TERMINAL_STATUS} from
  '../query/distributed/distributed-transaction-release-census.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME, PARTICIPANT_RELEASE_VERSION} from
  './partition-participant-transaction-cutover-constants.js';

const DIGEST = 'sha256';
const ENCODING = 'hex';
const GENERATION_FIELDS = Object.freeze(['nodeId', 'ownerIncarnation', 'replicaId',
  'lifecycleIncarnation', 'runtimeGeneration', 'connectionGeneration', 'admissionGeneration']);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const WITHOUT_ROWID = 'without_rowid';
const ROWID = 'rowid';
const RELEASE_PROOF_KIND = 'transaction_release_invocation_v1';
const RELEASE_PROOF_FIELDS = Object.freeze(['kind', 'releaseId', 'term',
  'leaderReplicaId', 'schemaVersion', 'semanticVersion',
  'rowGenerationDigest', 'transactions']);
const RELEASE_PROOF_RESULT_FIELDS = Object.freeze(['transactionId', 'decision',
  'decisionDigest', 'terminalStatus', 'participantIds']);
const numberIsSafeInteger = Number.isSafeInteger;
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const ordinal = (value) => numberIsSafeInteger(value) && value >= 0;
const positiveInteger = (value) => numberIsSafeInteger(value) && value > 0;
const incarnation = (value) => nonempty(value) || positiveInteger(value);

function exactRecord(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function transactionReleaseProofValid(proof, {release, attempt, census}) {
  if (!exactRecord(proof, RELEASE_PROOF_FIELDS) ||
      proof.kind !== RELEASE_PROOF_KIND || proof.releaseId !== release?.releaseId ||
      proof.term !== attempt?.term || proof.leaderReplicaId !== attempt?.leaderReplicaId ||
      proof.schemaVersion !== census?.schemaVersion ||
      proof.semanticVersion !== census?.semanticVersion ||
      proof.rowGenerationDigest !== census?.rowGenerationDigest ||
      !Array.isArray(proof.transactions) ||
      proof.transactions.length !== census?.recoverableTransactionIds?.length) return false;
  return proof.transactions.every((entry, index) =>
    exactRecord(entry, RELEASE_PROOF_RESULT_FIELDS) &&
    entry.transactionId === census.recoverableTransactionIds[index] &&
    Object.keys(TRANSACTION_RELEASE_TERMINAL_STATUS).includes(entry.decision) &&
    entry.terminalStatus === TRANSACTION_RELEASE_TERMINAL_STATUS[entry.decision] &&
    DIGEST_PATTERN.test(entry.decisionDigest) && Array.isArray(entry.participantIds) &&
    entry.participantIds.every(nonempty));
}

function releaseIdentityOf({partitionId, targetBuildDigest, configurationKey,
  membershipGenerationIndex}) {
  if (!nonempty(partitionId) || !DIGEST_PATTERN.test(targetBuildDigest) ||
      !nonempty(configurationKey) || !ordinal(membershipGenerationIndex)) return null;
  const identity = {partitionId, protocolVersion: PARTICIPANT_RELEASE_VERSION,
    targetBuildDigest, configurationKey, membershipGenerationIndex};
  const releaseId = createHash(DIGEST).update(JSON.stringify(identity)).digest(ENCODING);
  return Object.freeze({...identity, releaseId});
}

function releaseIdentityValid(release) {
  const canonical = release && releaseIdentityOf(release);
  return canonical !== null && release.protocolVersion === canonical.protocolVersion &&
    release.releaseId === canonical.releaseId;
}

function sameReplicaGeneration(left, right) {
  return left != null && right != null &&
    GENERATION_FIELDS.every((field) => left[field] != null && left[field] === right[field]);
}

function participantReleaseGenerationValid(generation) {
  return generation !== null && typeof generation === 'object' &&
    nonempty(generation.nodeId) && nonempty(generation.replicaId) &&
    positiveInteger(generation.ownerIncarnation) &&
    incarnation(generation.lifecycleIncarnation) &&
    positiveInteger(generation.runtimeGeneration) &&
    positiveInteger(generation.connectionGeneration) &&
    positiveInteger(generation.admissionGeneration);
}

function releaseMemberIds(membership) {
  if (!membership || !Array.isArray(membership.voters) || membership.voters.length === 0 ||
      !Array.isArray(membership.learners) || membership.votersOutgoing?.length !== 0 ||
      membership.learnersNext?.length !== 0) return null;
  const peers = [...membership.voters, ...membership.learners];
  const identities = peers.map((id) => membership.identities?.[id]);
  return peers.length <= COMMITTED_MEMBERSHIP_MAX_PEERS &&
    identities.every(nonempty) && new Set(identities).size === peers.length ?
    identities.sort() : null;
}

function originEqual(left, right) {
  return left != null && right != null && ordinal(left.originIndex) && left.originIndex > 0 &&
    ordinal(left.originTerm) && left.originTerm > 0 &&
    left.originIndex === right.originIndex && left.originTerm === right.originTerm;
}

function rowidValid(rowid) {
  if (rowid?.kind === WITHOUT_ROWID) return rowid.maximum === null;
  if (rowid?.kind !== ROWID) return false;
  if (rowid.maximum === null) return true;
  try {
    return typeof rowid.maximum === 'string' &&
      BigInt(rowid.maximum) < PARTITION_ROWID_LIMIT.CEILING;
  } catch {
    return false;
  }
}

function isReleaseDrained(work) {
  return work?.sqliteTransactionOpen === false && work.participantStaging === false &&
    work.participantPrepared === 0 && work.proposals === 0 && work.pendingOutcomes === 0 &&
    work.appliedIndex === work.commitIndex && work.commitIndex === work.lastIndex;
}

function releaseFactsDefect(release, facts, options = {}) {
  const {originRequired = true} = options;
  if (facts?.outcome !== OUTCOME.OBSERVED || !facts.membership || !facts.generation ||
      !facts.connection || !facts.work) return OUTCOME.UNAVAILABLE;
  if (facts.partitionId !== release.partitionId ||
      facts.membership.configurationKey !== release.configurationKey ||
      facts.membership.membershipGenerationIndex !== release.membershipGenerationIndex ||
      facts.confChangePending !== false || releaseMemberIds(facts.membership) === null) {
    return OUTCOME.STALE;
  }
  if (facts.buildDigest !== release.targetBuildDigest) return OUTCOME.BUILD_MISMATCH;
  if (facts.paused !== true || !sameReplicaGeneration(facts.generation, facts.generation) ||
      !nonempty(facts.leaderReplicaId) || !ordinal(facts.membership.term) ||
      facts.membership.term === 0) return OUTCOME.STALE;
  if (!isReleaseDrained(facts.work)) return OUTCOME.DRAIN_PENDING;
  if (facts.topology !== null) return OUTCOME.TOPOLOGY_PENDING;
  if (!rowidValid(facts.rowid)) return OUTCOME.ROWID_CEILING_REACHED;
  if (facts.queryCensus !== null) {
    const query = facts.queryCensus;
    const invocationSettled = query.state === TRANSACTION_RELEASE_CENSUS_STATE.HELD &&
      transactionReleaseProofValid(options.queryDrainProof,
        {release, attempt: options.attempt, census: query});
    const beforeOriginClear = query.state === TRANSACTION_RELEASE_CENSUS_STATE.CLEAR ||
      (originRequired === false &&
        query.state === TRANSACTION_RELEASE_CENSUS_STATE.EMPTY_LEGACY_SCHEMA) ||
      invocationSettled;
    if (!beforeOriginClear) return OUTCOME.QUERY_DRAIN_PENDING;
  }
  if (originRequired && (!originEqual(facts.origin, facts.origin) ||
      facts.membership.appliedIndex < facts.origin.originIndex)) {
    return OUTCOME.ORIGIN_REPLICATION_PENDING;
  }
  return null;
}

function releaseCensusDefect(release, census, local, options = {}) {
  if (!releaseIdentityValid(release) || !Array.isArray(census) ||
      census.length > COMMITTED_MEMBERSHIP_MAX_PEERS) return OUTCOME.INVALID;
  const members = releaseMemberIds(local?.membership);
  if (members === null || census.length !== members.length) return OUTCOME.CENSUS_REFUSED;
  const seen = new Set();
  for (const facts of census) {
    const defect = releaseFactsDefect(release, facts, options);
    if (defect !== null) return defect;
    const replicaId = facts.generation.replicaId;
    const sameOrigin = originEqual(facts.origin, local.origin) ||
      (options.originRequired === false && facts.origin === null && local.origin === null);
    const sameQueryCensus = facts.queryCensus === null && local.queryCensus === null ||
      facts.queryCensus !== null && local.queryCensus !== null &&
      facts.queryCensus.state === local.queryCensus.state &&
      facts.queryCensus.schemaVersion === local.queryCensus.schemaVersion &&
      facts.queryCensus.semanticVersion === local.queryCensus.semanticVersion &&
      facts.queryCensus.rowGenerationDigest === local.queryCensus.rowGenerationDigest &&
      facts.queryCensus.enforcement?.schemaDigest ===
        local.queryCensus.enforcement?.schemaDigest &&
      facts.queryCensus.enforcement?.enforcerDigest ===
        local.queryCensus.enforcement?.enforcerDigest;
    if (!members.includes(replicaId) || seen.has(replicaId) ||
        facts.membership.term !== local.membership.term ||
        facts.leaderReplicaId !== local.leaderReplicaId ||
        !sameOrigin || !sameQueryCensus ||
        JSON.stringify(releaseMemberIds(facts.membership)) !== JSON.stringify(members)) {
      return OUTCOME.CENSUS_REFUSED;
    }
    seen.add(replicaId);
  }
  const own = census.find((facts) => facts.generation.replicaId === local.generation.replicaId);
  return !sameReplicaGeneration(own?.generation, local.generation) ? OUTCOME.STALE :
    releaseFactsDefect(release, local, options);
}

function releaseAnswer(outcome, request = {}, fields = {}) {
  return deepFreeze({outcome, releaseId: request.release?.releaseId ?? null,
    partitionId: request.partitionId ?? request.release?.partitionId ?? null,
    phase: request.action ?? null, ...fields});
}

export {isReleaseDrained, originEqual, releaseAnswer, releaseCensusDefect,
  participantReleaseGenerationValid, releaseIdentityOf,
  releaseIdentityValid, releaseMemberIds,
  sameReplicaGeneration,
  transactionReleaseProofValid};
