/**
 * Connection-owned PostgreSQL wire output batching and backpressure helper.
 *
 * Encodes DataRow frames in byte-bounded batches, respects socket.write()
 * backpressure by awaiting 'drain' (or 'close'/'error'/abort), yields between
 * multi-batch results so concurrent short queries get event-loop turns, and
 * stops cleanly on disconnect while preserving frame and command-tag ordering.
 *
 * @module runtime/pgwire-output-writer
 */

import {
  buildCommandComplete,
  buildNoticeResponse,
  buildPreparedDataRowFrame,
  buildRowDescription,
  encodePreparedDataRowChunks,
  getPreparedDataRowFrameLength,
  prepareDataRowColumns,
} from './pgwire-message-builders.js';
import {
  PG_ERROR_CODE,
  PG_SEVERITY,
} from './pgwire-protocol-constants.js';
import {
  extractColumns,
  extractRowValues,
} from './pgwire-result-mapper.js';
import {OWNER_CONTRACT_STATE} from '../control-plane/owner-contract-outcome.js';

const DEFAULT_PGWIRE_OUTPUT_BATCH_BYTES = 64 * 1024;
const EVENT_DRAIN = 'drain';
const EVENT_CLOSE = 'close';
const EVENT_ERROR = 'error';
const EVENT_ABORT = 'abort';
const LOCAL_STR_STRING = 'string';

function yieldEventLoopTurn() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function columnNameOf(column) {
  return typeof column === LOCAL_STR_STRING ? column : column?.name;
}

function areRawRowsAlignedWithColumns(result, columns) {
  if (!Array.isArray(result?.rawRows) || !Array.isArray(result?.columns)) {
    return false;
  }
  if (result.columns.length !== columns.length) {
    return false;
  }
  for (let index = 0; index < columns.length; index += 1) {
    if (columnNameOf(result.columns[index]) !== columnNameOf(columns[index])) {
      return false;
    }
  }
  if (result.rawRows.length > 0) {
    return true;
  }
  return !Array.isArray(result?.rows) || result.rows.length === 0;
}

function selectExecutionRowSource(result, columns) {
  if (areRawRowsAlignedWithColumns(result, columns)) {
    return result.rawRows;
  }
  return Array.isArray(result?.rows) ? result.rows : null;
}

function buildUnderReplicatedNotice(result) {
  if (result?.contractState !== OWNER_CONTRACT_STATE.UNDER_REPLICATED) {
    return null;
  }
  const ep = result.epoch?.publicationEpoch != null ?
    ` at epoch ${result.epoch.publicationEpoch}` :
    '';
  const msg =
    `Table created under_replicated: ${result.missingReplicaCount ?? 1} replica(s) missing${ep}`;
  return buildNoticeResponse(
    PG_SEVERITY.NOTICE,
    PG_ERROR_CODE.SUCCESSFUL_COMPLETION,
    msg,
  );
}

class PgWireOutputWriter {
  /**
   * @param {Object} options
   * @param {Function} options.getSocket - Returns current connection socket.
   * @param {Function} options.isClosed - Returns true when handler is closed.
   * @param {AbortSignal} [options.abortSignal] - Connection disconnect signal.
   * @param {number} [options.batchMaxBytes] - Max bytes per DataRow batch.
   */
  constructor(options) {
    this._getSocket = options.getSocket;
    this._isClosed = options.isClosed;
    this._abortSignal = options.abortSignal || null;
    this._batchMaxBytes =
      Number.isSafeInteger(options?.batchMaxBytes) && options.batchMaxBytes > 0 ?
        options.batchMaxBytes :
        DEFAULT_PGWIRE_OUTPUT_BATCH_BYTES;
    this._onDataRowChunkEncoded = options?.onDataRowChunkEncoded || null;
    this.encodedDataRowChunks = 0;
    this.maxEncodedChunkBytes = 0;
  }

  _recordEncodedChunk(chunkByteLength, encodedBytes, totalFrameBytes) {
    this.encodedDataRowChunks += 1;
    if (chunkByteLength > this.maxEncodedChunkBytes) {
      this.maxEncodedChunkBytes = chunkByteLength;
    }
    this._onDataRowChunkEncoded?.({
      chunkByteLength,
      encodedBytes,
      totalFrameBytes,
      encodedDataRowChunks: this.encodedDataRowChunks,
    });
  }

