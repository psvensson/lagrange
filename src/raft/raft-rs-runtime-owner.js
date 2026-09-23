import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  RAFT_RS_CORE_ERROR_MSG,
  RAFT_RS_CORE_PRIMITIVES,
  RAFT_RS_DIGEST_ALGORITHM,
  RAFT_RS_DIGEST_ENCODING,
  RAFT_RS_DIGEST_KEY,
  RAFT_RS_FORBIDDEN_CONVENIENCE,
  RAFT_RS_WASM_FILE,
} from './raft-rs-core-constants.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {admitRaftRsMessage} from './raft-rs-ingress.js';
import {RAFT_RS_TRANSPORT_PROTOCOL} from './raft-rs-ingress-constants.js';
import {
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
} from './raft-rs-ready-loop-constants.js';
import {
  RAFT_RS_GROUP_TUNING,
  RAFT_RS_INITIAL_APPLIED,
  RAFT_RS_READY_DRAIN_MAX_CYCLES,
} from './raft-rs-group-constants.js';
import {
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';
import {
  CORE_CALL_WITHOUT_HANDLE,
  CORE_OPERATION,
  CORE_REFUSAL_KIND,
  HEALTHY,
  INBOUND_DRAIN_DELAY_MS,
  NO_LEADER,
  PEER_DELIVERY_OBSERVATION_LIMIT,
  PEER_DELIVERY_OUTCOME,
  PERSISTENCE_ADMISSION_WAIT,
  RECOVERY_REQUIRED,
  ROLE,
  ROLE_LEADER,
  RUNTIME_COMMAND,
  RUNTIME_EVENT,
  RUNTIME_PHASE,
  RUNTIME_REASON,
  UNHEALTHY,
  USABLE,
} from './raft-rs-runtime-owner-constants.js';
import {tuningOf} from './raft-rs-runtime-tuning.js';
import {shapeGroupObservation} from './raft-rs-status-observation.js';
import {applyCommittedEntryTransaction} from
  './raft-rs-application-transaction-owner.js';
import {
  persistenceAdmitted,
  whenPersistenceAdmitted,
} from './raft-rs-persistence-admission.js';
import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';

const {
  CORE_OK,
  CORE_REFUSED,
  CORE_FATAL,
  HOST_FAILURE,
} = RAFT_OPERATION_OUTCOME;
const REPOSITORY_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  RAFT_RS_WASM_FILE.PARENT_OF_SOURCE_ROOT,
  RAFT_RS_WASM_FILE.PARENT_OF_SOURCE_ROOT,
);
const BINDING_ROOT = path.join(
  REPOSITORY_ROOT,
  RAFT_RS_WASM_FILE.VENDOR_DIRECTORY,
  RAFT_RS_WASM_FILE.DIRECTORY,
);
const PACKAGE_ROOT = path.join(
  BINDING_ROOT, RAFT_RS_WASM_FILE.PACKAGE_DIRECTORY);
const GLUE_FILE = path.join(PACKAGE_ROOT, RAFT_RS_WASM_FILE.GLUE);
const WASM_FILE = path.join(PACKAGE_ROOT, RAFT_RS_WASM_FILE.WASM);
const DIGEST_FILE = path.join(BINDING_ROOT, RAFT_RS_WASM_FILE.DIGEST);
const requireBinding = createRequire(import.meta.url);

function fileDigest(file) {
  return createHash(RAFT_RS_DIGEST_ALGORITHM)
    .update(fs.readFileSync(file))
    .digest(RAFT_RS_DIGEST_ENCODING);
}

function assertArtifactIntegrity() {
  const digest = JSON.parse(fs.readFileSync(DIGEST_FILE, 'utf8'));
  const files = [
    [RAFT_RS_WASM_FILE.WASM, WASM_FILE, digest[RAFT_RS_DIGEST_KEY.WASM]],
    [RAFT_RS_WASM_FILE.GLUE, GLUE_FILE, digest[RAFT_RS_DIGEST_KEY.GLUE]],
  ];
  for (const [name, file, recorded] of files) {
    const actual = fileDigest(file);
    if (actual !== recorded) {
      throw new Error(
        RAFT_RS_CORE_ERROR_MSG.digestMismatch(name, recorded, actual));
    }
  }
}

function facadeOf(binding) {
  for (const name of RAFT_RS_FORBIDDEN_CONVENIENCE) {
    if (name in binding) {
      throw new Error(RAFT_RS_CORE_ERROR_MSG.forbiddenConvenience(name));
    }
  }
  const facade = {};
  for (const name of RAFT_RS_CORE_PRIMITIVES) {
    if (typeof binding[name] !== 'function') {
      throw new Error(RAFT_RS_CORE_ERROR_MSG.missingPrimitive(name));
    }
    facade[name] = (...args) => binding[name](...args);
  }
  return Object.freeze(facade);
}

