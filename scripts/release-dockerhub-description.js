#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  nativeResponseState as nativeReleaseResponseState,
  nativeResponseText,
  requestReleaseHttpResponse,
} from './release-http-request.js';

const DOCKERHUB_API_ROOT = 'https://hub.docker.com/v2/';
const DESCRIPTION_MAX_BYTES = 25000;
const DEFAULT_OBSERVATION_ATTEMPTS = 5;
const DEFAULT_OBSERVATION_DELAY_MS = 2000;
const DEFAULT_REQUEST_ATTEMPTS = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const TEXT_ENCODING = 'utf8';
const CONTENT_TYPE_JSON = 'application/json';
const HASH_ALGORITHM_SHA256 = 'sha256';
const HASH_ENCODING_HEX = 'hex';
const DATA_DESCRIPTOR_VALUE = 'value';
const ERROR_NAME = 'DockerhubDescriptionError';
const ERROR_MESSAGE = Object.freeze({
  USERNAME_REQUIRED: 'Docker Hub username is required',
  TOKEN_REQUIRED: 'Docker Hub token is required',
  REPOSITORY_INVALID: 'Docker Hub repository must use the namespace/name form',
  DESCRIPTION_EMPTY: 'Docker Hub description is empty',
  TOKEN_MISSING: 'Docker Hub authentication returned no access token',
  TOKEN_SCOPE:
    'the token must have read/write/delete scope and repository Admin permission',
  READBACK_FIELD_MISSING:
    'Docker Hub description readback omitted full_description',
  READBACK_MISMATCH:
    'Docker Hub description readback did not match the rendered release overview: ',
  PREFLIGHT_CHANGED:
    'Docker Hub permission preflight readback changed unexpectedly',
});
const CLI_VALUE = Object.freeze({
  OPTION_PREFIX: '--',
  PREFLIGHT: 'preflight',
  PUBLISH: 'publish',
  README_FILE: 'readme-file',
  USAGE:
    'usage: release-dockerhub-description.js preflight --repository namespace/name ' +
    'or publish --repository namespace/name --readme-file FILE',
  FAILED: 'DOCKERHUB_DESCRIPTION_FAILED',
  PREFLIGHT_PASSED: 'DOCKERHUB_DESCRIPTION_PREFLIGHT_PASSED',
  PUBLISHED: 'DOCKERHUB_DESCRIPTION_PUBLISHED',
});
const REPOSITORY_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u;
const jsonParse = JSON.parse.bind(JSON);
const jsonStringify = JSON.stringify.bind(JSON);
const fetchRequest = globalThis.fetch.bind(globalThis);
const scheduleTimeout = globalThis.setTimeout.bind(globalThis);
const numberIsInteger = Number.isInteger.bind(Number);
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const repositoryPatternTest = RegExp.prototype.test.bind(REPOSITORY_PATTERN);
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor.bind(Object);
const hasOwnProperty = Function.call.bind(Object.prototype.hasOwnProperty);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const encodeUrlComponent = globalThis.encodeURIComponent;
const createNullObject = Object.create.bind(Object);

class DockerhubDescriptionError extends Error {
  constructor(message, cause = undefined) {
    super(message, {cause});
    this.name = ERROR_NAME;
  }
}

function sha256(value) {
  return createHash(HASH_ALGORITHM_SHA256).update(value).digest(HASH_ENCODING_HEX);
}

function readOwnData(value, key) {
  if ((typeof value !== 'object' || value === null) &&
    typeof value !== 'function') {
    return undefined;
  }
  const descriptor = getOwnPropertyDescriptor(value, key);
  if (!descriptor || !hasOwnProperty(descriptor, DATA_DESCRIPTOR_VALUE)) {
    return undefined;
  }
  return descriptor.value;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => scheduleTimeout(resolveDelay, milliseconds));
}

function assertPublisherIdentity({username, password, repository}) {
  if (typeof username !== 'string' || username.length === 0) {
    throw new DockerhubDescriptionError(ERROR_MESSAGE.USERNAME_REQUIRED);
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw new DockerhubDescriptionError(ERROR_MESSAGE.TOKEN_REQUIRED);
  }
  if (typeof repository !== 'string' || !repositoryPatternTest(repository)) {
    throw new DockerhubDescriptionError(
      ERROR_MESSAGE.REPOSITORY_INVALID,
    );
  }
}

