import {TIME_MS} from '../constants/index.js';
import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  OPERATION_LEDGER_HOLD,
  OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME,
  classifyOperationLedgerHoldMove,
  isDisruptiveOperationLedgerSelfMove,
  isLedgerQuorumConcentratedPartition,
  resolveEngagedLedgerQuorumSpreadHold,
  resolveOperationLedgerHoldEngagement,
} from './operation-ledger-hold-policy.js';

const {
  REBALANCE_COORDINATOR_LOG_MSG,
  SERVICE_TYPE,
  STORAGE_ADMISSION_DECISION_TYPE,
} = REBALANCE_COORDINATOR_SHARED;

const LOCAL_STR_FUNCTION = 'function';

// Every operation persists its workflow progress into the replica_operations
// LEDGER, so a REPLACE/REMOVE of a ledger partition (the ledger moving itself)
// disrupts every other in-flight operation's progress writes (run-20 formation
// interlock; CL-017 mechanism at storm scale). The ledger self-move therefore
// runs EXCLUSIVELY: it admits only into an idle ledger, and while it is live no
// other operation admits. The (hold x move class) -> engagement relation is
// owned by operation-ledger-hold-policy.js; this file owns the MECHANISM
// (typed rejection construction, observation scans, TOCTOU accounting).
// Deterministic reproduction:
// test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js.
const OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX = 'Operation-ledger partition ';
const OPERATION_LEDGER_SELF_MOVE_WAITING_MESSAGE_SUFFIX =
  ' self-move admits only into an idle operation ledger';
const OPERATION_LEDGER_SELF_MOVE_BLOCKING_MESSAGE_SUFFIX =
  ' self-move in flight; operation admission deferred until it completes';
const OPERATION_LEDGER_SELF_MOVE_BLOCKING_REASON_CODE =
  'operation_ledger_self_move_in_flight';
const OPERATION_LEDGER_SELF_MOVE_WAITING_REASON_CODE =
  'operation_ledger_self_move_waiting_for_idle_ledger';
const OPERATION_LEDGER_QUORUM_CONCENTRATED_REASON_CODE =
  'operation_ledger_quorum_concentrated';
const OPERATION_LEDGER_QUORUM_CONCENTRATED_MESSAGE_SUFFIX =
  ' quorum is concentrated on one node; operation admission deferred until ' +
  'the ledger spreads';
const OPERATION_LEDGER_QUORUM_HOLD_WARN_INTERVAL_MS = TIME_MS.SECOND * 30;

// Interlock rejections must ride the admission channel (error.admissionResult)
// so the DDL partition-provisioning loop absorbs them as target rejections and
// re-plans, instead of re-throwing them to the client as internal errors. The
// rebalance loop keeps using rebalanceSkipReason on the same error.
function buildOperationLedgerInterlockAdmissionResult(reasonCode) {
  return Object.freeze({
    allowed: false,
    decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
    reason: reasonCode,
    blockingReasons: Object.freeze([Object.freeze({code: reasonCode})]),
  });
}

class RebalanceCoordinatorLedgerInterlockAdmissionMethods {
  /**
   * Owner-row read (operation-ledger-hold-policy.js): kept as a method so
   * observation scans and the sync gate share one call surface.
   * @param {string|null} normalizedMoveType
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isDisruptiveOperationLedgerSelfMove(normalizedMoveType, partitionId) {
    return isDisruptiveOperationLedgerSelfMove(normalizedMoveType, partitionId);
  }

  /**
   * A ledger-interlock participant is an operation that still writes progress
   * into the operation ledger: non-terminal AND not already stale past its
   * step timeout (the CL-043 exclusion — a wedged phantom is a reaper
   * candidate, not a serialization holder, so it must not dam admission).
   * When the staleness predicate is unavailable the operation is
   * conservatively treated as live.
   * @param {Object} operation
   * @param {number} nowMs
   * @return {boolean}
   * @private
   */
  isLiveOperationLedgerInterlockOperation(operation, nowMs) {
    if (!operation || this.isOperationTerminal(operation)) {
      return false;
    }
    if (
      typeof this.workflowOwner?.isConcurrentOperationStalePastStepTimeout ===
      LOCAL_STR_FUNCTION
    ) {
      return !this.workflowOwner.isConcurrentOperationStalePastStepTimeout(
        operation,
        nowMs,
      );
    }
    return true;
  }