function instantiateRaftRsCore() {
  assertArtifactIntegrity();
  delete requireBinding.cache[requireBinding.resolve(GLUE_FILE)];
  return facadeOf(requireBinding(GLUE_FILE));
}

let core = null;
let runtimeHealth = HEALTHY;
let runtimeGeneration = 0;
let nextGroupKey = 1;
let actualCoreEntries = 0;
let actualCoreEntryObserver = null;
const groups = new Map();
// A recorded observation is shaped once, when a busy-queue read asks for it.
const SHAPED_STATUS = new WeakMap();

function outcome(outcomeName, fields = {}) {
  return deepFreeze({outcome: outcomeName, ...fields});
}

function hostFailure(phase, error, recoveryRequired = false) {
  return outcome(HOST_FAILURE, {
    reason: String(error?.message || error),
    phase,
    retryable: true,
    recoveryRequired,
  });
}

function admissionWaitOutcomes(group) {
  return {
    closed: () => outcome(CORE_REFUSED, {
      reason: RUNTIME_REASON.CLOSED, phase: RUNTIME_PHASE.READY_PERSISTENCE,
      retryable: false, recoveryRequired: false,
    }),
    exceeded: () => {
      group.health = RECOVERY_REQUIRED;
      return hostFailure(RUNTIME_PHASE.READY_PERSISTENCE,
        RUNTIME_REASON.USER_TRANSACTION_OPEN, true);
    },
  };
}

function ensureCore() {
  if (core === null) {
    core = instantiateRaftRsCore();
    runtimeGeneration += 1;
  }
}

function isCoreRefusal(error) {
  return error?.kind === CORE_REFUSAL_KIND;
}

function invokeCore(group, operation, ...args) {
  // Lifecycle admission is outside this lowest common entry point. The static
  // owner audit permits only the operation-port constructor to obtain a
  // dispatcher, and that constructor invokes it inside its private lifecycle
  // owner's execute closure.
  ensureCore();
  actualCoreEntries += 1;
  actualCoreEntryObserver?.(deepFreeze({
    sequence: actualCoreEntries,
    operation,
    groupId: group.groupId,
    runtimeGeneration,
  }));
  try {
    const parameters = CORE_CALL_WITHOUT_HANDLE.has(operation) ?
      args : [group.handle, ...args];
    return {ok: true, value: core[operation](...parameters)};
  } catch (error) {
    if (isCoreRefusal(error)) {
      return {
        ok: false,
        result: outcome(CORE_REFUSED, {
          reason: String(error.message || RUNTIME_REASON.CORE_REFUSED),
          phase: operation,
          retryable: false,
          recoveryRequired: false,
        }),
      };
    }
    runtimeHealth = UNHEALTHY;
    return {
      ok: false,
      result: outcome(CORE_FATAL, {
        reason: String(error?.message || error),
        phase: operation,
        retryable: true,
        recoveryRequired: true,
      }),
    };
  }
}

function invokeCoreAt(group, expectedGeneration, operation, ...args) {
  if (expectedGeneration !== runtimeGeneration ||
      runtimeHealth !== HEALTHY || group.health === RECOVERY_REQUIRED) {
    group.health = RECOVERY_REQUIRED;
    return {
      ok: false,
      result: hostFailure(
        RUNTIME_PHASE.GENERATION_CHANGED,
        new Error(RUNTIME_REASON.GENERATION_CHANGED),
        true,
      ),
    };
  }
  return invokeCore(group, operation, ...args);
}

function createNodeArguments(group, restore) {
  const base = {
    id: group.peerId,
    peers: restore ? [] : group.voters,
    learners: [],
    applied: restore ? group.store.readDurableRecord(group.groupId).appliedIndex :
      RAFT_RS_INITIAL_APPLIED,
    ...tuningOf(group.timing),
  };
  if (!restore) {
    return base;
  }
  const record = group.store.readDurableRecord(group.groupId);
  return {
    ...base,
    bootstrap: {
      confState: record.confState,
      entries: record.entries,
      ...(record.hardState === null ? {} : {hardState: record.hardState}),
      ...(record.snapshot === null ? {} : {snapshot: record.snapshot}),
    },
  };
}

function openGroupInCurrentRuntime(group, restore) {
  group.handle = null;
  const created = invokeCore(group, 'create_node',
    createNodeArguments(group, restore));
  if (!created.ok) {
    return created.result;
  }
  group.handle = created.value;
  if (!restore) {
    const confState = invokeCore(group, CORE_OPERATION.CONF_STATE);
    if (!confState.ok) {
      return confState.result;
    }
    try {
      group.store.putAppliedState(
        group.groupId, RAFT_RS_INITIAL_APPLIED, confState.value);
    } catch (error) {
      group.health = RECOVERY_REQUIRED;
      return hostFailure(RUNTIME_PHASE.BOOTSTRAP_PERSISTENCE, error, true);
    }
  }
  group.health = USABLE;
  return outcome(CORE_OK, {
    reason: restore ? RUNTIME_REASON.RESTORED : RUNTIME_REASON.CREATED,
  });
}

