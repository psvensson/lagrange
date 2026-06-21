// SWIM probe loop + indirect ping-req relay (cutover plan §5 step 3, increment 3a).
//
// Drives the active failure-detection cadence that feeds MembershipSwimDetector:
// each period it probes one member (round-robin over a seeded shuffle); on a direct
// miss it asks k helpers to ping the target (indirect probe), and records the
// combined outcome. The probe interval is Lifeguard-dynamic — it reads the detector's
// scaled interval each cycle, so a degraded local node automatically slows down.
//
// The transport is an injected interface ({directProbe, indirectProbe}) so the
// orchestration is fully deterministic on VirtualTimeSource + SeededRandomSource and
// independent of the messageRouter envelope shape. The production adapter that binds
// this to messageRouter.pingNode / deliver(swim-relay) + the node-lifecycle wiring is
// increment 3c (validated on the virtual-network harness). Default-off via the
// detector flag — nothing here is instantiated unless the flag is on.

import {resolveTimeSource} from '../time/time-source.js';
import {resolveRandomSource} from '../random/random-source.js';
import {SWIM_DETECTOR_DEFAULTS} from './membership-swim-detector.js';

const SWIM_RELAY_SERVICE = 'swim-relay';
const SWIM_PROBE_MESSAGE_TYPE = 'swim_indirect_probe';

function normalizeNodeId(value) {
  return String(value || '').trim();
}

/** Unified service address for the indirect-probe relay handler. */
function buildSwimRelayAddress(nodeId) {
  return `${normalizeNodeId(nodeId)}/service/${SWIM_RELAY_SERVICE}`;
}

/**
 * Handler for an indirect ping-req: a helper pings the requested target on behalf of
 * the requester and reports reachability. Register at buildSwimRelayAddress(localNodeId).
 * @param {Object} deps - {messageRouter, pingTimeoutMs}
 * @return {Function} async (envelope) => {acknowledged, reachable}
 */
function buildSwimRelayHandler({messageRouter, pingTimeoutMs = null} = {}) {
  return async (envelope) => {
    const targetNodeId = normalizeNodeId(envelope?.payload?.targetNodeId);
    if (!targetNodeId || !messageRouter) {
      return {acknowledged: true, reachable: false};
    }
    const reachable = await messageRouter.pingNode(targetNodeId, pingTimeoutMs);
    return {acknowledged: true, reachable: reachable === true};
  };
}

/**
 * SWIM active-probe loop. Feeds outcomes to a MembershipSwimDetector.
 */
class MembershipSwimProber {
  constructor(options = {}) {
    this._detector = options.detector;
    this._timeSource = resolveTimeSource(options);
    this._randomSource = resolveRandomSource(options);
    this._localNodeId = normalizeNodeId(options.localNodeId) || null;
    this._getMembers =
      typeof options.getMembers === 'function' ? options.getMembers : () => [];
    // transport: {directProbe(nodeId, timeoutMs)->Promise<boolean>,
    //             indirectProbe(helperNodeId, targetNodeId, timeoutMs)
    //               ->Promise<boolean|null>}  (null = helper did not respond)
    this._transport = options.transport || null;
    this._config = {...SWIM_DETECTOR_DEFAULTS, ...(options.config || {})};
    this._timer = null;
    this._running = false;
    // Bumped on every start()/stop(); a reschedule from an in-flight cycle whose
    // generation is stale is ignored, so a stop->start during a cycle cannot leak
    // a second live timer.
    this._generation = 0;
    this._roundRobin = [];
    this._cursor = 0;
  }

  start() {
    if (this._running) {
      return;
    }
    this._running = true;
    this._generation++;
    this._scheduleNext(this._generation);
  }

  stop() {
    this._running = false;
    this._generation++;
    if (this._timer !== null) {
      this._timeSource.clearTimeout(this._timer);
      this._timer = null;
    }
  }

  isRunning() {
    return this._running;
  }

