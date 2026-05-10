import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_RESPONSE_FIELD,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from
  '../../src/bootstrap/bootstrap-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HTTP_STATUS} from '../../src/constants/index.js';
import {getRemainingBudgetMs} from
  '../../src/control-plane/timeout-budget.js';

const TEST_NAME =
  'BootstrapAPI returns bootstrap-not-ready when admitted bootstrap work' +
  ' exhausts the request execution budget';
const TEST_CONFIG_NODE_ID = 'test-seed-node';
const TEST_CONFIG_REST_API_PORT = 9999;
const TEST_LOG_LEVEL = 'error';
const TEST_SEED_NODE_ID = 'seed-node-1';
const TEST_SEED_NODE_ADDRESS = 'ws://localhost:8080';
const TEST_REQUEST_NODE_ID = '550e8400-e29b-41d4-a716-446655440018';
const TEST_REQUEST_NODE_ADDRESS = 'ws://localhost:9098';
const TEST_REQUEST_EXECUTION_BUDGET_MS = 5;
const TEST_STALL_MS = 15;
const TEST_RETRY_AFTER_MS = 250;
const TEST_LISTEN_DISABLED = false;
const TEST_READY_STATUS = Object.freeze({ready: true});
const TEST_NO_VALUE = null;
const TEST_EMPTY_LIST = Object.freeze([]);
const TEST_SYSTEM_TABLE_CACHE = Object.freeze({
  get() {
    return TEST_NO_VALUE;
  },
  getAll() {
    return TEST_EMPTY_LIST;
  },
  filter() {
    return TEST_EMPTY_LIST;
  },
  find() {
    return TEST_NO_VALUE;
  },
  getReadyNodes() {
    return TEST_EMPTY_LIST;
  },
});
const TEST_STARTUP_AUTHORITY = Object.freeze({
  ready: false,
  observedAt: 123,
  reasons: Object.freeze([
    BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
  ]),
});
const TEST_TIMEOUT_ERROR_MESSAGE =
  'bootstrap request execution budget exhausted';
const TEST_ASSIGNMENT_GROUP_ID = 'mg-test';
const TEST_ASSIGNMENT = Object.freeze({
  strategy: BOOTSTRAP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED,
  groupId: TEST_ASSIGNMENT_GROUP_ID,
});

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {
        id: TEST_CONFIG_NODE_ID,
        restApiPort: TEST_CONFIG_REST_API_PORT,
      },
      logging: {level: TEST_LOG_LEVEL},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: TEST_LOG_LEVEL});
  }
}

