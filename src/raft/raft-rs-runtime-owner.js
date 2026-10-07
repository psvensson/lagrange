import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

import {resolveModuleDirectory, resolvePackagedRuntimeFile} from
  '../sea/runtime-file-resolution.js';
import {
  RAFT_RS_BINDING_LAYOUT,
  RAFT_RS_BINDING_STATE,
  RAFT_RS_CORE_ERROR_MSG,
  RAFT_RS_CORE_PRIMITIVES,
  RAFT_RS_DIGEST_ALGORITHM,
  RAFT_RS_DIGEST_ENCODING,
  RAFT_RS_DIGEST_KEY,
  RAFT_RS_FORBIDDEN_CONVENIENCE,
  RAFT_RS_WASM_FILE,
} from './raft-rs-core-constants.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {
  RAFT_RS_RECORD_COMPATIBILITY,
} from './raft-rs-durable-store-constants.js';
import {admitRaftRsMessage} from './raft-rs-ingress.js';
import {RAFT_RS_MESSAGE_TYPE} from './raft-rs-ingress-constants.js';
import {
  recordInboundStepRefusal,
  sendMessages,
} from './raft-rs-peer-delivery.js';
import {
  openedLastIndex,
  persistedLastIndexAfter,
} from './raft-rs-local-log-guard.js';
import {
  recordReseedHold,
  refuseInboundStep,
  reportCoreTrap,
  reportRuntimeReplaced,
  reportWaitBoundExceeded,
} from './raft-rs-runtime-faults.js';
import {
  decideLeadershipTransfer,
  droppedByLeadershipTransfer,
  leadershipTransferInProgress,
} from './raft-rs-leadership-transfer.js';
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
  CONF_STATE_NOT_ANNOUNCED,
  CORE_CALL_WITHOUT_HANDLE,
  CORE_OPERATION,
  CORE_REFUSAL_KIND,
  DURABLE_PROGRESS_OBSERVATION,
  FOLLOWER_RAFT_STATE,
  HEALTHY,
  INBOUND_DRAIN_DELAY_MS,
  NO_LEADER,
  PERSISTENCE_ADMISSION_WAIT,
  RECOVERY_REQUIRED,
  ROLE,
  ROLE_LEADER,
  RUNTIME_COMMAND,
  RUNTIME_FAULT_REPORT,
  RUNTIME_EVENT,
  RUNTIME_PHASE,
  RUNTIME_REASON,
  UNHEALTHY,
  USABLE,
} from './raft-rs-runtime-owner-constants.js';
import {
  recoveryRetryWindowMsOf,
  tuningOf,
} from './raft-rs-runtime-tuning.js';
import {shapeGroupObservation} from './raft-rs-status-observation.js';
import {
  confChangeProposalRefusal,
  confChangeSettlement,
} from './raft-rs-conf-change-admission.js';
import {
  admitsReplica,
  createdParticipationGate,
  recordAppliedEntry,
  durableRecordIncompatible,
  identityUnrecorded,
  participationGateClosed,
  participationGateColumns,
  participationObservation,
  openingWithoutRecordRefusal,
  restoredParticipationGate,
  recordIdentity,
  settleParticipationGate,
  withIdentityRecord,
} from './raft-rs-participation-gate.js';
import {answerCommittedMembership} from
  './raft-rs-committed-membership-read.js';
import {applyCommittedEntryTransaction} from
  './raft-rs-application-transaction-owner.js';
import {
  persistenceAdmitted,
  whenPersistenceAdmitted,
} from './raft-rs-persistence-admission.js';
import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {PARTICIPATION_GATE} from './raft-committed-membership-constants.js';

const {CORE_OK, CORE_REFUSED, CORE_FATAL, HOST_FAILURE} = RAFT_OPERATION_OUTCOME;

// Resolved when the core is first needed, never at module load: the resolver
// owns where source, the dist bundle and the SEA executable keep the binding.
function bindingFiles() {
  const {DIGEST_FROM_ROOT, SOURCE_ROOT_FROM_OWNER} = RAFT_RS_BINDING_LAYOUT;
  const digest = resolvePackagedRuntimeFile({
    moduleDir: resolveModuleDirectory(resolveModuleDirectory),
    sourceFileName: path.join(...SOURCE_ROOT_FROM_OWNER, ...DIGEST_FROM_ROOT),
    bundledFileName: path.join(...DIGEST_FROM_ROOT),
  });
  const pkg = path.join(path.dirname(digest), RAFT_RS_WASM_FILE.PACKAGE_DIRECTORY);
  return {digest, glue: path.join(pkg, RAFT_RS_WASM_FILE.GLUE),
    wasm: path.join(pkg, RAFT_RS_WASM_FILE.WASM)};
}

function fileDigest(file) {
  return createHash(RAFT_RS_DIGEST_ALGORITHM)
    .update(fs.readFileSync(file))
    .digest(RAFT_RS_DIGEST_ENCODING);
}

