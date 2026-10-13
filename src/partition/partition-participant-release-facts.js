// Read the existing owners for one live replica. This module stores no
// release authority and never interprets follower matchedIndex as apply.
import {runtimeBuildProvenance, RUNTIME_BUILD_STATE} from
  '../diagnostics/runtime-build-provenance.js';
import {TABLES} from '../constants/tables.js';
import {readTransactionReleaseCensus} from
  '../query/distributed/distributed-transaction-release-census.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND, COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {participantConnectionStampOf} from './partition-participant-transaction-connection.js';
import {participantCutoverPauseOf, participantReleaseAdmissionOf} from
  './partition-participant-transaction-pause.js';
import {hasParticipantSession} from './partition-participant-transaction-session.js';
import {readPreparedParticipantIds, readPartitionWriteOrigin} from
  './partition-participant-transaction-store.js';
import {readTableShape} from './partition-statement-admission-rowid-rules.js';
import {PARTITION_ROWID_LIMIT} from './partition-statement-admission-constants.js';
import {topologyTransitionOf} from './partition-participant-transaction-topology-fence.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  './partition-participant-transaction-cutover-constants.js';

const FACT = Object.freeze({
  HOSTED: 'current_lifecycle_registry', BUILD: 'measured_boot_content',
  MEMBERSHIP: 'committed_membership_witness', GENERATION: 'current_replica_generation',
  ROWID: 'own_table_rowid', DRAIN: 'accepted_work_owners',
});
const ROWID_KIND = Object.freeze({WITHOUT: 'without_rowid', ROWID: 'rowid'});

function unavailable(missingFact, reason = null) {
  return deepFreeze({outcome: OUTCOME.UNAVAILABLE, missingFact, reason});
}

function readRowidCensus(service) {
  const shape = readTableShape(service.db, service.tableName);
  if (!shape.exists || (!shape.withoutRowid && shape.maxRowid === null)) {
    throw new Error(FACT.ROWID);
  }
  const maximum = shape.withoutRowid ? null : shape.maxRowid.get()?.maximum ?? null;
  return Object.freeze({kind: shape.withoutRowid ? ROWID_KIND.WITHOUT : ROWID_KIND.ROWID,
    maximum: maximum === null ? null : String(maximum),
    belowCeiling: maximum === null || BigInt(maximum) < PARTITION_ROWID_LIMIT.CEILING});
}

function readAcceptedWork(service, membership, status) {
  const proposals = service.proposalQueue?.size;
  const pendingOutcomes = service.pendingWriteOutcomes?.size;
  if (![proposals, pendingOutcomes,
    membership.appliedIndex, status.commitIndex, status.lastIndex]
    .every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error(FACT.DRAIN);
  }
  const prepared = readPreparedParticipantIds(service.db);
  return Object.freeze({sqliteTransactionOpen: service.db.inTransaction === true,
    participantStaging: hasParticipantSession(service),
    participantPrepared: prepared.length, proposals, pendingOutcomes,
    appliedIndex: membership.appliedIndex, commitIndex: status.commitIndex,
    lastIndex: status.lastIndex});
}

function isReleaseDrained(work) {
  return work?.sqliteTransactionOpen === false && work.participantStaging === false &&
    work.participantPrepared === 0 && work.proposals === 0 && work.pendingOutcomes === 0 &&
    work.appliedIndex === work.commitIndex && work.commitIndex === work.lastIndex;
}

function replicaGenerationOf(handler, service, status) {
  const connection = participantConnectionStampOf(service.db);
  const admission = participantReleaseAdmissionOf(service);
  return Object.freeze({nodeId: handler.nodeId, ownerIncarnation: handler.ownerIncarnation,
    replicaId: service.replicaId, lifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration, connectionGeneration: connection.generation,
    admissionGeneration: admission.generation});
}

function generationAvailable(generation) {
  return typeof generation.nodeId === 'string' && generation.nodeId.length > 0 &&
    typeof generation.replicaId === 'string' && generation.replicaId.length > 0 &&
    generation.lifecycleIncarnation !== null && generation.lifecycleIncarnation !== undefined &&
    [generation.ownerIncarnation, generation.runtimeGeneration, generation.connectionGeneration]
      .every((value) => Number.isSafeInteger(value) && value > 0);
}

async function readParticipantReleaseFacts(handler, service,
  purpose = COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS) {
  if (!service?.initialized || service.isShutdown ||
      handler.localServices.get(service.replicaId) !== service) return unavailable(FACT.HOSTED);
  const build = await runtimeBuildProvenance();
  if (build.state !== RUNTIME_BUILD_STATE.MEASURED) return unavailable(FACT.BUILD, build.reason);
  try {
    const membership = await service.raft.readCommittedMembership({purpose});
    const status = service.raft.readStatus();
    if (membership.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ||
        status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
        membership.configurationKey !== status.configurationKey ||
        membership.term !== status.term || membership.appliedIndex !== status.appliedIndex) {
      return unavailable(FACT.MEMBERSHIP, membership.reason ?? status.reason);
    }
    const generation = replicaGenerationOf(handler, service, status);
    if (!generationAvailable(generation)) return unavailable(FACT.GENERATION);
    return deepFreeze({outcome: OUTCOME.OBSERVED, partitionId: service.partitionId,
      generation, buildDigest: build.digest, membership,
      leaderReplicaId: status.leaderId, leaderAddress: status.leaderAddress,
      role: status.role, confChangePending: status.confChangePending,
      peers: status.peers, origin: readPartitionWriteOrigin(service.db),
      connection: participantConnectionStampOf(service.db),
      paused: participantCutoverPauseOf(service) !== null,
      rowid: readRowidCensus(service), work: readAcceptedWork(service, membership, status),
      topology: topologyTransitionOf(service),
      queryCensus: service.tableName === TABLES.SQL_TRANSACTIONS ?
        readTransactionReleaseCensus(service.db) : null});
  } catch (error) {
    return unavailable(FACT.MEMBERSHIP, String(error?.message ?? error));
  }
}

export {isReleaseDrained, readParticipantReleaseFacts, replicaGenerationOf};
