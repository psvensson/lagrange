import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture, bootstrapGroup, initialization, administer, deliverScheduled} from
  './wasm-retained-bootstrap-fixture.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {WASM_WRITER_PROFILE} from '../../src/wasm-service/wasm-writer-profile.js';

// Real native RF3. Metadata/journal, guest and transport/time collaborators
// are the disclosed existing fixture. Success must come from production START,
// not an INIT authored/submitted by this test.
function beginStart(f, host = f.hosts[0]) {
  const observation = {settled: false, result: null};
  observation.promise = f.bootstrap(host).then((result) => {
    observation.settled = true;
    observation.result = result;
    return result;
  });
  return observation;
}
async function startAndDeliver(f, host = f.hosts[0]) {
  const operation = beginStart(f, host);
  await deliverScheduled(f);
  assert.equal(operation.settled, true, 'START_DID_NOT_SETTLE_IN_DECLARED_NATIVE_SCHEDULE');
  return operation.result;
}
async function initializeAndObserve(f) {
  const applied = await startAndDeliver(f);
  assert.deepEqual(applied.genesis,
    {outcome: 'GENESIS_HELD', reason: 'GENESIS_APPLICATION_NOT_COVERED'},
    'APPLIED_RECEIPT_MUST_NOT_BORROW_AN_OLDER_MEMBERSHIP_OBSERVATION');
  // The native owner has since announced its applied progress in the same
  // delivery schedule. One explicit lifecycle reentry observes that fact;
  // this is not a retry-until-green loop or an extra tick/read-side Raft drive.
  return startAndDeliver(f);
}
// Superseded by design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017
// Revision 3 N1 (recorded supersession, R09/R21): the lab-accepted witness at
// 35d533b6b asserted that every replica stays HELD after observed genesis
// (refusal WRITER_NOT_READY, every slot ADMITTED|CLOSED). With Revision 2 D1'
// the same keyed continuation grants once genesis is observed, so a replica
// whose INIT is recorded and covered by the committed founding membership is
// PUBLISHED and serves; a replica whose continuation never observed genesis
// stays held. What still holds for every replica: no endpoint, state or nested
// journal sink is called, no services-row leader publication is queued, no
// timer exists, and the metadata slot, the local record and serving agree.
// Superseded by design ACTIVATION-DISCOVERY-DESIGN-20261017 Revision 3 (stage 1c, RV1.3;
// recorded supersession, R09/R21): "no services-row leader publication is
// queued" now holds for every replica whose services row is not PRESENT; a
// PRESENT leader replays its leader node once (queued here: no CDC owner).
function assertHeld(f) {
  for (const host of f.hosts) {
    assert.deepEqual(host.publications, []);
    assert.equal(host.replica.pendingLeaderNodeUpdate,
      host.replica.servicesRow.state === 'PRESENT' && host.replica.isLeader ?
        host.replica.nodeId : null);
    assert.equal(host.replica.timerManager.activeTimers.size, 0);
    const slot = host.intent.consensusSlotRequest.slot;
    const phase = f.metadata.state().selected.resources[slot].phase;
    assert.ok(phase === 'ADMITTED' || phase === 'PUBLISHED', phase);
    const local = host.replica.db.prepare('SELECT record FROM _wasm_creation_local').get();
    assert.equal(JSON.parse(local.record).phase, phase, 'LOCAL_RECORD_DISAGREES_WITH_GRANT');
    if (phase === 'PUBLISHED') {
      assert.equal(host.replica.heldCreationRefusal(), null);
    } else {
      assert.equal(host.replica.heldCreationRefusal().reason, 'WRITER_NOT_READY');
    }
  }
}
// The design's observable end state of an observed, covered genesis (N1).
const PUBLISHED = 'PUBLISHED';
const GENESIS_PUBLISHED = 'GENESIS_PUBLISHED';

