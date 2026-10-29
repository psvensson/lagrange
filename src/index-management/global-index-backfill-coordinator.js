/**
 * Global Secondary Index resumable historical backfill coordinator.
 * Owns deterministic partition-order and primary-key-order scanning,
 * persistent progress checkpoints in _indices, idempotent batch writes,
 * and the anti-resurrection invariant under concurrent mutations.
 *
 * Requirements: Stage C3 (RM-0.3-qs-non-unique-gsi).
 */

import {
  GLOBAL_INDEX_STATE,
  assertValidGlobalIndexStateTransition,
} from './global-index-catalog-contract.js';
import {
  buildIndexEntry,
  getGlobalIndexDatasetName,
  resolveIndexPartitionForEntry,
} from './global-index-dataset-manager.js';
import {INDEX_LOG_MSG} from './index-constants.js';
import {compareRoutingKeys} from '../partition/split-key-comparator.js';

const DEFAULT_BATCH_SIZE = 50;
const LOCAL_STR_BRACKET_OPEN = '[';
const LOCAL_STR_BRACE_OPEN = '{';
const LOCAL_STR_ID = 'id';

/**
 * Serialize a primary key value or tuple into a durable string checkpoint.
 * @param {*} pkValue - Value or array of values.
 * @return {string} Serialized representation.
 */
export function serializePrimaryKeyCursor(pkValue) {
  if (pkValue === null || pkValue === undefined) {
    return '';
  }
  if (Array.isArray(pkValue)) {
    return JSON.stringify(pkValue);
  }
  return String(pkValue);
}

/**
 * Deserialize a primary key cursor string back to its original value or tuple.
 * @param {string|null} cursorStr
 * @return {*} Deserialized value.
 */
export function deserializePrimaryKeyCursor(cursorStr) {
  if (!cursorStr) {
    return null;
  }
  if (cursorStr.startsWith(LOCAL_STR_BRACKET_OPEN) || cursorStr.startsWith(LOCAL_STR_BRACE_OPEN)) {
    try {
      return JSON.parse(cursorStr);
    } catch (_err) {
      return cursorStr;
    }
  }
  return cursorStr;
}

function getPartitionStartKey(partition) {
  return partition.partition_key_start !== undefined ?
    partition.partition_key_start :
    partition.partitionKeyStart;
}

function getPartitionId(partition) {
  return partition.partition_id || partition.partitionId || '';
}

function comparePartitionStartKeys(aStart, bStart) {
  const aEmpty = aStart === null || aStart === undefined;
  const bEmpty = bStart === null || bStart === undefined;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return -1;
  if (bEmpty) return 1;
  return compareRoutingKeys(aStart, bStart);
}

/**
 * Sort base table partitions deterministically by partition_key_start,
 * falling back to partition_id.
 * @param {Object[]} partitions - Candidate partitions.
 * @return {Object[]} Sorted partitions.
 */
export function sortPartitionsDeterministically(partitions) {
  return [...partitions].sort((a, b) => {
    const cmp = comparePartitionStartKeys(
      getPartitionStartKey(a),
      getPartitionStartKey(b),
    );
    if (cmp !== 0) return cmp;

    return String(getPartitionId(a)).localeCompare(String(getPartitionId(b)));
  });
}

function resolveInitialBackfillCursor(indexMetadata) {
  const cursorPartitionId =
    indexMetadata.backfill_cursor_partition_id ||
    indexMetadata.backfillCursorPartitionId ||
    null;
  const cursorPk =
    indexMetadata.backfill_cursor_pk ||
    indexMetadata.backfillCursorPk ||
    null;
  const totalRows = Number(
    indexMetadata.backfill_total_rows !== undefined ?
      indexMetadata.backfill_total_rows :
      (indexMetadata.backfillTotalRows || 0),
  );
  return {cursorPartitionId, cursorPk, totalRows};
}

function findStartPartitionIndex(basePartitions, cursorPartitionId) {
  if (!cursorPartitionId) return 0;
  const idx = basePartitions.findIndex((p) => {
    const pId = p.partition_id || p.partitionId;
    return pId === cursorPartitionId;
  });
  return idx >= 0 ? idx : 0;
}

function computeLastPkValue(rows, basePrimaryKeyColumns) {
  const lastRow = rows[rows.length - 1];
  return basePrimaryKeyColumns.length === 1 ?
    lastRow[basePrimaryKeyColumns[0]] :
    basePrimaryKeyColumns.map((k) => lastRow[k]);
}

/**
 * Coordinator for resumable global secondary index historical backfills.
 */
