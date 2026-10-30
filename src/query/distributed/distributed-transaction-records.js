import {createHash} from 'node:crypto';

const LOCAL_STR_SHA1 = 'sha1';
const LOCAL_STR_HEX = 'hex';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_COMMITTED = 'COMMITTED';
const LOCAL_STR_ROLLED_BACK = 'ROLLED_BACK';

const distributedTransactionRecordMethods = {
  async persistTransactionRecord(tx) {
    await this.workflowCoordinator.persistWorkflowState(tx.workflowId);
  },

  /**
   * Persist selected participants for a transaction.
   * @param {Object} tx - Transaction state.
   * @param {string[]} partitionIds - Participant IDs to persist.
   * @return {Promise<void>}
   * @private
   */

  async persistParticipants(tx, partitionIds) {
    for (const partitionId of partitionIds) {
      const participant = tx.participants.get(partitionId);
      if (!participant) {
        continue;
      }
      await this.persistParticipantRecord(tx, participant);
    }
  },

  /**
   * Persist one participant record through callback.
   * @param {Object} tx - Transaction state.
   * @param {Object} participant - Participant state.
   * @return {Promise<void>}
   * @private
   */

  async persistParticipantRecord(tx, participant) {
    await this.workflowCoordinator.persistParticipantState(
      tx.workflowId,
      participant.partitionId,
    );
  },

  /**
   * Persist one write-operation record through callback.
   * @param {Object} tx - Transaction state.
   * @param {Object} operation - Write operation metadata.
   * @return {Promise<void>}
   * @private
   */

  async persistWriteOperationRecord(tx, operation) {
    await this.persistWriteOperation({
      operationId: operation.operationId,
      transactionId: tx.transactionId,
      statementType: operation.statementType,
      status: operation.status,
      idempotencyKey: operation.idempotencyKey,
      payloadHash: operation.payloadHash,
      partitionIds: operation.partitionIds,
      retryCount: operation.retryCount,
      lastError: operation.lastError,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    });
  },

  /**
   * Build transaction ID.
   * @param {string} sessionId - Session ID.
   * @return {string} Transaction ID.
   * @private
   */

  createTransactionId(sessionId) {
    return `tx-${sessionId}-${this.now()}`;
  },
};

const {
  persistTransactionRecord,
  persistParticipants,
  persistParticipantRecord,
  persistWriteOperationRecord,
  createTransactionId,
} = distributedTransactionRecordMethods;

/**
 * Build a deterministic participant ID.
 * @param {string} transactionId - Transaction ID.
 * @param {string} partitionId - Partition ID.
 * @return {string} Participant ID.
 * @private
 */

function createParticipantId(transactionId, partitionId) {
  return `${transactionId}:${partitionId}`;
}

/**
 * Build payload hash for write operation persistence.
 * @param {Object} operation - Write operation metadata.
 * @return {string} Payload hash.
 * @private
 */

function createWritePayloadHash(operation) {
  const payload = JSON.stringify({
    operationId: operation.operationId,
    statementType: operation.statementType,
    partitionIds: operation.partitionIds || [],
  });
  return createHash(LOCAL_STR_SHA1).update(payload).digest(LOCAL_STR_HEX);
}

/**
 * Parse serialized JSON array payloads.
 * @param {*} value - Raw value.
 * @return {string[]} Parsed array.
 * @private
 */

function parseJsonArrayField(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value !== LOCAL_STR_STRING || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch (_parseErr) {
    return [];
  }
}

/**
 * Resolve one numeric field from snake_case/camelCase row keys.
 * @param {Object} row - Source row.
 * @param {string} snakeKey - Snake-case key.
 * @param {string} camelKey - Camel-case key.
 * @return {number|null} Parsed numeric value.
 * @private
 */

function resolveFiniteNumberField(row, snakeKey, camelKey) {
  if (Number.isFinite(row?.[snakeKey])) {
    return row[snakeKey];
  }
  if (Number.isFinite(row?.[camelKey])) {
    return row[camelKey];
  }
  return null;
}

/**
 * Return ordered participant IDs for API responses.
 * @param {Object} tx - Transaction state.
 * @return {string[]} Ordered participant IDs.
 * @private
 */

