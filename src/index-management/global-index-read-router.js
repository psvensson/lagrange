/**
 * Global Secondary Index query planner, read router, and EXPLAIN DISTRIBUTED diagnostics.
 * Owns GSI read visibility checks, strict left-prefix matching, covering index detection,
 * 2-stage routed distributed execution (Index Scan -> Base Partition Fetch),
 * and automatic fallback to base scatter-gather when indexes are unavailable.
 *
 * Requirements: Stage C5 (RM-0.3-qs-non-unique-gsi).
 */

import {isReadableByPlanner} from './global-index-catalog-contract.js';
import {
  BASE_PARTITION_ID_COLUMN,
  BASE_PK_COLUMN_PREFIX,
  extractBasePrimaryKeyColumnName,
  getGlobalIndexDatasetName,
  resolveIndexPartitionForEntry,
} from './global-index-dataset-manager.js';
import {
  GLOBAL_INDEX_ACCESS_PATH,
  INDEX_REJECTION_REASON,
} from './index-constants.js';
import {PartitionResolver} from '../query/partition-resolver.js';
import {compareRoutingKeys} from '../partition/split-key-comparator.js';

export {
  GLOBAL_INDEX_ACCESS_PATH,
  INDEX_REJECTION_REASON,
};

const LOCAL_STR_EQUALS = '=';
const LOCAL_STR_AND = 'AND';
const LOCAL_STR_PARAM = 'param';
const LOCAL_STR_STAR = '*';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_COLUMN = 'column';

const EQUALITY_OPERATORS = new Set([LOCAL_STR_EQUALS, '==', 'IS']);
const RANGE_OPERATORS = new Set(['<', '<=', '>', '>=', 'BETWEEN']);

function isColumnNode(node) {
  return Boolean(node && (node.type === LOCAL_STR_COLUMN || node.column));
}

function resolveColAndValNodes(node) {
  if (isColumnNode(node.left)) {
    return {colNode: node.left, valNode: node.right};
  }
  if (isColumnNode(node.right)) {
    return {colNode: node.right, valNode: node.left};
  }
  return {colNode: null, valNode: null};
}

function getColumnNodeName(colNode) {
  if (!colNode) return null;
  const name = colNode.name || colNode.column || colNode.value;
  return typeof name === 'string' ? name : null;
}

function resolvePredicateNodeValue(valNode, params) {
  if (!valNode) return undefined;
  if (valNode.type === LOCAL_STR_PARAM && typeof valNode.index === 'number') {
    return params ? params[valNode.index] : undefined;
  }
  return valNode.value;
}

function recordComparisonCondition(node, op, params, conditions) {
  const {colNode, valNode} = resolveColAndValNodes(node);
  const colName = getColumnNodeName(colNode);
  if (!colName) return;

  conditions.set(colName.toLowerCase(), {
    column: colName,
    operator: op,
    value: resolvePredicateNodeValue(valNode, params),
    node,
  });
}

/**
 * Extract column predicate conditions from a WHERE clause (AST or object).
 * @param {Object|null} whereClause
 * @param {Array} [params=[]]
 * @return {Map<string, Object>} Column -> condition description.
 */
export function extractPredicateConditions(whereClause, params = []) {
  const conditions = new Map();
  if (!whereClause) {
    return conditions;
  }

  // Support simple dictionary format: { col: value } or { col: { operator, value } }
  if (typeof whereClause === 'object' && !whereClause.type && !whereClause.operator) {
    for (const [col, val] of Object.entries(whereClause)) {
      const lowerCol = col.toLowerCase();
      if (val && typeof val === 'object' && val.operator) {
        conditions.set(lowerCol, {
          column: col,
          operator: String(val.operator).toUpperCase(),
          value: val.value,
        });
      } else {
        conditions.set(lowerCol, {
          column: col,
          operator: LOCAL_STR_EQUALS,
          value: val,
        });
      }
    }
    return conditions;
  }

  // Recursive AST walker for binary expressions and AND trees
  function walkNode(node) {
    if (!node) return;
    const op = String(node.operator || node.type || '').toUpperCase();

    if (op === LOCAL_STR_AND) {
      walkNode(node.left);
      walkNode(node.right);
      return;
    }

    if (EQUALITY_OPERATORS.has(op) || RANGE_OPERATORS.has(op)) {
      recordComparisonCondition(node, op, params, conditions);
    }
  }

  walkNode(whereClause);
  return conditions;
}

