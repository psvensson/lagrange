// SWIM failure-detector runtime owner (cutover plan §5 step 3, increment 3c-ii).
//
// Composes the detector + prober + messageRouter transport adapter + relay handler
// into one lifecycle-managed object: the single thing the node bootstrap instantiates
// (flag-gated) and the membership coordinator reads for the divergence emission. It
// owns start/stop (registers the relay handler + starts the probe loop) and exposes
// the verdict + the SWIM-derived active set. Default-on (opt out with the flag):
// nothing here is constructed when isMembershipSwimDetectorEnabled() is false at the wiring site.

import {
  MembershipSwimDetector,
  computeSwimActiveMemberSet,
} from './membership-swim-detector.js';
import {
  MembershipSwimProber,
  buildSwimRelayHandler,
  buildSwimPingHandler,
  buildSwimMessageRouterTransport,
  buildSwimRelayAddress,
  buildSwimPingAddress,
} from './membership-swim-prober.js';

class MembershipSwimRuntime {
  constructor(options = {}) {
    this._nodeId = String(options.nodeId || '').trim() || null;
    this._messageRouter = options.messageRouter || null;
    this._logger = options.logger || null;
    const pingTimeoutMs = options.pingTimeoutMs ?? null;
    this._detector = new MembershipSwimDetector({
      timeSource: options.timeSource,
      randomSource: options.randomSource,
      localNodeId: this._nodeId,
      config: options.config,
    });
    this._transport = buildSwimMessageRouterTransport({
      messageRouter: this._messageRouter,
      pingTimeoutMs,
    });
    this._prober = new MembershipSwimProber({
      detector: this._detector,
      timeSource: options.timeSource,
      randomSource: options.randomSource,
      localNodeId: this._nodeId,
      getMembers:
        typeof options.getMembers === 'function' ? options.getMembers : () => [],
      transport: this._transport,
      config: options.config,
    });
    this._relayHandler = buildSwimRelayHandler({
      messageRouter: this._messageRouter,
      pingTimeoutMs,
    });
    this._pingHandler = buildSwimPingHandler({detector: this._detector});
    this._relayAddress = this._nodeId ? buildSwimRelayAddress(this._nodeId) : null;
    this._pingAddress = this._nodeId ? buildSwimPingAddress(this._nodeId) : null;
    this._handlersRegistered = false;
  }

  /** Register the direct-probe + indirect-relay handlers and start the probe loop. */
  start() {
    if (
      !this._handlersRegistered &&
      this._messageRouter &&
      typeof this._messageRouter.register === 'function'
    ) {
      if (this._pingAddress) {
        this._messageRouter.register(this._pingAddress, this._pingHandler);
      }
      if (this._relayAddress) {
        this._messageRouter.register(this._relayAddress, this._relayHandler);
      }
      this._handlersRegistered = true;
    }
    this._prober.start();
  }

  /** Stop the probe loop (the relay handler is left registered for graceful drain). */
  stop() {
    this._prober.stop();
  }

  isRunning() {
    return this._prober.isRunning();
  }

  /** Run one probe cycle deterministically (harness/test stepping). */
  probeOnce() {
    return this._prober.probeOnce();
  }

  /** Advance suspicion timers. */
  tick(nowMs) {
    this._detector.tick(nowMs);
  }

  detector() {
    return this._detector;
  }

  /** Current per-node liveness verdict snapshot. */
  verdictByNodeId() {
    return this._detector.verdictByNodeId();
  }

  /**
   * The SWIM-derived active-member set for the given published baseline — the
   * value the coordinator diffs against the projection's published set.
   * @param {Object} options - {publishedBaselineNodeIds, memberStatesByNodeId, membershipFreezeActive}
   * @return {string[]}
   */
  activeMemberSet(options = {}) {
    return computeSwimActiveMemberSet({
      publishedBaselineNodeIds: options.publishedBaselineNodeIds,
      swimVerdictByNodeId: this._detector.verdictByNodeId(),
      memberStatesByNodeId: options.memberStatesByNodeId,
      membershipFreezeActive: options.membershipFreezeActive,
    });
  }
}

export {MembershipSwimRuntime};
