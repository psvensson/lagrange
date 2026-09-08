import {AsyncLocalStorage, createHook} from 'node:async_hooks';
import {FORMATION_OWNER} from './formation-diagnostics-contract.js';

const MICROSECONDS_PER_MILLISECOND = 1000;
const NANOSECONDS_PER_MICROSECOND = 1000n;
const ZERO = 0;
const PERCENT_MULTIPLIER = 100;
const CLOCK_OPTION = 'clock';
const CONTEXT_OPTION = 'context';
const HOOK_FACTORY_OPTION = 'hookFactory';
const INVALID_CLOCK_ERROR =
  'formation attribution clock must return a non-negative safe integer';
const CLOCK_BACKWARDS_ERROR = 'formation attribution clock moved backwards';
const OVERLAP_ERROR = 'formation attribution segments overlap the window';
const CONCURRENT_WINDOW_ERROR =
  'formation attribution already has an active window';
const RESTART_ERROR = 'formation attribution instances are one-shot';

const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPop = Function.call.bind(Array.prototype.pop);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const mapClear = Function.call.bind(Map.prototype.clear);
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectValues = Object.values;
const reflectGet = Reflect.get;
const MapConstructor = Map;

let activeAttribution = null;

function monotonicClockUs() {
  return Number(process.hrtime.bigint() / NANOSECONDS_PER_MICROSECOND);
}

function normalizeOwner(owner) {
  return typeof owner === 'string' && owner.length > ZERO ?
    owner : FORMATION_OWNER.UNATTRIBUTED;
}

function readOwnOption(options, name, fallback) {
  if (
    options === null ||
    (typeof options !== 'object' && typeof options !== 'function') ||
    !objectHasOwn(options, name)
  ) {
    return fallback;
  }
  const value = reflectGet(options, name);
  return value === undefined ? fallback : value;
}

function appendOwnerName(names, seen, owner) {
  if (
    owner === FORMATION_OWNER.UNATTRIBUTED ||
    objectHasOwn(seen, owner)
  ) {
    return;
  }
  seen[owner] = true;
  arrayPush(names, owner);
}

function sortedOwnerNames(ownerDurationsUs, dispatchCounts, handoffCounts) {
  const names = [];
  const seen = objectCreate(null);
  arrayForEach(
    objectValues(FORMATION_OWNER),
    (owner) => appendOwnerName(names, seen, owner),
  );
  mapForEach(
    ownerDurationsUs,
    (_value, owner) => appendOwnerName(names, seen, owner),
  );
  mapForEach(
    dispatchCounts,
    (_value, owner) => appendOwnerName(names, seen, owner),
  );
  mapForEach(
    handoffCounts,
    (_value, owner) => appendOwnerName(names, seen, owner),
  );
  arraySort(names);
  return names;
}

function resetWindowAccounting(attribution) {
  mapClear(attribution.asyncOwners);
  mapClear(attribution.ownerDurationsUs);
  mapClear(attribution.dispatchCounts);
  mapClear(attribution.handoffCounts);
  attribution.ownerStack.length = ZERO;
  attribution.activeOwner = null;
  attribution.activeSegmentStartedAtUs = null;
  attribution.depth = ZERO;
  attribution.turnCount = ZERO;
  attribution.windowStartedAtUs = null;
  attribution.lastClockUs = null;
}

class FormationTurnAttribution {
  constructor(options = {}) {
    this.clock = readOwnOption(options, CLOCK_OPTION, monotonicClockUs);
    this.context = readOwnOption(
      options,
      CONTEXT_OPTION,
      new AsyncLocalStorage(),
    );
    this.hookFactory = readOwnOption(
      options,
      HOOK_FACTORY_OPTION,
      createHook,
    );
    this.asyncOwners = new MapConstructor();
    this.ownerDurationsUs = new MapConstructor();
    this.dispatchCounts = new MapConstructor();
    this.handoffCounts = new MapConstructor();
    this.ownerStack = [];
    this.activeOwner = null;
    this.activeSegmentStartedAtUs = null;
    this.depth = ZERO;
    this.turnCount = ZERO;
    this.started = false;
    this.completed = false;
    this.windowStartedAtUs = null;
    this.lastClockUs = null;
    this.hook = this.hookFactory({
      init: (asyncId, _type, triggerAsyncId) => {
        this.recordScheduledEntry(asyncId, triggerAsyncId);
      },
      before: (asyncId) => this.recordDispatchStart(asyncId),
      after: (asyncId) => this.recordDispatchEnd(asyncId),
      destroy: (asyncId) => mapDelete(this.asyncOwners, asyncId),
    });
  }

