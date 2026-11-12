// Real queued apply of a committed removal. Only the binding status result
// is corrupted after apply_conf_change removes the current native leader.
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {instantiateRaftRsCore, verifyRaftRsBinding} from
  '../../src/raft/raft-rs-binding-owner.js';
import {RAFT_EVENT, RAFT_MEMBERSHIP_OPERATION, RAFT_OPERATION_OUTCOME as OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RUNTIME_REASON} from '../../src/raft/raft-rs-runtime-owner-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

const BINDING = new URL('../../src/raft/raft-rs-binding-owner.js', import.meta.url);
const DRIVER = new URL('./raft-rs-backend/transfer-leadership-driver.js', import.meta.url);
const A = 'role-apply-a';
const B = 'role-apply-b';
const S = 'role-apply-s';
const SETUP_TIMEOUTS = 6;
const LEADER_STATE = 2;

function electRemovalSubject(driver) {
  driver.isolate(B);
  assert.equal(driver.port(A).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: S,
  }).result.outcome, OUTCOME.CORE_OK);
  driver.deliverOnly([S]);
  driver.isolate(A);
  driver.heal(B);
  for (let round = 0; round < SETUP_TIMEOUTS * driver.electionTick() &&
      !driver.leads(S); round++) {
    driver.port(B).tick();
    driver.port(S).tick();
    driver.deliverOnly([S]);
    if (!driver.leads(S)) driver.deliverOnly([B]);
  }
  assert.equal(driver.leads(S), true);
  driver.deliverOnly([B]);
  driver.deliverOnly([S]);
}

test('invalid role at removed-leader apply retains refusal and unfinished durable application',
  async (t) => {
    const fault = {armed: false, handle: null, active: false, hit: false, calls: []};
    const binding = {verifyRaftRsBinding, instantiateRaftRsCore: () => {
      const native = instantiateRaftRsCore();
      return Object.freeze(Object.fromEntries(Object.entries(native).map(([name, call]) =>
        [name, (...args) => {
          if (fault.hit && args[0] === fault.handle) fault.calls.push(name);
          const answer = call(...args);
          if (name === 'apply_conf_change' && fault.armed) {
            const status = native.status(args[0]);
            if (status.raftState === LEADER_STATE &&
                !answer.voters.includes(String(status.id))) {
              fault.handle = args[0];
              fault.hit = true;
              fault.active = true;
              fault.armed = false;
            }
          }
          if (name === 'status' && args[0] === fault.handle && fault.active) {
            const invalid = {...answer};
            delete invalid.raftState;
            return invalid;
          }
          return answer;
        }])));
    }};
    const {TransferLeadershipDriver} = await t.mockImport(DRIVER.href,
      {[BINDING.href]: binding});
    const driver = new TransferLeadershipDriver({partitionId: 'role-apply',
      replicaIds: [A, B, S]});
    t.teardown(() => driver.dispose());
    driver.form();
    electRemovalSubject(driver);
    const pending = {refusal: 'pending-durable-work'};
    assert.equal((await turnChainValue(driver.port(S).propose(pending))).outcome,
      OUTCOME.CORE_OK);
    const before = driver.status(S);
    const events = [];
    driver.port(S).subscribe(RAFT_EVENT.ROLE_OBSERVATION_REFUSED,
      (refusal) => events.push(refusal));
    fault.armed = true;
    driver.deliverOnly([B]);
    driver.stepUndrained(S);
    const refused = await turnChainValue(driver.port(S).tick());
    t.equal(fault.hit, true, 'native apply removed the currently leading subject');
    t.match(refused, {outcome: OUTCOME.CORE_REFUSED,
      reason: RUNTIME_REASON.INVALID_NATIVE_ROLE, phase: 'status-observation'});
    t.same(events, [refused], 'apply-time refusal reaches the actual event boundary');
    t.notOk(fault.calls.includes('advance_append'), 'no Ready advance after refused decision');
    t.notOk(driver.applied(S, pending), 'uncommitted application did not escape');
    fault.active = false;
    const recovered = driver.status(S);
    t.equal(recovered.outcome, OUTCOME.CORE_OK, 'existing recovery reconstructs unfinished Ready');
    t.equal(recovered.runtimeGeneration, before.runtimeGeneration, 'no shared-runtime rebuild');
    t.notOk(recovered.confState.voters.includes(recovered.peerId),
      'durable unapplied removal was replayed on reconstruction');
    t.not(recovered.role, 'leader', 'removed replica cannot reclaim the old leadership');
    driver.heal(A);
    const succeeds = (id) => driver.leads(id) && driver.status(id).term > before.term;
    const rounds = driver.roundsUntil(() => [A, B].some(succeeds),
      SETUP_TIMEOUTS * driver.electionTick());
    t.not(rounds, null, 'remaining voters can elect after finite observation fault');
    const successor = [A, B].find(succeeds);
    const command = {after: 'role-apply-recovery'};
    await turnChainValue(driver.port(successor).propose(command));
    driver.deliver();
    t.ok(driver.applied(successor, command), 'valid successor can commit work');
    t.end();
  });