// Whether a configuration names this replica as its only voter: no other
// replica can lead the group, so the replica is its group's leader as soon as
// it campaigns.
function isSoleVoter(confState, peerId) {
  return confState.voters.length === 1 && confState.voters[0] === peerId &&
    (confState.votersOutgoing || []).length === 0;
}

// A restored group resumes what it was before its runtime was replaced. The
// new core starts every group as a follower: a sole voter campaigns again at
// once (nothing else would ever make it leader, and a partition whose
// election is deferred has no tick to time out on), and every other group
// announces the role it now has, so its partition's leadership observation is
// re-synced from the core rather than left at the pre-failure leader.
function resumeAfterReconstruction(group, expectedGeneration) {
  const conf = invokeCoreAt(
    group, expectedGeneration, CORE_OPERATION.CONF_STATE);
  if (!conf.ok) {
    return conf.result;
  }
  if (isSoleVoter(conf.value, group.peerId)) {
    return campaignGroup(group, expectedGeneration);
  }
  announce(group, expectedGeneration);
  return outcome(CORE_OK, {reason: RUNTIME_REASON.RUNTIME_RECONSTRUCTED});
}

// Reconstruct the shared runtime from every group's durable record, then let
// each restored group resume. The outcome is the reconstruction's and, for
// the group whose operation asked for it, that group's resumption: a group
// that cannot resume is left RECOVERY_REQUIRED for its own next operation.
function replaceRuntime(trigger) {
  core = null;
  runtimeHealth = HEALTHY;
  ensureCore();
  const restoredGroups = [];
  for (const group of groups.values()) {
    if (group.closed || !group.store.hasDurableRecord(group.groupId)) {
      continue;
    }
    const restored = openGroupInCurrentRuntime(group, true);
    if (restored.outcome !== CORE_OK) {
      return restored;
    }
    restoredGroups.push(group);
  }
  const expectedGeneration = runtimeGeneration;
  let triggerResumed = outcome(CORE_OK, {
    reason: RUNTIME_REASON.RUNTIME_RECONSTRUCTED});
  for (const group of restoredGroups) {
    const resumed = resumeAfterReconstruction(group, expectedGeneration);
    if (resumed && typeof resumed.then === 'function') {
      // Only a Ready waiting for the store's admission resolves later; its
      // group's own queue observes the result.
      resumed.catch(() => undefined);
    } else if (group === trigger && resumed.outcome !== CORE_OK) {
      triggerResumed = resumed;
    }
  }
  return triggerResumed;
}

function ensureExecution(group) {
  if (runtimeHealth !== HEALTHY || group.health === RECOVERY_REQUIRED) {
    return replaceRuntime(group);
  }
  return outcome(CORE_OK, {reason: RUNTIME_REASON.EXECUTION_USABLE});
}

function enqueue(group, work) {
  if (group.tail === null) {
    const result = work();
    if (result && typeof result.then === 'function') {
      const token = Promise.resolve(result).finally(() => {
        if (group.tail === token) {
          group.tail = null;
        }
      });
      group.tail = token;
      return token;
    }
    return result;
  }
  const queued = group.tail.then(work, work);
  const token = queued.finally(() => {
    if (group.tail === token) {
      group.tail = null;
    }
  });
  group.tail = token;
  return token;
}

function thenMaybe(value, continuation) {
  return value && typeof value.then === 'function' ?
    value.then(continuation) : continuation(value);
}

// A delivery to one peer is that peer's transport outcome. Raft re-sends
// what a peer did not receive (the next append or heartbeat), so a failed
// delivery drops the message, is recorded against the peer, and leaves the
// Ready - its persistence, its application and the group's role and runtime -
// exactly as it was. Later messages of the same batch to a peer that just
// failed are dropped with it rather than waited on again.
function recordPeerDelivery(group, raftPeerId, observation) {
  const key = String(raftPeerId);
  group.peerDelivery.delete(key);
  group.peerDelivery.set(key, deepFreeze(observation));
  if (group.peerDelivery.size > PEER_DELIVERY_OBSERVATION_LIMIT) {
    group.peerDelivery.delete(group.peerDelivery.keys().next().value);
  }
}

