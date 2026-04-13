// @ts-nocheck
import {EXPECTED_CONTRACT} from './examples-runner-constants.js';

/**
 * Flatten heterogeneous callback execution responses to a row array.
 *
 * @param {Object} executionResult
 * @return {Object[]}
 */
function flattenRows(executionResult) {
  const rows = [];
  if (Array.isArray(executionResult?.results)) {
    rows.push(...executionResult.results);
  }

  const partitionResults = executionResult?.hostResult?.partitionResults;
  if (Array.isArray(partitionResults)) {
    for (const partitionResult of partitionResults) {
      if (Array.isArray(partitionResult.rows)) {
        rows.push(...partitionResult.rows);
      }
    }
  }

  return rows;
}

/**
 * Validate optional first-row field contract.
 *
 * @param {Object} firstRow
 * @param {Object} expectedFirstRow
 * @return {boolean}
 */
function matchesFirstRow(firstRow, expectedFirstRow) {
  if (!expectedFirstRow || typeof expectedFirstRow !== 'object') {
    return true;
  }

  for (const [key, expectedValue] of Object.entries(expectedFirstRow)) {
    if (key === EXPECTED_CONTRACT.FIRST_ROW_ERROR_INCLUDES) {
      const actualValue = String(firstRow?.error || '');
      if (!actualValue
        .toLowerCase()
        .includes(String(expectedValue).toLowerCase())) {
        return false;
      }
      continue;
    }

    if (firstRow?.[key] !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * Validate runtime output against the example's expected contract.
 *
 * @param {Object} example
 * @param {Object} executionResult
 * @return {{passed: boolean, error: string|null, rows: Object[]}}
 */
function validateExampleOutput(example, executionResult) {
  const expected = example.expected || {};
  const rows = flattenRows(executionResult);

  if (expected.shape === EXPECTED_CONTRACT.SHAPE_ARRAY && !Array.isArray(rows)) {
    return {
      passed: false,
      error: `Expected array output for ${example.id}`,
      rows,
    };
  }

  const minRows = Number(expected.minRows || 0);
  if (rows.length < minRows) {
    return {
      passed: false,
      error: `Expected at least ${minRows} rows for ${example.id}, got ${rows.length}`,
      rows,
    };
  }

  if (rows.length > 0 && expected.firstRow) {
    if (!matchesFirstRow(rows[0], expected.firstRow)) {
      return {
        passed: false,
        error: `First-row contract failed for ${example.id}`,
        rows,
      };
    }
  }

  return {
    passed: true,
    error: null,
    rows,
  };
}

export {validateExampleOutput};
