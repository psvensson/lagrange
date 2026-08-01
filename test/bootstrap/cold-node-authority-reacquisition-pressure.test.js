import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  ContactSeedPhase,
} from '../../src/bootstrap/phases/contact-seed-phase.js';
import {
  isSeedContactPressureEvidence,
} from '../../src/bootstrap/phases/contact-seed-failure-signals.js';
import {
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_READINESS_FIELD,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {
  JOINING_SEED_CONTACT_FAILURE_KIND,
  JOINING_SEED_CONTACT_OUTCOME,
} from '../../src/bootstrap/node-joining-constants.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {
  BootstrapReadinessOwner,
} from '../../src/bootstrap/owners/bootstrap-readiness-owner.js';
import {
  persistBootstrapRejoinHints,
} from '../../src/bootstrap/rejoin-hints.js';
import {
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {ENTRYPOINT_ENV} from '../../src/constants/entrypoint.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  resolveSeedContactUrls,
  resolveStartupJoinDecision,
} from '../../src/entrypoint-runtime-join-decision.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';

const LOCAL_NODE_ID = 'restarted-node';
const LOCAL_NODE_ADDRESS = 'restarted-node:8080';
const EXPLICIT_SEED_ADDRESS = 'seed-primary:8080';
const DURABLE_PEER_A = 'peer-a:8080';
const DURABLE_PEER_B = 'peer-b:8080';
const DURABLE_PEER_B_NODE_ID = 'peer-b-node';
const DURABLE_PEER_B_WS_ADDRESS = 'ws://peer-b:8082';
const NODE_REST_API_PORT = 8080;
const NODE_WS_PORT = 8082;
const CLUSTER_NODE_COUNT = 4;
const PROBE_RESULT_UNREACHABLE = false;
const TRANSPORT_REFUSED_CODE = 'ECONNREFUSED';
const TRANSPORT_REFUSED_MESSAGE = 'connect ECONNREFUSED';
const PRESSURE_PHASE = 'control_plane_recovery';
const PRIMARY_PRESSURE_DELAY_MS = 5;
const MOVE_REPLICA_GROUP_ID = 'mg-cold-rejoin';
const MOVE_REPLICA_REPLICA_ID = 'mg-cold-rejoin-r2';
const MOVE_REPLICA_ASSIGNMENT_ID = 'cold-rejoin-assignment';
const TEST_TMP_PREFIX = 'cold-node-authority-reacquisition-';
const CONTACT_RETRY_CONFIG = Object.freeze({
  httpTimeoutMs: 10,
  leadershipWaitTimeoutMs: 60,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 10,
  leadershipWaitBackoffMultiplier: 2,
  leadershipWaitJitterRatio: 0,
});
const CANONICAL_STARTUP_AUTHORITY = Object.freeze({
  state: 'recovery_pending',
  ready: true,
  authorityAvailable: true,
  publication: Object.freeze({
    observationState: 'published',
  }),
  canonicalStartupNodeIds: Object.freeze([
    'seed-node',
    DURABLE_PEER_B_NODE_ID,
    LOCAL_NODE_ID,
  ]),
});

function createConfig() {
  const values = new Map([
    [CONFIG_KEY.NODE_ID, LOCAL_NODE_ID],
    [CONFIG_KEY.NODE_ADDRESS, LOCAL_NODE_ADDRESS],
    [CONFIG_KEY.NODE_REST_API_PORT, NODE_REST_API_PORT],
    [CONFIG_KEY.NODE_WS_PORT, NODE_WS_PORT],
  ]);
  return {
    get(key) {
      return values.has(key) ? values.get(key) : null;
    },
  };
}

