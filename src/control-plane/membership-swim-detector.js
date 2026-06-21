// SWIM + Lifeguard failure detector — pure state machine (cutover plan §5 step 3,
// increment 1). This module is the failure-detector LAYER only: it tracks per-node
// liveness verdicts (alive/suspect/dead) from probe outcomes and gossiped
// suspect/alive messages, with Lifeguard local-health awareness. It performs NO
// transport and NO database writes — the caller feeds it probe outcomes and reads
// its verdict. The agreement layer (Raft-installed control_plane_publications +
// epoch) is untouched; see fd-swim-lifeguard-upgrade-design.md.
//
// Sources: SWIM (Das–Gupta–Motivala, DSN 2002, §3–§4); Lifeguard
// (Dadgar–Phillips–Currey, arXiv:1707.00788 §IV); hashicorp/memberlist LAN
// defaults (config.go / awareness.go / suspicion.go / state.go).
//
// Determinism: time comes only from the injected timeSource, randomness only from
// the injected randomSource (used by the future probe loop, increment 3). Every
// other computation — LHM deltas, incarnation precedence, suspicion decay — is
// pure, so the detector replays exactly on the VirtualTimeSource + SeededRandomSource
// substrate given an ordered message/outcome sequence.

import {resolveTimeSource} from '../time/time-source.js';
import {resolveRandomSource} from '../random/random-source.js';
import {
  MEMBERSHIP_MEMBER_STATE,
  normalizeMembershipMemberState,
} from './membership-lifecycle-constants.js';

const MEMBERSHIP_SWIM_DETECTOR_ENV = 'LAGRANGE_MEMBERSHIP_SWIM_DETECTOR';
// Increment 4: when on (AND the detector is on), the projection CONSUMES the SWIM
// verdict — asymmetrically: a SWIM `alive` PROTECTS a node from a false readiness/
// liveness-grace trim (the Lifeguard benefit); SWIM `dead`/`suspect` never triggers a
// trim (the existing timeout path still removes genuinely-dead nodes). Default-off.
const MEMBERSHIP_SWIM_CONSUME_ENV = 'LAGRANGE_MEMBERSHIP_SWIM_CONSUME';
const ENV_FALSE = 'false';

/**
 * Failure-detector enablement. DEFAULT-ON (opt-out via the env set to 'false') as of
 * 2026-06-21: a matched N=8 gate showed SWIM consumption ~5x'd the rolling-restart
 * scenario-PASS rate (5/8 vs 1/8) and eliminated node exits (0 vs 3) on identical code.
 * Set LAGRANGE_MEMBERSHIP_SWIM_DETECTOR=false to disable.
 * @param {Object} [env=process.env]
 * @return {boolean}
 */
function isMembershipSwimDetectorEnabled(env = process.env) {
  return env?.[MEMBERSHIP_SWIM_DETECTOR_ENV] !== ENV_FALSE;
}

/**
 * Consume the SWIM verdict in the projection (asymmetric protection). DEFAULT-ON
 * (opt-out via the env set to 'false'); inert unless the detector is also enabled.
 * @param {Object} [env=process.env]
 * @return {boolean}
 */
function isMembershipSwimConsumeEnabled(env = process.env) {
  return env?.[MEMBERSHIP_SWIM_CONSUME_ENV] !== ENV_FALSE;
}

const SWIM_MEMBER_STATE = Object.freeze({
  ALIVE: 'alive',
  SUSPECT: 'suspect',
  DEAD: 'dead',
});

// memberlist LAN defaults + Lifeguard parameters.
const SWIM_DETECTOR_DEFAULTS = Object.freeze({
  baseProbeIntervalMs: 1000, // T
  baseProbeTimeoutMs: 500, // < T, ~99p RTT
  awarenessMax: 8, // S: LHM is a saturating counter in [0, S-1]
  suspicionMult: 4, // Min suspicion-timeout coefficient
  suspicionMaxTimeoutMult: 6, // Max = mult * Min
  confirmationsToMin: 3, // K: independent confirmations to collapse Max -> Min
  indirectProbeCount: 3, // k: indirect ping-req fanout (probe loop, increment 3)
  gossipRetransmitMult: 4, // λ: an update is gossiped ceil(mult*log10(n+1)) times
  gossipMaxPiggyback: 6, // max updates carried per probe/ack (SWIM dissemination)
});