  start() {
    if (this.started) return this;
    if (this.completed) throw new Error(RESTART_ERROR);
    if (activeAttribution !== null) throw new Error(CONCURRENT_WINDOW_ERROR);
    this.started = true;
    activeAttribution = this;
    try {
      this.windowStartedAtUs = this.readClockUs();
      this.hook.enable();
    } catch (error) {
      this.started = false;
      try {
        this.hook.disable();
      } finally {
        resetWindowAccounting(this);
        if (activeAttribution === this) activeAttribution = null;
      }
      throw error;
    }
    return this;
  }

  readClockUs() {
    const nowUs = this.clock();
    if (
      !numberIsSafeInteger(nowUs) ||
      nowUs < ZERO ||
      objectIs(nowUs, -ZERO)
    ) {
      throw new Error(INVALID_CLOCK_ERROR);
    }
    if (this.lastClockUs !== null && nowUs < this.lastClockUs) {
      throw new Error(CLOCK_BACKWARDS_ERROR);
    }
    this.lastClockUs = nowUs;
    return nowUs;
  }

  recordScheduledEntry(asyncId, _triggerAsyncId) {
    if (!this.started) return;
    // The exclusive segment is authoritative while JavaScript is running.
    // AsyncLocalStorage can retain a stale bootstrap value on a resource after
    // releaseOwnerDescendants() deliberately reclassifies that dispatch as
    // unattributed; using the active segment prevents its next-generation
    // timers from regaining bootstrap ownership. The context fallback is only
    // for resource creation outside an observed dispatch segment.
    const owner = this.depth > ZERO ?
      this.activeOwner : this.context.getStore();
    mapSet(this.asyncOwners, asyncId, normalizeOwner(owner));
  }

  accrueActiveSegment(nowUs) {
    if (this.activeOwner === null || this.activeSegmentStartedAtUs === null) {
      return;
    }
    const elapsedUs = nowUs - this.activeSegmentStartedAtUs;
    if (elapsedUs < ZERO) {
      throw new Error(CLOCK_BACKWARDS_ERROR);
    }
    const previousUs = mapGet(this.ownerDurationsUs, this.activeOwner) || ZERO;
    mapSet(this.ownerDurationsUs, this.activeOwner, previousUs + elapsedUs);
  }

  enterSegment(owner, countDispatch, countHandoff = false) {
    const nowUs = this.readClockUs();
    if (this.depth > ZERO) this.accrueActiveSegment(nowUs);
    arrayPush(this.ownerStack, this.activeOwner);
    this.activeOwner = normalizeOwner(owner);
    this.activeSegmentStartedAtUs = nowUs;
    this.depth += 1;
    if (countDispatch) {
      this.turnCount += this.depth === 1 ? 1 : ZERO;
      const count = mapGet(this.dispatchCounts, this.activeOwner) || ZERO;
      mapSet(this.dispatchCounts, this.activeOwner, count + 1);
    }
    if (countHandoff) {
      const count = mapGet(this.handoffCounts, this.activeOwner) || ZERO;
      mapSet(this.handoffCounts, this.activeOwner, count + 1);
    }
  }

  leaveSegment() {
    if (!this.started || this.depth === ZERO) return;
    const nowUs = this.readClockUs();
    this.accrueActiveSegment(nowUs);
    this.depth -= 1;
    this.activeOwner = arrayPop(this.ownerStack) || null;
    this.activeSegmentStartedAtUs = this.depth > ZERO ? nowUs : null;
  }

