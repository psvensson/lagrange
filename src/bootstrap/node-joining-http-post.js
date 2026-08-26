import {
  JOINING_ERROR_MSG,
  JOINING_HTTP,
} from './node-joining-constants.js';

const AbortControllerConstructor = globalThis.AbortController;
const ErrorConstructor = Error;
const HeadersConstructor = globalThis.Headers;
const ResponseConstructor = globalThis.Response;
const clearTimeoutFunction = globalThis.clearTimeout;
const defaultFetch = globalThis.fetch;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const mathFloor = Math.floor;
const mathMax = Math.max;
const numberIsFinite = Number.isFinite;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectPrototypeIsPrototypeOf = Function.call.bind(
  Object.prototype.isPrototypeOf,
);
const reflectApply = Reflect.apply;
const setTimeoutFunction = globalThis.setTimeout;
const OWN_DATA_VALUE_FIELD = 'value';
const RESPONSE_JSON_METHOD = 'json';

const abortControllerAbort = AbortControllerConstructor.prototype.abort;
const abortControllerSignalGetter = objectGetOwnPropertyDescriptor(
  AbortControllerConstructor.prototype,
  'signal',
)?.get;
const headersPrototype = HeadersConstructor?.prototype || null;
const headersGet = headersPrototype?.get || null;
const responsePrototype = ResponseConstructor?.prototype || null;
const responseJson = responsePrototype?.json || null;
const responseText = responsePrototype?.text || null;
const responseHeadersGetter = responsePrototype ?
  objectGetOwnPropertyDescriptor(responsePrototype, 'headers')?.get : null;
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

function isPrototypeInstance(prototype, value) {
  return prototype !== null &&
    objectPrototypeIsPrototypeOf(prototype, value);
}

function readResponseField(response, field, nativeGetter) {
  if (
    isPrototypeInstance(responsePrototype, response) &&
    typeof nativeGetter === 'function'
  ) {
    return reflectApply(nativeGetter, response, []);
  }
  return readOwnData(response, field);
}

async function readResponseBody(response, methodName, nativeMethod) {
  const method = isPrototypeInstance(responsePrototype, response) ?
    nativeMethod : readOwnData(response, methodName);
  if (typeof method !== 'function') {
    throw new ErrorConstructor(`HTTP response ${methodName} reader unavailable`);
  }
  return reflectApply(method, response, []);
}

function readHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const get = isPrototypeInstance(headersPrototype, headers) ?
    headersGet : readOwnData(headers, 'get');
  return typeof get === 'function' ? reflectApply(get, headers, [name]) : null;
}

function resolveTimeoutMs(value, fallback) {
  if (numberIsFinite(value) && value > 0) return mathFloor(value);
  return numberIsFinite(fallback) && fallback > 0 ? mathFloor(fallback) : 1;
}

function resolveRetryAfterMs(parsedBody, retryAfterHeader, parser) {
  const hintMs = typeof parser === 'function' ?
    reflectApply(parser, undefined, [retryAfterHeader]) : null;
  const bodyMs = readOwnData(parsedBody, 'retryAfterMs');
  const normalizedBodyMs = numberIsFinite(bodyMs) ? mathFloor(bodyMs) : null;
  if (numberIsFinite(hintMs) && numberIsFinite(normalizedBodyMs)) {
    return mathMax(hintMs, normalizedBodyMs);
  }
  return numberIsFinite(hintMs) ? hintMs : normalizedBodyMs;
}

async function nodeJoiningHttpPost(url, body, options = {}) {
  const timeoutMs = resolveTimeoutMs(
    readOwnData(options, 'timeoutMs'),
    readOwnData(options, 'fallbackTimeoutMs'),
  );
  const fetchOverride = readOwnData(options, 'fetchFunction');
  const fetchFunction = typeof fetchOverride === 'function' ?
    fetchOverride : defaultFetch;
  const retryAfterParser = readOwnData(options, 'parseRetryAfterHeaderMs');
  const controller = new AbortControllerConstructor();
  const signal = reflectApply(abortControllerSignalGetter, controller, []);
  let timedOut = false;
  const timeoutId = setTimeoutFunction(() => {
    timedOut = true;
    reflectApply(abortControllerAbort, controller, []);
  }, timeoutMs);
  try {
    const response = await reflectApply(fetchFunction, undefined, [url, {
      method: JOINING_HTTP.METHOD_POST,
      headers: {
        [JOINING_HTTP.HEADER_CONTENT_TYPE]: JOINING_HTTP.CONTENT_TYPE_JSON,
        [JOINING_HTTP.HEADER_CONNECTION]: JOINING_HTTP.CONNECTION_CLOSE,
      },
      body: jsonStringify(body),
      signal,
    }]);
    const ok = readResponseField(response, 'ok', responseOkGetter);
    const status = readResponseField(response, 'status', responseStatusGetter);
    if (ok === true) {
      return await readResponseBody(
        response,
        RESPONSE_JSON_METHOD,
        responseJson,
      );
    }
    const headers = readResponseField(
      response,
      'headers',
      responseHeadersGetter,
    );
    const retryAfterHeader = readHeader(
      headers,
      JOINING_HTTP.HEADER_RETRY_AFTER,
    );
    const errorBody = await readResponseBody(response, 'text', responseText);
    let parsedBody = null;
    try {
      parsedBody = jsonParse(errorBody);
    } catch {
      parsedBody = null;
    }
    const error = new ErrorConstructor(
      JOINING_ERROR_MSG.httpStatus(status, errorBody),
    );
    error.statusCode = status;
    error.responseBody = errorBody;
    error.responseJson = parsedBody;
    const retryAfterMs = resolveRetryAfterMs(
      parsedBody,
      retryAfterHeader,
      retryAfterParser,
    );
    if (numberIsFinite(retryAfterMs)) error.retryAfterMs = retryAfterMs;
    throw error;
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

export {nodeJoiningHttpPost};
