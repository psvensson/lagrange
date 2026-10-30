/**
 * Composite partition resolution helpers for multi-column primary keys.
 */

import {DISTRIBUTED_PREDICATE_SHAPE as PREDICATE_SHAPE} from
  './distributed/distributed-query-plan-constants.js';
import {
  KEY_CONDITION_TYPE,
  extractRawPartitionBounds,
  isNil,
} from './partition-resolver-key-conditions.js';
import {compareRoutingKeys} from '../partition/split-key-comparator.js';
import {normalizePartitionBoundaryKeyType} from
  '../partition/partition-boundary-representation.js';
import {TABLES} from '../constants/index.js';

const ZERO = 0;
const ONE = 1;
const TYPE_STRING = 'string';
const TYPE_OBJECT = 'object';

/**
 * Parse schema object from table metadata.
 *
 * @param {Object|null} tableInfo - Table metadata row.
 * @return {Object|null} Parsed schema object or null.
 */
function parseTableSchema(tableInfo) {
  if (!tableInfo) return null;
  const rawSchema = tableInfo.schema ||
    tableInfo.schema_definition ||
    tableInfo.schemaDefinition ||
    null;
  if (!rawSchema) return null;
  if (typeof rawSchema === 'object') return rawSchema;
  try {
    return JSON.parse(rawSchema);
  } catch {
    return null;
  }
}

/**
 * Resolve declared column type from table metadata schema.
 *
 * @param {Object|null} tableInfo - Table metadata.
 * @param {string} columnName - Target column name.
 * @return {string|null} Normalized key type or null.
 */
function resolveColumnType(tableInfo, columnName) {
  const schema = parseTableSchema(tableInfo);
  if (!schema?.columns || !columnName) return null;
  const target = String(columnName).toLowerCase();
  const col = schema.columns.find((c) =>
    c?.name && String(c.name).toLowerCase() === target,
  );
  return col?.type ? normalizePartitionBoundaryKeyType(col.type) : null;
}

/**
 * Resolve composite-key equality predicates when all key columns are bound.
 *
 * @param {Object} options - Extraction options.
 * @param {Object} options.whereClause - WHERE clause AST.
 * @param {string[]} options.keyColumns - Composite key columns.
 * @param {Object[]} options.partitions - Candidate partitions.
 * @param {Object} options.resolutionContext - Resolution context.
 * @param {string|null} [options.tableName=null] - Table name.
 * @param {Object|null} [options.tableInfo=null] - Table metadata.
 * @param {Object} options.resolver - PartitionResolver instance.
 * @return {{partitionIds: string[], predicateShape: string}}
 */
