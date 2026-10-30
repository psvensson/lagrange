import {DISTRIBUTED_PREDICATE_SHAPE as PREDICATE_SHAPE} from
  './distributed/distributed-query-plan-constants.js';
import {QUERY_OPERATOR} from './query-constants.js';
import {
  decodePartitionBoundaryValue,
  resolveDeclaredPartitionKeyType,
} from '../partition/partition-boundary-representation.js';

const KEY_CONDITION_TYPE = Object.freeze({
  EQUALS: 'equals',
  RANGE: 'range',
  IN: 'in',
});

const LOCAL_ERR_MSG = Object.freeze({
  UNBOUND_PARAMETER_PREFIX: 'Unbound parameter index: ',
  INVALID_PARAMETER_NAN: 'Invalid parameter value: NaN is unrepresentable',
  INVALID_NUMERIC_NAN: 'Invalid numeric expression: NaN',
  INVALID_KEY_CONDITION_NAN: 'Invalid key condition value: NaN is unrepresentable',
  INVALID_TYPE_PREFIX: 'Invalid key condition value of type ',
  INVALID_PARTITION_KEY_NAN: 'Invalid partition key: NaN is unrepresentable',
  INVALID_PARTITION_KEY_TYPE_PREFIX: 'Invalid partition key value of type ',
});

const LOCAL_OP = Object.freeze({
  MINUS: '-',
});

const LOCAL_AST_NODE_TYPE = Object.freeze({
  PARAMETER: 'parameter',
  LITERAL: 'literal',
  NUMBER: 'number',
  STRING: 'string',
  SINGLE_QUOTE_STRING: 'single_quote_string',
  BOOL: 'bool',
  UNARY: 'unary',
  UNARY_EXPR: 'unary_expr',
});

const LITERAL_NODE_TYPES = new Set([
  LOCAL_AST_NODE_TYPE.LITERAL,
  LOCAL_AST_NODE_TYPE.NUMBER,
  LOCAL_AST_NODE_TYPE.STRING,
  LOCAL_AST_NODE_TYPE.SINGLE_QUOTE_STRING,
  LOCAL_AST_NODE_TYPE.BOOL,
]);

const createInitialKeyConditions = () => ({
  type: null,
  values: [],
  low: null,
  high: null,
  lowInclusive: true,
  highInclusive: false,
  fromBetween: false,
  contradiction: false,
  predicateShape: PREDICATE_SHAPE.SCATTER,
});

const resolvePredicateShape = (conditions) => {
  if (conditions.contradiction) {
    return PREDICATE_SHAPE.POINT;
  }
  if (conditions.type === KEY_CONDITION_TYPE.EQUALS) {
    return PREDICATE_SHAPE.EQ;
  }
  if (conditions.type === KEY_CONDITION_TYPE.IN) {
    return PREDICATE_SHAPE.IN;
  }
  if (conditions.type === KEY_CONDITION_TYPE.RANGE && conditions.fromBetween) {
    return PREDICATE_SHAPE.BETWEEN;
  }
  if (conditions.type === KEY_CONDITION_TYPE.RANGE) {
    return PREDICATE_SHAPE.RANGE;
  }
  return PREDICATE_SHAPE.SCATTER;
};

/**
 * Extract a bound parameter value from the resolution context.
 *
 * @param {Object} node - AST parameter node.
 * @param {Object} resolutionContext - Resolver context containing params and state.
 * @return {*} Extracted parameter value.
 */
function extractParameterValue(node, resolutionContext) {
  const hasParams = resolutionContext && Array.isArray(resolutionContext.params);
  let idx;
  if (typeof node.index === 'number') {
    idx = node.index;
  } else if (resolutionContext?.parameterState) {
    idx = resolutionContext.parameterState.nextIndex;
    resolutionContext.parameterState.nextIndex += 1;
  } else {
    idx = 0;
  }

  if (hasParams) {
    if (idx < 0 || idx >= resolutionContext.params.length) {
      throw new Error(`${LOCAL_ERR_MSG.UNBOUND_PARAMETER_PREFIX}${idx}`);
    }
    const val = resolutionContext.params[idx];
    if (typeof val === 'number' && Number.isNaN(val)) {
      throw new Error(LOCAL_ERR_MSG.INVALID_PARAMETER_NAN);
    }
    return val;
  }
  return undefined;
}