test('lifecycle reentry constructs exact bound INIT and observes committed native membership',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    const result = await initializeAndObserve(f);
    const expected = initialization(f.metadata.intent.consensusBinding);
    for (const replica of f.replicas) {
      assert.deepEqual(replica.writerState.meta().initialization?.command, expected,
        'LIFECYCLE_REENTRY_DID_NOT_INITIALIZE_BOUND_NATIVE_GROUP');
    }
    // N1 supersession: was BOOTSTRAPPED_HELD / GENESIS_OBSERVED.
    assert.equal(result.status, PUBLISHED);
    assert.equal(result.genesis.outcome, GENESIS_PUBLISHED, JSON.stringify(result.genesis));
    assert.equal(result.grant.outcome, PUBLISHED);
    assert.equal(result.genesis.membership.kind, 'committed');
    assert.equal(result.genesis.membership.gateOpen, true);
    assert.ok(BigInt(result.genesis.receipt.index) > 0n);
    assert.ok(BigInt(result.genesis.membership.appliedIndex) >=
      BigInt(result.genesis.receipt.index));
    assert.deepEqual(result.consensusResourceToken, f.hosts[0].result.consensusResourceToken);
    assertHeld(f);
    t.diagnostic(JSON.stringify({scope: 'native genesis; component metadata; serving held',
      groupId: f.groupId, genesis: result.genesis}));
  });

test('native submission without quorum remains pending then UNKNOWN and reentry resolves original INIT',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    f.holdResponses = true;
    const operation = beginStart(f);
    await deliverScheduled(f);
    assert.equal(operation.settled, false, 'UNCOMMITTED_SUBMISSION_COMPLETED_GENESIS');
    assert.ok(f.held.length > 0, 'NO_REAL_NATIVE_REPLIES_WITHHELD');
    assert.equal(f.leader.writerState.meta().initialization, null);
    f.clocks[0].advance(WASM_WRITER_PROFILE.interestMs);
    await deliverScheduled(f);
    assert.equal(operation.settled, true);
    assert.equal(operation.result.genesis.outcome, 'UNKNOWN');
    assert.equal(operation.result.status, 'BOOTSTRAPPED_HELD');
    f.holdResponses = false;
    f.queue.push(...f.held.splice(0));
    await deliverScheduled(f);
    const result = await startAndDeliver(f);
    // N1 supersession: was GENESIS_OBSERVED.
    assert.equal(result.genesis.outcome, GENESIS_PUBLISHED);
    assert.deepEqual(f.leader.writerState.meta().initialization.command,
      initialization(f.metadata.intent.consensusBinding));
    assert.equal(f.metadata.state().selected.resources[0].ordinal, 1);
    assertHeld(f);
  });

test('common creation binding refuses a different INIT nonce before writer initialization', async (t) => {
  const f = await fixture(t);
  await bootstrapGroup(f);
  const wrong = {...initialization(f.metadata.intent.consensusBinding), nonce: 'f'.repeat(64)};
  const result = await administer(f, wrong);
  assert.equal(result.status, 'REFUSED', 'FOREIGN_INIT_CONTENT_WAS_RECORDED');
  assert.equal(result.reason, 'WRITER_CONTENT_CONFLICT');
  assert.equal(f.leader.writerState.meta().initialization, null);
  // N1 supersession: was GENESIS_OBSERVED.
  assert.equal((await initializeAndObserve(f)).genesis.outcome, GENESIS_PUBLISHED);
  assertHeld(f);
});

test('recorded initialization does not replace a refused native membership read', async (t) => {
  const f = await fixture(t);
  await bootstrapGroup(f);
  const initialized = await initializeAndObserve(f);
  // N1 supersession: was GENESIS_OBSERVED. The later refused read keeps its
  // existing HELD reason; an already granted replica keeps serving until its
  // exact local retirement (CONTRACT-R2 "Already granted I may serve").
  assert.equal(initialized.genesis?.outcome, GENESIS_PUBLISHED);
  const replica = f.leader;
  const port = replica.raft;
  try {
    // Fault at the actual port read seam, not a synthetic successful config.
    replica.raft = {...port, readCommittedMembership: () =>
      ({kind: 'refused', reason: 'membership-replica-held'})};
    const result = await startAndDeliver(f);
    assert.equal(result.genesis.outcome, 'GENESIS_HELD', 'RECEIPT_BYPASSED_MEMBERSHIP_REFUSAL');
    assert.equal(result.genesis.reason, 'membership-replica-held');
    assertHeld(f);
  } finally {
    replica.raft = port;
  }
});