function assertDescription(description) {
  if (typeof description !== 'string' || description.length === 0) {
    throw new DockerhubDescriptionError(ERROR_MESSAGE.DESCRIPTION_EMPTY);
  }
  const byteLength = bufferByteLength(description, TEXT_ENCODING);
  if (byteLength > DESCRIPTION_MAX_BYTES) {
    throw new DockerhubDescriptionError(
      `Docker Hub description is ${byteLength} bytes; maximum is ${DESCRIPTION_MAX_BYTES}`,
    );
  }
}

function repositoryApiUrl(repository) {
  const separator = stringIndexOf(repository, '/');
  const namespace = stringSlice(repository, 0, separator);
  const name = stringSlice(repository, separator + 1);
  return `${DOCKERHUB_API_ROOT}namespaces/${encodeUrlComponent(namespace)}/` +
    `repositories/${encodeUrlComponent(name)}/`;
}

function nativeResponseState(response, operation) {
  try {
    return nativeReleaseResponseState(response);
  } catch (error) {
    throw new DockerhubDescriptionError(
      `Docker Hub ${operation} returned an invalid response`,
      error,
    );
  }
}

async function requestWithRetry({
  fetchImpl,
  operation,
  requestAttempts,
  requestTimeoutMs,
  sleep,
  url,
  requestOptions,
}) {
  try {
    return await requestReleaseHttpResponse({
      failureMessage: `Docker Hub ${operation} request failed`,
      fetchImpl,
      requestAttempts,
      requestOptions,
      requestTimeoutMs,
      retryDelayMs: DEFAULT_OBSERVATION_DELAY_MS,
      sleep,
      url,
    });
  } catch (error) {
    throw new DockerhubDescriptionError(
      `Docker Hub ${operation} failed after ${requestAttempts} attempts`,
      error,
    );
  }
}

async function responseJson(response, operation) {
  const state = nativeResponseState(response, operation);
  const status = numberIsInteger(state.status) ? state.status : 'unknown';
  if (state.ok !== true) {
    throw new DockerhubDescriptionError(
      `Docker Hub ${operation} returned HTTP ${status}`,
    );
  }
  const body = await nativeResponseText(response);
  try {
    return jsonParse(body);
  } catch (error) {
    throw new DockerhubDescriptionError(
      `Docker Hub ${operation} returned invalid JSON`,
      error,
    );
  }
}

async function acquireDockerhubToken(requestContext, {username, password}) {
  const response = await requestWithRetry({
    ...requestContext,
    operation: 'authentication',
    url: `${DOCKERHUB_API_ROOT}auth/token`,
    requestOptions: {
      method: 'POST',
      headers: {'content-type': CONTENT_TYPE_JSON},
      body: jsonStringify({identifier: username, secret: password}),
    },
  });
  const body = await responseJson(response, 'authentication');
  const accessToken = readOwnData(body, 'access_token');
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new DockerhubDescriptionError(
      ERROR_MESSAGE.TOKEN_MISSING,
    );
  }
  return accessToken;
}

async function patchDockerhubDescription(
  requestContext,
  {repositoryUrl, description, token},
) {
  const response = await requestWithRetry({
    ...requestContext,
    operation: 'description update',
    url: repositoryUrl,
    requestOptions: {
      method: 'PATCH',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': CONTENT_TYPE_JSON,
      },
      body: jsonStringify({full_description: description}),
    },
  });
  const state = nativeResponseState(response, 'description update');
  const status = numberIsInteger(state.status) ? state.status : 'unknown';
  if (state.ok !== true) {
    throw new DockerhubDescriptionError(
      `Docker Hub description update returned HTTP ${status}; ` +
      ERROR_MESSAGE.TOKEN_SCOPE,
    );
  }
}

async function readDockerhubDescription(requestContext, repositoryUrl) {
  const response = await requestWithRetry({
    ...requestContext,
    operation: 'description readback',
    url: repositoryUrl,
    requestOptions: {headers: {'cache-control': 'no-cache'}},
  });
  const body = await responseJson(response, 'description readback');
  const fullDescription = readOwnData(body, 'full_description');
  if (typeof fullDescription !== 'string') {
    throw new DockerhubDescriptionError(
      ERROR_MESSAGE.READBACK_FIELD_MISSING,
    );
  }
  return fullDescription;
}