/**
 * Extract value from a unary expression AST node.
 *
 * @param {Object} node - AST unary node.
 * @param {Object} resolutionContext - Resolver context.
 * @param {string|null} keyType - Declared key type.
 * @return {*} Evaluated unary value or undefined.
 */
function extractUnaryValue(node, resolutionContext, keyType) {
  const operandNode = node.operand || node.expr;
  const operand = extractConditionValue(operandNode, resolutionContext, keyType);
  if (operand === undefined) return undefined;
  if (typeof operand === 'bigint') {
    return node.operator === LOCAL_OP.MINUS ? -operand : operand;
  }
  const num = Number(operand);
  if (Number.isNaN(num)) {
    throw new Error(LOCAL_ERR_MSG.INVALID_NUMERIC_NAN);
  }
  return node.operator === LOCAL_OP.MINUS ? -num : num;
}

/**
 * Validate and optionally coerce a candidate key condition value.
 * Fails closed on NaN, symbols, functions, or boundary type mismatch.
 *
 * @param {*} val - Value to validate.
 * @param {string|null} keyType - Declared partition key type.
 * @return {*} Coerced/canonical typed value.
 */
function validateAndCoerceKeyConditionValue(val, keyType) {
  if (val === null || val === undefined) {
    return val;
  }
  if (typeof val === 'number' && Number.isNaN(val)) {
    throw new Error(LOCAL_ERR_MSG.INVALID_KEY_CONDITION_NAN);
  }
  if (typeof val === 'symbol' || typeof val === 'function') {
    throw new Error(`${LOCAL_ERR_MSG.INVALID_TYPE_PREFIX}${typeof val}`);
  }
  if (!keyType) {
    return val;
  }
  let norm = val;
  if (norm instanceof Uint8Array && !Buffer.isBuffer(norm)) {
    norm = Buffer.from(norm.buffer, norm.byteOffset, norm.byteLength);
  }
  return decodePartitionBoundaryValue(norm, keyType);
}

/**
 * Extract and validate a key condition value from an AST expression node.
 * Fails closed on unbound parameters or unrepresentable key values.
 *
 * @param {Object} node - AST expression node.
 * @param {Object} resolutionContext - Resolver context containing params and state.
 * @param {string|null} [keyType=null] - Declared partition key type.
 * @return {*} Extracted value or undefined if node cannot provide a value.
 */
function extractConditionValue(node, resolutionContext, keyType = null) {
  if (!node) return undefined;

  let val;
  if (node.type === LOCAL_AST_NODE_TYPE.PARAMETER) {
    val = extractParameterValue(node, resolutionContext);
    if (val === undefined) return undefined;
  } else if (LITERAL_NODE_TYPES.has(node.type)) {
    val = node.value;
  } else if (node.type === LOCAL_AST_NODE_TYPE.UNARY ||
             node.type === LOCAL_AST_NODE_TYPE.UNARY_EXPR) {
    val = extractUnaryValue(node, resolutionContext, keyType);
    if (val === undefined) return undefined;
  } else {
    return undefined;
  }

  return validateAndCoerceKeyConditionValue(val, keyType);
}

/**
 * Check if a candidate value contradicts existing range conditions.
 *
 * @param {Object} conditions - Key conditions accumulator.
 * @param {*} value - Literal value.
 * @param {Function} compareValues - Key comparison function.
 * @return {boolean} True if contradictory.
 */
