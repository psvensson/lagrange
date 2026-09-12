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

const ZERO = 0;
const definition = buildScenarioAFailureAtomicityCase();
const repeated = buildScenarioAFailureAtomicityCase();
const stableStateSha256 = 'f'.repeat(64);
const passingObservation = {
  terminalFailureObserved: true,
  errorMessage: definition.identity.expected.terminalErrorSubstring,
  stateBeforeSha256: stableStateSha256,
  stateAfterSha256: stableStateSha256,
};

assert.equal(definition.identity.caseId, 'scenario-a-failure-atomicity-v1');
assert.equal(definition.identity.operation.kind, 'new_order');
assert.equal(definition.identity.operation.lines.length, 2);
assert.equal(definition.identity.operation.lines[ZERO].itemId, 1);
assert.equal(
  definition.identity.operation.lines[1].itemId,
  definition.identity.workload.itemCount + 1,
);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.deepEqual(OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS, [
  'failureAtomicity:terminal_logical_request_must_not_leave_partial_transaction_effects',
  'forbidden:partial_commit',
]);

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
  calls.map(({statementId}) => statementId),
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
  stateAfterSha256: '0'.repeat(64),
});
assert.equal(partialCommit.passed, false);
assert.deepEqual(partialCommit.failures, ['partial_commit']);
assert.deepEqual(partialCommit.proofIds, []);

const noFailure = evaluateScenarioAFailureAtomicityObservation({
  ...passingObservation,
  terminalFailureObserved: false,
});
assert.equal(noFailure.passed, false);
assert.deepEqual(noFailure.failures, ['terminal_failure_missing']);
assert.deepEqual(noFailure.proofIds, []);

const wrongError = evaluateScenarioAFailureAtomicityObservation({
  ...passingObservation,
  errorMessage: 'different terminal error',
});
assert.equal(wrongError.passed, false);
assert.deepEqual(wrongError.failures, ['unexpected_error']);
assert.deepEqual(wrongError.proofIds, []);

assert.throws(
  () => evaluateScenarioAFailureAtomicityObservation({}),
  /failure-atomicity stateBeforeSha256 must be a SHA-256 digest/u,
);

console.log('oltp-scenario-a-failure-atomicity-case-guard: PASS');
