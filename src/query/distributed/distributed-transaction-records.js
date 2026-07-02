import {createHash} from 'node:crypto';

const LOCAL_STR_SHA1 = 'sha1';
const LOCAL_STR_HEX = 'hex';
const LOCAL_STR_STRING = 'string';

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
};