const HEALTH_DELTA_SUCCESS = -1;
const HEALTH_DELTA_FAILURE = 1;
const LHM_MIN = 0;
const SELF_CONFIRMER = 'self';
// A gossiped suspect with no resolvable source is still an independent
// confirmation, but must NOT collapse onto the first-hand SELF_CONFIRMER key
// (which would undercount independent confirmations / lengthen the timeout).
const UNKNOWN_CONFIRMER = 'unknown-source';

// Member states that exclude a node from the active set regardless of liveness
// (a draining or retired node is leaving, not serving) — matches the shadow rule's
// MEMBERSHIP_OWNER_INACTIVE_MEMBER_STATES so the two rules trim the same departures.
const SWIM_INACTIVE_MEMBER_STATES = Object.freeze(new Set([
  MEMBERSHIP_MEMBER_STATE.DRAINING,
  MEMBERSHIP_MEMBER_STATE.RETIRED,
]));

function normalizeNodeId(value) {
  return String(value || '').trim();
}

function normalizeNodeIdList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizeNodeId)
      .filter(Boolean),
  )].sort();
}

function isFiniteIncarnation(value) {
  return Number.isFinite(value);
}

/**
 * SWIM + Lifeguard per-node liveness state machine with a Local Health Multiplier.
 */
class MembershipSwimDetector {
  constructor(options = {}) {
    this._timeSource = resolveTimeSource(options);
    this._randomSource = resolveRandomSource(options);
    this._config = {...SWIM_DETECTOR_DEFAULTS, ...(options.config || {})};
    this._localNodeId = normalizeNodeId(options.localNodeId) || null;
    // nodeId -> {nodeId, state, incarnation, suspectRaisedAtMs, suspicionDeadlineMs, confirmers:Set}
    this._members = new Map();
    this._localHealthMultiplier = LHM_MIN;
    this._selfIncarnation = LHM_MIN;
    // Dissemination buffer (SWIM infection-style gossip): nodeId -> {state,
    // incarnation, retransmits}. Each membership state change enqueues an update
    // that drainGossip() piggybacks on outgoing probes a bounded number of times.
    this._gossip = new Map();
  }

  _now(nowMs) {
    return isFiniteIncarnation(nowMs) ? nowMs : this._timeSource.now();
  }

  _member(nodeId) {
    const normalized = normalizeNodeId(nodeId);
    if (!normalized) {
      return null;
    }
    let entry = this._members.get(normalized);
    if (!entry) {
      entry = {
        nodeId: normalized,
        state: SWIM_MEMBER_STATE.ALIVE,
        incarnation: LHM_MIN,
        suspectRaisedAtMs: null,
        suspicionDeadlineMs: null,
        confirmers: new Set(),
      };
      this._members.set(normalized, entry);
    }
    return entry;
  }

  _gossipRetransmitBudget() {
    const n = Math.max(1, this.knownMemberCount());
    return Math.max(1, Math.ceil(this._config.gossipRetransmitMult * Math.log10(n + 1)));
  }

  // Enqueue (or supersede) a membership update for infection-style dissemination,
  // resetting its retransmit budget so the freshest state propagates.
  _enqueueGossipUpdate(nodeId, state, incarnation) {
    const normalized = normalizeNodeId(nodeId);
    if (!normalized) {
      return;
    }
    this._gossip.set(normalized, {
      state,
      incarnation: isFiniteIncarnation(incarnation) ? incarnation : LHM_MIN,
      retransmits: this._gossipRetransmitBudget(),
    });
  }

  /** Lifeguard Local Health Multiplier (saturating counter in [0, S-1]). */
  localHealthMultiplier() {
    return this._localHealthMultiplier;
  }

  _applyHealthDelta(delta) {
    const max = this._config.awarenessMax - 1;
    const next = this._localHealthMultiplier + delta;
    this._localHealthMultiplier = Math.min(Math.max(next, LHM_MIN), max);
  }

  /** Probe interval scaled by local health: base * (LHM + 1). */
  scaledProbeIntervalMs() {
    return this._config.baseProbeIntervalMs * (this._localHealthMultiplier + 1);
  }

  /** Probe timeout scaled by local health: base * (LHM + 1). */
  scaledProbeTimeoutMs() {
    return this._config.baseProbeTimeoutMs * (this._localHealthMultiplier + 1);
  }

  /** Number of members the detector currently tracks (for suspicion scaling). */
  knownMemberCount() {
    return this._members.size;
  }

  // memberlist: nodeScale = max(1, log10(max(1, n))).
  _nodeScale() {
    const n = Math.max(1, this.knownMemberCount());
    return Math.max(1, Math.log10(n));
  }

