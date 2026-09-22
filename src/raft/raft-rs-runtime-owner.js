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
import {
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
} from './raft-rs-ready-loop-constants.js';
import {
  RAFT_RS_GROUP_TUNING,
  RAFT_RS_INITIAL_APPLIED,
  RAFT_RS_READY_DRAIN_MAX_CYCLES,
} from './raft-rs-group-constants.js';
import {applyCommittedEntryTransaction} from
  './raft-rs-application-transaction-owner.js';
import {RAFT_EVENT} from './constants.js';
import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';

const {
  CORE_OK,
  CORE_REFUSED,
  CORE_FATAL,
  HOST_FAILURE,
} = RAFT_OPERATION_OUTCOME;
const HEALTHY = 'healthy';
const UNHEALTHY = 'unhealthy';
const USABLE = 'usable';
const RECOVERY_REQUIRED = 'recovery-required';
const NO_LEADER = '0';
const CORE_REFUSAL_KIND = 'raft-rs-refusal';
const ROLE = Object.freeze({
  0: 'follower',
  1: 'candidate',
  2: 'leader',
  3: 'pre-candidate',
});
const CORE_CALL_WITHOUT_HANDLE = new Set([
  'create_node',
  'decode_conf_change_entry',
]);
const CORE_OPERATION = Object.freeze({CONF_STATE: 'conf_state'});
const RUNTIME_COMMAND = Object.freeze({
  READ_STATUS: 'read-status',
  CAMPAIGN: 'campaign',
});
const RUNTIME_EVENT = Object.freeze({
  TERM_CHANGE: RAFT_EVENT.TERM_CHANGE,
  LEADER_CHANGE: RAFT_EVENT.LEADER_CHANGE,
});
const PEER_ADDRESS_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  UNAVAILABLE: 'unavailable',
});
const RUNTIME_PHASE = Object.freeze({
  GENERATION_CHANGED: 'runtime-generation-changed',
  BOOTSTRAP_PERSISTENCE: 'bootstrap-persistence',
  ADDRESS_RESOLUTION: 'address-resolution',
  SEND: 'send',
  SEND_NO_HANDLER: 'send-no-handler',
  APPLICATION: 'application',
  READY_DRAIN: 'ready-drain',
  READY_PERSISTENCE: 'ready-persistence',
  CAMPAIGN_ELIGIBILITY: 'campaign-eligibility',
  DISPATCH: 'dispatch',
  ADMISSION: 'admission',
});
const RUNTIME_REASON = Object.freeze({
  CORE_REFUSED: 'core-refused',
  GENERATION_CHANGED:
    'execution generation changed while host work was pending',
  RESTORED: 'restored',
  CREATED: 'created',
  RUNTIME_RECONSTRUCTED: 'runtime-reconstructed',
  EXECUTION_USABLE: 'execution-usable',
  ENTRIES_APPLIED: 'entries-applied',
  READY_DRAIN_BOUND_EXCEEDED: 'ready drain bound exceeded',
  DRAINED: 'drained',
  UNKNOWN: 'unknown',
  NOT_ACTIVE_VOTER: 'not-an-active-voter',
  UNKNOWN_OPERATION: 'unknown-operation',
  INBOUND_ENQUEUED: 'inbound-enqueued',
  CLOSED_WITHOUT_CORE_ENTRY: 'closed-without-core-entry',
  CLOSED: 'closed',
});
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