function peerDeliveryFailed(group, raftPeerId, phase, cause, failedPeers) {
  const previous = group.peerDelivery.get(String(raftPeerId));
  recordPeerDelivery(group, raftPeerId, {
    outcome: PEER_DELIVERY_OUTCOME.FAILED,
    phase,
    reason: String(cause?.message || cause || RUNTIME_REASON.DELIVERY_FAILED),
    consecutiveFailures: previous?.outcome === PEER_DELIVERY_OUTCOME.FAILED ?
      previous.consecutiveFailures + 1 : 1,
  });
  failedPeers.add(String(raftPeerId));
  return null;
}

function settlePeerDelivery(group, raftPeerId, delivery, failedPeers) {
  if (delivery && typeof delivery === 'object' &&
      (delivery.noHandler === true || delivery.deferRetry === true ||
        delivery.acknowledged === false || delivery.error)) {
    return peerDeliveryFailed(group, raftPeerId,
      delivery.noHandler ? RUNTIME_PHASE.SEND_NO_HANDLER : RUNTIME_PHASE.SEND,
      delivery.error || delivery.reason, failedPeers);
  }
  recordPeerDelivery(group, raftPeerId, {
    outcome: PEER_DELIVERY_OUTCOME.DELIVERED, consecutiveFailures: 0,
  });
  return null;
}

function deliverToPeer(group, message, failedPeers) {
  let address;
  try {
    address = group.resolvePeerAddress(message.to);
  } catch (error) {
    return peerDeliveryFailed(group, message.to,
      RUNTIME_PHASE.ADDRESS_RESOLUTION, error, failedPeers);
  }
  let delivered;
  try {
    delivered = group.sendToPeer(address, {
      protocol: RAFT_RS_TRANSPORT_PROTOCOL,
      groupId: group.groupId,
      from: message.from,
      to: message.to,
      message,
    });
  } catch (error) {
    return peerDeliveryFailed(group, message.to, RUNTIME_PHASE.SEND, error,
      failedPeers);
  }
  if (delivered && typeof delivered.then === 'function') {
    return Promise.resolve(delivered).then(
      (delivery) => settlePeerDelivery(group, message.to, delivery,
        failedPeers),
      (error) => peerDeliveryFailed(group, message.to, RUNTIME_PHASE.SEND,
        error, failedPeers));
  }
  return settlePeerDelivery(group, message.to, delivered, failedPeers);
}

function sendMessages(group, messages, index = 0, failedPeers = new Set()) {
  if (index >= messages.length) {
    return null;
  }
  const message = messages[index];
  const delivered = failedPeers.has(String(message.to)) ? null :
    deliverToPeer(group, message, failedPeers);
  return thenMaybe(delivered, () =>
    sendMessages(group, messages, index + 1, failedPeers));
}

function resolveCommittedEntryConfState(group, expectedGeneration, entry) {
  if (RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(entry.entryType)) {
    const decoded = invokeCoreAt(
      group, expectedGeneration,
      'decode_conf_change_entry', entry.entryType, entry.data);
    if (!decoded.ok) {
      return decoded.result;
    }
    const applied = invokeCoreAt(
      group, expectedGeneration, 'apply_conf_change', decoded.value);
    if (!applied.ok) {
      return applied.result;
    }
    const set = invokeCoreAt(
      group, expectedGeneration, 'set_conf_state', applied.value);
    if (!set.ok) {
      return set.result;
    }
    return applied;
  }
  return invokeCoreAt(
    group, expectedGeneration, CORE_OPERATION.CONF_STATE);
}

function applyEntries(group, expectedGeneration, entries, index = 0) {
  if (index >= entries.length) {
    return outcome(CORE_OK, {reason: RUNTIME_REASON.ENTRIES_APPLIED});
  }
  const entry = entries[index];
  const resolvedConfState = resolveCommittedEntryConfState(
    group, expectedGeneration, entry);
  if (!resolvedConfState.ok) {
    return resolvedConfState.result;
  }
  try {
    applyCommittedEntryTransaction({
      store: group.store,
      groupId: group.groupId,
      entry,
      confState: resolvedConfState.value,
      applyCommittedEntry: group.applyCommittedEntry,
    });
  } catch (error) {
    group.health = RECOVERY_REQUIRED;
    group.applyTransactionRolledBack?.();
    return hostFailure(RUNTIME_PHASE.APPLICATION, error, true);
  }
  return applyEntries(group, expectedGeneration, entries, index + 1);
}

