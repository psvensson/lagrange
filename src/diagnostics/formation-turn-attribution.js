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
const NESTED_GENERATION_ERROR =
  'formation simulation generations do not nest';
// Provenance-report vocabulary. Debug output only: it names nothing the
// counting or scheduling contracts depend on.
const PROVENANCE_STACK_ABSENT = '(none)';
const PROVENANCE_REFUSAL_MARKER = 'refused here';
const PROVENANCE_CREATION_MARKER = 'resource created here';
const EXECUTION_NODE_OPTION = 'requireExecutionNode';
const UNBOUND_PROVENANCE_OPTION = 'captureUnboundProvenance';
const EXECUTION_NODE_UNBOUND_ERROR = 'formation_execution_node_unbound';

const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPop = Function.call.bind(Array.prototype.pop);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const mapClear = Function.call.bind(Map.prototype.clear);
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectValues = Object.values;
const reflectGet = Reflect.get;
const MapConstructor = Map;

let activeAttribution = null;

// WHICH simulated process is consuming CPU, as opposed to WHAT work is
// running. The two are independent: owner attribution answers the second
// question and is untouched here. The deterministic scheduler is the sole
// authority for the first and pushes a frame around every callback it
// executes; nothing infers a node from an owner object, a row, a bracket or
// an owner name, because those describe a semantic subject rather than the
// process burning the time. Live formation pushes nothing and therefore sees
// no change at all.
// Async-local rather than a synchronous stack: a node's work routinely spans
// awaits, and a stack would unwind the moment a callback returned its promise,
// leaving every continuation unbound. The scheduler still enters the frame
// immediately around the callback; storage is what carries it across the
// awaits inside.
const executionNodeContext = new AsyncLocalStorage();
const FORMATION_EXECUTION_CONTEXT_NONE = Object.freeze({
  generationId: null,
  executionNodeId: null,
});
// A dispatched async resource overrides the ambient store for its own
// callback: the resource remembers the node that scheduled it, and that must
// beat whatever the scheduler ran most recently.
// One resolver, and only one: the async-local frame the scheduler entered.
// Ordinary Node propagation carries it into promise and immediate
// descendants, and a later scheduler callback gets whatever frame the
// scheduler binds for it. A second resolver keyed on the resource's captured
// node used to sit in front of this, but no executable counterexample
// justified it, and an unfalsifiable resolver must not be authoritative. The
// captured node survives as diagnostic metadata only (asyncExecutionNodes),
// where it can be asserted about without deciding placement.
// The simulation generation whose frames are authoritative right now. A
// generation root sets it; everything outside one leaves it null, which is
// the ordinary production case and is why production behaviour is unchanged.
let activeExecutionGenerationId = null;

// LINEAGE TRACKING, which is not the charging window.
//
// Which async resources belong to the active generation, tagged from the
// moment the generation root is entered - before any scenario object exists,
// and therefore before production work can create a resource whose ancestry
// would otherwise be unknown. The measurement window still opens and closes
// where it did; this map only answers "whose is this resource", so that a
// callback dispatching inside the window is attributed correctly and a
// foreign one is not attributed at all.
const asyncGenerationIds = new Map();
let generationLineageHook = null;

function beginGenerationLineage(createHookFn) {
  generationLineageHook = createHookFn({
    init: (asyncId) => {
      const stored = executionNodeContext.getStore();
      // Only resources created INSIDE this generation's async scope. A host
      // resource created while the generation happens to be running - the
      // test runner's own, say - has no frame of ours and stays untagged.
      if (stored !== undefined &&
        stored.generationId === activeExecutionGenerationId) {
        asyncGenerationIds.set(asyncId, stored.generationId);
      }
    },
  });
  // No destroy callback on purpose: a tag must not be able to disappear on a
  // garbage-collection schedule. The whole map is dropped when the generation
  // ends, which is the only moment its answers stop being needed.
  generationLineageHook.enable();
}

function endGenerationLineage() {
  if (generationLineageHook === null) return;
  generationLineageHook.disable();
  generationLineageHook = null;
  asyncGenerationIds.clear();
}

// Whether a dispatching resource is this generation's work at all. Outside a
// generation - ordinary production - everything is, and nothing changes.
function isActiveGenerationResource(asyncId) {
  if (activeExecutionGenerationId === null) return true;
  return asyncGenerationIds.get(asyncId) === activeExecutionGenerationId;
}

