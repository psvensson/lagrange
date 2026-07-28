#!/usr/bin/env node

import {
  openMovielensPublicRequestWorkloadLive,
} from '../../examples/service-data-affinity/run-movielens-public-request-workload.js';
import {createInterface} from 'node:readline';
import {
  createCapacityAdapterOutbound,
} from './capacity-adapter-outbound.js';

let session = null;
let lineReader = null;
let terminationPromise = null;
let publicHttpPayloadRxBytes = 0;
let publicHttpPayloadTxBytes = 0;
const send = createCapacityAdapterOutbound();
const inFlightExecutions = new Set();
const DRAIN_TIMEOUT_MS = 30_000;
const arrayFrom = Array.from;
const bufferByteLength = Buffer.byteLength;
const jsonParse = JSON.parse;
const numberIsSafeInteger = Number.isSafeInteger;
const promiseAllSettled = Promise.allSettled.bind(Promise);
const promiseRace = Promise.race.bind(Promise);
const localText = Object.freeze({
  CLOSE: 'close',
  DISCONNECT: 'disconnect',
  DRAIN_FAILED: 'Lagrange adapter child execution drain failed',
  ERROR: 'error',
  ERROR_NAME: 'Error',
  EXECUTE: 'execute',
  LINE: 'line',
  MESSAGE: 'message',
  NETWORK_AUTHORITY: 'lagrange_public_http_payload_bytes',
  NETWORK_OBSERVATION_INVALID:
    'Lagrange public HTTP payload observation is invalid',
  OBSERVE_NETWORK: 'observe_network',
  RESET: 'reset',
  RESULT: 'result',
  SESSION_ALREADY_STARTED: 'adapter session already started',
  SESSION_NOT_STARTED: 'adapter session is not started',
  START: 'start',
  TERMINATION_RESULT: 'termination_result',
  TERMINATION_SIGNAL: 'SIGTERM',
  UNKNOWN_FAILURE: 'unknown child adapter failure',
  UNSUPPORTED_REQUEST: 'unsupported MovieLens adapter child request',
});

function failure(error) {
  return {
    name: typeof error?.name === 'string' ? error.name : localText.ERROR_NAME,
    message:
      typeof error?.message === 'string' ?
        error.message :
        localText.UNKNOWN_FAILURE,
    stack:
      typeof error?.stack === 'string' ? error.stack : null,
  };
}

function reportOutboundFailure(error) {
  process.stderr.write(
    `Lagrange adapter reply delivery failed: ${failure(error).message}\n`,
  );
  process.exitCode = 1;
}

function recordPublicHttpPayloadBytes(value) {
  const requestBody = value?.response?.requestWitness?.body;
  const responseBody = value?.response?.body;
  if (
    typeof requestBody !== 'string' ||
    typeof responseBody !== 'string'
  ) {
    throw new TypeError(localText.NETWORK_OBSERVATION_INVALID);
  }
  const nextTxBytes =
    publicHttpPayloadTxBytes + bufferByteLength(requestBody);
  const nextRxBytes =
    publicHttpPayloadRxBytes + bufferByteLength(responseBody);
  if (
    !numberIsSafeInteger(nextTxBytes) ||
    !numberIsSafeInteger(nextRxBytes)
  ) {
    throw new TypeError(localText.NETWORK_OBSERVATION_INVALID);
  }
  publicHttpPayloadTxBytes = nextTxBytes;
  publicHttpPayloadRxBytes = nextRxBytes;
}

async function drainExecutions() {
  const timeout = Object.freeze({kind: 'timeout'});
  const result = await promiseRace([
    promiseAllSettled(arrayFrom(inFlightExecutions)),
    new Promise((resolve) => {
      setTimeout(() => resolve(timeout), DRAIN_TIMEOUT_MS);
    }),
  ]);
  if (result === timeout) {
    throw new Error(localText.DRAIN_FAILED);
  }
  if (inFlightExecutions.size !== 0) {
    throw new Error(localText.DRAIN_FAILED);
  }
}

async function handle(message) {
  if (message?.kind === localText.START) {
    if (session !== null) throw new Error(localText.SESSION_ALREADY_STARTED);
    session = await openMovielensPublicRequestWorkloadLive(message.options);
    await send({
      requestId: message.requestId,
      kind: localText.RESULT,
      value: {
        alternative: session.alternative,
        artifact: session.artifact,
        dataset: session.dataset,
        deployment: session.prepared.deployment,
        runtimeObservation: session.runtimeObservation,
      },
    });
    return;
  }
  if (session === null) throw new Error(localText.SESSION_NOT_STARTED);
  if (message?.kind === localText.EXECUTE) {
    const execution =
      session.prepared.executeCapacityOperation(message.operation);
    inFlightExecutions.add(execution);
    const value = await execution.finally(() => {
      inFlightExecutions.delete(execution);
    });
    recordPublicHttpPayloadBytes(value);
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
      value: {
        authority: localText.NETWORK_AUTHORITY,
        rxBytes: publicHttpPayloadRxBytes,
        txBytes: publicHttpPayloadTxBytes,
      },
    });
    return;
  }
  if (message?.kind === localText.RESET) {
    await drainExecutions();
    const value = await session.prepared.resetRunState();
    await send({
      requestId: message.requestId,
      kind: localText.RESULT,
      value,
    });
    return;
  }
  if (message?.kind === localText.CLOSE) {
    await drainExecutions();
    await session.prepared.drainOperations();
    const value = await session.close();
    session = null;
    await send({
      requestId: message.requestId,
      kind: localText.RESULT,
      value,
    });
    if (typeof process.disconnect === 'function') {
      process.disconnect();
    } else {
      lineReader?.close();
      process.stdin.destroy();
      setImmediate(() => process.exit(0));
    }
    return;
  }
  throw new TypeError(localText.UNSUPPORTED_REQUEST);
}

function dispatch(message) {
  handle(message).catch((error) => {
    return send({
      requestId: message?.requestId || null,
      kind: localText.ERROR,
      error: failure(error),
    });
  }).catch(reportOutboundFailure);
}

if (typeof process.send === 'function') {
  process.on(localText.MESSAGE, dispatch);
} else {
  lineReader = createInterface({input: process.stdin});
  lineReader.on(localText.LINE, (line) => {
    try {
      dispatch(jsonParse(line));
    } catch (error) {
      void send({
        requestId: null,
        kind: localText.ERROR,
        error: failure(error),
      }).catch(reportOutboundFailure);
    }
  });
}

process.on(localText.DISCONNECT, () => {
  if (session !== null) {
    session.close()
      .catch((error) => {
        process.stderr.write(
          `Lagrange adapter disconnect cleanup failed: ${failure(error).message}\n`,
        );
      })
      .finally(() => {
        process.exitCode = 1;
      });
  }
});

function terminate() {
  if (terminationPromise !== null) return terminationPromise;
  terminationPromise = (async () => {
    try {
      const value = session === null ? null : await session.close();
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
      lineReader?.close();
      process.stdin.destroy();
      setImmediate(() => process.exit());
    }
  })();
  return terminationPromise;
}

process.on(localText.TERMINATION_SIGNAL, () => {
  void terminate();
});