function finishReady(group, expectedGeneration, ready) {
  const persisted = invokeCoreAt(
    group, expectedGeneration, 'persist_ready');
  if (!persisted.ok) {
    return persisted.result;
  }
  // Sends never fail the Ready: each peer's delivery is its own outcome.
  const sent = sendMessages(group, [
    ...(ready.messages || []),
    ...(ready.persistedMessages || []),
  ]);
  const continuation = thenMaybe(sent, () => whenPersistenceAdmitted(group, () => {
    const applied = applyEntries(
      group, expectedGeneration, ready.committedEntries || []);
    if (applied.outcome !== CORE_OK) {
      return applied;
    }
    const light = invokeCoreAt(group, expectedGeneration, 'advance_append');
    if (!light.ok) {
      return light.result;
    }
    try {
      if (light.value.commitIndex !== undefined) {
        group.store.putCommitIndex(group.groupId, light.value.commitIndex);
      }
    } catch (error) {
      group.health = RECOVERY_REQUIRED;
      return hostFailure('light-ready-persistence', error, true);
    }
    const persistedCommit = light.value.commitIndex === undefined ? null :
      invokeCoreAt(group, expectedGeneration,
        'persist_commit_index', light.value.commitIndex);
    if (persistedCommit && !persistedCommit.ok) {
      return persistedCommit.result;
    }
    const lightSent = sendMessages(group, light.value.messages || []);
    return thenMaybe(lightSent, () => whenPersistenceAdmitted(group, () => {
      const lightApplied = applyEntries(
        group, expectedGeneration, light.value.committedEntries || []);
      if (lightApplied.outcome !== CORE_OK) {
        return lightApplied;
      }
      const advanced = invokeCoreAt(
        group, expectedGeneration, 'advance_apply');
      return advanced.ok ? outcome(CORE_OK, {reason: 'ready-advanced'}) :
        advanced.result;
    }, admissionWaitOutcomes(group)));
  }, admissionWaitOutcomes(group)));
  if (continuation && typeof continuation.then === 'function') {
    // Persistence and application failures remain host failures.
    return continuation.catch((error) => {
      group.health = RECOVERY_REQUIRED;
      return hostFailure(RUNTIME_PHASE.READY_DRAIN, error, true);
    });
  }
  return continuation;
}

function drainReady(group, expectedGeneration, cycles = 0) {
  if (cycles >= RAFT_RS_READY_DRAIN_MAX_CYCLES) {
    return hostFailure(
      RUNTIME_PHASE.READY_DRAIN,
      new Error(RUNTIME_REASON.READY_DRAIN_BOUND_EXCEEDED),
    );
  }
  const hasReady = invokeCoreAt(group, expectedGeneration, 'has_ready');
  if (!hasReady.ok) {
    return hasReady.result;
  }
  if (!hasReady.value) {
    announce(group, expectedGeneration);
    return outcome(CORE_OK, {reason: RUNTIME_REASON.DRAINED});
  }
  // Before take_ready: a refused Ready stays whole in the core.
  if (!persistenceAdmitted(group)) {
    return outcome(CORE_OK, {reason: RUNTIME_REASON.READY_DEFERRED});
  }
  const taken = invokeCoreAt(group, expectedGeneration, 'take_ready');
  if (!taken.ok) {
    return taken.result;
  }
  try {
    group.store.persistReady(group.groupId, taken.value);
  } catch (error) {
    group.health = RECOVERY_REQUIRED;
    return hostFailure(RUNTIME_PHASE.READY_PERSISTENCE, error, true);
  }
  const finished = finishReady(group, expectedGeneration, taken.value);
  return thenMaybe(finished, (result) => result.outcome === CORE_OK ?
    drainReady(group, expectedGeneration, cycles + 1) : result);
}

// The leader a role change announces. A leader this replica's registry never
// reserved is announced without an identity (the status names it UNRESERVED);
// only a registry that cannot be read is a host failure.
function semanticLeaderIdentity(group, lead) {
  if (lead === NO_LEADER) {
    return null;
  }
  try {
    const identity = group.resolvePeerIdentity(lead);
    return identity.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED ?
      identity.replicaIdentity : null;
  } catch {
    group.health = RECOVERY_REQUIRED;
    return null;
  }
}

function announce(group, expectedGeneration) {
  const status = invokeCoreAt(group, expectedGeneration, 'status');
  if (!status.ok) {
    return;
  }
  const now = status.value;
  const before = group.lastStatus;
  group.lastStatus = now;
  recordStatusObservation(group, expectedGeneration, now);
  if (before && now.raftState !== before.raftState) {
    group.emit(ROLE[now.raftState] || ROLE[0]);
  }
  if (before && now.term !== before.term) {
    group.emit(RUNTIME_EVENT.TERM_CHANGE, Number(now.term));
  }
  if (before && now.lead !== before.lead) {
    group.emit(
      RUNTIME_EVENT.LEADER_CHANGE,
      semanticLeaderIdentity(group, now.lead),
    );
  }
}

