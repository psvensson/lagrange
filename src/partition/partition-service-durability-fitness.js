import {TIME_MS} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../control-plane/timeout-budget.js';
import {
  PARTITION_SERVICE_LOG_MSG,
} from './partition-service-constants.js';

// Quest formation-ledger-leader-local-persistence-wedge: a raft leader whose
// local durability has silently frozen must not remain leader. Run-23: a
// zombie participant BEGIN IMMEDIATE on the ledger leader's single sqlite
// connection made every subsequent write non-durable while the leader kept
// replicating and acking in memory — no error, no warning, no recovery, the
// whole cluster's transition writes dead. This mixin is the DETECT + DEMOTE +
// SURFACE side (leadership fitness); the transaction-lifecycle HEAL is the
// companion quest — a leader must NEVER bare-rollback (it re-mints acked
// indices and followers truncate committed entries without a committedIndex
// guard), so demotion is the heal's safety prerequisite.
//
// One honest signal, one bound and one strike counter (design-vet ruling):
// db.inTransaction continuously beyond the max legal transaction hold —
// honest under the zombie (better-sqlite3 reports the open transaction even
// though same-connection reads lie about durability), and
// registry-INdependent (the run-23 zombie was a REGISTERED session). The
// former second signal compared the retired backend's declared commit index
// with its `_raft_state` row; the rs-raft partition path keeps neither, so it
// is gone rather than kept as a reader of a table nothing writes.
const LEADER_DURABILITY_LEGAL_HOLD_MS =
  TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS;
const LEADER_DURABILITY_STRIKE_LIMIT = 3;
// C3 bounded demotion fallback (quest formation-ledger-self-move-blocks-
// cluster-ops, live artifact 2026-07-06): a wedged leader starves the very
// follower-ack evidence hasViableLeaderDurabilitySuccessor needs, so
// successorViable:false is SELF-SUSTAINING while the group's membership holds
// perfectly good voters — the demotion never fires, the role-gated heal never
// opens, and the ledger leader stays wedged for the rest of the run. After
// this bound of CONTINUOUS successorless-unfit ticks a MULTI-MEMBER leader is
// demoted anyway: every 1s tick re-checks the 10s ack window first, so any
// genuinely-acking follower flips the normal viable-successor handoff well
// inside the bound; a leader this path demotes was not providing durable
// service to anyone. Solo groups stay structurally exempt (deposing the only
// replica leaves no leader, and the heal is already permitted in place). This
// bounds CL-039's never-shed-without-successor to the window where the
// viability sensor can still be trusted — the guard FINAL-vetted-verdict.md
// names C3.
const LEADER_DURABILITY_SUCCESSORLESS_DEMOTION_FALLBACK_MS =
  TIME_MS.SECOND * 15;
// Matches the deferCandidacy inflation window: while unfit, deferral must be
// re-asserted at least once per window or the alive zombie (whose in-memory
// log matches the followers') is fully electable again.
const LEADER_DURABILITY_UNFIT_REASON = Object.freeze({
  TRANSACTION_HOLD: 'leader_durability_unfit_transaction_hold',
});
// The frozen operation port has no step-down and no candidacy-deferral
// operation (epic raft-rs-full-cutover finding F1), so neither consequence of
// unfitness can be carried out. Each is stated as a typed outcome in the
// unfitness evidence instead of a call that silently does nothing.
const LEADER_DURABILITY_CONSEQUENCE_OUTCOME = Object.freeze({
  CANDIDACY_DEFERRAL_UNSUPPORTED:
    'leader_durability_candidacy_deferral_unsupported',
  DEMOTION_UNSUPPORTED: 'leader_durability_demotion_unsupported',
});
const ABSENT_DURABILITY_TIMESTAMP = null;

class PartitionServiceDurabilityFitnessMethods {
  getLeaderDurabilityFitnessState() {
    if (!this.leaderDurabilityFitness) {
      this.leaderDurabilityFitness = {
        inTransactionSinceMs: null,
        strikes: 0,
        unfit: false,
        activeReason: null,
        handoffRequestedWhileLeader: false,
        successorlessUnfitSinceMs: ABSENT_DURABILITY_TIMESTAMP,
      };
      this.isLeaderDurabilityUnfit = false;
    }
    return this.leaderDurabilityFitness;
  }