  /**
   * Whether the connection is closed or the socket is no longer writable.
   * @return {boolean}
   */
  isDisconnected() {
    if (this._isClosed?.() === true || this._abortSignal?.aborted === true) {
      return true;
    }
    const socket = this._getSocket?.();
    if (!socket) {
      return true;
    }
    return (
      socket.destroyed === true ||
      socket.writableEnded === true ||
      socket.writable === false
    );
  }

  /**
   * Write a buffer to the connection socket and await drain if backpressured.
   * Oversized buffers exceeding the batch threshold are sliced into bounded
   * chunks in exact byte order with backpressure and event-loop yield cadence.
   * @param {Buffer} buffer - Encoded frame or batch buffer.
   * @return {Promise<boolean>} True if connection remains open after write.
   */
  async writeBuffer(buffer) {
    if (!buffer || buffer.length === 0 || this.isDisconnected()) {
      return false;
    }
    if (buffer.length > this._batchMaxBytes) {
      return this._writeOversizedBuffer(buffer, false);
    }
    return this._writeSingleChunk(buffer);
  }

  async _writeSingleChunk(chunk) {
    if (!chunk || chunk.length === 0 || this.isDisconnected()) {
      return false;
    }
    const socket = this._getSocket();
    const canContinue = socket.write(chunk);
    if (canContinue === false && !this.isDisconnected()) {
      await this._waitForDrain(socket);
    }
    return !this.isDisconnected();
  }

  async _writeOversizedBuffer(buffer, yieldAfterLastChunk) {
    for (let offset = 0; offset < buffer.length; offset += this._batchMaxBytes) {
      if (this.isDisconnected()) {
        return false;
      }
      const end = Math.min(offset + this._batchMaxBytes, buffer.length);
      const wrote = await this._writeSingleChunk(buffer.subarray(offset, end));
      if (!wrote) {
        return false;
      }
      if (end < buffer.length || yieldAfterLastChunk) {
        await yieldEventLoopTurn();
        if (this.isDisconnected()) {
          return false;
        }
      }
    }
    return !this.isDisconnected();
  }

  /**
   * Encode and write RowDescription + DataRow frames in byte-bounded batches.
   * @param {Object} result - Execution result.
   * @param {Object} [executionMeta] - Extended query metadata.
   * @return {Promise<void>}
   */
  async writeExecutionRows(result, executionMeta = {}) {
    const isExtended = executionMeta?.extended === true;
    const columns = isExtended ?
      executionMeta.portalDescription.columns :
      extractColumns(result);
    const rows = selectExecutionRowSource(result, columns);
    if (columns.length === 0 || !rows || this.isDisconnected()) {
      return;
    }
    if (!isExtended) {
      const wroteDesc = await this.writeBuffer(buildRowDescription(columns));
      if (!wroteDesc) {
        return;
      }
    }
    await this._writeBatchedDataRows(rows, columns);
  }

  /**
   * Write a tag-validated execution result (RowDescription, DataRow*, notices,
   * CommandComplete). The caller supplies the already-derived command tag so
   * untaggable results fail before any frame is emitted.
   * @param {Object} params
   * @param {Object} params.result - Execution result.
   * @param {Object} params.executionMeta - Execution metadata.
   * @param {string} params.tag - Validated CommandComplete tag.
   * @param {?Buffer} [params.txNotice] - Pre-captured transaction-end notice.
   * @return {Promise<boolean>} True if CommandComplete was written before disconnect.
   */
  async writeExecutionSuccess({
    result,
    executionMeta,
    tag,
    txNotice = null,
  }) {
    await this.writeExecutionRows(result, executionMeta);
    if (this.isDisconnected()) {
      return false;
    }
    const underReplicatedNotice = buildUnderReplicatedNotice(result);
    if (underReplicatedNotice) {
      if (!(await this.writeBuffer(underReplicatedNotice))) {
        return false;
      }
    }
    if (txNotice) {
      if (!(await this.writeBuffer(txNotice))) {
        return false;
      }
    }
    return this.writeBuffer(buildCommandComplete(tag));
  }