test(TEST_NAME, async (t) => {
  initializeTestEnvironment();

  const observedTimeoutBudgets = [];
  const api = new BootstrapAPI({
    seedNodeId: TEST_SEED_NODE_ID,
    seedNodeAddress: TEST_SEED_NODE_ADDRESS,
    systemTableCache: TEST_SYSTEM_TABLE_CACHE,
    bootstrapAdmissionRetryAfterMs: TEST_RETRY_AFTER_MS,
    bootstrapRequestExecutionBudgetMs: TEST_REQUEST_EXECUTION_BUDGET_MS,
    controlPlaneReadinessService: {
      getStartupAuthoritySnapshotSync() {
        return TEST_STARTUP_AUTHORITY;
      },
    },
  });

  api.getBlockingMoveReplicaBootstrapAdmissions = async (
    _now,
    options = {},
  ) => {
    observedTimeoutBudgets.push(options.timeoutBudget || null);
    return TEST_EMPTY_LIST;
  };
  api.waitForServiceLeaders = async () => TEST_READY_STATUS;
  api.determineAndReserveMessageGroupAssignment = async (_nodeId, options = {}) => {
    observedTimeoutBudgets.push(options.timeoutBudget || null);
    await new Promise((resolve) => setTimeout(resolve, TEST_STALL_MS));
    const remainingBudgetMs = getRemainingBudgetMs(options.timeoutBudget, {
      now: Date.now,
    });
    t.equal(
      remainingBudgetMs,
      0,
      'assignment owner should observe that the shared bootstrap request budget is exhausted',
    );
    const error = new Error(TEST_TIMEOUT_ERROR_MESSAGE);
    error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
    error.errorCode = BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
    error.retryAfterMs = TEST_RETRY_AFTER_MS;
    throw error;
  };

  await api.initialize(0, {listen: TEST_LISTEN_DISABLED});

  try {
    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: TEST_REQUEST_NODE_ID,
        nodeAddress: TEST_REQUEST_NODE_ADDRESS,
      },
    });

    t.equal(
      observedTimeoutBudgets.length,
      2,
      'request owner should pass the shared execution budget through both admitted bootstrap stages',
    );
    t.ok(
      observedTimeoutBudgets.every((budget) => budget === observedTimeoutBudgets[0]),
      'budget-aware admitted bootstrap stages should share one timeout budget instance',
    );
    t.equal(
      observedTimeoutBudgets[0]?.configuredBudgetMs,
      TEST_REQUEST_EXECUTION_BUDGET_MS,
      'shared timeout budget should use the configured bootstrap request execution budget',
    );
    t.equal(
      response.statusCode,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'budget-exhausted admitted bootstrap work should return the canonical defer response',
    );
    const body = JSON.parse(response.body);
    t.equal(
      body.error,
      BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      'response should preserve the canonical bootstrap-not-ready error',
    );
    t.equal(
      body.code,
      BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      'response should preserve the canonical bootstrap-not-ready code',
    );
    t.equal(
      body.retryAfterMs,
      TEST_RETRY_AFTER_MS,
      'response should preserve the retry hint from the exhausted bootstrap request budget path',
    );
    t.ok(
      body.reasons.includes(
        BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
      ),
      'response should expose the canonical control-plane dependency blocker',
    );
    t.same(
      body[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY],
      TEST_STARTUP_AUTHORITY,
      'response should retain startup authority evidence on admitted request budget exhaustion',
    );
    t.equal(
      api.inFlightBootstrapRequestCount,
      0,
      'bootstrap admission count should return to zero after the budget-exhausted defer response',
    );
  } finally {
    await api.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test(
  'BootstrapAPI defers when assignment reservation exhausts the request budget',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: TEST_SEED_NODE_ID,
      seedNodeAddress: TEST_SEED_NODE_ADDRESS,
      systemTableCache: TEST_SYSTEM_TABLE_CACHE,
      bootstrapAdmissionRetryAfterMs: TEST_RETRY_AFTER_MS,
      bootstrapRequestExecutionBudgetMs: TEST_REQUEST_EXECUTION_BUDGET_MS,
      controlPlaneReadinessService: {
        getStartupAuthoritySnapshotSync() {
          return TEST_STARTUP_AUTHORITY;
        },
      },
    });

    api.getBlockingMoveReplicaBootstrapAdmissions = async () =>
      TEST_EMPTY_LIST;
    api.waitForServiceLeaders = async () => TEST_READY_STATUS;
    api.determineAndReserveMessageGroupAssignment = async () => {
      await new Promise((resolve) => setTimeout(resolve, TEST_STALL_MS));
      return TEST_ASSIGNMENT;
    };

    await api.initialize(0, {listen: TEST_LISTEN_DISABLED});

    try {
      const response = await api.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: TEST_REQUEST_NODE_ID,
          nodeAddress: TEST_REQUEST_NODE_ADDRESS,
        },
      });

      t.equal(
        response.statusCode,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        'budget-exhausted successful assignment should still defer bootstrap',
      );
      const body = JSON.parse(response.body);
      t.equal(
        body.error,
        BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        'deferred response should preserve the canonical bootstrap-not-ready error',
      );
      t.equal(
        body.retryAfterMs,
        TEST_RETRY_AFTER_MS,
        'deferred response should retain the bootstrap retry hint',
      );
      t.equal(
        api.inFlightBootstrapRequestCount,
        0,
        'bootstrap admission count should be released after budget defer',
      );
    } finally {
      await api.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);