function getOrderedParticipantIds(tx) {
  return Array.from(tx.participants.keys()).sort();
}

/**
 * Return ordered participant details for API responses.
 * @param {Object} tx - Transaction state.
 * @return {Object[]} Ordered participant records.
 * @private
 */

function getOrderedParticipantDetails(tx) {
  return Array.from(tx.participants.values())
    .map((participant) => ({...participant}))
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
}

function resolveEnlistDeadlockState(
  transactionsBySession,
  tx,
  targetPartitionId,
  newlyEnlisted = [],
) {
  if (!transactionsBySession || !tx || !targetPartitionId) {
    return {inCycle: false, isVictim: false};
  }
  const heldByTx = new Set([
    ...(tx.participants ? tx.participants.keys() : []),
    ...newlyEnlisted,
  ]);
  let currentPartitionId = targetPartitionId;
  const visitedPartitions = new Set();
  const cycleTransactions = [tx];

  while (currentPartitionId) {
    if (visitedPartitions.has(currentPartitionId)) {
      break;
    }
    visitedPartitions.add(currentPartitionId);
    let holderTx = null;
    const sessionTxs = typeof transactionsBySession.values === 'function' ?
      transactionsBySession.values() :
      Object.values(transactionsBySession);
    for (const otherTx of sessionTxs) {
      if (otherTx === tx) {
        continue;
      }
      const holdsPartition =
        Boolean(otherTx.participants?.has?.(currentPartitionId)) ||
        Boolean(otherTx.enlistingPartitionIds?.has?.(currentPartitionId));
      if (holdsPartition) {
        holderTx = otherTx;
        break;
      }
    }
    if (!holderTx || !holderTx.waitingForPartitionId) {
      return {inCycle: false, isVictim: false};
    }
    cycleTransactions.push(holderTx);
    if (heldByTx.has(holderTx.waitingForPartitionId)) {
      let victim = cycleTransactions[0];
      for (let i = 1; i < cycleTransactions.length; i += 1) {
        const candidate = cycleTransactions[i];
        const victimEpoch = Number(victim.transactionEpoch) || 0;
        const candidateEpoch = Number(candidate.transactionEpoch) || 0;
        if (candidateEpoch > victimEpoch) {
          victim = candidate;
        } else if (candidateEpoch === victimEpoch) {
          const victimId = String(victim.transactionId || '');
          const candidateId = String(candidate.transactionId || '');
          if (candidateId.localeCompare(victimId) > 0) {
            victim = candidate;
          }
        }
      }
      return {inCycle: true, isVictim: victim === tx};
    }
    currentPartitionId = holderTx.waitingForPartitionId;
  }
  return {inCycle: false, isVictim: false};
}

/**
 * Prepare and filter transaction rows for recovery.
 * Evicts terminal or superseded transactions from coordinator state and
 * filters out stale or unexpired active rows during recovery sweeps.
 * @param {Object} coordinator - Distributed transaction coordinator instance.
 * @param {Object[]} transactionRows - Raw transaction rows.
 * @param {Object} [options] - Recovery options.
 * @param {boolean} [options.sweepOnlyExpired] - Filter non-expired active rows.
 * @param {number} [options.now] - Current timestamp.
 * @return {Object[]} Filtered and ordered transaction rows.
 */