// The core's facts about a group (raw status and configuration); shaping them
// is separate, so recording them resolves no address.
function readGroupObservation(group, expectedGeneration, rawStatus = null) {
  const status = rawStatus === null ?
    invokeCoreAt(group, expectedGeneration, 'status') :
    {ok: true, value: rawStatus};
  if (!status.ok) {
    return status;
  }
  const conf = invokeCoreAt(
    group, expectedGeneration, CORE_OPERATION.CONF_STATE);
  if (!conf.ok) {
    return conf;
  }
  return {ok: true, value: {status: status.value, confState: conf.value,
    runtimeHealth, runtimeGeneration}};
}

function shapeGroupStatus(group, observation) {
  return shapeGroupObservation(group, observation, (error) => {
    group.health = RECOVERY_REQUIRED;
    return hostFailure(RUNTIME_PHASE.ADDRESS_RESOLUTION, error, true);
  });
}

function readGroupStatus(group, expectedGeneration) {
  const observed = recordStatusObservation(group, expectedGeneration);
  return observed.ok ? shapeGroupStatus(group, observed.value) :
    observed.result;
}

// Every drain that completes a core entry ends in announce, which records the
// core's facts here for readStatus to answer while the queue is busy.
function recordStatusObservation(group, expectedGeneration, rawStatus = null) {
  const observed = readGroupObservation(group, expectedGeneration, rawStatus);
  if (observed.ok) {
    group.statusObservation = observed.value;
  }
  return observed;
}

// readStatus answers synchronously: idle with nothing delivered, the fresh
// core read; otherwise (a read still drives delivered inbound, as before) the
// status of the last completed core entry.
function readStatusUndrained(group) {
  const ready = ensureExecution(group);
  return ready.outcome === CORE_OK ?
    readGroupStatus(group, runtimeGeneration) : ready;
}

function readStatusNow(group) {
  if ((group.tail === null && group.inbound.length === 0) ||
      group.statusObservation === null) {
    return readStatusUndrained(group);
  }
  if (group.inbound.length > 0) {
    const read = enqueue(group, () =>
      perform(group, {type: RUNTIME_COMMAND.READ_STATUS}));
    if (!read || typeof read.then !== 'function') {
      return read;
    }
    read.catch(() => undefined);
  }
  const observation = group.statusObservation;
  if (!SHAPED_STATUS.has(observation)) {
    SHAPED_STATUS.set(observation, shapeGroupStatus(group, observation));
  }
  return SHAPED_STATUS.get(observation);
}

function campaignGroup(group, expectedGeneration) {
  const status = invokeCoreAt(group, expectedGeneration, 'status');
  if (!status.ok) {
    return status.result;
  }
  const conf = invokeCoreAt(
    group, expectedGeneration, CORE_OPERATION.CONF_STATE);
  if (!conf.ok) {
    return conf.result;
  }
  if (!conf.value.voters.includes(group.peerId) ||
      conf.value.learners.includes(group.peerId) ||
      status.value.promotable !== true) {
    return outcome(CORE_REFUSED, {
      reason: RUNTIME_REASON.NOT_ACTIVE_VOTER,
      phase: RUNTIME_PHASE.CAMPAIGN_ELIGIBILITY,
      retryable: false, recoveryRequired: false,
    });
  }
  const campaigned = invokeCoreAt(group, expectedGeneration, 'campaign');
  return campaigned.ok ? drainReady(group, expectedGeneration) :
    campaigned.result;
}

function probeRefusal(reason) {
  return outcome(CORE_REFUSED, {
    reason, phase: RUNTIME_PHASE.PROGRESS_PROBE,
    retryable: false, recoveryRequired: false,
  });
}

// The configured peer (other than this replica) whose resolved address is
// the probed one; an unreserved or unresolvable peer is no match.
function configuredPeerAt(group, confState, peerAddress) {
  return [...confState.voters, ...confState.learners].find((id) => {
    if (id === group.peerId) {
      return false;
    }
    try {
      return group.resolvePeerAddress(id) === peerAddress;
    } catch {
      return false;
    }
  });
}

// One heartbeat interval of the leader: raft-rs broadcasts its heartbeat on
// the tick that completes the interval, and a peer's heartbeat response is
// what makes the leader send it the append its matched index lacks. The
// binding exposes no per-peer send, so this is the one core path to a probe.
function driveOneHeartbeat(group, expectedGeneration) {
  for (let tick = 0; tick < RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK; tick += 1) {
    const ticked = invokeCoreAt(group, expectedGeneration, 'tick');
    if (!ticked.ok) {
      return ticked.result;
    }
    const hasReady = invokeCoreAt(group, expectedGeneration, 'has_ready');
    if (!hasReady.ok) {
      return hasReady.result;
    }
    if (hasReady.value) {
      break;
    }
  }
  return drainReady(group, expectedGeneration);
}