  async _prepareOversizedRowStream(batchChunks, batchBytes) {
    if (batchBytes > 0) {
      return this._flushBatchAndYield(batchChunks, batchBytes, true);
    }
    await yieldEventLoopTurn();
    return !this.isDisconnected();
  }

  async _writeOversizedPreparedDataRow(
    prepared,
    batchChunks,
    batchBytes,
    hasMoreRows,
  ) {
    const ready = await this._prepareOversizedRowStream(batchChunks, batchBytes);
    if (!ready) {
      return false;
    }
    const totalFrameBytes = getPreparedDataRowFrameLength(prepared);
    let encodedBytes = 0;
    for (const chunk of encodePreparedDataRowChunks(
      prepared,
      this._batchMaxBytes,
    )) {
      if (this.isDisconnected()) {
        return false;
      }
      encodedBytes += chunk.length;
      this._recordEncodedChunk(chunk.length, encodedBytes, totalFrameBytes);
      const wrote = await this._writeSingleChunk(chunk);
      if (!wrote) {
        return false;
      }
      if (encodedBytes < totalFrameBytes || hasMoreRows) {
        await yieldEventLoopTurn();
        if (this.isDisconnected()) {
          return false;
        }
      }
    }
    return !this.isDisconnected();
  }

  async _writeBatchedDataRows(rows, columns) {
    let batchChunks = [];
    let batchBytes = 0;
    for (let index = 0; index < rows.length; index += 1) {
      if (this.isDisconnected()) {
        return;
      }
      const prepared = prepareDataRowColumns(
        extractRowValues(rows[index], columns),
        columns,
      );
      const frameByteLength = getPreparedDataRowFrameLength(prepared);
      const hasMoreRows = index + 1 < rows.length;
      if (frameByteLength > this._batchMaxBytes) {
        const ok = await this._writeOversizedPreparedDataRow(
          prepared,
          batchChunks,
          batchBytes,
          hasMoreRows,
        );
        batchChunks = [];
        batchBytes = 0;
        if (!ok) {
          return;
        }
        continue;
      }
      if (batchBytes > 0 && batchBytes + frameByteLength > this._batchMaxBytes) {
        const ok = await this._flushBatchAndYield(batchChunks, batchBytes, true);
        batchChunks = [];
        batchBytes = 0;
        if (!ok) {
          return;
        }
      }
      const frame = buildPreparedDataRowFrame(prepared);
      this._recordEncodedChunk(frame.length, frame.length, frameByteLength);
      batchChunks.push(frame);
      batchBytes += frame.length;
      if (batchBytes >= this._batchMaxBytes) {
        const ok = await this._flushBatchAndYield(
          batchChunks,
          batchBytes,
          hasMoreRows,
        );
        batchChunks = [];
        batchBytes = 0;
        if (!ok) {
          return;
        }
      }
    }
    if (batchBytes > 0 && !this.isDisconnected()) {
      await this._flushBatch(batchChunks, batchBytes);
    }
  }

  async _flushBatch(batchChunks, batchBytes) {
    const buffer = batchChunks.length === 1 ?
      batchChunks[0] :
      Buffer.concat(batchChunks, batchBytes);
    return this.writeBuffer(buffer);
  }

  async _flushBatchAndYield(batchChunks, batchBytes, shouldYield) {
    const flushed = await this._flushBatch(batchChunks, batchBytes);
    if (!flushed || this.isDisconnected()) {
      return false;
    }
    if (shouldYield) {
      await yieldEventLoopTurn();
    }
    return !this.isDisconnected();
  }

  _waitForDrain(socket) {
    if (this.isDisconnected() || !socket) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const onWake = () => {
        if (settled) {
          return;
        }
        settled = true;
        socket.removeListener?.(EVENT_DRAIN, onWake);
        socket.removeListener?.(EVENT_CLOSE, onWake);
        socket.removeListener?.(EVENT_ERROR, onWake);
        this._abortSignal?.removeEventListener?.(EVENT_ABORT, onWake);
        resolve();
      };
      socket.on?.(EVENT_DRAIN, onWake);
      socket.on?.(EVENT_CLOSE, onWake);
      socket.on?.(EVENT_ERROR, onWake);
      this._abortSignal?.addEventListener?.(EVENT_ABORT, onWake, {once: true});
      if (this.isDisconnected()) {
        onWake();
      }
    });
  }
}

export {PgWireOutputWriter};