function assertArtifactIntegrity(binding) {
  const digest = JSON.parse(fs.readFileSync(binding.digest, 'utf8'));
  const files = [
    [RAFT_RS_WASM_FILE.WASM, binding.wasm, digest[RAFT_RS_DIGEST_KEY.WASM]],
    [RAFT_RS_WASM_FILE.GLUE, binding.glue, digest[RAFT_RS_DIGEST_KEY.GLUE]],
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

function instantiateRaftRsCore(binding = bindingFiles()) {
  assertArtifactIntegrity(binding);
  const requireBinding = createRequire(binding.glue);
  delete requireBinding.cache[requireBinding.resolve(binding.glue)];
  return facadeOf(requireBinding(binding.glue));
}

// The core's own integrity check and load, answered as a state for the dry
// run; the loaded facade is discarded and never entered.
function verifyRaftRsBinding() {
  const binding = bindingFiles();
  const found = {digestFile: binding.digest};
  try {
    instantiateRaftRsCore(binding);
    return deepFreeze({state: RAFT_RS_BINDING_STATE.VERIFIED, ...found});
  } catch (error) {
    return deepFreeze({state: RAFT_RS_BINDING_STATE.UNAVAILABLE, ...found,
      reason: String(error?.message || error)});
  }
}

let core = null;
let runtimeHealth = HEALTHY;
let runtimeGeneration = 0;
let nextGroupKey = 1;
let actualCoreEntries = 0;
let actualCoreEntryObserver = null;
// A test's fault at the core boundary: called inside the core call's
// containment with the group, the operation and its arguments, it may throw
// as the core itself would (a WebAssembly.RuntimeError is a trap). No peer
// input can trap the core once the ingress refuses every shape raft-rs
// traps on, so the trap witnesses inject theirs here. Never set in
// production.
let coreFaultInjector = null;
const groups = new Map();
// A recorded observation is shaped once, when a busy-queue read asks for it.
const SHAPED_STATUS = new WeakMap();

function outcome(outcomeName, fields = {}) {
  return deepFreeze({outcome: outcomeName, ...fields});
}

function hostFailure(phase, error, recoveryRequired = false) {
  return outcome(HOST_FAILURE, {
    reason: String(error?.message || error),
    ...(error?.detail && typeof error.detail === 'object' ?
      {detail: error.detail} : {}),
    phase,
    retryable: true,
    recoveryRequired,
  });
}

// A committed-entry application may name its own failure: a typed `reason`
// with a `detail` object is carried as the host failure's reason and detail;
// any other failure is its message.
function applicationFailureOf(error) {
  return typeof error?.reason === 'string' && error.reason.length > 0 ?
    {message: error.reason, detail: error.detail} : error;
}

// The group has no role and no leader while it is unusable: announced once,
// through the role and leader events every announcement uses, so a partition's
// leadership observation follows its port. The group's next announcement
// after it is reconstructed names its real role.
function announceNoRole(group) {
  const before = group.lastStatus;
  if (before === null) {
    return;
  }
  group.lastStatus = {...before, raftState: FOLLOWER_RAFT_STATE,
    lead: NO_LEADER};
  if (before.raftState !== FOLLOWER_RAFT_STATE) {
    group.emit(ROLE[FOLLOWER_RAFT_STATE]);
  }
  if (before.lead !== NO_LEADER) {
    group.emit(RUNTIME_EVENT.LEADER_CHANGE, null);
  }
}

// The group's durable progress as its durable record holds it now: an
// observation for a held group's status (nothing writes the record while
// the group is held), or the named state that it could not be read.
function durableProgressOf(group) {
  try {
    const progress = group.store.readDurableProgress(group.groupId);
    return deepFreeze({
      state: DURABLE_PROGRESS_OBSERVATION.OBSERVED,
      commitIndex: Number(progress.commitIndex),
      appliedIndex: Number(progress.appliedIndex),
    });
  } catch (error) {
    return deepFreeze({
      state: DURABLE_PROGRESS_OBSERVATION.UNREADABLE,
      reason: String(error?.message || error),
    });
  }
}

// A group's recovery record: the failure that holds it (its class: phase,
// reason, detail), the last instant that failure held the group (when it was
// recorded, when a reconstruction it caused began, or when that
// reconstruction restored the group), how many reconstructions it has cost,
// when the next one is due, and the group's durable progress as last read.
//
// Whether a failure persists is decided by time, not by where it recurs: a
// failure within one retry window of the last instant the previous one held
// the group is the same failure - whether or not a reconstruction succeeded
// in between - so its attempts accumulate and the next reconstruction waits
// one window from it. A failure later than that starts a fresh record,
// attempted at once; a record no failure renewed for a whole window is
// cleared.
function failurePersists(group, now) {
  return group.recovery !== null &&
    now - group.recovery.heldAt < recoveryRetryWindowMsOf(group.timing);
}

// A fresh record's first reconstruction is due at once.
function freshRecovery(group, failure, now) {
  return {failure, heldAt: now, attempts: 0, retryNotBefore: now,
    durableProgress: durableProgressOf(group)};
}

// A host failure (persistence, application, delivery bookkeeping) is the
// failing group's alone: the group becomes RECOVERY_REQUIRED and remembers the
// failure that holds it there; no other group and not the shared core is
// affected.
function groupFailed(group, failed) {
  const now = group.timers.now();
  const failure = deepFreeze({
    phase: failed.phase,
    reason: failed.reason,
    ...(failed.detail === undefined ? {} : {detail: failed.detail}),
  });
  group.recovery = failurePersists(group, now) ? {
    ...group.recovery,
    failure,
    heldAt: now,
    retryNotBefore: now + recoveryRetryWindowMsOf(group.timing),
    durableProgress: durableProgressOf(group),
  } : freshRecovery(group, failure, now);
  group.health = RECOVERY_REQUIRED;
  announceNoRole(group);
  return failed;
}

function groupHostFailure(group, phase, error) {
  return groupFailed(group, hostFailure(phase, error, true));
}

// A durable record the store could not read: its message, and as its detail
// the record table the store names and SQLite's own code.
function durableRecordReadFailure(error) {
  return {
    message: String(error?.message || error),
    detail: {
      ...(typeof error?.table === 'string' ? {table: error.table} : {}),
      ...(typeof error?.code === 'string' ? {code: error.code} : {}),
    },
  };
}

// What a group's node is opened from: its durable record when the store
// holds one (restore), its bootstrap voters when it holds none (create). A
// record that cannot be read - a missing table, SQLITE_IOERR, SQLITE_CORRUPT -
// is the group's own host failure: the group is held by it (its retry window
// engages as for any persisting failure), nothing is opened from what could
// not be read, and no other group is touched.
function readOpeningRecord(group) {
  try {
    if (group.store.recordCompatibility() ===
        RAFT_RS_RECORD_COMPATIBILITY.PRE_GATE) {
      return {ok: false, result: durableRecordIncompatible()};
    }
    const restore = group.store.hasDurableRecord(group.groupId);
    return {ok: true, restore,
      record: restore ? group.store.readDurableRecord(group.groupId) : null};
  } catch (error) {
    return {ok: false, result: groupHostFailure(group,
      RUNTIME_PHASE.DURABLE_RECORD_READ, durableRecordReadFailure(error))};
  }
}

// A throw the runtime did not type, contained by the group's port: the
// group's own host failure (phase unexpected-throw), recorded like any other,
// so the group is held and reconstructed from its durable record at most once
// per retry window, and answered as the held group's typed status. The record
// is written before the group's lost role is announced; an announcement that
// throws in turn leaves that record as written and is the answer's reason, so
// containing a throw never throws.
function containUnexpectedThrow(group, error) {
  const failed = hostFailure(RUNTIME_PHASE.UNEXPECTED_THROW, error, true);
  try {
    groupFailed(group, failed);
  } catch (announcementError) {
    return recoveryOutcome(group,
      String(announcementError?.message || announcementError));
  }
  return recoveryOutcome(group, failed.reason);
}

function admissionWaitOutcomes(group) {
  return {
    closed: () => outcome(CORE_REFUSED, {
      reason: RUNTIME_REASON.CLOSED, phase: RUNTIME_PHASE.READY_PERSISTENCE,
      retryable: false, recoveryRequired: false,
    }),
    exceeded: () => {
      reportWaitBoundExceeded(group,
        RUNTIME_FAULT_REPORT.PERSISTENCE_ADMISSION_BOUND_EXCEEDED, {
          phase: RUNTIME_PHASE.READY_PERSISTENCE,
          reason: RUNTIME_REASON.USER_TRANSACTION_OPEN,
        });
      return groupHostFailure(group, RUNTIME_PHASE.READY_PERSISTENCE,
        RUNTIME_REASON.USER_TRANSACTION_OPEN);
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
    coreFaultInjector?.(group.groupId, operation, args);
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
    reportCoreTrap(group, operation, args, String(error?.message || error),
      runtimeGeneration);
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

// A continuation from before a core replacement, or of a group that failed
// earlier in the same operation, enters no core. A replacement restored every
// group from its durable record, so a stale continuation marks nothing.
function invokeCoreAt(group, expectedGeneration, operation, ...args) {
  if (expectedGeneration !== runtimeGeneration ||
      runtimeHealth !== HEALTHY || group.health === RECOVERY_REQUIRED) {
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

// The core's create_node arguments for what readOpeningRecord read.
function createNodeArguments(group, {restore, record}) {
  const base = {
    id: group.peerId,
    peers: restore ? [] : group.bootstrap.voters,
    learners: restore ? [] : group.bootstrap.learners,
    applied: restore ? record.appliedIndex : RAFT_RS_INITIAL_APPLIED,
    ...tuningOf(group.timing),
  };
  if (!restore) {
    return base;
  }
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

// The participation gate an opening establishes (O1 gate): restored from the
// durable record, or created from the bootstrap; a replica that must restore
// and holds no record is refused before the core is entered (O4), and one
// whose identity provably existed before is held for a reseed by its
// lifecycle owner, durably (the open-time rule): it never opens empty.
function openingParticipationRefusal(group, opening) {
  if (opening.restore) {
    group.gate = withIdentityRecord(
      restoredParticipationGate(opening.record), group.identityRecorded);
    group.appliedIndex = BigInt(opening.record.appliedIndex);
    return null;
  }
  const refused = openingWithoutRecordRefusal(group.bootstrap);
  if (refused !== null) {
    if (refused.reason === RUNTIME_REASON.RESEED_REQUIRED) {
      group.holdForReseed();
    }
    return refused;
  }
  group.gate = withIdentityRecord(
    createdParticipationGate(group.bootstrap, group.peerId),
    group.identityRecorded);
  group.appliedIndex = BigInt(RAFT_RS_INITIAL_APPLIED);
  return null;
}

function openGroupInCurrentRuntime(group, opening) {
  group.handle = null;
  const refused = openingParticipationRefusal(group, opening);
  if (refused !== null) {
    return refused;
  }
  const created = invokeCore(group, 'create_node',
    createNodeArguments(group, opening));
  if (!created.ok) {
    return created.result;
  }
  group.handle = created.value;
  group.persistedLastIndex = openedLastIndex(
    opening.restore ? opening.record : null);
  // Every (re)construction and restore announces its first observed
  // configuration again: a listener's baseline must be level-correct.
  group.announcedConfStateKey = CONF_STATE_NOT_ANNOUNCED;
  if (!opening.restore) {
    const confState = invokeCore(group, CORE_OPERATION.CONF_STATE);
    if (!confState.ok) {
      return confState.result;
    }
    try {
      group.store.putBootstrapAppliedState(group.groupId, confState.value,
        participationGateColumns(group.gate));
    } catch (error) {
      return groupHostFailure(group, RUNTIME_PHASE.BOOTSTRAP_PERSISTENCE,
        error);
    }
  }
  group.health = USABLE;
  settleParticipationGate(group);
  return outcome(CORE_OK, {
    reason: opening.restore ? RUNTIME_REASON.RESTORED : RUNTIME_REASON.CREATED,
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
  // The gate from the durable record decides before the configuration does:
  // a reconstruction below it never campaigns, even as a transient sole
  // voter of a replayed configuration.
  if (group.gateOpen && isSoleVoter(conf.value, group.peerId)) {
    return campaignGroup(group, expectedGeneration);
  }
  announce(group, expectedGeneration);
  return outcome(CORE_OK, {reason: RUNTIME_REASON.RUNTIME_RECONSTRUCTED});
}

// What a replaced runtime restores a group from: nothing for a closed group
// or one without a record; a group whose record cannot be read is held by
// that failure alone, and the replaced core's handle names nothing in the
// new one.
function openingForReplacement(group) {
  if (group.closed || group.reseedHold !== null) {
    return null;
  }
  const opening = readOpeningRecord(group);
  if (!opening.ok) {
    group.handle = null;
  }
  return opening.ok && opening.restore ? opening : null;
}

// Reconstruct the shared runtime from every group's durable record, then let
// each restored group resume. Only a core failure (the instance trapped)
// replaces the runtime. The outcome is the reconstruction's and, for the group
// whose operation asked for it, that group's resumption: a group that cannot
// resume is left RECOVERY_REQUIRED for its own next operation. A group whose
// record cannot be read is held by that failure alone; every other group is
// restored.
function replaceRuntime(trigger) {
  core = null;
  runtimeHealth = HEALTHY;
  ensureCore();
  const restoredGroups = [];
  for (const group of groups.values()) {
    const opening = openingForReplacement(group);
    if (opening === null) {
      continue;
    }
    const restored = openGroupInCurrentRuntime(group, opening);
    if (restored.outcome !== CORE_OK) {
      reportRuntimeReplaced(trigger, {runtimeGeneration,
        groupsRestored: restoredGroups.length, failure: restored.reason});
      return restored;
    }
    group.recovery = null;
    restoredGroups.push(group);
  }
  reportRuntimeReplaced(trigger, {runtimeGeneration,
    groupsRestored: restoredGroups.length, failure: null});
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

function retryAfterMsOf(group) {
  return group.recovery === null ? 0 :
    Math.max(0, group.recovery.retryNotBefore - group.timers.now());
}

// The typed answer of a group held by its host failure: the failure that
// holds it, how many reconstructions it has cost, and when the next one is
// due; and what a status has, as observations - the runtime generation and
// peer it runs under and its durable progress as last read. The group has no
// role while it is held.
function recoveryOutcome(group, reason, retryAfterMs = retryAfterMsOf(group)) {
  const recovery = group.recovery || {failure: null, attempts: 0,
    durableProgress: {state: DURABLE_PROGRESS_OBSERVATION.NOT_READ}};
  return outcome(HOST_FAILURE, {
    reason,
    phase: recovery.failure?.phase ?? null,
    failure: recovery.failure,
    retryAfterMs,
    attempts: recovery.attempts,
    retryable: true,
    recoveryRequired: true,
    role: null,
    groupId: group.groupId,
    replicaIdentity: group.replicaIdentity,
    peerId: group.peerId,
    runtimeGeneration,
    durableProgress: recovery.durableProgress,
  });
}

function insideRetryWindow(group) {
  return group.recovery !== null &&
    group.timers.now() < group.recovery.retryNotBefore;
}

// A reconstruction's end. A group usable again keeps its record: its real
// role was announced by its resumption, and a failure within one window of
// now is the same failure. One that failed again is held one window from
// that failure: as recorded when it failed during the attempt, or from now
// for a failure the core answered.
function settleReconstruction(group, attemptedAt, result) {
  const now = group.timers.now();
  if (result.outcome === CORE_OK && group.health !== RECOVERY_REQUIRED) {
    group.recovery = {...group.recovery, heldAt: now};
    return outcome(CORE_OK, {reason: RUNTIME_REASON.GROUP_RECONSTRUCTED});
  }
  group.health = RECOVERY_REQUIRED;
  if (group.recovery.retryNotBefore <= attemptedAt) {
    group.recovery = {
      ...group.recovery,
      heldAt: now,
      retryNotBefore: now + recoveryRetryWindowMsOf(group.timing),
      durableProgress: durableProgressOf(group),
    };
  }
  // A core outcome other than a host failure (a refusal, a trap) is answered
  // as it is; otherwise the group is held by the failure it recorded.
  return result.outcome === CORE_OK || result.outcome === HOST_FAILURE ?
    recoveryOutcome(group, group.recovery.failure?.reason ?? result.reason) :
    result;
}

// A host failure of one group reconstructs that group alone, in the current
// core: its node is freed (a freed or missing handle is no error), created
// again from its durable record, drained (the committed entries its failure
// left unapplied are applied first), and resumed - a sole voter campaigns,
// any other group announces its role. The runtime generation does not change
// and no other group is touched. Inside the retry window the answer is a
// typed deferral and nothing enters the core; while a user session holds the
// connection nothing enters the core either, and the answer names the session
// with the store's admission poll as the time to retry on.
function reconstructGroup(group) {
  if (insideRetryWindow(group)) {
    return recoveryOutcome(group, RUNTIME_REASON.RECOVERY_DEFERRED);
  }
  if (!persistenceAdmitted(group)) {
    return recoveryOutcome(group, RUNTIME_REASON.USER_TRANSACTION_OPEN,
      PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS);
  }
  // The failure held the group until this attempt began.
  const attemptedAt = group.timers.now();
  group.recovery = {...group.recovery, heldAt: attemptedAt,
    retryNotBefore: attemptedAt, attempts: group.recovery.attempts + 1};
  const freed = group.handle === null ? null : invokeCore(group, 'free');
  if (freed !== null && !freed.ok && freed.result.outcome === CORE_FATAL) {
    return freed.result;
  }
  group.handle = null;
  const opening = readOpeningRecord(group);
  const restored = opening.ok ? openGroupInCurrentRuntime(group, opening) :
    opening.result;
  const expectedGeneration = runtimeGeneration;
  const resumed = restored.outcome !== CORE_OK ? restored :
    thenMaybe(drainReady(group, expectedGeneration), (drained) =>
      drained.outcome === CORE_OK ?
        resumeAfterReconstruction(group, expectedGeneration) : drained);
  return thenMaybe(resumed, (result) =>
    settleReconstruction(group, attemptedAt, result));
}

// A usable group whose record no failure renewed for a whole window forgets
// it; a group with no record reads no clock.
function forgetExpiredRecovery(group) {
  if (group.recovery !== null &&
      !failurePersists(group, group.timers.now())) {
    group.recovery = null;
  }
}

// Failure scope follows the failure class: a core failure replaces the shared
// runtime; a host failure reconstructs its own group.
function ensureExecution(group) {
  if (group.reseedHold !== null) {
    return recordReseedHold(group);
  }
  if (runtimeHealth !== HEALTHY) {
    return replaceRuntime(group);
  }
  if (group.health === RECOVERY_REQUIRED) {
    if (group.recovery === null) {
      group.recovery = freshRecovery(group, null, group.timers.now());
    }
    return reconstructGroup(group);
  }
  forgetExpiredRecovery(group);
  return outcome(CORE_OK, {reason: RUNTIME_REASON.EXECUTION_USABLE});
}

// The group's synchronous work runs entered: an announcement it makes may
// re-enter readStatus, which then answers from the group's state and never
// starts a reconstruction inside the group's own operation.
function withinGroup(group, work) {
  group.entered += 1;
  try {
    return work();
  } finally {
    group.entered -= 1;
  }
}

function releaseTurn(group, turn) {
  if (group.tail === turn) {
    group.tail = null;
  }
}

// One turn at a time. A turn owns the group's queue from its first instant,
// including while it runs synchronously, so work asked for during it - a
// role listener inside its announcement reading status, or asking for a
// command - queues behind it and runs on the state the turn leaves; it never
// nests inside it. Only work asked for while no turn runs starts at once.
function enqueue(group, work) {
  const run = () => withinGroup(group, work);
  if (group.tail !== null) {
    const queued = group.tail.then(run, run);
    const token = queued.finally(() => releaseTurn(group, token));
    group.tail = token;
    return token;
  }
  const {promise: turn, resolve: endTurn} = Promise.withResolvers();
  const finishTurn = () => {
    endTurn();
    releaseTurn(group, turn);
  };
  group.tail = turn;
  let result;
  try {
    result = run();
  } catch (error) {
    finishTurn();
    throw error;
  }
  if (result && typeof result.then === 'function') {
    return Promise.resolve(result).finally(finishTurn);
  }
  finishTurn();
  return result;
}

function thenMaybe(value, continuation) {
  return value && typeof value.then === 'function' ?
    value.then(continuation) : continuation(value);
}

// The configuration a committed entry leaves the core holding, in the core
// call's own shape on every path: {ok: true, value, decoded?} once a
// conf-change entry is applied (or the configuration of any other entry is
// read), {ok: false, result} naming the core call that failed.
// A joiner opens from the committed configuration at its bootstrap index j
// (C_j, itself a learner in it); the configuration entries at or below j are
// history C_j already contains, so they are not applied to the core again:
// replayed onto C_j they would walk it through configurations the group
// never held (a transient sole voter, or no voter at all - which raft-rs
// refuses) instead of leaving it at C_j. A founder's bootstrap index is 0.
function foldedIntoBootstrap(group, entry) {
  return group.gate !== null && group.gate.bootstrapIndex > 0n &&
    BigInt(entry.index) <= group.gate.bootstrapIndex;
}

function resolveCommittedEntryConfState(group, expectedGeneration, entry) {
  if (RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(entry.entryType) &&
      !foldedIntoBootstrap(group, entry)) {
    const decoded = invokeCoreAt(
      group, expectedGeneration,
      'decode_conf_change_entry', entry.entryType, entry.data);
    if (!decoded.ok) {
      return decoded;
    }
    const applied = invokeCoreAt(
      group, expectedGeneration, 'apply_conf_change', decoded.value);
    if (!applied.ok) {
      return applied;
    }
    const set = invokeCoreAt(
      group, expectedGeneration, 'set_conf_state', applied.value);
    if (!set.ok) {
      return set;
    }
    return {...applied, decoded: decoded.value};
  }
  return invokeCoreAt(
    group, expectedGeneration, CORE_OPERATION.CONF_STATE);
}

// A committed entry the core refused to resolve (raft-rs refusing to apply a
// committed configuration change: "removed all voters") cannot be applied,
// and the Ready that carried it was taken: the group's own application
// failure, held and reconstructed from its durable record like a failed
// application callback. A core failure (the runtime is replaced) or a stale
// continuation is answered as it is.
function unresolvedCommittedEntry(group, failed) {
  return failed.outcome === CORE_REFUSED ?
    groupHostFailure(group, RUNTIME_PHASE.APPLICATION,
      {message: failed.reason, detail: {coreOperation: failed.phase}}) :
    failed;
}

function applyEntries(group, expectedGeneration, entries, index = 0) {
  if (index >= entries.length) {
    return outcome(CORE_OK, {reason: RUNTIME_REASON.ENTRIES_APPLIED});
  }
  const entry = entries[index];
  const resolvedConfState = resolveCommittedEntryConfState(
    group, expectedGeneration, entry);
  if (!resolvedConfState.ok) {
    return unresolvedCommittedEntry(group, resolvedConfState.result);
  }
  const admitted = admitsReplica(group.gate, resolvedConfState.decoded,
    group.peerId, BigInt(entry.index));
  if (resolvedConfState.decoded !== undefined) {
    group.confChangeEntriesApplied = (group.confChangeEntriesApplied ?? 0) + 1;
  }
  try {
    applyCommittedEntryTransaction({
      store: group.store,
      groupId: group.groupId,
      entry,
      confState: resolvedConfState.value,
      applyCommittedEntry: group.applyCommittedEntry,
      admitted,
      runApplySlice: group.runApplySlice,
    });
  } catch (error) {
    group.applyTransactionRolledBack?.();
    return groupHostFailure(group, RUNTIME_PHASE.APPLICATION,
      applicationFailureOf(error));
  }
  // The runtime's own applied index (the entry whose configuration the core
  // now holds, durable with it) and the participation gate it moves.
  recordAppliedEntry(group, BigInt(entry.index), admitted);
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
      return groupHostFailure(group, 'light-ready-persistence', error);
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
    return continuation.catch((error) =>
      groupHostFailure(group, RUNTIME_PHASE.READY_DRAIN, error));
  }
  return continuation;
}

function drainReady(group, expectedGeneration, cycles = 0) {
  if (cycles >= RAFT_RS_READY_DRAIN_MAX_CYCLES) {
    reportWaitBoundExceeded(group,
      RUNTIME_FAULT_REPORT.READY_DRAIN_BOUND_EXCEEDED,
      {cycles, maxCycles: RAFT_RS_READY_DRAIN_MAX_CYCLES});
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
    group.persistedLastIndex = persistedLastIndexAfter(
      group.persistedLastIndex, taken.value);
  } catch (error) {
    return groupHostFailure(group, RUNTIME_PHASE.READY_PERSISTENCE, error);
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
  } catch (error) {
    groupHostFailure(group, RUNTIME_PHASE.ADDRESS_RESOLUTION, error);
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
  const observed = recordStatusObservation(group, expectedGeneration, now);
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
  if (observed.ok) {
    announceMembership(group, observed.value, now);
  }
  const settlement = confChangeSettlement({before, now,
    confChangeEntries: group.confChangeEntriesApplied ?? 0,
    appliedIndex: group.appliedIndex});
  group.confChangeEntriesApplied = 0;
  if (settlement !== null) {
    group.emit(RUNTIME_EVENT.CONF_CHANGE_APPLIED, settlement);
  }
}

// A conf-change proposal is taken only at the leader's port; one the core
// would drop is deferred typed - read from the core's status and
// configuration in this turn (verification V2, round 2 F-1).
function refusedConfChange(group, expectedGeneration, change) {
  const status = invokeCoreAt(group, expectedGeneration, 'status');
  if (!status.ok) {
    return status.result;
  }
  const conf = invokeCoreAt(group, expectedGeneration,
    CORE_OPERATION.CONF_STATE);
  if (!conf.ok) {
    return conf.result;
  }
  return confChangeProposalRefusal({status: status.value,
    confState: conf.value, change,
    leaderReplicaIdOf: (lead) => semanticLeaderIdentity(group, lead)});
}

// The configuration's voter-bearing and learner parts as one comparable key.
function confStateKeyOf(confState) {
  const sorted = (ids) => [...(ids || [])].map(String).sort();
  return JSON.stringify([
    sorted(confState.voters),
    sorted(confState.votersOutgoing),
    sorted(confState.learners),
    sorted(confState.learnersNext),
    confState.autoLeave === true,
  ]);
}

// The applied ConfState is announced when it differs from the one last
// announced, and first after every (re)construction: the transition the core
// itself applied, never a prediction or a row.
function announceMembership(group, {confState, appliedIndex}, status) {
  const key = confStateKeyOf(confState);
  if (key === group.announcedConfStateKey) {
    return;
  }
  group.announcedConfStateKey = key;
  group.emit(RUNTIME_EVENT.MEMBERSHIP_CHANGED, {
    confState,
    commitIndex: Number(status.commit),
    appliedIndex,
  });
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
  // The applied index is the runtime's own, read in the same turn as the
  // configuration: the index whose apply left the core holding it (commit
  // may run ahead of it), never the core's status.applied.
  return {ok: true, value: {status: status.value, confState: conf.value,
    ...observedParticipation(group), runtimeHealth, runtimeGeneration}};
}

// One applied index per observation: the participation gate's, recorded with
// the configuration it was applied at (the REPLACE witness and the
// MEMBERSHIP_CHANGED announcement read the same value).
function observedParticipation(group) {
  const participation = participationObservation(group.gate,
    group.appliedIndex);
  return {participation, appliedIndex: participation.appliedIndex};
}

function shapeGroupStatus(group, observation) {
  return shapeGroupObservation(group, observation, (error) =>
    groupHostFailure(group, RUNTIME_PHASE.ADDRESS_RESOLUTION, error));
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
  return thenMaybe(ensureExecution(group), (ready) =>
    ready.outcome === CORE_OK ?
      readGroupStatus(group, runtimeGeneration) : ready);
}

// A group held by its host failure answers from its own state while it is
// busy (an announcement of its own operation may ask); idle, the read is the
// group's next operation and may reconstruct it, through the group's queue so
// a reconstruction is single-flight. Synchronous either way.
function readStatusInRecovery(group) {
  if (group.tail !== null || group.entered > 0) {
    return recoveryOutcome(group, RUNTIME_REASON.RECOVERY_DEFERRED);
  }
  const read = enqueue(group, () => readStatusUndrained(group));
  if (read && typeof read.then === 'function') {
    read.catch(() => undefined);
    return recoveryOutcome(group, RUNTIME_REASON.RECOVERY_DEFERRED);
  }
  return read;
}

function readStatusNow(group) {
  if (runtimeHealth === HEALTHY && group.health === RECOVERY_REQUIRED) {
    return readStatusInRecovery(group);
  }
  return withinGroup(group, () => readStatusObserved(group));
}

function readStatusObserved(group) {
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
  if (!group.gateOpen) {
    return participationGateClosed();
  }
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

// The leadership transfer: the core's status and configuration are read,
// the request is decided against them (a request the core would ignore is a
// typed refusal and nothing is stepped), and the accepted one is stepped as
// the MsgTransferLeader raft-rs's own transfer_leader steps - a local message
// whose sender is the transferee - and its Ready drained, all in this one
// queued turn. The answer is acceptance; completion is the role and leader
// events the drains announce.
function transferLeadership(group, expectedGeneration, command) {
  const observed = readGroupObservation(group, expectedGeneration);
  if (!observed.ok) {
    return observed.result;
  }
  const decision = decideLeadershipTransfer(
    group.peerId, observed.value, command);
  if (decision.answer !== undefined) {
    return decision.answer;
  }
  const stepped = invokeCoreAt(group, expectedGeneration, 'step', {
    msgType: RAFT_RS_MESSAGE_TYPE.TRANSFER_LEADER,
    from: decision.transferee,
    to: group.peerId,
  });
  if (!stepped.ok) {
    return stepped.result;
  }
  return thenMaybe(drainReady(group, expectedGeneration), (drained) =>
    drained.outcome === CORE_OK ? decision.accepted : drained);
}

// A proposal the core refused: dropped by a running leadership transfer (read
// from the core in the same turn) it is the retryable transfer-in-progress
// answer; any other refusal is answered as the core gave it.
function answerRefusedProposal(group, expectedGeneration, refused) {
  if (refused.outcome !== CORE_REFUSED) {
    return refused;
  }
  const observed = readGroupObservation(group, expectedGeneration);
  return observed.ok &&
    droppedByLeadershipTransfer(refused, group.peerId, observed.value) ?
    leadershipTransferInProgress(refused.phase) : refused;
}

const COMMAND_OPERATION = Object.freeze({
  [RUNTIME_COMMAND.READ_STATUS]: (group, command, generation) =>
    readGroupStatus(group, generation),
  [RUNTIME_COMMAND.CAMPAIGN]: (group, command, generation) =>
    campaignGroup(group, generation),
  [RUNTIME_COMMAND.DRAIN_INBOUND]: () =>
    outcome(CORE_OK, {reason: RUNTIME_REASON.INBOUND_DRAINED}),
  [RUNTIME_COMMAND.PROBE_PEER_PROGRESS]: (group, command, generation) =>
    probePeerProgress(group, generation, command.peerAddress),
  [RUNTIME_COMMAND.TRANSFER_LEADERSHIP]: (group, command, generation) =>
    transferLeadership(group, generation, command.transfer),
});
const PROPOSE_CONF_CHANGE = 'propose-conf-change';
const TICK_COMMAND = 'tick';
const PROPOSAL_COMMANDS = new Set(['propose', PROPOSE_CONF_CHANGE]);

// What the closed participation gate refuses (O1: a replica not yet
// admitted may not campaign or serve): every proposal, and a tick that could
// campaign. A tick of a core that is not promotable - a gated joiner is a
// learner of its own configuration until the AddNode that opens its gate is
// applied - enters the core: raft-rs advances its election timer and never
// campaigns it (tick_election returns before MsgHup), so its view of time,
// and the check-quorum lease built on it, never freezes. A gated core that
// is promotable (a record written before joiners opened as learners) keeps
// the refusal: ticked, it would campaign.
function gatedCommandRefusal(group, command, expectedGeneration) {
  if (command.type !== TICK_COMMAND) {
    return participationGateClosed();
  }
  const status = invokeCoreAt(group, expectedGeneration, 'status');
  if (!status.ok) {
    return status.result;
  }
  return status.value.promotable === false ? null :
    participationGateClosed();
}

// While the opening's prior-existence fact is not durable (verifier N3) the
// core is entered for a status read only: no tick (a founder would campaign
// and vote for itself), no proposal, campaign, transfer or probe.
const COMMANDS_BEFORE_IDENTITY_RECORD = new Set([
  RUNTIME_COMMAND.READ_STATUS, RUNTIME_COMMAND.DRAIN_INBOUND]);

function performCommand(group, command, expectedGeneration) {
  if (!group.identityRecorded &&
      !COMMANDS_BEFORE_IDENTITY_RECORD.has(command.type)) {
    return identityUnrecorded();
  }
  if (Object.hasOwn(COMMAND_OPERATION, command.type)) {
    return COMMAND_OPERATION[command.type](group, command, expectedGeneration);
  }
  const primitive = {
    'tick': ['tick', []],
    'propose': ['propose', [command.bytes]],
    [PROPOSE_CONF_CHANGE]: ['propose_conf_change_v2', [command.change]],
  }[command.type];
  if (primitive && !group.gateOpen) {
    const refused = gatedCommandRefusal(group, command, expectedGeneration);
    if (refused !== null) {
      return refused;
    }
  }
  if (!primitive) {
    return outcome(CORE_REFUSED, {
      reason: RUNTIME_REASON.UNKNOWN_OPERATION,
      phase: RUNTIME_PHASE.DISPATCH, retryable: false,
      recoveryRequired: false,
    });
  }
  const refused = command.type === PROPOSE_CONF_CHANGE ?
    refusedConfChange(group, expectedGeneration, command.change) : null;
  if (refused !== null) {
    return refused;
  }
  const invoked = invokeCoreAt(
    group, expectedGeneration, primitive[0], ...primitive[1]);
  if (invoked.ok) {
    return drainReady(group, expectedGeneration);
  }
  return PROPOSAL_COMMANDS.has(command.type) ?
    answerRefusedProposal(group, expectedGeneration, invoked.result) :
    invoked.result;
}

function drainInbound(group, expectedGeneration, continuation) {
  if (!group.identityRecorded) {
    // Nothing delivered before the prior-existence fact is durable is ever
    // stepped (enqueueStep drops it; this keeps the drain to that rule).
    group.inbound.length = 0;
  }
  if (group.inbound.length === 0) {
    return continuation();
  }
  const envelope = group.inbound.shift();
  // The local-log guard decides before the core is entered: a refused
  // envelope is recorded against its sender and never stepped; one that
  // proves this replica's history lost holds the group and ends the turn.
  const guarded = refuseInboundStep(group, envelope, expectedGeneration);
  if (guarded !== null) {
    return group.reseedHold ??
      drainInbound(group, expectedGeneration, continuation);
  }
  const stepped = invokeCoreAt(
    group, expectedGeneration, 'step', envelope.message);
  // The core refusing a delivered envelope is that envelope's outcome, not
  // the turn's: it is recorded against its sender and dropped (raft re-sends
  // what a peer still needs), and the drain goes on to the rest of the
  // delivered envelopes and then the command, on the state they leave. A
  // failure of the core or of the group is the turn's.
  if (!stepped.ok) {
    if (stepped.result.outcome !== CORE_REFUSED) {
      return stepped.result;
    }
    recordInboundStepRefusal(group, envelope, stepped.result);
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
  return thenMaybe(ensureExecution(group), (ready) => {
    if (ready.outcome !== CORE_OK) {
      return ready;
    }
    const expectedGeneration = runtimeGeneration;
    return drainInbound(group, expectedGeneration,
      () => performCommand(group, command, expectedGeneration));
  });
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
    reportWaitBoundExceeded(group,
      RUNTIME_FAULT_REPORT.INBOUND_DRAIN_ADMISSION_BOUND_EXCEEDED, {
        elapsedMs: group.timers.now() -
          (group.inboundDrainDeadline - PERSISTENCE_ADMISSION_WAIT.BOUND_MS),
        queuedInbound: group.inbound.length,
      });
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

// A status read and the committed-membership read answer from the recorded
// observation without queueing; every other command takes the group's turn.
function executeCommand(group, command) {
  if (command?.type === RUNTIME_COMMAND.READ_STATUS) {
    return readStatusNow(group);
  }
  if (command?.type === RUNTIME_COMMAND.READ_COMMITTED_MEMBERSHIP) {
    return thenMaybe(readStatusNow(group), (status) =>
      answerCommittedMembership(group, status, command.purpose));
  }
  return enqueue(group, () => perform(group, command));
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
    bootstrap: request.bootstrap,
    // Whether the opening's prior-existence fact is durable: false only for
    // an opening whose host writes that fact after the port opened (a
    // CREATE_REPLICA target), until recordIdentity is asked.
    identityRecorded: request.identityRecordPending !== true,
    gate: null,
    appliedIndex: null,
    gateOpen: false,
    timing: request.timing,
    timers: request.timers,
    store,
    sendToPeer: request.sendToPeer,
    resolvePeerAddress: request.resolvePeerAddress,
    resolvePeerIdentity: request.resolvePeerIdentity,
    applyCommittedEntry: request.applyCommittedEntry,
    applyTransactionRolledBack: request.applyTransactionRolledBack,
    runApplySlice: request.runApplySlice,
    admitScheduledEntry: request.admitScheduledEntry,
    holdForReseed: request.holdForReseed,
    reportFault: request.reportFault,
    emit: request.emit,
    handle: null,
    persistedLastIndex: 0n,
    reseedHold: null,
    reseedHoldRecorded: false,
    reseedHoldWriteFailures: 0,
    lastStatus: null,
    statusObservation: null,
    announcedConfStateKey: CONF_STATE_NOT_ANNOUNCED,
    health: USABLE,
    recovery: null,
    entered: 0,
    tail: null,
    inbound: [],
    inboundDrainScheduled: false,
    inboundDrainDeadline: null,
    peerDelivery: new Map(),
    inboundStepRefusals: new Map(),
    inboundRefusalReports: new Map(),
    closed: false,
  };
  groups.set(group.key, group);
  // A record that cannot be read leaves the group held by that failure: its
  // port exists and answers typed, and the group's next operation after its
  // retry window reconstructs it. Any other failure to open refuses the port.
  const opening = readOpeningRecord(group);
  const opened = opening.ok ? openGroupInCurrentRuntime(group, opening) :
    opening.result;
  if (opened.outcome === CORE_REFUSED ||
      (opening.ok && opened.outcome !== CORE_OK)) {
    groups.delete(group.key);
    throw Object.assign(new Error(opened.reason), {consensus: opened});
  }
  const first = opening.ok ? invokeCore(group, 'status') : {ok: false};
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
      // Inside a failed group's retry window a delivery is dropped (raft
      // re-sends what a peer did not receive), so nothing accumulates while
      // the failure persists.
      if (group.health === RECOVERY_REQUIRED && insideRetryWindow(group)) {
        return recoveryOutcome(group, RUNTIME_REASON.RECOVERY_DEFERRED);
      }
      if (group.reseedHold !== null) {
        return recordReseedHold(group);
      }
      // Before the prior-existence fact is durable a delivery is a lost
      // message: dropped unstepped, answered as no refusal (its sender sees
      // an unreachable peer, never a hostile or held one).
      if (!group.identityRecorded) {
        return outcome(CORE_OK, {
          reason: PARTICIPATION_GATE.INBOUND_DROPPED_IDENTITY_UNRECORDED});
      }
      group.inbound.push(snapshotEnvelope(envelope));
      scheduleInboundDrain(group);
      return outcome(CORE_OK, {reason: RUNTIME_REASON.INBOUND_ENQUEUED});
    }),
    execute: Object.freeze((command) => executeCommand(group, command)),
    // The acknowledgement that the opening's prior-existence fact is
    // durable: taken in the group's turn, so no turn sees it change.
    recordIdentity: Object.freeze(() =>
      enqueue(group, () => recordIdentity(group))),
    participationGateOpen: Object.freeze(() => group.gateOpen === true),
    configureTiming: Object.freeze((timing) => {
      group.timing = deepFreeze({...group.timing, ...timing});
      return true;
    }),
    containUnexpectedThrow: Object.freeze((error) =>
      containUnexpectedThrow(group, error)),
    close: Object.freeze(({enterCore}) => {
      group.closed = true;
      groups.delete(group.key);
      // A failed group's node lives in the current core until it is freed.
      if (!enterCore || group.handle === null || runtimeHealth !== HEALTHY) {
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

/**
 * Test seam: a fault injected at the core boundary (see coreFaultInjector).
 * @param {Function|null} injector - (groupId, operation, args) => void, or
 *   null to remove it.
 */
function setCoreFaultInjector(injector) {
  coreFaultInjector = typeof injector === 'function' ? injector : null;
}

export {
  CORE_OK,
  CORE_REFUSED,
  createRuntimeDispatcher,
  setActualCoreEntryObserver,
  setCoreFaultInjector,
  verifyRaftRsBinding,
};