function currentExecutionFrame() {
  const stored = executionNodeContext.getStore();
  if (stored === undefined) return null;
  // A frame belonging to another generation is ambient host ancestry as far
  // as this one is concerned. Without this, a callback left over from a
  // finished simulation - or a caller whose promise still descends from one -
  // hands its node to the next simulation's root work, and the same seed
  // charges different nodes depending on what ran before it.
  if (stored.generationId !== activeExecutionGenerationId) return null;
  return stored;
}

function currentExecutionNodeId() {
  const frame = currentExecutionFrame();
  return frame === null ? null : frame.nodeId;
}

/**
 * The formation execution context of whatever is running right now: the sole
 * authority on "is this code executing as part of a simulated production
 * process".
 *
 * It reads the SAME async-local record runOnExecutionNode writes, and it reads
 * it RAW: the generation travels with the frame rather than being looked up
 * from a module global, so a continuation that belongs to generation A is
 * still reported as generation A even if it executes late, during B. That is
 * what stops one generation from donating node identity to the next.
 *
 * Owner attribution is orthogonal. Production may legitimately run with a
 * generation and an execution node and no owner at all, and it is production
 * either way.
 * @return {{generationId: (string|null), executionNodeId: (string|null)}}
 */
function currentFormationExecutionContext() {
  const stored = executionNodeContext.getStore();
  if (stored === undefined) {
    return FORMATION_EXECUTION_CONTEXT_NONE;
  }
  return Object.freeze({
    generationId: stored.generationId ?? null,
    executionNodeId: stored.nodeId ?? null,
  });
}

/**
 * Run a callback as the work of one simulated node.
 * @param {string} executionNodeId
 * @param {Function} callback
 * @param {Object} [event] - the scheduler event being executed, for diagnostics.
 * @returns {*} the callback's result
 */
function runOnExecutionNode(executionNodeId, callback, event = null) {
  return executionNodeContext.run(
    {nodeId: executionNodeId, event, generationId: activeExecutionGenerationId},
    callback);
}

/**
 * Run one whole simulation inside an explicit, tracked root.
 *
 * The root is NODE-NEUTRAL and it OVERRIDES whatever async context invoked
 * the simulation: harness plumbing belongs to no simulated process, and the
 * deterministic scheduler is the only authority that introduces a node. A
 * simulation invoked from a promise that still descends from the previous
 * simulation's node-0 work therefore begins neutral instead of inheriting
 * node-0, and a simulation invoked first in a fresh process is not left
 * without a root merely because nothing had entered one yet.
 *
 * Establishing the root before any scenario object exists is what keeps
 * lineage tracking ahead of production resource creation; it does not move
 * the measurement window, which still opens and closes where it did.
 * @param {string} generationId - unique per simulation invocation
 * @param {Function} callback
 * @returns {Promise<*>} the callback's result
 */