  /**
   * Serialize the operation-ledger self-move against ALL other operations.
   *
   * The replica_operations table is where every operation persists workflow
   * progress. Moving one of its partitions while other operations are in
   * flight makes their progress writes (and the self-move's own) fail against
   * the mid-move ledger raft group — the run-20 formation interlock: all
   * operations pin non-terminal, zero completions, client DDL starves. The
   * deterministic reproduction
   * (test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js)
   * proves co-scheduling stalls while serialized dispatch completes.
   *
   * Which moves are exempt, idle-only, or deferred comes from the owner
   * relation (operation-ledger-hold-policy.js). This method owns the
   * MECHANISM per outcome, surfaced as the standard typed budget skip so the
   * planner retries next cycle:
   * - IDLE_ONLY (the disruptive ledger self-move) admits only when no other
   *   live operation exists.
   * - DEFER waits out a live ledger self-move, then the quorum-spread hold;
   *   the staleness exclusion still bounds a wedged self-move.
   * - EXEMPT (emergency quorum-restore ADDs) proceeds without observation.
   *
   * Inputs are actuals only: committed replica_operations rows via the
   * established incomplete-operation observation (ARCH-0080/0084).
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureOperationLedgerSelfMoveSerialized(context) {
    const normalizedMoveType = context?.normalizedMoveType;
    const partitionId = context?.partitionId;
    const moveClass = classifyOperationLedgerHoldMove(
      normalizedMoveType,
      partitionId,
    );
    const selfMoveEngagement = resolveOperationLedgerHoldEngagement(
      OPERATION_LEDGER_HOLD.SELF_MOVE_SERIALIZATION,
      moveClass,
    );
    if (
      selfMoveEngagement === OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT
    ) {
      return;
    }
    const isDisruptiveSelfMove =
      selfMoveEngagement === OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.IDLE_ONLY;

    const incompleteOperations = await this.queryIncompleteOperations();
    const observation = this.getIncompleteOperationObservation(
      incompleteOperations,
    );
    const observedOperations = Array.isArray(incompleteOperations) ?
      incompleteOperations :
      [];
    const nowMs = this.timeSource?.now?.() ?? Date.now();
    const currentOperationId = String(
      context?.move?.operationId || '',
    ).trim();
    const liveOperations = observedOperations.filter(
      (operation) =>
        operation?.operationId !== currentOperationId &&
        this.isLiveOperationLedgerInterlockOperation(operation, nowMs),
    );

    if (isDisruptiveSelfMove) {
      const conflictingOperation = await this.resolveDisruptiveSelfMoveConflict(
        liveOperations,
        partitionId,
      );
      if (conflictingOperation) {
        throw this.createOperationLedgerInterlockError(
          normalizedMoveType,
          OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX +
            String(partitionId) +
            OPERATION_LEDGER_SELF_MOVE_WAITING_MESSAGE_SUFFIX,
          OPERATION_LEDGER_SELF_MOVE_WAITING_REASON_CODE,
          conflictingOperation.operationId,
        );
      }
      // The disruptive self-move must not admit blind: unresolved operation
      // visibility defers it (it is rare and planner-retried; admitting into
      // an unobserved ledger is exactly the run-20 storm).
      if (observation?.deferredOutcome) {
        throw this.createDeferredOperationVisibilityError(
          normalizedMoveType,
          observation,
          {
            partitionId: partitionId || null,
            entityType: context?.entityType || SERVICE_TYPE.PARTITION,
            entityId: context?.entityId || partitionId || null,
          },
        );
      }
      return;
    }

    // Every other operation defers while a live ledger self-move exists. This
    // direction gates only on OBSERVED rows (absence of actuals never blocks
    // routine admission).
    const liveLedgerSelfMove = liveOperations.find((operation) =>
      this.isDisruptiveOperationLedgerSelfMove(
        operation?.type,
        operation?.partitionId,
      ),
    );
    if (!liveLedgerSelfMove) {
      // The run-22 release-too-early gap: with no self-move in flight the
      // run-20 hold is open, but the ledger quorum may STILL be concentrated
      // (a leadership-only relocation leaves the follower majority on the hot
      // node). Dependent admission keeps deferring until placement actuals
      // show the quorum spread; the exempt rows (the cure self-move, handled
      // in the disruptive branch above, and emergency quorum-restore ADDs)
      // come from the owner relation.
      if (
        resolveOperationLedgerHoldEngagement(
          OPERATION_LEDGER_HOLD.QUORUM_SPREAD,
          moveClass,
        ) !== OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT
      ) {
        this.ensureOperationLedgerQuorumSpreadFirst(
          normalizedMoveType,
          partitionId,
        );
      }
      return;
    }
    throw this.createOperationLedgerInterlockError(
      normalizedMoveType,
      OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX +
        String(liveLedgerSelfMove.partitionId) +
        OPERATION_LEDGER_SELF_MOVE_BLOCKING_MESSAGE_SUFFIX,
      OPERATION_LEDGER_SELF_MOVE_BLOCKING_REASON_CODE,
      liveLedgerSelfMove.operationId,
    );
  }

  /**
   * Resolve the first GENUINE live conflicting operation for a disruptive ledger
   * self-move, re-verifying same-ledger-partition self-move blockers against the
   * authoritative owner path first.
   *
   * The interlock's live set comes from the CACHE-FIRST incomplete-operation
   * observation, which after a mid-drain ledger-leadership handoff can hold a
   * BOOKKEEPING-LAG GHOST of a prior spread self-move (the new leader inherited a
   * cache frozen at STOPPING microseconds before the source-removal committed and
   * the row terminalized). That ghost would wedge every subsequent count-neutral
   * spread REPLACE on `waiting_for_idle_ledger` until the CL-043 step-timeout
   * (60s) — past the dependent CREATE-TABLE provisioning budget. A cache-bypassing
   * owner-RPC re-verify distinguishes the ghost (authoritatively terminal → not a
   * contender) from a genuinely in-flight reconfiguration (authoritatively
   * non-terminal → still blocks, so two concurrent ledger config changes never
   * co-admit — run-20 serialization preserved). The re-verify is scoped to a
   * self-move of the SAME ledger partition; a dependent operation of any other
   * partition is a genuine ledger-write contender and always blocks.
   * @param {Array<Object>} liveOperations
   * @param {string|null} selfMovePartitionId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveDisruptiveSelfMoveConflict(liveOperations, selfMovePartitionId) {
    const normalizedSelfMovePartitionId = String(
      selfMovePartitionId || '',
    ).trim();
    for (const operation of liveOperations) {
      const isSamePartitionSelfMove =
        this.isDisruptiveOperationLedgerSelfMove(
          operation?.type,
          operation?.partitionId,
        ) &&
        String(operation?.partitionId || '').trim() ===
          normalizedSelfMovePartitionId &&
        normalizedSelfMovePartitionId.length > 0;
      if (
        isSamePartitionSelfMove &&
        (await this.isStaleTerminalLedgerSelfMoveGhost(operation))
      ) {
        continue;
      }
      return operation;
    }
    return null;
  }

  /**
   * A same-ledger-partition self-move blocker is a stale ghost only when a
   * CACHE-BYPASSING authoritative owner read confirms it terminal. An unreadable
   * or deferred authoritative visibility keeps it blocking (conservative: while
   * the ledger is mid-move its reads failing IS the condition being serialized
   * against, and the CL-043 staleness bound still releases a truly wedged
   * self-move once its row is readable).
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async isStaleTerminalLedgerSelfMoveGhost(operation) {
    const operationId = String(operation?.operationId || '').trim();
    if (operationId.length === 0) {
      return false;
    }
    let observation = null;
    try {
      observation = await this.queryAuthoritativeOperationVisibilityObservation(
        operationId,
        {requireOwnerRpcRead: true},
      );
    } catch {
      return false;
    }
    const authoritativeOperation = observation?.operation || null;
    if (!authoritativeOperation) {
      return false;
    }
    return this.isOperationTerminal(authoritativeOperation);
  }

  /**
   * Defer non-exempt operation creation while any operation-ledger partition's
   * voter quorum is concentrated AND spreading it is actionable. The
   * evaluation reads ACTUAL placement rows (services/nodes/partitions caches);
   * absent actuals or an unspreadable cluster never engage the hold, so small
   * clusters and cold caches keep admitting normally.
   * @param {string|null} normalizedMoveType
   * @param {string|null} partitionId
   * @return {void}
   * @private
   */
  ensureOperationLedgerQuorumSpreadFirst(normalizedMoveType, partitionId) {
    const engagedHold = resolveEngagedLedgerQuorumSpreadHold(
      this.systemTableCache,
    );
    if (engagedHold === null) {
      return;
    }
    this.maybeWarnOperationLedgerQuorumSpreadHold(
      engagedHold.evaluation,
      normalizedMoveType,
      partitionId,
    );
    throw this.createOperationLedgerInterlockError(
      normalizedMoveType,
      OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX +
        String(engagedHold.firstSpreadActionablePartition.partitionId) +
        OPERATION_LEDGER_QUORUM_CONCENTRATED_MESSAGE_SUFFIX,
      OPERATION_LEDGER_QUORUM_CONCENTRATED_REASON_CODE,
      null,
    );
  }

