import {DISTRIBUTED_PREDICATE_SHAPE as PREDICATE_SHAPE} from
  './distributed/distributed-query-plan-constants.js';
import {QUERY_OPERATOR} from './query-constants.js';

const KEY_CONDITION_TYPE = Object.freeze({
  EQUALS: 'equals',
  RANGE: 'range',
  IN: 'in',
});

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
    if (conditions.type === KEY_CONDITION_TYPE.EQUALS) {
      if (conditions.values.some((v) => compareValues(v, value) !== 0)) {
        conditions.contradiction = true;
        return true;
      }
    } else if (conditions.type === KEY_CONDITION_TYPE.RANGE) {
      if (conditions.low !== null && conditions.low !== undefined) {
        const cmp = compareValues(value, conditions.low);
        if (cmp < 0 || (cmp === 0 && !conditions.lowInclusive)) {
          conditions.contradiction = true;
          return true;
        }
      }
      if (conditions.high !== null && conditions.high !== undefined) {
        const cmp = compareValues(value, conditions.high);
        if (cmp > 0 || (cmp === 0 && !conditions.highInclusive)) {
          conditions.contradiction = true;
          return true;
        }
      }
    }
    conditions.type = KEY_CONDITION_TYPE.EQUALS;
    conditions.values = [value];
    return true;
  }

  const isGt = (operator === QUERY_OPERATOR.GREATER_THAN ||
    operator === QUERY_OPERATOR.GREATER_THAN_OR_EQUAL);
  const isLt = (operator === QUERY_OPERATOR.LESS_THAN ||
    operator === QUERY_OPERATOR.LESS_THAN_OR_EQUAL);

  if (isGt) {
    const inclusive = (operator === QUERY_OPERATOR.GREATER_THAN_OR_EQUAL);
    if (conditions.type === KEY_CONDITION_TYPE.EQUALS) {
      const val = conditions.values[0];
      const cmp = compareValues(val, value);
      if (cmp < 0 || (cmp === 0 && !inclusive)) {
        conditions.contradiction = true;
      }
      return true;
    }
    if (conditions.low === null || conditions.low === undefined) {
      conditions.low = value;
      conditions.lowInclusive = inclusive;
      conditions.type = KEY_CONDITION_TYPE.RANGE;
    } else {
      const cmp = compareValues(value, conditions.low);
      if (cmp > 0) {
        conditions.low = value;
        conditions.lowInclusive = inclusive;
      } else if (cmp === 0 && !inclusive) {
        conditions.lowInclusive = false;
      }
    }
    if (conditions.high !== null && conditions.high !== undefined) {
      const cmpHigh = compareValues(conditions.low, conditions.high);
      if (cmpHigh > 0 ||
          (cmpHigh === 0 && (!conditions.lowInclusive || !conditions.highInclusive))) {
        conditions.contradiction = true;
      }
    }
    return true;
  }

  if (isLt) {
    const inclusive = (operator === QUERY_OPERATOR.LESS_THAN_OR_EQUAL);
    if (conditions.type === KEY_CONDITION_TYPE.EQUALS) {
      const val = conditions.values[0];
      const cmp = compareValues(val, value);
      if (cmp > 0 || (cmp === 0 && !inclusive)) {
        conditions.contradiction = true;
      }
      return true;
    }
    if (conditions.high === null || conditions.high === undefined) {
      conditions.high = value;
      conditions.highInclusive = inclusive;
      conditions.type = KEY_CONDITION_TYPE.RANGE;
    } else {
      const cmp = compareValues(value, conditions.high);
      if (cmp < 0) {
        conditions.high = value;
        conditions.highInclusive = inclusive;
      } else if (cmp === 0 && !inclusive) {
        conditions.highInclusive = false;
      }
    }
    if (conditions.low !== null && conditions.low !== undefined) {
      const cmpLow = compareValues(conditions.low, conditions.high);
      if (cmpLow > 0 || (cmpLow === 0 && (!conditions.lowInclusive || !conditions.highInclusive))) {
        conditions.contradiction = true;
      }
    }
    return true;
  }

  return false;
}

export {
  KEY_CONDITION_TYPE,
  createInitialKeyConditions,
  resolvePredicateShape,
  applyBinaryKeyCondition,
};
