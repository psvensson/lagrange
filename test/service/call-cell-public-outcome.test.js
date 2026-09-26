/**
 * The public, topology-neutral outcome class of a failed CALL invocation,
 * derived in ONE place (src/service/call-cell-routing-contract.js) from the
 * owner classification, the per-dispatch `invoked` flag, and the
 * invocation-level execution evidence the invoker records.
 *
 * The expected classes below are written from the retry contract in
 * docs/execution-semantics.md ("Retries": automatic retry only when the
 * failure is retryable AND the runtime can prove guest code did not run;
 * ambiguous outcomes are never retried; exactly-once VISIBILITY, not
 * execution), not read back from the derivation under test.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CALL_CELL_FAILURE_ORIGIN,
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_CELL_ROUTE_ERROR_PUBLIC,
  CALL_OUTCOME_CLASS,
  CALL_OUTCOME_RETRY_SAFE_CLASSES,
  CallCellRoutingError,
  callFailureProvesNoExecution,
  createCallRoutingFailure,
  publicCallOutcomeOf,
  recordInvocationExecutionStarted,
} from '../../src/service/call-cell-routing-contract.js';
import {SERVICE_LIFECYCLE_COMMAND} from
  '../../src/service/service-lifecycle-command-contract.js';
import {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';

const CODE = CALL_CELL_ROUTE_ERROR_CODE;
const CLASSIFICATION = CALL_CELL_ROUTE_CLASSIFICATION;
const OUTCOME = CALL_OUTCOME_CLASS;
const TOPOLOGY_NODE_ID = 'node-7f3a';
const TOPOLOGY_PARTITION_ID = 'seam_ratings-p2';
const INTERNAL_MESSAGE =
  `diagnostic naming ${TOPOLOGY_NODE_ID} and ${TOPOLOGY_PARTITION_ID}`;
const UNKNOWN_FUTURE_CODE = 'call_cell_future_code';
const SECURITY_CONTEXT = Object.freeze({
  principal: 'images-app',
  roles: Object.freeze(['application']),
  tenantId: 'images',
});
const CALL_NAME = 'images-seam-owned-range';

function failure(code, classification, fields = {}) {
  const error = createCallRoutingFailure(code, INTERNAL_MESSAGE, {
    classification,
    invoked: fields.invoked === true,
  });
  if (fields.invocationExecutionStarted) {
    recordInvocationExecutionStarted(error);
  }
  return error;
}

// [case, error, expected class] - one row per documented situation.
const DOCUMENTED_CASES = Object.freeze([
  ['moved target, nothing ran',
    failure(CODE.TARGET_STALE, CLASSIFICATION.RETRYABLE),
    OUTCOME.RETRYABLE_STALE_TARGET],
  ['no ready Cell on the shard host, nothing ran',
    failure(CODE.HOST_CELL_UNAVAILABLE, CLASSIFICATION.RETRYABLE),
    OUTCOME.TEMPORARILY_UNAVAILABLE],
  ['no ready Cell anywhere',
    failure(CODE.ROUTE_UNAVAILABLE, CLASSIFICATION.RETRYABLE),
    OUTCOME.TEMPORARILY_UNAVAILABLE],
  ['ingress shutting down before dispatch',
    failure(CODE.SHUTTING_DOWN, CLASSIFICATION.RETRYABLE),
    OUTCOME.TEMPORARILY_UNAVAILABLE],
  ['ingress shutting down after dispatch started',
    failure(CODE.SHUTTING_DOWN, CLASSIFICATION.AMBIGUOUS, {invoked: true}),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['unknown Binding name',
    failure(CODE.ROUTE_NOT_FOUND, CLASSIFICATION.TERMINAL),
    OUTCOME.DEFINITELY_NOT_EXECUTED],
  ['ambiguous Binding name',
    failure(CODE.ROUTE_AMBIGUOUS, CLASSIFICATION.TERMINAL),
    OUTCOME.DEFINITELY_NOT_EXECUTED],
  ['statement-less Binding',
    failure(CODE.NOT_INVOCABLE, CLASSIFICATION.TERMINAL),
    OUTCOME.DEFINITELY_NOT_EXECUTED],
  ['invalid declared statement',
    failure(CODE.STATEMENT_INVALID, CLASSIFICATION.TERMINAL),
    OUTCOME.DEFINITELY_NOT_EXECUTED],
  ['invalid arguments',
    failure(CODE.INVALID_ARGUMENTS, CLASSIFICATION.TERMINAL),
    OUTCOME.DEFINITELY_NOT_EXECUTED],
  ['not authenticated',
    failure(CODE.AUTHENTICATION_FAILED, CLASSIFICATION.TERMINAL),
    OUTCOME.DEFINITELY_NOT_EXECUTED],
  ['not authorized',
    failure(CODE.AUTHORIZATION_FAILED, CLASSIFICATION.TERMINAL),
    OUTCOME.DEFINITELY_NOT_EXECUTED],
  ['deadline passed before dispatch',
    failure(CODE.DEADLINE_EXHAUSTED, CLASSIFICATION.TERMINAL),
    OUTCOME.DEFINITELY_NOT_EXECUTED],
  ['deadline passed after shards ran',
    failure(CODE.DEADLINE_EXHAUSTED, CLASSIFICATION.TERMINAL,
      {invocationExecutionStarted: true}),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['guest threw',
    failure(CODE.COMPONENT_FAILED, CLASSIFICATION.TERMINAL, {invoked: true}),
    OUTCOME.TERMINAL_APPLICATION_FAILURE],
  ['guest returned an invalid result',
    failure(CODE.INVALID_COMPONENT_RESULT, CLASSIFICATION.TERMINAL),
    OUTCOME.TERMINAL_APPLICATION_FAILURE],
  ['shard batch over its declared bound',
    failure(CODE.BATCH_BOUND_EXCEEDED, CLASSIFICATION.TERMINAL),
    OUTCOME.TERMINAL_APPLICATION_FAILURE],
  ['acknowledged without an outcome',
    failure(CODE.ACK_ONLY, CLASSIFICATION.AMBIGUOUS),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['delivery failed after dispatch',
    failure(CODE.HANDLER_FAILED, CLASSIFICATION.AMBIGUOUS),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['transport failed after dispatch',
    failure(CODE.TRANSPORT_FAILED, CLASSIFICATION.TERMINAL),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['reduce missing a partial after shards ran',
    failure(CODE.REDUCE_INCOMPLETE, CLASSIFICATION.RETRYABLE),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['retryable shard failure after a sibling shard ran',
    failure(CODE.HOST_CELL_UNAVAILABLE, CLASSIFICATION.RETRYABLE,
      {invocationExecutionStarted: true}),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['moved reduce target after shards and reduce ran',
    failure(CODE.TARGET_STALE, CLASSIFICATION.RETRYABLE,
      {invocationExecutionStarted: true}),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['untyped failure',
    new Error(INTERNAL_MESSAGE),
    OUTCOME.OUTCOME_UNCERTAIN],
  ['routing error with an undeclared code',
    new CallCellRoutingError(UNKNOWN_FUTURE_CODE, INTERNAL_MESSAGE, {
      classification: CLASSIFICATION.RETRYABLE,
    }),
    OUTCOME.OUTCOME_UNCERTAIN],
]);

test('every routing code declares an origin and a public message ' +
  '(fails when a code is added without a class)', async (t) => {
  const codes = Object.values(CALL_CELL_ROUTE_ERROR_CODE).sort();
  t.same(Object.keys(CALL_CELL_ROUTE_ERROR_PUBLIC).sort(), codes,
    'the public declaration table is exactly the routing code set');
  const origins = Object.values(CALL_CELL_FAILURE_ORIGIN);
  for (const code of codes) {
    const declared = CALL_CELL_ROUTE_ERROR_PUBLIC[code];
    t.ok(origins.includes(declared.origin), `${code} has a known origin`);
    t.match(declared.message, /\S/u, `${code} has a public message`);
  }
});

test('every code under every classification maps to exactly one class',
  async (t) => {
    const classes = Object.values(CALL_OUTCOME_CLASS);
    for (const code of Object.values(CALL_CELL_ROUTE_ERROR_CODE)) {
      for (const classification of Object.values(CLASSIFICATION)) {
        for (const invoked of [false, true]) {
          const outcome = publicCallOutcomeOf(
            failure(code, classification, {invoked}));
          t.ok(classes.includes(outcome.outcomeClass),
            `${code}/${classification}/invoked=${invoked} is classified`);
          t.not(outcome.outcomeClass, CALL_OUTCOME_CLASS.SUCCESS,
            'a failure is never reported as success');
        }
      }
    }
  });

test('documented cases map to the documented class and retry safety',
  async (t) => {
    for (const [label, error, expected] of DOCUMENTED_CASES) {
      const outcome = publicCallOutcomeOf(error);
      t.equal(outcome.outcomeClass, expected, label);
      t.equal(outcome.retrySafe,
        CALL_OUTCOME_RETRY_SAFE_CLASSES.includes(expected),
        `${label}: retry-safe only for stale-target / temporarily-unavailable`);
      t.equal(outcome.retrySafe, callFailureProvesNoExecution(error) &&
        error.classification === CLASSIFICATION.RETRYABLE,
      `${label}: retry-safe iff retryable AND provably not executed`);
    }
  });

test('the public message never carries the internal diagnostic',
  async (t) => {
    for (const [label, error] of DOCUMENTED_CASES) {
      const {message} = publicCallOutcomeOf(error);
      t.notOk(message.includes(TOPOLOGY_NODE_ID), `${label}: no node id`);
      t.notOk(message.includes(TOPOLOGY_PARTITION_ID),
        `${label}: no partition id`);
    }
  });

function callOwner(invoke) {
  return new ServiceLifecycleCommandOwner({
    artifactResolver: {},
    callCellInvoker: invoke ? {invoke} : null,
    catalogOwner: {},
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });
}

test('the command owner projects a CALL failure through the contract ' +
  '(class, retry safety, topology-free message)', async (t) => {
  const result = await callOwner(async () => {
    throw failure(CODE.HOST_CELL_UNAVAILABLE, CLASSIFICATION.RETRYABLE);
  }).execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {name: CALL_NAME, schema_version: 2},
    SECURITY_CONTEXT,
  );
  t.equal(result.success, false);
  t.equal(result.errorCode, CODE.HOST_CELL_UNAVAILABLE);
  t.equal(result.detail.ownerCode, CODE.HOST_CELL_UNAVAILABLE);
  t.equal(result.detail.outcomeClass, OUTCOME.TEMPORARILY_UNAVAILABLE);
  t.equal(result.detail.retrySafe, true);
  t.notOk(result.error.includes(TOPOLOGY_NODE_ID),
    'the result message is the public one, not the diagnostic');
  t.notOk(JSON.stringify(result.detail).includes(TOPOLOGY_NODE_ID));
});

test('a CALL refused by the command owner itself never ran', async (t) => {
  const result = await callOwner(null).execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {name: CALL_NAME, schema_version: 2},
    SECURITY_CONTEXT,
  );
  t.equal(result.errorCode,
    SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.DEPENDENCY_REQUIRED);
  t.equal(result.detail.outcomeClass, OUTCOME.DEFINITELY_NOT_EXECUTED);
  t.equal(result.detail.retrySafe, false);
});

test('non-CALL lifecycle failures carry no call outcome class', async (t) => {
  const result = await callOwner(null).execute(
    SERVICE_LIFECYCLE_COMMAND.CREATE_BINDING,
    {name: CALL_NAME},
    SECURITY_CONTEXT,
  );
  t.equal(result.success, false);
  t.equal(result.detail.outcomeClass, undefined);
  t.equal(result.detail.retrySafe, undefined);
});
