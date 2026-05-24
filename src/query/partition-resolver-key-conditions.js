import {DISTRIBUTED_PREDICATE_SHAPE as PREDICATE_SHAPE} from
  './distributed/distributed-query-plan-constants.js';

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
  predicateShape: PREDICATE_SHAPE.SCATTER,
});

const resolvePredicateShape = (conditions) => {
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

export {
  KEY_CONDITION_TYPE,
  createInitialKeyConditions,
  resolvePredicateShape,
};
