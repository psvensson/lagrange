// Evidence of quest transaction-redundant-progress-writes (stage 0b, C5):
// a preload that simulates removal (a) against an unchanged src, for
// confirmation runs only (node --import <this file> --test <file>). It is
// not a test, it is collected by no runner, and it changes no repository file.
//
// What it simulates (design-note.md, change A1): the transaction
// coordinator's participant registry still moves a participant to ACTIVE in
// memory when its BEGIN succeeds (the gate against a second BEGIN), but the
// ACTIVE row is never submitted to sql_transaction_participants. Only the
// DurableWorkflowCoordinator owned by a DistributedTransactionCoordinator is
// affected, and only for ACTIVE records; generic workflows keep their
// persistence. Adapted from the design reviewer's SIM_A=a1 preload
// (lab/td-design-review/preload-sim.mjs, not edited).
const srcUrl = new URL('../../../../src/', import.meta.url);
const {DistributedTransactionCoordinator} = await import(
  new URL('query/distributed/distributed-transaction-coordinator.js', srcUrl).href);

const ACTIVE = 'ACTIVE';
const simulated = new WeakSet();

function inMemoryActiveUpsert(workflowCoordinator) {
  const upsert = workflowCoordinator.upsertParticipant;
  return async function upsertParticipant(workflowId, record) {
    if (record?.status !== ACTIVE) {
      return upsert.call(workflowCoordinator, workflowId, record);
    }
    const workflow = workflowCoordinator.requireWorkflow(workflowId);
    const key = workflowCoordinator.resolveParticipantKey(record);
    const existing = key ? workflow.participants.get(key) : null;
    const participant = workflowCoordinator.createParticipantRecord(workflowId,
      record, existing);
    workflow.participants.set(participant.participantKey, participant);
    if (!existing) {
      workflow.enlistedParticipantCount =
        (workflow.enlistedParticipantCount || 0) + 1;
    }
    return participant;
  };
}

const enlist = DistributedTransactionCoordinator.prototype.enlistParticipantsOwned;
DistributedTransactionCoordinator.prototype.enlistParticipantsOwned =
  async function enlistParticipantsOwned(...args) {
    const workflowCoordinator = this.workflowCoordinator;
    if (workflowCoordinator && !simulated.has(workflowCoordinator)) {
      workflowCoordinator.upsertParticipant =
        inMemoryActiveUpsert(workflowCoordinator);
      simulated.add(workflowCoordinator);
    }
    return enlist.apply(this, args);
  };
