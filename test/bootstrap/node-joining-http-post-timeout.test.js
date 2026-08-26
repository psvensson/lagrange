import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {JOINING_ERROR_MSG} from '../../src/bootstrap/node-joining-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

const TEST_NODE_ID = 'node-http-post-timeout';
const TEST_NODE_ADDRESS = 'ws://localhost:19094';
const TEST_SEED_NODE_ADDRESS = 'http://localhost:18084';
const TEST_HTTP_TIMEOUT_MS = 25;
const TEST_ABORT_ERROR_NAME = 'AbortError';
const TEST_RESPONSE_RETRY_AFTER_HEADER = 'retry-after';
const TEST_SUCCESS_RESPONSE_BODY = {
  success: true,
  seedNodeId: 'seed-node-1',
};
const TEST_UNAVAILABLE_STATUS_CODE = 503;
const TEST_BOOTSTRAP_READY_URL =
  `${TEST_SEED_NODE_ADDRESS}/bootstrap/ready?projectionNodeId=${TEST_NODE_ID}`;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_NODE_ID},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

function createBodyTimeoutError() {
  const error = new Error('body read aborted');
  error.name = TEST_ABORT_ERROR_NAME;
  return error;
}

function createStalledBodyPromise(signal) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        reject(createBodyTimeoutError());
      },
      {once: true},
    );
  });
}

function createJoiningService(httpFetch) {
  return new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_NODE_ADDRESS,
    httpFetch,
    config: {
      httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
    },
  });
}

test('NodeJoiningService httpPost aborts when a success response body stalls',
  async (t) => {
    initializeTestEnvironment();
    const service = createJoiningService(async (_url, options = {}) => ({
      ok: true,
      json: async () => createStalledBodyPromise(options.signal),
    }));
    await t.rejects(
      service.httpPost(TEST_SEED_NODE_ADDRESS, TEST_SUCCESS_RESPONSE_BODY),
      {
        message: JOINING_ERROR_MSG.httpTimeout(TEST_HTTP_TIMEOUT_MS),
      },
      'success-body stalls should still honor the join HTTP timeout',
    );
  });

test('NodeJoiningService httpPost aborts when an error response body stalls',
  async (t) => {
    initializeTestEnvironment();
    const service = createJoiningService(async (_url, options = {}) => ({
      ok: false,
      status: TEST_UNAVAILABLE_STATUS_CODE,
      headers: {
        get(name) {
          return name === TEST_RESPONSE_RETRY_AFTER_HEADER ? null : null;
        },
      },
      text: async () => createStalledBodyPromise(options.signal),
    }));
    await t.rejects(
      service.httpPost(TEST_SEED_NODE_ADDRESS, TEST_SUCCESS_RESPONSE_BODY),
      {
        message: JOINING_ERROR_MSG.httpTimeout(TEST_HTTP_TIMEOUT_MS),
      },
      'error-body stalls should still honor the join HTTP timeout',
    );
  });

test('NodeJoiningService httpPost is stable under post-import mutable ' +
  'intrinsics', async (t) => {
  initializeTestEnvironment();
  const service = createJoiningService(async () => ({
    ok: false,
    status: TEST_UNAVAILABLE_STATUS_CODE,
    headers: {get: () => '1'},
    text: async () => '{"retryAfterMs":1500}',
  }));
  const originals = {
    abortController: globalThis.AbortController,
    clearTimeout: globalThis.clearTimeout,
    dateParse: Date.parse,
    error: globalThis.Error,
    fetch: globalThis.fetch,
    floor: Math.floor,
    isFinite: Number.isFinite,
    max: Math.max,
    parse: JSON.parse,
    stringify: JSON.stringify,
    setTimeout: globalThis.setTimeout,
  };
  let caught = null;
  try {
    globalThis.AbortController = function ForgedAbortController() {};
    globalThis.clearTimeout = () => {};
    Date.parse = () => NaN;
    globalThis.Error = function ForgedError() {};
    globalThis.fetch = async () => {
      throw new Error('live fetch invoked');
    };
    Math.floor = () => 10_000;
    Math.max = () => -1;
    Number.isFinite = () => false;
    JSON.parse = () => null;
    JSON.stringify = () => 'forged';
    globalThis.setTimeout = () => {
      throw new Error('live setTimeout invoked');
    };
    await service.httpPost(
      TEST_SEED_NODE_ADDRESS,
      TEST_SUCCESS_RESPONSE_BODY,
    );
  } catch (error) {
    caught = error;
  } finally {
    globalThis.AbortController = originals.abortController;
    globalThis.clearTimeout = originals.clearTimeout;
    Date.parse = originals.dateParse;
    globalThis.Error = originals.error;
    globalThis.fetch = originals.fetch;
    Math.floor = originals.floor;
    Math.max = originals.max;
    Number.isFinite = originals.isFinite;
    JSON.parse = originals.parse;
    JSON.stringify = originals.stringify;
    globalThis.setTimeout = originals.setTimeout;
  }
  t.equal(caught.statusCode, TEST_UNAVAILABLE_STATUS_CODE);
  t.equal(caught.retryAfterMs, 1500,
    'retry evidence uses the captured parser and maximum');
  t.end();
});

