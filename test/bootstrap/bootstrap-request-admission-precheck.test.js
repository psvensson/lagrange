import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {BOOTSTRAP_API_PROBE_REASON} from
  '../../src/bootstrap/bootstrap-api-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HTTP_STATUS} from '../../src/constants/index.js';

const TEST_NAME =
  'BootstrapAPI claims admission before reservation precheck pressure';
const TEST_CONFIG_NODE_ID = 'test-seed-node';
const TEST_CONFIG_REST_API_PORT = 9999;
const TEST_LOG_LEVEL = 'error';
const TEST_SEED_NODE_ID = 'seed-node-1';
const TEST_SEED_NODE_ADDRESS = 'ws://localhost:8080';
const TEST_FIRST_NODE_ID = '550e8400-e29b-41d4-a716-446655440016';
const TEST_FIRST_NODE_ADDRESS = 'ws://localhost:9096';
const TEST_SECOND_NODE_ID = '550e8400-e29b-41d4-a716-446655440017';
const TEST_SECOND_NODE_ADDRESS = 'ws://localhost:9097';
const TEST_GROUP_ID = 'mg-precheck';
const TEST_MAX_CONCURRENT = 1;
const TEST_RETRY_AFTER_MS = 250;
const TEST_LISTEN_DISABLED = false;
const TEST_ACTIVE_COUNT = 1;
const TEST_IDLE_COUNT = 0;
const TEST_POLL_ATTEMPTS = 20;
const TEST_POLL_MS = 5;
const TEST_NO_VALUE = null;
const TEST_EMPTY_LIST = Object.freeze([]);
const TEST_EMPTY_OBJECT = Object.freeze({});
const TEST_LEADER_READY = Object.freeze({
  ready: true,
});
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

  let releaseFirstPrecheck = null;
  const firstPrecheckGate = new Promise((resolve) => {
    releaseFirstPrecheck = resolve;
  });
  let blockingAdmissionChecks = TEST_IDLE_COUNT;

  const api = new BootstrapAPI({
    seedNodeId: TEST_SEED_NODE_ID,
    seedNodeAddress: TEST_SEED_NODE_ADDRESS,
    systemTableCache: TEST_SYSTEM_TABLE_CACHE,
    maxConcurrentBootstrapRequests: TEST_MAX_CONCURRENT,
    bootstrapAdmissionRetryAfterMs: TEST_RETRY_AFTER_MS,
  });

  api.getBlockingMoveReplicaBootstrapAdmissions = async () => {
    blockingAdmissionChecks += TEST_ACTIVE_COUNT;
    if (blockingAdmissionChecks === TEST_ACTIVE_COUNT) {
      await firstPrecheckGate;
    }
    return TEST_EMPTY_LIST;
  };
  api.waitForServiceLeaders = async () => TEST_LEADER_READY;
  api.determineAndReserveMessageGroupAssignment = async () => ({
    strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
    groupId: TEST_GROUP_ID,
  });
  api.getCurrentEpoch = () => TEST_NO_VALUE;
  api.getClusterConfiguration = () => TEST_EMPTY_OBJECT;
  api.getReadyNodes = () => TEST_EMPTY_LIST;
  api.getTablePolicies = () => TEST_EMPTY_OBJECT;
  api.getLatencyTopologyHints = () => TEST_NO_VALUE;

  await api.initialize(TEST_IDLE_COUNT, {listen: TEST_LISTEN_DISABLED});

  try {
    const firstRequestPromise = api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: TEST_FIRST_NODE_ID,
        nodeAddress: TEST_FIRST_NODE_ADDRESS,
      },
    });

    for (let attempt = TEST_IDLE_COUNT; attempt < TEST_POLL_ATTEMPTS;
      attempt += TEST_ACTIVE_COUNT) {
      if (blockingAdmissionChecks === TEST_ACTIVE_COUNT) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, TEST_POLL_MS));
    }

    t.equal(
      api.inFlightBootstrapRequestCount,
      TEST_ACTIVE_COUNT,
      'first bootstrap request should claim the single admission slot before reservation precheck awaits',
    );

    const deferredResponse = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: TEST_SECOND_NODE_ID,
        nodeAddress: TEST_SECOND_NODE_ADDRESS,
      },
    });

    t.equal(
      deferredResponse.statusCode,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'second bootstrap request should be deferred while the first request owns the slot',
    );
    const deferredBody = JSON.parse(deferredResponse.body);
    t.equal(
      blockingAdmissionChecks,
      TEST_ACTIVE_COUNT,
      'deferred request should not enter the expensive reservation precheck path',
    );
    t.ok(
      deferredBody.reasons.includes(
        BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
      ),
      'deferred request should expose admission backpressure while the first request is still in precheck',
    );

    releaseFirstPrecheck();
    const firstResponse = await firstRequestPromise;
    t.equal(
      firstResponse.statusCode,
      HTTP_STATUS.OK,
      'first bootstrap request should complete once the reservation precheck is released',
    );
    t.equal(
      api.inFlightBootstrapRequestCount,
      TEST_IDLE_COUNT,
      'bootstrap admission count should return to zero after the first request completes',
    );
  } finally {
    await api.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
