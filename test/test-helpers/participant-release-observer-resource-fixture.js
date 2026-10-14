// Capture only the existing applied-position observer's timer, not all
// timers belonging to the shared service, handler, or virtual clock.
// The observation owner acquires its SHUTDOWN_STARTED listener immediately
// before its one timer. This test seam passively observes that acquisition;
// it never schedules, cancels, or supplies a timer of its own.

import {PARTITION_SERVICE_EVENT} from
  '../../src/partition/partition-service-constants.js';

const CAPTURES = new WeakMap();
const reflectApply = Reflect.apply;

function restoreDescriptor(target, name, descriptor) {
  if (descriptor === undefined) {
    if (!delete target[name]) throw new Error(`cannot restore ${name}`);
  } else {
    Object.defineProperty(target, name, descriptor);
  }
}

function captureParticipantReleaseObservationTimer(service, scheduler) {
  if (CAPTURES.has(scheduler)) {
    throw new Error('one test capture owns this observation scheduler');
  }
  const onDescriptor = Object.getOwnPropertyDescriptor(service, 'on');
  const setDescriptor = Object.getOwnPropertyDescriptor(scheduler, 'setTimeout');
  const clearDescriptor = Object.getOwnPropertyDescriptor(scheduler, 'clearTimeout');
  const originalOn = service.on;
  const originalSet = scheduler.setTimeout;
  const originalClear = scheduler.clearTimeout;
  const records = [];
  let armed = false;
  let closed = false;

  service.on = function(...args) {
    const result = reflectApply(originalOn, this, args);
    if (args[0] === PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED) armed = true;
    return result;
  };
  scheduler.setTimeout = function(callback, ms, ...args) {
    if (!armed) return reflectApply(originalSet, this, [callback, ms, ...args]);
    armed = false;
    const record = {handle: null, active: true, fired: false, clears: 0};
    const run = function(...values) {
      record.fired = true;
      record.active = false;
      return reflectApply(callback, this, values);
    };
    const handle = reflectApply(originalSet, this, [run, ms, ...args]);
    record.handle = handle;
    records.push(record);
    return handle;
  };
  scheduler.clearTimeout = function(handle) {
    // A failed clear retains custody: a cleanup retry must try the same handle.
    const record = records.find((entry) => entry.handle === handle);
    if (record) record.clears += 1;
    const result = reflectApply(originalClear, this, [handle]);
    if (record) record.active = false;
    return result;
  };
  CAPTURES.set(scheduler, records);

  return {
    restore() {
      if (closed) return;
      closed = true;
      CAPTURES.delete(scheduler);
      const errors = [];
      for (const [target, name, descriptor] of [
        [service, 'on', onDescriptor],
        [scheduler, 'setTimeout', setDescriptor],
        [scheduler, 'clearTimeout', clearDescriptor],
      ]) {
        try {
          restoreDescriptor(target, name, descriptor);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors,
        'applied-position timer capture restoration failed');
    },
  };
}

// An empty count by itself never proves an owner was engaged. Each test also
// asserts an actual route/read/subscription/settlement before its retirement.
function observationTimerOwnedCount(scheduler) {
  const records = CAPTURES.get(scheduler);
  if (records === undefined) throw new Error('observation scheduler not captured');
  return records.filter((record) => record.active).length;
}

function observationTimerAcquisitions(scheduler) {
  const records = CAPTURES.get(scheduler);
  if (records === undefined) throw new Error('observation scheduler not captured');
  return records.length;
}

export {captureParticipantReleaseObservationTimer, observationTimerOwnedCount,
  observationTimerAcquisitions};
