/** Exact admitted participants in the existing sql_transactions owner row.
 * Append-only while OPEN; the same exact-text CAS closes it before decisions.
 * NULL is unknown legacy authority, never an empty set. */
import {PARTICIPANT_SET_STATE} from '../../constants/index.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../query-constants.js';
import {participantIdOf, participantIdentityOf} from
  './distributed-transaction-identity.js';
import {buildFrozenTransactionDecision} from './distributed-transaction-commit-mode.js';
import {
  PARTICIPANT_ENLISTMENT_MODE,
  PARTICIPANT_STATUS,
  TRANSACTION_STATUS,
} from './distributed-transaction-coordinator-constants.js';
import {
  TRANSACTION_METADATA_PERSIST_PURPOSE,
  resolveNowMs,
} from './distributed-transaction-telemetry.js';

import {participantSetTextOf, readParticipantSet} from
  './distributed-transaction-participant-manifest.js';

const SETTLED_STATUS_REJECTED = 'rejected';

async function settleAllOrThrow(promises) {
  const settled = await Promise.allSettled(promises);
  const rejected = settled.find(
    (entry) => entry.status === SETTLED_STATUS_REJECTED,
  );
  if (rejected) {
    throw rejected.reason;
  }
  return settled.map((entry) => entry.value);
}

function incompleteParticipantSet() {
  const error = new Error(QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE);
  error.errorCode = QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE;
  return error;
}

function readOnlyParticipantsOf(tx) {
  if (!(tx.readOnlyParticipants instanceof Map)) {
    tx.readOnlyParticipants = new Map();
  }
  return tx.readOnlyParticipants;
}

