import {createHash} from 'node:crypto';
import {QUERY_LOG_MSG} from '../query-constants.js';
import {
  mintTransactionId,
  participantIdOf,
} from './distributed-transaction-identity.js';
import {
  TRANSACTION_METADATA_PERSIST_PURPOSE,
} from './distributed-transaction-telemetry.js';

const LOCAL_STR_SHA1 = 'sha1';
const LOCAL_STR_HEX = 'hex';
const LOCAL_STR_STRING = 'string';
const MAX_BUFFERED_WRITE_OPERATION_ROWS = 32;
const MAX_BUFFERED_WRITE_OPERATION_BYTES = 65536;
const BASE_WRITE_OPERATION_ROW_BYTES = 160;
const PER_PARTITION_ID_ESTIMATE_BYTES = 32;

function estimateWriteOperationRowBytes(operation) {
  const opIdBytes = typeof operation?.operationId === LOCAL_STR_STRING ?
    operation.operationId.length : 0;
  const idemBytes = typeof operation?.idempotencyKey === LOCAL_STR_STRING ?
    operation.idempotencyKey.length : 0;
  const hashBytes = typeof operation?.payloadHash === LOCAL_STR_STRING ?
    operation.payloadHash.length : 0;
  const errBytes = typeof operation?.lastError === LOCAL_STR_STRING ?
    operation.lastError.length : 0;
  const partitionBytes = Array.isArray(operation?.partitionIds) ?
    operation.partitionIds.length * PER_PARTITION_ID_ESTIMATE_BYTES : 0;
  return BASE_WRITE_OPERATION_ROW_BYTES +
    opIdBytes + idemBytes + hashBytes + errBytes + partitionBytes;
}

function buildWriteOperationPersistenceRecord(tx, operation) {
  return {
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
  };
}

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
    const participants = [];
    for (const partitionId of partitionIds) {
      const participant = tx.participants.get(partitionId);
      if (participant) {
        participants.push(participant);
      }
    }
    await Promise.all(
      participants.map((participant) =>
        this.persistParticipantRecord(tx, participant)),
    );
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
    await this.persistWriteOperation(
      buildWriteOperationPersistenceRecord(tx, operation),
    );
  },

  /**
   * Persist a batch of write-operation records through batch callback when
   * wired, or fall back to individual persistence callbacks.
   * @param {Object} tx - Transaction state.
   * @param {Object[]} operations - Write operation metadata list.
   * @return {Promise<void>}
   * @private
   */
  async persistWriteOperationRecordsBatch(tx, operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
      return;
    }
    if (operations.length === 1) {
      await this.persistWriteOperationRecord(tx, operations[0]);
      return;
    }
    const payloads = operations.map((operation) =>
      buildWriteOperationPersistenceRecord(tx, operation));
    await this.persistWriteOperationsBatch(payloads);
  },

  enqueueBufferedWriteOperationRecord(tx, operation) {
    if (!Array.isArray(tx.pendingWriteOperationRecords)) {
      tx.pendingWriteOperationRecords = [];
      tx.pendingWriteOperationBytes = 0;
    }
    const existingIndex = tx.pendingWriteOperationRecords.findIndex(
      (entry) => entry.operationId === operation.operationId,
    );
    const estimatedBytes = estimateWriteOperationRowBytes(operation);
    if (existingIndex >= 0) {
      const priorBytes = estimateWriteOperationRowBytes(
        tx.pendingWriteOperationRecords[existingIndex],
      );
      tx.pendingWriteOperationRecords[existingIndex] = operation;
      tx.pendingWriteOperationBytes = Math.max(
        0,
        (tx.pendingWriteOperationBytes || 0) - priorBytes + estimatedBytes,
      );
    } else {
      tx.pendingWriteOperationRecords.push(operation);
      tx.pendingWriteOperationBytes =
        (tx.pendingWriteOperationBytes || 0) + estimatedBytes;
    }
    return (
      tx.pendingWriteOperationRecords.length >=
        MAX_BUFFERED_WRITE_OPERATION_ROWS ||
      tx.pendingWriteOperationBytes >= MAX_BUFFERED_WRITE_OPERATION_BYTES
    );
  },

  flushPendingWriteOperationRecords(tx) {
    if (!tx || !Array.isArray(tx.pendingWriteOperationRecords) ||
        tx.pendingWriteOperationRecords.length === 0) {
      return Promise.resolve();
    }
    const batch = tx.pendingWriteOperationRecords.splice(0);
    tx.pendingWriteOperationBytes = 0;
    this.noteMetadataMutation?.(
      tx,
      TRANSACTION_METADATA_PERSIST_PURPOSE.STATEMENT_OUTCOME,
    );
    return Promise.resolve(
      this.persistWriteOperationRecordsBatch(tx, batch),
    ).catch((persistErr) => {
      this.logger?.warn?.(QUERY_LOG_MSG.DISTRIBUTED_TX_METADATA_PERSIST_WARN, {
        transactionId: tx.transactionId,
        operationId: batch[batch.length - 1]?.operationId ?? null,
        batchSize: batch.length,
        error: persistErr?.message || String(persistErr),
      });
    });
  },

  /**
   * Mint a transaction identity: 128 random bits, with no node, boot
   * incarnation, sequence, session or clock component (TX1 design 2.1, seam
   * B/S). Its uniqueness is the insert-once row's primary key, which BEGIN
   * writes before any participant work.
   * @param {string} _sessionId - Session ID (routing context only).
   * @return {string} Transaction ID.
   * @private
   */

  createTransactionId(_sessionId) {
    return mintTransactionId();
  },
};

const {
  persistTransactionRecord,
  persistParticipants,
  persistParticipantRecord,
  persistWriteOperationRecord,
  persistWriteOperationRecordsBatch,
  enqueueBufferedWriteOperationRecord,
  flushPendingWriteOperationRecords,
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
  return participantIdOf(transactionId, partitionId);
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
  persistWriteOperationRecordsBatch,
  enqueueBufferedWriteOperationRecord,
  flushPendingWriteOperationRecords,
  createTransactionId,
  createParticipantId,
  createWritePayloadHash,
  parseJsonArrayField,
  resolveFiniteNumberField,
  getOrderedParticipantIds,
  getOrderedParticipantDetails,
};