/**
 * Match an index's columns against predicate conditions by strict left-prefix.
 * @param {string[]} columnNames - Ordered index columns.
 * @param {Map<string, Object>} conditions - Extracted predicate conditions.
 * @return {{matched: boolean, equalityPrefixColumns: string[], rangeColumn: string|null}}
 */
export function matchStrictLeftPrefix(columnNames, conditions) {
  const equalityPrefixColumns = [];
  let rangeColumn = null;

  if (!Array.isArray(columnNames) || columnNames.length === 0) {
    return {matched: false, equalityPrefixColumns, rangeColumn};
  }

  for (let i = 0; i < columnNames.length; i++) {
    const col = columnNames[i];
    const condition = conditions.get(col.toLowerCase());

    if (!condition) {
      break;
    }

    const op = condition.operator;
    if (EQUALITY_OPERATORS.has(op)) {
      equalityPrefixColumns.push(col);
    } else if (RANGE_OPERATORS.has(op)) {
      rangeColumn = col;
      break; // Range terminates the usable prefix
    } else {
      break;
    }
  }

  // A match requires at least the leading column to be constrained
  const matched = equalityPrefixColumns.length > 0 || rangeColumn === columnNames[0];

  return {
    matched,
    equalityPrefixColumns,
    rangeColumn,
  };
}

/**
 * Check whether an index is covering for the given projected columns.
 * @param {string[]|null} projectedColumns
 * @param {string[]} indexedColumns
 * @param {string[]} basePrimaryKeyColumns
 * @return {boolean}
 */
export function isIndexCovering(
  projectedColumns,
  indexedColumns,
  basePrimaryKeyColumns,
) {
  if (!Array.isArray(projectedColumns) || projectedColumns.length === 0) {
    return false;
  }
  if (projectedColumns.includes(LOCAL_STR_STAR)) {
    return false;
  }

  const availableCols = new Set([
    ...indexedColumns.map((c) => c.toLowerCase()),
    ...basePrimaryKeyColumns.map((c) => c.toLowerCase()),
  ]);

  return projectedColumns.every((col) => availableCols.has(String(col).toLowerCase()));
}

function checkBasePartitionKeyNarrowing(basePartitionKey, conditions) {
  const basePkCols = Array.isArray(basePartitionKey) ?
    basePartitionKey :
    (basePartitionKey ? [basePartitionKey] : []);

  return basePkCols.length > 0 &&
    basePkCols.every((pk) => conditions.has(pk.toLowerCase()));
}

function parseIndexColumnNames(index) {
  if (Array.isArray(index.column_names)) return index.column_names;
  if (Array.isArray(index.columnNames)) return index.columnNames;
  return JSON.parse(index.column_names);
}

function evaluateIndexCandidate(index, conditions, rejectedIndexes) {
  const isGlobal = index.is_global !== undefined ? Boolean(index.is_global) : index.isGlobal;
  if (!isGlobal) return null;

  const indexName = index.index_name || index.indexName;
  const state = index.state;

  if (!isReadableByPlanner(state)) {
    rejectedIndexes.push({
      indexName,
      state,
      reason: INDEX_REJECTION_REASON.INDEX_NOT_READ_WRITE,
    });
    return null;
  }

  const columnNames = parseIndexColumnNames(index);
  const prefixMatch = matchStrictLeftPrefix(columnNames, conditions);
  if (!prefixMatch.matched) {
    rejectedIndexes.push({
      indexName,
      state,
      reason: INDEX_REJECTION_REASON.PREFIX_NOT_MATCHED,
    });
    return null;
  }

  const matchScore = prefixMatch.equalityPrefixColumns.length * 2 +
    (prefixMatch.rangeColumn ? 1 : 0);

  return {
    index,
    indexName,
    columnNames,
    equalityPrefixColumns: prefixMatch.equalityPrefixColumns,
    rangeColumn: prefixMatch.rangeColumn,
    matchScore,
  };
}

