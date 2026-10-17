// The held lifecycle's INIT continuation. WriterCompletion owns pending interest;
// WriterState owns applied results; the native port owns committed membership.
// Nothing in this module grants local serving or publishes lifecycle completion.
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL as MEMBERSHIP_REFUSAL} from
  '../raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer} from '../raft/raft-committed-membership-stamp.js';
import {instanceDigest, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {SERVICE_INSTANCE_OUTCOME} from '../constants/service-instance.js';
import {boundWasmInitialization} from './wasm-creation-opening.js';
import {WRITER_STATUS, WRITER_REASON} from './wasm-writer-profile.js';

const WASM_CREATION_GENESIS = Object.freeze({
  OBSERVED: 'GENESIS_OBSERVED', HELD: 'GENESIS_HELD',
  MEMBERSHIP_MISMATCH: 'GENESIS_MEMBERSHIP_MISMATCH',
  APPLICATION_NOT_COVERED: 'GENESIS_APPLICATION_NOT_COVERED',
});
function held(reason) {
  return {outcome: WASM_CREATION_GENESIS.HELD, reason};
}
function currentCreation(replica, port, creation) {
  return replica.initialized && replica.raft === port && replica.consensusCreation === creation;
}
function matchesFounders(stamp, creation) {
  const voters = stamp.voters.map((peer) => stamp.identities[peer]).sort();
  const expected = [...creation.identity.replicaIds].sort();
  return stamp.gateOpen && stamp.learners.length === 0 && stamp.learnersNext.length === 0 &&
    instanceDigest(voters) === instanceDigest(expected);
}
function unresolved(applied) {
  return {outcome: applied.status === WRITER_STATUS.UNKNOWN ?
    SERVICE_INSTANCE_OUTCOME.UNKNOWN : WASM_CREATION_GENESIS.HELD,
  reason: applied.reason ?? WRITER_REASON.NOT_LEADER};
}
function observeMembership(replica, port, creation, receipt) {
  const status = port.readStatus();
  if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
      status.groupId !== creation.identity.groupId) {
    return held(MEMBERSHIP_REFUSAL.HELD);
  }
  const answer = port.readCommittedMembership({purpose: PURPOSE.WITNESS});
  const stamp = committedStampOfAnswer(answer);
  if (stamp === null) return held(answer?.reason ?? MEMBERSHIP_REFUSAL.STAMP_INVALID);
  if (!matchesFounders(stamp, creation)) {
    return held(WASM_CREATION_GENESIS.MEMBERSHIP_MISMATCH);
  }
  if (BigInt(stamp.appliedIndex) < BigInt(receipt.index) ||
      BigInt(stamp.term) < BigInt(receipt.term)) {
    return held(WASM_CREATION_GENESIS.APPLICATION_NOT_COVERED);
  }
  return {outcome: WASM_CREATION_GENESIS.OBSERVED,
    bindingDigest: instanceDigest(creation.intent.consensusBinding),
    groupId: creation.identity.groupId, replicaId: replica.replicaId,
    receipt, membership: stamp};
}
/** Advance only the original bound INIT on normal start/reconciliation reentry. */
async function progressWasmCreationGenesis(replica) {
  const port = replica.raft;
  const creation = replica.consensusCreation;
  try {
    if (creation === null || !currentCreation(replica, port, creation)) {
      return held(WRITER_REASON.NOT_READY);
    }
    const binding = replica.writerState.creationBinding();
    requireInstance(instanceDigest(binding) === instanceDigest(creation.intent.consensusBinding),
      SERVICE_INSTANCE_OUTCOME.CONTENT_CONFLICT);
    const command = boundWasmInitialization(binding);
    let applied = replica.writerState.classify(command);
    if (applied.status === WRITER_STATUS.NEW) {
      // A follower does not forward/mint work or confuse a leader hint with INIT.
      if (!replica.isLeader) return held(WRITER_REASON.NOT_LEADER);
      applied = await replica.writerCompletion.submit(command);
    }
    if (!currentCreation(replica, port, creation)) return held(WRITER_REASON.SHUTDOWN);
    if (applied.status !== WRITER_STATUS.RECORDED) return unresolved(applied);
    // Do not trust a waiter answer as stored state. Reread the existing owner.
    const retained = replica.writerState.classify(command);
    if (retained.status !== WRITER_STATUS.RECORDED) return held(WRITER_REASON.UNINITIALIZED);
    if (retained.accepted !== true) return held(WRITER_REASON.RESPONSE);
    return observeMembership(replica, port, creation, retained.receipt);
  } catch (error) {
    return {outcome: SERVICE_INSTANCE_OUTCOME.UNKNOWN,
      reason: error.code ?? SERVICE_INSTANCE_OUTCOME.UNAVAILABLE};
  }
}
export {progressWasmCreationGenesis, WASM_CREATION_GENESIS};
