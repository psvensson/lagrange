import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  ZERO_COUNT,
  textOrUnknown,
} from './causal-analysis-schema.js';

const ERROR_TIMEOUT_PATTERN = /within (\d+)ms/u;
const TYPE_NUMBER = 'number';
const ONE_COUNT = 1;

function buildBudgetEvidence({observed, limit, evidencePath, progressEvidence}) {
  return {
    observed,
    limit,
    evidencePath,
    progressEvidence,
  };
}

function selectPresentValue(primaryValue, fallbackValue) {
  return primaryValue !== ABSENT_VALUE ? primaryValue : fallbackValue;
}

function remainingBudget(observed, limit) {
  if (typeof observed !== TYPE_NUMBER || typeof limit !== TYPE_NUMBER) {
    return UNKNOWN_VALUE;
  }
  return limit - observed;
}

function budgetRatio(observed, limit) {
  if (typeof observed !== TYPE_NUMBER ||
      typeof limit !== TYPE_NUMBER ||
      limit === ZERO_COUNT) {
    return UNKNOWN_VALUE;
  }
  return observed / limit;
}

function parseTimeoutLimit(errorText) {
  const match = textOrUnknown(errorText).match(ERROR_TIMEOUT_PATTERN);
  if (!match) {
    return ABSENT_VALUE;
  }
  return Number(match[ONE_COUNT]);
}

function uniqueValues(values) {
  return [...new Set(values)];
}

export {
  budgetRatio,
  buildBudgetEvidence,
  parseTimeoutLimit,
  remainingBudget,
  selectPresentValue,
  uniqueValues,
};