function selectBestIndexCandidate(allIndexes, conditions) {
  const rejectedIndexes = [];
  let selectedCandidate = null;

  for (const index of allIndexes) {
    const candidate = evaluateIndexCandidate(index, conditions, rejectedIndexes);
    if (!candidate) continue;

    if (!selectedCandidate || candidate.matchScore > selectedCandidate.matchScore) {
      selectedCandidate = candidate;
    }
  }

  return {selectedCandidate, rejectedIndexes};
}

function projectCoveringIndexRows(indexRows, projectedColumns) {
  return indexRows.map((idxRow) => {
    const out = {};
    for (const col of projectedColumns) {
      out[col] = idxRow[col] !== undefined ?
        idxRow[col] :
        idxRow[BASE_PK_COLUMN_PREFIX + col];
    }
    return out;
  });
}

function extractRowPkValues(idxRow) {
  const pkValues = {};
  for (const [col, val] of Object.entries(idxRow)) {
    const basePkCol = extractBasePrimaryKeyColumnName(col);
    if (basePkCol) {
      pkValues[basePkCol] = val;
    }
  }
  return pkValues;
}

function isRowMatchingPk(row, pk) {
  return Object.entries(pk).every(([k, v]) => row[k] === v);
}

function findMissingPks(pkList, rows) {
  const missing = [];
  for (const pk of pkList) {
    const found = rows.some((row) => isRowMatchingPk(row, pk));
    if (!found) {
      missing.push(pk);
    }
  }
  return missing;
}

function isValueInRange(val, start, end) {
  if (start !== null && start !== undefined && compareRoutingKeys(val, start) < 0) {
    return false;
  }
  if (end !== null && end !== undefined && compareRoutingKeys(val, end) >= 0) {
    return false;
  }
  return true;
}

function partitionMatchesPk(partition, pkValues) {
  const pKey = partition.partition_key || partition.partitionKey;
  if (!pKey || pkValues[pKey] === undefined) {
    return false;
  }
  const val = pkValues[pKey];
  const start = partition.partition_key_start !== undefined ?
    partition.partition_key_start :
    partition.partitionKeyStart;
  const end = partition.partition_key_end !== undefined ?
    partition.partition_key_end :
    partition.partitionKeyEnd;
  return isValueInRange(val, start, end);
}

function matchPartitionByKey(basePartitions, pkValues) {
  for (const p of basePartitions) {
    if (partitionMatchesPk(p, pkValues)) {
      return p.partition_id || p.partitionId;
    }
  }
  return null;
}

/**
 * Resolve the current owning base partition for a row PK.
 * @param {Object} router
 * @param {string} tableName
 * @param {Object} pkValues
 * @param {string} storedPartitionId
 * @return {string}
 */
function resolveCurrentBasePartitionId(router, tableName, pkValues, storedPartitionId) {
  if (router && typeof router.resolveBasePartitionId === 'function') {
    const resolved = router.resolveBasePartitionId(tableName, pkValues, storedPartitionId);
    if (resolved) {
      return resolved;
    }
  }

  const basePartitions = router?.getBaseTablePartitions ?
    router.getBaseTablePartitions(tableName) :
    [];
  if (Array.isArray(basePartitions) && basePartitions.length > 0) {
    const matched = matchPartitionByKey(basePartitions, pkValues);
    if (matched) {
      return matched;
    }
    const isStoredActive = basePartitions.some(
      (p) => (p.partition_id || p.partitionId) === storedPartitionId,
    );
    if (isStoredActive) {
      return storedPartitionId;
    }
  }

  return storedPartitionId;
}

