import {types as utilTypes} from 'node:util';
import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
  APPLICATION_DATABASE_LIMIT,
} from './query/application-database-constants.js';
import {
  ApplicationDatabaseError,
  createApplicationDatabaseError,
} from
  './query/application-database-error.js';
import {
  snapshotEmbeddedEnvironment,
  snapshotEmbeddedFactoryConfiguration,
} from './embedded-lagrange-input.js';
import {reserveProcessRuntime} from './lagrange-runtime-process-claim.js';

const EMBEDDED_RUNTIME_STATE = Object.freeze({
  CREATED: 'created',
  FAILED: 'failed',
  STARTED: 'started',
  STARTING: 'starting',
  STOPPED: 'stopped',
  STOPPING: 'stopping',
});
const STARTUP_MODULE_SPECIFIER = './lagrange-runtime-startup.js';
const AbortControllerConstructor = AbortController;
const LOCAL_STR_START = 'start';
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const promiseThen = Promise.prototype.then;
const reflectApply = Reflect.apply;
const {isProxy} = utilTypes;

function normalizeStartupFailure(error) {
  if (!isProxy(error) && error instanceof ApplicationDatabaseError) {
    return error;
  }
  return createApplicationDatabaseError(
    APPLICATION_DATABASE_ERROR_CODE.RUNTIME_START_FAILED,
    APPLICATION_DATABASE_ERROR_MSG.RUNTIME_START_FAILED,
    {cause: error, operation: LOCAL_STR_START},
  );
}

function createStopTimeout() {
  return createApplicationDatabaseError(
    APPLICATION_DATABASE_ERROR_CODE.RUNTIME_STOP_TIMEOUT,
    APPLICATION_DATABASE_ERROR_MSG.RUNTIME_STOP_TIMEOUT,
  );
}

function createEmbeddedLagrangeHandle(options) {
  const {
    configurationSnapshot,
    environmentSnapshot,
    startRuntime,
    stopTimeoutMs = APPLICATION_DATABASE_LIMIT.STOP_TIMEOUT_MS,
  } = options;
  const cliArgs = objectFreeze(objectCreate(null));
  let state = EMBEDDED_RUNTIME_STATE.CREATED;
  let runtime = null;
  let startPromise = null;
  let stopPromise = null;
  let stopRequested = false;
  let startupAbortController = null;
  let processClaim = null;

  const handle = objectFreeze({openApplicationDatabase, start, stop});

  async function start() {
    if (state === EMBEDDED_RUNTIME_STATE.STARTED) return handle;
    if (state === EMBEDDED_RUNTIME_STATE.STARTING) return startPromise;
    if (state !== EMBEDDED_RUNTIME_STATE.CREATED) {
      throw createApplicationDatabaseError(
        APPLICATION_DATABASE_ERROR_CODE.RUNTIME_STOPPED,
        APPLICATION_DATABASE_ERROR_MSG.RUNTIME_STOPPED,
      );
    }
    processClaim = reserveProcessRuntime();
    if (!processClaim) {
      state = EMBEDDED_RUNTIME_STATE.FAILED;
      throw createApplicationDatabaseError(
        APPLICATION_DATABASE_ERROR_CODE.RUNTIME_ACTIVE,
        APPLICATION_DATABASE_ERROR_MSG.RUNTIME_ACTIVE,
      );
    }
    state = EMBEDDED_RUNTIME_STATE.STARTING;
    startupAbortController = new AbortControllerConstructor();
    startPromise = (async () => {
      try {
        runtime = await startRuntime({
          cliArgs,
          configuration: configurationSnapshot,
          environment: environmentSnapshot,
          processClaim,
          signal: startupAbortController.signal,
        });
        state = EMBEDDED_RUNTIME_STATE.STARTED;
        if (stopRequested) {
          await stop();
          throw createApplicationDatabaseError(
            APPLICATION_DATABASE_ERROR_CODE.RUNTIME_STOPPED,
            APPLICATION_DATABASE_ERROR_MSG.RUNTIME_STOPPED,
          );
        }
        return handle;
      } catch (error) {
        if (stopRequested) {
          state = EMBEDDED_RUNTIME_STATE.STOPPED;
        } else if (state !== EMBEDDED_RUNTIME_STATE.STOPPED) {
          state = EMBEDDED_RUNTIME_STATE.FAILED;
        }
        throw normalizeStartupFailure(error);
      }
    })();
    return startPromise;
  }

  async function stop() {
    if (state === EMBEDDED_RUNTIME_STATE.STOPPED) return;
    if (state === EMBEDDED_RUNTIME_STATE.STOPPING) return stopPromise;
    if (state === EMBEDDED_RUNTIME_STATE.CREATED) {
      state = EMBEDDED_RUNTIME_STATE.STOPPED;
      return;
    }
    if (state === EMBEDDED_RUNTIME_STATE.STARTING) {
      stopRequested = true;
      startupAbortController.abort(createApplicationDatabaseError(
        APPLICATION_DATABASE_ERROR_CODE.RUNTIME_STOPPED,
        APPLICATION_DATABASE_ERROR_MSG.RUNTIME_STOPPED,
      ));
      return reflectApply(promiseThen, startPromise, [
        undefined,
        () => undefined,
      ]);
    }
    if (state === EMBEDDED_RUNTIME_STATE.FAILED) return;

    state = EMBEDDED_RUNTIME_STATE.STOPPING;
    const cleanup = reflectApply(promiseThen, runtime.shutdownRuntime(), [
      (value) => {
        state = EMBEDDED_RUNTIME_STATE.STOPPED;
        return value;
      },
      (error) => {
        state = EMBEDDED_RUNTIME_STATE.STOPPED;
        throw error;
      },
    ]);
    stopPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(createStopTimeout()),
        stopTimeoutMs,
      );
      reflectApply(promiseThen, cleanup, [
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      ]);
    });
    return stopPromise;
  }

  function openApplicationDatabase(options) {
    if (state !== EMBEDDED_RUNTIME_STATE.STARTED) {
      const code = state === EMBEDDED_RUNTIME_STATE.CREATED ||
        state === EMBEDDED_RUNTIME_STATE.STARTING ?
        APPLICATION_DATABASE_ERROR_CODE.RUNTIME_NOT_STARTED :
        APPLICATION_DATABASE_ERROR_CODE.RUNTIME_STOPPED;
      throw createApplicationDatabaseError(
        code,
        APPLICATION_DATABASE_ERROR_MSG[code],
      );
    }
    return runtime.openApplicationDatabase(options);
  }

  return handle;
}

function createEmbeddedLagrange(options = {}) {
  return createEmbeddedLagrangeHandle({
    configurationSnapshot: snapshotEmbeddedFactoryConfiguration(options),
    environmentSnapshot: snapshotEmbeddedEnvironment(),
    async startRuntime(options) {
      const {startLagrangeRuntime} =
        await import(STARTUP_MODULE_SPECIFIER);
      return startLagrangeRuntime(options);
    },
  });
}

export {createEmbeddedLagrange, createEmbeddedLagrangeHandle};