test('shutdown joins existing writer interest without a late genesis success or native resource leak',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    f.holdResponses = true;
    const operation = beginStart(f);
    await deliverScheduled(f);
    assert.equal(operation.settled, false);
    const replica = f.leader;
    await f.hosts[0].runtime.shutdown();
    await operation.promise;
    assert.notEqual(operation.result.genesis?.outcome, 'GENESIS_OBSERVED');
    assert.notEqual(operation.result.status, 'BOOTSTRAPPED_HELD',
      'SHUTDOWN_RETURNED_BOOTSTRAPPED_HELD');
    // Appended with Revision 3 N1: nor may a late publication escape a shutdown.
    assert.notEqual(operation.result.genesis?.outcome, GENESIS_PUBLISHED);
    assert.notEqual(operation.result.status, PUBLISHED, 'SHUTDOWN_RETURNED_PUBLISHED');
    assert.notEqual(replica.servingState, 'SERVING');
    assert.equal(replica.db, null);
    assert.equal(replica.raft, null);
    assert.equal(replica.transportHandler, null);
    assert.equal(replica.writerCompletion.pending.size, 0);
    assert.deepEqual(f.hosts[0].publications, []);
  });

async function withMembershipRead(f, read, body) {
  const replica = f.leader;
  const port = replica.raft;
  try {
    replica.raft = {...port, readCommittedMembership: read};
    return await body();
  } finally {
    replica.raft = port;
  }
}

test('concurrent genesis reentries join one native proposal and keep the original resource identity',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    const propose = f.leader.proposeEntry.bind(f.leader);
    const commands = [];
    f.leader.proposeEntry = (command) => {
      commands.push(structuredClone(command));
      return propose(command);
    };
    const first = beginStart(f);
    const duplicate = beginStart(f);
    await deliverScheduled(f);
    assert.equal(first.settled, true);
    assert.equal(duplicate.settled, true);
    assert.deepEqual(first.result, duplicate.result);
    assert.deepEqual(commands, [initialization(f.metadata.intent.consensusBinding)]);
    const observed = await startAndDeliver(f);
    // N1 supersession: was GENESIS_OBSERVED.
    assert.equal(observed.genesis.outcome, GENESIS_PUBLISHED);
    assert.equal(commands.length, 1, 'REENTRY_REPROPOSED_RECORDED_GENESIS');
    assert.equal(f.metadata.state().selected.resources[0].ordinal, 1);
    assertHeld(f);
  });

test('a follower observes its actual applied genesis without forwarding or proposing INIT', async (t) => {
  const f = await fixture(t);
  await bootstrapGroup(f);
  const initialized = await initializeAndObserve(f);
  const follower = f.hosts[1];
  const proposals = [];
  const original = follower.replica.proposeEntry.bind(follower.replica);
  follower.replica.proposeEntry = (command) => {
    proposals.push(command);
    return original(command);
  };
  assert.equal(follower.replica.isLeader, false);
  const result = await startAndDeliver(f, follower);
  // N1 supersession: was GENESIS_OBSERVED; the follower grants its own slot.
  assert.equal(result.genesis.outcome, GENESIS_PUBLISHED);
  assert.equal(result.status, PUBLISHED);
  assert.deepEqual(result.genesis.receipt, initialized.genesis.receipt);
  assert.equal(result.genesis.replicaId, follower.replica.replicaId);
  assert.deepEqual(proposals, []);
  assertHeld(f);
});

test('an unavailable native read after recorded genesis is UNKNOWN rather than cached success',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    await initializeAndObserve(f);
    await withMembershipRead(f, () => {
      throw new Error('injected native read unavailable');
    }, async () => {
      const result = await startAndDeliver(f);
      assert.equal(result.genesis.outcome, 'UNKNOWN');
      assertHeld(f);
    });
    // N1 supersession: was GENESIS_OBSERVED; the re-grant is idempotent.
    assert.equal((await startAndDeliver(f)).genesis.outcome, GENESIS_PUBLISHED);
  });

test('genesis requires the applied native participation gate, not just a valid membership shape',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    const initialized = await initializeAndObserve(f);
    const answer = {...initialized.genesis.membership, gateOpen: false};
    await withMembershipRead(f, () => answer, async () => {
      const result = await startAndDeliver(f);
      assert.equal(result.genesis.outcome, 'GENESIS_HELD');
      assert.equal(result.genesis.reason, 'GENESIS_MEMBERSHIP_MISMATCH');
      assertHeld(f);
    });
  });