function createDecisionOptions(dataDir, probedAddresses) {
  return {
    cliArgs: {},
    env: {
      [ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: EXPLICIT_SEED_ADDRESS,
    },
    config: createConfig(),
    dataDirectoryManager: {
      getDataDir() {
        return dataDir;
      },
    },
    logger: {
      info() {},
    },
    async probePeerAddress(address) {
      probedAddresses.push(address);
      return PROBE_RESULT_UNREACHABLE;
    },
  };
}

function buildTransportRefusedError() {
  const error = new Error(TRANSPORT_REFUSED_MESSAGE);
  error.code = TRANSPORT_REFUSED_CODE;
  return error;
}

function buildSeedContactPressureError() {
  const response = {
    success: false,
    error: 'Bootstrap request deferred by shared pressure admission',
    code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    phase: PRESSURE_PHASE,
    reasons: [
      BOOTSTRAP_API_PROBE_REASON
        .BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED,
    ],
    retryAfterMs: CONTACT_RETRY_CONFIG.leadershipWaitInitialDelayMs,
    startupAuthority: CANONICAL_STARTUP_AUTHORITY,
  };
  const error = new Error(response.error);
  error.statusCode = 503;
  error.bootstrapResponse = response;
  return error;
}

function createContactFixture(decision, options = {}) {
  let nowMs = 0;
  const state = {
    triedUrls: [],
    seedNodeAddress: null,
    startupAuthority: null,
    bootstrapResponse: null,
    seedNodeId: null,
    seedNodeWsAddress: null,
    seedContactDiagnostics: null,
  };
  const seedContactUrls = resolveSeedContactUrls(decision.seedNodeAddresses);
  const successfulUrl =
    options.successfulAddress === null ?
      null :
      `http://${options.successfulAddress || DURABLE_PEER_B}`;
  const phase = new ContactSeedPhase({
    nodeId: LOCAL_NODE_ID,
    delegates: {
      getSeedNodeAddress: () => seedContactUrls[0],
      getSeedNodeAddresses: () => seedContactUrls,
      getNodeAddress: () => LOCAL_NODE_ADDRESS,
      getJoinStartupMode: () => decision.startupMode,
      getMembershipOwnerOutcome: () => decision.membershipOwnerOutcome,
      getLogger: () => ({
        debug() {},
        warn() {},
        error() {},
      }),
      getConfig: () => CONTACT_RETRY_CONFIG,
      getNow: () => () => nowMs,
      getSleep: () => async (delayMs) => {
        nowMs += delayMs;
      },
      getRandom: () => () => 0,
      getHttpPostImpl: () => async (url) => {
        state.triedUrls.push(url);
        const pressuredAddresses = Array.isArray(options.pressuredAddresses) ?
          options.pressuredAddresses :
          [];
        if (pressuredAddresses.some((address) =>
          url.startsWith(`http://${address}`),
        )) {
          nowMs += PRIMARY_PRESSURE_DELAY_MS;
          throw buildSeedContactPressureError();
        }
        if (!successfulUrl || !url.startsWith(successfulUrl)) {
          throw buildTransportRefusedError();
        }
        return {
          success: true,
          seedNodeId: DURABLE_PEER_B_NODE_ID,
          seedNodeWsAddress: DURABLE_PEER_B_WS_ADDRESS,
          startupAuthority: CANONICAL_STARTUP_AUTHORITY,
        };
      },
      getLastRetryableSeedContactEvidence: () =>
        options.retainedEvidence || null,
      setLastRetryableSeedContactEvidence() {},
      setSeedContactStartupAuthority(value) {
        state.startupAuthority = value;
      },
      setSeedContactDiagnostics(value) {
        state.seedContactDiagnostics = value;
      },
      setBootstrapResponse(value) {
        state.bootstrapResponse = value;
      },
      setSeedNodeAddress(value) {
        state.seedNodeAddress = value;
      },
      setSeedNodeId(value) {
        state.seedNodeId = value;
      },
      getSeedNodeWsAddress: () => state.seedNodeWsAddress,
      setSeedNodeWsAddress(value) {
        state.seedNodeWsAddress = value;
      },
    },
  });
  return {phase, state};
}

test(
  'startup authority consumption retains durable routes after probe pressure',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), TEST_TMP_PREFIX));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    await persistBootstrapRejoinHints({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'joiner',
      peerAddresses: [DURABLE_PEER_A, DURABLE_PEER_B],
      clusterNodeCount: CLUSTER_NODE_COUNT,
    });

    const probedAddresses = [];
    const decision = await resolveStartupJoinDecision(
      createDecisionOptions(dataDir, probedAddresses),
    );

    t.equal(decision.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);
    t.same(
      probedAddresses,
      [DURABLE_PEER_A, DURABLE_PEER_B],
      'the pressure-shaped preflight probe observes every durable route',
    );
    t.same(
      decision.seedNodeAddresses,
      [EXPLICIT_SEED_ADDRESS, DURABLE_PEER_A, DURABLE_PEER_B],
      'the owner handoff keeps explicit and durable routes after probe misses',
    );

    const {phase, state} = createContactFixture(decision, {
      pressuredAddresses: [EXPLICIT_SEED_ADDRESS],
    });
    await phase.phaseContactSeed();

    t.same(
      state.triedUrls,
      [
        `http://${EXPLICIT_SEED_ADDRESS}/bootstrap`,
        `http://${DURABLE_PEER_A}/bootstrap`,
        `http://${DURABLE_PEER_B}/bootstrap`,
      ],
      'bounded contact rotates from the pressured seed through durable peers',
    );
    t.same(
      state.startupAuthority,
      CANONICAL_STARTUP_AUTHORITY,
      'alternate routing consumes the peer response canonical authority',
    );
    t.equal(state.bootstrapResponse?.success, true);
    t.equal(
      state.seedNodeAddress,
      `http://${DURABLE_PEER_B}`,
      'the successful HTTP route becomes the selected tail-consumer endpoint',
    );
    t.equal(state.seedNodeId, DURABLE_PEER_B_NODE_ID);
    t.equal(state.seedNodeWsAddress, DURABLE_PEER_B_WS_ADDRESS);
    t.same(state.seedContactDiagnostics, {
      phase: 'contacting_seed',
      candidateSet: [
        `http://${EXPLICIT_SEED_ADDRESS}`,
        `http://${DURABLE_PEER_A}`,
        `http://${DURABLE_PEER_B}`,
      ],
      currentCandidate: `http://${DURABLE_PEER_B}`,
      attempt: 3,
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.CONTACT_SUCCEEDED,
      remainingBudgetMs: 55,
      authoritySource: `http://${DURABLE_PEER_B}`,
    });
  },
);

