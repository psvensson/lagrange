/**
 * VirtualNetwork — the DT6 multi-node lift of the DT4/DT5 virtual-clock + PCT seams
 * (deterministic-directed-testing-plan.md, "REMAINING toward DT6": lift the per-instant
 * scheduler to multi-node — per-node virtual clocks + a virtual network — so the search
 * reorders cross-node MESSAGE DELIVERY, not just co-due timers on one clock).
 *
 * The single-node substrate (VirtualTimeSource + PctScheduler) controls one degree of
 * freedom: the order co-due timers on ONE clock fire. A distributed system has a second,
 * larger one: the order in which in-flight messages arrive at different nodes. That is the
 * race the convergence bugs actually live in (leadership migrating off a frozen seed onto a
 * restarting replica; a publication write racing a membership change). VirtualNetwork makes
 * that order a function of the seed so the SAME PCT search that catches a co-due timer race
 * catches a cross-node delivery race.
 *
 * What it is:
 *   - N nodes, each with its own handler and its own LOGICAL CLOCK (nodeNow). An ACTIVE
 *     node's clock tracks global virtual time (it is touched to `now` whenever the node
 *     sends, receives, or arms a timer, or one of its events fires); a STOPPED node's clock
 *     freezes at its last activity. (Divergent per-node clocks while a node keeps RUNNING —
 *     the CL-039 "frozen seed still believes it leads" fault — is a later step; here a
 *     node's clock only lags by being idle or stopped.)
 *   - One global virtual clock and one global event queue holding both in-flight MESSAGES
 *     (from -> to, due at send-time + delay) and per-node TIMERS (owned by one node). An
 *     event's `dueAt` is real causality and is never reordered across distinct instants; the
 *     genuine race — events that come due at the SAME earliest instant — is handed to the
 *     injected PctScheduler exactly as VirtualTimeSource hands it its co-due timers.
 *   - A virtual network with partition/heal and kill/start: a message to a partitioned link
 *     or a stopped node is DROPPED at delivery (recorded), it does not invoke a handler.
 *
 * Determinism + production-inertness: with NO scheduler the co-due set fires in (dueAt, seq)
 * order, byte-identical to a plain priority queue; nothing in src/ constructs a
 * VirtualNetwork (it is a test-harness substrate, like deterministic-simulator.js). A run is
 * a pure function of (seed -> scheduler change points + the scenario's seeded delays), so a
 * failing seed replays the identical delivery interleaving.
 *
 * Reuse: a scenario built on VirtualNetwork plugs straight into the existing pct-search.js
 * layer (exploreWithPct / runPctSeed / minimizePctDepth) — those pass {scheduler, random,
 * seed} to the scenario, which constructs a VirtualNetwork wired to that scheduler. The
 * search layer is unchanged; only this substrate is new.
 */

const VIRTUAL_NETWORK_NUM_ZERO = 0;
const VIRTUAL_NETWORK_NUM_ONE = 1;
const VIRTUAL_NETWORK_DEFAULT_MAX_STEPS = 100000;
const VIRTUAL_NETWORK_LINK_SEPARATOR = '::';
const VIRTUAL_NETWORK_STR_FUNCTION = 'function';
// A repeating adapter timer with a 0ms (or negative) interval would reschedule onto the
// same instant and spin forever inside one drain; clamp the reschedule step to this
// minimum, matching VirtualTimeSource's LOCAL_MIN_INTERVAL_MS (the single-node analog).
const VIRTUAL_NETWORK_MIN_INTERVAL_MS = 1;
// The event type carried by timers scheduled through networkTimeSource (a hosted real
// state machine's VirtualTick), so records/keyOf can distinguish them from scenario timers.
const VIRTUAL_NETWORK_ADAPTER_TIMER_TYPE = 'adapter-timer';

const VIRTUAL_NETWORK_EVENT_KIND = Object.freeze({
  MESSAGE: 'message',
  TIMER: 'timer',
});