function prepareRecoveryTransactionRows(coordinator, transactionRows, options = {}) {
  const rows = Array.isArray(transactionRows) ? [...transactionRows] : [];
  rows.sort((a, b) => {
    const aCreated = Number(a?.created_at ?? a?.createdAt ?? 0);
    const bCreated = Number(b?.created_at ?? b?.createdAt ?? 0);
    return aCreated - bCreated;
  });

  const latestBySession = new Map();
  const terminalRowsByTxId = new Map();

  for (const row of rows) {
    const sessionId = String(row?.session_id ?? row?.sessionId ?? '');
    const txId = String(row?.transaction_id ?? row?.transactionId ?? '');
    const status = String(row?.status || '');
    const createdAt = Number(row?.created_at ?? row?.createdAt ?? 0);
    const epoch = Number(row?.transaction_epoch ?? row?.transactionEpoch);

    if (status === LOCAL_STR_COMMITTED || status === LOCAL_STR_ROLLED_BACK) {
      if (txId) {
        terminalRowsByTxId.set(txId, row);
      }
    }

    if (sessionId) {
      const current = latestBySession.get(sessionId);
      const finiteEpoch = Number.isFinite(epoch) ? epoch : 0;
      if (!current) {
        latestBySession.set(sessionId, {
          maxCreatedAt: createdAt,
          maxEpoch: finiteEpoch,
          latestTransactionId: txId,
          latestStatus: status,
        });
      } else {
        if (createdAt > current.maxCreatedAt) {
          current.maxCreatedAt = createdAt;
          current.latestTransactionId = txId;
          current.latestStatus = status;
        }
        if (Number.isFinite(epoch) && epoch > current.maxEpoch) {
          current.maxEpoch = epoch;
        }
      }
    }
  }

  const priorRecoveredIds = new Set(
    coordinator?.recoveredTransactionIds ?
      Array.from(coordinator.recoveredTransactionIds) :
      [],
  );

  if (coordinator?.recoveredTransactionIds instanceof Set) {
    for (const recoveredTxId of Array.from(coordinator.recoveredTransactionIds)) {
      const existingTx = coordinator.transactions?.get(recoveredTxId) ||
        coordinator.workflowCoordinator?.getWorkflowById(recoveredTxId);
      if (!existingTx) {
        coordinator.recoveredTransactionIds.delete(recoveredTxId);
        continue;
      }
      const hasTerminalRow = terminalRowsByTxId.has(recoveredTxId);
      const sessionLatest = existingTx.sessionId ?
        latestBySession.get(existingTx.sessionId) :
        null;
      const isSuperseded = Boolean(
        sessionLatest &&
        (sessionLatest.maxCreatedAt > Number(existingTx.createdAt || 0) ||
          sessionLatest.maxEpoch > Number(existingTx.transactionEpoch || 0)),
      );
      if (hasTerminalRow || isSuperseded) {
        coordinator.workflowCoordinator?.removeWorkflow(recoveredTxId);
        coordinator.recoveredTransactionIds.delete(recoveredTxId);
      }
    }
  }

  const filteredRows = [];
  for (const row of rows) {
    const txId = String(row?.transaction_id ?? row?.transactionId ?? '');
    const status = String(row?.status || '');
    const isTerminal = status === LOCAL_STR_COMMITTED || status === LOCAL_STR_ROLLED_BACK;

    if (isTerminal) {
      if (priorRecoveredIds.has(txId) || coordinator?.recoveredTransactionIds?.has(txId)) {
        filteredRows.push(row);
      }
      continue;
    }

    const sessionId = String(row?.session_id ?? row?.sessionId ?? '');
    const sessionLatest = sessionId ? latestBySession.get(sessionId) : null;
    if (sessionLatest) {
      const createdAt = Number(row?.created_at ?? row?.createdAt ?? 0);
      const epoch = Number(row?.transaction_epoch ?? row?.transactionEpoch);
      if (createdAt < sessionLatest.maxCreatedAt) {
        continue;
      }
      if (Number.isFinite(epoch) && epoch < sessionLatest.maxEpoch) {
        continue;
      }
    }

    if (options?.sweepOnlyExpired === true) {
      const deadline = Number(row?.timeout_deadline ?? row?.timeoutDeadline);
      const now = Number.isFinite(options?.now) ?
        options.now :
        (typeof coordinator?.now === 'function' ? coordinator.now() : Date.now());
      if (!Number.isFinite(deadline) || now <= deadline) {
        continue;
      }
    }

    filteredRows.push(row);
  }

  return filteredRows;
}

export {
  persistTransactionRecord,
  persistParticipants,
  persistParticipantRecord,
  persistWriteOperationRecord,
  createTransactionId,
  createParticipantId,
  createWritePayloadHash,
  parseJsonArrayField,
  resolveFiniteNumberField,
  getOrderedParticipantIds,
  getOrderedParticipantDetails,
  resolveEnlistDeadlockState,
  prepareRecoveryTransactionRows,
};