test(
  'bounded seed contact pressure stays typed and visible on bootstrap diagnostics',
  async (t) => {
    const decision = {
      seedNodeAddresses: [
        EXPLICIT_SEED_ADDRESS,
        DURABLE_PEER_A,
        DURABLE_PEER_B,
      ],
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      membershipOwnerOutcome: {},
    };
    const {phase, state} = createContactFixture(decision, {
      successfulAddress: null,
      pressuredAddresses: [
        EXPLICIT_SEED_ADDRESS,
        DURABLE_PEER_A,
        DURABLE_PEER_B,
      ],
    });

    const error = await t.rejects(
      phase.phaseContactSeed(),
      'bounded candidate exhaustion must surface a typed pressure outcome',
    );

    t.equal(
      error.code,
      JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_PRESSURE,
    );
    t.equal(
      error.seedContactFailureKind,
      JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_PRESSURE,
    );
    t.same(error.seedContactDiagnostics, {
      phase: 'contacting_seed',
      candidateSet: [
        `http://${EXPLICIT_SEED_ADDRESS}`,
        `http://${DURABLE_PEER_A}`,
        `http://${DURABLE_PEER_B}`,
      ],
      currentCandidate: `http://${EXPLICIT_SEED_ADDRESS}`,
      attempt: 4,
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.SEED_CONTACT_PRESSURE,
      remainingBudgetMs: 30,
      authoritySource: `http://${EXPLICIT_SEED_ADDRESS}`,
    });

    const readinessOwner = new BootstrapReadinessOwner({
      delegates: {
        getBootstrapService: () => ({
          getSeedContactDiagnosticsSnapshot: () =>
            state.seedContactDiagnostics,
        }),
      },
    });
    const bootstrapSurface = {};
    readinessOwner.appendSeedContactDiagnostics(bootstrapSurface);
    t.same(
      bootstrapSurface[BOOTSTRAP_API_READINESS_FIELD.SEED_CONTACT],
      error.seedContactDiagnostics,
      'the reachable bootstrap surface exposes the contact owner snapshot',
    );
  },
);

test(
  'bootstrap diagnostics expose canonical authority and completed recovery as separate witnesses',
  (t) => {
    const readinessOwner = new BootstrapReadinessOwner({
      delegates: {
        getBootstrapService: () => ({
          getSeedContactStartupAuthoritySnapshot: () =>
            CANONICAL_STARTUP_AUTHORITY,
          getSeedContactDiagnosticsSnapshot: () => ({
            authoritySource: `http://${DURABLE_PEER_B}`,
          }),
          getStartupRuntimeHandoffSnapshot: () => ({
            startupBranch: 'join',
            infrastructureJoinComplete: true,
            transactionRecoveryState: 'completed',
            transactionRecoveryReady: true,
          }),
        }),
      },
    });
    const response = {};

    readinessOwner.appendStartupRuntimeHandoffFields(response);

    t.same(
      response[BOOTSTRAP_API_READINESS_FIELD.STARTUP_RUNTIME_HANDOFF],
      {
        startupBranch: 'join',
        infrastructureJoinComplete: true,
        canonicalAuthorityConsumed: true,
        canonicalAuthorityState: CANONICAL_STARTUP_AUTHORITY.state,
        canonicalAuthoritySource: `http://${DURABLE_PEER_B}`,
        transactionRecoveryState: 'completed',
        transactionRecoveryReady: true,
        transactionRecoveryOutcome: null,
        ready: true,
      },
      'the direct target proves each owner handoff instead of one aggregate ready bit',
    );
    t.end();
  },
);