  recordDispatchStart(asyncId) {
    if (!this.started) return;
    this.enterSegment(
      mapGet(this.asyncOwners, asyncId) || FORMATION_OWNER.UNATTRIBUTED,
      true,
    );
  }

  recordDispatchEnd(_asyncId) {
    this.leaveSegment();
  }

  run(owner, callback) {
    if (!this.started) return callback();
    const dispatchHandoff = this.depth > ZERO;
    this.enterSegment(owner, false, dispatchHandoff);
    try {
      return this.context.run(normalizeOwner(owner), callback);
    } finally {
      this.leaveSegment();
    }
  }

  releaseOwnerDescendants(owner) {
    const normalizedOwner = normalizeOwner(owner);
    mapForEach(this.asyncOwners, (scheduledOwner, asyncId) => {
      if (scheduledOwner === normalizedOwner) {
        mapSet(this.asyncOwners, asyncId, FORMATION_OWNER.UNATTRIBUTED);
      }
    });
  }

  stop() {
    if (!this.started) return null;
    let snapshotReady = false;
    try {
      const windowEndedAtUs = this.readClockUs();
      if (this.depth > ZERO) {
        this.accrueActiveSegment(windowEndedAtUs);
      }
      const windowDurationUs = windowEndedAtUs - this.windowStartedAtUs;
      let busyDurationUs = ZERO;
      mapForEach(this.ownerDurationsUs, (durationUs) => {
        busyDurationUs += durationUs;
      });
      if (busyDurationUs > windowDurationUs) {
        throw new Error(OVERLAP_ERROR);
      }
      const idleDurationUs = windowDurationUs - busyDurationUs;
      const owners = arrayMap(sortedOwnerNames(
        this.ownerDurationsUs,
        this.dispatchCounts,
        this.handoffCounts,
      ), (owner) => {
        const durationUs = mapGet(this.ownerDurationsUs, owner) || ZERO;
        const dispatchCount = mapGet(this.dispatchCounts, owner) || ZERO;
        const handoffCount = mapGet(this.handoffCounts, owner) || ZERO;
        return {
          owner,
          durationUs,
          durationMs: durationUs / MICROSECONDS_PER_MILLISECOND,
          dispatchCount,
          handoffCount,
          turnSegmentCount: dispatchCount + handoffCount,
        };
      });
      const unattributedDurationUs =
        mapGet(this.ownerDurationsUs, FORMATION_OWNER.UNATTRIBUTED) || ZERO;
      const unattributedDispatchCount =
        mapGet(this.dispatchCounts, FORMATION_OWNER.UNATTRIBUTED) || ZERO;
      const snapshot = {
        schemaVersion: 1,
        windowStartedAtUs: this.windowStartedAtUs,
        windowEndedAtUs,
        windowDurationUs,
        windowDurationMs:
          windowDurationUs / MICROSECONDS_PER_MILLISECOND,
        busyDurationUs,
        idleDurationUs,
        unattributedDurationUs,
        unattributedDispatchCount,
        unattributedPercent:
          windowDurationUs > ZERO ?
            (unattributedDurationUs / windowDurationUs) * PERCENT_MULTIPLIER :
            ZERO,
        accountedDurationUs: busyDurationUs + idleDurationUs,
        partitionDeltaUs:
          windowDurationUs - busyDurationUs - idleDurationUs,
        overlapDurationUs: ZERO,
        turnCount: this.turnCount,
        owners,
      };
      snapshotReady = true;
      return snapshot;
    } finally {
      this.started = false;
      this.completed = true;
      let hookDisabled = false;
      try {
        this.hook.disable();
        hookDisabled = true;
      } finally {
        if (!snapshotReady || !hookDisabled) resetWindowAccounting(this);
        if (activeAttribution === this) activeAttribution = null;
      }
    }
  }
}

function runFormationOwner(owner, callback) {
  if (!activeAttribution) return callback();
  return activeAttribution.run(owner, callback);
}

function releaseFormationOwnerDescendants(owner) {
  if (!activeAttribution) return;
  activeAttribution.releaseOwnerDescendants(owner);
}

export {
  FormationTurnAttribution,
  releaseFormationOwnerDescendants,
  runFormationOwner,
};
