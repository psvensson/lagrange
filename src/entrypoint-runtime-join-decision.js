import {
  AUTO_REJOIN_DECISION_STATE,
  RejoinHintsPersistenceService,
  persistBootstrapRejoinHints,
  probeRecoverablePeerAddress,
  readPersistedLocalClusterId,
  resolveAutoRejoinStartupDecision,
} from './bootstrap/rejoin-hints.js';
import {
  FORCE_NEW_CLUSTER_ENV,
  MEMBERSHIP_OWNER_EVIDENCE_SOURCE,
  MEMBERSHIP_OWNER_REASON,
  STARTUP_JOIN_MODE,
} from './bootstrap/rejoin-hints-constants.js';
import {CONFIG_KEY} from './config/config-constants.js';
import {
  buildMembershipOwnerOutcome,
} from './control-plane/membership-lifecycle-controller.js';
import {
  ENTRYPOINT_DEFAULT,
  ENTRYPOINT_ENV,
  ENTRYPOINT_LOG_MSG,
  ENTRYPOINT_RUNTIME_VALUE,
} from './constants/entrypoint.js';
import {HTTP_STATUS, STRING} from './constants/index.js';
import {resolveRuntimeAddresses} from './entrypoint-runtime-options.js';


const STARTUP_JOIN_DECISION_SOURCE = Object.freeze({
  EXPLICIT: 'explicit',
});

const STARTUP_JOIN_DECISION_MODE = Object.freeze({
  FAIL: 'fail',
  JOIN: 'join',
});

const EXPLICIT_SEED_DECISION_STATE = Object.freeze({
  IDENTITY_MISMATCH: 'identity_mismatch',
  DURABLE_PROBED_PEER: 'durable_probed_peer',
  DURABLE_EXPLICIT_SEED: 'durable_explicit_seed',
  FRESH_EXPLICIT_SEED: 'fresh_explicit_seed',
});

const FORCE_NEW_CLUSTER_ENABLED_VALUE = '1';

function normalizeForceNewClusterEnv(value) {
  return typeof value === 'string' &&
    value.trim() === FORCE_NEW_CLUSTER_ENABLED_VALUE;
}

const EXPLICIT_SEED_DECISION_TABLE = Object.freeze([
  Object.freeze({
    state: EXPLICIT_SEED_DECISION_STATE.IDENTITY_MISMATCH,
    matches: (snapshot) => snapshot.identityMismatch === true,
  }),
  Object.freeze({
    state: EXPLICIT_SEED_DECISION_STATE.DURABLE_PROBED_PEER,
    matches: (snapshot) =>
      snapshot.hasDurablePeerAddress === true &&
      snapshot.autoRejoinState === AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER,
  }),
  Object.freeze({
    state: EXPLICIT_SEED_DECISION_STATE.DURABLE_EXPLICIT_SEED,
    matches: (snapshot) =>
      snapshot.autoRejoinStartupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN,
  }),
  Object.freeze({
    state: EXPLICIT_SEED_DECISION_STATE.FRESH_EXPLICIT_SEED,
    matches: () => true,
  }),
]);
const UNKNOWN_EXPLICIT_SEED_DECISION_STATE_ERROR_PREFIX =
  'Unknown explicit seed startup decision state: ';

const SEED_CANDIDATE_SELECTION_STATE = Object.freeze({
  SINGLE_CANDIDATE: 'single_candidate',
  PROBED_REACHABLE: 'probed_reachable',
  UNPROBED_FALLBACK: 'unprobed_fallback',
});

/**
 * Parse a comma-separated seed-address value into a candidate list.
 * @param {string|undefined} rawValue
 * @return {string[]}
 */
function parseSeedNodeAddressCandidates(rawValue) {
  return String(rawValue || STRING.EMPTY)
    .split(ENTRYPOINT_DEFAULT.SEED_ADDRESS_CANDIDATE_SEPARATOR)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
}

function mergeSeedNodeAddressCandidates(...candidateGroups) {
  return Array.from(new Set(
    candidateGroups
      .flatMap((candidates) => Array.isArray(candidates) ? candidates : [])
      .filter((candidate) =>
        typeof candidate === 'string' && candidate.length > 0,
      ),
  ));
}

/**
 * Select the fresh-join contact candidate from an explicit candidate list.
 *
 * A single candidate is returned verbatim without probing: during cluster
 * formation the seed may not be up yet, and ContactSeedPhase's retry loop is
 * the liveness mechanism. With multiple candidates the same reachability
 * probe used by durable rejoin picks the first live one; when none answers,
 * the first candidate is kept (formation semantics — the retry loop keeps
 * trying, it does not fail closed).
 * @param {Object} options
 * @param {string[]} options.candidates
 * @param {Function} options.probePeerAddress
 * @return {Promise<Object>}
 */
