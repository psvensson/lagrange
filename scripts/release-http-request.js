const RETRYABLE_TOO_MANY_REQUESTS_STATUS = 429;
const RETRYABLE_SERVER_ERROR_MIN_STATUS = 500;
const RELEASE_HTTP_REQUEST_ERROR_NAME = 'ReleaseHttpRequestError';
const fetchRequest = globalThis.fetch.bind(globalThis);
const abortAfter = globalThis.AbortSignal.timeout.bind(globalThis.AbortSignal);
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor.bind(Object);
const responsePrototype = globalThis.Response.prototype;
const responseText = Function.call.bind(responsePrototype.text);
const responseOk = Function.call.bind(
  getOwnPropertyDescriptor(responsePrototype, 'ok').get,
);
const responseStatus = Function.call.bind(
  getOwnPropertyDescriptor(responsePrototype, 'status').get,
);

class ReleaseHttpRequestError extends Error {
  constructor(message, cause = undefined) {
    super(message, {cause});
    this.name = RELEASE_HTTP_REQUEST_ERROR_NAME;
  }
}

function nativeResponseState(response) {
  return {
    ok: responseOk(response),
    status: responseStatus(response),
  };
}

function nativeResponseText(response) {
  return responseText(response);
}

function isRetryableResponseStatus(status) {
  return status === RETRYABLE_TOO_MANY_REQUESTS_STATUS ||
    status >= RETRYABLE_SERVER_ERROR_MIN_STATUS;
}

async function requestReleaseHttpAttempt(context, attemptOrdinal) {
  let response;
  try {
    response = await context.fetchImpl(context.url, {
      ...context.requestOptions,
      signal: abortAfter(context.requestTimeoutMs),
    });
  } catch (error) {
    if (attemptOrdinal + 1 >= context.requestAttempts) {
      throw new ReleaseHttpRequestError(context.failureMessage, error);
    }
    await context.sleep(context.retryDelayMs);
    return requestReleaseHttpAttempt(context, attemptOrdinal + 1);
  }
  const {status} = nativeResponseState(response);
  if (!isRetryableResponseStatus(status) ||
      attemptOrdinal + 1 >= context.requestAttempts) {
    return response;
  }
  await context.sleep(context.retryDelayMs);
  return requestReleaseHttpAttempt(context, attemptOrdinal + 1);
}

function requestReleaseHttpResponse({
  fetchImpl = fetchRequest,
  url,
  requestOptions,
  requestAttempts,
  requestTimeoutMs,
  retryDelayMs,
  sleep,
  failureMessage,
}) {
  return requestReleaseHttpAttempt({
    failureMessage,
    fetchImpl,
    requestAttempts,
    requestOptions,
    requestTimeoutMs,
    retryDelayMs,
    sleep,
    url,
  }, 0);
}

export {
  ReleaseHttpRequestError,
  nativeResponseState,
  nativeResponseText,
  requestReleaseHttpResponse,
};
