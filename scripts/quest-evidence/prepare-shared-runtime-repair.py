"""Pinned WIP source preparation. Never a probe or a landing operation."""
from pathlib import Path
import hashlib

P = Path('src/raft/raft-rs-runtime-owner.js')
s = P.read_text()
assert hashlib.sha1(b'blob '+str(len(s.encode())).encode()+b'\0'+s.encode()).hexdigest() == '568bf6453cde9a620c6df8e386922fba0d593724', 'source changed; reconcile, do not overwrite'

def one(old,new):
    global s
    assert s.count(old)==1, f'anchor changed: {old[:90]}'
    s=s.replace(old,new,1)

one('  recordReseedHold,\n', '  enterReseedHold,\n  recordReseedHold,\n')
one('  RECOVERY_REQUIRED,\n', '  RECOVERY_REQUIRED,\n  REPLACING,\n')
one('let runtimeGeneration = 0;', '''let runtimeGeneration = 0;
// One failed replacement owns one clock and retry window, regardless of the
// next caller's group, timing or lifetime. Cleared on success or final close.
let runtimeRecovery = null;''')
one('    runtimeHealth = UNHEALTHY;\n', '''    // A trap inside replacement cannot release its synchronous barrier.
    if (runtimeHealth === REPLACING) {
      runtimeRecovery.failure = {phase: operation,
        reason: String(error?.message || error)};
    } else runtimeHealth = UNHEALTHY;
''')
one('  if (expectedGeneration !== runtimeGeneration ||\n      runtimeHealth !== HEALTHY || group.health === RECOVERY_REQUIRED) {', '  if (expectedGeneration !== runtimeGeneration || group.closed ||\n      group.handle === null || runtimeHealth !== HEALTHY ||\n      group.health === RECOVERY_REQUIRED) {')
start=s.index('// What a replaced runtime restores a group from:')
end=s.index('\nfunction retryAfterMsOf(group)',start)
s=s[:start]+'''// The shared attempt's typed answer is also the reentrant admission fence.
// It never asks a group clock to interpret another group's retry deadline.
function runtimeRecoveryOutcome(group) {
  const recovery = runtimeRecovery;
  return outcome(HOST_FAILURE, {
    reason: recovery?.failure?.reason ??
      RUNTIME_REASON.REPLACEMENT_IN_PROGRESS,
    phase: recovery?.failure?.phase ?? RUNTIME_PHASE.RUNTIME_REPLACEMENT,
    failure: recovery?.failure ?? null,
    retryAfterMs: recovery === null ? 0 :
      Math.max(0, recovery.retryNotBefore - recovery.clock.now()),
    attempts: recovery?.attempts ?? 0,
    retryable: true, recoveryRequired: true, role: null,
    groupId: group.groupId, replicaIdentity: group.replicaIdentity,
    peerId: group.peerId, runtimeGeneration, runtimeHealth,
  });
}

// Discarding a core invalidates ALL its handles and cached usable answers
// before a loader, store, reporter or announcement can call back into a port.
function invalidateRuntimeGroups() {
  for (const group of groups.values()) {
    group.handle = null;
    group.statusObservation = null;
    group.pendingRuntimeResume = null;
    group.health = RECOVERY_REQUIRED;
  }
}

function failedRuntimeReplacement(trigger, failure) {
  invalidateRuntimeGroups();
  runtimeRecovery.failure = {
    phase: failure.phase, reason: failure.reason,
  };
  runtimeRecovery.retryNotBefore = runtimeRecovery.clock.now() +
    runtimeRecovery.windowMs;
  return runtimeRecoveryOutcome(trigger);
}

// A record proven absent or incompatible is not a fresh bootstrap. Use the
// existing durable reseed owner; unreadable/busy storage stays a group hold.
function openingForReplacement(group) {
  if (group.closed || group.reseedHold !== null) return null;
  if (!persistenceAdmitted(group)) {
    groupHostFailure(group, RUNTIME_PHASE.READY_PERSISTENCE,
      RUNTIME_REASON.USER_TRANSACTION_OPEN);
    return null;
  }
  const opening = readOpeningRecord(group);
  if (!opening.ok && opening.result.outcome === HOST_FAILURE) return null;
  if (!opening.ok || !opening.restore) {
    enterReseedHold(group, opening.ok ? outcome(CORE_REFUSED, {
      reason: RUNTIME_REASON.DURABLE_RECORD_MISSING,
      phase: RUNTIME_PHASE.DURABLE_RECORD_READ,
      retryable: false, recoveryRequired: true,
    }) : opening.result);
    announceNoRole(group);
    return null;
  }
  return opening;
}

// This is the existing group's continuation, not a second reconstruction.
// Consume it once in that group's own turn; old Ready work drains first and
// is fenced by its old runtime generation. Never wait for another group's
// queue while holding the shared replacement barrier.
function resumeRuntimeGroup(group) {
  const expectedGeneration = group.pendingRuntimeResume;
  if (expectedGeneration !== runtimeGeneration || group.closed) {
    return hostFailure(RUNTIME_PHASE.GENERATION_CHANGED,
      RUNTIME_REASON.GENERATION_CHANGED, true);
  }
  group.pendingRuntimeResume = null;
  group.health = USABLE;
  const finish = (result) => {
    if (result.outcome !== CORE_OK && runtimeHealth === HEALTHY &&
        group.health !== RECOVERY_REQUIRED) {
      groupFailed(group, hostFailure(result.phase, result.reason, true));
    }
    return result;
  };
  try {
    const resumed = thenMaybe(drainReady(group, expectedGeneration), (drained) =>
      drained.outcome === CORE_OK ?
        resumeAfterReconstruction(group, expectedGeneration) : drained);
    return thenMaybe(resumed, finish);
  } catch (error) {
    return containUnexpectedThrow(group, error);
  }
}

// Closing during a replacement records an obligation without entering the
// new core from a callback. The driver frees any newly created handle before
// publishing HEALTHY and removes only that exact registered generation.
function releaseClosedReplacementGroups() {
  for (const group of groups.values()) {
    if (!group.closed) continue;
    if (group.handle !== null) {
      const freed = invokeCore(group, 'free');
      if (!freed.ok) return freed.result;
    }
    group.handle = null;
    groups.delete(group.key);
  }
  return outcome(CORE_OK);
}

// Account for every registered group while the barrier is closed. A host or
// native refusal holds only its group; a trap aborts the shared attempt and
// invalidates even handles already rebuilt in that attempt.
function replaceRuntime(trigger) {
  if (runtimeHealth === REPLACING || (runtimeRecovery !== null &&
      runtimeRecovery.clock.now() < runtimeRecovery.retryNotBefore)) {
    return runtimeRecoveryOutcome(trigger);
  }
  runtimeRecovery ??= {clock: trigger.timers,
    windowMs: recoveryRetryWindowMsOf(trigger.timing),
    retryNotBefore: 0, failure: null, attempts: 0};
  runtimeRecovery.attempts += 1;
  runtimeRecovery.failure = null;
  runtimeHealth = REPLACING;
  invalidateRuntimeGroups();
  core = null;
  const restoredGroups = [];
  try {
    ensureCore();
    for (const group of [...groups.values()]) {
      try {
        const opening = openingForReplacement(group);
        if (opening === null || group.closed) continue;
        const restored = openGroupInCurrentRuntime(group, opening);
        if (restored.outcome === CORE_FATAL) {
          return failedRuntimeReplacement(trigger, restored);
        }
        if (restored.outcome !== CORE_OK) {
          groupHostFailure(group, restored.phase, restored.reason);
          continue;
        }
        group.health = RECOVERY_REQUIRED;
        group.recovery = null;
        group.pendingRuntimeResume = runtimeGeneration;
        restoredGroups.push(group);
      } catch (error) {
        containUnexpectedThrow(group, error);
      }
      if (runtimeRecovery.failure !== null) {
        return failedRuntimeReplacement(trigger, runtimeRecovery.failure);
      }
    }
    const released = releaseClosedReplacementGroups();
    if (released.outcome !== CORE_OK) {
      return failedRuntimeReplacement(trigger, released);
    }
    reportRuntimeReplaced(trigger, {runtimeGeneration,
      groupsRestored: restoredGroups.filter((group) => !group.closed).length,
      failure: null});
    // Reporters are callbacks too: account for their closes before reopening.
    const finalRelease = releaseClosedReplacementGroups();
    if (finalRelease.outcome !== CORE_OK) {
      return failedRuntimeReplacement(trigger, finalRelease);
    }
    runtimeHealth = HEALTHY;
    runtimeRecovery = null;
  } catch (error) {
    return failedRuntimeReplacement(trigger,
      hostFailure(RUNTIME_PHASE.RUNTIME_REPLACEMENT, error, true));
  } finally {
    if (runtimeHealth === REPLACING) {
      runtimeHealth = UNHEALTHY;
      for (const group of groups.values()) {
        if (group.closed) groups.delete(group.key);
      }
      if (groups.size === 0) {
        core = null; runtimeRecovery = null; runtimeHealth = HEALTHY;
      }
    }
  }
  const generation = runtimeGeneration;
  for (const group of restoredGroups) {
    if (group === trigger || group.closed ||
        group.pendingRuntimeResume !== generation) continue;
    const resumed = enqueue(group, () => ensureExecution(group));
    if (resumed && typeof resumed.catch === 'function') {
      resumed.catch((error) => containUnexpectedThrow(group, error));
    }
  }
  // A callback may already have resumed the trigger or trapped the new core.
  if (runtimeHealth !== HEALTHY || generation !== runtimeGeneration) {
    return hostFailure(RUNTIME_PHASE.GENERATION_CHANGED,
      RUNTIME_REASON.GENERATION_CHANGED, true);
  }
  if (trigger.pendingRuntimeResume !== null) return resumeRuntimeGroup(trigger);
  return trigger.health === RECOVERY_REQUIRED ?
    recoveryOutcome(trigger, trigger.recovery?.failure?.reason ??
      RUNTIME_REASON.RECOVERY_DEFERRED) :
    outcome(CORE_OK, {reason: RUNTIME_REASON.RUNTIME_RECONSTRUCTED});
}
''' + s[end:]
one('  if (group.health === RECOVERY_REQUIRED) {\n    if (group.recovery === null)', '  if (group.pendingRuntimeResume !== null) return resumeRuntimeGroup(group);\n  if (group.health === RECOVERY_REQUIRED) {\n    if (group.recovery === null)')
one('  return thenMaybe(resumed, (result) =>\n    settleReconstruction(group, attemptedAt, result));', '''  return thenMaybe(resumed, (result) =>
    expectedGeneration !== runtimeGeneration || group.closed ?
      hostFailure(RUNTIME_PHASE.GENERATION_CHANGED,
        RUNTIME_REASON.GENERATION_CHANGED, true) :
      settleReconstruction(group, attemptedAt, result));''')
