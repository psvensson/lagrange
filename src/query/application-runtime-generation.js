import {
  APPLICATION_DATABASE_ERROR_CODE,
  APPLICATION_DATABASE_ERROR_MSG,
  APPLICATION_DATABASE_GENERATION_STATE,
} from './application-database-constants.js';
import {createApplicationDatabaseError} from './application-database-error.js';

const LOCAL_NUM_ZERO = 0;
const PromiseConstructor = Promise;
const objectFreeze = Object.freeze;
const promiseResolve = Promise.resolve;
const reflectApply = Reflect.apply;

function resolvedPromise() {
  return reflectApply(promiseResolve, PromiseConstructor, []);
}

function createApplicationRuntimeGeneration() {
  let state = APPLICATION_DATABASE_GENERATION_STATE.ACTIVE;
  let leaseCount = LOCAL_NUM_ZERO;
  let resolveDrain = null;
  let drainPromise = null;

  function acquire() {
    if (state !== APPLICATION_DATABASE_GENERATION_STATE.ACTIVE) {
      throw createApplicationDatabaseError(
        APPLICATION_DATABASE_ERROR_CODE.RUNTIME_STOPPED,
        APPLICATION_DATABASE_ERROR_MSG.RUNTIME_STOPPED,
      );
    }
    leaseCount++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      leaseCount--;
      if (
        leaseCount === LOCAL_NUM_ZERO &&
        state === APPLICATION_DATABASE_GENERATION_STATE.DRAINING
      ) {
        state = APPLICATION_DATABASE_GENERATION_STATE.CLOSED;
        resolveDrain?.();
        resolveDrain = null;
      }
    };
  }

  function closeAdmission() {
    if (state === APPLICATION_DATABASE_GENERATION_STATE.CLOSED) {
      return drainPromise || resolvedPromise();
    }
    if (state === APPLICATION_DATABASE_GENERATION_STATE.ACTIVE) {
      state = APPLICATION_DATABASE_GENERATION_STATE.DRAINING;
    }
    if (leaseCount === LOCAL_NUM_ZERO) {
      state = APPLICATION_DATABASE_GENERATION_STATE.CLOSED;
      drainPromise ||= resolvedPromise();
      return drainPromise;
    }
    drainPromise ||= new Promise((resolve) => {
      resolveDrain = resolve;
    });
    return drainPromise;
  }

  return objectFreeze({acquire, closeAdmission});
}

export {createApplicationRuntimeGeneration};
