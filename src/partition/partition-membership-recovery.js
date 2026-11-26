// Public entry: buildPartitionMembershipRecoveryCommand,
//   isPinnedMembershipRecoveryCommand, membershipRecoveryCommandDigestOf,
//   stagePartitionMembershipRecoveryIntent,
//   applyPartitionMembershipRecoveryCommand,
//   handleMembershipRecoveryFenceNotice, plus store helpers re-exported from
//   partition-membership-recovery-store.js.
// Required collaborators: PartitionService, RaftRsDurableStore,
//   readSettledOwnerCommandIn / recordCommittedStatementOutcome.
// Durable authority / commit point: _partition_membership_recovery and
//   _partition_statement_outcomes rows committed in applyCommittedEntry.
// Permitted post-commit work: resolveCommittedWrite and emit ENTRY_COMMITTED.
// Recovery / wake entry: _partition_membership_recovery rows reconstruct
//   in-progress permanent member loss transitions across elections.

import {createHash} from 'node:crypto';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
  registerMembershipRecoveryCommandValidator,
} from './partition-committed-command-admission.js';
import {
  readSettledOwnerCommandIn,
  recordCommittedStatementOutcome,
  trackPendingOwnerCommand,
} from './partition-committed-statement-outcome.js';
import {PARTITION_SETTLED_COMMAND_STATE as SETTLED} from
  './partition-committed-statement-outcome-constants.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY,
  PARTITION_SERVICE_EVENT,
} from './partition-service-constants.js';
import {reservePartitionRaftPeerIdentity} from
  './partition-service-raft-membership-administration.js';