  _suspicionMinMs() {
    return (
      this._config.suspicionMult * this._nodeScale() * this.scaledProbeIntervalMs()
    );
  }

  _suspicionMaxMs() {
    return this._config.suspicionMaxTimeoutMult * this._suspicionMinMs();
  }

  // Lifeguard LHA-Suspicion: start at Max, decay toward Min as independent
  // confirmations (C) accrue, via log(C+1)/log(K+1).
  _suspicionTimeoutMs(independentConfirmations) {
    const min = this._suspicionMinMs();
    const max = this._suspicionMaxMs();
    const k = this._config.confirmationsToMin;
    const c = Math.max(LHM_MIN, independentConfirmations);
    const fraction = Math.min(1, Math.log(c + 1) / Math.log(k + 1));
    return Math.max(min, max - (max - min) * fraction);
  }

  _recomputeSuspicionDeadline(entry) {
    const independentConfirmations = Math.max(LHM_MIN, entry.confirmers.size - 1);
    entry.suspicionDeadlineMs =
      entry.suspectRaisedAtMs + this._suspicionTimeoutMs(independentConfirmations);
  }

  _raiseSuspicion(entry, confirmer, nowMs) {
    if (entry.state === SWIM_MEMBER_STATE.DEAD) {
      return;
    }
    const now = this._now(nowMs);
    if (entry.state !== SWIM_MEMBER_STATE.SUSPECT) {
      entry.state = SWIM_MEMBER_STATE.SUSPECT;
      entry.suspectRaisedAtMs = now;
      entry.confirmers = new Set([confirmer]);
      this._recomputeSuspicionDeadline(entry);
      this._enqueueGossipUpdate(
        entry.nodeId,
        SWIM_MEMBER_STATE.SUSPECT,
        entry.incarnation,
      );
      return;
    }
    if (!entry.confirmers.has(confirmer)) {
      entry.confirmers.add(confirmer);
      this._recomputeSuspicionDeadline(entry);
    }
  }

  /**
   * First-hand probe outcome for a peer. ok=true is alive evidence (refutes a
   * local suspicion); ok=false drives local health up and starts suspicion.
   * @param {string} nodeId
   * @param {boolean} ok
   * @param {number} [nowMs]
   */
  recordProbeResult(nodeId, ok, nowMs) {
    const entry = this._member(nodeId);
    if (!entry) {
      return;
    }
    if (ok) {
      this._applyHealthDelta(HEALTH_DELTA_SUCCESS);
      if (entry.state === SWIM_MEMBER_STATE.SUSPECT) {
        entry.state = SWIM_MEMBER_STATE.ALIVE;
        entry.suspectRaisedAtMs = null;
        entry.suspicionDeadlineMs = null;
        entry.confirmers = new Set();
        this._enqueueGossipUpdate(
          entry.nodeId,
          SWIM_MEMBER_STATE.ALIVE,
          entry.incarnation,
        );
      }
      return;
    }
    this._applyHealthDelta(HEALTH_DELTA_FAILURE);
    this._raiseSuspicion(entry, SELF_CONFIRMER, nowMs);
  }

  /**
   * Gossiped Suspect(nodeId, incarnation) from another member. Suspect overrides
   * Alive/Suspect at equal-or-higher incarnation (SWIM §4.2 precedence).
   * @param {string} nodeId
   * @param {string} fromNodeId
   * @param {number} incarnation
   * @param {number} [nowMs]
   */
  recordSuspect(nodeId, fromNodeId, incarnation, nowMs) {
    const entry = this._member(nodeId);
    if (!entry || entry.state === SWIM_MEMBER_STATE.DEAD) {
      return;
    }
    // SWIM messages always carry an incarnation; a malformed suspect without one
    // must be dropped, not allowed to bypass precedence and override any Alive.
    if (!isFiniteIncarnation(incarnation) || incarnation < entry.incarnation) {
      return;
    }
    entry.incarnation = incarnation;
    const confirmer = normalizeNodeId(fromNodeId) || UNKNOWN_CONFIRMER;
    this._raiseSuspicion(entry, confirmer, nowMs);
  }

