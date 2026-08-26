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

function createJoiningService() {
  return new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_NODE_ADDRESS,
    config: {
      httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
    },
  });
}

test('NodeJoiningService httpPost aborts when a success response body stalls',
  async (t) => {
    initializeTestEnvironment();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options = {}) => ({
      ok: true,
      json: async () => createStalledBodyPromise(options.signal),
    });

    const service = createJoiningService();

    try {
      await t.rejects(
        service.httpPost(TEST_SEED_NODE_ADDRESS, TEST_SUCCESS_RESPONSE_BODY),
        {
          message: JOINING_ERROR_MSG.httpTimeout(TEST_HTTP_TIMEOUT_MS),
        },
        'success-body stalls should still honor the join HTTP timeout',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

test('NodeJoiningService httpPost aborts when an error response body stalls',
  async (t) => {
    initializeTestEnvironment();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options = {}) => ({
      ok: false,
      status: TEST_UNAVAILABLE_STATUS_CODE,
      headers: {
        get(name) {
          return name === TEST_RESPONSE_RETRY_AFTER_HEADER ? null : null;
        },
      },
      text: async () => createStalledBodyPromise(options.signal),
    });

    const service = createJoiningService();

    try {
      await t.rejects(
        service.httpPost(TEST_SEED_NODE_ADDRESS, TEST_SUCCESS_RESPONSE_BODY),
        {
          message: JOINING_ERROR_MSG.httpTimeout(TEST_HTTP_TIMEOUT_MS),
        },
        'error-body stalls should still honor the join HTTP timeout',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