one('function readStatusNow(group) {\n', '''function readStatusNow(group) {
  if (runtimeHealth === REPLACING) return runtimeRecoveryOutcome(group);
  if (runtimeHealth !== HEALTHY) {
    return withinGroup(group, () => readStatusUndrained(group));
  }
''')
one('function executeCommand(group, command) {\n', '''function executeCommand(group, command) {
  if (runtimeHealth === REPLACING) return runtimeRecoveryOutcome(group);
''')
one('function createRuntimeDispatcher(request) {\n', '''function createRuntimeDispatcher(request) {
  // This is a refused opening, not admitted work or a second recovery driver.
  // Existing groups retain the continuation; a final close clears a failed
  // attempt so a later legitimate fresh opening is not permanently stranded.
  if (runtimeHealth !== HEALTHY) {
    const refused = runtimeRecoveryOutcome(request);
    throw Object.assign(new Error(refused.reason), {consensus: refused});
  }
''')
one('    health: USABLE,\n', '    health: USABLE,\n    pendingRuntimeResume: null,\n')
one('    enqueueStep: Object.freeze((envelope) => {\n', '''    enqueueStep: Object.freeze((envelope) => {
      if (runtimeHealth === REPLACING || (runtimeRecovery !== null &&
          runtimeRecovery.clock.now() < runtimeRecovery.retryNotBefore)) {
        return runtimeRecoveryOutcome(group);
      }
''')
one('    participationGateOpen: Object.freeze(() => group.gateOpen === true),', '''    participationGateOpen: Object.freeze(() => runtimeHealth === HEALTHY &&
      group.health === USABLE && group.gateOpen === true),''')
