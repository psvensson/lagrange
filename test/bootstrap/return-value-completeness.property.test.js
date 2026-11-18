/**
 * Property Tests: Return Value Completeness
 *
 * **Property 7: Return Value Completeness**
 * *For any* call to bootstrap() or join(), the return value SHALL contain all
 * required keys (success, nodeId, duration, messageGroupServices,
 * partitionServices, etc.) to ensure API contract consistency.
 *
 * **Validates: Requirements 9.3, 9.4**
 *
 * Feature: bootstrap-architecture-refactoring, Property 7: Return Value Completeness
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {NodeService} from '../../src/node/node-service.js';
import {VIRGIN_SEED_COMPOSE_REFERENCE_MS, createVirginSeedBootstrapService,
  getUniquePort} from
  '../integration/helpers/cluster-test-helpers.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';

/**
 * Required keys in a successful bootstrap result.
 * These keys must be present per the API contract.
 */
const REQUIRED_SUCCESS_KEYS = Object.freeze([
  'success',
  'nodeId',
  'duration',
  'servicesCreated',
  'partitionsCreated',
  'messageGroupsCreated',
  'messageGroupServices',
  'partitionServices',
  'replicaHandler',
  'replicaStateMachine',
  'epochManager',
  'transport',
  'messageRouter',
]);

/**
 * Required keys in a failed bootstrap result.
 * These keys must be present per the API contract.
 */
const REQUIRED_FAILURE_KEYS = Object.freeze([
  'success',
  'nodeId',
  'duration',
  'error',
  'phase',
  'servicesCreated',
]);

/**
 * Required keys in a successful join result.
 * These keys must be present per the API contract.
 * **Validates: Requirements 9.4**
 */
const REQUIRED_JOIN_SUCCESS_KEYS = Object.freeze([
  'success',
  'nodeId',
  'duration',
  'messageGroupServices',
  'partitionServices',
  'replicaHandler',
  'replicaStateMachine',
  'transport',
  'messageRouter',
  'bootstrapResponse',
  'lifecycleStateMachine',
  'pullBasedAssigner',
  'epochManager',
]);

/**
 * Required keys in a failed join result.
 * These keys must be present per the API contract.
 * **Validates: Requirements 9.4**
 */
const REQUIRED_JOIN_FAILURE_KEYS = Object.freeze([
  'success',
  'nodeId',
  'duration',
  'error',
  'phase',
]);

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  const configManager = ConfigurationManager.getInstance();
  if (!configManager.isInitialized()) {
    configManager.initialize({
      node: {id: 'test-node'},
    });
  }

  const loggingService = LoggingService.getInstance();
  if (!loggingService.isInitialized()) {
    loggingService.initialize({
      level: 'error',
      format: 'json',
    });
  }
}

/**
 * Arbitrary for valid node IDs.
 */
const nodeIdArb = fc.string({minLength: 1, maxLength: 36}).filter((s) => s.trim().length > 0);

/**
 * Arbitrary for valid WebSocket ports.
 */
const wsPortArb = fc.integer({min: 10000, max: 60000});

// Each seed is composed as production startup composes it (directory owner,
// membership decision, storage admission) on its own node runtime. The first
// two configuration classes exercise successful fresh-seed activation, and the
// short-timeout class exercises the failure return-value contract.
const SEED_CLASSES = Object.freeze([
  Object.freeze({name: 'wsPort', options: {nodeId: 'rvc-seed-ws', wsPort: getUniquePort(),
    config: {replicaStaggerDelayMs: 0, leadershipWaitTimeoutMs: 15000,
      leadershipWaitInitialDelayMs: 2, leadershipWaitMaxDelayMs: 15,
      leadershipWaitBackoffMultiplier: 1.5}}}),
  Object.freeze({name: 'no wsPort', options: {nodeId: 'rvc-seed-no-ws',
    config: {replicaStaggerDelayMs: 0, leadershipWaitTimeoutMs: 15000,
      leadershipWaitInitialDelayMs: 2, leadershipWaitMaxDelayMs: 15,
      leadershipWaitBackoffMultiplier: 1.5}}}),
  Object.freeze({name: 'short timeout', options: {nodeId: 'rvc-seed-short',
    config: {replicaStaggerDelayMs: 0, leadershipWaitTimeoutMs: 1,
      leadershipWaitInitialDelayMs: 1, leadershipWaitMaxDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1}}}),
]);
// The seed test's budget is its composed seed count times the measured
// per-seed reference (declared statically for the test runner).
const SEED_CLASS_COUNT = 3;