/**
 * Group base row primary keys by target base partition id.
 * @param {Object[]} indexRows
 * @param {Object} [router]
 * @param {string} [tableName]
 * @return {Map<string, Object[]>}
 */
function groupPksByBasePartition(indexRows, router = null, tableName = null) {
  const pksByBasePartition = new Map();
  for (const idxRow of indexRows) {
    const storedPartitionId = idxRow[BASE_PARTITION_ID_COLUMN];
    const pkValues = extractRowPkValues(idxRow);
    const targetPartitionId = (router && tableName) ?
      resolveCurrentBasePartitionId(router, tableName, pkValues, storedPartitionId) :
      storedPartitionId;
    if (!targetPartitionId) continue;

    if (!pksByBasePartition.has(targetPartitionId)) {
      pksByBasePartition.set(targetPartitionId, []);
    }
    pksByBasePartition.get(targetPartitionId).push(pkValues);
  }
  return pksByBasePartition;
}

function narrowIndexPartitions(resolvedPartitions, indexPartitions, candidate, conditions) {
  if (resolvedPartitions.length === indexPartitions.length && indexPartitions.length > 1) {
    const leadingCol = candidate.columnNames[0];
    const leadingCond = conditions.get(leadingCol.toLowerCase());
    if (leadingCond && EQUALITY_OPERATORS.has(leadingCond.operator)) {
      const targetPart = resolveIndexPartitionForEntry(
        {[leadingCol]: leadingCond.value},
        indexPartitions,
        leadingCol,
      );
      if (targetPart) {
        return [targetPart.partition_id || targetPart.partitionId];
      }
    }
  }
  return resolvedPartitions;
}

/**
 * Global Secondary Index read router and EXPLAIN DISTRIBUTED planner.
 */
export class GlobalIndexReadRouter {
  /**
   * @param {Object} options
   * @param {Function} [options.getIndexCatalog]
   * @param {Function} [options.getIndexPartitions]
   * @param {Function} [options.getBaseTablePartitions]
   * @param {Function} [options.resolveBasePartitionId]
   * @param {PartitionResolver} [options.partitionResolver]
   * @param {Function} [options.executeIndexScan]
   * @param {Function} [options.executeBaseFetch]
   * @param {Function} [options.executeScatterGather]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this.getIndexCatalog = options.getIndexCatalog || (() => []);
    this.getIndexPartitions = options.getIndexPartitions || (() => []);
    this.getBaseTablePartitions = options.getBaseTablePartitions || (() => []);
    this.resolveBasePartitionId = options.resolveBasePartitionId || null;
    this.partitionResolver = options.partitionResolver || new PartitionResolver();
    this.executeIndexScan = options.executeIndexScan || (async () => []);
    this.executeBaseFetch = options.executeBaseFetch || (async () => []);
    this.executeScatterGather = options.executeScatterGather || (async () => []);
    this.logger = options.logger || console;
  }

  /**
   * Analyze access path for a SELECT query on a base table.
   * @param {Object} queryContext
   * @param {string} queryContext.tableName
   * @param {Object|null} queryContext.whereClause
   * @param {string[]|null} [queryContext.projectedColumns]
   * @param {string|string[]} [queryContext.basePartitionKey]
   * @param {Array} [queryContext.params=[]]
   * @param {string[]} [queryContext.basePrimaryKeyColumns=['id']]
   * @return {Object} Access plan with EXPLAIN diagnostics shape.
   */
  planAccessPath(queryContext) {
    const {
      tableName,
      whereClause,
      projectedColumns = null,
      basePartitionKey = null,
      params = [],
      basePrimaryKeyColumns = [LOCAL_STR_ID],
    } = queryContext;

    const basePartitions = this.getBaseTablePartitions(tableName) || [];
    const allBasePartitionIds = basePartitions.map((p) => p.partition_id || p.partitionId);
    const conditions = extractPredicateConditions(whereClause, params);

    if (checkBasePartitionKeyNarrowing(basePartitionKey, conditions)) {
      return {
        accessPath: GLOBAL_INDEX_ACCESS_PATH.BASE_PRIMARY_KEY,
        selectedIndex: null,
        indexPartitions: [],
        basePartitions: allBasePartitionIds,
        covering: false,
        rejectedIndexes: [],
      };
    }

    const allIndexes = this.getIndexCatalog(tableName) || [];
    const {selectedCandidate, rejectedIndexes} = selectBestIndexCandidate(allIndexes, conditions);

    if (!selectedCandidate) {
      return {
        accessPath: GLOBAL_INDEX_ACCESS_PATH.SCATTER_GATHER,
        selectedIndex: null,
        indexPartitions: [],
        basePartitions: allBasePartitionIds,
        covering: false,
        rejectedIndexes,
      };
    }

    const indexPartitions = this.getIndexPartitions(selectedCandidate.indexName) || [];
    const datasetName = getGlobalIndexDatasetName(tableName, selectedCandidate.indexName);

    const initialPartitions = this.partitionResolver.resolvePartitions(
      datasetName,
      whereClause,
      indexPartitions,
      {
        params,
        tableInfo: {
          partition_key: selectedCandidate.columnNames[0],
          partitionKey: selectedCandidate.columnNames[0],
        },
      },
    );

    const resolvedIndexPartitions = narrowIndexPartitions(
      initialPartitions,
      indexPartitions,
      selectedCandidate,
      conditions,
    );

    const covering = isIndexCovering(
      projectedColumns,
      selectedCandidate.columnNames,
      basePrimaryKeyColumns,
    );

    return {
      accessPath: GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX,
      selectedIndex: {
        indexName: selectedCandidate.indexName,
        columnNames: selectedCandidate.columnNames,
        equalityPrefixColumns: selectedCandidate.equalityPrefixColumns,
        rangeColumn: selectedCandidate.rangeColumn,
      },
      indexPartitions: resolvedIndexPartitions,
      basePartitions: allBasePartitionIds,
      covering,
      rejectedIndexes,
    };
  }