async function selectSeedNodeAddressCandidate(options) {
  const candidates = options.candidates;
  if (candidates.length === 1) {
    return {
      state: SEED_CANDIDATE_SELECTION_STATE.SINGLE_CANDIDATE,
      seedNodeAddress: candidates[0],
      seedNodeAddresses: [...candidates],
    };
  }
  const reachableCandidate = await probeRecoverablePeerAddress(
    candidates,
    options.probePeerAddress,
  );
  const selectedCandidate = reachableCandidate === null ?
    candidates[0] :
    reachableCandidate;
  return {
    state: reachableCandidate === null ?
      SEED_CANDIDATE_SELECTION_STATE.UNPROBED_FALLBACK :
      SEED_CANDIDATE_SELECTION_STATE.PROBED_REACHABLE,
    seedNodeAddress: selectedCandidate,
    seedNodeAddresses: [
      selectedCandidate,
      ...candidates.filter((candidate) => candidate !== selectedCandidate),
    ],
  };
}

/**
 * Map seed contact candidates to bootstrap-contact URLs.
 * @param {string[]} seedNodeAddresses
 * @return {string[]}
 */
function resolveSeedContactUrls(seedNodeAddresses) {
  return seedNodeAddresses.map((seedNodeAddress) =>
    seedNodeAddress.startsWith(ENTRYPOINT_DEFAULT.HTTP_PREFIX) ||
    seedNodeAddress.startsWith(ENTRYPOINT_DEFAULT.HTTPS_PREFIX) ?
      seedNodeAddress :
      `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${seedNodeAddress}`,
  );
}

/**
 * Persist join-time rejoin hints; failures are logged, never fatal.
 * @param {Object} options
 * @return {Promise<void>}
 */
async function persistJoinSeedRejoinHints(options) {
  try {
    await persistBootstrapRejoinHints({
      dataDir: options.dataDir,
      nodeId: options.nodeId,
      nodeAddress: options.nodeAddress,
      nodeRole: ENTRYPOINT_RUNTIME_VALUE.JOINER,
      peerAddresses: options.peerAddresses,
      clusterId: options.clusterId || null,
      clusterNodeCount: ENTRYPOINT_DEFAULT.JOIN_HINT_CLUSTER_NODE_COUNT,
    });
  } catch (error) {
    options.logger.warn(
      ENTRYPOINT_RUNTIME_VALUE.FAILED_TO_PERSIST_BOOTSTRAP_REJOIN_HINTS,
      {
        nodeId: options.nodeId,
        dataDir: options.dataDir,
        error: error.message,
      },
    );
  }
}

/**
 * Probe one persisted peer address for auto-rejoin.
 * @param {string} peerAddress
 * @return {Promise<boolean>}
 */
async function probeAutoRejoinPeerAddress(peerAddress) {
  const normalizedPeerAddress = String(peerAddress || '');
  if (normalizedPeerAddress.length === 0) {
    return false;
  }

  const baseUrl =
    normalizedPeerAddress.startsWith(ENTRYPOINT_DEFAULT.HTTP_PREFIX) ||
    normalizedPeerAddress.startsWith(ENTRYPOINT_DEFAULT.HTTPS_PREFIX) ?
      normalizedPeerAddress :
      `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${normalizedPeerAddress}`;

  const bootstrapReadyProbe = await probeAutoRejoinPeerPath(
    baseUrl,
    ENTRYPOINT_DEFAULT.AUTO_REJOIN_BOOTSTRAP_READY_PATH,
  );
  if (bootstrapReadyProbe.ready === true) {
    return true;
  }
  if (bootstrapReadyProbe.legacyFallback !== true) {
    return false;
  }

  const healthProbe = await probeAutoRejoinPeerPath(
    baseUrl,
    ENTRYPOINT_DEFAULT.AUTO_REJOIN_HEALTH_PATH,
  );
  return healthProbe.ready === true;
}

/**
 * Probe one peer path used by auto-rejoin peer selection.
 * @param {string} baseUrl
 * @param {string} path
 * @return {Promise<Object>}
 */
async function probeAutoRejoinPeerPath(baseUrl, path) {
  try {
    const response = await fetch(
      `${baseUrl}${path}`,
      {
        method: ENTRYPOINT_DEFAULT.AUTO_REJOIN_PROBE_METHOD,
        signal: globalThis.AbortSignal.timeout(
          ENTRYPOINT_DEFAULT.AUTO_REJOIN_PROBE_TIMEOUT_MS,
        ),
      },
    );
    return {
      ready: response.ok,
      legacyFallback: response.status === HTTP_STATUS.NOT_FOUND,
    };
  } catch (_error) {
    return {
      ready: false,
      legacyFallback: false,
    };
  }
}

