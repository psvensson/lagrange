import Database from 'better-sqlite3';
import {TIME_MS} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {performTrackedLeaderDemotion} from '../raft/tracked-leader-demotion.js';
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
// Two honest signals, one bound and one strike counter (design-vet ruling):
//   (a) db.inTransaction continuously beyond the max legal transaction hold —
//       honest under the zombie (better-sqlite3 reports the open transaction
//       even though same-connection reads lie about durability), and
//       registry-INdependent (the run-23 zombie was a REGISTERED session);
//   (b) the log adapter's declared commit index (stamped before any isOpen
//       guard) diverging from the DURABLE committedIndex read via a separate
//       READONLY connection — catches the silently-closed-adapter family that
//       holds no transaction at all. File-backed partitions only (:memory:
//       degrades to signal (a), mirroring the split-snapshot accessor).
const LEADER_DURABILITY_LEGAL_HOLD_MS =
  TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS;
const LEADER_DURABILITY_STRIKE_LIMIT = 3;
// Matches the deferCandidacy inflation window: while unfit, deferral must be
// re-asserted at least once per window or the alive zombie (whose in-memory
// log matches the followers') is fully electable again.
const LEADER_DURABILITY_UNFIT_REASON = Object.freeze({
  TRANSACTION_HOLD: 'leader_durability_unfit_transaction_hold',
  COMMIT_DURABILITY_DIVERGENCE:
    'leader_durability_unfit_commit_durability_divergence',
});
const RAFT_STATE_COMMITTED_INDEX_KEY = 'committedIndex';
const SELECT_DURABLE_COMMITTED_INDEX =
  'SELECT value FROM _raft_state WHERE key = ?';
const MEMORY_DB_PATH = ':memory:';

class PartitionServiceDurabilityFitnessMethods {
  getLeaderDurabilityFitnessState() {
    if (!this.leaderDurabilityFitness) {
      this.leaderDurabilityFitness = {
        inTransactionSinceMs: null,
        divergenceSinceMs: null,
        strikes: 0,
        unfit: false,
        activeReason: null,
        handoffRequestedWhileLeader: false,
        readonlyWatermarkDb: null,
        readonlyWatermarkUnavailable: false,
        readonlyWatermarkErrorDeclaredIndex: 0,
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
   * without a viable successor). The default probe reads follower-ack
   * actuals from the raft log adapter; a single-replica group has no
   * successor and stays surface-only.
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
    const ackWindowMs = TIME_MS.SECOND * 10;
    const lastAcks = this.logAdapter?.lastFollowerAckAtByAddress;
    if (lastAcks instanceof Map) {
      for (const ackAtMs of lastAcks.values()) {
        if (Number.isFinite(ackAtMs) && nowMs - ackAtMs <= ackWindowMs) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Read the DURABLE committed watermark through a separate readonly
   * connection — same-connection reads lie inside an open transaction and the
   * adapter's getter serves an in-memory cache. Returns null when no honest
   * durable read is possible (:memory: partitions, open failure).
   * @return {number|null}
   */
  readDurableCommittedIndexWitness(declaredIndex) {
    const state = this.getLeaderDurabilityFitnessState();
    if (!this.dbPath || this.dbPath === MEMORY_DB_PATH) {
      return null;
    }
    if (state.readonlyWatermarkUnavailable) {
      // Retry once per newly declared commit rather than latching blind
      // forever on one transient open/read error.
      if (
        !Number.isFinite(declaredIndex) ||
        declaredIndex <= state.readonlyWatermarkErrorDeclaredIndex
      ) {
        return null;
      }
      state.readonlyWatermarkUnavailable = false;
    }
    try {
      if (!state.readonlyWatermarkDb) {
        state.readonlyWatermarkDb = new Database(this.dbPath, {
          readonly: true,
        });
      }
      const row = state.readonlyWatermarkDb
        .prepare(SELECT_DURABLE_COMMITTED_INDEX)
        .get(RAFT_STATE_COMMITTED_INDEX_KEY);
      const durable = Number(row?.value);
      return Number.isFinite(durable) ? durable : 0;
    } catch {
      this.latchReadonlyWatermarkUnavailable(state, declaredIndex);
      return null;
    }
  }

  latchReadonlyWatermarkUnavailable(state, declaredIndex) {
    state.readonlyWatermarkUnavailable = true;
    state.readonlyWatermarkErrorDeclaredIndex = Number.isFinite(
      declaredIndex,
    ) ?
      declaredIndex :
      0;
    if (state.readonlyWatermarkDb) {
      try {
        state.readonlyWatermarkDb.close();
      } catch {
        // A failed witness must never mask the sweep.
      }
      state.readonlyWatermarkDb = null;
    }
  }

  closeLeaderDurabilityFitnessWitness() {
    const state = this.leaderDurabilityFitness;
    if (state?.readonlyWatermarkDb) {
      try {
        state.readonlyWatermarkDb.close();
      } catch {
        // Closing a readonly witness must never mask shutdown.
      }
      state.readonlyWatermarkDb = null;
    }
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

    return this.observeCommitDurabilityDivergence(nowMs, state, heldMs);
  }

  // Declared-vs-durable divergence is LEGAL for the length of a legal
  // participant session: in-session quorum commits join the open transaction
  // and only become durable at session COMMIT. The signal is stuck only when
  // the divergence SUSTAINS beyond the same legal hold that bounds signal
  // (a) — verifier-confirmed a healthy leader inside a legal >=3s session
  // would otherwise 3-strike into demotion.
  observeCommitDurabilityDivergence(nowMs, state, heldMs) {
    const declaredIndex = this.logAdapter?.getLastDeclaredCommitIndex?.();
    if (!Number.isFinite(declaredIndex) || declaredIndex <= 0) {
      state.divergenceSinceMs = null;
      return {stuck: false, heldMs, divergenceMs: 0};
    }
    const durableIndex = this.readDurableCommittedIndexWitness(declaredIndex);
    if (durableIndex === null || declaredIndex <= durableIndex) {
      state.divergenceSinceMs = null;
      return {stuck: false, heldMs, divergenceMs: 0};
    }
    if (state.divergenceSinceMs === null) {
      state.divergenceSinceMs = nowMs;
    }
    const divergenceMs = nowMs - state.divergenceSinceMs;
    if (divergenceMs < LEADER_DURABILITY_LEGAL_HOLD_MS) {
      return {stuck: false, heldMs, divergenceMs};
    }
    return {
      stuck: true,
      reason: LEADER_DURABILITY_UNFIT_REASON.COMMIT_DURABILITY_DIVERGENCE,
      declaredIndex,
      durableIndex,
      divergenceMs,
    };
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
      declaredIndex: signal.declaredIndex,
      durableIndex: signal.durableIndex,
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
    // do NOT disfavor it: candidacy deferral must be re-asserted every tick
    // while unfit or it re-wins after the deferral window (CL-033/034
    // churn). Asserted BEFORE the viability gate — an unfit CANDIDATE win is
    // unsafe even when no demotion will run (heal-vet hardening G4).
    if (!this.isSoloReplicaGroup?.()) {
      this.raft?.deferCandidacy?.();
    }
    if (!successorViable) {
      // Surface-only: a single-replica (or successor-less) group must keep
      // serving — deposing it would leave no leader at all.
      return;
    }
    if (isLeader && !state.handoffRequestedWhileLeader) {
      state.handoffRequestedWhileLeader = true;
      // The shared flap-safe demotion sequence (one owner with the replica
      // handler's tracked handoff); the hook is notification/observability.
      performTrackedLeaderDemotion(this);
      this.leaderDurabilityUnfitHook?.(evidence);
    }
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