import {
  partitionWriteLeadershipRefusalOf,
  startPartitionRaftWriteCommit,
} from './partition-service-raft-write-commit.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_ERROR as ERROR,
  PARTITION_MEMBERSHIP_RECOVERY_OUTCOME as OUTCOME,
  PARTITION_MEMBERSHIP_RECOVERY_RESULT_FIELD as RESULT_FIELD,
  PARTITION_MEMBERSHIP_RECOVERY_SQL as SQL,
  PARTITION_MEMBERSHIP_RECOVERY_TYPE,
} from './partition-membership-recovery-constants.js';
import {
  checkExcludedMemberEnvelopeFence,
  deriveCanonicalPeerIdString,
  ensureMembershipRecoveryTables,
  excludedMemberFenceRefusalOf,
  isLocalReplicaExcludedFenced,
  isPeerExcludedInGroup,
  markLocalReplicaExcludedFence,
  readCommittedMembershipRecoveriesIn,
  readCommittedMembershipRecoveryByEntryIn,
  readCommittedMembershipRecoveryByIdIn,
  readPartitionMemberBinding,
  recordPartitionMemberBinding,
  recoveryRowMatchesCommand,
  resolveAuthoritativeMemberBinding,
  validateMembershipRecoveryBinding,
  validateMembershipRecoveryIntentAtLogEntry,
} from './partition-membership-recovery-store.js';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const COMMAND_KEYS = Object.freeze([
  'type',
  'entryId',
  'decisionId',
  'partitionId',
  'configurationKey',
  'membershipGenerationIndex',
  'sourcePeerId',
  'sourceReplicaId',
  'sourceReplicaCreatedAt',
  'sourceNodeId',
  'sourceNodeBootIncarnation',
  'targetPeerId',
  'targetReplicaId',
  'targetReplicaCreatedAt',
  'targetNodeId',
  'targetNodeBootIncarnation',
  'timestamp',
  'proposedBy',
  'proposedAt',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
}

function buildPartitionMembershipRecoveryCommand(service, payload) {
  const validation = validateMembershipRecoveryBinding(payload);
  if (!validation.valid) return null;
  const {normalized} = validation;
  if (normalized.partitionId !== service?.partitionId) return null;
  return Object.freeze({
    type: PARTITION_MEMBERSHIP_RECOVERY_TYPE,
    entryId: normalized.entryId,
    decisionId: normalized.decisionId,
    partitionId: normalized.partitionId,
    configurationKey: normalized.configurationKey,
    membershipGenerationIndex: normalized.membershipGenerationIndex,
    sourcePeerId: normalized.sourcePeerId,
    sourceReplicaId: normalized.sourceReplicaId,
    sourceReplicaCreatedAt: normalized.sourceReplicaCreatedAt,
    sourceNodeId: normalized.sourceNodeId,
    sourceNodeBootIncarnation: normalized.sourceNodeBootIncarnation,
    targetPeerId: normalized.targetPeerId,
    targetReplicaId: normalized.targetReplicaId,
    targetReplicaCreatedAt: normalized.targetReplicaCreatedAt,
    targetNodeId: normalized.targetNodeId,
    targetNodeBootIncarnation: normalized.targetNodeBootIncarnation,
    timestamp: service.hlcClock.now().toString(),
    proposedBy: service.replicaId,
    proposedAt: service.timeSource.now(),
  });
}

function isPinnedMembershipRecoveryCommand(command) {
  const record = copyStrictOwnDataRecord(command);
  if (record === null) return false;
  const keys = Object.keys(record);
  if (keys.length !== COMMAND_KEYS.length ||
      !COMMAND_KEYS.every((key) => Object.hasOwn(record, key))) {
    return false;
  }
  if (record.type !== PARTITION_MEMBERSHIP_RECOVERY_TYPE ||
      !isNonEmptyString(record.timestamp) ||
      !isNonEmptyString(record.proposedBy) ||
      !isNonNegativeSafeInteger(record.proposedAt)) {
    return false;
  }
  const validation = validateMembershipRecoveryBinding(record);
  return validation.valid &&
    record.entryId === validation.normalized.entryId &&
    record.decisionId === validation.normalized.decisionId &&
    record.targetPeerId === validation.normalized.targetPeerId;
}

registerMembershipRecoveryCommandValidator(isPinnedMembershipRecoveryCommand);

function membershipRecoveryCommandDigestOf(command) {
  const payload = {
    type: command.type,
    entryId: command.entryId,
    decisionId: command.decisionId,
    partitionId: command.partitionId,
    configurationKey: command.configurationKey,
    membershipGenerationIndex: command.membershipGenerationIndex,
    sourcePeerId: command.sourcePeerId,
    sourceReplicaId: command.sourceReplicaId,
    sourceReplicaCreatedAt: command.sourceReplicaCreatedAt,
    sourceNodeId: command.sourceNodeId,
    sourceNodeBootIncarnation: command.sourceNodeBootIncarnation,
    targetPeerId: command.targetPeerId,
    targetReplicaId: command.targetReplicaId,
    targetReplicaCreatedAt: command.targetReplicaCreatedAt,
    targetNodeId: command.targetNodeId,
    targetNodeBootIncarnation: command.targetNodeBootIncarnation,
  };
  return createHash(DIGEST_ALGORITHM)
    .update(JSON.stringify(payload))
    .digest(DIGEST_ENCODING);
}

function refusalAnswer(service, failureCode, extra = {}) {
  return Object.freeze({
    success: false,
    committed: false,
    partitionId: service?.partitionId ?? null,
    failureCode,
    [RESULT_FIELD]: Object.freeze({
      outcome: OUTCOME.REFUSED,
      failureCode,
    }),
    ...extra,
  });
}

function recoverySuccessAnswer(service, outcome, record, extra = {}) {
  const result = Object.freeze({
    outcome,
    recovery: record,
  });
  return Object.freeze({
    success: true,
    committed: true,
    partitionId: service.partitionId,
    entryId: record.entryId,
    decisionId: record.decisionId,
    logIndex: record.intentLogIndex,
    term: record.intentTerm,
    recovery: record,
    [RESULT_FIELD]: result,
    ...extra,
  });
}

async function stagePartitionMembershipRecoveryIntent(service, payload) {
  if (isLocalReplicaExcludedFenced(service)) {
    return refusalAnswer(service, ERROR.RETIRED_MEMBER_FENCED);
  }
  const bindingValidation = validateMembershipRecoveryBinding(payload);
  if (!bindingValidation.valid) {
    return refusalAnswer(service, bindingValidation.failureCode);
  }
  if (bindingValidation.normalized.partitionId !== service.partitionId) {
    return refusalAnswer(service, ERROR.PARTITION_MISMATCH);
  }
  const leadership = partitionWriteLeadershipRefusalOf(service);
  if (leadership !== null) {
    return Object.freeze({
      ...leadership,
      [RESULT_FIELD]: Object.freeze({
        outcome: OUTCOME.REFUSED,
        failureCode: leadership.failureCode,
      }),
    });
  }
  const command = buildPartitionMembershipRecoveryCommand(service, payload);
  if (command === null) {
    return refusalAnswer(service, ERROR.BYTES);
  }
  const admission = admitCommittedCommand(command, {
    origin: PARTITION_COMMITTED_COMMAND_ORIGIN.MEMBERSHIP_RECOVERY_OWNER,
  });
  if (!admission.admitted) {
    return refusalAnswer(service, admission.code);
  }
  ensureMembershipRecoveryTables(service.db);
  const commandDigest = membershipRecoveryCommandDigestOf(command);
  const settled = readSettledOwnerCommandIn(service.db, {
    entryId: command.entryId,
    commandDigest,
  });
  if (settled.state === SETTLED.OTHER_RECORD) {
    return refusalAnswer(service, ERROR.INTENT_CONFLICT);
  }
  const existingDecision = readCommittedMembershipRecoveryByIdIn(
    service.db, command.decisionId);
  if (existingDecision !== null) {
    return recoveryRowMatchesCommand(existingDecision, command) ?
      recoverySuccessAnswer(service, OUTCOME.REPLAYED, existingDecision, {
        replayed: true,
      }) :
      refusalAnswer(service, ERROR.INTENT_CONFLICT);
  }
  if (settled.state === SETTLED.SAME_COMMAND) {
    const parsed = JSON.parse(settled.recorded.ownerResultText);
    if (parsed?.outcome === OUTCOME.REFUSED) {
      return refusalAnswer(service, parsed.failureCode, {
        committed: true,
        logIndex: settled.recorded.logIndex,
        term: settled.recorded.term,
      });
    }
    const existingByEntry = readCommittedMembershipRecoveryByEntryIn(
      service.db, command.entryId);
    if (existingByEntry !== null) {
      return recoverySuccessAnswer(service, OUTCOME.REPLAYED, existingByEntry, {
        replayed: true,
      });
    }
  }
  const precheck = validateMembershipRecoveryIntentAtLogEntry(service, command, {
    checkPendingConfChange: true,
  });
  if (!precheck.valid) {
    return refusalAnswer(service, precheck.failureCode);
  }
  if (precheck.replayed === true && precheck.record) {
    return recoverySuccessAnswer(service, OUTCOME.REPLAYED, precheck.record, {
      replayed: true,
    });
  }
  return trackPendingOwnerCommand(
    service,
    {command, commandDigest},
    startPartitionRaftWriteCommit(service, {
      entry: command,
      phaseTimings: null,
      applyStartMs: service.timeSource.now(),
      park: false,
    }),
  );
}

function applyPartitionMembershipRecoveryCommand(service, committed) {
  const {command, index, term, afterCommit, afterRollback} = committed;
  if (command?.partitionId !== service.partitionId ||
      !isPinnedMembershipRecoveryCommand(command)) {
    throw new Error(ERROR.BYTES);
  }
  ensureMembershipRecoveryTables(service.db);
  const entryKey = service.getCommittedEntryKey(command);
  const commandDigest = membershipRecoveryCommandDigestOf(command);
  const settled = readSettledOwnerCommandIn(service.db, {
    entryId: command.entryId,
    commandDigest,
  });
  if (settled.state === SETTLED.OTHER_RECORD) {
    const conflictAnswer = refusalAnswer(service, ERROR.INTENT_CONFLICT, {
      committed: true,
      logIndex: index,
      term,
    });
    afterCommit(() => service.resolveCommittedWrite(command.entryId, conflictAnswer));
    return APPLY.REPLAYED;
  }
  if (settled.state === SETTLED.SAME_COMMAND) {
    const parsed = JSON.parse(settled.recorded.ownerResultText);
    const replayAnswer = parsed?.outcome === OUTCOME.REFUSED ?
      refusalAnswer(service, parsed.failureCode, {
        committed: true,
        logIndex: settled.recorded.logIndex,
        term: settled.recorded.term,
      }) :
      recoverySuccessAnswer(service, OUTCOME.REPLAYED,
        readCommittedMembershipRecoveryByIdIn(service.db, command.decisionId) ??
        parsed.recovery, {replayed: true});
    afterCommit(() => service.resolveCommittedWrite(command.entryId, replayAnswer));
    return APPLY.REPLAYED;
  }
  try {
    const validation = validateMembershipRecoveryIntentAtLogEntry(service, command, {
      checkPendingConfChange: false,
    });
    if (!validation.valid) {
      const refusedResult = Object.freeze({
        outcome: OUTCOME.REFUSED,
        failureCode: validation.failureCode,
      });
      recordCommittedStatementOutcome(service, {
        entryKey,
        outcome: APPLY.APPLIED,
        index,
        term,
        result: {changes: 0, lastInsertRowid: null},
        ownerResultText: JSON.stringify(refusedResult),
        commandDigest,
      });
      const answer = refusalAnswer(service, validation.failureCode, {
        committed: true,
        logIndex: index,
        term,
      });
      afterCommit(() => service.resolveCommittedWrite(command.entryId, answer));
      return APPLY.APPLIED;
    }
    let record = validation.record ?? null;
    let outcome = OUTCOME.REPLAYED;
    if (record === null) {
      service.db.prepare(SQL.INSERT_RECOVERY).run(
        command.decisionId,
        command.entryId,
        command.partitionId,
        command.configurationKey,
        command.membershipGenerationIndex,
        command.sourcePeerId,
        command.sourceReplicaId,
        command.sourceReplicaCreatedAt,
        command.sourceNodeId,
        command.sourceNodeBootIncarnation,
        command.targetPeerId,
        command.targetReplicaId,
        command.targetReplicaCreatedAt,
        command.targetNodeId,
        command.targetNodeBootIncarnation,
        index,
        term,
      );
      recordPartitionMemberBinding(service.db, {
        replicaId: command.sourceReplicaId,
        peerId: command.sourcePeerId,
        nodeId: command.sourceNodeId,
        nodeBootIncarnation: command.sourceNodeBootIncarnation,
        replicaCreatedAt: command.sourceReplicaCreatedAt,
      });
      recordPartitionMemberBinding(service.db, {
        replicaId: command.targetReplicaId,
        peerId: command.targetPeerId,
        nodeId: command.targetNodeId,
        nodeBootIncarnation: command.targetNodeBootIncarnation,
        replicaCreatedAt: command.targetReplicaCreatedAt,
      });
      reservePartitionRaftPeerIdentity(service, command.targetReplicaId);
      if (service.replicaId === command.sourceReplicaId) {
        markLocalReplicaExcludedFence(service, {
          decisionId: command.decisionId,
          partitionId: command.partitionId,
          sourceReplicaId: command.sourceReplicaId,
          sourcePeerId: command.sourcePeerId,
          sourceNodeId: command.sourceNodeId,
          sourceNodeBootIncarnation: command.sourceNodeBootIncarnation,
          sourceReplicaCreatedAt: command.sourceReplicaCreatedAt,
          configurationKey: command.configurationKey,
          membershipGenerationIndex: command.membershipGenerationIndex,
        });
      }
      record = readCommittedMembershipRecoveryByIdIn(
        service.db, command.decisionId);
      outcome = OUTCOME.COMMITTED;
    }
    const ownerResult = Object.freeze({outcome, recovery: record});
    recordCommittedStatementOutcome(service, {
      entryKey,
      outcome: APPLY.APPLIED,
      index,
      term,
      result: {changes: outcome === OUTCOME.COMMITTED ? 1 : 0, lastInsertRowid: null},
      ownerResultText: JSON.stringify(ownerResult),
      commandDigest,
    });
    const answer = recoverySuccessAnswer(service, outcome, record);
    afterCommit(() => service.resolveCommittedWrite(command.entryId, answer));
    afterCommit(() => service.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
      partitionId: service.partitionId,
      command,
    }));
    return APPLY.APPLIED;
  } catch (error) {
    afterRollback(() => service.rejectCommittedWrite(command.entryId, error));
    throw error;
  }
}

