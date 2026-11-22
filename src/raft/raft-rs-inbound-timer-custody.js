// Custody of one admitted native inbound drain timer, NOT a second drain
// driver. The runtime owner decides when to arm and what a callback means.
// The timer belongs to the clock captured at acquisition, never a later clock.
// Unlike idle election timers, acknowledged inbound work keeps its wake live.

const ADMITTED_INBOUND_TIMER_ALREADY_OWNED =
  'admitted inbound timer already owned';
const TIMER_SLOT = Object.freeze({
  INBOUND: 'inboundDrainTimer',
  RECOVERY: 'recoveryTimer',
  RESUME: 'runtimeResumeTimer',
});

function armGroupTimer(group, slot, delayMs, onWake) {
  const record = {source: group.timers, handle: null, active: true};
  group[slot] = record;
  try {
    const handle = record.source.setTimeout(() => {
      if (group[slot] !== record || !record.active) return;
      record.active = false;
      group[slot] = null;
      onWake();
    }, delayMs);
    record.handle = handle;
    // A synchronous test scheduler can fire before it returns its handle.
    // Never leave its old handle alive or retire a successor's record.
    if (!record.active) record.source.clearTimeout(handle);
  } catch (error) {
    if (group[slot] === record) group[slot] = null;
    record.active = false;
    throw error;
  }
}

function cancelGroupTimer(group, slot) {
  const record = group[slot];
  if (record === null) return null;
  // Even a hostile clock's failed clear cannot leave an active callback
  // authorized on a closed group. Return the original Error for close custody.
  let cleanupError = null;
  try {
    if (record.handle !== null) record.source.clearTimeout(record.handle);
  } catch (error) {
    cleanupError = error;
  }
  record.active = false;
  if (group[slot] === record) group[slot] = null;
  return cleanupError;
}

function armOwnedInboundDrainTimer(group, delayMs, onWake) {
  if (group.inboundDrainTimer !== null) {
    throw new Error(ADMITTED_INBOUND_TIMER_ALREADY_OWNED);
  }
  armGroupTimer(group, TIMER_SLOT.INBOUND, delayMs, onWake);
}

function cancelOwnedInboundDrainTimer(group) {
  const cleanupError = cancelGroupTimer(group, TIMER_SLOT.INBOUND);
  group.inboundDrainScheduled = false;
  return cleanupError;
}

function armOwnedRecoveryTimer(group, delayMs, onWake) {
  cancelGroupTimer(group, TIMER_SLOT.RECOVERY);
  armGroupTimer(group, TIMER_SLOT.RECOVERY, delayMs, onWake);
}

function cancelOwnedRecoveryTimer(group) {
  return cancelGroupTimer(group, TIMER_SLOT.RECOVERY);
}

function scheduleOwnedRecoveryTimer(group, delayMs, isNeeded, onWake, onThrow) {
  if (!isNeeded(group)) return;
  const dueAt = group.timers.now() + delayMs;
  const arm = () => {
    if (!isNeeded(group)) return;
    armOwnedRecoveryTimer(group, Math.max(0, dueAt - group.timers.now()), () => {
      if (isNeeded(group)) onWake(group);
    });
  };
  if (group.tail === null) {
    arm();
    return;
  }
  group.tail.then(arm, arm).catch((error) => onThrow(group, error));
}

function cancelOwnedResumptionTimer(group) {
  cancelGroupTimer(group, TIMER_SLOT.RESUME);
}

function scheduleOwnedResumptionTimer(group, delayMs, isCurrent, onWake, onThrow) {
  const run = () => {
    cancelOwnedResumptionTimer(group);
    if (isCurrent()) onWake(group);
  };
  if (group.tail === null) {
    run();
    return;
  }
  const arm = () => {
    if (!isCurrent() || group.runtimeResumeTimer !== null) return;
    armGroupTimer(group, TIMER_SLOT.RESUME, delayMs, run);
  };
  group.tail.then(arm, arm).catch((error) => onThrow(group, error));
}

export {
  armOwnedInboundDrainTimer,
  armOwnedRecoveryTimer,
  cancelOwnedInboundDrainTimer,
  cancelOwnedRecoveryTimer,
  cancelOwnedResumptionTimer,
  scheduleOwnedRecoveryTimer,
  scheduleOwnedResumptionTimer,
};