/**
 * Normalize explicit-seed startup evidence into one decision snapshot.
 * @param {Object} autoRejoinDecision
 * @return {Object}
 */
function buildExplicitSeedDecisionSnapshot(autoRejoinDecision) {
  const peerAddress =
    typeof autoRejoinDecision?.peerAddress === 'string' &&
    autoRejoinDecision.peerAddress.length > 0 ?
      autoRejoinDecision.peerAddress :
      STRING.EMPTY;
  const hasDurablePeerAddress =
    autoRejoinDecision?.mode === STARTUP_JOIN_DECISION_MODE.JOIN &&
    autoRejoinDecision?.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN &&
    typeof peerAddress === 'string' &&
    peerAddress.length > 0;

  return {
    identityMismatch: autoRejoinDecision?.identityMismatch === true,
    autoRejoinState: autoRejoinDecision?.state || STRING.EMPTY,
    autoRejoinStartupMode:
      autoRejoinDecision?.startupMode || STRING.EMPTY,
    peerAddress,
    peerAddresses: mergeSeedNodeAddressCandidates(
      [peerAddress],
      autoRejoinDecision?.peerAddresses,
    ),
    hasDurablePeerAddress,
    source: autoRejoinDecision?.source || STRING.EMPTY,
  };
}

/**
 * Resolve the explicit-seed decision state from a normalized snapshot.
 * @param {Object} snapshot
 * @return {string}
 */
function resolveExplicitSeedDecisionState(snapshot) {
  return EXPLICIT_SEED_DECISION_TABLE.find((candidate) =>
    candidate.matches(snapshot),
  ).state;
}

/**
 * Build the startup decision when an operator-provided seed is available.
 * @param {Object} options
 * @param {Object} options.autoRejoinDecision
 * @param {string} options.explicitSeedNodeAddress
 * @param {string[]} options.explicitSeedNodeAddresses
 * @return {Object}
 */
function buildExplicitSeedStartupDecision(options) {
  const autoRejoinDecision = options.autoRejoinDecision;
  const explicitSeedNodeAddress = options.explicitSeedNodeAddress;
  const explicitSeedNodeAddresses = options.explicitSeedNodeAddresses;
  const snapshot = buildExplicitSeedDecisionSnapshot(autoRejoinDecision);
  const state = resolveExplicitSeedDecisionState(snapshot);

  switch (state) {
  case EXPLICIT_SEED_DECISION_STATE.IDENTITY_MISMATCH:
    throw new Error(autoRejoinDecision.error);
  case EXPLICIT_SEED_DECISION_STATE.DURABLE_PROBED_PEER:
    return {
      seedNodeAddress: snapshot.peerAddress,
      seedNodeAddresses: mergeSeedNodeAddressCandidates(
        snapshot.peerAddresses,
        explicitSeedNodeAddresses,
      ),
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: snapshot.source,
      membershipOwnerOutcome: autoRejoinDecision.membershipOwnerOutcome,
    };
  case EXPLICIT_SEED_DECISION_STATE.DURABLE_EXPLICIT_SEED:
    return {
      seedNodeAddress: explicitSeedNodeAddress,
      seedNodeAddresses: mergeSeedNodeAddressCandidates(
        explicitSeedNodeAddresses,
        snapshot.peerAddresses,
      ),
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: STARTUP_JOIN_DECISION_SOURCE.EXPLICIT,
      membershipOwnerOutcome: buildMembershipOwnerOutcome({
        startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        reasonCode: MEMBERSHIP_OWNER_REASON.EXPLICIT_SEED,
        evidenceSource: MEMBERSHIP_OWNER_EVIDENCE_SOURCE.EXPLICIT,
      }),
    };
  case EXPLICIT_SEED_DECISION_STATE.FRESH_EXPLICIT_SEED:
    return {
      seedNodeAddress: explicitSeedNodeAddress,
      seedNodeAddresses: explicitSeedNodeAddresses,
      startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
      source: STARTUP_JOIN_DECISION_SOURCE.EXPLICIT,
      membershipOwnerOutcome: buildMembershipOwnerOutcome({
        startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
        reasonCode: MEMBERSHIP_OWNER_REASON.EXPLICIT_SEED,
        evidenceSource: MEMBERSHIP_OWNER_EVIDENCE_SOURCE.EXPLICIT,
      }),
    };
  default:
    throw new Error(
      UNKNOWN_EXPLICIT_SEED_DECISION_STATE_ERROR_PREFIX + String(state),
    );
  }
}

/**
 * Resolve one startup join decision from explicit config or persisted hints.
 * @param {Object} options
 * @return {Promise<Object>}
 */