function decodeCompositeBoundaryTuple(rawBound, expectedLength) {
  if (isNil(rawBound)) {
    return {isUnbounded: true, tuple: null};
  }
  let parsed = rawBound;
  if (typeof rawBound === TYPE_STRING) {
    try {
      parsed = JSON.parse(rawBound);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedLength) {
    return null;
  }
  return {isUnbounded: false, tuple: parsed};
}

function compareTuplePrefix(prefixValues, boundaryTuple) {
  for (let i = ZERO; i < prefixValues.length; i += ONE) {
    const cmp = compareRoutingKeys(prefixValues[i], boundaryTuple[i]);
    if (cmp !== ZERO) {
      return cmp;
    }
  }
  return ZERO;
}

function applyRangeEntryToBounds(state, entry) {
  const handlers = {
    [KEY_CONDITION_TYPE.GTE]: () => {
      state.low = entry.value;
      state.lowInclusive = true;
      state.hasRange = true;
    },
    [KEY_CONDITION_TYPE.GT]: () => {
      state.low = entry.value;
      state.lowInclusive = false;
      state.hasRange = true;
    },
    [KEY_CONDITION_TYPE.LTE]: () => {
      state.high = entry.value;
      state.highInclusive = true;
      state.hasRange = true;
    },
    [KEY_CONDITION_TYPE.LT]: () => {
      state.high = entry.value;
      state.highInclusive = false;
      state.hasRange = true;
    },
    [KEY_CONDITION_TYPE.RANGE]: () => {
      state.low = entry.low !== undefined ? entry.low : state.low;
      state.high = entry.high !== undefined ? entry.high : state.high;
      state.lowInclusive = entry.lowInclusive !== undefined ?
        entry.lowInclusive :
        state.lowInclusive;
      state.highInclusive = entry.highInclusive !== undefined ?
        entry.highInclusive :
        state.highInclusive;
      state.hasRange = true;
    },
  };
  handlers[entry.type]?.();
}

function normalizeDirectConditionList(entries) {
  if (!Array.isArray(entries) || entries.length === ZERO) {
    return null;
  }
  const state = {
    low: null,
    high: null,
    lowInclusive: true,
    highInclusive: false,
    hasRange: false,
  };
  for (const entry of entries) {
    if (!entry || typeof entry !== TYPE_OBJECT) continue;
    if (entry.type === KEY_CONDITION_TYPE.EQUALS) {
      const val = entry.value !== undefined ? entry.value : entry.values?.[ZERO];
      return {type: KEY_CONDITION_TYPE.EQUALS, values: [val], contradiction: false};
    }
    applyRangeEntryToBounds(state, entry);
  }
  return state.hasRange ?
    {
      type: KEY_CONDITION_TYPE.RANGE,
      low: state.low,
      high: state.high,
      lowInclusive: state.lowInclusive,
      highInclusive: state.highInclusive,
      contradiction: false,
    } :
    null;
}

function matchesCompositeStartBound(prefixValues, nextRange, startTuple, rangeColIdx) {
  if (!startTuple) return true;
  const cmpPrefix = compareTuplePrefix(prefixValues, startTuple);
  if (cmpPrefix < ZERO) return false;
  if (cmpPrefix > ZERO) return true;
  if (nextRange && !isNil(nextRange.high) && rangeColIdx < startTuple.length) {
    const cmpHigh = compareRoutingKeys(nextRange.high, startTuple[rangeColIdx]);
    if (cmpHigh < ZERO || (cmpHigh === ZERO && !nextRange.highInclusive)) {
      return false;
    }
  }
  return true;
}

function matchesCompositeEndBound(
  prefixValues,
  nextRange,
  endTuple,
  rangeColIdx,
  totalColumns,
) {
  if (!endTuple) return true;
  const cmpPrefix = compareTuplePrefix(prefixValues, endTuple);
  if (cmpPrefix > ZERO) return false;
  if (cmpPrefix < ZERO) return true;
  if (nextRange && !isNil(nextRange.low) && rangeColIdx < endTuple.length) {
    const cmpLow = compareRoutingKeys(nextRange.low, endTuple[rangeColIdx]);
    if (cmpLow > ZERO) return false;
    if (cmpLow === ZERO &&
        (!nextRange.lowInclusive || rangeColIdx === totalColumns - ONE)) {
      return false;
    }
  }
  return true;
}

function decodeAllCompositePartitionBounds(partitions, expectedLength) {
  const decodedBounds = [];
  for (const partition of partitions) {
    const {rawStart, rawEnd} = extractRawPartitionBounds(partition);
    const startDecoded = decodeCompositeBoundaryTuple(rawStart, expectedLength);
    const endDecoded = decodeCompositeBoundaryTuple(rawEnd, expectedLength);
    if (!startDecoded || !endDecoded) {
      return null;
    }
    decodedBounds.push({
      partition,
      startTuple: startDecoded.tuple,
      endTuple: endDecoded.tuple,
    });
  }
  return decodedBounds;
}

function pruneCompositePartitionsByPrefix(partitions, keyColumns, columnConditions) {
  const prefixValues = [];
  let idx = ZERO;
  while (idx < keyColumns.length) {
    const cond = columnConditions[idx];
    if (cond?.type === KEY_CONDITION_TYPE.EQUALS && cond.values?.length === ONE) {
      prefixValues.push(cond.values[ZERO]);
      idx += ONE;
    } else {
      break;
    }
  }
  if (prefixValues.length === ZERO) {
    return null;
  }
  const nextCond = idx < keyColumns.length ? columnConditions[idx] : null;
  const nextRange = nextCond?.type === KEY_CONDITION_TYPE.RANGE ? nextCond : null;
  const decodedBounds = decodeAllCompositePartitionBounds(
    partitions,
    keyColumns.length,
  );
  if (!decodedBounds) {
    return null;
  }
  const matched = decodedBounds
    .filter(({startTuple, endTuple}) =>
      matchesCompositeStartBound(prefixValues, nextRange, startTuple, idx) &&
      matchesCompositeEndBound(prefixValues, nextRange, endTuple, idx, keyColumns.length))
    .map(({partition}) => partition.partition_id || partition.partitionId);
  return {
    partitionIds: matched,
    predicateShape: PREDICATE_SHAPE.RANGE,
  };
}

function normalizeCompositeCallArgs(
  optionsOrResolver,
  directPartitions,
  directKeyColumns,
  directConditionsMap,
) {
  const isDirectCall = directConditionsMap instanceof Map ||
    Array.isArray(directPartitions);
  if (isDirectCall) {
    return {
      isDirectCall: true,
      resolver: optionsOrResolver,
      partitions: directPartitions,
      keyColumns: directKeyColumns,
      whereClause: null,
      resolutionContext: null,
      tableName: null,
      tableInfo: null,
      directConditionsMap,
    };
  }
  return {
    isDirectCall: false,
    resolver: optionsOrResolver?.resolver,
    partitions: optionsOrResolver?.partitions,
    keyColumns: optionsOrResolver?.keyColumns,
    whereClause: optionsOrResolver?.whereClause,
    resolutionContext: optionsOrResolver?.resolutionContext,
    tableName: optionsOrResolver?.tableName ?? null,
    tableInfo: optionsOrResolver?.tableInfo ?? null,
    directConditionsMap: null,
  };
}

function collectCompositeColumnConditions(callSpec) {
  const {
    isDirectCall,
    resolver,
    keyColumns,
    whereClause,
    resolutionContext,
    tableInfo,
    directConditionsMap,
  } = callSpec;
  const values = [];
  const columnConditions = [];
  let allEquals = true;
  for (const keyColumn of keyColumns) {
    const colType = resolveColumnType(tableInfo, keyColumn);
    const keyConditions = isDirectCall ?
      normalizeDirectConditionList(directConditionsMap?.get(keyColumn)) :
      resolver.extractKeyConditions(
        whereClause,
        keyColumn,
        resolutionContext,
        colType,
      );
    if (keyConditions?.contradiction) {
      return {contradiction: true, values: [], columnConditions: [], allEquals: false};
    }
    columnConditions.push(keyConditions);
    if (allEquals &&
        keyConditions?.type === KEY_CONDITION_TYPE.EQUALS &&
        keyConditions.values?.length === ONE) {
      values.push(keyConditions.values[ZERO]);
    } else {
      allEquals = false;
    }
  }
  return {contradiction: false, values, columnConditions, allEquals};
}

function formatCompositeResolutionResult(isDirectCall, result) {
  return isDirectCall ? result.partitionIds : result;
}

function resolveCompositeKeyPartitions(
  optionsOrResolver,
  directPartitions = null,
  directKeyColumns = null,
  directConditionsMap = null,
) {
  const callSpec = normalizeCompositeCallArgs(
    optionsOrResolver,
    directPartitions,
    directKeyColumns,
    directConditionsMap,
  );
  const {isDirectCall, resolver, partitions, keyColumns, tableName, tableInfo} = callSpec;
  const collected = collectCompositeColumnConditions(callSpec);
  if (collected.contradiction) {
    return formatCompositeResolutionResult(isDirectCall, {
      partitionIds: [],
      predicateShape: PREDICATE_SHAPE.POINT,
    });
  }
  if (!collected.allEquals) {
    const pruned = pruneCompositePartitionsByPrefix(
      partitions,
      keyColumns,
      collected.columnConditions,
    );
    const fallback = pruned || {
      partitionIds: resolver.getAllPartitions(partitions),
      predicateShape: PREDICATE_SHAPE.SCATTER,
    };
    return formatCompositeResolutionResult(isDirectCall, fallback);
  }
  const partitionId = resolver.resolvePartitionForKey(
    tableName,
    collected.values,
    partitions,
    {tableInfo},
  );
  return formatCompositeResolutionResult(isDirectCall, {
    partitionIds: partitionId ? [partitionId] : [],
    predicateShape: PREDICATE_SHAPE.EQ,
  });
}

/**
 * Find table metadata row in system cache.
 *
 * @param {Object|null} systemCache - System cache instance.
 * @param {string} tableName - Target table name.
 * @return {Object|null} Table metadata row or null.
 */
function findTableInCache(systemCache, tableName) {
  if (!systemCache || !tableName) return null;
  try {
    if (typeof systemCache.get === 'function') {
      const row = systemCache.get(TABLES.TABLES, tableName);
      if (row) return row;
    }
    if (typeof systemCache.find === 'function') {
      const row = systemCache.find(TABLES.TABLES, (t) =>
        t?.table_name === tableName || t?.tableName === tableName,
      );
      if (row) return row;
    }
    if (typeof systemCache.getAll === 'function') {
      const all = systemCache.getAll(TABLES.TABLES) || [];
      return all.find((t) =>
        t?.table_name === tableName ||
        t?.tableName === tableName ||
        t?.table_id === tableName ||
        t?.tableId === tableName,
      ) || null;
    }
  } catch {
    return null;
  }
  return null;
}

export {
  findTableInCache,
  resolveColumnType,
  resolveCompositeKeyPartitions,
};