function handleMembershipRecoveryFenceNotice(service, payload) {
  const recovery = payload?.recovery ?? null;
  if (!service || !recovery ||
      recovery.partitionId !== service.partitionId ||
      recovery.sourceReplicaId !== service.replicaId) {
    return Object.freeze({success: false, fenced: false});
  }
  markLocalReplicaExcludedFence(service, recovery);
  return Object.freeze({
    success: true,
    fenced: true,
    partitionId: service.partitionId,
    replicaId: service.replicaId,
  });
}

export {
  applyPartitionMembershipRecoveryCommand,
  buildPartitionMembershipRecoveryCommand,
  checkExcludedMemberEnvelopeFence,
  deriveCanonicalPeerIdString,
  ensureMembershipRecoveryTables,
  excludedMemberFenceRefusalOf,
  handleMembershipRecoveryFenceNotice,
  isLocalReplicaExcludedFenced,
  isPeerExcludedInGroup,
  isPinnedMembershipRecoveryCommand,
  markLocalReplicaExcludedFence,
  membershipRecoveryCommandDigestOf,
  readCommittedMembershipRecoveriesIn,
  readCommittedMembershipRecoveryByIdIn,
  readPartitionMemberBinding,
  recordPartitionMemberBinding,
  resolveAuthoritativeMemberBinding,
  stagePartitionMembershipRecoveryIntent,
  validateMembershipRecoveryBinding,
  validateMembershipRecoveryIntentAtLogEntry,
};
