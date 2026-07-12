/**
 * Fresh-join multi-peer contact guard tests.
 *
 * Quest: fresh-join-multi-peer-contact — a fresh-joining node accepts
 * multiple candidate contact addresses (comma-separated SEED_NODE_ADDRESS /
 * --seed), probes them for reachability exactly like the durable-rejoin
 * path, and ContactSeedPhase rotates across the candidate list on retry so
 * a fresh join succeeds through any live cluster node.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {ENTRYPOINT_ENV} from '../../src/constants/entrypoint.js';
import {
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  SEED_CANDIDATE_SELECTION_STATE,
  parseSeedNodeAddressCandidates,
  resolveSeedContactUrls,
  resolveStartupJoinDecision,
  selectSeedNodeAddressCandidate,
} from '../../src/entrypoint-runtime-join-decision.js';
import {
  ContactSeedPhase,
} from '../../src/bootstrap/phases/contact-seed-phase.js';
import {
  JOINING_ERROR_MSG,
  JOINING_HTTP,
} from '../../src/bootstrap/node-joining-constants.js';

const TEST_NODE_ID = 'node-local';
const TEST_NODE_ADDRESS = 'node-local:8080';
const TEST_NODE_REST_API_PORT = 8080;
const TEST_NODE_WS_PORT = 8082;
const TEST_DECISION_SOURCE_EXPLICIT = 'explicit';
const CANDIDATE_A = 'seed-a:8080';
const CANDIDATE_B = 'seed-b:8080';
const CANDIDATE_C = 'seed-c:8080';
const CONTACT_DEAD_ADDRESS = 'http://seed-dead:8080';
const CONTACT_LIVE_ADDRESS = 'http://seed-live:8080';
const CONTACT_SEED_NODE_ID = 'seed-live-node';
const CONTACT_SEED_WS_ADDRESS = 'ws://seed-live:8082';
const TRANSPORT_REFUSED_CODE = 'ECONNREFUSED';
const TRANSPORT_REFUSED_MESSAGE = 'connect ECONNREFUSED';
const TMP_PREFIX = 'fresh-join-multi-peer-contact-';
const CONTACT_TEST_CONFIG = Object.freeze({
  httpTimeoutMs: 1000,
  leadershipWaitTimeoutMs: 5000,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 20,
  leadershipWaitBackoffMultiplier: 2,
  leadershipWaitJitterRatio: 0,
});

function createConfig() {
  const values = new Map([
    [CONFIG_KEY.NODE_ID, TEST_NODE_ID],
    [CONFIG_KEY.NODE_ADDRESS, TEST_NODE_ADDRESS],
    [CONFIG_KEY.NODE_REST_API_PORT, TEST_NODE_REST_API_PORT],
    [CONFIG_KEY.NODE_WS_PORT, TEST_NODE_WS_PORT],
  ]);
  return {
    get(key) {
      return values.has(key) ? values.get(key) : null;
    },
  };
}

function createRecordingProbe(reachableAddresses) {
  const probedAddresses = [];
  const probe = async (peerAddress) => {
    probedAddresses.push(peerAddress);
    return reachableAddresses.includes(peerAddress);
  };
  return {probe, probedAddresses};
}

function createDecisionOptions(dataDir, env, probePeerAddress) {
  return {
    cliArgs: {},
    env,
    config: createConfig(),
    dataDirectoryManager: {
      getDataDir() {
        return dataDir;
      },
    },
    logger: {
      info() {},
    },
    probePeerAddress,
  };
}

function createContactPhaseFixture(options) {
  const state = {
    bootstrapResponse: null,
    seedNodeId: null,
    seedNodeWsAddress: null,
    triedUrls: [],
  };
  const httpPost = async (url) => {
    state.triedUrls.push(url);
    return options.respond(url);
  };
  const phase = new ContactSeedPhase({
    nodeId: TEST_NODE_ID,
    delegates: {
      getSeedNodeAddress: () => options.seedNodeAddress ?? null,
      getSeedNodeAddresses: () => options.seedNodeAddresses,
      getNodeAddress: () => TEST_NODE_ADDRESS,
      getJoinStartupMode: () => STARTUP_JOIN_MODE.FRESH_JOIN,
      getLogger: () => ({
        debug() {},
        warn() {},
        error() {},
      }),
      getConfig: () => CONTACT_TEST_CONFIG,
      getNow: () => () => Date.now(),
      getSleep: () => async () => {},
      getRandom: () => () => 0,
      getHttpPostImpl: () => httpPost,
      setBootstrapResponse: (value) => {
        state.bootstrapResponse = value;
      },
      setSeedNodeId: (value) => {
        state.seedNodeId = value;
      },
      getSeedNodeWsAddress: () => state.seedNodeWsAddress,
      setSeedNodeWsAddress: (value) => {
        state.seedNodeWsAddress = value;
      },
    },
  });
  return {phase, state};
}

function buildTransportRefusedError() {
  const error = new Error(TRANSPORT_REFUSED_MESSAGE);
  error.code = TRANSPORT_REFUSED_CODE;
  return error;
}

function buildBootstrapSuccessResponse() {
  return {
    success: true,
    seedNodeId: CONTACT_SEED_NODE_ID,
    seedNodeWsAddress: CONTACT_SEED_WS_ADDRESS,
  };
}

test('parseSeedNodeAddressCandidates parses candidate lists', async (t) => {
  t.same(
    parseSeedNodeAddressCandidates(CANDIDATE_A),
    [CANDIDATE_A],
    'single candidate parses to a one-entry list',
  );
  t.same(
    parseSeedNodeAddressCandidates(
      `${CANDIDATE_A},${CANDIDATE_B},${CANDIDATE_C}`,
    ),
    [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C],
    'comma-separated candidates keep declaration order',
  );
  t.same(
    parseSeedNodeAddressCandidates(`  ${CANDIDATE_A} , ${CANDIDATE_B}  `),
    [CANDIDATE_A, CANDIDATE_B],
    'entries are trimmed',
  );
  t.same(
    parseSeedNodeAddressCandidates(`${CANDIDATE_A},,${CANDIDATE_B},`),
    [CANDIDATE_A, CANDIDATE_B],
    'empty entries are dropped',
  );
  t.same(
    parseSeedNodeAddressCandidates(''),
    [],
    'empty input yields an empty list',
  );
  t.same(
    parseSeedNodeAddressCandidates(undefined),
    [],
    'absent input yields an empty list',
  );
});

test('resolveSeedContactUrls preserves explicit schemes', async (t) => {
  t.same(
    resolveSeedContactUrls([
      'seed-a:8080',
      'http://seed-b:8080',
      'https://seed-c:8443',
      'httpd-host:8080',
    ]),
    [
      'http://seed-a:8080',
      'http://seed-b:8080',
      'https://seed-c:8443',
      'http://httpd-host:8080',
    ],
    'bare addresses get http://, explicit http/https pass through, ' +
      'hostnames merely starting with "http" are still prefixed',
  );
});

test('selectSeedNodeAddressCandidate skips probing for one candidate', async (t) => {
  const {probe, probedAddresses} = createRecordingProbe([CANDIDATE_A]);
  const selection = await selectSeedNodeAddressCandidate({
    candidates: [CANDIDATE_A],
    probePeerAddress: probe,
  });
  t.same(probedAddresses, [], 'single candidate is never probed');
  t.same(selection, {
    state: SEED_CANDIDATE_SELECTION_STATE.SINGLE_CANDIDATE,
    seedNodeAddress: CANDIDATE_A,
    seedNodeAddresses: [CANDIDATE_A],
  });
});

test('selectSeedNodeAddressCandidate picks first reachable candidate', async (t) => {
  const {probe, probedAddresses} = createRecordingProbe([CANDIDATE_A]);
  const selection = await selectSeedNodeAddressCandidate({
    candidates: [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C],
    probePeerAddress: probe,
  });
  t.same(probedAddresses, [CANDIDATE_A], 'probing stops at first hit');
  t.same(selection, {
    state: SEED_CANDIDATE_SELECTION_STATE.PROBED_REACHABLE,
    seedNodeAddress: CANDIDATE_A,
    seedNodeAddresses: [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C],
  });
});

test('selectSeedNodeAddressCandidate falls over to a later live candidate', async (t) => {
  const {probe, probedAddresses} = createRecordingProbe([CANDIDATE_B]);
  const selection = await selectSeedNodeAddressCandidate({
    candidates: [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C],
    probePeerAddress: probe,
  });
  t.same(
    probedAddresses,
    [CANDIDATE_A, CANDIDATE_B],
    'candidates are probed in declaration order',
  );
  t.same(selection, {
    state: SEED_CANDIDATE_SELECTION_STATE.PROBED_REACHABLE,
    seedNodeAddress: CANDIDATE_B,
    seedNodeAddresses: [CANDIDATE_B, CANDIDATE_A, CANDIDATE_C],
  });
});

test('selectSeedNodeAddressCandidate keeps first candidate when none answer', async (t) => {
  const {probe, probedAddresses} = createRecordingProbe([]);
  const selection = await selectSeedNodeAddressCandidate({
    candidates: [CANDIDATE_A, CANDIDATE_B],
    probePeerAddress: probe,
  });
  t.same(
    probedAddresses,
    [CANDIDATE_A, CANDIDATE_B],
    'all candidates were probed before falling back',
  );
  t.same(selection, {
    state: SEED_CANDIDATE_SELECTION_STATE.UNPROBED_FALLBACK,
    seedNodeAddress: CANDIDATE_A,
    seedNodeAddresses: [CANDIDATE_A, CANDIDATE_B],
  });
});

test('resolveStartupJoinDecision selects a reachable fresh-join candidate', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const {probe} = createRecordingProbe([CANDIDATE_B]);
  const decision = await resolveStartupJoinDecision(
    createDecisionOptions(dataDir, {
      [ENTRYPOINT_ENV.SEED_NODE_ADDRESS]:
        `${CANDIDATE_A},${CANDIDATE_B},${CANDIDATE_C}`,
    }, probe),
  );

  t.match(decision, {
    seedNodeAddress: CANDIDATE_B,
    startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
    source: TEST_DECISION_SOURCE_EXPLICIT,
  });
  t.same(
    decision.seedNodeAddresses,
    [CANDIDATE_B, CANDIDATE_A, CANDIDATE_C],
    'selected candidate leads; remaining keep original order',
  );
});

test('resolveStartupJoinDecision keeps first candidate when none probe reachable', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const {probe} = createRecordingProbe([]);
  const decision = await resolveStartupJoinDecision(
    createDecisionOptions(dataDir, {
      [ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: `${CANDIDATE_A},${CANDIDATE_B}`,
    }, probe),
  );

  t.match(decision, {
    seedNodeAddress: CANDIDATE_A,
    startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
    source: TEST_DECISION_SOURCE_EXPLICIT,
  });
  t.same(decision.seedNodeAddresses, [CANDIDATE_A, CANDIDATE_B]);
});

test('resolveStartupJoinDecision keeps legacy single-candidate shape', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const {probe, probedAddresses} = createRecordingProbe([]);
  const decision = await resolveStartupJoinDecision(
    createDecisionOptions(dataDir, {
      [ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: CANDIDATE_A,
    }, probe),
  );

  t.same(probedAddresses, [], 'single explicit seed is never probed');
  t.match(decision, {
    seedNodeAddress: CANDIDATE_A,
    startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
    source: TEST_DECISION_SOURCE_EXPLICIT,
  });
  t.same(decision.seedNodeAddresses, [CANDIDATE_A]);
});

test('ContactSeedPhase rotates to the next candidate on retry', async (t) => {
  const {phase, state} = createContactPhaseFixture({
    seedNodeAddresses: [CONTACT_DEAD_ADDRESS, CONTACT_LIVE_ADDRESS],
    respond(url) {
      if (url.startsWith(CONTACT_DEAD_ADDRESS)) {
        throw buildTransportRefusedError();
      }
      return buildBootstrapSuccessResponse();
    },
  });

  await phase.phaseContactSeed();

  t.same(
    state.triedUrls,
    [
      `${CONTACT_DEAD_ADDRESS}${JOINING_HTTP.BOOTSTRAP_PATH}`,
      `${CONTACT_LIVE_ADDRESS}${JOINING_HTTP.BOOTSTRAP_PATH}`,
    ],
    'first candidate refused, retry rotated to the second candidate',
  );
  t.equal(state.seedNodeId, CONTACT_SEED_NODE_ID);
  t.equal(state.bootstrapResponse?.success, true);
  t.equal(state.seedNodeWsAddress, CONTACT_SEED_WS_ADDRESS);
});

test('ContactSeedPhase keeps a single candidate pinned across retries', async (t) => {
  let failuresRemaining = 2;
  const {phase, state} = createContactPhaseFixture({
    seedNodeAddresses: [CONTACT_LIVE_ADDRESS],
    respond() {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw buildTransportRefusedError();
      }
      return buildBootstrapSuccessResponse();
    },
  });

  await phase.phaseContactSeed();

  const pinnedUrl = `${CONTACT_LIVE_ADDRESS}${JOINING_HTTP.BOOTSTRAP_PATH}`;
  t.same(
    state.triedUrls,
    [pinnedUrl, pinnedUrl, pinnedUrl],
    'single-candidate retries re-contact the same URL (legacy sequence)',
  );
  t.equal(state.bootstrapResponse?.success, true);
});

test('ContactSeedPhase falls back to the legacy single seed delegate', async (t) => {
  const {phase, state} = createContactPhaseFixture({
    seedNodeAddresses: undefined,
    seedNodeAddress: CONTACT_LIVE_ADDRESS,
    respond() {
      return buildBootstrapSuccessResponse();
    },
  });

  await phase.phaseContactSeed();

  t.same(
    state.triedUrls,
    [`${CONTACT_LIVE_ADDRESS}${JOINING_HTTP.BOOTSTRAP_PATH}`],
    'legacy getSeedNodeAddress wiring still contacts the seed',
  );
});

test('ContactSeedPhase requires at least one candidate', async (t) => {
  const {phase} = createContactPhaseFixture({
    seedNodeAddresses: [],
    seedNodeAddress: null,
    respond() {
      return buildBootstrapSuccessResponse();
    },
  });

  await t.rejects(
    phase.phaseContactSeed(),
    new Error(JOINING_ERROR_MSG.SEED_NODE_ADDRESS_REQUIRED),
  );
});