  /**
   * Produce structured EXPLAIN DISTRIBUTED diagnostics for a query.
   * @param {Object} queryContext
   * @return {Object} EXPLAIN diagnostics object.
   */
  explainDistributed(queryContext) {
    const plan = this.planAccessPath(queryContext);
    return {
      accessPath: plan.accessPath,
      selectedIndex: plan.selectedIndex,
      indexPartitions: plan.indexPartitions,
      basePartitions: plan.basePartitions,
      covering: plan.covering,
      rejectedIndexes: plan.rejectedIndexes,
    };
  }

  /**
   * Execute a query using the optimal access path.
   * @param {Object} queryContext
   * @return {Promise<Object[]>} Result rows.
   */
  async executeQuery(queryContext) {
    const plan = this.planAccessPath(queryContext);

    if (plan.accessPath === GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX) {
      return this.executeTwoStageIndexQuery(queryContext, plan);
    }

    return this.executeScatterGather(queryContext);
  }

  /**
   * Execute 2-stage routed query via global secondary index.
   * Stage 1: scan resolved index partitions.
   * Stage 2: fetch base rows only from matching base partitions (unless covering).
   * @param {Object} queryContext
   * @param {Object} plan
   * @return {Promise<Object[]>}
   * @private
   */
  async _fetchFromOwnerPartition(tableName, ownerId, pk) {
    const rows = await this.executeBaseFetch({tableName, basePartitionId: ownerId, pkList: [pk]});
    return Array.isArray(rows) && rows.length > 0 ? rows : null;
  }

  async _scanOtherPartitionsForPk(tableName, basePartitions, excludedIds, pk) {
    for (const p of basePartitions) {
      const pId = p.partition_id || p.partitionId;
      if (excludedIds.has(pId)) continue;
      const rows = await this._fetchFromOwnerPartition(tableName, pId, pk);
      if (rows) return rows;
    }
    return null;
  }