  /**
   * Gossiped Alive(nodeId, incarnation) — a refutation. Alive overrides
   * Suspect/Alive only at a strictly higher incarnation (SWIM §4.2).
   * @param {string} nodeId
   * @param {number} incarnation
   */
  recordAlive(nodeId, incarnation) {
    const entry = this._member(nodeId);
    if (!entry || !isFiniteIncarnation(incarnation)) {
      return;
    }
    if (incarnation <= entry.incarnation) {
      return;
    }
    entry.incarnation = incarnation;
    entry.state = SWIM_MEMBER_STATE.ALIVE;
    entry.suspectRaisedAtMs = null;
    entry.suspicionDeadlineMs = null;
    entry.confirmers = new Set();
    this._enqueueGossipUpdate(
      entry.nodeId,
      SWIM_MEMBER_STATE.ALIVE,
      entry.incarnation,
    );
  }

  /**
   * This node was suspected by a peer. Bump our own incarnation to refute and
   * drive local health up (refuting self is a degradation signal). Returns the
   * incarnation the caller should gossip in the refuting Alive message.
   * @param {number} incarnation - the incarnation the suspicion was about.
   * @return {number} the new self incarnation to advertise.
   */
  recordSelfSuspected(incarnation) {
    if (isFiniteIncarnation(incarnation) && incarnation >= this._selfIncarnation) {
      this._selfIncarnation = incarnation + 1;
      this._applyHealthDelta(HEALTH_DELTA_FAILURE);
      // Gossip the refuting Alive at the bumped incarnation so peers that suspect
      // us learn the higher incarnation and clear their suspicion (SWIM refutation).
      if (this._localNodeId) {
        this._enqueueGossipUpdate(
          this._localNodeId,
          SWIM_MEMBER_STATE.ALIVE,
          this._selfIncarnation,
        );
      }
    }
    return this._selfIncarnation;
  }

  selfIncarnation() {
    return this._selfIncarnation;
  }

  /** A missed indirect-probe nack is a local-health signal (Lifeguard §IV-A). */
  recordMissedNack() {
    this._applyHealthDelta(HEALTH_DELTA_FAILURE);
  }

  /**
   * Advance suspicion timers: any SUSPECT member past its deadline becomes DEAD.
   * @param {number} [nowMs]
   */
  tick(nowMs) {
    const now = this._now(nowMs);
    for (const entry of this._members.values()) {
      if (
        entry.state === SWIM_MEMBER_STATE.SUSPECT &&
        isFiniteIncarnation(entry.suspicionDeadlineMs) &&
        now >= entry.suspicionDeadlineMs
      ) {
        entry.state = SWIM_MEMBER_STATE.DEAD;
        entry.suspicionDeadlineMs = null;
        // Conservatively gossip a SUSPECT (not DEAD): a locally-timed-out node may
        // still be alive-but-unreachable-from-here, so let each peer's own timer +
        // refutation decide rather than propagating a possibly-false death.
        this._enqueueGossipUpdate(
          entry.nodeId,
          SWIM_MEMBER_STATE.SUSPECT,
          entry.incarnation,
        );
      }
    }
  }

  /**
   * Drain up to `max` pending dissemination updates to piggyback on an outgoing
   * probe/ack. Freshest-first (fewest retransmits used). Decrements each drained
   * update's retransmit budget and drops it at zero (infection-style fade-out).
   *
   * Buddy-system (Lifeguard §IV-D): when `priorityNodeId` is given (the probe target),
   * an update ABOUT that node is placed FIRST, so a node always hears accusations about
   * itself at the first contact and can refute before its suspicion timer fires.
   * @param {number} [max]
   * @param {string} [priorityNodeId]
   * @return {Array<{nodeId, state, incarnation}>}
   */
  drainGossip(max, priorityNodeId) {
    const limit = Number.isFinite(max) ?
      Math.max(0, Math.floor(max)) :
      this._config.gossipMaxPiggyback;
    if (limit === 0) {
      return [];
    }
    const priority = normalizeNodeId(priorityNodeId);
    const ordered = [...this._gossip.entries()]
      .filter(([, update]) => update.retransmits > 0)
      .sort((a, b) => {
        if (priority) {
          if (a[0] === priority && b[0] !== priority) {
            return -1;
          }
          if (b[0] === priority && a[0] !== priority) {
            return 1;
          }
        }
        return a[1].retransmits - b[1].retransmits;
      })
      .slice(0, limit);
    const result = [];
    for (const [nodeId, update] of ordered) {
      result.push({nodeId, state: update.state, incarnation: update.incarnation});
      update.retransmits -= 1;
      if (update.retransmits <= 0) {
        this._gossip.delete(nodeId);
      }
    }
    return result;
  }