  /**
   * The replica handler wires this to requestTrackedPartitionLeaderHandoff;
   * tests inject recorders. Invoked with the unfitness evidence when a LEADER
   * crosses the strike bound (and again if it re-wins leadership while unfit).
   * @param {Function} hook
   */
  setLeaderDurabilityUnfitHook(hook) {
    this.leaderDurabilityUnfitHook =
      typeof hook === 'function' ? hook : null;
  }

  /**
   * Cluster-informed successor viability (CL-039: never shed leadership
   * without a viable successor). Without a probe no successor is provable:
   * the follower-ack actuals the default used to read lived on the retired
   * backend's log adapter. A single-replica group has no successor and stays
   * surface-only.
   * @param {Function} probe
   */
  setLeaderDurabilitySuccessorProbe(probe) {
    this.leaderDurabilitySuccessorProbe =
      typeof probe === 'function' ? probe : null;
  }

  hasViableLeaderDurabilitySuccessor(nowMs) {
    if (this.leaderDurabilitySuccessorProbe) {
      return this.leaderDurabilitySuccessorProbe(nowMs) === true;
    }
    return false;
  }

  /**
   * C3 bounded demotion fallback: true once a MULTI-MEMBER leader has been
   * continuously successorless-unfit for the full fallback bound. The wedged
   * leader is the reason no successor can be proven (it starves follower-ack
   * evidence), so ack-recency viability is a lying sensor here — membership
   * shape (solo vs multi-member) decides structural exemption instead. The
   * clock resets whenever fitness recovers, a successor becomes provable, or
   * the node is no longer the leader.
   * @param {number} nowMs
   * @param {Object} state
   * @param {boolean} isLeader
   * @return {boolean}
   * @private
   */
  shouldDemoteSuccessorlessUnfitLeader(nowMs, state, isLeader) {
    if (!isLeader || this.isSoloReplicaGroup?.() !== false) {
      state.successorlessUnfitSinceMs = ABSENT_DURABILITY_TIMESTAMP;
      return false;
    } else if (
      state.successorlessUnfitSinceMs === ABSENT_DURABILITY_TIMESTAMP
    ) {
      state.successorlessUnfitSinceMs = nowMs;
    }
    return (
      nowMs - state.successorlessUnfitSinceMs >=
      LEADER_DURABILITY_SUCCESSORLESS_DEMOTION_FALLBACK_MS
    );
  }

  /**
   * One durability-fitness tick. Rides the same 1s sweep as
   * enforcePreparedStateHoldTimeouts; nowMs-overridable for deterministic
   * tests exactly like that sweep.
   * @param {number} [nowMs]
   * @return {Object} The tick observation (for tests/diagnostics).
   */
  enforceLeaderDurabilityFitness(nowMs = Date.now()) {
    const state = this.getLeaderDurabilityFitnessState();
    const signal = this.observeLeaderDurabilitySignals(nowMs, state);
    if (!signal.stuck) {
      const wasUnfit = state.unfit;
      state.strikes = 0;
      state.unfit = false;
      state.activeReason = null;
      state.handoffRequestedWhileLeader = false;
      state.successorlessUnfitSinceMs = ABSENT_DURABILITY_TIMESTAMP;
      this.isLeaderDurabilityUnfit = false;
      if (wasUnfit) {
        this.logger.info(
          PARTITION_SERVICE_LOG_MSG.LEADER_DURABILITY_RECOVERED,
          {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
          },
        );
      }
      return {fit: true, ...signal};
    }

    state.strikes += 1;
    if (state.strikes < LEADER_DURABILITY_STRIKE_LIMIT && !state.unfit) {
      return {fit: true, pendingStrikes: state.strikes, ...signal};
    }

    const firstDetection = !state.unfit;
    state.unfit = true;
    state.activeReason = signal.reason;
    this.isLeaderDurabilityUnfit = true;
    this.resolveLeaderDurabilityUnfitConsequence(nowMs, state, {
      firstDetection,
      signal,
    });
    return {fit: false, reason: signal.reason, strikes: state.strikes};
  }