  async _recoverMissingStage2Rows(tableName, missingPks, fetchedRows) {
    const basePartitions = this.getBaseTablePartitions ?
      this.getBaseTablePartitions(tableName) :
      [];

    for (const {pk, attemptedPartitionId} of missingPks) {
      let ownerId = null;
      if (typeof this.resolveBasePartitionId === 'function') {
        ownerId = this.resolveBasePartitionId(tableName, pk, attemptedPartitionId);
      }
      if (ownerId && ownerId !== attemptedPartitionId) {
        const rows = await this._fetchFromOwnerPartition(tableName, ownerId, pk);
        if (rows) {
          fetchedRows.push(...rows);
          continue;
        }
      }

      const excluded = new Set([attemptedPartitionId, ownerId].filter(Boolean));
      const scannedRows = await this._scanOtherPartitionsForPk(
        tableName,
        basePartitions,
        excluded,
        pk,
      );
      if (scannedRows) {
        fetchedRows.push(...scannedRows);
      }
    }
  }

  /**
   * Fetch base rows from designated partitions with recovery for migrated rows.
   * @param {string} tableName
   * @param {Map<string, Object[]>} pksByBasePartition
   * @return {Promise<Object[]>}
   * @private
   */
  async _fetchRowsFromBasePartitions(tableName, pksByBasePartition) {
    const fetchedRows = [];
    const missingPks = [];

    for (const [basePartitionId, pkList] of pksByBasePartition) {
      const rows = await this.executeBaseFetch({
        tableName,
        basePartitionId,
        pkList,
      });
      if (Array.isArray(rows)) {
        fetchedRows.push(...rows);
        if (rows.length < pkList.length) {
          const missed = findMissingPks(pkList, rows);
          for (const pk of missed) {
            missingPks.push({pk, attemptedPartitionId: basePartitionId});
          }
        }
      } else {
        for (const pk of pkList) {
          missingPks.push({pk, attemptedPartitionId: basePartitionId});
        }
      }
    }

    if (missingPks.length > 0) {
      await this._recoverMissingStage2Rows(tableName, missingPks, fetchedRows);
    }

    return fetchedRows;
  }

  /**
   * Execute Stage 2 base-row lookup for candidate index entries,
   * resolving base-row placement through its current owner.
   * @param {Object} context
   * @param {string} context.tableName
   * @param {Object[]} context.candidateEntries
   * @return {Promise<Object[]>}
   */
  async executeStage2BaseLookup(context) {
    const {tableName, candidateEntries} = context;
    if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) {
      return [];
    }
    const pksByBasePartition = groupPksByBasePartition(candidateEntries, this, tableName);
    return this._fetchRowsFromBasePartitions(tableName, pksByBasePartition);
  }

  /**
   * Execute 2-stage routed query via global secondary index.
   * Stage 1: scan resolved index partitions.
   * Stage 2: fetch base rows only from matching base partitions (unless covering).
   * @param {Object} queryContext
   * @param {Object} plan
   * @return {Promise<Object[]>}
   */
  async executeTwoStageIndexQuery(queryContext, plan) {
    const {tableName, whereClause, projectedColumns = null} = queryContext;
    const {selectedIndex, indexPartitions, covering} = plan;
    const datasetName = getGlobalIndexDatasetName(tableName, selectedIndex.indexName);

    // Stage 1: scan index partitions
    const indexRows = await this.executeIndexScan({
      datasetName,
      indexName: selectedIndex.indexName,
      indexPartitions,
      whereClause,
    });

    if (!indexRows || indexRows.length === 0) {
      return [];
    }

    // If index covers all projected columns, return directly from Stage 1
    if (covering && Array.isArray(projectedColumns) && projectedColumns.length > 0) {
      return projectCoveringIndexRows(indexRows, projectedColumns);
    }

    // Stage 2: fetch base rows through current owner placement
    return this.executeStage2BaseLookup({
      tableName,
      candidateEntries: indexRows,
    });
  }
}
