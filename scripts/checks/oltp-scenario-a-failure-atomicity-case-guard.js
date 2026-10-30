import assert from 'node:assert/strict';

import {
  OLTP_SQL_STATEMENT,
  executeOltpBaselineTransaction,
} from '../../test/distributed/harness/oltp-baseline-transaction-executor.js';
import {
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
  buildScenarioAFailureAtomicityCase,
  evaluateScenarioAFailureAtomicityObservation,
} from '../../test/distributed/harness/oltp-scenario-a-failure-atomicity-case.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const ZERO = 0;
const SHA256_LENGTH = 64;
const STABLE_STATE_CHAR = 'f';
const ZERO_STATE_CHAR = '0';
const EXPECTED_CASE_ID = 'scenario-a-failure-atomicity-v1';
const EXPECTED_OPERATION_KIND = 'new_order';
const PROOF_ID_FAILURE_ATOMICITY =
  'failureAtomicity:terminal_logical_request_must_not_leave_partial_transaction_effects';
const PROOF_ID_PARTIAL_COMMIT = 'forbidden:partial_commit';
const EXPECTED_PROOF_IDS = Object.freeze([
  PROOF_ID_FAILURE_ATOMICITY,
  PROOF_ID_PARTIAL_COMMIT,
]);
const FAILURE_PARTIAL_COMMIT = 'partial_commit';
const FAILURE_TERMINAL_FAILURE_MISSING = 'terminal_failure_missing';
const FAILURE_UNEXPECTED_ERROR = 'unexpected_error';
const DIFFERENT_TERMINAL_ERROR = 'different terminal error';
const PASS_MESSAGE = 'oltp-scenario-a-failure-atomicity-case-guard: PASS';

const definition = buildScenarioAFailureAtomicityCase();
const repeated = buildScenarioAFailureAtomicityCase();
const stableStateSha256 = STABLE_STATE_CHAR.repeat(SHA256_LENGTH);
const passingObservation = {
  terminalFailureObserved: true,
  errorMessage: definition.identity.expected.terminalErrorSubstring,
  stateBeforeSha256: stableStateSha256,
  stateAfterSha256: stableStateSha256,
};

assert.equal(definition.identity.caseId, EXPECTED_CASE_ID);
assert.equal(definition.identity.operation.kind, EXPECTED_OPERATION_KIND);
assert.equal(definition.identity.operation.lines.length, 2);
assert.equal(definition.identity.operation.lines[ZERO].itemId, 1);
assert.equal(
  definition.identity.operation.lines[1].itemId,
  definition.identity.workload.itemCount + 1,
);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.deepEqual(OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS, EXPECTED_PROOF_IDS);

const calls = [];
const session = {
  async transaction(callback) {
    return callback(session);
  },
  async execute(statementId, parameters) {
    calls.push({statementId, parameters});
    if (statementId === OLTP_SQL_STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE) {
      return {rows: [{next_order_id: 301}], rowCount: 1};
    }
    if (statementId === OLTP_SQL_STATEMENT.ITEM_PRICE) {
      if (Number(parameters[ZERO]) === 1) {
        return {rows: [{price_cents: 125}], rowCount: 1};
      }
      return {rows: [], rowCount: 0};
    }
    if (statementId === OLTP_SQL_STATEMENT.STOCK_QUANTITY_FOR_UPDATE) {
      return {rows: [{quantity: 50}], rowCount: 1};
    }
    return {rows: [], rowCount: 1};
  },
};

await assert.rejects(
  executeOltpBaselineTransaction(
    session,
    definition.identity.operation,
    definition.identity.workload,
  ),
  /OLTP transaction expected one item row/u,
);
assert.deepEqual(
  arrayMap(calls, ({statementId}) => statementId),
  [
    OLTP_SQL_STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE,
    OLTP_SQL_STATEMENT.DISTRICT_SET_NEXT_ORDER,
    OLTP_SQL_STATEMENT.ORDER_INSERT,
    OLTP_SQL_STATEMENT.NEW_ORDER_INSERT,
    OLTP_SQL_STATEMENT.ITEM_PRICE,
    OLTP_SQL_STATEMENT.STOCK_QUANTITY_FOR_UPDATE,
    OLTP_SQL_STATEMENT.STOCK_UPDATE,
    OLTP_SQL_STATEMENT.ORDER_LINE_INSERT,
    OLTP_SQL_STATEMENT.ITEM_PRICE,
  ],
);

const passing = evaluateScenarioAFailureAtomicityObservation(passingObservation);
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS);

const partialCommit = evaluateScenarioAFailureAtomicityObservation({
  ...passingObservation,
  stateAfterSha256: ZERO_STATE_CHAR.repeat(SHA256_LENGTH),
});
assert.equal(partialCommit.passed, false);
assert.deepEqual(partialCommit.failures, [FAILURE_PARTIAL_COMMIT]);
assert.deepEqual(partialCommit.proofIds, []);

const noFailure = evaluateScenarioAFailureAtomicityObservation({
  ...passingObservation,
  terminalFailureObserved: false,
});
assert.equal(noFailure.passed, false);
assert.deepEqual(noFailure.failures, [FAILURE_TERMINAL_FAILURE_MISSING]);
assert.deepEqual(noFailure.proofIds, []);

const wrongError = evaluateScenarioAFailureAtomicityObservation({
  ...passingObservation,
  errorMessage: DIFFERENT_TERMINAL_ERROR,
});
assert.equal(wrongError.passed, false);
assert.deepEqual(wrongError.failures, [FAILURE_UNEXPECTED_ERROR]);
assert.deepEqual(wrongError.proofIds, []);

assert.throws(
  () => evaluateScenarioAFailureAtomicityObservation({}),
  /failure-atomicity stateBeforeSha256 must be a SHA-256 digest/u,
);

console.log(PASS_MESSAGE);
