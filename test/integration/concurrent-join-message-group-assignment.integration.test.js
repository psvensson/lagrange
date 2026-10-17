import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeService} from '../../src/node/node-service.js';
import {HTTP_STATUS} from '../../src/constants/index.js';
import {BOOTSTRAP_PIPELINE_ERROR_CODE} from
  '../../src/bootstrap/bootstrap-constants.js';
import {BOOTSTRAP_API_PROBE_REASON} from
  '../../src/bootstrap/bootstrap-api-constants.js';
import {isRetryableSeedContactCode} from
  '../../src/bootstrap/phases/contact-seed-failure-signals.js';
import {
  cleanupTestEnvironment,
  getUniquePort,
  gracefulShutdown,
  createVirginSeedBootstrapService,
  initializeTestEnvironment,
  TEST_CONFIG,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 120000;
const NODE_ONE_ID = '550e8400-e29b-41d4-a716-446655440231';
const NODE_TWO_ID = '550e8400-e29b-41d4-a716-446655440232';

// W8 (identity-reuse safety fix, A3): a real seed bootstrapped with its mg-1
// on the real rs-raft runtime; concurrent joiners each host their own new
// message group, no joiner is given any replica of mg-1, and mg-1's
// committed configuration and services rows stay the seed's. This file once
// pinned UNIQUE MOVE_REPLICA assignments of mg-1 replicas to concurrent
// joiners: a message-group replica's raft id derives from its name, so each
// such move re-opened a committed identity on an empty log.
//
// Two joiners are only concurrent inside the handler if the seed admits two
// bootstrap requests at once. Production admits one by default
// (MAX_CONCURRENT_BOOTSTRAP_REQUESTS); the reservation property is therefore
// proven on an API constructed with the owner's own option for two, and the
// default cap is proven separately: a joiner arriving while the one slot is
// held is answered with the typed, retryable backpressure answer. (Before the
// rs-raft cutover the first request completed inside one macrotask, so the
// second never overlapped it and both cases looked like the first.)
const REQUESTS_ADMITTED_AT_ONCE = 2;

function joinRequest(nodeId, port) {
  return {
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: `ws://localhost:${port}`},
  };
}

async function withSeedApi(t, apiOptions, run) {
  initializeTestEnvironment();
  t.teardown(async () => {
    await cleanupTestEnvironment();
  });

  const seedNodeId = '550e8400-e29b-41d4-a716-446655440230';
  const seedWsPort = getUniquePort();
  const bootstrapService = await createVirginSeedBootstrapService({
    nodeId: seedNodeId,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    config: TEST_CONFIG.bootstrap,
  });

  let bootstrapResult = null;
  let seedApi = null;
  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

    seedApi = new BootstrapAPI({
      seedNodeId,
      seedNodeAddress: `ws://localhost:${seedWsPort}`,
      seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      systemTableCache: NodeService.getInstance().getSystemTableCache(),
      messageRouter: bootstrapResult.messageRouter,
      epochManager: bootstrapResult.epochManager,
      bootstrapService,
      ...apiOptions,
    });
    await seedApi.initialize(0, {listen: false});

    const seedQueryEngine = new SQLQueryEngine({
      systemCache: NodeService.getInstance().getSystemTableCache(),
      messageRouter: bootstrapResult.messageRouter,
      nodeId: seedNodeId,
    });
    seedApi.setSqlQueryEngine(seedQueryEngine);
    await run(seedApi, bootstrapResult);
  } finally {
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
  }
}

function seedGroupFacts(bootstrapResult) {
  const services = [...bootstrapResult.messageGroupServices.values()];
  return {
    replicaIds: services.map((service) => service.replicaId).sort(),
    voters: services.map((service) =>
      [...service.raft.readStatus().confState.voters].sort()),
  };
}