async function enlistReadOnlyParticipants(coordinator, tx, sessionId, requested) {
  const readOnlyMap = readOnlyParticipantsOf(tx);
  const volatileTargets = requested.filter(
    (partitionId) => !tx.participants.has(partitionId),
  );
  const now = coordinator.now();
  for (const partitionId of volatileTargets) {
    if (!readOnlyMap.has(partitionId)) {
      readOnlyMap.set(partitionId, {
        workflowId: tx.workflowId,
        transactionId: tx.transactionId,
        participantId: participantIdOf(tx.transactionId, partitionId),
        participantKey: partitionId,
        partitionId,
        status: PARTICIPANT_STATUS.FAILED,
        readOnly: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  const newlyEnlisted = volatileTargets.filter(
    (partitionId) => readOnlyMap.get(partitionId)?.status !== PARTICIPANT_STATUS.ACTIVE,
  );
  await settleAllOrThrow(newlyEnlisted.map(async (partitionId) => {
    await coordinator.beginParticipant(
      sessionId,
      partitionId,
      participantIdentityOf(tx, partitionId),
    );
    const participant = readOnlyMap.get(partitionId);
    if (participant) {
      participant.status = PARTICIPANT_STATUS.ACTIVE;
      participant.updatedAt = coordinator.now();
    }
  }));
  tx.updatedAt = coordinator.now();
  return {success: true, participants: coordinator.getOrderedParticipantIds(tx),
    newlyEnlisted};
}

function collectPromotedActiveParticipants(tx, requested) {
  if (!(tx.readOnlyParticipants instanceof Map)) return [];
  const promoted = [];
  for (const partitionId of requested) {
    const volatileParticipant = tx.readOnlyParticipants.get(partitionId);
    if (!volatileParticipant) continue;
    tx.readOnlyParticipants.delete(partitionId);
    const participant = tx.participants.get(partitionId);
    if (
      participant &&
      volatileParticipant.status === PARTICIPANT_STATUS.ACTIVE
    ) {
      participant.status = PARTICIPANT_STATUS.ACTIVE;
      promoted.push(participant);
    }
  }
  return promoted;
}

function shouldAdvanceFrozenSetToPreparing(coordinator, tx, participantCount, options) {
  if (options?.advanceToPreparing === false || tx.recoveryDiscovered === true) {
    return false;
  }
  if (tx.decision || participantCount === 0 || tx.status !== TRANSACTION_STATUS.ACTIVE) {
    return false;
  }
  return !coordinator.isTransactionBudgetExceeded?.(tx);
}

const distributedTransactionParticipantSetMethods = {
  async persistAdmittedParticipantSet(tx, intended) {
    const purpose = intended?.participantSetState === PARTICIPANT_SET_STATE.FROZEN ?
      TRANSACTION_METADATA_PERSIST_PURPOSE.MANIFEST_FREEZE :
      TRANSACTION_METADATA_PERSIST_PURPOSE.PARTICIPANT_ADMISSION;
    const startedAtMs = resolveNowMs();
    try {
      this.noteMetadataMutation?.(tx, purpose);
      await this.persistTransactionParticipantSet(intended, tx.participantSetText);
      this.noteMetadataPersistElapsed?.(
        tx,
        purpose,
        Math.max(0, resolveNowMs() - startedAtMs),
      );
    } catch (error) {
      this.noteMetadataPersistElapsed?.(
        tx,
        purpose,
        Math.max(0, resolveNowMs() - startedAtMs),
      );
      // Another admission/freeze or a lost answer may own the row. Keep this
      // exact ID on the existing authoritative recovery path, never old bytes.
      tx.recoveryDiscovered = true;
      this.recoveredTransactionIds.add(tx.transactionId);
      throw error;
    }
  },

  async retainParticipantSet(tx, partitionIds) {
    const prior = readParticipantSet(tx.transactionId, tx.participantSetText);
    if (!prior) throw incompleteParticipantSet();
    const text = participantSetTextOf(tx.transactionId,
      [...prior.map((pair) => pair[1]), ...partitionIds]);
    let pairs = prior;
    if (text === tx.participantSetText) {
      if (tx?.telemetry) {
        tx.telemetry.skippedParticipantSetMutations =
          (tx.telemetry.skippedParticipantSetMutations || 0) + 1;
      }
    } else {
      await this.persistAdmittedParticipantSet(tx, {...tx, participantSetText: text});
      tx.participantSetText = text;
      pairs = readParticipantSet(tx.transactionId, text);
    }
    // An admitted identity must survive even if BEGIN or progress persistence
    // fails. Its durable manifest precedes every possible participant request.
    for (const [participantId, partitionId] of pairs) {
      if (!tx.participants.has(partitionId)) {
        tx.participants.set(partitionId, {workflowId: tx.workflowId,
          transactionId: tx.transactionId, participantId, participantKey: partitionId,
          partitionId, status: PARTICIPANT_STATUS.FAILED,
          createdAt: this.now(), updatedAt: this.now()});
      }
    }
  },

  async freezeParticipantSet(tx, options = {}) {
    if (Array.isArray(tx.pendingWriteOperationPersists) &&
        tx.pendingWriteOperationPersists.length > 0) {
      const pending = tx.pendingWriteOperationPersists.splice(0);
      await settleAllOrThrow(pending);
    }
    const pairs = readParticipantSet(tx.transactionId, tx.participantSetText);
    if (!pairs || pairs.length !== tx.participants.size ||
        pairs.some((pair) => !tx.participants.has(pair[1]))) throw incompleteParticipantSet();
    if (tx.participantSetState === PARTICIPANT_SET_STATE.FROZEN) return;
    const decidedAt = this.now();
    const baseFrozen = buildFrozenTransactionDecision({
      transactionMode: tx.transactionMode,
      participantCount: pairs.length,
      decidedAt,
    });
    const frozen = shouldAdvanceFrozenSetToPreparing(this, tx, pairs.length, options) ?
      {...baseFrozen, status: TRANSACTION_STATUS.PREPARING, updatedAt: decidedAt} :
      baseFrozen;
    await this.persistAdmittedParticipantSet(tx, {...tx, ...frozen});
    Object.assign(tx, frozen);
  },

  async enlistParticipantsOwned(
    sessionId,
    partitionIds,
    enlistmentMode = PARTICIPANT_ENLISTMENT_MODE.AUTHORITATIVE,
    options = {},
  ) {
    const tx = this.transactionsBySession.get(sessionId);
    if (!tx) {
      return {success: false, error: QUERY_ERROR_MSG.NO_ACTIVE_TRANSACTION,
        errorCode: QUERY_ERROR_CODE.NO_TRANSACTION};
    }
    const held = this.recoveryObligationStageRefusal(tx, null);
    if (held) return held;
    if (tx.participantSetState !== PARTICIPANT_SET_STATE.OPEN) {
      return {success: false, error: QUERY_ERROR_MSG.TRANSACTION_PARTICIPANTS_FROZEN,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_PARTICIPANTS_FROZEN};
    }
    const requested = Array.from(new Set(partitionIds || []));
    if (enlistmentMode === PARTICIPANT_ENLISTMENT_MODE.VOLATILE_READ) {
      return enlistReadOnlyParticipants(this, tx, sessionId, requested);
    }
    await this.retainParticipantSet(tx, requested);
    const activeUpserts = collectPromotedActiveParticipants(tx, requested);
    const newlyEnlisted = requested.filter((partitionId) =>
      tx.participants.get(partitionId)?.status !== PARTICIPANT_STATUS.ACTIVE);
    await settleAllOrThrow(newlyEnlisted.map(async (partitionId) => {
      const participant = tx.participants.get(partitionId);
      await this.beginParticipant(
        sessionId,
        partitionId,
        participantIdentityOf(tx, partitionId),
      );
      activeUpserts.push(participant);
    }));
    const persistActiveParticipants = () => settleAllOrThrow(
      activeUpserts.map((participant) =>
        this.workflowCoordinator.upsertParticipant(tx.workflowId, {
          ...participant, status: PARTICIPANT_STATUS.ACTIVE, lastError: null,
          updatedAt: this.now(),
        })),
    );
    if (options?.deferActivePersistence !== true) {
      await persistActiveParticipants();
    }
    tx.updatedAt = this.now();
    return {
      success: true,
      participants: this.getOrderedParticipantIds(tx),
      newlyEnlisted,
      ...(options?.deferActivePersistence === true ?
        {persistActiveParticipants} :
        {}),
    };
  },
};

export {readParticipantSet, incompleteParticipantSet,
  distributedTransactionParticipantSetMethods};