async function composedSeedResult(seedClass) {
  const bootstrap = await createVirginSeedBootstrapService({
    bootIncarnation: 1, nodeService: new NodeService(), ...seedClass.options,
  });
  try {
    return await bootstrap.bootstrap();
  } finally {
    await bootstrap.shutdown();
  }
}

test('Property 7: Return Value Completeness',
  {timeout: SEED_CLASS_COUNT * scaleByMachineFactor(VIRGIN_SEED_COMPOSE_REFERENCE_MS)},
  async (t) => {
    initializeTestEnvironment();
    t.equal(SEED_CLASSES.length, SEED_CLASS_COUNT, 'the budget counts every seed');
    const results = [];
    for (const seedClass of SEED_CLASSES) {
      results.push({name: seedClass.name,
        result: await composedSeedResult(seedClass)});
    }
    t.ok(results.some(({result}) => result.success), 'composed seeds include success');
    t.ok(results.some(({result}) => !result.success), 'composed seeds include failure');
    // Each shape, asserted on every composed result.
    const eachResult = (label, check) => {
      for (const {name, result} of results) {
        t.ok(check(result), `${label} (${name})`);
      }
    };
    const onSuccess = (check) => (result) => !result.success || check(result);
    const onFailure = (check) => (result) => result.success || check(result);

    eachResult('successful bootstrap returns all expected keys',
      onSuccess((result) => REQUIRED_SUCCESS_KEYS.every((key) => key in result)));
    eachResult('failed bootstrap returns all expected failure keys',
      onFailure((result) => REQUIRED_FAILURE_KEYS.every((key) => key in result)));
    eachResult('success field is always a boolean',
      (result) => typeof result.success === 'boolean');
    eachResult('nodeId field is present and valid', (result) =>
      typeof result.nodeId === 'string' && result.nodeId.length > 0);
    eachResult('duration field is a non-negative number', (result) =>
      typeof result.duration === 'number' && result.duration >= 0);
    eachResult('servicesCreated field is a non-negative integer', (result) =>
      Number.isInteger(result.servicesCreated) && result.servicesCreated >= 0);
    eachResult('messageGroupServices is a Map on success',
      onSuccess((result) => result.messageGroupServices instanceof Map));
    eachResult('partitionServices is a Map on success',
      onSuccess((result) => result.partitionServices instanceof Map));
    eachResult('error field is a non-empty string on failure', onFailure(
      (result) => typeof result.error === 'string' && result.error.length > 0));
    eachResult('phase field is a string on failure',
      onFailure((result) => typeof result.phase === 'string'));
  });

const SHORT_LEADERSHIP_WAIT = Object.freeze({
  replicaStaggerDelayMs: 0,
  leadershipWaitTimeoutMs: 1,
  leadershipWaitInitialDelayMs: 1,
  leadershipWaitMaxDelayMs: 1,
  leadershipWaitBackoffMultiplier: 1,
});

// A joiner with no seed address: join() fails or throws; a throw becomes the
// failure result structure the API contract names.
async function unseededJoinResult(nodeId) {
  const joiningService = new NodeJoiningService({
    bootIncarnation: 1,
    nodeId,
    nodeAddress: 'localhost:9999',
    seedNodeAddress: null,
    config: SHORT_LEADERSHIP_WAIT,
  });
  try {
    return await joiningService.join();
  } catch (error) {
    return {
      success: false,
      nodeId,
      duration: 0,
      error: error.message,
      phase: joiningService.getPhase(),
    };
  } finally {
    // Always cleanup to clear heartbeat timer
    await joiningService.cleanup();
  }
}