test('concurrent joiners each host their own message group; mg-1 stays ' +
  'the seed\'s', {
  timeout: TEST_TIMEOUT_MS,
}, async (t) => {
  await withSeedApi(t, {
    maxConcurrentBootstrapRequests: REQUESTS_ADMITTED_AT_ONCE,
  }, async (seedApi, bootstrapResult) => {
    const seedGroupBefore = seedGroupFacts(bootstrapResult);
    t.equal(seedGroupBefore.replicaIds.length, 3,
      'setup: the seed hosts all three mg-1 replicas');
    const [responseOne, responseTwo] = await Promise.all([
      seedApi.getFastify().inject(joinRequest(NODE_ONE_ID, 19231)),
      seedApi.getFastify().inject(joinRequest(NODE_TWO_ID, 19232)),
    ]);

    t.equal(responseOne.statusCode, 200, 'first bootstrap request should succeed');
    t.equal(responseTwo.statusCode, 200,
      'second bootstrap request should also succeed with its own assignment');

    const assignments = [responseOne.json(), responseTwo.json()]
      .map((body) => body.messageGroupAssignment);
    for (const assignment of assignments) {
      t.equal(assignment?.strategy, 'CREATE_SELF_HOSTED',
        'the joiner hosts its own message group');
      t.notOk(assignment?.replicaToMove, 'no mg-1 replica is moved');
      t.notOk(assignment?.assignmentId, 'no move reservation is taken');
      t.notOk(seedGroupBefore.replicaIds.some((replicaId) =>
        replicaId.startsWith(`${assignment?.groupId}-`)),
      'the joiner\'s group is not the seed\'s');
    }
    t.not(assignments[0]?.groupId, assignments[1]?.groupId,
      'each joiner hosts a distinct group');
    t.same(seedGroupFacts(bootstrapResult), seedGroupBefore,
      'mg-1\'s replicas and committed voters stay the seed\'s');
    const seedId = bootstrapResult.messageRouter.nodeId;
    const seedRows = NodeService.getInstance().getSystemTableCache()
      .getAll('services').filter((row) =>
        seedGroupBefore.replicaIds.includes(row.service_id));
    t.ok(seedRows.length > 0 && seedRows.every((row) =>
      row.node_id === seedId), 'mg-1\'s services rows stay on the seed');
  });
});

// The default cap, made concurrent by construction rather than by timing: the
// first joiner's admission slot is held until the second joiner has been
// answered, which is what "concurrent" means at the admission gate whatever
// the first request's own duration. The hold wraps the API's own release and
// returns every held slot afterwards.
async function answerWhileFirstHoldsTheSlot(seedApi, first, second) {
  const release = seedApi.releaseBootstrapAdmission.bind(seedApi);
  const held = [];
  seedApi.releaseBootstrapAdmission = (admission) => {
    held.push(admission);
  };
  try {
    const responseOne = await seedApi.getFastify().inject(first);
    const heldSlots = seedApi.inFlightBootstrapRequestCount;
    const responseTwo = await seedApi.getFastify().inject(second);
    return {responseOne, responseTwo, heldSlots};
  } finally {
    seedApi.releaseBootstrapAdmission = release;
    for (const admission of held) release(admission);
  }
}

test('under the default cap a concurrent joiner is answered retryable backpressure', {
  timeout: TEST_TIMEOUT_MS,
}, async (t) => {
  await withSeedApi(t, {}, async (seedApi) => {
    const {responseOne, responseTwo, heldSlots} =
      await answerWhileFirstHoldsTheSlot(seedApi,
        joinRequest(NODE_ONE_ID, 19231), joinRequest(NODE_TWO_ID, 19232));
    t.equal(heldSlots, 1, 'the first joiner holds the seed\'s one admission slot');

    t.equal(responseOne.statusCode, 200, 'the admitted joiner is answered');
    t.equal(responseTwo.statusCode, HTTP_STATUS.SERVICE_UNAVAILABLE,
      'the joiner that found the slot held is answered 503');
    const bodyTwo = responseTwo.json();
    t.equal(bodyTwo.code, BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      'with the typed not-ready code');
    t.ok(bodyTwo.reasons?.includes(
      BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED),
    'naming admission backpressure as the reason');
    t.ok(Number.isFinite(bodyTwo.retryAfterMs) && bodyTwo.retryAfterMs > 0,
      `and a positive retryAfterMs (${bodyTwo.retryAfterMs})`);
    t.equal(isRetryableSeedContactCode(bodyTwo.code), true,
      'which the joiner\'s seed-contact owner classifies as retryable');
  });
});
