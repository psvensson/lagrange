import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {
  OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT,
} from './operation-workflow-dispatch-ledger-self-move-gate.js';
import {
  OPERATION_LEDGER_HELD_SELF_MOVE_CLEAR_OUTCOME,
  OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION,
  classifyOperationLedgerSelfMoveLifecycleEvidence,
  isOperationLedgerSelfMoveDispatchClaimed,
  resolveHeldOperationLedgerSelfMoveClearOutcome,
  resolveOperationLedgerSelfMoveHoldAction,
} from './operation-ledger-hold-policy.js';

const LOCAL_STR_FUNCTION = 'function';

// The synchronous single-coordinator HOLD STATE of the run-20 self-move
// interlock (the lanes that consume it live in
// rebalance-coordinator-ledger-interlock-admission.js). One locally created
// ledger self-move is the holder at a time. Its phase:
//   NONE       — no holder.
//   REGISTERED — the durable PENDING intent is registered at createOperation;
//                the hold is NOT engaged: dependents admit under the normal
//                budget, a second self-move cannot register.
//   ENGAGED    — the self-move is dispatch-admissible (its target holds a
//                current READY lease, or the dispatching owner is about to
//                claim PENDING -> SENDING and send CREATE_REPLICA): dependents
//                are refused as operation_ledger_self_move_in_flight until
//                the holder is authoritatively terminal.
// The phase is learned from the authoritative lifecycle read on every
// dependent/self-move admission (tryClearHeldOperationLedgerSelfMove) and set
// synchronously by the local dispatch path's engagement point
// (engageOperationLedgerSelfMoveHold), which is what closes the local TOCTOU
// window between the SENDING claim and its authoritative visibility.
const OPERATION_LEDGER_SELF_MOVE_HOLD_PHASE = Object.freeze({
  NONE: 'none',
  REGISTERED: 'registered',
  ENGAGED: 'engaged',
});

const NO_CREATES_IN_FLIGHT = 0;
const EMPTY_STRING = '';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

// The typed "no holder" record of the hold state.
const OPERATION_LEDGER_NO_HELD_SELF_MOVE = Object.freeze({
  heldSelfMoveOperationId: null,
  heldSelfMovePartitionId: null,
  heldSelfMovePhase: OPERATION_LEDGER_SELF_MOVE_HOLD_PHASE.NONE,
});

// The holder phase each compare-and-clear outcome proves (RELEASE_HOLDER
// clears the holder; ALREADY_CLEARED / NEWER_HOLDER leave the holder as is).
const HOLD_PHASE_BY_CLEAR_OUTCOME = Object.freeze(
  new Map([
    [
      OPERATION_LEDGER_HELD_SELF_MOVE_CLEAR_OUTCOME.KEEP_HOLDER,
      OPERATION_LEDGER_SELF_MOVE_HOLD_PHASE.ENGAGED,
    ],
    [
      OPERATION_LEDGER_HELD_SELF_MOVE_CLEAR_OUTCOME.HOLDER_REGISTERED,
      OPERATION_LEDGER_SELF_MOVE_HOLD_PHASE.REGISTERED,
    ],
  ]),
);

function resolveOperationTargetNodeId(operation) {
  return String(
    operation?.targetNodeId || operation?.target_node_id || EMPTY_STRING,
  ).trim();
}

function resolveOperationPartitionId(operation) {
  return operation?.partitionId || operation?.partition_id || null;
}

function resolveOperationId(operation) {
  return String(operation?.operationId || EMPTY_STRING).trim();
}

class RebalanceCoordinatorLedgerInterlockHoldStateMethods {
  /**
   * @return {Object}
   * @private
   */
  getOperationLedgerInterlockAdmissionState() {
    if (!this.operationLedgerInterlockAdmission) {
      this.operationLedgerInterlockAdmission = {
        selfMoveCreateInFlight: false,
        ...OPERATION_LEDGER_NO_HELD_SELF_MOVE,
        otherCreatesInFlight: NO_CREATES_IN_FLIGHT,
        lastQuorumHoldWarnAtMs: null,
      };
    }
    return this.operationLedgerInterlockAdmission;
  }