async function runOnSimulationGenerationRoot(generationId, callback) {
  if (activeExecutionGenerationId !== null) {
    throw new Error(NESTED_GENERATION_ERROR);
  }
  activeExecutionGenerationId = generationId;
  beginGenerationLineage(createHook);
  try {
    return await executionNodeContext.run(
      {nodeId: null, event: null, generationId}, callback);
  } finally {
    endGenerationLineage();
    activeExecutionGenerationId = null;
  }
}

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
  mapClear(attribution.asyncExecutionNodes);
  mapClear(attribution.ownerDurationsUs);
  mapClear(attribution.dispatchCounts);
  mapClear(attribution.handoffCounts);
  mapClear(attribution.nodeDispatchCounts);
  mapClear(attribution.nodeHandoffCounts);
  mapClear(attribution.nodeDurationsUs);
  attribution.ownerStack.length = ZERO;
  attribution.executionNodeStackDepths.length = ZERO;
  attribution.activeExecutionNodeId = null;
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
    this.requireExecutionNode =
      readOwnOption(options, EXECUTION_NODE_OPTION, false) === true;
    this.unboundProvenance =
      readOwnOption(options, UNBOUND_PROVENANCE_OPTION, false) === true ? [] : null;
    this.activeOwnerEntryStack = null;
    this.asyncOwners = new MapConstructor();
    this.asyncExecutionNodes = new MapConstructor();
    // Dispatches skipped as foreign, so their matching `after` closes nothing.
    this.foreignDispatches = new MapConstructor();
    // Additive, and empty unless a scheduler binds execution nodes: owner ->
    // count per node, alongside the aggregate rows, which keep exactly the
    // values they had before this repair.
    this.nodeDispatchCounts = new MapConstructor();
    this.nodeHandoffCounts = new MapConstructor();
    this.nodeDurationsUs = new MapConstructor();
    this.executionNodeStackDepths = [];
    this.activeExecutionNodeId = null;
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
      init: (asyncId, type, triggerAsyncId) => {
        this.recordScheduledEntry(asyncId, triggerAsyncId, type);
      },
      before: (asyncId) => this.recordDispatchStart(asyncId),
      after: (asyncId) => this.recordDispatchEnd(asyncId),
      destroy: (asyncId) => {
        mapDelete(this.asyncOwners, asyncId);
        mapDelete(this.asyncExecutionNodes, asyncId);
      },
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

  recordScheduledEntry(asyncId, _triggerAsyncId, type) {
    if (!this.started) return;
    // The exclusive segment is authoritative while JavaScript is running.
    // AsyncLocalStorage can retain a stale bootstrap value on a resource after
    // releaseOwnerDescendants() deliberately reclassifies that dispatch as
    // unattributed; using the active segment prevents its next-generation
    // timers from regaining bootstrap ownership. The context fallback is only
    // for resource creation outside an observed dispatch segment.
    const owner = this.depth > ZERO ?
      this.activeOwner : this.context.getStore();
    const normalized = normalizeOwner(owner);
    mapSet(this.asyncOwners, asyncId, normalized);
    // The node dimension rides in its own map, keyed by the same async id.
    // Keeping it separate is deliberate: releasing an owner's descendants
    // rewrites asyncOwners and must not move the CPU to another node, and the
    // owner map's values stay exactly the strings every existing reader and
    // counterexample expects.
    const capturedNode = this.depth > ZERO ?
      this.activeExecutionNodeId : currentExecutionNodeId();
    mapSet(this.asyncExecutionNodes, asyncId, capturedNode);
    if (this.unboundProvenance !== null && capturedNode === null &&
      normalized !== FORMATION_OWNER.UNATTRIBUTED) {
      this.captureUnboundProvenance(asyncId, _triggerAsyncId, normalized, type);
    }
  }

  emitUnboundProvenance() {
    const [first] = this.unboundProvenance;
    const record = first || {note: 'no attributed unbound resource was captured'};
    process.stderr.write(`UNBOUND PROVENANCE\n${JSON.stringify({
      ...record, creationStack: undefined, ownerEntryStack: undefined,
      refusedOwner: this.activeOwner, refusedDepth: this.depth,
    }, null, 2)}\ncreated at:\n${record.creationStack || PROVENANCE_STACK_ABSENT}\n` +
      `owner entered at:\n${record.ownerEntryStack || PROVENANCE_STACK_ABSENT}\n` +
      `refusal stack:\n${new Error(PROVENANCE_REFUSAL_MARKER).stack}\n`);
  }

  // Debug-only. Records everything needed to reconstruct the causal path of
  // the FIRST attributed async resource created with no execution node, and
  // changes neither counting nor scheduling.
  captureUnboundProvenance(asyncId, triggerAsyncId, capturedOwner, type) {
    if (this.unboundProvenance.length > ZERO) return;
    const frame = currentExecutionFrame();
    arrayPush(this.unboundProvenance, {
      type,
      asyncId,
      triggerAsyncId,
      capturedOwner,
      activeOwner: this.activeOwner,
      depth: this.depth,
      ownerStoreValue: this.context.getStore() ?? null,
      executionFrame: frame === null ? null : {
        nodeId: frame.nodeId,
        eventId: frame.event ? frame.event.id : null,
        eventKind: frame.event ? frame.event.kind : null,
        eventNode: frame.event ? frame.event.nodeId : null,
      },
      triggerHasOwner: mapHas(this.asyncOwners, triggerAsyncId),
      triggerOwner: mapGet(this.asyncOwners, triggerAsyncId) ?? null,
      triggerHasNode: mapHas(this.asyncExecutionNodes, triggerAsyncId),
      triggerNode: mapGet(this.asyncExecutionNodes, triggerAsyncId) ?? null,
      creationStack: new Error(PROVENANCE_CREATION_MARKER).stack,
      ownerEntryStack: this.activeOwnerEntryStack,
    });
  }

  // Per-node rows are additive: the aggregate maps above are written exactly
  // as before, and these carry the node dimension beside them.
  accrueNodeCount(map, executionNodeId, owner, amount) {
    if (executionNodeId === null) return;
    let byOwner = mapGet(map, executionNodeId);
    if (!byOwner) {
      byOwner = new MapConstructor();
      mapSet(map, executionNodeId, byOwner);
    }
    mapSet(byOwner, owner, (mapGet(byOwner, owner) || ZERO) + amount);
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
    this.accrueNodeCount(this.nodeDurationsUs, this.activeExecutionNodeId,
      this.activeOwner, elapsedUs);
  }

  // Fail closed on ATTRIBUTED work only. A segment carrying a real owner with
  // no execution node is a scheduling seam someone forgot to bind, and it must
  // be loud rather than land in unattributed or on whichever node happened to
  // run last. Unattributed plumbing has no node by definition.
  assertActiveSegmentExecutionNodeBound() {
    if (
      !this.requireExecutionNode ||
      this.activeExecutionNodeId !== null ||
      this.activeOwner === FORMATION_OWNER.UNATTRIBUTED
    ) {
      return;
    }
    if (this.unboundProvenance !== null) {
      // The throw travels out through an async_hooks callback, where no
      // caller can catch it, so the debug record is emitted here.
      this.emitUnboundProvenance();
    }
    throw new Error(EXECUTION_NODE_UNBOUND_ERROR);
  }

  enterSegment(owner, countDispatch, countHandoff = false,
    executionNodeId = currentExecutionNodeId()) {
    const nowUs = this.readClockUs();
    if (this.depth > ZERO) this.accrueActiveSegment(nowUs);
    arrayPush(this.ownerStack, this.activeOwner);
    arrayPush(this.executionNodeStackDepths, this.activeExecutionNodeId);
    this.activeOwner = normalizeOwner(owner);
    this.activeExecutionNodeId = executionNodeId;
    this.assertActiveSegmentExecutionNodeBound();
    this.activeSegmentStartedAtUs = nowUs;
    this.depth += 1;
    if (countDispatch) {
      this.turnCount += this.depth === 1 ? 1 : ZERO;
      const count = mapGet(this.dispatchCounts, this.activeOwner) || ZERO;
      mapSet(this.dispatchCounts, this.activeOwner, count + 1);
      this.accrueNodeCount(this.nodeDispatchCounts, this.activeExecutionNodeId,
        this.activeOwner, 1);
    }
    if (countHandoff) {
      const count = mapGet(this.handoffCounts, this.activeOwner) || ZERO;
      mapSet(this.handoffCounts, this.activeOwner, count + 1);
      this.accrueNodeCount(this.nodeHandoffCounts, this.activeExecutionNodeId,
        this.activeOwner, 1);
    }
  }

  leaveSegment() {
    if (!this.started || this.depth === ZERO) return;
    const nowUs = this.readClockUs();
    this.accrueActiveSegment(nowUs);
    this.depth -= 1;
    this.activeOwner = arrayPop(this.ownerStack) || null;
    this.activeExecutionNodeId = arrayPop(this.executionNodeStackDepths) ?? null;
    this.activeSegmentStartedAtUs = this.depth > ZERO ? nowUs : null;
  }

  recordDispatchStart(asyncId) {
    if (!this.started) return;
    // Foreign ambient work: a resource of no active generation - the test
    // runner's, the caller's, or one left behind by an earlier generation -
    // is not this simulation's work and opens no simulator segment. It is
    // deliberately NOT charged to a node either, which is the same rule seen
    // from the other side.
    if (!isActiveGenerationResource(asyncId)) {
      mapSet(this.foreignDispatches, asyncId, true);
      return;
    }
    // The captured node wins over whatever the scheduler ran most recently:
    // this resumption is the CPU of the node that scheduled it, even if the
    // scheduler ran another node's work in between.
    this.enterSegment(
      mapGet(this.asyncOwners, asyncId) || FORMATION_OWNER.UNATTRIBUTED,
      true, false, currentExecutionNodeId(),
    );
  }

  recordDispatchEnd(asyncId) {
    if (mapHas(this.foreignDispatches, asyncId)) {
      mapDelete(this.foreignDispatches, asyncId);
      return;
    }
    this.leaveSegment();
  }

  run(owner, callback) {
    if (!this.started) return callback();
    if (this.unboundProvenance !== null) {
      this.activeOwnerEntryStack =
        new Error(`runFormationOwner(${normalizeOwner(owner)})`).stack;
    }
    const dispatchHandoff = this.depth > ZERO;
    this.enterSegment(owner, false, dispatchHandoff);
    try {
      return this.context.run(normalizeOwner(owner), callback);
    } finally {
      this.leaveSegment();
    }
  }

  // Ownership is released; the CPU does not move. asyncExecutionNodes is
  // deliberately untouched here.
  releaseOwnerDescendants(owner) {
    const normalizedOwner = normalizeOwner(owner);
    mapForEach(this.asyncOwners, (scheduledOwner, asyncId) => {
      if (scheduledOwner === normalizedOwner) {
        mapSet(this.asyncOwners, asyncId, FORMATION_OWNER.UNATTRIBUTED);
      }
    });
  }

  /**
   * The buckets so far, without ending the window: the active segment is
   * accrued up to now and restarted, so a later snapshot or stop() never
   * counts the same time twice. Null when no window is open.
   * @returns {object|null}
   */
  snapshot() {
    if (!this.started) return null;
    const nowUs = this.readClockUs();
    if (this.depth > ZERO) {
      this.accrueActiveSegment(nowUs);
      this.activeSegmentStartedAtUs = nowUs;
    }
    return this.buildSnapshot(nowUs, false);
  }

  buildSnapshot(windowEndedAtUs, windowComplete) {
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
    return {
      schemaVersion: 1,
      windowComplete,
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
      // Additive and empty unless a deterministic scheduler bound execution
      // nodes. The aggregate rows above are untouched, so a live snapshot is
      // byte-for-byte what it was before this dimension existed.
      byExecutionNode: this.buildExecutionNodeRows(),
    };
  }

  buildExecutionNodeRows() {
    const nodeIds = [];
    const seen = objectCreate(null);
    for (const map of [this.nodeDispatchCounts, this.nodeHandoffCounts,
      this.nodeDurationsUs]) {
      mapForEach(map, (_byOwner, executionNodeId) => {
        if (objectHasOwn(seen, executionNodeId)) return;
        seen[executionNodeId] = true;
        arrayPush(nodeIds, executionNodeId);
      });
    }
    arraySort(nodeIds);
    return arrayMap(nodeIds, (executionNodeId) => ({
      executionNodeId,
      owners: arrayMap(sortedOwnerNames(
        mapGet(this.nodeDurationsUs, executionNodeId) || new MapConstructor(),
        mapGet(this.nodeDispatchCounts, executionNodeId) || new MapConstructor(),
        mapGet(this.nodeHandoffCounts, executionNodeId) || new MapConstructor(),
      ), (owner) => {
        const durationUs = mapGet(
          mapGet(this.nodeDurationsUs, executionNodeId) || new MapConstructor(),
          owner) || ZERO;
        const dispatchCount = mapGet(
          mapGet(this.nodeDispatchCounts, executionNodeId) || new MapConstructor(),
          owner) || ZERO;
        const handoffCount = mapGet(
          mapGet(this.nodeHandoffCounts, executionNodeId) || new MapConstructor(),
          owner) || ZERO;
        return {owner, durationUs, dispatchCount, handoffCount,
          turnSegmentCount: dispatchCount + handoffCount};
      }),
    }));
  }

  stop() {
    if (!this.started) return null;
    let snapshotReady = false;
    try {
      const windowEndedAtUs = this.readClockUs();
      if (this.depth > ZERO) {
        this.accrueActiveSegment(windowEndedAtUs);
      }
      const snapshot = this.buildSnapshot(windowEndedAtUs, true);
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

/**
 * The execution node the scheduler is currently running, or null.
 * @returns {string|null}
 */
function currentFormationExecutionNodeId() {
  return currentExecutionNodeId();
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
  EXECUTION_NODE_UNBOUND_ERROR,
  FormationTurnAttribution,
  currentFormationExecutionContext,
  currentFormationExecutionNodeId,
  releaseFormationOwnerDescendants,
  runFormationOwner,
  runOnExecutionNode,
  runOnSimulationGenerationRoot,
};
