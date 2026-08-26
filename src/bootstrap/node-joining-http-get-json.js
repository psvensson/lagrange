import {
  JOINING_ERROR_MSG,
  JOINING_HTTP,
} from './node-joining-constants.js';
import {HTTP_STATUS} from '../constants/index.js';

const AbortControllerConstructor = globalThis.AbortController;
const ErrorConstructor = Error;
const ResponseConstructor = globalThis.Response;
const clearTimeoutFunction = globalThis.clearTimeout;
const defaultFetch = globalThis.fetch;
const jsonStringify = JSON.stringify;
const mathFloor = Math.floor;
const numberIsFinite = Number.isFinite;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectPrototypeIsPrototypeOf = Function.call.bind(
  Object.prototype.isPrototypeOf,
);
const reflectApply = Reflect.apply;
const setTimeoutFunction = globalThis.setTimeout;
const OWN_DATA_VALUE_FIELD = 'value';
const RESPONSE_JSON_FIELD = 'json';
const JSON_READER_UNAVAILABLE_ERROR =
  'HTTP response JSON reader unavailable';

const abortControllerAbort = AbortControllerConstructor.prototype.abort;
const abortControllerSignalGetter = objectGetOwnPropertyDescriptor(
  AbortControllerConstructor.prototype,
  'signal',
)?.get;
const responsePrototype = ResponseConstructor?.prototype || null;
const responseJson = responsePrototype?.json || null;
const responseOkGetter = responsePrototype ?
  objectGetOwnPropertyDescriptor(responsePrototype, 'ok')?.get : null;
const responseStatusGetter = responsePrototype ?
  objectGetOwnPropertyDescriptor(responsePrototype, 'status')?.get : null;

function readOwnData(target, field) {
  if (!target || typeof target !== 'object') return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value : undefined;
}

function isNativeResponse(response) {
  return responsePrototype !== null &&
    objectPrototypeIsPrototypeOf(responsePrototype, response);
}

function readResponseField(response, field, nativeGetter) {
  if (isNativeResponse(response) && typeof nativeGetter === 'function') {
    return reflectApply(nativeGetter, response, []);
  }
  return readOwnData(response, field);
}

async function readResponseJson(response) {
  const json = isNativeResponse(response) ?
    responseJson : readOwnData(response, RESPONSE_JSON_FIELD);
  if (typeof json !== 'function') {
    throw new ErrorConstructor(JSON_READER_UNAVAILABLE_ERROR);
  }
  return reflectApply(json, response, []);
}

function resolveTimeoutMs(value, fallback) {
  if (numberIsFinite(value) && value > 0) return mathFloor(value);
  return numberIsFinite(fallback) && fallback > 0 ? mathFloor(fallback) : 1;
}

function resolveFetch(fetchOverride) {
  return typeof fetchOverride === 'function' ? fetchOverride : defaultFetch;
}

async function nodeJoiningHttpGetJson(url, options = {}) {
  const timeoutMs = resolveTimeoutMs(
    readOwnData(options, 'timeoutMs'),
    readOwnData(options, 'fallbackTimeoutMs'),
  );
  const fetchFunction = resolveFetch(readOwnData(options, 'fetchFunction'));
  const controller = new AbortControllerConstructor();
  const signal = reflectApply(abortControllerSignalGetter, controller, []);
  let timedOut = false;
  const timeoutId = setTimeoutFunction(() => {
    timedOut = true;
    reflectApply(abortControllerAbort, controller, []);
  }, timeoutMs);
  try {
    const response = await reflectApply(fetchFunction, undefined, [url, {
      method: JOINING_HTTP.METHOD_GET,
      headers: {
        [JOINING_HTTP.HEADER_CONNECTION]: JOINING_HTTP.CONNECTION_CLOSE,
      },
      signal,
    }]);
    const responseBody = await readResponseJson(response);
    const ok = readResponseField(response, 'ok', responseOkGetter);
    const status = readResponseField(
      response,
      'status',
      responseStatusGetter,
    );
    if (ok === true || status === HTTP_STATUS.SERVICE_UNAVAILABLE) {
      return {statusCode: status, body: responseBody};
    }
    throw new ErrorConstructor(
      JOINING_ERROR_MSG.httpStatus(status, jsonStringify(responseBody)),
    );
  } catch (error) {
    if (!timedOut) throw error;
    const timeoutError = new ErrorConstructor(
      JOINING_ERROR_MSG.httpTimeout(timeoutMs),
    );
    timeoutError.deferRetry = true;
    throw timeoutError;
  } finally {
    clearTimeoutFunction(timeoutId);
  }
}

export {nodeJoiningHttpGetJson};