test('a founding hint is not a committed membership witness for recorded initialization', async (t) => {
  const f = await fixture(t);
  await bootstrapGroup(f);
  await initializeAndObserve(f);
  await withMembershipRead(f, () => ({kind: 'genesis', founders: f.replicas.map((r) => r.replicaId)}),
    async () => {
      const result = await startAndDeliver(f);
      assert.equal(result.genesis.outcome, 'GENESIS_HELD');
      assert.equal(result.genesis.reason, 'membership-stamp-invalid');
      assertHeld(f);
    });
});

test('an applied receipt outside the native observation is held rather than prematurely completed',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    const initialized = await initializeAndObserve(f);
    const answer = {...initialized.genesis.membership,
      appliedIndex: Number(initialized.genesis.receipt.index) - 1};
    await withMembershipRead(f, () => answer, async () => {
      const result = await startAndDeliver(f);
      assert.equal(result.genesis.outcome, 'GENESIS_HELD');
      assert.equal(result.genesis.reason, 'GENESIS_APPLICATION_NOT_COVERED');
      assertHeld(f);
    });
  });

test('a corrupt rejected INIT receipt cannot be advertised as observed genesis', async (t) => {
  const f = await fixture(t);
  await bootstrapGroup(f);
  await initializeAndObserve(f);
  const row = f.leader.db.prepare('SELECT record FROM _wasm_writer_meta WHERE id=1').get();
  const meta = JSON.parse(row.record);
  meta.initialization.receipt.outcome.accepted = false;
  try {
    f.leader.db.prepare('UPDATE _wasm_writer_meta SET record=? WHERE id=1').run(JSON.stringify(meta));
    const result = await startAndDeliver(f);
    assert.equal(result.genesis.outcome, 'GENESIS_HELD', 'REJECTED_INIT_RECEIPT_BECAME_GENESIS');
    assert.equal(result.genesis.reason, 'WRITER_RESPONSE_MISMATCH');
    assertHeld(f);
  } finally {
    f.leader.db.prepare('UPDATE _wasm_writer_meta SET record=? WHERE id=1').run(row.record);
  }
});


test('a valid committed stamp for a different voter set cannot certify the bound founding cohort',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    const initialized = await initializeAndObserve(f);
    const answer = structuredClone(initialized.genesis.membership);
    const removed = answer.voters.find((peer) => answer.identities[peer] !== answer.leaderId);
    answer.voters = answer.voters.filter((peer) => peer !== removed);
    delete answer.identities[removed];
    answer.configurationKey = raftRsConfStateKey(answer);
    assert.ok(committedStampOfAnswer(answer), 'FAULT_MUST_STILL_BE_A_VALID_COMMITTED_STAMP');
    await withMembershipRead(f, () => answer, async () => {
      const result = await startAndDeliver(f);
      assert.equal(result.genesis.outcome, 'GENESIS_HELD', 'FOREIGN_COHORT_CERTIFIED_GENESIS');
      assert.equal(result.genesis.reason, 'GENESIS_MEMBERSHIP_MISMATCH');
      assertHeld(f);
    });
  });

test('orderly reopen preserves production-authored genesis, native history and reservation identity',
  async (t) => {
    const f = await fixture(t);
    await bootstrapGroup(f);
    await initializeAndObserve(f);
    const before = f.hosts.map((host) => ({
      initialization: structuredClone(host.replica.writerState.meta().initialization),
      token: structuredClone(host.result.consensusResourceToken),
      replicaId: host.replica.replicaId,
    }));
    for (const host of f.hosts) await host.lifecycle.stopReplica(f.metadata.serviceId);
    for (const [index, host] of f.hosts.entries()) {
      const result = await f.bootstrap(host);
      // N1 supersession: was BOOTSTRAPPED_HELD. Every founder applied the
      // recorded INIT before its orderly stop, so each reopened START observes
      // covered genesis and publishes its own slot (an orderly stop never
      // tombstones; Revision 2 D4').
      assert.equal(result.status, PUBLISHED, JSON.stringify(result));
      assert.equal(host.replica.replicaId, before[index].replicaId);
      assert.deepEqual(host.replica.writerState.meta().initialization,
        before[index].initialization);
      assert.deepEqual(result.consensusResourceToken, before[index].token);
    }
    assert.equal(f.metadata.db.prepare('SELECT count(*) n FROM wasm_operations').get().n, 3);
    assertHeld(f);
  });