  /**
   * Apply gossiped membership updates received on a probe/ack. Routes each through
   * the incarnation-precedence handlers; an update about THIS node that suspects it
   * triggers a self-refutation (incarnation bump). Conservatively, a `dead` gossip
   * is applied as a suspicion (local timer + refutation confirm), avoiding
   * cluster-wide amplification of a possibly-false death.
   * @param {Array<{nodeId, state, incarnation}>} updates
   * @param {string} [fromNodeId]
   */
  applyGossip(updates, fromNodeId) {
    if (!Array.isArray(updates)) {
      return;
    }
    for (const update of updates) {
      const nodeId = normalizeNodeId(update?.nodeId);
      if (!nodeId) {
        continue;
      }
      const incarnation = update?.incarnation;
      const state = update?.state;
      if (nodeId === this._localNodeId) {
        if (
          state === SWIM_MEMBER_STATE.SUSPECT ||
          state === SWIM_MEMBER_STATE.DEAD
        ) {
          this.recordSelfSuspected(incarnation);
        }
        continue;
      }
      if (state === SWIM_MEMBER_STATE.ALIVE) {
        this.recordAlive(nodeId, incarnation);
      } else if (
        state === SWIM_MEMBER_STATE.SUSPECT ||
        state === SWIM_MEMBER_STATE.DEAD
      ) {
        this.recordSuspect(nodeId, fromNodeId, incarnation);
      }
    }
  }

  /** Number of pending dissemination updates (test/diagnostic). */
  pendingGossipCount() {
    return this._gossip.size;
  }

  /** Current verdict for a single node (defaults to alive if untracked). */
  verdictFor(nodeId) {
    const entry = this._members.get(normalizeNodeId(nodeId));
    return entry ? entry.state : SWIM_MEMBER_STATE.ALIVE;
  }

  /** Snapshot of every tracked node's verdict: { nodeId: 'alive'|'suspect'|'dead' }. */
  verdictByNodeId() {
    const result = {};
    for (const [nodeId, entry] of this._members.entries()) {
      result[nodeId] = entry.state;
    }
    return result;
  }
}

/**
 * Derive the active-member set from the published baseline + SWIM verdicts. This is
 * the FD-layer's OUTPUT contract — the parallel of computeShadowActiveMemberSet, with
 * the SWIM `dead` verdict as the trim signal instead of "not readiness-promotable":
 *
 * - Under membership freeze (broad suspicion) RETAIN the full published baseline —
 *   the suspicion-quorum safety clamp (a suspicion storm must not trim a quorum).
 * - Outside freeze, a baseline node is trimmed only on a CONFIRMED `dead` verdict.
 *   `suspect` is NOT a trim — strong membership removes only on confirmation, and the
 *   freeze clamp guards mass suspicion. An untracked node defaults to retained (the
 *   same default the shadow rule uses for a node with no readiness entry).
 * - A node whose member state says it is leaving (draining/retired) is excluded.
 *
 * @param {Object} [options]
 * @return {string[]} sorted active-member node ids.
 */
function computeSwimActiveMemberSet(options = {}) {
  const baseline = normalizeNodeIdList(options.publishedBaselineNodeIds);
  const verdicts = options.swimVerdictByNodeId &&
    typeof options.swimVerdictByNodeId === 'object' ?
    options.swimVerdictByNodeId :
    {};
  const memberStates = options.memberStatesByNodeId &&
    typeof options.memberStatesByNodeId === 'object' ?
    options.memberStatesByNodeId :
    {};
  const membershipFreezeActive = options.membershipFreezeActive === true;
  const retained = membershipFreezeActive ?
    baseline :
    baseline.filter(
      (nodeId) =>
        (verdicts[nodeId] || SWIM_MEMBER_STATE.ALIVE) !== SWIM_MEMBER_STATE.DEAD,
    );
  return retained.filter(
    (nodeId) =>
      !SWIM_INACTIVE_MEMBER_STATES.has(
        normalizeMembershipMemberState(memberStates[nodeId]),
      ),
  );
}

export {
  MembershipSwimDetector,
  MEMBERSHIP_SWIM_DETECTOR_ENV,
  MEMBERSHIP_SWIM_CONSUME_ENV,
  SWIM_MEMBER_STATE,
  SWIM_DETECTOR_DEFAULTS,
  isMembershipSwimDetectorEnabled,
  isMembershipSwimConsumeEnabled,
  computeSwimActiveMemberSet,
};