function checkRangeContradiction(conditions, value, compareValues) {
  if (!isNil(conditions.low)) {
    const cmp = compareValues(value, conditions.low);
    if (cmp < 0 || (cmp === 0 && !conditions.lowInclusive)) {
      return true;
    }
  }
  if (!isNil(conditions.high)) {
    const cmp = compareValues(value, conditions.high);
    if (cmp > 0 || (cmp === 0 && !conditions.highInclusive)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply equality key condition with intersection and contradiction detection.
 *
 * @param {Object} conditions - Key conditions accumulator.
 * @param {*} value - Literal value.
 * @param {Function} compareValues - Key comparison function.
 */
function applyEqualsCondition(conditions, value, compareValues) {
  if (conditions.type === KEY_CONDITION_TYPE.EQUALS) {
    if (conditions.values.some((v) => compareValues(v, value) !== 0)) {
      conditions.contradiction = true;
      return;
    }
  } else if (conditions.type === KEY_CONDITION_TYPE.RANGE) {
    if (checkRangeContradiction(conditions, value, compareValues)) {
      conditions.contradiction = true;
      return;
    }
  }
  conditions.type = KEY_CONDITION_TYPE.EQUALS;
  conditions.values = [value];
}

/**
 * Update the lower bound of a range condition.
 *
 * @param {Object} conditions - Key conditions accumulator.
 * @param {*} value - Literal value.
 * @param {boolean} inclusive - Whether bound is inclusive.
 * @param {Function} compareValues - Key comparison function.
 */
function updateRangeLow(conditions, value, inclusive, compareValues) {
  if (isNil(conditions.low)) {
    conditions.low = value;
    conditions.lowInclusive = inclusive;
    conditions.type = KEY_CONDITION_TYPE.RANGE;
    return;
  }
  const cmp = compareValues(value, conditions.low);
  if (cmp > 0) {
    conditions.low = value;
    conditions.lowInclusive = inclusive;
  } else if (cmp === 0 && !inclusive) {
    conditions.lowInclusive = false;
  }
}

/**
 * Update the upper bound of a range condition.
 *
 * @param {Object} conditions - Key conditions accumulator.
 * @param {*} value - Literal value.
 * @param {boolean} inclusive - Whether bound is inclusive.
 * @param {Function} compareValues - Key comparison function.
 */
function updateRangeHigh(conditions, value, inclusive, compareValues) {
  if (isNil(conditions.high)) {
    conditions.high = value;
    conditions.highInclusive = inclusive;
    conditions.type = KEY_CONDITION_TYPE.RANGE;
    return;
  }
  const cmp = compareValues(value, conditions.high);
  if (cmp < 0) {
    conditions.high = value;
    conditions.highInclusive = inclusive;
  } else if (cmp === 0 && !inclusive) {
    conditions.highInclusive = false;
  }
}

/**
 * Verify that lower and upper bounds of a range do not contradict each other.
 *
 * @param {Object} conditions - Key conditions accumulator.
 * @param {Function} compareValues - Key comparison function.
 */
function verifyRangeBounds(conditions, compareValues) {
  if (!isNil(conditions.low) && !isNil(conditions.high)) {
    const cmpHigh = compareValues(conditions.low, conditions.high);
    if (cmpHigh > 0 ||
        (cmpHigh === 0 && (!conditions.lowInclusive || !conditions.highInclusive))) {
      conditions.contradiction = true;
    }
  }
}

/**
 * Apply greater-than condition with intersection and contradiction detection.
 *
 * @param {Object} conditions - Key conditions accumulator.
 * @param {*} value - Literal value.
 * @param {boolean} inclusive - Whether operator is >=.
 * @param {Function} compareValues - Key comparison function.
 */
function applyGreaterThanCondition(conditions, value, inclusive, compareValues) {
  if (conditions.type === KEY_CONDITION_TYPE.EQUALS) {
    const val = conditions.values[0];
    const cmp = compareValues(val, value);
    if (cmp < 0 || (cmp === 0 && !inclusive)) {
      conditions.contradiction = true;
    }
    return;
  }
  updateRangeLow(conditions, value, inclusive, compareValues);
  verifyRangeBounds(conditions, compareValues);
}

/**
 * Apply less-than condition with intersection and contradiction detection.
 *
 * @param {Object} conditions - Key conditions accumulator.
 * @param {*} value - Literal value.
 * @param {boolean} inclusive - Whether operator is <=.
 * @param {Function} compareValues - Key comparison function.
 */
function applyLessThanCondition(conditions, value, inclusive, compareValues) {
  if (conditions.type === KEY_CONDITION_TYPE.EQUALS) {
    const val = conditions.values[0];
    const cmp = compareValues(val, value);
    if (cmp > 0 || (cmp === 0 && !inclusive)) {
      conditions.contradiction = true;
    }
    return;
  }
  updateRangeHigh(conditions, value, inclusive, compareValues);
  verifyRangeBounds(conditions, compareValues);
}

/**
 * Apply one binary key condition with intersection and contradiction detection.
 * @param {Object} conditions - Key conditions accumulator.
 * @param {string} operator - Comparison operator.
 * @param {*} value - Literal value.
 * @param {Function} compareValues - Key comparison function.
 * @return {boolean}
 */
function applyBinaryKeyCondition(conditions, operator, value, compareValues) {
  if (conditions.contradiction) return true;

  if (operator === QUERY_OPERATOR.EQUALS) {
    applyEqualsCondition(conditions, value, compareValues);
    return true;
  }

  const isGt = (operator === QUERY_OPERATOR.GREATER_THAN ||
    operator === QUERY_OPERATOR.GREATER_THAN_OR_EQUAL);
  if (isGt) {
    const inclusive = (operator === QUERY_OPERATOR.GREATER_THAN_OR_EQUAL);
    applyGreaterThanCondition(conditions, value, inclusive, compareValues);
    return true;
  }

  const isLt = (operator === QUERY_OPERATOR.LESS_THAN ||
    operator === QUERY_OPERATOR.LESS_THAN_OR_EQUAL);
  if (isLt) {
    const inclusive = (operator === QUERY_OPERATOR.LESS_THAN_OR_EQUAL);
    applyLessThanCondition(conditions, value, inclusive, compareValues);
    return true;
  }

  return false;
}

/**
 * Decode a candidate partition key value against declared key type.
 *
 * @param {*} value - Candidate key value.
 * @param {string|null} keyType - Declared key type.
 * @return {*} Decoded boundary value.
 */
function decodeCandidateValue(value, keyType) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' && Number.isNaN(value)) {
    throw new Error(LOCAL_ERR_MSG.INVALID_PARTITION_KEY_NAN);
  }
  if (typeof value === 'symbol' || typeof value === 'function') {
    throw new Error(`${LOCAL_ERR_MSG.INVALID_PARTITION_KEY_TYPE_PREFIX}${typeof value}`);
  }
  if (!keyType) {
    return value;
  }
  let normalized = value;
  if (normalized instanceof Uint8Array && !Buffer.isBuffer(normalized)) {
    normalized = Buffer.from(
      normalized.buffer,
      normalized.byteOffset,
      normalized.byteLength,
    );
  }
  return decodePartitionBoundaryValue(normalized, keyType);
}

/**
 * Extract raw start and end boundary bounds from partition metadata.
 *
 * @param {Object} partition - Partition metadata.
 * @return {{rawStart: *, rawEnd: *}} Raw bounds.
 */
function extractRawPartitionBounds(partition) {
  const rawStart = 'partition_key_start' in partition ?
    partition.partition_key_start : partition.keyRange?.start;
  const rawEnd = 'partition_key_end' in partition ?
    partition.partition_key_end : partition.keyRange?.end;
  return {rawStart, rawEnd};
}

/**
 * Check if a value is null or undefined.
 *
 * @param {*} val - Value to check.
 * @return {boolean} True if null or undefined.
 */
function isNil(val) {
  return val === null || val === undefined;
}

/**
 * Resolve partition key type from partition or table metadata.
 *
 * @param {Object} partition - Partition metadata.
 * @param {Object|null} tableInfo - Table metadata row.
 * @return {string|null} Resolved key type.
 */
function resolvePartitionKeyType(partition, tableInfo) {
  return partition?.partition_key_type ||
    partition?.partitionKeyType ||
    resolveDeclaredPartitionKeyType(tableInfo) ||
    null;
}

/**
 * Check if partition end is strictly before low range bound.
 *
 * @param {*} pEnd - Partition end bound.
 * @param {*} compLow - Range low bound.
 * @param {boolean} lowInclusive - Whether low bound is inclusive.
 * @param {Function} compareValues - Key comparison function.
 * @return {boolean} True if before.
 */
function isEndBeforeLow(pEnd, compLow, lowInclusive, compareValues) {
  if (isNil(pEnd) || isNil(compLow)) return false;
  const cmp = compareValues(pEnd, compLow);
  return cmp < 0 || (cmp === 0 && !lowInclusive);
}

/**
 * Check if partition start is strictly after high range bound.
 *
 * @param {*} pStart - Partition start bound.
 * @param {*} compHigh - Range high bound.
 * @param {boolean} highInclusive - Whether high bound is inclusive.
 * @param {Function} compareValues - Key comparison function.
 * @return {boolean} True if after.
 */
function isStartAfterHigh(pStart, compHigh, highInclusive, compareValues) {
  if (isNil(pStart) || isNil(compHigh)) return false;
  const cmp = compareValues(pStart, compHigh);
  return cmp > 0 || (cmp === 0 && !highInclusive);
}

export {
  KEY_CONDITION_TYPE,
  createInitialKeyConditions,
  resolvePredicateShape,
  applyBinaryKeyCondition,
  extractConditionValue,
  decodeCandidateValue,
  extractRawPartitionBounds,
  isNil,
  resolvePartitionKeyType,
  isEndBeforeLow,
  isStartAfterHigh,
};