// A mock HTTP post that returns a valid bootstrap response.
function createMockHttpPost(nodeId) {
  return async (_url, _data) => ({
    success: true,
    seedNodeId: 'seed-node-1',
    seedNodeWsAddress: 'ws://localhost:8080',
    messageGroupAssignment: {
      strategy: 'CREATE_SELF_HOSTED',
      messageGroupId: `mg-${nodeId}`,
      replicaId: `replica-${nodeId}`,
      peerAddresses: [],
      replicaAddresses: [],
    },
    currentEpoch: {
      epoch: 1,
      assignments: {},
      timestamp: new Date().toISOString(),
      proposedBy: 'seed-node-1',
    },
    readyNodes: ['seed-node-1', nodeId],
    tablePolicies: {},
  });
}

// A joiner against a mocked seed; null when join() throws (that run is not a
// success and is skipped, as before).
async function mockedJoinResult(nodeId, wsPort) {
  const joiningService = new NodeJoiningService({
    bootIncarnation: 1,
    nodeId,
    nodeAddress: `localhost:${wsPort}`,
    seedNodeAddress: 'http://localhost:3000',
    seedNodeWsAddress: 'ws://localhost:8080',
    wsPort,
    httpPost: createMockHttpPost(nodeId),
    config: {
      replicaStaggerDelayMs: 0,
      leadershipWaitTimeoutMs: 150,
      leadershipWaitInitialDelayMs: 2,
      leadershipWaitMaxDelayMs: 15,
      leadershipWaitBackoffMultiplier: 1.5,
    },
  });
  try {
    return await joiningService.join();
  } catch (_error) {
    return null;
  } finally {
    await joiningService.cleanup();
  }
}

function unseededJoinProperty(t, name, invariant) {
  t.test(name, async (t) => {
    initializeTestEnvironment();
    await fc.assert(fc.asyncProperty(nodeIdArb,
      async (nodeId) => invariant(await unseededJoinResult(nodeId))),
    {numRuns: 10});
    t.pass(name);
  });
}

function mockedJoinSuccessProperty(t, name, invariant) {
  t.test(name, async (t) => {
    initializeTestEnvironment();
    await fc.assert(fc.asyncProperty(nodeIdArb, wsPortArb,
      async (nodeId, wsPort) => {
        const result = await mockedJoinResult(nodeId, wsPort);
        // Only check successful results
        return !result?.success || invariant(result);
      }), {numRuns: 10});
    t.pass(name);
  });
}

/**
 * Property 7: Return Value Completeness (join)
 * **Validates: Requirements 9.4**
 *
 * For any call to join(), the return value SHALL contain all required keys
 * per the API contract.
 */
test('Property 7: Return Value Completeness (join)', {timeout: 120000}, async (t) => {
  unseededJoinProperty(t, 'failed join returns all expected failure keys',
    (result) => result.success ||
      REQUIRED_JOIN_FAILURE_KEYS.every((key) => key in result));
  unseededJoinProperty(t, 'join success field is always a boolean',
    (result) => typeof result.success === 'boolean');
  unseededJoinProperty(t, 'join nodeId field is present and valid', (result) =>
    typeof result.nodeId === 'string' && result.nodeId.length > 0);
  unseededJoinProperty(t, 'join duration field is a non-negative number',
    (result) => typeof result.duration === 'number' && result.duration >= 0);
  unseededJoinProperty(t, 'join error field is a non-empty string on failure',
    (result) => result.success ||
      (typeof result.error === 'string' && result.error.length > 0));
  unseededJoinProperty(t, 'join phase field is a string on failure',
    (result) => result.success || typeof result.phase === 'string');
  mockedJoinSuccessProperty(t, 'successful join returns all expected keys (mocked)',
    (result) => REQUIRED_JOIN_SUCCESS_KEYS.every((key) => key in result));
  mockedJoinSuccessProperty(t, 'join messageGroupServices is a Map on success (mocked)',
    (result) => result.messageGroupServices instanceof Map);
  mockedJoinSuccessProperty(t, 'join partitionServices is a Map on success (mocked)',
    (result) => result.partitionServices instanceof Map);
  mockedJoinSuccessProperty(t, 'join lifecycleStateMachine is present on success (mocked)',
    (result) => typeof result.lifecycleStateMachine?.getState === 'function');
});
