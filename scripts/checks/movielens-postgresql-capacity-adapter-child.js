#!/usr/bin/env node

import {createInterface} from 'node:readline';
import {
  openPostgresBaselineSession,
} from '../../examples/service-data-affinity/postgres-baseline-session.js';
import {
  createCapacityAdapterOutbound,
} from './capacity-adapter-outbound.js';

let session = null;
const lines = createInterface({input: process.stdin});
const inFlightExecutions = new Set();
let terminationPromise = null;
const send = createCapacityAdapterOutbound();
const DRAIN_TIMEOUT_MS = 30_000;
const arrayFrom = Array.from;
const jsonParse = JSON.parse;
const promiseAllSettled = Promise.allSettled.bind(Promise);
const promiseRace = Promise.race.bind(Promise);
const localText = Object.freeze({
  CLOSE: 'close',
  DRAIN_FAILED: 'PostgreSQL adapter child execution drain failed',
  ERROR: 'error',
  ERROR_NAME: 'Error',
  EXECUTE: 'execute',
  LINE: 'line',
  OBSERVE_NETWORK: 'observe_network',
  RESET: 'reset',
  RESULT: 'result',
  SESSION_ALREADY_STARTED: 'adapter session already started',
  SESSION_NOT_STARTED: 'adapter session is not started',
  START: 'start',
  TERMINATION_RESULT: 'termination_result',
  TERMINATION_SIGNAL: 'SIGTERM',
  UNKNOWN_FAILURE: 'unknown PostgreSQL adapter child failure',
  UNSUPPORTED_REQUEST: 'unsupported PostgreSQL adapter child request',
});

function failure(error) {
  return {
    name: typeof error?.name === 'string' ? error.name : localText.ERROR_NAME,
    message:
      typeof error?.message === 'string' ?
        error.message :
        localText.UNKNOWN_FAILURE,
    stack: typeof error?.stack === 'string' ? error.stack : null,
  };
}

function reportOutboundFailure(error) {
  process.stderr.write(
    `PostgreSQL adapter reply delivery failed: ${failure(error).message}\n`,
  );
  process.exitCode = 1;
}

async function drainExecutions() {
  const deadline = Object.freeze({kind: 'drain_deadline'});
  const deadlinePromise = new Promise((resolve) => {
    setTimeout(resolve, DRAIN_TIMEOUT_MS, deadline);
  });
  const executionSettlements =
    promiseAllSettled(arrayFrom(inFlightExecutions));
  const result = await promiseRace([
    executionSettlements,
    deadlinePromise,
  ]);
  if (result === deadline || inFlightExecutions.size !== 0) {
    throw new Error(localText.DRAIN_FAILED);
  }
}

async function handle(message) {
  if (message?.kind === localText.START) {
    if (session !== null) throw new Error(localText.SESSION_ALREADY_STARTED);
    session = await openPostgresBaselineSession(message.options);
    await send({
      requestId: message.requestId,
      kind: localText.RESULT,
      value: {
        imageId: session.imageId,
        imageInspection: session.imageInspection,
        inputDigest: session.inputDigest,
        inputSizeBytes: session.inputSizeBytes,
        totalRows: session.totalRows,
        postgresVersion: session.postgresVersion,
        postgresVersionSql: session.postgresVersionSql,
        querySql: session.querySql,
        queryPlan: session.queryPlan,
        replicationFactor: session.replicationFactor,
        replicationState: session.replicationState,
        networkId: session.networkId,
        networkName: session.networkName,
        containers: session.containers,
        primaryContainerId: session.primaryContainerId,
      },
    });
    return;
  }
  if (session === null) throw new Error(localText.SESSION_NOT_STARTED);
  if (message?.kind === localText.EXECUTE) {
    const execution = session.executeGroupedReduce(message.operation);
    inFlightExecutions.add(execution);
    const value = await execution.finally(() => {
      inFlightExecutions.delete(execution);
    });
    await send({
      requestId: message.requestId,
      kind: localText.RESULT,
      value,
    });
    return;
  }
  if (message?.kind === localText.OBSERVE_NETWORK) {
    await send({
      requestId: message.requestId,
      kind: localText.RESULT,
      value: session.observeNetworkCounters(),
    });
    return;
  }
  if (message?.kind === localText.RESET) {
    await drainExecutions();
    const value = await session.resetRunState();
    await send({
      requestId: message.requestId,
      kind: localText.RESULT,
      value,
    });
    return;
  }
  if (message?.kind === localText.CLOSE) {
    await drainExecutions();
    const value = await session.close();
    session = null;
    await send({
      requestId: message.requestId,
      kind: localText.RESULT,
      value,
    });
    lines.close();
    process.stdin.destroy();
    setImmediate(() => process.exit(0));
    return;
  }
  throw new TypeError(localText.UNSUPPORTED_REQUEST);
}

lines.on(localText.LINE, (line) => {
  let message;
  try {
    message = jsonParse(line);
  } catch (error) {
    void send({
      requestId: null,
      kind: localText.ERROR,
      error: failure(error),
    }).catch(reportOutboundFailure);
    return;
  }
  handle(message).catch((error) => {
    return send({
      requestId: message?.requestId || null,
      kind: localText.ERROR,
      error: failure(error),
    });
  }).catch(reportOutboundFailure);
});

function terminate() {
  if (terminationPromise !== null) return terminationPromise;
  terminationPromise = (async () => {
    try {
      const value =
        session === null ? null : await session.forceClose();
      session = null;
      await send({
        kind: localText.TERMINATION_RESULT,
        value,
      });
      process.exitCode = 0;
    } catch (error) {
      await send({
        kind: localText.TERMINATION_RESULT,
        error: failure(error),
      });
      process.exitCode = 1;
    } finally {
      lines.close();
      process.stdin.destroy();
      setImmediate(() => process.exit());
    }
  })();
  return terminationPromise;
}

process.on(localText.TERMINATION_SIGNAL, () => {
  void terminate();
});