function tuningOf(timing = {}) {
  const heartbeatMs = Number(timing.heartbeatMs);
  const electionMinMs = Number(timing.electionMinMs);
  const tickIntervalMs = Number(timing.tickIntervalMs);
  const heartbeatTick = RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK;
  const derivedTickMs = Number.isFinite(tickIntervalMs) && tickIntervalMs > 0 ?
    tickIntervalMs : Math.max(1, Math.floor(heartbeatMs / heartbeatTick));
  return {
    electionTick: Number.isFinite(electionMinMs) ?
      Math.max(heartbeatTick + 1, Math.ceil(electionMinMs / derivedTickMs)) :
      RAFT_RS_GROUP_TUNING.ELECTION_TICK,
    heartbeatTick,
    preVote: RAFT_RS_GROUP_TUNING.PRE_VOTE,
    checkQuorum: RAFT_RS_GROUP_TUNING.CHECK_QUORUM,
  };
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

function replaceRuntime() {
  core = null;
  runtimeHealth = HEALTHY;
  ensureCore();
  for (const group of groups.values()) {
    if (group.closed || !group.store.hasDurableRecord(group.groupId)) {
      continue;
    }
    const restored = openGroupInCurrentRuntime(group, true);
    if (restored.outcome !== CORE_OK) {
      return restored;
    }
  }
  return outcome(CORE_OK, {reason: RUNTIME_REASON.RUNTIME_RECONSTRUCTED});
}

function ensureExecution(group) {
  if (runtimeHealth !== HEALTHY || group.health === RECOVERY_REQUIRED) {
    return replaceRuntime();
  }
  return outcome(CORE_OK, {reason: RUNTIME_REASON.EXECUTION_USABLE});
}

function enqueue(group, work) {
  if (group.tail === null) {
    const result = work();
    if (result && typeof result.then === 'function') {
      const token = Promise.resolve(result);
      group.tail = token.finally(() => {
        if (group.tail === token) {
          group.tail = null;
        }
      });
      return group.tail;
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

function sendMessages(group, messages, index = 0) {
  if (index >= messages.length) {
    return null;
  }
  const message = messages[index];
  let address;
  try {
    address = group.resolvePeerAddress(message.to);
  } catch (error) {
    throw Object.assign(error, {hostPhase: RUNTIME_PHASE.ADDRESS_RESOLUTION});
  }
  let delivered;
  try {
    delivered = group.sendToPeer(address, {
      groupId: group.groupId,
      to: message.to,
      message,
    });
  } catch (error) {
    throw Object.assign(error, {hostPhase: RUNTIME_PHASE.SEND});
  }
  return thenMaybe(delivered, (delivery) => {
    if (delivery && typeof delivery === 'object' &&
        (delivery.noHandler === true || delivery.deferRetry === true ||
          delivery.acknowledged === false || delivery.error)) {
      const error = new Error(
        String(delivery.error || delivery.reason || 'raft delivery failed'));
      error.hostPhase = delivery.noHandler ? RUNTIME_PHASE.SEND_NO_HANDLER :
        RUNTIME_PHASE.SEND;
      throw error;
    }
    return sendMessages(group, messages, index + 1);
  });
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
  let sent;
  try {
    sent = sendMessages(group, [
      ...(ready.messages || []),
      ...(ready.persistedMessages || []),
    ]);
  } catch (error) {
    group.health = RECOVERY_REQUIRED;
    return hostFailure(error.hostPhase || RUNTIME_PHASE.SEND, error, true);
  }
  const continuation = thenMaybe(sent, () => {
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
    let lightSent;
    try {
      lightSent = sendMessages(group, light.value.messages || []);
    } catch (error) {
      group.health = RECOVERY_REQUIRED;
      return hostFailure(error.hostPhase || RUNTIME_PHASE.SEND, error, true);
    }
    return thenMaybe(lightSent, () => {
      const lightApplied = applyEntries(
        group, expectedGeneration, light.value.committedEntries || []);
      if (lightApplied.outcome !== CORE_OK) {
        return lightApplied;
      }
      const advanced = invokeCoreAt(
        group, expectedGeneration, 'advance_apply');
      return advanced.ok ? outcome(CORE_OK, {reason: 'ready-advanced'}) :
        advanced.result;
    });
  });
  if (continuation && typeof continuation.then === 'function') {
    return continuation.catch((error) => {
      group.health = RECOVERY_REQUIRED;
      return hostFailure(error.hostPhase || RUNTIME_PHASE.SEND, error, true);
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

function semanticLeaderIdentity(group, lead) {
  if (lead === NO_LEADER) {
    return null;
  }
  try {
    return group.resolvePeerIdentity(lead);
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

function peerSnapshot(group, confState) {
  return [...confState.voters, ...confState.learners]
    .filter((id) => id !== group.peerId)
    .map((id) => {
      const replicaIdentity = group.resolvePeerIdentity(id);
      let address = null;
      let addressStatus = PEER_ADDRESS_STATUS.RESOLVED;
      try {
        address = group.resolvePeerAddress(id);
      } catch {
        // Status is an observation. A temporarily unavailable address is not
        // a Ready failure and must not invalidate the execution container.
        addressStatus = PEER_ADDRESS_STATUS.UNAVAILABLE;
      }
      return {
        peerId: id,
        replicaIdentity,
        address,
        addressStatus,
        learner: confState.learners.includes(id),
      };
    });
}

function followerProgressSnapshot(group, status) {
  const progress = Array.isArray(status?.progress) ? status.progress : [];
  const snapshot = {};
  for (const item of progress) {
    if (String(item?.id) === String(group.peerId)) {
      continue;
    }
    const matched = Number(item?.matched);
    if (!Number.isFinite(matched)) {
      continue;
    }
    let address = null;
    try {
      address = group.resolvePeerAddress(item.id);
    } catch {
      continue;
    }
    if (typeof address === 'string' && address.length > 0) {
      snapshot[address] = matched;
    }
  }
  return snapshot;
}

function readGroupStatus(group, expectedGeneration) {
  const status = invokeCoreAt(group, expectedGeneration, 'status');
  if (!status.ok) {
    return status.result;
  }
  const conf = invokeCoreAt(
    group, expectedGeneration, CORE_OPERATION.CONF_STATE);
  if (!conf.ok) {
    return conf.result;
  }
  let leaderId = null;
  let leaderAddress = null;
  try {
    leaderId = status.value.lead === NO_LEADER ? null :
      group.resolvePeerIdentity(status.value.lead);
  } catch (error) {
    group.health = RECOVERY_REQUIRED;
    return hostFailure(RUNTIME_PHASE.ADDRESS_RESOLUTION, error, true);
  }
  if (status.value.lead !== NO_LEADER) {
    try {
      leaderAddress = group.resolvePeerAddress(status.value.lead);
    } catch {
      // A network address can lag membership/identity without invalidating
      // the consensus runtime. Status reports the identity and a null address.
      leaderAddress = null;
    }
  }
  return deepFreeze({
    outcome: CORE_OK,
    groupId: group.groupId,
    replicaIdentity: group.replicaIdentity,
    peerId: group.peerId,
    term: Number(status.value.term),
    commitIndex: Number(status.value.commit),
    role: ROLE[status.value.raftState] || RUNTIME_REASON.UNKNOWN,
    leaderId,
    leaderAddress,
    peerCount: Math.max(0,
      conf.value.voters.length + conf.value.learners.length - 1),
    peers: peerSnapshot(group, conf.value),
    followerProgress: followerProgressSnapshot(group, status.value),
    confState: conf.value,
    runtimeHealth,
    groupHealth: group.health,
    runtimeGeneration,
  });
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

function performCommand(group, command, expectedGeneration) {
  if (command.type === RUNTIME_COMMAND.READ_STATUS) {
    return readGroupStatus(group, expectedGeneration);
  }
  if (command.type === RUNTIME_COMMAND.CAMPAIGN) {
    return campaignGroup(group, expectedGeneration);
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
  const ready = ensureExecution(group);
  if (ready.outcome !== CORE_OK) {
    return ready;
  }
  const expectedGeneration = runtimeGeneration;
  return drainInbound(group, expectedGeneration,
    () => performCommand(group, command, expectedGeneration));
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
    store,
    sendToPeer: request.sendToPeer,
    resolvePeerAddress: request.resolvePeerAddress,
    resolvePeerIdentity: request.resolvePeerIdentity,
    applyCommittedEntry: request.applyCommittedEntry,
    applyTransactionRolledBack: request.applyTransactionRolledBack,
    emit: request.emit,
    handle: null,
    lastStatus: null,
    health: USABLE,
    tail: null,
    inbound: [],
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
      return outcome(CORE_OK, {reason: RUNTIME_REASON.INBOUND_ENQUEUED});
    }),
    execute: Object.freeze((command) => enqueue(group,
      () => perform(group, command))),
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