  /**
   * createOperation-time registration of a locally created ledger self-move:
   * the holder is REGISTERED, not engaged.
   * @param {Object} state
   * @param {Object} operation
   * @param {string|null} partitionId
   * @return {void}
   * @private
   */
  registerHeldOperationLedgerSelfMove(state, operation, partitionId) {
    state.heldSelfMoveOperationId = operation.operationId;
    state.heldSelfMovePartitionId = operation.partitionId || partitionId;
    state.heldSelfMovePhase = OPERATION_LEDGER_SELF_MOVE_HOLD_PHASE.REGISTERED;
  }

  /**
   * @param {Object} state
   * @return {void}
   * @private
   */
  clearHeldOperationLedgerSelfMove(state) {
    Object.assign(state, OPERATION_LEDGER_NO_HELD_SELF_MOVE);
  }

  /**
   * The engagement point of the local dispatch path: called by the workflow
   * owner for a disruptive ledger self-move it is about to claim
   * PENDING -> SENDING. IDLE_ONLY is re-checked on the synchronous lane (no
   * dependent create between its gate and its persist), then the hold is
   * engaged before the durable SENDING claim so a dependent racing the claim
   * is refused locally even before the claim is authoritatively visible.
   * @param {Object} operation
   * @return {string} OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT member
   */
  engageOperationLedgerSelfMoveHold(operation) {
    const state = this.getOperationLedgerInterlockAdmissionState();
    const operationId = resolveOperationId(operation);
    if (
      state.heldSelfMoveOperationId &&
      state.heldSelfMoveOperationId !== operationId
    ) {
      return OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT.HELD_BY_OTHER;
    }
    if (
      state.selfMoveCreateInFlight ||
      state.otherCreatesInFlight > NO_CREATES_IN_FLIGHT
    ) {
      return OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT.NOT_IDLE;
    }
    state.heldSelfMoveOperationId = operationId;
    state.heldSelfMovePartitionId =
      operation?.partitionId || state.heldSelfMovePartitionId || null;
    state.heldSelfMovePhase = OPERATION_LEDGER_SELF_MOVE_HOLD_PHASE.ENGAGED;
    return OPERATION_LEDGER_SELF_MOVE_HOLD_ENGAGEMENT.ENGAGED;
  }

  /**
   * The dispatch path's claim did not commit after engagement (CAS lost,
   * persist refused): the holder returns to REGISTERED so no hold leaks from
   * a self-move that was never sent. A holder engaged for a different
   * self-move is left alone.
   * @param {Object} operation
   * @return {void}
   */
  disengageOperationLedgerSelfMoveHold(operation) {
    const state = this.getOperationLedgerInterlockAdmissionState();
    const operationId = resolveOperationId(operation);
    if (
      state.heldSelfMoveOperationId === operationId &&
      state.heldSelfMovePhase === OPERATION_LEDGER_SELF_MOVE_HOLD_PHASE.ENGAGED
    ) {
      state.heldSelfMovePhase = OPERATION_LEDGER_SELF_MOVE_HOLD_PHASE.REGISTERED;
    }
  }

  /**
   * The self-move gate is open only when NO other create of any kind is
   * between its gate and its persist. Called both on entry and again after
   * every await inside the gate (each await is a TOCTOU window).
   * @param {Object} state
   * @return {boolean}
   * @private
   */
  isOperationLedgerSelfMoveGateOpen(state) {
    return (
      !state.selfMoveCreateInFlight &&
      state.otherCreatesInFlight <= NO_CREATES_IN_FLIGHT
    );
  }