// The progress probe: a peer whose matched index already reaches the commit
// index is observed; a peer behind it gets one heartbeat round through the
// core; an address outside the configuration, or a probe on a replica that is
// not the leader, is a typed refusal (a non-leader must never tick here).
function probePeerProgress(group, expectedGeneration, peerAddress) {
  const observed = readGroupObservation(group, expectedGeneration);
  if (!observed.ok) {
    return observed.result;
  }
  const {status, confState} = observed.value;
  const peerId = configuredPeerAt(group, confState, peerAddress);
  if (peerId === undefined) {
    return probeRefusal(RUNTIME_REASON.NOT_A_PEER);
  }
  if (ROLE[status.raftState] !== ROLE_LEADER) {
    return probeRefusal(RUNTIME_REASON.NOT_LEADER);
  }
  const progress = (status.progress || []).find((item) =>
    String(item?.id) === String(peerId));
  const matched = BigInt(progress?.matched ?? RAFT_RS_INITIAL_APPLIED);
  const matchIndex = Number(matched);
  if (matched >= BigInt(status.commit)) {
    return outcome(CORE_OK, {
      reason: RUNTIME_REASON.PROGRESS_OBSERVED, matchIndex,
    });
  }
  return thenMaybe(driveOneHeartbeat(group, expectedGeneration), (result) =>
    result.outcome === CORE_OK ? outcome(CORE_OK, {
      reason: RUNTIME_REASON.PROGRESS_PROBE_SENT, matchIndex,
    }) : result);
}

function performCommand(group, command, expectedGeneration) {
  if (command.type === RUNTIME_COMMAND.READ_STATUS) {
    return readGroupStatus(group, expectedGeneration);
  }
  if (command.type === RUNTIME_COMMAND.CAMPAIGN) {
    return campaignGroup(group, expectedGeneration);
  }
  if (command.type === RUNTIME_COMMAND.DRAIN_INBOUND) {
    return outcome(CORE_OK, {reason: RUNTIME_REASON.INBOUND_DRAINED});
  }
  if (command.type === RUNTIME_COMMAND.PROBE_PEER_PROGRESS) {
    return probePeerProgress(group, expectedGeneration, command.peerAddress);
  }
  const primitive = {
    'tick': ['tick', []],
    'propose': ['propose', [command.bytes]],
    'propose-conf-change': ['propose_conf_change_v2', [command.change]],
  }[command.type];
  if (!primitive) {
    return outcome(CORE_REFUSED, {
      reason: RUNTIME_REASON.UNKNOWN_OPERATION,
      phase: RUNTIME_PHASE.DISPATCH, retryable: false,
      recoveryRequired: false,
    });
  }
  const invoked = invokeCoreAt(
    group, expectedGeneration, primitive[0], ...primitive[1]);
  return invoked.ok ? drainReady(group, expectedGeneration) : invoked.result;
}

function drainInbound(group, expectedGeneration, continuation) {
  if (group.inbound.length === 0) {
    return continuation();
  }
  const envelope = group.inbound.shift();
  const stepped = invokeCoreAt(
    group, expectedGeneration, 'step', envelope.message);
  if (!stepped.ok) {
    return stepped.result;
  }
  return thenMaybe(drainReady(group, expectedGeneration), (result) =>
    result.outcome === CORE_OK ?
      drainInbound(group, expectedGeneration, continuation) : result);
}

function perform(group, command) {
  // While a user transaction holds the connection nothing enters the core:
  // a status is read without draining, and every other command is a typed,
  // retryable deferral that leaves the group usable.
  if (!persistenceAdmitted(group)) {
    return command.type === RUNTIME_COMMAND.READ_STATUS ?
      readStatusUndrained(group) : hostFailure(
        RUNTIME_PHASE.READY_PERSISTENCE, RUNTIME_REASON.USER_TRANSACTION_OPEN);
  }
  const ready = ensureExecution(group);
  if (ready.outcome !== CORE_OK) {
    return ready;
  }
  const expectedGeneration = runtimeGeneration;
  return drainInbound(group, expectedGeneration,
    () => performCommand(group, command, expectedGeneration));
}

// step() hands the runtime an envelope; the runtime drives it through the
// core itself. The drain is scheduled once per burst of deliveries, on the
// group's next turn of its own clock (so a delivery never re-enters the core
// inside its sender's Ready, and an operation already asked for on this turn
// drains the envelopes first), and enters the core through the group's queue,
// admitted by the port's lifecycle owner like every other entry. It is not a
// tick: a replica whose scheduling is stopped never campaigns from it.
// While a user transaction holds the connection nothing enters the core: the
// envelopes stay queued and the drain retries on the group's own timers,
// outside the queue, until the store admits persistence again or the
// admission bound passes (then the next operation drains them).
function scheduleInboundDrain(group) {
  if (group.inboundDrainScheduled) {
    return;
  }
  group.inboundDrainScheduled = true;
  group.timers.setTimeout(() => runScheduledInboundDrain(group),
    INBOUND_DRAIN_DELAY_MS)?.unref?.();
}