one('      group.closed = true;\n      groups.delete(group.key);', '''      group.closed = true;
      if (runtimeHealth === REPLACING) {
        return outcome(CORE_OK, {
          reason: RUNTIME_REASON.CLOSED_WITHOUT_CORE_ENTRY});
      }
      groups.delete(group.key);
      if (groups.size === 0 && runtimeHealth !== HEALTHY) {
        core = null;
        runtimeRecovery = null;
        runtimeHealth = HEALTHY;
        group.handle = null;
      }''')
P.write_text(s)
p=Path('src/raft/raft-rs-runtime-owner-constants.js');t=p.read_text()
assert t.count("const UNHEALTHY = 'unhealthy';")==1
t=t.replace("const UNHEALTHY = 'unhealthy';", "const UNHEALTHY = 'unhealthy';\nconst REPLACING = 'replacing';",1)
assert t.count('const RUNTIME_PHASE = Object.freeze({')==1
t=t.replace('const RUNTIME_PHASE = Object.freeze({', "const RUNTIME_PHASE = Object.freeze({\n  RUNTIME_REPLACEMENT: 'runtime-replacement',",1)
assert t.count('const RUNTIME_REASON = Object.freeze({')==1
t=t.replace('const RUNTIME_REASON = Object.freeze({', "const RUNTIME_REASON = Object.freeze({\n  REPLACEMENT_IN_PROGRESS: 'runtime-replacement-in-progress',",1)
idx=t.index('export {');a=t[:idx];b=t[idx:];assert b.count('  UNHEALTHY,')==1
p.write_text(a+b.replace('  UNHEALTHY,','  UNHEALTHY,\n  REPLACING,',1))
p=Path('src/raft/raft-rs-runtime-faults.js');t=p.read_text();assert t.count('export {\n')==1
p.write_text(t.replace('export {\n','export {\n  enterReseedHold,\n',1))
print('Prepared shared-replacement WIP in existing runtime owner; no landing or approval.')
