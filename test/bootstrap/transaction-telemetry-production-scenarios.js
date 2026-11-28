/**
 * The scenarios of the transaction-path telemetry production-defaults probe
 * (quest transaction-path-telemetry-export, sealed constraint
 * production-unchanged), and the recorders that observe what production does
 * in them. Each scenario runs one transaction through the real
 * SQLQueryEngine composition (its own coordinator, delivery and persistence
 * wiring) against the transaction persistence gateway, with participants
 * answering through a recording router.
 *
 * This module imports nothing of the telemetry: it runs unchanged on the
 * base tree, where the values of transaction-telemetry-production-baseline.js
 * were measured with it.
 */
import asyncHooks, {AsyncResource} from 'node:async_hooks';
import {syncBuiltinESMExports} from 'node:module';
import timers from 'node:timers';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {createMockSystemCache} from '../query/sql-query-engine-test-support.js';
import {answerParticipantTransactionRequest} from
  '../test-helpers/participant-protocol-double.js';
import {createTransactionPersistenceGateway} from
  '../test-helpers/transaction-persistence-gateway.js';

const HOST = Object.freeze({
  setTimeout: globalThis.setTimeout,
  setInterval: globalThis.setInterval,
  setImmediate: globalThis.setImmediate,
  timersSetTimeout: timers.setTimeout,
  timersSetInterval: timers.setInterval,
  timersSetImmediate: timers.setImmediate,
  createHook: asyncHooks.createHook,
});
const PROMISE_RESOURCE = 'PROMISE';
const SCENARIO_RESOURCE = 'TRANSACTION_TELEMETRY_PROBE_SCENARIO';
const NODE_ID = 'production-defaults-node';
const SESSION_ID = 'production-defaults-session';
const METRICS_TAG_PREFIX = 'metrics.';
const PARTITION_ID = 'p1';
const INSERT = 'INSERT INTO users (id, name) VALUES (?, ?)';
const INSERT_PARAMS = Object.freeze(['u1', 'Alice']);
const ROLLBACK_REFUSED_CODE = 'ROLLBACK_REFUSED_FOR_PROBE';

const PRODUCTION_SCENARIO = Object.freeze({
  COMMIT_ONE_WRITE: 'COMMIT_ONE_WRITE',
  ROLLBACK_ONE_WRITE: 'ROLLBACK_ONE_WRITE',
  REFUSED_PREPARE: 'REFUSED_PREPARE',
  ROLLBACK_FANOUT_FAILED_THEN_COMMIT: 'ROLLBACK_FANOUT_FAILED_THEN_COMMIT',
});

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function participantFailure(message, partitionId, fields) {
  return {success: false, operation: message.operation, partitionId,
    transactionId: message.transactionId, participantId: message.participantId, ...fields};
}

function isControl(message, operation) {
  return message.type === QUERY_OPERATION.TRANSACTION && message.operation === operation;
}

// What each scenario's participant answers instead of success.
const SCRIPTS = Object.freeze({
  [PRODUCTION_SCENARIO.REFUSED_PREPARE]: (message, partitionId) =>
    (isControl(message, QUERY_OPERATION.PREPARE) ? participantFailure(message, partitionId, {
      failureCode: PARTICIPANT_TRANSACTION_FAILURE_CODE.PREPARE_REFUSED,
      refusalCause: PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT,
      error: 'prepare refused'}) : undefined),
  // The first participant ROLLBACK is refused; a later drive succeeds.
  [PRODUCTION_SCENARIO.ROLLBACK_FANOUT_FAILED_THEN_COMMIT]: (message, partitionId, seen) =>
    (isControl(message, QUERY_OPERATION.ROLLBACK) && ++seen.rollback === 1 ?
      participantFailure(message, partitionId, {failureCode: ROLLBACK_REFUSED_CODE,
        error: 'rollback refused'}) : undefined),
});

function deliveryOf(message, partitionId) {
  return [message.type, message.operation ?? '', (message.sql || '').split(' ')[0],
    partitionId].join('|');
}

function createProductionNode(scenario) {
  resetEnvironment();
  const metricsTags = [];
  const deliveries = [];
  const seen = {rollback: 0};
  const gateway = createTransactionPersistenceGateway();
  const cache = createMockSystemCache([{table_name: 'users', primaryKey: 'id'}],
    [{partition_id: PARTITION_ID, table_name: 'users', partition_key_start: null,
      partition_key_end: null}]);
  const router = {
    async deliver(address, message) {
      const partitionId = address.split('/')[2];
      const copy = structuredClone(message);
      deliveries.push(deliveryOf(copy, partitionId));
      const scripted = SCRIPTS[scenario]?.(copy, partitionId, seen);
      const answer = scripted ?? (copy.type === QUERY_OPERATION.TRANSACTION ?
        answerParticipantTransactionRequest(copy, partitionId) :
        {success: true, rows: [], changes: 1});
      return buildDeliveryEnvelope({acknowledged: true}, answer);
    },
  };
  const record = (message) => {
    if (String(message).startsWith(METRICS_TAG_PREFIX)) metricsTags.push(message);
  };
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: cache,
    messageRouter: router,
    controlPlaneSystemTableGateway: gateway,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true,
    logger: {debug: record, info: record, warn: record, error: record},
  });
  return {engine, gateway, deliveries, metricsTags};
}

