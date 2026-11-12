/**
 * Owner contract:
 * Owner: the replica lifecycle's one REMOVING -> ACTIVE edge, a removal
 * cancelled by the operation that retains its replica (CANCEL_REPLICA_REMOVAL,
 * 2026-11-11). The transition table keeps REMOVING -> REMOVED as the only
 * ordinary edge: a REMOVING timeout or a failure never reverts a removal;
 * only this owner, called by the node's removal cancellation owner
 * (replica-removal-cancellation.js), does.
 * Inputs: the exact REMOVING generation bound by
 * bindAuthoritativeRemovalAuthority, and the transition context (the ACTIVE
 * effect's handler check among it).
 * Canonical output: true when the durable row moved from that exact REMOVING
 * generation to ACTIVE (a compare-and-set on its durable version), false
 * when the authority is not the current REMOVING generation or the CAS did
 * not apply; a thrown persistence error is the caller's UNAVAILABLE.
 * Prohibited: no other source state, no write without the bound generation.
 */
import {REPLICA_STATE_MACHINE_REASON, REPLICA_STATE_MACHINE_STATE} from
  './replica-state-machine-constants.js';
import {getReplicaRevision} from './replica-state-machine-serialization.js';
import {REMOVAL_AUTHORITY_KIND} from './replica-state-machine-recovery.js';

/**
 * Move the exact REMOVING generation the authority binds back to ACTIVE.
 * @param {Object} stateMachine - The ReplicaStateMachine.
 * @param {string} replicaId - The replica.
 * @param {Object} authority - bindAuthoritativeRemovalAuthority's answer.
 * @param {Object} context - Transition context (isEffectHandlerCurrent).
 * @return {Promise<boolean>} Whether the durable row is ACTIVE now.
 */
async function cancelDurableRemovalWithAuthority(stateMachine, replicaId,
  authority, context = {}) {
  const current = stateMachine.replicas.get(replicaId) || null;
  if (authority?.kind !== REMOVAL_AUTHORITY_KIND.REMOVING ||
      current === null || current !== authority.replicaState ||
      current.state !== REPLICA_STATE_MACHINE_STATE.REMOVING ||
      getReplicaRevision(stateMachine, replicaId) !== authority.revision) {
    return false;
  }
  return await stateMachine._applyTransition(replicaId,
    REPLICA_STATE_MACHINE_STATE.ACTIVE,
    {...context, reason: REPLICA_STATE_MACHINE_REASON.REMOVAL_CANCELLED},
    {persist: true, validate: false}) === true;
}

export {cancelDurableRemovalWithAuthority};