  _scheduleNext(generation) {
    if (!this._running || generation !== this._generation) {
      return;
    }
    if (this._timer !== null) {
      this._timeSource.clearTimeout(this._timer);
      this._timer = null;
    }
    const intervalMs = this._detector.scaledProbeIntervalMs();
    this._timer = this._timeSource.setTimeout(() => {
      this._timer = null;
      if (generation !== this._generation) {
        return;
      }
      // Reschedule after the cycle settles so the interval reflects the latest
      // local-health multiplier (Lifeguard dynamic cadence).
      this._runProbeCycle().then(
        () => this._scheduleNext(generation),
        () => this._scheduleNext(generation),
      );
    }, intervalMs);
  }

  _eligibleMembers() {
    return [
      ...new Set(
        this._getMembers()
          .map(normalizeNodeId)
          .filter((nodeId) => nodeId && nodeId !== this._localNodeId),
      ),
    ];
  }

  // Fisher–Yates over the injected seeded RNG (deterministic).
  _shuffle(list) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this._randomSource.random() * (i + 1));
      const swap = result[i];
      result[i] = result[j];
      result[j] = swap;
    }
    return result;
  }

  // Round-robin over a shuffled snapshot; reshuffle on each full traversal so the
  // probe order varies between rounds while every member is covered once per round.
  _selectTarget() {
    const members = this._eligibleMembers();
    if (members.length === 0) {
      return null;
    }
    const memberSet = new Set(members);
    while (this._cursor < this._roundRobin.length) {
      const candidate = this._roundRobin[this._cursor];
      this._cursor++;
      if (memberSet.has(candidate)) {
        return candidate;
      }
    }
    this._roundRobin = this._shuffle(members);
    this._cursor = 0;
    const target = this._roundRobin[this._cursor];
    this._cursor++;
    return target;
  }

  _pickHelpers(targetNodeId) {
    const candidates = this._eligibleMembers().filter(
      (nodeId) => nodeId !== targetNodeId,
    );
    const shuffled = this._shuffle(candidates);
    return shuffled.slice(0, this._config.indirectProbeCount);
  }

  async _indirectProbe(targetNodeId, timeoutMs) {
    const helpers = this._pickHelpers(targetNodeId);
    if (helpers.length === 0) {
      return false;
    }
    // allSettled (not all): one helper's transport rejection must not poison the
    // others' acks or erase the whole probe outcome. A rejected/throwing helper is
    // treated as "no response" (null), same as a helper that timed out.
    const settled = await Promise.allSettled(
      helpers.map((helperNodeId) =>
        this._transport.indirectProbe(helperNodeId, targetNodeId, timeoutMs),
      ),
    );
    let anyAck = false;
    let anyHelperResponded = false;
    for (const outcome of settled) {
      const result = outcome.status === 'fulfilled' ? outcome.value : null;
      if (result === true) {
        anyAck = true;
      }
      if (result !== null && result !== undefined) {
        anyHelperResponded = true;
      }
    }
    // No helper even responded => our own indirect links are bad: a local-health
    // signal (Lifeguard missed-nack), distinct from the target being down.
    if (!anyHelperResponded) {
      this._detector.recordMissedNack();
    }
    return anyAck;
  }

  /**
   * Run exactly one probe cycle (target select -> direct -> indirect -> record).
   * Public so the cadence can be stepped deterministically by a harness/test
   * without driving the timer + microtask queue.
   * @return {Promise<void>}
   */
  async probeOnce() {
    return this._runProbeCycle();
  }

  async _runProbeCycle() {
    if (!this._transport) {
      return;
    }
    const targetNodeId = this._selectTarget();
    if (!targetNodeId) {
      return;
    }
    const timeoutMs = this._detector.scaledProbeTimeoutMs();
    // A throwing transport must record a MISS, never silently erase the probe.
    let ok = await this._safeDirectProbe(targetNodeId, timeoutMs);
    if (!ok) {
      ok = await this._indirectProbe(targetNodeId, timeoutMs);
    }
    this._detector.recordProbeResult(targetNodeId, ok);
    this._detector.tick();
  }

  async _safeDirectProbe(targetNodeId, timeoutMs) {
    try {
      return (await this._transport.directProbe(targetNodeId, timeoutMs)) === true;
    } catch (_error) {
      return false;
    }
  }
}

export {
  MembershipSwimProber,
  buildSwimRelayHandler,
  buildSwimRelayAddress,
  SWIM_RELAY_SERVICE,
  SWIM_PROBE_MESSAGE_TYPE,
};