export class GlobalIndexBackfillCoordinator {
  /**
   * @param {Object} options
   * @param {Function} [options.updateIndexCheckpoint]
   * @param {Function} [options.getBaseTablePartitions]
   * @param {Function} [options.getIndexPartitions]
   * @param {Function} [options.fetchBasePartitionBatch]
   * @param {Function} [options.verifyBaseRowImage]
   * @param {Function} [options.writeIndexBatch]
   * @param {number} [options.batchSize=50]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this.updateIndexCheckpoint = options.updateIndexCheckpoint || (async () => {});
    this.getBaseTablePartitions = options.getBaseTablePartitions || (() => []);
    this.getIndexPartitions = options.getIndexPartitions || (() => []);
    this.fetchBasePartitionBatch = options.fetchBasePartitionBatch || (async () => []);
    this.verifyBaseRowImage = options.verifyBaseRowImage || (async () => null);
    this.writeIndexBatch = options.writeIndexBatch || (async () => {});
    this.batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    this.logger = options.logger || console;
  }

  /**
   * Advance an index from CREATING/WRITE_ONLY into BACKFILLING state.
   * @param {string} indexId
   * @param {string} initialState
   * @private
   */
  async ensureBackfillingState(indexId, initialState) {
    let state = initialState || GLOBAL_INDEX_STATE.WRITE_ONLY;
    const transitions = state === GLOBAL_INDEX_STATE.CREATING ?
      [GLOBAL_INDEX_STATE.WRITE_ONLY, GLOBAL_INDEX_STATE.BACKFILLING] :
      (state === GLOBAL_INDEX_STATE.WRITE_ONLY ? [GLOBAL_INDEX_STATE.BACKFILLING] : []);

    for (const targetState of transitions) {
      assertValidGlobalIndexStateTransition(state, targetState);
      state = targetState;
      await this.updateIndexCheckpoint({
        indexId,
        state,
        updatedAt: Date.now(),
      });
    }

    if (state !== GLOBAL_INDEX_STATE.BACKFILLING) {
      throw new Error(`Cannot run backfill on index in state: ${state}`);
    }
  }

  /**
   * Execute or resume historical backfill for a global index.
   * @param {Object} indexMetadata - Catalog index record.
   * @param {Object} [executionOptions={}]
   * @param {Function} [executionOptions.shouldYield] - Interruption hook for testing.
   * @return {Promise<Object>} Execution result.
   */
  async _processBaseBatchRows(rows, {
    tableName,
    partitionId,
    basePrimaryKeyColumns,
    columnNames,
    indexPartitions,
  }) {
    const entriesByTargetPartition = new Map();
    let validRowCount = 0;

    for (const row of rows) {
      const pkValues = {};
      for (const pkCol of basePrimaryKeyColumns) {
        pkValues[pkCol] = row[pkCol];
      }

      const liveImage = await this.verifyBaseRowImage({
        tableName,
        partitionId,
        pkValues,
        basePrimaryKeyColumns,
      });

      if (!liveImage) {
        continue;
      }

      const entry = buildIndexEntry(liveImage, {
        columnNames,
        basePrimaryKeyColumns,
        basePartitionId: partitionId,
      });

      const targetPartition = resolveIndexPartitionForEntry(
        entry,
        indexPartitions,
        columnNames[0],
      );
      const targetPartitionId = targetPartition ?
        (targetPartition.partition_id || targetPartition.partitionId) :
        null;

      if (targetPartitionId) {
        if (!entriesByTargetPartition.has(targetPartitionId)) {
          entriesByTargetPartition.set(targetPartitionId, []);
        }
        entriesByTargetPartition.get(targetPartitionId).push(entry);
        validRowCount++;
      }
    }

    return {entriesByTargetPartition, validRowCount};
  }

  async _writeIndexEntries(datasetName, entriesByTargetPartition) {
    for (const [targetPartitionId, entries] of entriesByTargetPartition) {
      await this.writeIndexBatch({
        datasetName,
        indexPartitionId: targetPartitionId,
        entries,
      });
    }
  }

  async _handleBackfillError(indexId, err) {
    this.logger.error(INDEX_LOG_MSG.GLOBAL_INDEX_BACKFILL_FAILED, {indexId, error: err.message});
    try {
      await this.updateIndexCheckpoint({
        indexId,
        state: GLOBAL_INDEX_STATE.FAILED,
        errorMessage: err.message,
        updatedAt: Date.now(),
      });
    } catch (saveErr) {
      this.logger.debug(INDEX_LOG_MSG.CHECKPOINT_UPDATE_FAILED, {
        indexId,
        error: saveErr?.message,
      });
    }
    throw err;
  }

