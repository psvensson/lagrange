/**
 * A bootstrap request whose joiner attempt deadline or seed execution
 * budget is spent is one wait_bound_spent ERROR that still carries what the
 * replaced deferral WARN carried: the seed, the reason code, the retry-after
 * hint and both budgets. The response is unchanged.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapRequestOwner} from
  '../../src/bootstrap/owners/bootstrap-request-owner.js';
import {BOOTSTRAP_API_PROBE_REASON} from
  '../../src/bootstrap/bootstrap-api-constants.js';
import {createTopLevelOperationBudget} from
  '../../src/control-plane/timeout-budget.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const SEED_NODE_ID = 'seed-1';
const JOINER_NODE_ID = 'joiner-1';
const RETRY_AFTER_MS = 750;
const OBSERVED_AT_MS = 50_000;

function deferringOwner(logger) {
  return new BootstrapRequestOwner({
    delegates: {
      getLogger: () => logger,
      getSeedNodeId: () => SEED_NODE_ID,
      getBootstrapAdmissionRetryAfterMs: () => RETRY_AFTER_MS,
    },
  });
}

const reply = {code() {
  return reply;
}};

test('a spent client attempt deadline reports the seed, reason code and ' +
  'retry-after the deferral WARN carried', (t) => {
  const capture = captureLogger();
  const response = deferringOwner(capture.logger)
    .buildBootstrapRequestClientAttemptExpiredDeferredResponse(reply, {
      nodeId: JOINER_NODE_ID,
      nodeAddress: 'joiner-1:9000',
      deferStage: 'pre_admission',
      observedAtMs: OBSERVED_AT_MS,
      clientAttemptDeadline: {
        state: 'expired', deadlineMs: OBSERVED_AT_MS - 10,
        remainingBudgetMs: 0,
      },
    });
  t.equal(response.success, false, 'the request is still deferred');
  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  t.match(spent[0]?.context.lastObserved, {
    seedNodeId: SEED_NODE_ID,
    reasonCode: BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
    retryAfterMs: RETRY_AFTER_MS,
    deferStage: 'pre_admission',
    clientAttemptDeadlineState: 'expired',
    clientAttemptRemainingBudgetMs: 0,
  });
  t.equal(capture.warns().length, 0, 'no second (WARN) line');
  t.end();
});

test('a spent seed execution budget reports the remaining and configured ' +
  'budget with the seed and reason code', (t) => {
  const capture = captureLogger();
  const options = {nodeId: JOINER_NODE_ID, observedAtMs: OBSERVED_AT_MS};
  Object.defineProperty(options, 'timeoutBudget', {
    value: createTopLevelOperationBudget({
      configuredBudgetMs: 1_000,
      startedAtMs: OBSERVED_AT_MS - 2_000,
      operationName: 'bootstrap_request_execution',
    }),
    enumerable: false,
  });
  deferringOwner(capture.logger)
    .buildBootstrapRequestExecutionBudgetDeferredResponse(reply, options);
  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  t.match(spent[0]?.context.lastObserved, {
    seedNodeId: SEED_NODE_ID,
    reasonCode: BOOTSTRAP_API_PROBE_REASON
      .BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED,
    retryAfterMs: RETRY_AFTER_MS,
    requestExecutionRemainingBudgetMs: 0,
    requestExecutionConfiguredBudgetMs: 1_000,
  });
  t.end();
});