function recordingTimer(armed, label, host) {
  return (callback, delayMs, ...args) => {
    armed.push(`${label}(${delayMs})`);
    return host(callback, delayMs, ...args);
  };
}

function recordingImmediate(armed, label, host) {
  return (callback, ...args) => {
    armed.push(label);
    return host(callback, ...args);
  };
}

// Host timers armed through the globals or through an imported node:timers
// binding (syncBuiltinESMExports updates the live ESM bindings), async hook
// creation by the product, and every promise the scenario causes: the async
// resources triggered, transitively, from the scenario's own root, so the
// test runner's promises do not count and an added await or promise link in
// the product does.
function installRecorders(observation, root) {
  const armed = observation.armedHostPrimitives;
  const caused = new Set([root.asyncId()]);
  const counter = HOST.createHook({init(asyncId, type, triggerAsyncId) {
    if (!caused.has(triggerAsyncId)) return;
    caused.add(asyncId);
    if (type === PROMISE_RESOURCE) observation.promiseCreations += 1;
  }});
  globalThis.setTimeout = recordingTimer(armed, 'setTimeout', HOST.setTimeout);
  globalThis.setInterval = recordingTimer(armed, 'setInterval', HOST.setInterval);
  globalThis.setImmediate = recordingImmediate(armed, 'setImmediate', HOST.setImmediate);
  timers.setTimeout = recordingTimer(armed, 'timers.setTimeout', HOST.timersSetTimeout);
  timers.setInterval = recordingTimer(armed, 'timers.setInterval', HOST.timersSetInterval);
  timers.setImmediate = recordingImmediate(armed, 'timers.setImmediate',
    HOST.timersSetImmediate);
  asyncHooks.createHook = (...args) => {
    observation.asyncHookCreations += 1;
    return HOST.createHook(...args);
  };
  syncBuiltinESMExports();
  counter.enable();
  return () => {
    counter.disable();
    globalThis.setTimeout = HOST.setTimeout;
    globalThis.setInterval = HOST.setInterval;
    globalThis.setImmediate = HOST.setImmediate;
    timers.setTimeout = HOST.timersSetTimeout;
    timers.setInterval = HOST.timersSetInterval;
    timers.setImmediate = HOST.timersSetImmediate;
    asyncHooks.createHook = HOST.createHook;
    syncBuiltinESMExports();
  };
}

function mutationOf(mutation) {
  return {
    tableName: mutation.tableName,
    operation: mutation.operation,
    status: mutation.data?.status ?? mutation.row?.status ?? null,
    participantSetState: mutation.data?.participant_set_state ?? null,
    decision: mutation.data?.decision ?? null,
    rowCount: Array.isArray(mutation.rows) ? mutation.rows.length : null,
  };
}

// The fields of an answer a client reads to decide what happened.
function answerOf(result) {
  return {success: result?.success === true, operation: result?.operation ?? null,
    stage: result?.stage ?? null, errorCode: result?.errorCode ?? null};
}

function stepsOf(scenario) {
  const begin = (node) => node.engine.executeQuery('BEGIN', [], {sessionId: SESSION_ID});
  const insert = (node) => node.engine.executeQuery(INSERT, [...INSERT_PARAMS],
    {sessionId: SESSION_ID});
  const terminal = (sql) => (node, transactionId) => node.engine.executeQuery(sql, [],
    {sessionId: SESSION_ID, expectedTransactionId: transactionId});
  const terminals = {
    [PRODUCTION_SCENARIO.COMMIT_ONE_WRITE]: [terminal('COMMIT')],
    [PRODUCTION_SCENARIO.ROLLBACK_ONE_WRITE]: [terminal('ROLLBACK')],
    [PRODUCTION_SCENARIO.REFUSED_PREPARE]: [terminal('COMMIT')],
    [PRODUCTION_SCENARIO.ROLLBACK_FANOUT_FAILED_THEN_COMMIT]:
      [terminal('ROLLBACK'), terminal('COMMIT')],
  };
  return [begin, insert, ...terminals[scenario]];
}

/**
 * Run one scenario and record what production did.
 * @param {string} scenario - A PRODUCTION_SCENARIO.
 * @return {Promise<Object>} {observation, transactionId, engine, dispose}.
 */
async function observeProductionScenario(scenario) {
  const node = createProductionNode(scenario);
  const observation = {gatewayMutations: [], deliveries: node.deliveries, answers: [],
    armedHostPrimitives: [], promiseCreations: 0, asyncHookCreations: 0,
    metricsTags: node.metricsTags, decisionTrace: null};
  let transactionId = null;
  const runSteps = async () => {
    for (const step of stepsOf(scenario)) {
      const result = await step(node, transactionId);
      transactionId ??= result.transactionId;
      observation.answers.push(answerOf(result));
      if (Array.isArray(result.decisionTrace)) {
        observation.decisionTrace = result.decisionTrace.map(
          ({timestamp: _timestamp, ...entry}) => entry);
      }
    }
  };
  const root = new AsyncResource(SCENARIO_RESOURCE);
  const restore = installRecorders(observation, root);
  try {
    await root.runInAsyncScope(runSteps);
  } finally {
    restore();
    root.emitDestroy();
  }
  observation.gatewayMutations = node.gateway.mutations.map(mutationOf);
  return {
    observation,
    transactionId,
    engine: node.engine,
    async dispose() {
      await node.engine.shutdown();
      node.gateway.db.close();
    },
  };
}

export {PRODUCTION_SCENARIO, observeProductionScenario};
