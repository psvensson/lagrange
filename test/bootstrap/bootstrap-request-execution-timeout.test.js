import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapJoinAdmissionOwner} from
  '../../src/bootstrap/owners/bootstrap-join-admission-owner.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_REQUEST_FIELD,
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
import {
  createTopLevelOperationBudget,
  getRemainingBudgetMs,
} from
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
const TEST_LOCK_WAIT_OPERATION_NAME = 'bootstrap_request_execution';
const TEST_LOCK_WAIT_BUDGET_MS = 5;
const TEST_LOCK_WAIT_FAILSAFE_MS = 50;
const TEST_LOCK_WAIT_SENTINEL = 'lock_wait_still_pending';
const TEST_EXPIRED_CLIENT_ATTEMPT_LAG_MS = 1;
const TEST_PRE_ADMISSION_CLIENT_ATTEMPT_BUDGET_MS = 100;
const TEST_PRE_ADMISSION_STALL_MS = 125;
const TEST_IDLE_STAGE_CALL_COUNT = 0;
const TEST_ACTIVE_STAGE_CALL_COUNT = 1;
const TEST_READY_BOOTSTRAP_JOIN_ADMISSION_SNAPSHOT = Object.freeze({
  ready: true,
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
        BOOTSTRAP_API_PROBE_REASON
          .BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED,
      ),
      'response should expose the canonical request-budget exhaustion blocker',
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

test(
  'BootstrapAPI defers an expired client contact-seed attempt before admitted work',
  async (t) => {
    initializeTestEnvironment();

    const counters = {
      leaderReadinessCalls: TEST_IDLE_STAGE_CALL_COUNT,
      assignmentCalls: TEST_IDLE_STAGE_CALL_COUNT,
    };
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

    api.waitForServiceLeaders = async () => {
      counters.leaderReadinessCalls += TEST_ACTIVE_STAGE_CALL_COUNT;
      return TEST_READY_STATUS;
    };
    api.determineAndReserveMessageGroupAssignment = async () => {
      counters.assignmentCalls += TEST_ACTIVE_STAGE_CALL_COUNT;
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
          [BOOTSTRAP_API_REQUEST_FIELD.CLIENT_ATTEMPT_DEADLINE_MS]:
            Date.now() - TEST_EXPIRED_CLIENT_ATTEMPT_LAG_MS,
        },
      });

      t.equal(
        response.statusCode,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        'expired client attempts should receive a retryable bootstrap defer',
      );
      const body = JSON.parse(response.body);
      t.equal(
        body.code,
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        'expired client attempts should preserve the canonical bootstrap-not-ready code',
      );
      t.ok(
        body.reasons.includes(
          BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
        ),
        'expired client attempts should expose the client attempt deadline blocker',
      );
      t.equal(
        counters.leaderReadinessCalls,
        TEST_IDLE_STAGE_CALL_COUNT,
        'expired client attempts should not enter leader readiness work',
      );
      t.equal(
        counters.assignmentCalls,
        TEST_IDLE_STAGE_CALL_COUNT,
        'expired client attempts should not enter assignment work',
      );
      t.equal(
        api.inFlightBootstrapRequestCount,
        TEST_IDLE_STAGE_CALL_COUNT,
        'expired client attempts should not claim a bootstrap admission slot',
      );
    } finally {
      await api.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'BootstrapAPI defers a client contact-seed attempt that expires before admission claim',
  async (t) => {
    initializeTestEnvironment();

    const counters = {
      bootstrapJoinAdmissionSnapshotCalls: TEST_IDLE_STAGE_CALL_COUNT,
      admissionClaims: TEST_IDLE_STAGE_CALL_COUNT,
      blockingMoveReplicaCalls: TEST_IDLE_STAGE_CALL_COUNT,
      leaderReadinessCalls: TEST_IDLE_STAGE_CALL_COUNT,
      assignmentCalls: TEST_IDLE_STAGE_CALL_COUNT,
    };
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

    const acquireBootstrapAdmission =
      api.acquireBootstrapAdmission.bind(api);
    api.getBootstrapJoinAdmissionSnapshot = async () => {
      counters.bootstrapJoinAdmissionSnapshotCalls +=
        TEST_ACTIVE_STAGE_CALL_COUNT;
      await new Promise((resolve) => {
        setTimeout(resolve, TEST_PRE_ADMISSION_STALL_MS);
      });
      return TEST_READY_BOOTSTRAP_JOIN_ADMISSION_SNAPSHOT;
    };
    api.acquireBootstrapAdmission = (snapshot) => {
      counters.admissionClaims += TEST_ACTIVE_STAGE_CALL_COUNT;
      return acquireBootstrapAdmission(snapshot);
    };
    api.getBlockingMoveReplicaBootstrapAdmissions = async () => {
      counters.blockingMoveReplicaCalls += TEST_ACTIVE_STAGE_CALL_COUNT;
      return TEST_EMPTY_LIST;
    };
    api.waitForServiceLeaders = async () => {
      counters.leaderReadinessCalls += TEST_ACTIVE_STAGE_CALL_COUNT;
      return TEST_READY_STATUS;
    };
    api.determineAndReserveMessageGroupAssignment = async () => {
      counters.assignmentCalls += TEST_ACTIVE_STAGE_CALL_COUNT;
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
          [BOOTSTRAP_API_REQUEST_FIELD.CLIENT_ATTEMPT_DEADLINE_MS]:
            Date.now() + TEST_PRE_ADMISSION_CLIENT_ATTEMPT_BUDGET_MS,
        },
      });

      t.equal(
        counters.bootstrapJoinAdmissionSnapshotCalls,
        TEST_ACTIVE_STAGE_CALL_COUNT,
        'initially valid client attempts should enter pre-admission readiness work',
      );
      t.equal(
        response.statusCode,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        'client attempts that expire during pre-admission work should defer bootstrap',
      );
      const body = JSON.parse(response.body);
      t.equal(
        body.code,
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        'pre-admission deadline expiry should preserve the canonical bootstrap-not-ready code',
      );
      t.ok(
        body.reasons.includes(
          BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
        ),
        'pre-admission deadline expiry should expose the client attempt deadline blocker',
      );
      t.equal(
        counters.admissionClaims,
        TEST_IDLE_STAGE_CALL_COUNT,
        'client attempts expired at the admission boundary should not claim an admission slot',
      );
      t.equal(
        counters.blockingMoveReplicaCalls,
        TEST_IDLE_STAGE_CALL_COUNT,
        'client attempts expired at the admission boundary should not enter admitted blocking checks',
      );
      t.equal(
        counters.leaderReadinessCalls,
        TEST_IDLE_STAGE_CALL_COUNT,
        'client attempts expired at the admission boundary should not enter leader readiness work',
      );
      t.equal(
        counters.assignmentCalls,
        TEST_IDLE_STAGE_CALL_COUNT,
        'client attempts expired at the admission boundary should not enter assignment work',
      );
      t.equal(
        api.inFlightBootstrapRequestCount,
        TEST_IDLE_STAGE_CALL_COUNT,
        'client attempts expired at the admission boundary should leave bootstrap admissions empty',
      );
    } finally {
      await api.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'BootstrapJoinAdmissionOwner defers when assignment lock wait exhausts request budget',
  async (t) => {
    let assignmentWorkStarted = false;
    const owner = new BootstrapJoinAdmissionOwner({
      delegates: {
        getSystemTableCache() {
          assignmentWorkStarted = true;
          return TEST_SYSTEM_TABLE_CACHE;
        },
        getBootstrapAdmissionRetryAfterMs() {
          return TEST_RETRY_AFTER_MS;
        },
      },
    });
    owner.moveReplicaAssignmentReservationLock = new Promise(() => {});
    const timeoutBudget = createTopLevelOperationBudget({
      configuredBudgetMs: TEST_LOCK_WAIT_BUDGET_MS,
      startedAtMs: Date.now(),
      operationName: TEST_LOCK_WAIT_OPERATION_NAME,
    });

    const result = await Promise.race([
      owner.determineAndReserveMessageGroupAssignment(
        TEST_REQUEST_NODE_ID,
        {timeoutBudget},
      ).then(
        (assignment) => assignment,
        (error) => error,
      ),
      new Promise((resolve) => {
        setTimeout(
          () => resolve(TEST_LOCK_WAIT_SENTINEL),
          TEST_LOCK_WAIT_FAILSAFE_MS,
        );
      }),
    ]);

    t.not(
      result,
      TEST_LOCK_WAIT_SENTINEL,
      'assignment lock wait should observe the bootstrap request budget before the caller times out',
    );
    t.equal(
      result.message,
      BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      'budget-exhausted assignment lock wait should use canonical bootstrap-not-ready error',
    );
    t.equal(
      result.errorCode,
      BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      'budget-exhausted assignment lock wait should use canonical bootstrap-not-ready code',
    );
    t.equal(
      result.reasonCode,
      BOOTSTRAP_API_PROBE_REASON
        .BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED,
      'budget-exhausted assignment lock wait should expose the budget blocker',
    );
    t.equal(
      result.statusCode,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'budget-exhausted assignment lock wait should be retryable at the bootstrap API boundary',
    );
    t.equal(
      result.retryAfterMs,
      TEST_RETRY_AFTER_MS,
      'budget-exhausted assignment lock wait should preserve the bootstrap retry hint',
    );
    t.equal(
      assignmentWorkStarted,
      false,
      'owner should not enter assignment work after the request budget is exhausted behind the lock',
    );
  },
);