test(
  'transport exhaustion stays distinct from shared seed contact pressure',
  async (t) => {
    const decision = {
      seedNodeAddresses: [
        EXPLICIT_SEED_ADDRESS,
        DURABLE_PEER_A,
        DURABLE_PEER_B,
      ],
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      membershipOwnerOutcome: {},
    };
    const {phase} = createContactFixture(decision, {
      successfulAddress: null,
    });

    const error = await t.rejects(phase.phaseContactSeed());
    t.equal(
      error.code,
      JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_UNAVAILABLE,
    );
    t.equal(
      error.seedContactFailureKind,
      JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_UNAVAILABLE,
    );
    t.equal(
      error.seedContactDiagnostics.lastOutcome,
      JOINING_SEED_CONTACT_OUTCOME.SEED_CONTACT_UNAVAILABLE,
    );
    t.ok(
      error.seedContactDiagnostics.attempt >=
        decision.seedNodeAddresses.length,
      'bounded transport failure visits every eligible candidate',
    );
  },
);

test(
  'retained pressure evidence does not relabel current transport exhaustion',
  async (t) => {
    const retainedPressureEvidence =
      buildSeedContactPressureError().bootstrapResponse;
    const decision = {
      seedNodeAddresses: [EXPLICIT_SEED_ADDRESS],
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      membershipOwnerOutcome: {},
    };
    const {phase} = createContactFixture(decision, {
      successfulAddress: null,
      retainedEvidence: retainedPressureEvidence,
    });

    const error = await t.rejects(phase.phaseContactSeed());
    t.equal(
      error.message,
      `Failed to contact seed node: ${TRANSPORT_REFUSED_MESSAGE}`,
      'the current transport failure remains the surfaced context',
    );
    t.equal(
      error.code,
      JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_UNAVAILABLE,
    );
    t.equal(
      error.seedContactFailureKind,
      JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_UNAVAILABLE,
    );
    t.equal(
      error.seedContactDiagnostics.lastOutcome,
      JOINING_SEED_CONTACT_OUTCOME.SEED_CONTACT_UNAVAILABLE,
    );
    t.same(
      error.bootstrapResponse,
      retainedPressureEvidence,
      'retained bootstrap pressure remains attached as provenance',
    );
    t.equal(
      isSeedContactPressureEvidence({pressureAction: ''}),
      false,
      'an empty action cannot mint a pressure outcome',
    );
    t.equal(
      isSeedContactPressureEvidence({pressureReason: ''}),
      false,
      'an empty reason cannot mint a pressure outcome',
    );
  },
);

test(
  'successful alternate route rebinds MOVE_REPLICA registration tail',
  async (t) => {
    initializeTestEnvironment();
    const originalGetNodeService = NodeService.getInstance;
    NodeService.getInstance = () => ({
      getSystemTableCache: () => null,
    });
    t.teardown(() => {
      NodeService.getInstance = originalGetNodeService;
    });

    let nowMs = 0;
    const contactedUrls = [];
    const seedContactUrls = resolveSeedContactUrls([
      EXPLICIT_SEED_ADDRESS,
      DURABLE_PEER_A,
      DURABLE_PEER_B,
    ]);
    const service = new NodeJoiningService({
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      seedNodeAddress: seedContactUrls[0],
      seedNodeAddresses: seedContactUrls,
      config: CONTACT_RETRY_CONFIG,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
      random: () => 0,
      httpPost: async (url) => {
        contactedUrls.push(url);
        if (url.endsWith('/register-service')) {
          return {success: true};
        }
        if (url.startsWith(`http://${EXPLICIT_SEED_ADDRESS}`)) {
          nowMs += PRIMARY_PRESSURE_DELAY_MS;
          throw buildSeedContactPressureError();
        }
        if (url.startsWith(`http://${DURABLE_PEER_A}`)) {
          throw buildTransportRefusedError();
        }
        return {
          success: true,
          seedNodeId: DURABLE_PEER_B_NODE_ID,
          seedNodeWsAddress: DURABLE_PEER_B_WS_ADDRESS,
          startupAuthority: CANONICAL_STARTUP_AUTHORITY,
          messageGroupAssignment: {
            strategy: AssignmentStrategy.MOVE_REPLICA,
            groupId: MOVE_REPLICA_GROUP_ID,
            replicaToMove: MOVE_REPLICA_REPLICA_ID,
            assignmentId: MOVE_REPLICA_ASSIGNMENT_ID,
          },
        };
      },
    });

    await service.phaseContactSeed();
    await service.registerMessageGroupService(
      MOVE_REPLICA_GROUP_ID,
      MOVE_REPLICA_REPLICA_ID,
      {getRole: () => 'leader'},
    );

    t.equal(service.seedNodeAddress, `http://${DURABLE_PEER_B}`);
    t.equal(
      contactedUrls.at(-1),
      `http://${DURABLE_PEER_B}/register-service`,
      'non-shortcut registration follows the canonical response route',
    );
  },
);