  /**
   * Dispatch admissibility of a registered ledger self-move, as the
   * interlock observes it: the owner claimed dispatch (the durable row left
   * PENDING) or the target node holds a current READY lease per the
   * readiness owner (the same sync surface the dispatch readiness capture
   * consults). Absent readiness evidence or target counts as admissible
   * (fail closed: the hold engages).
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationLedgerSelfMoveDispatchAdmissible(operation) {
    if (isOperationLedgerSelfMoveDispatchClaimed(operation)) {
      return true;
    }
    const targetReadiness = this.readOperationLedgerSelfMoveTargetReadiness(
      operation,
    );
    if (targetReadiness === null) {
      return true;
    }
    return targetReadiness.satisfied;
  }

  /**
   * The target node's readiness verdict on the operation's decision dimension
   * (readiness owner sync surface), or null when no target / no readiness
   * evidence is available.
   * @param {Object} operation
   * @return {{satisfied: boolean}|null}
   * @private
   */
  readOperationLedgerSelfMoveTargetReadiness(operation) {
    const targetNodeId = resolveOperationTargetNodeId(operation);
    const readinessService = this.controlPlaneReadinessService;
    if (
      targetNodeId.length === 0 ||
      typeof readinessService?.getNodeReadinessSync !== LOCAL_STR_FUNCTION ||
      typeof this.resolveOperationReadinessDecisionDimension !==
        LOCAL_STR_FUNCTION
    ) {
      return null;
    }
    const decisionDimension = this.resolveOperationReadinessDecisionDimension(
      resolveOperationPartitionId(operation),
    );
    const readiness = readinessService.getNodeReadinessSync(targetNodeId, {
      decisionDimension,
    });
    return {
      satisfied: readiness?.dimensions?.[decisionDimension] === true,
    };
  }

  /**
   * Query the existing cache-bypassing workflow visibility owner, then consume
   * the policy module's single evidence -> action relation. This mechanism does
   * not inspect raw timestamps or invent a second recovery/reaper decision.
   * @param {string|null} operationId
   * @return {Promise<string>} OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION
   * @private
   */
  async resolveAuthoritativeLedgerSelfMoveHoldAction(operationId) {
    const normalizedOperationId = String(operationId || EMPTY_STRING).trim();
    if (normalizedOperationId.length === 0) {
      return OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD;
    }
    let observation = null;
    try {
      observation = await this.queryAuthoritativeOperationVisibilityObservation(
        normalizedOperationId,
        {
          authoritativeReadMode:
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        },
      );
    } catch {
      return OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD;
    }
    const lifecycleEvidence = classifyOperationLedgerSelfMoveLifecycleEvidence(
      observation?.operation || null,
      (operation) => this.isOperationTerminal(operation),
      (operation) => this.isOperationLedgerSelfMoveDispatchAdmissible(operation),
    );
    return resolveOperationLedgerSelfMoveHoldAction(lifecycleEvidence);
  }

  /**
   * Resolve the held (locally created) ledger self-move's phase via the
   * authoritative workflow-owner evidence relation and compare-and-clear
   * against the CURRENT holder (relation owned by
   * operation-ledger-hold-policy.js): a terminal holder is cleared; a
   * registered holder is retained but not engaged; a live holder engages the
   * hold; a sibling that already released this same holder leaves no
   * self-move held (callers re-validate the in-flight create flag after this
   * await); a NEWER holder keeps refusing. Timeout/reaper candidacy alone
   * keeps the hold engaged; an unreadable ledger also keeps it held — while
   * the ledger is mid-move its reads failing IS the serialized condition.
   * @param {Object} state
   * @return {Promise<string>} OPERATION_LEDGER_HELD_SELF_MOVE_CLEAR_OUTCOME
   * @private
   */
  async tryClearHeldOperationLedgerSelfMove(state) {
    const operationId = state.heldSelfMoveOperationId;
    if (!operationId) {
      return OPERATION_LEDGER_HELD_SELF_MOVE_CLEAR_OUTCOME.ALREADY_CLEARED;
    }
    const action = await this.resolveAuthoritativeLedgerSelfMoveHoldAction(
      operationId,
    );
    const outcome = resolveHeldOperationLedgerSelfMoveClearOutcome({
      readOperationId: operationId,
      heldOperationId: state.heldSelfMoveOperationId,
      holdAction: action,
    });
    if (outcome === OPERATION_LEDGER_HELD_SELF_MOVE_CLEAR_OUTCOME.RELEASE_HOLDER) {
      this.clearHeldOperationLedgerSelfMove(state);
      return outcome;
    }
    const provenPhase = HOLD_PHASE_BY_CLEAR_OUTCOME.get(outcome);
    if (provenPhase) {
      state.heldSelfMovePhase = provenPhase;
    }
    return outcome;
  }
}

function applyRebalanceCoordinatorLedgerInterlockHoldStateMethods(targetClass) {
  const sourcePrototype =
    RebalanceCoordinatorLedgerInterlockHoldStateMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyRebalanceCoordinatorLedgerInterlockHoldStateMethods};
