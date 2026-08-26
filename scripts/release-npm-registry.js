import {
  nativeResponseState,
  nativeResponseText,
  requestReleaseHttpResponse,
} from './release-http-request.js';

const REGISTRY_REQUEST_ATTEMPTS = 3;
const REGISTRY_REQUEST_DELAY_MS = 2000;
const REGISTRY_REQUEST_TIMEOUT_MS = 10000;
const CACHE_NO_STORE = 'no-store';
const CACHE_NO_CACHE = 'no-cache';
const CONTENT_TYPE_JSON = 'application/json';
const NOT_FOUND = 404;
const REGISTRY_UNAVAILABLE = 'REGISTRY_UNAVAILABLE';
const NPM_REGISTRY_ERROR_NAME = 'NpmRegistryReadError';
const INVALID_RESPONSE_MESSAGE = 'npm registry returned an invalid response';
const INVALID_JSON_MESSAGE = 'npm registry returned invalid JSON';
const REQUEST_FAILED_MESSAGE = 'npm registry request failed';
const fetchRequest = globalThis.fetch.bind(globalThis);
const scheduleTimeout = globalThis.setTimeout.bind(globalThis);
const jsonParse = JSON.parse.bind(JSON);
const URLConstructor = globalThis.URL;
const encodeUrlComponent = globalThis.encodeURIComponent;

class NpmRegistryReadError extends Error {
  constructor(message, cause = undefined) {
    super(message, {cause});
    this.code = REGISTRY_UNAVAILABLE;
    this.name = NPM_REGISTRY_ERROR_NAME;
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => scheduleTimeout(resolveDelay, milliseconds));
}

async function fetchRegistryResponse({
  attempts,
  fetchImpl,
  packageUrl,
  sleep,
  timeoutMs,
}) {
  try {
    return await requestReleaseHttpResponse({
      failureMessage: REQUEST_FAILED_MESSAGE,
      fetchImpl,
      requestAttempts: attempts,
      requestOptions: {
        cache: CACHE_NO_STORE,
        headers: {
          'accept': CONTENT_TYPE_JSON,
          'cache-control': CACHE_NO_CACHE,
        },
      },
      requestTimeoutMs: timeoutMs,
      retryDelayMs: REGISTRY_REQUEST_DELAY_MS,
      sleep,
      url: packageUrl,
    });
  } catch (error) {
    throw new NpmRegistryReadError(
      `${REQUEST_FAILED_MESSAGE} after ${attempts} attempts`,
      error,
    );
  }
}

async function readNpmRegistryMetadata(
  packageName,
  registryUrl,
  options = {},
) {
  const packageUrl = new URLConstructor(
    encodeUrlComponent(packageName),
    registryUrl,
  );
  const fetchImpl = options.fetchImpl || fetchRequest;
  const sleep = options.sleep || delay;
  const attempts = options.requestAttempts || REGISTRY_REQUEST_ATTEMPTS;
  const timeoutMs = options.requestTimeoutMs || REGISTRY_REQUEST_TIMEOUT_MS;
  const response = await fetchRegistryResponse({
    attempts,
    fetchImpl,
    packageUrl,
    sleep,
    timeoutMs,
  });
  let responseState;
  try {
    responseState = nativeResponseState(response);
  } catch (error) {
    throw new NpmRegistryReadError(INVALID_RESPONSE_MESSAGE, error);
  }
  const {ok, status} = responseState;
  if (status === NOT_FOUND) {
    return null;
  }
  if (ok !== true) {
    throw new NpmRegistryReadError(`npm registry returned HTTP ${status}`);
  }
  try {
    return jsonParse(await nativeResponseText(response));
  } catch (error) {
    throw new NpmRegistryReadError(INVALID_JSON_MESSAGE, error);
  }
}

export {
  NpmRegistryReadError,
  readNpmRegistryMetadata,
};
