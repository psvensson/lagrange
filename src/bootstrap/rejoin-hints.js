import {rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {TABLES} from '../constants/index.js';
import {buildClusterIncarnationFence} from './cluster-incarnation-fence.js';
import {
  CLUSTER_ID_CONFIG_KEY,
  CLUSTER_ID_MATCH_STATE,
  classifyClusterIdMatch,
} from './cluster-identity-constants.js';
import {
  DURABLE_EVIDENCE_STATE,
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  MEMBERSHIP_OWNER_REASON,
  REJOIN_HINTS_FILENAME,
  REJOIN_HINTS_TEMP_SUFFIX,
  REJOIN_HINTS_WRITE_INTERVAL_MS,
  STARTUP_JOIN_MODE,
  TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT,
} from './rejoin-hints-constants.js';
import {
  readDurableNodesTableSnapshot,
  readRejoinHints,
  readRejoinHintsOutcome,
} from './rejoin-hints-durable-evidence.js';
import {
  deriveRequiresPeerRejoin,
  extractPeerAddresses,
  normalizeAddress,
  normalizeNodeCount,
  normalizeNodeRole,
  normalizePeerAddresses,
  parseClusterNodeCount,
  prioritizePeerAddress,
} from './rejoin-hints-addresses.js';

const REJOIN_ROLE_SEED = 'seed';
const STARTUP_MODE_JOIN = 'join';
const STARTUP_MODE_SEED = 'seed';
const STARTUP_MODE_FAIL = 'fail';
const RECOVERED_CLUSTER_NODE_COUNT_WITH_PEER = 2;
const UTF8_ENCODING = 'utf8';
const JSON_INDENT_SPACES = 2;
const JSON_LINE_SUFFIX = '\n';
const AUTO_REJOIN_REQUIRED_ERROR_CODE = 'AUTO_REJOIN_REQUIRED';
const REJOIN_SOURCE = Object.freeze({
  NONE: 'none',
  REJOIN_HINTS: 'rejoin_hints',
  DURABLE_NODES_TABLE: 'durable_nodes_table',
});
const PEER_ADDRESS_STATE = Object.freeze({
  SELECTED: 'selected',
  UNAVAILABLE: 'unavailable',
});
const AUTO_REJOIN_DECISION_STATE = Object.freeze({
  IDENTITY_MISMATCH: 'identity_mismatch',
  CLUSTER_ID_MISMATCH: 'cluster_id_mismatch',
  DURABLE_SEED: 'durable_seed',
  JOIN_PROBED_PEER: 'join_probed_peer',
  JOIN_RECOVERED_PEER: 'join_recovered_peer',
  PEER_REQUIRED_BUT_MISSING: 'peer_required_but_missing',
  UNREADABLE_DURABLE_EVIDENCE: 'unreadable_durable_evidence',
  FRESH_SEED: 'fresh_seed',
});
const AUTO_REJOIN_MEMBERSHIP_OUTCOME_BY_STATE = Object.freeze({
  [AUTO_REJOIN_DECISION_STATE.IDENTITY_MISMATCH]: Object.freeze({
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
    reasonCode: MEMBERSHIP_OWNER_REASON.IDENTITY_MISMATCH,
  }),
  [AUTO_REJOIN_DECISION_STATE.CLUSTER_ID_MISMATCH]: Object.freeze({
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
    reasonCode: MEMBERSHIP_OWNER_REASON.CLUSTER_ID_MISMATCH,
  }),
  [AUTO_REJOIN_DECISION_STATE.UNREADABLE_DURABLE_EVIDENCE]: Object.freeze({
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
    reasonCode: MEMBERSHIP_OWNER_REASON.UNREADABLE_DURABLE_EVIDENCE,
  }),
  [AUTO_REJOIN_DECISION_STATE.DURABLE_SEED]: Object.freeze({
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BOOTSTRAP_SEED,
    reasonCode: MEMBERSHIP_OWNER_REASON.DURABLE_SEED,
  }),
  [AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER]: Object.freeze({
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
    reasonCode: MEMBERSHIP_OWNER_REASON.JOIN_PROBED_PEER,
  }),
  [AUTO_REJOIN_DECISION_STATE.JOIN_RECOVERED_PEER]: Object.freeze({
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
    reasonCode: MEMBERSHIP_OWNER_REASON.JOIN_RECOVERED_PEER,
  }),
  [AUTO_REJOIN_DECISION_STATE.PEER_REQUIRED_BUT_MISSING]: Object.freeze({
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
    reasonCode: MEMBERSHIP_OWNER_REASON.PEER_REQUIRED_BUT_MISSING,
  }),
  [AUTO_REJOIN_DECISION_STATE.FRESH_SEED]: Object.freeze({
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BOOTSTRAP_SEED,
    reasonCode: MEMBERSHIP_OWNER_REASON.FRESH_SEED,
  }),
});
const IDENTITY_MISMATCH_ERROR_MESSAGE =
  'Persistent cluster state belongs to a different node identity; ' +
  'refusing to start with mismatched data directory';
const CLUSTER_ID_MISMATCH_ERROR_MESSAGE =
  'Persistent cluster state belongs to a different cluster identity; ' +
  'refusing to start with a data directory from another cluster';
const DURABLE_STATE_REJOIN_REQUIRED_ERROR_MESSAGE =
  'Persistent multi-node cluster state was detected but no rejoin peer ' +
  'address could be recovered; refusing to bootstrap a fresh seed over ' +
  'existing durable state';
const UNREADABLE_DURABLE_EVIDENCE_ERROR_MESSAGE =
  'Durable cluster state was discovered but could not be read; refusing ' +
  'to bootstrap a fresh seed over unreadable durable state. After ' +
  'verifying no cluster member still owns this data, set ' +
  'LAGRANGE_FORCE_NEW_CLUSTER=1 to authorize a fresh cluster bootstrap';
const REJOIN_HINTS_PERSIST_FAILED_LOG_MESSAGE =
  'Failed to persist cluster rejoin hints';
const BOOT_INCARNATION_INCREMENT = 1;
const UNKNOWN_AUTO_REJOIN_DECISION_STATE_ERROR_PREFIX =
  'Unknown auto-rejoin startup decision state: ';
const UNKNOWN_AUTO_REJOIN_MEMBERSHIP_OUTCOME_STATE_ERROR_PREFIX =
  'Unknown auto-rejoin membership outcome state: ';
let rejoinHintsTempSequence = 0;

// Attach the cluster identity to one hints snapshot only when one exists:
// an absent identity leaves the field OFF the object entirely so a
// pre-identity hints file and a post-identity "identity not yet visible"
// write are byte-identical, and the read-back compatibility policy
// (classifyClusterIdMatch) treats the missing field as UNKNOWN.
function withClusterId(snapshot, clusterId) {
  return typeof clusterId === 'string' && clusterId.length > 0 ?
    {...snapshot, clusterId} :
    snapshot;
}

// Attach the boot incarnation to one hints snapshot only when one is known:
// the counter is minted at boot (previous persisted value + 1) and captured
// by the persistence service, so the 1s cadence rewrites emit the SAME value
// — the field increments exactly once per boot, never per write. An absent
// incarnation leaves the field OFF the object entirely (pre-incarnation
// hints files stay read-back compatible).
function withBootIncarnation(snapshot, bootIncarnation) {
  return Number.isSafeInteger(bootIncarnation) && bootIncarnation > 0 ?
    {...snapshot, bootIncarnation} :
    snapshot;
}

// Read the durable cluster identity from the replicated CONFIG row through
// the same system table cache the snapshot builder already touches. Absent
// row (pre-identity cluster or pre-hydration cache) reads as null — the
// hints file then simply carries no identity for that write, and a later
// cadence tick rewrites it once the row is visible.
function readCachedClusterId(systemTableCache) {
  const row = typeof systemTableCache?.get === 'function' ?
    systemTableCache.get(TABLES.CONFIG, CLUSTER_ID_CONFIG_KEY) :
    null;
  const clusterId = row?.config_value;
  return typeof clusterId === 'string' && clusterId.length > 0 ?
    clusterId :
    null;
}

function buildRejoinHintsSnapshot(options = {}) {
  const systemTableCache = options.systemTableCache || null;
  const nodeRows = typeof systemTableCache?.getAll === 'function' ?
    systemTableCache.getAll(TABLES.NODES) || [] :
    [];
  const localNodeId = normalizeAddress(options.nodeId);
  const localNodeAddress = normalizeAddress(options.nodeAddress);
  const localNodeRole = normalizeNodeRole(options.nodeRole);
  const clusterNodeCount = normalizeNodeCount(nodeRows);
  const peerAddresses = extractPeerAddresses(
    nodeRows,
    localNodeId,
    localNodeAddress,
  );

  return withBootIncarnation(
    withClusterId({
      localNodeId,
      localNodeAddress,
      localNodeRole,
      clusterNodeCount,
      peerAddresses,
      requiresPeerRejoin: deriveRequiresPeerRejoin({
        nodeRole: localNodeRole,
        clusterNodeCount,
        peerAddresses,
      }),
      updatedAt: typeof options.now === 'function' ?
        options.now() :
        Date.now(),
    }, readCachedClusterId(systemTableCache)),
    options.bootIncarnation,
  );
}

function buildBootstrapRejoinHintsSnapshot(options = {}) {
  const localNodeId = normalizeAddress(options.nodeId);
  const localNodeAddress = normalizeAddress(options.nodeAddress);
  const localNodeRole = normalizeNodeRole(options.nodeRole);
  const peerAddresses = normalizePeerAddresses(
    options.peerAddresses,
    localNodeId,
    localNodeAddress,
  );
  const clusterNodeCount = Math.max(
    parseClusterNodeCount(options.clusterNodeCount),
    peerAddresses.length > 0 ?
      RECOVERED_CLUSTER_NODE_COUNT_WITH_PEER :
      0,
  );

  const clusterId = typeof options.clusterId === 'string' &&
    options.clusterId.length > 0 ?
    options.clusterId :
    null;

  return withBootIncarnation(
    withClusterId({
      localNodeId,
      localNodeAddress,
      localNodeRole,
      clusterNodeCount,
      peerAddresses,
      requiresPeerRejoin: deriveRequiresPeerRejoin({
        nodeRole: localNodeRole,
        clusterNodeCount,
        peerAddresses,
      }),
      updatedAt: typeof options.now === 'function' ?
        options.now() :
        Date.now(),
    }, clusterId),
    options.bootIncarnation,
  );
}

function resolveRejoinHintsPath(dataDir) {
  const normalizedDataDir = normalizeAddress(dataDir);
  if (!normalizedDataDir) {
    return null;
  }
  return join(normalizedDataDir, REJOIN_HINTS_FILENAME);
}

async function persistRejoinHintsSnapshot(dataDir, snapshot) {
  const hintsPath = resolveRejoinHintsPath(dataDir);
  if (!hintsPath) {
    return null;
  }

  const tempPath = `${hintsPath}${REJOIN_HINTS_TEMP_SUFFIX}.` +
    `${process.pid}.${rejoinHintsTempSequence++}`;
  await writeFile(
    tempPath,
    JSON.stringify(snapshot, null, JSON_INDENT_SPACES) + JSON_LINE_SUFFIX,
    UTF8_ENCODING,
  );
  await rename(tempPath, hintsPath);
  return snapshot;
}

async function persistBootstrapRejoinHints(options = {}) {
  const snapshot = buildBootstrapRejoinHintsSnapshot(options);
  return persistRejoinHintsSnapshot(options.dataDir, snapshot);
}

/**
 * Read the node identity persisted with the rejoin hints, for reuse on
 * restart. A node that boots over an existing data directory with a freshly
 * generated id is refused as an identity mismatch (see
 * IDENTITY_MISMATCH_ERROR_MESSAGE), so a deployment without an explicit
 * NODE_ID needs the durable identity restored before configuration
 * initialization mints a new one.
 * @param {string} dataDir - Data directory holding the rejoin hints file.
 * @return {Promise<string|null>} The persisted node id, or null when absent.
 */
async function readPersistedLocalNodeId(dataDir) {
  const hints = await readRejoinHints(dataDir);
  const localNodeId = normalizeAddress(hints?.localNodeId);
  return localNodeId || null;
}

/**
 * Read the cluster identity persisted with the rejoin hints. A node that has
 * joined a cluster carries its id node-locally from that moment on, so the
 * next boot can both gate its own auto-rejoin decision (fail closed on a
 * data directory from another cluster) and send expectedClusterId with every
 * bootstrap request.
 * @param {string} dataDir - Data directory holding the rejoin hints file.
 * @return {Promise<string|null>} The persisted cluster id, or null when
 *   absent (fresh node or pre-identity hints file).
 */
async function readPersistedLocalClusterId(dataDir) {
  const hints = await readRejoinHints(dataDir);
  const clusterId = hints?.clusterId;
  return typeof clusterId === 'string' && clusterId.length > 0 ?
    clusterId :
    null;
}

/**
 * Read the boot incarnation persisted with the rejoin hints. The counter is
 * node-local and monotonic across boots: each boot reads the previous value
 * and mints the next one, so a zombie process from an earlier boot provably
 * carries a smaller incarnation than the current owner of the data dir.
 * @param {string} dataDir - Data directory holding the rejoin hints file.
 * @return {Promise<number>} The persisted boot incarnation, or 0 when
 *   absent (fresh node or pre-incarnation hints file).
 */
async function readPersistedBootIncarnation(dataDir) {
  const hints = await readRejoinHints(dataDir);
  const bootIncarnation = hints?.bootIncarnation;
  return Number.isSafeInteger(bootIncarnation) && bootIncarnation > 0 ?
    bootIncarnation :
    0;
}

/**
 * Mint this boot's incarnation: the previous persisted value plus one. The
 * result is captured once at boot and threaded into every hints write, so
 * the counter increments exactly once per boot even though the persistence
 * cadence rewrites the file every second.
 * @param {string} dataDir - Data directory holding the rejoin hints file.
 * @return {Promise<number>} The freshly minted boot incarnation (>= 1).
 */
async function mintBootIncarnation(dataDir) {
  const previous = await readPersistedBootIncarnation(dataDir);
  return previous + BOOT_INCARNATION_INCREMENT;
}

function hintsMatchLocalIdentity(hints, nodeId, nodeAddress) {
  if (!hints || typeof hints !== 'object') {
    return false;
  }

  const normalizedNodeId = normalizeAddress(nodeId);
  const normalizedNodeAddress = normalizeAddress(nodeAddress);
  const hintedNodeId = normalizeAddress(hints.localNodeId);
  const hintedNodeAddress = normalizeAddress(hints.localNodeAddress);

  if (normalizedNodeId && hintedNodeId) {
    return normalizedNodeId === hintedNodeId;
  }
  if (normalizedNodeAddress && hintedNodeAddress) {
    return normalizedNodeAddress === hintedNodeAddress;
  }
  return !hintedNodeId && !hintedNodeAddress;
}

function choosePreferredPeerAddress(peerAddresses, preferredPeerAddresses) {
  const preferredSet = new Set(
    normalizePeerAddresses(preferredPeerAddresses),
  );
  for (const peerAddress of peerAddresses) {
    if (preferredSet.has(peerAddress)) {
      return peerAddress;
    }
  }
  return peerAddresses[0] || null;
}

async function probeRecoverablePeerAddress(peerAddresses, probePeerAddress) {
  if (typeof probePeerAddress !== 'function') {
    return null;
  }
  for (const peerAddress of peerAddresses) {
    if (await probePeerAddress(peerAddress)) {
      return peerAddress;
    }
  }
  return null;
}

function resolveDurableStartupSource(context = {}) {
  if (context.hintsIdentityMatched) {
    return REJOIN_SOURCE.REJOIN_HINTS;
  }
  if (context.durableSnapshot?.hasDurableNodesTable) {
    return REJOIN_SOURCE.DURABLE_NODES_TABLE;
  }
  return REJOIN_SOURCE.NONE;
}

function resolveDurableJoinSource(context = {}) {
  return context.hintPeerAddresses.includes(context.selectedPeerAddress) ?
    REJOIN_SOURCE.REJOIN_HINTS :
    REJOIN_SOURCE.DURABLE_NODES_TABLE;
}

async function collectAutoRejoinDecisionContext(options = {}) {
  const rejoinHintsRead = await readRejoinHintsOutcome(options.dataDir);
  const hints = rejoinHintsRead.state === DURABLE_EVIDENCE_STATE.READABLE ?
    rejoinHintsRead.hints :
    null;
  const durableEvidenceUnreadable =
    rejoinHintsRead.state === DURABLE_EVIDENCE_STATE.UNREADABLE;
  const hintsIdentityMatched = hintsMatchLocalIdentity(
    hints,
    options.nodeId,
    options.nodeAddress,
  );
  const clusterIdMatch = classifyClusterIdMatch(
    options.expectedClusterId,
    hints?.clusterId,
  );
  const durableSnapshot = await readDurableNodesTableSnapshot(options);
  const hintPeerAddresses = hintsIdentityMatched ?
    normalizePeerAddresses(
      hints?.peerAddresses,
      options.nodeId,
      options.nodeAddress,
    ) :
    [];
  const peerAddresses = normalizePeerAddresses(
    [
      ...hintPeerAddresses,
      ...durableSnapshot.peerAddresses,
    ],
    options.nodeId,
    options.nodeAddress,
  );
  const clusterNodeCount = Math.max(
    hintsIdentityMatched ?
      parseClusterNodeCount(hints?.clusterNodeCount) :
      0,
    durableSnapshot.clusterNodeCount,
  );
  const localNodeRole = hintsIdentityMatched ?
    normalizeNodeRole(hints?.localNodeRole) :
    null;
  const selectedPeerAddress = await probeRecoverablePeerAddress(
    peerAddresses,
    options.probePeerAddress,
  );
  const preferredPeerAddress = choosePreferredPeerAddress(
    peerAddresses,
    hintPeerAddresses,
  );
  const durableEvidenceBlocked = durableEvidenceUnreadable ||
    durableSnapshot.durableEvidenceUnreadable === true;
  const durableStateDetected = hintsIdentityMatched ||
    durableSnapshot.hasDurableNodesTable ||
    clusterNodeCount > 0 ||
    durableEvidenceBlocked;
  const clusterIncarnationFence = buildClusterIncarnationFence({
    durableStateDetected,
    localIdentityMatched:
      hintsIdentityMatched || durableSnapshot.matchedLocalIdentity === true,
    peerProofRequired: deriveRequiresPeerRejoin({
      nodeRole: localNodeRole,
      clusterNodeCount,
      peerAddresses,
    }) &&
      localNodeRole !== REJOIN_ROLE_SEED,
    peerAddresses,
  });

  return {
    durableSnapshot,
    hintsIdentityMatched,
    clusterIdMismatch: clusterIdMatch === CLUSTER_ID_MATCH_STATE.MISMATCH,
    hintPeerAddresses,
    peerAddresses,
    clusterNodeCount,
    localNodeRole,
    selectedPeerAddress,
    preferredPeerAddress,
    durableStateDetected,
    durableEvidenceBlocked,
    forceNewCluster: options.forceNewCluster === true,
    clusterIncarnationFence,
    requiresPeerRejoin: deriveRequiresPeerRejoin({
      nodeRole: localNodeRole,
      clusterNodeCount,
      peerAddresses,
    }),
  };
}

function resolveAutoRejoinDecisionState(context = {}) {
  if (context.durableSnapshot.identityMismatch) {
    return AUTO_REJOIN_DECISION_STATE.IDENTITY_MISMATCH;
  }
  if (context.clusterIdMismatch === true) {
    return AUTO_REJOIN_DECISION_STATE.CLUSTER_ID_MISMATCH;
  }
  if (context.durableEvidenceBlocked === true &&
    context.forceNewCluster !== true) {
    return AUTO_REJOIN_DECISION_STATE.UNREADABLE_DURABLE_EVIDENCE;
  }
  if (context.localNodeRole === REJOIN_ROLE_SEED) {
    return AUTO_REJOIN_DECISION_STATE.DURABLE_SEED;
  }
  if (context.selectedPeerAddress) {
    return AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER;
  }
  if (context.peerAddresses.length > 0) {
    return AUTO_REJOIN_DECISION_STATE.JOIN_RECOVERED_PEER;
  }
  if (context.requiresPeerRejoin) {
    return AUTO_REJOIN_DECISION_STATE.PEER_REQUIRED_BUT_MISSING;
  }
  return AUTO_REJOIN_DECISION_STATE.FRESH_SEED;
}

function buildAutoRejoinMembershipOwnerOutcome(decision, state) {
  const outcomeRule = AUTO_REJOIN_MEMBERSHIP_OUTCOME_BY_STATE[state];
  if (!outcomeRule) {
    throw new Error(
      UNKNOWN_AUTO_REJOIN_MEMBERSHIP_OUTCOME_STATE_ERROR_PREFIX +
        String(state),
    );
  }

  return {
    semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
    boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
    outcomeType: outcomeRule.outcomeType,
    startupMode: decision.startupMode,
    reasonCode: outcomeRule.reasonCode,
    evidenceSource: decision.source,
    peerAddressState: decision.peerAddressState,
    durableStateDetected: decision.durableStateDetected === true,
    identityMismatch: decision.identityMismatch === true,
    clusterIncarnationFence: decision.clusterIncarnationFence,
  };
}

function attachMembershipOwnerOutcome(decision, state) {
  return {
    ...decision,
    membershipOwnerOutcome: buildAutoRejoinMembershipOwnerOutcome(
      decision,
      state,
    ),
  };
}

function buildAutoRejoinStartupDecision(context = {}, state) {
  switch (state) {
  case AUTO_REJOIN_DECISION_STATE.IDENTITY_MISMATCH:
    return attachMembershipOwnerOutcome({
      state,
      mode: STARTUP_MODE_FAIL,
      peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
      peerAddress: null,
      peerAddresses: [],
      source: REJOIN_SOURCE.DURABLE_NODES_TABLE,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: true,
      clusterIncarnationFence: context.clusterIncarnationFence,
      error: IDENTITY_MISMATCH_ERROR_MESSAGE,
    }, state);
  case AUTO_REJOIN_DECISION_STATE.CLUSTER_ID_MISMATCH:
    return attachMembershipOwnerOutcome({
      state,
      mode: STARTUP_MODE_FAIL,
      peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
      peerAddress: null,
      peerAddresses: [],
      source: REJOIN_SOURCE.REJOIN_HINTS,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: true,
      clusterIncarnationFence: context.clusterIncarnationFence,
      error: CLUSTER_ID_MISMATCH_ERROR_MESSAGE,
    }, state);
  case AUTO_REJOIN_DECISION_STATE.DURABLE_SEED:
    return attachMembershipOwnerOutcome({
      state,
      mode: STARTUP_MODE_SEED,
      peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
      peerAddress: null,
      peerAddresses: [],
      source: resolveDurableStartupSource(context),
      startupMode: STARTUP_JOIN_MODE.SEED,
      durableStateDetected: context.durableStateDetected,
      identityMismatch: false,
      clusterIncarnationFence: context.clusterIncarnationFence,
    }, state);
  case AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER:
    return attachMembershipOwnerOutcome({
      state,
      mode: STARTUP_MODE_JOIN,
      peerAddressState: PEER_ADDRESS_STATE.SELECTED,
      peerAddress: context.selectedPeerAddress,
      peerAddresses: prioritizePeerAddress(
        context.peerAddresses,
        context.selectedPeerAddress,
      ),
      source: resolveDurableJoinSource(context),
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: false,
      clusterIncarnationFence: context.clusterIncarnationFence,
    }, state);
  case AUTO_REJOIN_DECISION_STATE.JOIN_RECOVERED_PEER:
    return attachMembershipOwnerOutcome({
      state,
      mode: STARTUP_MODE_JOIN,
      peerAddressState: PEER_ADDRESS_STATE.SELECTED,
      peerAddress: context.preferredPeerAddress,
      peerAddresses: prioritizePeerAddress(
        context.peerAddresses,
        context.preferredPeerAddress,
      ),
      source: context.hintPeerAddresses.length > 0 ?
        REJOIN_SOURCE.REJOIN_HINTS :
        REJOIN_SOURCE.DURABLE_NODES_TABLE,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: false,
      clusterIncarnationFence: context.clusterIncarnationFence,
    }, state);
  case AUTO_REJOIN_DECISION_STATE.PEER_REQUIRED_BUT_MISSING:
    return attachMembershipOwnerOutcome({
      state,
      mode: STARTUP_MODE_FAIL,
      peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
      peerAddress: null,
      peerAddresses: [],
      source: context.durableSnapshot.hasDurableNodesTable ?
        REJOIN_SOURCE.DURABLE_NODES_TABLE :
        REJOIN_SOURCE.REJOIN_HINTS,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: false,
      clusterIncarnationFence: context.clusterIncarnationFence,
      error: DURABLE_STATE_REJOIN_REQUIRED_ERROR_MESSAGE,
    }, state);
  case AUTO_REJOIN_DECISION_STATE.UNREADABLE_DURABLE_EVIDENCE:
    return attachMembershipOwnerOutcome({
      state,
      mode: STARTUP_MODE_FAIL,
      peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
      peerAddress: null,
      peerAddresses: [],
      source: REJOIN_SOURCE.NONE,
      startupMode: STARTUP_JOIN_MODE.SEED,
      durableStateDetected: true,
      identityMismatch: false,
      clusterIncarnationFence: context.clusterIncarnationFence,
      error: UNREADABLE_DURABLE_EVIDENCE_ERROR_MESSAGE,
    }, state);
  case AUTO_REJOIN_DECISION_STATE.FRESH_SEED:
    return attachMembershipOwnerOutcome({
      state,
      mode: STARTUP_MODE_SEED,
      peerAddressState: PEER_ADDRESS_STATE.UNAVAILABLE,
      peerAddress: null,
      peerAddresses: [],
      source: REJOIN_SOURCE.NONE,
      startupMode: STARTUP_JOIN_MODE.SEED,
      durableStateDetected: false,
      identityMismatch: false,
      clusterIncarnationFence: context.clusterIncarnationFence,
    }, state);
  default:
    throw new Error(
      UNKNOWN_AUTO_REJOIN_DECISION_STATE_ERROR_PREFIX + String(state),
    );
  }
}

async function resolveAutoRejoinStartupDecision(options = {}) {
  const decisionContext = await collectAutoRejoinDecisionContext(options);
  const decisionState = resolveAutoRejoinDecisionState(decisionContext);
  return buildAutoRejoinStartupDecision(decisionContext, decisionState);
}

async function resolveAutoRejoinPeerAddress(options = {}) {
  const decision = await resolveAutoRejoinStartupDecision(options);
  if (decision.mode === STARTUP_MODE_FAIL) {
    const error = new Error(decision.error);
    error.code = AUTO_REJOIN_REQUIRED_ERROR_CODE;
    throw error;
  }
  return decision.mode === STARTUP_MODE_JOIN &&
    decision.peerAddressState === PEER_ADDRESS_STATE.SELECTED ?
    decision.peerAddress :
    null;
}

class RejoinHintsPersistenceService {
  constructor(options = {}) {
    this.dataDir = options.dataDir || null;
    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.nodeRole = options.nodeRole || null;
    // Captured once at boot (mintBootIncarnation) and held for the process
    // lifetime: the 1s cadence rewrites the file with the SAME value, so
    // the counter increments exactly once per boot.
    this.bootIncarnation = Number.isSafeInteger(options.bootIncarnation) &&
      options.bootIncarnation > 0 ?
      options.bootIncarnation :
      0;
    this.getSystemTableCache =
      typeof options.getSystemTableCache === 'function' ?
        options.getSystemTableCache :
        () => null;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.logger = options.logger || console;
    this.writeIntervalMs = Number.isFinite(options.writeIntervalMs) &&
      options.writeIntervalMs > 0 ?
      Math.floor(options.writeIntervalMs) :
      REJOIN_HINTS_WRITE_INTERVAL_MS;
    this.timer = null;
    this.persistChain = Promise.resolve();
    this.persistSequence = 0;
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.persistNow();
    }, this.writeIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    void this.persistNow();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.persistNow();
  }

  async persistNow() {
    const operation = this.persistChain
      .catch(() => null)
      .then(() => this.persistSnapshot());
    this.persistChain = operation.catch(() => null);
    return operation;
  }

  async persistSnapshot() {
    const snapshot = buildRejoinHintsSnapshot({
      systemTableCache: this.getSystemTableCache(),
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      nodeRole: this.nodeRole,
      bootIncarnation: this.bootIncarnation,
      now: this.now,
    });
    try {
      rejoinHintsTempSequence = Math.max(
        rejoinHintsTempSequence,
        this.persistSequence,
      );
      const persisted = await persistRejoinHintsSnapshot(
        this.dataDir,
        snapshot,
      );
      this.persistSequence = rejoinHintsTempSequence;
      if (!persisted) {
        return null;
      }
      return snapshot;
    } catch (error) {
      this.logger.warn?.(REJOIN_HINTS_PERSIST_FAILED_LOG_MESSAGE, {
        nodeId: this.nodeId,
        dataDir: this.dataDir,
        error: error.message,
      });
      return null;
    }
  }
}

export {
  AUTO_REJOIN_DECISION_STATE,
  buildBootstrapRejoinHintsSnapshot,
  buildRejoinHintsSnapshot,
  persistBootstrapRejoinHints,
  mintBootIncarnation,
  probeRecoverablePeerAddress,
  readPersistedBootIncarnation,
  readPersistedLocalClusterId,
  readPersistedLocalNodeId,
  readRejoinHints,
  RejoinHintsPersistenceService,
  resolveAutoRejoinStartupDecision,
  resolveAutoRejoinPeerAddress,
};