function retryInboundDrainWhenAdmitted(group) {
  if (group.inboundDrainDeadline === null) {
    group.inboundDrainDeadline =
      group.timers.now() + PERSISTENCE_ADMISSION_WAIT.BOUND_MS;
  }
  if (group.timers.now() >= group.inboundDrainDeadline) {
    group.inboundDrainDeadline = null;
    return;
  }
  group.inboundDrainScheduled = true;
  group.timers.setTimeout(() => runScheduledInboundDrain(group),
    PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS)?.unref?.();
}

function runScheduledInboundDrain(group) {
  group.inboundDrainScheduled = false;
  if (group.closed || group.inbound.length === 0) {
    group.inboundDrainDeadline = null;
    return;
  }
  if (!persistenceAdmitted(group)) {
    retryInboundDrainWhenAdmitted(group);
    return;
  }
  group.inboundDrainDeadline = null;
  const drained = group.admitScheduledEntry(() => enqueue(group, () =>
    perform(group, {type: RUNTIME_COMMAND.DRAIN_INBOUND})));
  if (drained && typeof drained.catch === 'function') {
    drained.catch(() => undefined);
  }
}

function snapshotEnvelope(envelope) {
  return deepFreeze({
    ...envelope,
    message: envelope.message && typeof envelope.message === 'object' ?
      {...envelope.message} : envelope.message,
  });
}

function createRuntimeDispatcher(request) {
  const store = new RaftRsDurableStore(request.database);
  const group = {
    key: nextGroupKey++,
    groupId: request.groupId,
    replicaIdentity: request.replicaIdentity,
    peerId: request.peerId,
    voters: request.voters,
    timing: request.timing,
    timers: request.timers,
    store,
    sendToPeer: request.sendToPeer,
    resolvePeerAddress: request.resolvePeerAddress,
    resolvePeerIdentity: request.resolvePeerIdentity,
    applyCommittedEntry: request.applyCommittedEntry,
    applyTransactionRolledBack: request.applyTransactionRolledBack,
    admitScheduledEntry: request.admitScheduledEntry,
    emit: request.emit,
    handle: null,
    lastStatus: null,
    statusObservation: null,
    health: USABLE,
    tail: null,
    inbound: [],
    inboundDrainScheduled: false,
    inboundDrainDeadline: null,
    peerDelivery: new Map(),
    closed: false,
  };
  groups.set(group.key, group);
  const opened = openGroupInCurrentRuntime(
    group, store.hasDurableRecord(group.groupId));
  if (opened.outcome !== CORE_OK) {
    groups.delete(group.key);
    throw new Error(opened.reason);
  }
  const first = invokeCore(group, 'status');
  if (first.ok) {
    group.lastStatus = first.value;
    recordStatusObservation(group, runtimeGeneration, first.value);
  }
  return Object.freeze({
    enqueueStep: Object.freeze((envelope) => {
      const admission = admitRaftRsMessage({
        envelope,
        localGroupId: group.groupId,
        localPeerId: group.peerId,
      });
      if (!admission.admitted) {
        return outcome(CORE_REFUSED, {
          reason: admission.outcome,
          phase: RUNTIME_PHASE.ADMISSION,
          retryable: false,
          recoveryRequired: false,
        });
      }
      group.inbound.push(snapshotEnvelope(envelope));
      scheduleInboundDrain(group);
      return outcome(CORE_OK, {reason: RUNTIME_REASON.INBOUND_ENQUEUED});
    }),
    execute: Object.freeze((command) =>
      command?.type === RUNTIME_COMMAND.READ_STATUS ? readStatusNow(group) :
        enqueue(group, () => perform(group, command))),
    configureTiming: Object.freeze((timing) => {
      group.timing = deepFreeze({...group.timing, ...timing});
      return true;
    }),
    close: Object.freeze(({enterCore}) => {
      group.closed = true;
      groups.delete(group.key);
      if (!enterCore || group.handle === null || runtimeHealth !== HEALTHY ||
          group.health === RECOVERY_REQUIRED) {
        return outcome(CORE_OK, {
          reason: RUNTIME_REASON.CLOSED_WITHOUT_CORE_ENTRY,
        });
      }
      const freed = invokeCore(group, 'free');
      return freed.ok ? outcome(CORE_OK, {reason: RUNTIME_REASON.CLOSED}) :
        freed.result;
    }),
  });
}

function setActualCoreEntryObserver(observer) {
  actualCoreEntryObserver = typeof observer === 'function' ? observer : null;
}

export {
  CORE_OK,
  CORE_REFUSED,
  createRuntimeDispatcher,
  setActualCoreEntryObserver,
};