  async _backfillPartitionBatch(partitionContext, progress, executionOptions) {
    const {
      indexId,
      tableName,
      partitionId,
      basePrimaryKeyColumns,
      columnNames,
      indexPartitions,
      datasetName,
    } = partitionContext;

    const rows = await this.fetchBasePartitionBatch({
      tableName,
      partitionId,
      cursorPk: deserializePrimaryKeyCursor(progress.cursorPk),
      batchSize: this.batchSize,
      basePrimaryKeyColumns,
    });

    if (!rows || rows.length === 0) {
      return {partitionDone: true};
    }

    const {entriesByTargetPartition, validRowCount} = await this._processBaseBatchRows(
      rows,
      {
        tableName,
        partitionId,
        basePrimaryKeyColumns,
        columnNames,
        indexPartitions,
      },
    );

    await this._writeIndexEntries(datasetName, entriesByTargetPartition);

    progress.totalRows += validRowCount;
    const lastPkValue = computeLastPkValue(rows, basePrimaryKeyColumns);
    progress.cursorPk = serializePrimaryKeyCursor(lastPkValue);

    await this.updateIndexCheckpoint({
      indexId,
      state: GLOBAL_INDEX_STATE.BACKFILLING,
      cursorPartitionId: progress.cursorPartitionId,
      cursorPk: progress.cursorPk,
      totalRows: progress.totalRows,
      backfill_cursor_partition_id: progress.cursorPartitionId,
      backfill_cursor_pk: progress.cursorPk,
      backfill_total_rows: progress.totalRows,
      updatedAt: Date.now(),
    });

    if (typeof executionOptions.shouldYield === 'function') {
      const shouldYield = executionOptions.shouldYield({
        cursorPartitionId: progress.cursorPartitionId,
        cursorPk: progress.cursorPk,
        totalRows: progress.totalRows,
      });
      if (shouldYield) {
        return {
          interrupted: true,
          cursorPartitionId: progress.cursorPartitionId,
          cursorPk: progress.cursorPk,
          totalRows: progress.totalRows,
          state: GLOBAL_INDEX_STATE.BACKFILLING,
        };
      }
    }

    return {partitionDone: rows.length < this.batchSize};
  }

  async _backfillPartition(partitionContext, progress, executionOptions) {
    let partitionDone = false;
    while (!partitionDone) {
      const result = await this._backfillPartitionBatch(
        partitionContext,
        progress,
        executionOptions,
      );
      if (result.interrupted) {
        return {
          interrupted: true,
          completed: false,
          ...result,
        };
      }
      if (result.partitionDone) {
        partitionDone = true;
      }
    }
    return null;
  }

  /**
   * Execute or resume historical backfill for a global index.
   * @param {Object} indexMetadata - Catalog index record.
   * @param {Object} [executionOptions={}]
   * @param {Function} [executionOptions.shouldYield] - Interruption hook for testing.
   * @return {Promise<Object>} Execution result.
   */
  async executeBackfill(indexMetadata, executionOptions = {}) {
    const {
      indexId,
      tableName,
      indexName,
      columnNames,
      basePrimaryKeyColumns = [LOCAL_STR_ID],
    } = indexMetadata;

    await this.ensureBackfillingState(indexId, indexMetadata.state);

    const basePartitions = sortPartitionsDeterministically(
      this.getBaseTablePartitions(tableName),
    );
    const indexPartitions = this.getIndexPartitions(indexName);
    const datasetName = getGlobalIndexDatasetName(tableName, indexName);

    const progress = resolveInitialBackfillCursor(indexMetadata);
    const startPartitionIdx = findStartPartitionIndex(
      basePartitions,
      progress.cursorPartitionId,
    );

    try {
      for (let i = startPartitionIdx; i < basePartitions.length; i++) {
        const partition = basePartitions[i];
        const partitionId = partition.partition_id || partition.partitionId;

        if (partitionId !== progress.cursorPartitionId) {
          progress.cursorPartitionId = partitionId;
          progress.cursorPk = null;
        }

        const partitionContext = {
          indexId,
          tableName,
          partitionId,
          basePrimaryKeyColumns,
          columnNames,
          indexPartitions,
          datasetName,
        };

        const result = await this._backfillPartition(
          partitionContext,
          progress,
          executionOptions,
        );
        if (result?.interrupted) {
          return result;
        }
      }

      assertValidGlobalIndexStateTransition(
        GLOBAL_INDEX_STATE.BACKFILLING,
        GLOBAL_INDEX_STATE.READ_WRITE,
      );

      await this.updateIndexCheckpoint({
        indexId,
        state: GLOBAL_INDEX_STATE.READ_WRITE,
        cursorPartitionId: null,
        cursorPk: null,
        totalRows: progress.totalRows,
        backfill_cursor_partition_id: null,
        backfill_cursor_pk: null,
        backfill_total_rows: progress.totalRows,
        updatedAt: Date.now(),
      });

      return {
        completed: true,
        interrupted: false,
        totalRows: progress.totalRows,
        state: GLOBAL_INDEX_STATE.READ_WRITE,
      };
    } catch (err) {
      await this._handleBackfillError(indexId, err);
    }
  }
}
