// Custody of one admitted native inbound drain timer, NOT a second drain
// driver. The runtime owner decides when to arm and what a callback means.
// The timer belongs to the clock captured at acquisition, never a later clock.
// Unlike idle election timers, acknowledged inbound work keeps its wake live.

function armOwnedInboundDrainTimer(group, delayMs, onWake) {
  if (group.inboundDrainTimer !== null) {
    throw new Error('admitted inbound timer already owned');
  }
  const record = {source: group.timers, handle: null, active: true};
  group.inboundDrainTimer = record;
  try {
    const handle = record.source.setTimeout(() => {
      if (group.inboundDrainTimer !== record || !record.active) return;
      record.active = false;
      group.inboundDrainTimer = null;
      onWake();
    }, delayMs);
    record.handle = handle;
    // A synchronous test scheduler can fire before it returns its handle.
    // Never leave its old handle alive or retire a successor's record.
    if (!record.active) record.source.clearTimeout(handle);
  } catch (error) {
    if (group.inboundDrainTimer === record) group.inboundDrainTimer = null;
    record.active = false;
    throw error;
  }
}

function cancelOwnedInboundDrainTimer(group) {
  const record = group.inboundDrainTimer;
  if (record === null) {
    group.inboundDrainScheduled = false;
    return;
  }
  // Preserve the exact identity for retry if a hostile clock refuses clear.
  // The closed flag at the runtime owner prevents any late callback entering
  // the core, regardless of the result of timer cleanup.
  if (record.handle !== null) record.source.clearTimeout(record.handle);
  record.active = false;
  if (group.inboundDrainTimer === record) group.inboundDrainTimer = null;
  group.inboundDrainScheduled = false;
}

export {armOwnedInboundDrainTimer, cancelOwnedInboundDrainTimer};