test('NodeJoiningService httpGetJson preserves a 503 readiness projection ' +
  'body inside the existing join HTTP budget', async (t) => {
  initializeTestEnvironment();
  let requestOptions = null;
  const projectedBody = {
    ready: false,
    startupAuthority: {authorityAvailable: true},
  };
  const service = createJoiningService(async (_url, options = {}) => {
    requestOptions = options;
    return {
      ok: false,
      status: TEST_UNAVAILABLE_STATUS_CODE,
      json: async () => projectedBody,
    };
  });
  t.same(
    await service.httpGetJson(TEST_BOOTSTRAP_READY_URL),
    {
      statusCode: TEST_UNAVAILABLE_STATUS_CODE,
      body: projectedBody,
    },
    'readiness denial remains distinct from projection transport failure',
  );
  t.equal(requestOptions.method, 'GET');
  t.equal(requestOptions.body, undefined,
    'the read-only projection transport has no mutation payload');
});

test('NodeJoiningService httpGetJson aborts a stalled projection body inside ' +
  'the supplied formation cadence', async (t) => {
  initializeTestEnvironment();
  const service = createJoiningService(async (_url, options = {}) => ({
    ok: false,
    status: TEST_UNAVAILABLE_STATUS_CODE,
    json: async () => createStalledBodyPromise(options.signal),
  }));
  await t.rejects(
    service.httpGetJson(TEST_BOOTSTRAP_READY_URL, {timeoutMs: 20}),
    {message: JOINING_ERROR_MSG.httpTimeout(20)},
    'the read-only seed projection cannot consume the generic 10s timeout',
  );
});

test('NodeJoiningService httpGetJson is stable under post-import mutable ' +
  'intrinsics and never reads an error name accessor', async (t) => {
  initializeTestEnvironment();
  const originals = {
    abortController: globalThis.AbortController,
    clearTimeout: globalThis.clearTimeout,
    error: globalThis.Error,
    fetch: globalThis.fetch,
    floor: Math.floor,
    isFinite: Number.isFinite,
    stringify: JSON.stringify,
    setTimeout: globalThis.setTimeout,
  };
  const service = createJoiningService(async () => ({
    ok: false,
    status: TEST_UNAVAILABLE_STATUS_CODE,
    json: async () => ({ready: false}),
  }));
  let response;
  try {
    globalThis.AbortController = function ForgedAbortController() {};
    globalThis.clearTimeout = () => {};
    globalThis.Error = function ForgedError() {};
    globalThis.fetch = async () => {
      throw new Error('live fetch invoked');
    };
    Math.floor = () => 10_000;
    Number.isFinite = () => false;
    JSON.stringify = () => 'forged';
    globalThis.setTimeout = () => {
      throw new Error('live setTimeout invoked');
    };
    response = await service.httpGetJson(
      TEST_BOOTSTRAP_READY_URL,
      {timeoutMs: 20},
    );
  } finally {
    globalThis.AbortController = originals.abortController;
    globalThis.clearTimeout = originals.clearTimeout;
    globalThis.Error = originals.error;
    globalThis.fetch = originals.fetch;
    Math.floor = originals.floor;
    Number.isFinite = originals.isFinite;
    JSON.stringify = originals.stringify;
    globalThis.setTimeout = originals.setTimeout;
  }
  t.equal(response.statusCode, TEST_UNAVAILABLE_STATUS_CODE);

  let getterCalls = 0;
  const hostileError = {};
  Object.defineProperty(hostileError, 'name', {
    get() {
      getterCalls += 1;
      return TEST_ABORT_ERROR_NAME;
    },
  });
  service.httpFetch = async () => {
    throw hostileError;
  };
  let caught = null;
  try {
    await service.httpGetJson(TEST_BOOTSTRAP_READY_URL, {timeoutMs: 20});
  } catch (error) {
    caught = error;
  }
  t.equal(caught, hostileError);
  t.equal(getterCalls, 0, 'error classification uses the owned timeout cause');
  t.end();
});