  /**
   * Quorum-concentration evidence for the PLANNER's priority-recovery gate: a
   * concentrated operation-ledger partition requires its cure move to be
   * planned even while local-serve readiness gates would defer planning —
   * the hold itself sustains those readiness states, so without this evidence
   * the cure is never planned and the hold never releases (verifier-traced
   * permanent formation wedge). Feasibility is irrelevant here: planning the
   * cure is how a target is found.
   * @param {string|null} partitionId
   * @return {boolean}
   */
  isOperationLedgerQuorumConcentratedForPartition(partitionId) {
    return isLedgerQuorumConcentratedPartition(
      this.systemTableCache,
      partitionId,
    );
  }

  /**
   * Periodic (not per-rejection) observability while the quorum-spread hold
   * is engaged: a hold that persists because the cure keeps failing must be
   * loud, not silent.
   * @param {Object} evaluation
   * @param {string|null} normalizedMoveType
   * @param {string|null} partitionId
   * @return {void}
   * @private
   */
  maybeWarnOperationLedgerQuorumSpreadHold(
    evaluation,
    normalizedMoveType,
    partitionId,
  ) {
    const state = this.getOperationLedgerInterlockAdmissionState();
    const nowMs = this.timeSource?.now?.() ?? Date.now();
    if (
      state.lastQuorumHoldWarnAtMs !== null &&
      nowMs - state.lastQuorumHoldWarnAtMs <
        OPERATION_LEDGER_QUORUM_HOLD_WARN_INTERVAL_MS
    ) {
      return;
    }
    state.lastQuorumHoldWarnAtMs = nowMs;
    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.OPERATION_LEDGER_QUORUM_SPREAD_HOLD,
      {
        deferredMoveType: normalizedMoveType,
        deferredPartitionId: partitionId || null,
        concentratedPartitions: evaluation.concentratedPartitions,
      },
    );
  }

  /**
   * Build one typed interlock rejection that both callers understand: the
   * rebalance loop reads rebalanceSkipReason (skip + retry next cycle) and the
   * DDL provisioning loop reads admissionResult (target rejection + re-plan).
   * @param {string|null} normalizedMoveType
   * @param {string} message
   * @param {string} reasonCode
   * @param {string|null} conflictingOperationId
   * @return {Error}
   * @private
   */
  createOperationLedgerInterlockError(
    normalizedMoveType,
    message,
    reasonCode,
    conflictingOperationId,
  ) {
    const error = this.createConcurrentOperationBudgetError(
      normalizedMoveType,
      1,
      {
        message,
        conflictingOperationId: conflictingOperationId || undefined,
      },
    );
    error.admissionResult =
      buildOperationLedgerInterlockAdmissionResult(reasonCode);
    return error;
  }

  /**
   * Synchronous single-coordinator interlock accounting around operation
   * creation. The per-entity rebalancer loops dispatch moves concurrently
   * (parallel createOperation calls), and the async observation in
   * ensureOperationLedgerSelfMoveSerialized cannot see rows that are still
   * mid-persist or not yet cache-visible — so without a synchronous gate two
   * concurrent creates could co-admit the ledger self-move with a sibling and
   * re-create the run-20 storm. This wrapper is that synchronous gate; the
   * async lane remains the cross-node/cross-source backstop.
   * @param {Object} move
   * @param {Function} executionFactory
   * @return {Promise<Object>}
   * @private
   */
  async runOperationLedgerInterlockAccountedCreate(move, executionFactory) {
    const normalizedMoveType = this.normalizeMoveType(move?.type);
    const partitionId = move?.partitionId || move?.entityId || null;
    const state = this.getOperationLedgerInterlockAdmissionState();
    const selfMoveEngagement = resolveOperationLedgerHoldEngagement(
      OPERATION_LEDGER_HOLD.SELF_MOVE_SERIALIZATION,
      classifyOperationLedgerHoldMove(normalizedMoveType, partitionId),
    );

    if (
      selfMoveEngagement === OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.IDLE_ONLY
    ) {
      this.assertOperationLedgerSelfMoveGateOpen(
        state,
        normalizedMoveType,
        partitionId,
      );
      if (state.heldSelfMoveOperationId) {
        const cleared = await this.tryClearHeldOperationLedgerSelfMove(state);
        if (!cleared) {
          throw this.createOperationLedgerInterlockError(
            normalizedMoveType,
            OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX +
              String(partitionId) +
              OPERATION_LEDGER_SELF_MOVE_WAITING_MESSAGE_SUFFIX,
            OPERATION_LEDGER_SELF_MOVE_WAITING_REASON_CODE,
            state.heldSelfMoveOperationId,
          );
        }
        // Re-validate after the await: another create may have entered the
        // gate while the point read was in flight (TOCTOU).
        this.assertOperationLedgerSelfMoveGateOpen(
          state,
          normalizedMoveType,
          partitionId,
        );
      }
      state.selfMoveCreateInFlight = true;
      try {
        const operation = await executionFactory();
        if (operation?.operationId) {
          state.heldSelfMoveOperationId = operation.operationId;
          state.heldSelfMovePartitionId = operation.partitionId || partitionId;
        }
        return operation;
      } finally {
        state.selfMoveCreateInFlight = false;
      }
    }

    if (
      selfMoveEngagement !== OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT
    ) {
      if (state.selfMoveCreateInFlight) {
        throw this.createOperationLedgerInterlockError(
          normalizedMoveType,
          OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX +
            String(state.heldSelfMovePartitionId || partitionId) +
            OPERATION_LEDGER_SELF_MOVE_BLOCKING_MESSAGE_SUFFIX,
          OPERATION_LEDGER_SELF_MOVE_BLOCKING_REASON_CODE,
          null,
        );
      }
      if (state.heldSelfMoveOperationId) {
        const cleared = await this.tryClearHeldOperationLedgerSelfMove(state);
        if (!cleared) {
          // The held LEDGER partition is the state examined here — embedding
          // the admitted operation's partition mislabeled run-24 forensics.
          throw this.createOperationLedgerInterlockError(
            normalizedMoveType,
            OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX +
              String(state.heldSelfMovePartitionId || partitionId) +
              OPERATION_LEDGER_SELF_MOVE_BLOCKING_MESSAGE_SUFFIX,
            OPERATION_LEDGER_SELF_MOVE_BLOCKING_REASON_CODE,
            state.heldSelfMoveOperationId,
          );
        }
        // Re-validate after the await: a ledger self-move may have entered
        // the gate while the point read was in flight (TOCTOU — a sibling
        // must not co-admit with it).
        if (state.selfMoveCreateInFlight) {
          throw this.createOperationLedgerInterlockError(
            normalizedMoveType,
            OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX +
              String(partitionId) +
              OPERATION_LEDGER_SELF_MOVE_BLOCKING_MESSAGE_SUFFIX,
            OPERATION_LEDGER_SELF_MOVE_BLOCKING_REASON_CODE,
            null,
          );
        }
      }
    }

    state.otherCreatesInFlight += 1;
    try {
      return await executionFactory();
    } finally {
      state.otherCreatesInFlight -= 1;
    }
  }

  /**
   * The self-move gate is open only when NO other create of any kind is
   * between its gate and its persist. Called both on entry and again after
   * every await inside the gate (each await is a TOCTOU window).
   * @param {Object} state
   * @param {string|null} normalizedMoveType
   * @param {string|null} partitionId
   * @return {void}
   * @private
   */
  assertOperationLedgerSelfMoveGateOpen(
    state,
    normalizedMoveType,
    partitionId,
  ) {
    if (state.selfMoveCreateInFlight || state.otherCreatesInFlight > 0) {
      throw this.createOperationLedgerInterlockError(
        normalizedMoveType,
        OPERATION_LEDGER_SELF_MOVE_MESSAGE_PREFIX +
          String(partitionId) +
          OPERATION_LEDGER_SELF_MOVE_WAITING_MESSAGE_SUFFIX,
        OPERATION_LEDGER_SELF_MOVE_WAITING_REASON_CODE,
        null,
      );
    }
  }

  /**
   * @return {Object}
   * @private
   */
  getOperationLedgerInterlockAdmissionState() {
    if (!this.operationLedgerInterlockAdmission) {
      this.operationLedgerInterlockAdmission = {
        selfMoveCreateInFlight: false,
        heldSelfMoveOperationId: null,
        heldSelfMovePartitionId: null,
        otherCreatesInFlight: 0,
        lastQuorumHoldWarnAtMs: null,
      };
    }
    return this.operationLedgerInterlockAdmission;
  }

  /**
   * Resolve whether the held (locally created) ledger self-move has finished,
   * via an authoritative point read of its row. Terminal or stale rows clear
   * the hold; an unreadable ledger keeps it held — while the ledger is
   * mid-move its reads failing IS the condition being serialized against, and
   * the staleness bound still releases a wedged self-move once its row is
   * readable again.
   * @param {Object} state
   * @return {Promise<boolean>} True when the hold was cleared.
   * @private
   */
  async tryClearHeldOperationLedgerSelfMove(state) {
    const operationId = state.heldSelfMoveOperationId;
    if (!operationId) {
      return true;
    }
    let operation = null;
    try {
      operation = await this.queryOperationById(operationId);
    } catch {
      return false;
    }
    if (!operation) {
      return false;
    }
    const nowMs = this.timeSource?.now?.() ?? Date.now();
    if (
      this.isOperationTerminal(operation) ||
      !this.isLiveOperationLedgerInterlockOperation(operation, nowMs)
    ) {
      state.heldSelfMoveOperationId = null;
      state.heldSelfMovePartitionId = null;
      return true;
    }
    return false;
  }
}

function applyRebalanceCoordinatorLedgerInterlockAdmissionMethods(targetClass) {
  const sourcePrototype =
    RebalanceCoordinatorLedgerInterlockAdmissionMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === 'constructor') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyRebalanceCoordinatorLedgerInterlockAdmissionMethods};