async function observeDockerhubDescription({
  description,
  observationAttempts,
  observationDelayMs,
  repositoryUrl,
  requestContext,
}) {
  let observedDescription = null;
  for (let attempt = 0; attempt < observationAttempts; attempt += 1) {
    observedDescription = await readDockerhubDescription(
      requestContext,
      repositoryUrl,
    );
    if (observedDescription === description) {
      return;
    }
    if (attempt < observationAttempts - 1) {
      await requestContext.sleep(observationDelayMs);
    }
  }
  throw new DockerhubDescriptionError(
    ERROR_MESSAGE.READBACK_MISMATCH +
    `expected sha256:${sha256(description)}, observed sha256:${sha256(observedDescription || '')}`,
  );
}

async function publishDockerhubDescription({
  username,
  password,
  repository,
  description,
  fetchImpl = fetchRequest,
  sleep = delay,
  observationAttempts = DEFAULT_OBSERVATION_ATTEMPTS,
  observationDelayMs = DEFAULT_OBSERVATION_DELAY_MS,
  requestAttempts = DEFAULT_REQUEST_ATTEMPTS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  assertPublisherIdentity({username, password, repository});
  assertDescription(description);
  const repositoryUrl = repositoryApiUrl(repository);
  const requestContext = {
    fetchImpl,
    requestAttempts,
    requestTimeoutMs,
    sleep,
  };
  const token = await acquireDockerhubToken(requestContext, {username, password});
  await patchDockerhubDescription(
    requestContext,
    {repositoryUrl, description, token},
  );
  await observeDockerhubDescription({
    description,
    observationAttempts,
    observationDelayMs,
    repositoryUrl,
    requestContext,
  });
  return {
    bytes: bufferByteLength(description, TEXT_ENCODING),
    repository,
    sha256: sha256(description),
  };
}

async function preflightDockerhubDescription(options) {
  const {
    username,
    password,
    repository,
    fetchImpl = fetchRequest,
    sleep = delay,
    requestAttempts = DEFAULT_REQUEST_ATTEMPTS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = options;
  assertPublisherIdentity({username, password, repository});
  const repositoryUrl = repositoryApiUrl(repository);
  const requestContext = {
    fetchImpl,
    requestAttempts,
    requestTimeoutMs,
    sleep,
  };
  const token = await acquireDockerhubToken(requestContext, {username, password});
  const currentDescription = await readDockerhubDescription(
    requestContext,
    repositoryUrl,
  );
  await patchDockerhubDescription(
    requestContext,
    {repositoryUrl, description: currentDescription, token},
  );
  const confirmedDescription = await readDockerhubDescription(
    requestContext,
    repositoryUrl,
  );
  if (confirmedDescription !== currentDescription) {
    throw new DockerhubDescriptionError(
      ERROR_MESSAGE.PREFLIGHT_CHANGED,
    );
  }
  return {
    repository,
    sha256: sha256(currentDescription),
  };
}

function parseArguments(argv, startIndex = 0) {
  const options = createNullObject(null);
  for (let index = startIndex; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (typeof key !== 'string' || !stringStartsWith(key, CLI_VALUE.OPTION_PREFIX) ||
      value === undefined) {
      throw new DockerhubDescriptionError(`invalid argument ${key || ''}`);
    }
    options[stringSlice(key, 2)] = value;
  }
  return options;
}

async function main() {
  const command = process.argv[2];
  const options = parseArguments(process.argv, 3);
  const commandKnown = command === CLI_VALUE.PREFLIGHT || command === CLI_VALUE.PUBLISH;
  if (!options.repository || !commandKnown ||
    (command === CLI_VALUE.PUBLISH && !options[CLI_VALUE.README_FILE])) {
    throw new DockerhubDescriptionError(CLI_VALUE.USAGE);
  }
  const credentials = {
    username: process.env.DOCKERHUB_USERNAME,
    password: process.env.DOCKERHUB_TOKEN,
    repository: options.repository,
  };
  const result = command === CLI_VALUE.PREFLIGHT ?
    await preflightDockerhubDescription(credentials) :
    await publishDockerhubDescription({
      ...credentials,
      description: await readFile(resolve(options[CLI_VALUE.README_FILE]), TEXT_ENCODING),
    });
  const outcome = command === CLI_VALUE.PREFLIGHT ?
    CLI_VALUE.PREFLIGHT_PASSED :
    CLI_VALUE.PUBLISHED;
  console.log(jsonStringify({outcome, ...result}, null, 2));
}

const isMainModule = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(jsonStringify({
      outcome: CLI_VALUE.FAILED,
      message: error.message,
    }, null, 2));
    process.exitCode = 1;
  });
}

export {
  DESCRIPTION_MAX_BYTES,
  DockerhubDescriptionError,
  preflightDockerhubDescription,
  publishDockerhubDescription,
  repositoryApiUrl,
};
