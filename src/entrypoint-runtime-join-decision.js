import {
  AUTO_REJOIN_DECISION_STATE,
  RejoinHintsPersistenceService,
  resolveAutoRejoinStartupDecision,
} from './bootstrap/rejoin-hints.js';
import {
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

  const baseUrl = normalizedPeerAddress.startsWith('http') ?
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
 * @return {Object}
 */
function buildExplicitSeedStartupDecision(options) {
  const autoRejoinDecision = options.autoRejoinDecision;
  const explicitSeedNodeAddress = options.explicitSeedNodeAddress;
  const snapshot = buildExplicitSeedDecisionSnapshot(autoRejoinDecision);
  const state = resolveExplicitSeedDecisionState(snapshot);

  switch (state) {
  case EXPLICIT_SEED_DECISION_STATE.IDENTITY_MISMATCH:
    throw new Error(autoRejoinDecision.error);
  case EXPLICIT_SEED_DECISION_STATE.DURABLE_PROBED_PEER:
    return {
      seedNodeAddress: snapshot.peerAddress,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: snapshot.source,
      membershipOwnerOutcome: autoRejoinDecision.membershipOwnerOutcome,
    };
  case EXPLICIT_SEED_DECISION_STATE.DURABLE_EXPLICIT_SEED:
    return {
      seedNodeAddress: explicitSeedNodeAddress,
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
  const nodeId = options.config.get(CONFIG_KEY.NODE_ID);
  const {nodeHttpAddress} = resolveRuntimeAddresses(options.config);
  const autoRejoinDecision = await resolveAutoRejoinStartupDecision({
    dataDir: options.dataDirectoryManager.getDataDir(),
    nodeId,
    nodeAddress: nodeHttpAddress,
    probePeerAddress:
      typeof options.probePeerAddress === 'function' ?
        options.probePeerAddress :
        probeAutoRejoinPeerAddress,
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
    durableStateDetected: autoRejoinDecision.durableStateDetected === true,
    identityMismatch: autoRejoinDecision.identityMismatch === true,
  });
  if (explicitSeedNodeAddress) {
    return buildExplicitSeedStartupDecision({
      autoRejoinDecision,
      explicitSeedNodeAddress,
    });
  }
  if (autoRejoinDecision.mode === STARTUP_JOIN_DECISION_MODE.FAIL) {
    throw new Error(autoRejoinDecision.error);
  }
  if (autoRejoinDecision.mode !== STARTUP_JOIN_DECISION_MODE.JOIN) {
    return {
      seedNodeAddress: null,
      startupMode: STARTUP_JOIN_MODE.SEED,
      source: autoRejoinDecision.source,
      membershipOwnerOutcome: autoRejoinDecision.membershipOwnerOutcome,
    };
  }

  options.logger.info(ENTRYPOINT_LOG_MSG.AUTO_REJOINING_CLUSTER, {
    nodeId,
    peerAddress: autoRejoinDecision.peerAddress,
    source: autoRejoinDecision.source,
    startupMode: autoRejoinDecision.startupMode,
  });
  return {
    seedNodeAddress: autoRejoinDecision.peerAddress,
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
  resolveStartupJoinDecision,
  startRejoinHintsPersistence,
};