const VIRTUAL_NETWORK_NODE_STATE = Object.freeze({
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const VIRTUAL_NETWORK_DROP_REASON = Object.freeze({
  LINK_PARTITIONED: 'link_partitioned',
  NODE_STOPPED: 'node_stopped',
});

const VIRTUAL_NETWORK_RECORD_KIND = Object.freeze({
  DELIVERED: 'delivered',
  DROPPED: 'dropped',
  FIRED: 'fired',
});

// Undirected link identity (partition A<->B drops both directions), order-independent.
function virtualNetworkLinkKey(leftNodeId, rightNodeId) {
  return [leftNodeId, rightNodeId]
    .sort()
    .join(VIRTUAL_NETWORK_LINK_SEPARATOR);
}

function normalizeDelayMs(delayMs) {
  const raw = Number(delayMs);
  return Number.isFinite(raw) && raw > VIRTUAL_NETWORK_NUM_ZERO ?
    Math.floor(raw) :
    VIRTUAL_NETWORK_NUM_ZERO;
}

/**
 * Create a multi-node virtual network on one global virtual clock.
 * @param {Object} [options]
 * @param {Object} [options.scheduler] - optional PctScheduler-shaped strategy with a
 *   pick(coDueEvents) method, used to order events that come due at the SAME instant
 *   (the cross-node delivery race). Absent: (dueAt, seq) order, byte-identical to a plain
 *   priority queue.
 * @param {Object} [options.random] - optional RandomSource (random(): number in [0,1)),
 *   exposed to scenarios so per-message delay jitter is part of the seeded stream. Not used
 *   internally; the network never invents delays.
 * @param {number} [options.startMs=0] - initial global clock value.
 * @return {Object} the network api.
 */
function createVirtualNetwork(options = {}) {
  let nowMs = Number.isFinite(Number(options.startMs)) ?
    Number(options.startMs) :
    VIRTUAL_NETWORK_NUM_ZERO;
  let seq = VIRTUAL_NETWORK_NUM_ZERO;
  let timerSeq = VIRTUAL_NETWORK_NUM_ZERO;
  const scheduler =
    options.scheduler &&
    typeof options.scheduler.pick === VIRTUAL_NETWORK_STR_FUNCTION ?
      options.scheduler :
      null;
  const random =
    options.random &&
    typeof options.random.random === VIRTUAL_NETWORK_STR_FUNCTION ?
      options.random :
      null;
  // The per-node single-core cost model (cost-table.js). When absent (the default)
  // the network charges nothing and is byte-for-byte the un-costed behavior; when a
  // cost table is injected a charged callback advances only its owning node's logical
  // clock, so concurrent work on that node contends (serial) while other nodes proceed.
  const costTable =
    options.costTable &&
    typeof options.costTable.cost === VIRTUAL_NETWORK_STR_FUNCTION ?
      options.costTable :
      null;

  // nodeId -> {state, clockMs, busyUntilMs, handler}
  const nodes = new Map();
  // in-flight events: {seq, dueAt, kind, from, to, type, payload, fn}
  const queue = [];
  const partitions = new Set();
  const records = [];
  // timerId -> {timerId, nodeId, fn, args, repeating, intervalMs, cancelled, event}
  // for timers scheduled through a networkTimeSource adapter (cancellable + re-armable).
  const adapterTimers = new Map();

  function ensureNode(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) {
      throw new Error(`VirtualNetwork: unknown node "${nodeId}" (register it first)`);
    }
    return node;
  }

  function touch(nodeId) {
    // An active node's logical clock follows global time; a stopped node's does not.
    const node = nodes.get(nodeId);
    if (node && node.state === VIRTUAL_NETWORK_NODE_STATE.RUNNING) {
      node.clockMs = nowMs;
    }
  }

  function registerNode(nodeId, handler) {
    nodes.set(nodeId, {
      state: VIRTUAL_NETWORK_NODE_STATE.RUNNING,
      clockMs: nowMs,
      // The node's single-core "busy until" instant. Idle == current time; a charge
      // pushes it forward (start = max(now, busyUntil)), so back-to-back charges on
      // one node serialize. With no cost table this never moves past nowMs.
      busyUntilMs: nowMs,
      handler: typeof handler === VIRTUAL_NETWORK_STR_FUNCTION ? handler : null,
    });
  }

  function startNode(nodeId) {
    const node = ensureNode(nodeId);
    node.state = VIRTUAL_NETWORK_NODE_STATE.RUNNING;
    node.clockMs = nowMs;
    // A (re)started node's single core is idle at the current instant; drop any stale
    // future busy-until carried from before it stopped.
    node.busyUntilMs = nowMs;
  }

  // Charge `virtualMs` of single-core work to one node. The charge serializes against
  // the node's own outstanding work (start = max(now, busyUntil)) and advances ONLY the
  // owning node's logical clock — the global clock and other nodes are untouched, so
  // independent nodes proceed in parallel while concurrent work on one node contends.
  // A no-op for an unknown node or a non-positive charge.
  function chargeNode(nodeId, virtualMs) {
    const node = nodes.get(nodeId);
    if (!node || !(virtualMs > VIRTUAL_NETWORK_NUM_ZERO)) {
      return;
    }
    const start = Math.max(nowMs, node.busyUntilMs);
    node.busyUntilMs = start + virtualMs;
    if (node.state === VIRTUAL_NETWORK_NODE_STATE.RUNNING) {
      node.clockMs = node.busyUntilMs;
    }
  }

  function killNode(nodeId) {
    ensureNode(nodeId).state = VIRTUAL_NETWORK_NODE_STATE.STOPPED;
  }

  function partition(leftNodeId, rightNodeId) {
    partitions.add(virtualNetworkLinkKey(leftNodeId, rightNodeId));
  }

  function heal(leftNodeId, rightNodeId) {
    partitions.delete(virtualNetworkLinkKey(leftNodeId, rightNodeId));
  }

  function isPartitioned(fromNodeId, toNodeId) {
    return partitions.has(virtualNetworkLinkKey(fromNodeId, toNodeId));
  }

  function enqueue(event) {
    queue.push({seq: seq++, ...event});
  }

  /**
   * Send a message from one node to another, arriving after delayMs of virtual time.
   * @param {Object} message - {from, to, type, payload, delayMs}.
   */
  function send(message = {}) {
    ensureNode(message.to);
    if (message.from !== undefined) {
      touch(message.from);
    }
    enqueue({
      kind: VIRTUAL_NETWORK_EVENT_KIND.MESSAGE,
      from: message.from,
      to: message.to,
      type: message.type,
      payload: message.payload || {},
      dueAt: nowMs + normalizeDelayMs(message.delayMs),
      fn: null,
    });
  }

  /**
   * Arm a one-shot timer owned by a node, firing after delayMs of (global) virtual time.
   * @param {string} nodeId
   * @param {Function} fn
   * @param {number} delayMs
   * @param {Object} [payload] - carried on the event so a scheduler keyOf can group it.
   */
  function setTimer(nodeId, fn, delayMs, payload = {}) {
    ensureNode(nodeId);
    touch(nodeId);
    enqueue({
      kind: VIRTUAL_NETWORK_EVENT_KIND.TIMER,
      from: nodeId,
      to: nodeId,
      type: 'timer',
      payload,
      dueAt: nowMs + normalizeDelayMs(delayMs),
      fn: typeof fn === VIRTUAL_NETWORK_STR_FUNCTION ? fn : null,
    });
  }

  // --- networkTimeSource: a per-node DT4 TimeSource backed by this network's queue ----
  // The bridge that lets a REAL state machine seamed on a TimeSource (a LifeRaft node via
  // VirtualTick, the owner driver, the lease) run ON the multi-node substrate: its timers
  // become node-owned TIMER events on the SAME global queue as cross-node messages, so the
  // drain loop advances them together and the injected scheduler can reorder a co-due timer
  // against a co-due message — the cross-node delivery race on a real machine's real clock.
  // The surface mirrors VirtualTimeSource (now/setTimeout/clearTimeout/setInterval/
  // clearInterval) and its firing/re-arm/clamp semantics; the one difference is that delays
  // are floored to whole ms (normalizeDelayMs, the same convention the network uses for
  // message delays) rather than kept fractional — byte-identical for the integer-ms durations
  // a real subsystem uses (liferaft routes every duration through `ms(...)` -> an integer).

  function scheduleAdapterTimer(nodeId, fn, ms, args, repeating) {
    ensureNode(nodeId);
    touch(nodeId);
    const timerId = ++timerSeq;
    const record = {
      timerId,
      nodeId,
      fn: typeof fn === VIRTUAL_NETWORK_STR_FUNCTION ? fn : null,
      args: Array.isArray(args) ? args : [],
      repeating,
      intervalMs: normalizeDelayMs(ms),
      cancelled: false,
      event: null,
    };
    adapterTimers.set(timerId, record);
    enqueueAdapterTimer(record, nowMs + record.intervalMs);
    return timerId;
  }

  function enqueueAdapterTimer(record, dueAt) {
    const event = {
      kind: VIRTUAL_NETWORK_EVENT_KIND.TIMER,
      from: record.nodeId,
      to: record.nodeId,
      type: VIRTUAL_NETWORK_ADAPTER_TIMER_TYPE,
      payload: {owner: record.nodeId, timerId: record.timerId},
      dueAt,
      fn: () => fireAdapterTimer(record),
    };
    record.event = event;
    enqueue(event);
  }

  // Invoked from fireTimer (so the owner-running guard already gated a stopped node out).
  // Mirrors VirtualTimeSource.advance: a repeating timer re-arms (dueAt += clamped step)
  // BEFORE its callback runs, so a callback that clears the interval cancels the re-armed
  // occurrence; a one-shot is forgotten before firing.
  function fireAdapterTimer(record) {
    if (record.cancelled) {
      return;
    }
    if (record.repeating) {
      const step = record.intervalMs > VIRTUAL_NETWORK_NUM_ZERO ?
        record.intervalMs :
        VIRTUAL_NETWORK_MIN_INTERVAL_MS;
      enqueueAdapterTimer(record, nowMs + step);
    } else {
      adapterTimers.delete(record.timerId);
    }
    if (record.fn) {
      record.fn(...record.args);
    }
  }

  function cancelAdapterTimer(handle) {
    const record = adapterTimers.get(handle);
    if (!record) {
      return;
    }
    record.cancelled = true;
    if (record.event) {
      removeFromQueue(record.event);
    }
    adapterTimers.delete(handle);
  }

  /**
   * A DT4 TimeSource bound to one node, scheduling on this network's queue. Pass it as a
   * subsystem's `timeSource` (e.g. `new LifeRaft(id, {timeSource: net.networkTimeSource(id)})`)
   * to host the real machine on the network. now() follows global virtual time while the node
   * runs and freezes at the node's last activity once it is stopped (the per-node-clock
   * contract), so a stopped node's hosted machine sees a frozen clock.
   * @param {string} nodeId - must already be registered.
   * @return {Object} {now, setTimeout, clearTimeout, setInterval, clearInterval}.
   */
  function networkTimeSource(nodeId) {
    ensureNode(nodeId);
    return Object.freeze({
      now() {
        const node = nodes.get(nodeId);
        if (node && node.state === VIRTUAL_NETWORK_NODE_STATE.RUNNING) {
          return nowMs;
        }
        return node ? node.clockMs : nowMs;
      },
      setTimeout(fn, ms, ...args) {
        return scheduleAdapterTimer(nodeId, fn, ms, args, false);
      },
      clearTimeout(handle) {
        cancelAdapterTimer(handle);
      },
      setInterval(fn, ms, ...args) {
        return scheduleAdapterTimer(nodeId, fn, ms, args, true);
      },
      clearInterval(handle) {
        cancelAdapterTimer(handle);
      },
      // The cost-model seam: a hosted machine charges single-core work for an op via
      // its TimeSource. Inert (no clock movement) unless this network was built with a
      // costTable; the matching no-op on src/time/time-source.js lets the same caller
      // run in production and single-node DT4 with zero effect.
      charge(opKey, inputSize) {
        if (!costTable) {
          return;
        }
        chargeNode(nodeId, costTable.cost(opKey, inputSize));
      },
    });
  }

  function record(entry) {
    records.push(Object.freeze({timeMs: nowMs, ...entry}));
  }

  /**
   * The next event to fire among those due at or before the queue's earliest instant. The
   * earliest dueAt always wins (cross-instant order is causality). Among the co-due set
   * (taken in seq order) an injected scheduler picks; with none the lowest seq fires — so
   * the result is the smallest (dueAt, seq), byte-identical to a plain priority queue.
   * @return {Object|null}
   */
  function pickNext() {
    if (queue.length === VIRTUAL_NETWORK_NUM_ZERO) {
      return null;
    }
    let earliest = null;
    for (const event of queue) {
      if (earliest === null || event.dueAt < earliest) {
        earliest = event.dueAt;
      }
    }
    const coDue = queue
      .filter((event) => event.dueAt === earliest)
      .sort((left, right) => left.seq - right.seq);
    if (scheduler !== null) {
      // Honor the scheduler's pick ONLY if it is a member of the co-due set offered to it.
      // The shipped PctScheduler always returns one of its arguments, so this never fires
      // for production use — but a buggy custom scheduler that returned a foreign (e.g.
      // later-due) event would otherwise bypass the cross-instant causality guard silently;
      // fall back to (dueAt, seq) order instead.
      const picked = scheduler.pick(coDue);
      if (picked && coDue.indexOf(picked) >= VIRTUAL_NETWORK_NUM_ZERO) {
        return picked;
      }
    }
    return coDue[VIRTUAL_NETWORK_NUM_ZERO];
  }

  function removeFromQueue(event) {
    const index = queue.indexOf(event);
    if (index >= VIRTUAL_NETWORK_NUM_ZERO) {
      queue.splice(index, VIRTUAL_NETWORK_NUM_ONE);
    }
  }

  function deliverMessage(event) {
    const target = nodes.get(event.to);
    if (!target || target.state !== VIRTUAL_NETWORK_NODE_STATE.RUNNING) {
      record({
        kind: VIRTUAL_NETWORK_RECORD_KIND.DROPPED,
        reason: VIRTUAL_NETWORK_DROP_REASON.NODE_STOPPED,
        from: event.from,
        to: event.to,
        type: event.type,
      });
      return;
    }
    if (event.from !== undefined && isPartitioned(event.from, event.to)) {
      record({
        kind: VIRTUAL_NETWORK_RECORD_KIND.DROPPED,
        reason: VIRTUAL_NETWORK_DROP_REASON.LINK_PARTITIONED,
        from: event.from,
        to: event.to,
        type: event.type,
      });
      return;
    }
    touch(event.to);
    record({
      kind: VIRTUAL_NETWORK_RECORD_KIND.DELIVERED,
      from: event.from,
      to: event.to,
      type: event.type,
    });
    if (target.handler) {
      target.handler(
        Object.freeze({
          from: event.from,
          to: event.to,
          type: event.type,
          payload: event.payload,
        }),
        api,
      );
    }
  }

  function fireTimer(event) {
    const owner = nodes.get(event.from);
    if (!owner || owner.state !== VIRTUAL_NETWORK_NODE_STATE.RUNNING) {
      record({
        kind: VIRTUAL_NETWORK_RECORD_KIND.DROPPED,
        reason: VIRTUAL_NETWORK_DROP_REASON.NODE_STOPPED,
        from: event.from,
        to: event.to,
        type: event.type,
      });
      return;
    }
    touch(event.from);
    record({
      kind: VIRTUAL_NETWORK_RECORD_KIND.FIRED,
      from: event.from,
      to: event.to,
      type: event.type,
    });
    if (event.fn) {
      event.fn(api);
    }
  }

  // The single-core contention gate: if the event's owning node (a TIMER fires on its
  // owner event.from; a MESSAGE is serviced by its recipient event.to) is RUNNING and
  // still busy past this event's dueAt, the node's core cannot service it yet. Re-time
  // the event FORWARD to the node's busyUntilMs and leave it on the queue (do not fire,
  // do not regress the clock). dueAt only ever moves forward, so cross-instant causality
  // and the PctScheduler co-due contract still hold; each defer strictly increases dueAt
  // so the existing maxSteps guard still bounds the loop (no zero-progress spin). With no
  // cost table busyUntilMs never exceeds dueAt, so this never defers — byte-identical.
  function maybeDeferForBusyNode(event) {
    if (!costTable) {
      return false;
    }
    const ownerId = event.kind === VIRTUAL_NETWORK_EVENT_KIND.TIMER ?
      event.from :
      event.to;
    const owner = nodes.get(ownerId);
    if (
      owner &&
      owner.state === VIRTUAL_NETWORK_NODE_STATE.RUNNING &&
      owner.busyUntilMs > event.dueAt
    ) {
      event.dueAt = owner.busyUntilMs;
      return true;
    }
    return false;
  }

  // Returns true if the event actually fired/delivered, false if it was deferred
  // (re-timed forward, left on the queue). With no cost table it always returns true.
  function deliverOne(event) {
    if (maybeDeferForBusyNode(event)) {
      // Deferred: the event stays queued at its new (later) dueAt; the clock does not move.
      return false;
    }
    nowMs = event.dueAt;
    removeFromQueue(event);
    if (event.kind === VIRTUAL_NETWORK_EVENT_KIND.TIMER) {
      fireTimer(event);
    } else {
      deliverMessage(event);
    }
    return true;
  }

  /**
   * Drain the network, delivering each due event in scheduler-chosen order. Handlers may
   * send/setTimer further events; those due within the run fire too. With `untilMs` the
   * drain is BOUNDED: it stops once the earliest pending event is due after untilMs (and
   * advances the global clock to untilMs), the multi-node analog of VirtualTimeSource.advance.
   * A bound is required to host a real state machine that arms repeating timers (a raft
   * heartbeat) — draining to idle would never terminate. Absent untilMs the drain runs to
   * idle, byte-identical to before.
   * @param {Object} [runOptions] - {maxSteps, untilMs}.
   * @return {Object} {steps, remaining, nowMs}.
   */
  function run(runOptions = {}) {
    const maxSteps = Number.isFinite(Number(runOptions.maxSteps)) ?
      Number(runOptions.maxSteps) :
      VIRTUAL_NETWORK_DEFAULT_MAX_STEPS;
    const untilMs = Number.isFinite(Number(runOptions.untilMs)) ?
      Number(runOptions.untilMs) :
      null;
    let steps = VIRTUAL_NETWORK_NUM_ZERO;
    for (;;) {
      const next = pickNext();
      if (!next) {
        break;
      }
      if (untilMs !== null && next.dueAt > untilMs) {
        break;
      }
      if (steps >= maxSteps) {
        throw new Error(
          `VirtualNetwork.run exceeded ${maxSteps} steps — a handler is likely ` +
          'arming zero-delay events without progress',
        );
      }
      steps += VIRTUAL_NETWORK_NUM_ONE;
      deliverOne(next);
    }
    if (untilMs !== null && untilMs > nowMs) {
      nowMs = untilMs;
    }
    return Object.freeze({steps, remaining: queue.length, nowMs});
  }

  /**
   * Deliver exactly ONE event — the next due at or before untilMs in scheduler-chosen order — and
   * return. Unlike run() (which drains a whole co-due batch synchronously before the caller can
   * flush microtasks or observe), this is the unit step for MAX-FIDELITY driving: deliver one
   * event, flush microtasks to quiescence, observe a SETTLED state, repeat. Every observation point
   * is then a real protocol state, so a mid-churn safety invariant can be sampled faithfully with no
   * drive-granularity batch artifact. Mirrors run()'s untilMs/clock semantics.
   * @param {Object} [runOptions] - {untilMs}.
   * @return {Object} {delivered, event|null, nowMs}.
   */
  function runStep(runOptions = {}) {
    const untilMs = Number.isFinite(Number(runOptions.untilMs)) ?
      Number(runOptions.untilMs) :
      null;
    const next = pickNext();
    if (!next || (untilMs !== null && next.dueAt > untilMs)) {
      if (untilMs !== null && untilMs > nowMs) {
        nowMs = untilMs;
      }
      return Object.freeze({delivered: false, event: null, nowMs});
    }
    const snapshot = {
      kind: next.kind,
      from: next.from,
      to: next.to,
      type: next.type,
      dueAt: next.dueAt,
    };
    // A busy owning node defers the event (re-timed forward, left on the queue): report
    // it honestly as not delivered with the new dueAt, so the caller re-steps. With no
    // cost table deliverOne always fires, so this is byte-identical to before.
    if (!deliverOne(next)) {
      snapshot.dueAt = next.dueAt;
      return Object.freeze({
        delivered: false,
        event: Object.freeze(snapshot),
        nowMs,
      });
    }
    return Object.freeze({delivered: true, event: Object.freeze(snapshot), nowMs});
  }

  function now() {
    return nowMs;
  }

  function nodeNow(nodeId) {
    return ensureNode(nodeId).clockMs;
  }

  // The node's single-core "busy until" instant (for cost-model assertions). Equal to
  // the node's clock when idle; ahead of it while outstanding charged work remains.
  function nodeBusyUntil(nodeId) {
    return ensureNode(nodeId).busyUntilMs;
  }

  function nodeState(nodeId) {
    return ensureNode(nodeId).state;
  }

  function getRecords() {
    return Object.freeze([...records]);
  }

  function pendingEventCount() {
    return queue.length;
  }

  const api = Object.freeze({
    now,
    nodeNow,
    nodeBusyUntil,
    nodeState,
    registerNode,
    startNode,
    killNode,
    partition,
    heal,
    send,
    setTimer,
    networkTimeSource,
    run,
    runStep,
    getRecords,
    pendingEventCount,
    random,
  });

  return api;
}

export {
  createVirtualNetwork,
  virtualNetworkLinkKey,
  VIRTUAL_NETWORK_EVENT_KIND,
  VIRTUAL_NETWORK_NODE_STATE,
  VIRTUAL_NETWORK_DROP_REASON,
  VIRTUAL_NETWORK_RECORD_KIND,
  VIRTUAL_NETWORK_ADAPTER_TIMER_TYPE,
};