  observeLeaderDurabilitySignals(nowMs, state) {
    const inTransaction = Boolean(this.db?.open && this.db.inTransaction);
    if (!inTransaction) {
      state.inTransactionSinceMs = null;
    } else if (state.inTransactionSinceMs === null) {
      state.inTransactionSinceMs = nowMs;
    }
    const heldMs =
      state.inTransactionSinceMs === null ?
        0 :
        nowMs - state.inTransactionSinceMs;
    if (inTransaction && heldMs >= LEADER_DURABILITY_LEGAL_HOLD_MS) {
      return {
        stuck: true,
        reason: LEADER_DURABILITY_UNFIT_REASON.TRANSACTION_HOLD,
        heldMs,
      };
    }
    return {stuck: false, heldMs};
  }

  resolveLeaderDurabilityUnfitConsequence(
    nowMs,
    state,
    {firstDetection, signal},
  ) {
    const isLeader = this.role === RAFT_ROLE.LEADER;
    if (!isLeader) {
      state.handoffRequestedWhileLeader = false;
    }
    const successorViable = this.hasViableLeaderDurabilitySuccessor(nowMs);
    const evidence = Object.freeze({
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      reason: signal.reason,
      strikes: state.strikes,
      role: this.role,
      successorViable,
      heldMs: signal.heldMs,
      candidacyDeferral:
        LEADER_DURABILITY_CONSEQUENCE_OUTCOME.CANDIDACY_DEFERRAL_UNSUPPORTED,
      demotion: LEADER_DURABILITY_CONSEQUENCE_OUTCOME.DEMOTION_UNSUPPORTED,
    });
    if (firstDetection) {
      // The loud surfacing lives HERE: the handoff seam itself logs nothing
      // (design-vet finding) and run-23's whole failure was silence.
      this.logger.error(
        PARTITION_SERVICE_LOG_MSG.LEADER_DURABILITY_UNFIT,
        evidence,
      );
    }
    // The alive zombie's in-memory log matches the followers', so vote rules
    // do NOT disfavor it: it needs candidacy deferral while unfit (CL-033/034
    // churn), which the port cannot provide; the evidence above carries
    // CANDIDACY_DEFERRAL_UNSUPPORTED rather than a no-op call here.
    if (successorViable) {
      state.successorlessUnfitSinceMs = ABSENT_DURABILITY_TIMESTAMP;
    } else if (
      !this.shouldDemoteSuccessorlessUnfitLeader(nowMs, state, isLeader)
    ) {
      // Surface-only: a solo group keeps serving forever (deposing the only
      // replica leaves no leader, and its heal is already permitted in
      // place); a multi-member group holds the seat only until the bounded
      // fallback expires.
      return;
    }
    if (isLeader && !state.handoffRequestedWhileLeader) {
      state.handoffRequestedWhileLeader = true;
      this.demoteDurabilityUnfitLeader(nowMs, state, evidence, successorViable);
    }
  }

  /**
   * The demotion tail shared by the normal viable-successor handoff and the
   * C3 successorless bounded fallback; the fallback path is logged LOUD and
   * distinct. The port has no step-down operation, so no demotion runs: the
   * evidence handed to the hook carries DEMOTION_UNSUPPORTED. The hook is
   * notification/observability.
   * @param {number} nowMs
   * @param {Object} state
   * @param {Object} evidence
   * @param {boolean} successorViable
   * @private
   */
  demoteDurabilityUnfitLeader(nowMs, state, evidence, successorViable) {
    if (!successorViable) {
      this.logger.error(
        PARTITION_SERVICE_LOG_MSG
          .LEADER_DURABILITY_SUCCESSORLESS_DEMOTION_FALLBACK,
        {
          ...evidence,
          successorlessForMs: nowMs - state.successorlessUnfitSinceMs,
        },
      );
    }
    this.leaderDurabilityUnfitHook?.(evidence);
  }
}

function createPartitionServiceDurabilityFitnessMethods() {
  const methods = {};
  const prototypeNames = Object.getOwnPropertyNames(
    PartitionServiceDurabilityFitnessMethods.prototype,
  );
  for (const name of prototypeNames) {
    if (name === 'constructor') {
      continue;
    }
    methods[name] = PartitionServiceDurabilityFitnessMethods.prototype[name];
  }
  return methods;
}

export {
  LEADER_DURABILITY_UNFIT_REASON,
  createPartitionServiceDurabilityFitnessMethods,
};
