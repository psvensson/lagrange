/**
 * D11: a lifecycle superseded by a newer NODES incarnation records that
 * incarnation as the boot incarnation owner's floor, so the next boot
 * lifecycle reserves above the cluster's value instead of climbing one
 * lifecycle at a time.
 *
 * (a) Seed: a STALE_NODE_INCARNATION refusal of the seed registration
 *     raises the owner floor before the failure propagates.
 * (b) Join: a superseded join failure carries the observed newer
 *     incarnation (readSupersededBootIncarnation) to the reattempt, which
 *     raises the floor so the reattempt reserves above it.
 */
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {NodeStorageBudgetSetup} from
  '../../src/bootstrap/shared/node-storage-budget-setup.js';
import {reserveBootIncarnation} from
  '../../src/bootstrap/boot-incarnation-owner.js';
import {buildStaleNodeIncarnationError} from
  '../../src/control-plane/control-plane-error-classification.js';
import {JoinCleanupHandler} from '../../src/bootstrap/join-cleanup-handler.js';
import {resolveFailedJoinReattempt} from
  '../../src/entrypoint-runtime-join-startup-policy.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const CLUSTER_INCARNATION = 7;
const NODE_ID = 'node-superseded';
const quietLogger = {info() {}, warn() {}, error() {}, debug() {}};

async function withDataDir(run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'boot-incarnation-floor-'));
  try {
    return await run(dataDir);
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
}

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({node: {id: NODE_ID}, logging: {level: 'error'}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'error'});
  NodeService.resetInstance();
}

function staleRegistrationError() {
  return buildStaleNodeIncarnationError({
    nodeId: NODE_ID,
    receivedIncarnation: TEST_BOOT_INCARNATION,
    knownIncarnation: CLUSTER_INCARNATION,
  });
}

async function registerSeedRefusedWith(dataDir, refusal) {
  initializeTestEnvironment();
  const service = new BootstrapService({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    nodeAddress: 'ws://localhost:19101',
  });
  service.seedCacheHydrationPhase.waitForSystemServiceLeadersInCache =
    async () => {};
  service.awaitLocalQueryTransportReadinessForReadySignal = async () => {};
  service.heartbeatService = {sendHeartbeat: async () => {}};
  service.dataDirectoryManager = {
    isInitialized: () => true,
    getDataDir: () => dataDir,
  };
  const originals = {
    create: NodeStorageBudgetSetup.create,
    resolveAndPersist: NodeStorageBudgetSetup.resolveAndPersist,
    getInstance: NodeService.getInstance,
  };
  NodeStorageBudgetSetup.create = () => ({});
  // The D-7 registration write inside the budget persist refuses: the
  // cluster's NODES row already carries a newer incarnation.
  NodeStorageBudgetSetup.resolveAndPersist = async () => {
    throw refusal;
  };
  NodeService.getInstance = () => ({getNodeStats: async () => ({})});
  try {
    await service.registerSeedNodeWithControlPlane();
    return null;
  } catch (error) {
    return error;
  } finally {
    NodeStorageBudgetSetup.create = originals.create;
    NodeStorageBudgetSetup.resolveAndPersist = originals.resolveAndPersist;
    NodeService.getInstance = originals.getInstance;
  }
}

test('D11a: a stale-incarnation refusal of the seed registration raises ' +
  'the owner floor; the next boot reserves above the cluster value',
async (t) => {
  await withDataDir(async (dataDir) => {
    t.equal(await reserveBootIncarnation(dataDir), TEST_BOOT_INCARNATION);
    const refusal = staleRegistrationError();
    t.equal(await registerSeedRefusedWith(dataDir, refusal), refusal,
      'the refusal still propagates');
    t.equal(await reserveBootIncarnation(dataDir), CLUSTER_INCARNATION + 1,
      'the next seed lifecycle reserves above the superseding incarnation');
  });
});

test('D11a: any other seed registration failure leaves the floor alone',
  async (t) => {
    await withDataDir(async (dataDir) => {
      await reserveBootIncarnation(dataDir);
      const failure = new Error('budget persist failed');
      t.equal(await registerSeedRefusedWith(dataDir, failure), failure);
      t.equal(await reserveBootIncarnation(dataDir),
        TEST_BOOT_INCARNATION + 1, 'no floor was recorded');
    });
  });

function createJoinCleanupHandler() {
  let phase = 'register';
  const handler = new JoinCleanupHandler({
    nodeId: NODE_ID,
    delegates: {
      getPhase: () => phase,
      setPhase: (next) => {
        phase = next;
      },
      setLastError() {},
      getNow: () => () => 0,
      getStartTime: () => 0,
      getLogger: () => quietLogger,
      getLifecycleStateMachine: () => ({getState: () => 'stopped',
        transition: () => true}),
      getBootstrapResponse: () => null,
      getMessageGroupServices: () => new Map(),
      emit() {},
    },
  });
  // The destructive teardown is not under test here.
  handler.cleanupFailedJoin = async () => {};
  handler.cleanup = async () => {};
  return handler;
}

async function reattemptAfter(dataDir, joinResult) {
  return resolveFailedJoinReattempt({
    dataDir,
    joinAttempt: 0,
    joinResult,
    logger: quietLogger,
    nodeId: NODE_ID,
    bootstrapAPI: {shutdown: async () => {}},
    nodeJoiningService: {cleanup: async () => {},
      getLifecycleStateMachine: () => null},
    reattemptPolicy: {maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0,
      backoffCapExponent: 0},
  });
}

for (const preserveForResume of [true, false]) {
  test('D11b: a superseded join failure (preserveForResume=' +
    `${preserveForResume}) carries the newer incarnation to the reattempt, ` +
    'which reserves above it', async (t) => {
    await withDataDir(async (dataDir) => {
      t.equal(await reserveBootIncarnation(dataDir), TEST_BOOT_INCARNATION);
      const joinResult = await createJoinCleanupHandler()
        .handleJoiningFailure(staleRegistrationError(), {preserveForResume});
      t.equal(joinResult.supersededBootIncarnation, CLUSTER_INCARNATION,
        'the failure result names the observed newer incarnation');
      const reattempt = await reattemptAfter(dataDir,
        {...joinResult, retryable: true});
      t.equal(reattempt.joinAttempt, 1, 'the reattempt proceeds');
      t.equal(await reserveBootIncarnation(dataDir), CLUSTER_INCARNATION + 1,
        'the reattempt lifecycle reserves above the cluster value');
    });
  });
}

test('D11b: a failure that is not a supersession carries no floor',
  async (t) => {
    await withDataDir(async (dataDir) => {
      await reserveBootIncarnation(dataDir);
      const joinResult = await createJoinCleanupHandler()
        .handleJoiningFailure(new Error('transient'),
          {preserveForResume: true});
      t.notOk(joinResult.supersededBootIncarnation > 0,
        'no superseding incarnation is reported');
      await reattemptAfter(dataDir, {...joinResult, retryable: true});
      t.equal(await reserveBootIncarnation(dataDir),
        TEST_BOOT_INCARNATION + 1);
    });
  });