async function resolveStartupJoinDecision(options) {
  const explicitSeedNodeAddress = options.cliArgs.seedNodeAddress ||
    options.env[ENTRYPOINT_ENV.SEED_NODE_ADDRESS];
  const explicitSeedCandidates =
    parseSeedNodeAddressCandidates(explicitSeedNodeAddress);
  const probePeerAddress =
    typeof options.probePeerAddress === 'function' ?
      options.probePeerAddress :
      probeAutoRejoinPeerAddress;
  const nodeId = options.config.get(CONFIG_KEY.NODE_ID);
  const {nodeHttpAddress} = resolveRuntimeAddresses(options.config);
  const expectedClusterId = await readPersistedLocalClusterId(
    options.dataDirectoryManager.getDataDir(),
  );
  const autoRejoinDecision = await resolveAutoRejoinStartupDecision({
    dataDir: options.dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: nodeHttpAddress,
    probePeerAddress,
    expectedClusterId,
    forceNewCluster:
      normalizeForceNewClusterEnv(options.env[FORCE_NEW_CLUSTER_ENV]),
  });
  options.logger.info(ENTRYPOINT_LOG_MSG.AUTO_REJOIN_DECISION, {
    nodeId,
    nodeAddress: nodeHttpAddress,
    explicitSeedNodeAddress: explicitSeedNodeAddress || null,
    state: autoRejoinDecision.state,
    mode: autoRejoinDecision.mode,
    source: autoRejoinDecision.source,
    startupMode: autoRejoinDecision.startupMode,
    peerAddressState: autoRejoinDecision.peerAddressState,
    peerAddress: autoRejoinDecision.peerAddress || null,
    peerAddresses: autoRejoinDecision.peerAddresses,
    durableStateDetected: autoRejoinDecision.durableStateDetected === true,
    identityMismatch: autoRejoinDecision.identityMismatch === true,
  });
  if (explicitSeedCandidates.length > 0) {
    const seedCandidateSelection = await selectSeedNodeAddressCandidate({
      candidates: explicitSeedCandidates,
      probePeerAddress,
    });
    if (seedCandidateSelection.state !==
        SEED_CANDIDATE_SELECTION_STATE.SINGLE_CANDIDATE) {
      options.logger.info(ENTRYPOINT_LOG_MSG.SEED_CANDIDATE_SELECTED, {
        nodeId,
        selectionState: seedCandidateSelection.state,
        seedNodeAddress: seedCandidateSelection.seedNodeAddress,
        seedNodeAddresses: seedCandidateSelection.seedNodeAddresses,
      });
    }
    return buildExplicitSeedStartupDecision({
      autoRejoinDecision,
      explicitSeedNodeAddress: seedCandidateSelection.seedNodeAddress,
      explicitSeedNodeAddresses: seedCandidateSelection.seedNodeAddresses,
    });
  }
  if (autoRejoinDecision.mode === STARTUP_JOIN_DECISION_MODE.FAIL) {
    throw new Error(autoRejoinDecision.error);
  }
  if (autoRejoinDecision.mode !== STARTUP_JOIN_DECISION_MODE.JOIN) {
    return {
      seedNodeAddress: null,
      seedNodeAddresses: [],
      startupMode: STARTUP_JOIN_MODE.SEED,
      source: autoRejoinDecision.source,
      membershipOwnerOutcome: autoRejoinDecision.membershipOwnerOutcome,
    };
  }

  options.logger.info(ENTRYPOINT_LOG_MSG.AUTO_REJOINING_CLUSTER, {
    nodeId,
    peerAddress: autoRejoinDecision.peerAddress,
    peerAddresses: autoRejoinDecision.peerAddresses,
    source: autoRejoinDecision.source,
    startupMode: autoRejoinDecision.startupMode,
  });
  return {
    seedNodeAddress: autoRejoinDecision.peerAddress,
    seedNodeAddresses: autoRejoinDecision.peerAddresses,
    startupMode: autoRejoinDecision.startupMode,
    source: autoRejoinDecision.source,
    membershipOwnerOutcome: autoRejoinDecision.membershipOwnerOutcome,
  };
}

/**
 * Start durable rejoin-hint persistence for the current runtime.
 * @param {Object} options
 * @return {RejoinHintsPersistenceService}
 */
function startRejoinHintsPersistence(options) {
  const persistence = new RejoinHintsPersistenceService({
    dataDir: options.dataDir,
    nodeId: options.nodeId,
    nodeAddress: options.nodeAddress,
    nodeRole: options.nodeRole,
    getSystemTableCache: options.getSystemTableCache,
    logger: options.logger,
  });
  persistence.start();
  return persistence;
}

export {
  SEED_CANDIDATE_SELECTION_STATE,
  parseSeedNodeAddressCandidates,
  persistJoinSeedRejoinHints,
  resolveSeedContactUrls,
  resolveStartupJoinDecision,
  selectSeedNodeAddressCandidate,
  startRejoinHintsPersistence,
};
