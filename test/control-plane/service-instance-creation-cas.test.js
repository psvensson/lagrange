// R2 component oracle. Actual owners and SQL predicates; no native Raft,
// cross-process or local-resource-retirement certification is claimed here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCreationSqliteFixture} from './service-instance-creation-sqlite-fixture.js';
import {SERVICE_INSTANCE_LIMIT} from '../../src/constants/service-instance.js';

function selected(result) {
  assert.equal(result.outcome, 'SELECTED');
  assert.equal(result.binding.incarnation.length, 64);
  return result.binding;
}

function admitted(result) {
  assert.equal(result.outcome, 'ADMITTED');
  assert.equal(result.phase, 'ADMITTED');
  return result.token;
}

const EVIDENCE_CHUNK_CHARACTERS = 4096;
function evidence(t, f, name, results) {
  const json = JSON.stringify({scope: 'SQLite component CAS; read adapter; no native consensus',
    name, results, row: f.row(), writes: f.writes});
  // Node escapes embedded newlines in diagnostic(), so chunk the complete JSON.
  // Concatenating evidenceChunk by evidenceOffset recovers every original value.
  for (let offset = 0; offset < json.length; offset += EVIDENCE_CHUNK_CHARACTERS) {
    t.diagnostic(JSON.stringify({name, evidenceOffset: offset, jsonCharacters: json.length,
      evidenceChunk: json.slice(offset, offset + EVIDENCE_CHUNK_CHARACTERS)}));
  }
}

test('ServiceDefinitionsOwner C3 concurrent selection has one SQL winner and stable losing result', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const other = f.owner('owner-b').definitions;
  const first = f.request(0, 1);
  const second = f.request(0, 2);
  const catalogBefore = f.catalogRows();
  const held = f.holdNext('owner-a');
  t.after(held.release);
  const pending = f.primary.selectConsensusInstance(first);
  await held.entered;
  const winner = await other.selectConsensusInstance(second);
  selected(winner);
  held.release();
  const loser = await pending;
  evidence(t, f, 'concurrent selection', {first, second, winner, loser});
  assert.equal(loser.outcome, 'CONFLICT');
  assert.deepEqual(loser.winnerRequestId, second.requestId);
  assert.deepEqual(await f.primary.selectConsensusInstance(first), loser);
  // These altered bodies are intentionally not valid fresh lineage. A decided
  // version classifies historical winner/loser identity before new admission.
  assert.deepEqual(await f.primary.selectConsensusInstance({...first,
    definition: {...first.definition, safetyIntervalMs: 42}}), loser);
  assert.deepEqual(await other.selectConsensusInstance(second), winner);
  const beforeConflict = f.row();
  assert.equal((await other.selectConsensusInstance({...second,
    definition: {...second.definition, safetyIntervalMs: 42}})).outcome, 'CONTENT_CONFLICT');
  assert.deepEqual(f.row(), beforeConflict);
  assert.deepEqual(f.catalogRows(), catalogBefore, 'creation never adds catalog intent histories');
  assert.equal(f.writes.filter((w) => /\bservice_instances\b/u.test(w.sql) &&
    w.changes === 1).length, 1);
});

test('ServiceDefinitionsOwner C4 lost selection reply resolves original K and cannot retag it', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const first = f.request();
  const immutable = structuredClone(first);
  f.loseReply('owner-a');
  const uncertain = await f.primary.selectConsensusInstance(first);
  assert.ok(['SELECTED', 'UNKNOWN'].includes(uncertain.outcome));
  assert.equal(f.appliedLostReplies.length, 1, 'the selected SQL reply was actually lost');
  assert.equal(f.appliedLostReplies[0].changes, 1, 'loss followed a real applied row mutation');
  assert.equal(f.state().version, 1, 'selection already exists before any replay owner');
  assert.deepEqual(f.state().selected.binding.requestId, immutable.requestId);
  assert.equal(f.appliedLostReplies[0].state.version, 1);
  const restarted = f.owner('reconstructed-owner').definitions;
  const replay = await restarted.selectConsensusInstance(immutable);
  const binding = selected(replay);
  const next = f.request(1, 2, binding.incarnation);
  const advanced = await restarted.selectConsensusInstance(next);
  selected(advanced);
  const historical = await restarted.selectConsensusInstance(immutable);
  const current = await restarted.getCurrentInstance(f.serviceId);
  evidence(t, f, 'unknown exact replay and historical result',
    {uncertain, replay, advanced, historical, current});
  assert.deepEqual(historical, replay);
  assert.deepEqual(first, immutable, 'receiver cannot change expected version or request contents');
  assert.equal(current.version, 2);
  assert.deepEqual(current.selected, advanced.binding);
  assert.notDeepEqual(current.selected, historical.binding,
    'historical selected receipt is not current permission');
});

test('ServiceDefinitionsOwner bounded decision ring excludes evicted old K without new rows', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const catalogBefore = f.catalogRows();
  const original = f.request();
  const first = await f.primary.selectConsensusInstance(original);
  let binding = selected(first);
  for (let version = 1; version < 20; version += 1) {
    binding = selected(await f.primary.selectConsensusInstance(
      f.request(version, version + 1, binding.incarnation)));
    assert.ok(f.state().decisions.length <= 16);
    assert.ok(Buffer.byteLength(f.row().state) <= 131072);
  }
  const before = f.row();
  const old = await f.primary.selectConsensusInstance(original);
  const gap = await f.primary.selectConsensusInstance(f.request(21, 100, binding.incarnation));
  evidence(t, f, 'bounded decision retirement', {old, gap,
    current: await f.primary.getCurrentInstance(f.serviceId)});
  assert.equal(old.outcome, 'HISTORY_UNAVAILABLE');
  assert.equal(gap.outcome, 'INVALID_EXPECTED_STATE');
  assert.deepEqual(f.row(), before);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM service_instances').get().n, 1);
  assert.deepEqual(f.catalogRows(), catalogBefore);
});

test('ServiceDefinitionsOwner reservation preserves original ordinal and closed token cannot revive', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const binding = selected(await f.primary.selectConsensusInstance(f.request()));
  assert.equal(f.state().selected.resources.length, 9);
  const request = f.slotRequest();
  const token = admitted(await f.primary.reserveInstanceResource(binding, request));
  assert.equal(token.ordinal, 1);
  assert.deepEqual((await f.primary.reserveInstanceResource(binding, request)).token, token);
  const conflict = await f.primary.reserveInstanceResource(binding, {...request, operationId: 'other'});
  assert.equal(conflict.outcome, 'CONFLICT');
  assert.deepEqual(conflict.winnerToken, token);
  assert.equal((await f.primary.reserveInstanceResource(binding,
    {...request, nodeId: 'changed-node'})).outcome, 'CONTENT_CONFLICT');
  const closed = await f.primary.closeInstanceResource(binding, token);
  assert.equal(closed.outcome, 'CLOSED');
  assert.deepEqual(await f.primary.closeInstanceResource(binding, token), closed);
  const replay = await f.primary.reserveInstanceResource(binding, request);
  assert.deepEqual(replay.token, token);
  assert.equal(replay.phase, 'CLOSED', 'old CREATE token remains closed');
  assert.equal((await f.primary.grantInstanceResource(binding, token)).outcome, 'RESOURCE_CLOSED');
  const next = admitted(await f.primary.reserveInstanceResource(binding,
    {...request, expectedOrdinal: 1, operationId: 'new-explicit-operation'}));
  assert.equal(next.ordinal, 2);
  assert.equal((await f.primary.reserveInstanceResource(binding, request)).outcome,
    'HISTORY_UNAVAILABLE');
  assert.equal((await f.primary.resolveInstanceResource(binding, token)).outcome,
    'HISTORY_UNAVAILABLE');
  assert.deepEqual((await f.primary.resolveInstanceResource(binding, next)).token, next);
  evidence(t, f, 'ordinal custody and exact closure', {token, conflict, closed, replay, next});
});

test('ServiceDefinitionsOwner cross-slot same-target race is fenced by row CAS', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const binding = selected(await f.primary.selectConsensusInstance(f.request()));
  const other = f.owner('owner-b').definitions;
  const held = f.holdNext('owner-a');
  t.after(held.release);
  const first = f.primary.reserveInstanceResource(binding, f.slotRequest(0, 0, 'first', 0));
  await held.entered;
  const winner = await other.reserveInstanceResource(binding, f.slotRequest(1, 0, 'second', 0));
  admitted(winner);
  held.release();
  const loser = await first;
  evidence(t, f, 'cross-slot duplicate physical target', {winner, loser});
  assert.equal(loser.outcome, 'TARGET_ALREADY_OWNED');
  assert.equal(f.state().selected.resources.filter((slot) => slot.phase !== 'CLOSED').length, 1);
  assert.ok(f.writes.some((write) => /UPDATE service_instances/u.test(write.sql) &&
    write.changes === 0), 'losing whole-row predicate genuinely matched no row');
});

test('ServiceDefinitionsOwner unknown reservation replays original ordinal rather than reserving again', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const binding = selected(await f.primary.selectConsensusInstance(f.request()));
  const request = f.slotRequest();
  const original = structuredClone(request);
  f.loseReply('owner-a');
  const uncertain = await f.primary.reserveInstanceResource(binding, request);
  assert.ok(['ADMITTED', 'UNKNOWN'].includes(uncertain.outcome));
  assert.equal(f.appliedLostReplies.length, 1, 'the reservation SQL reply was actually lost');
  assert.equal(f.appliedLostReplies[0].changes, 1, 'loss followed a real applied reservation');
  const beforeReplay = f.state().selected.resources[request.slot];
  assert.equal(beforeReplay.phase, 'ADMITTED');
  assert.equal(beforeReplay.ordinal, 1, 'original ordinal is durable before replay owner exists');
  assert.equal(f.appliedLostReplies[0].state.selected.resources[request.slot].ordinal, 1);
  const restarted = f.owner('reservation-restart').definitions;
  const replay = await restarted.reserveInstanceResource(binding, original);
  const token = admitted(replay);
  assert.equal(token.ordinal, 1);
  assert.deepEqual(request, original);
  assert.deepEqual((await restarted.reserveInstanceResource(binding, original)).token, token);
  assert.equal(f.state().selected.resources.filter((slot) => slot.phase !== 'CLOSED').length, 1);
  evidence(t, f, 'reservation unknown exact replay', {uncertain, replay});
});

test('ServiceDefinitionsOwner RETIRE retains monotonic selection row and historical winning result', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const original = f.request();
  const first = await f.primary.selectConsensusInstance(original);
  const binding = selected(first);
  const request = {...f.request(1, 2, binding.incarnation), action: 'RETIRE',
    revisionId: null, definition: null, profile: null, foundingPeers: null};
  const retired = await f.primary.selectConsensusInstance(request);
  assert.equal(retired.outcome, 'RETIRED');
  assert.equal(retired.binding, null);
  assert.deepEqual(await f.primary.selectConsensusInstance(request), retired);
  const current = await f.primary.getCurrentInstance(f.serviceId);
  assert.equal(current.version, 2);
  assert.equal(current.selected, null);
  assert.notEqual(f.row(), null, 'retirement cannot recreate never-created absence');
  assert.deepEqual(await f.primary.selectConsensusInstance(original), first);
  evidence(t, f, 'retirement preserves fence and historical receipt', {retired, current, first});
});

test('ServiceDefinitionsOwner selection-before-grant refuses old serving permission', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const binding = selected(await f.primary.selectConsensusInstance(f.request()));
  const token = admitted(await f.primary.reserveInstanceResource(binding, f.slotRequest()));
  const next = selected(await f.primary.selectConsensusInstance(
    f.request(1, 2, binding.incarnation)));
  const grant = await f.primary.grantInstanceResource(binding, token);
  assert.equal(grant.outcome, 'STALE_BINDING');
  assert.equal((await f.primary.resolveInstanceResource(binding, token)).phase, 'ADMITTED');
  assert.equal((await f.primary.selectConsensusInstance(f.request(2, 3, next.incarnation))).outcome,
    'TRANSITION_HELD');
  evidence(t, f, 'selection overtakes grant', {binding, next, token, grant});
});

test('ServiceDefinitionsOwner successor waits for all old granted resources to close', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const binding = selected(await f.primary.selectConsensusInstance(f.request()));
  const tokens = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const token = admitted(await f.primary.reserveInstanceResource(binding, f.slotRequest(slot)));
    tokens.push(token);
    assert.equal((await f.primary.grantInstanceResource(binding, token)).outcome, 'PUBLISHED');
  }
  const next = selected(await f.primary.selectConsensusInstance(
    f.request(1, 2, binding.incarnation)));
  const nextToken = admitted(await f.primary.reserveInstanceResource(next, f.slotRequest()));
  for (const token of tokens) {
    assert.equal((await f.primary.grantInstanceResource(next, nextToken)).outcome,
      'PREDECESSOR_OUTSTANDING');
    assert.equal((await f.primary.closeInstanceResource(binding, token)).outcome, 'CLOSED');
  }
  const opened = await f.primary.grantInstanceResource(next, nextToken);
  assert.equal(opened.outcome, 'PUBLISHED');
  for (const token of tokens) {
    assert.notEqual((await f.primary.grantInstanceResource(binding, token)).outcome, 'PUBLISHED');
  }
  evidence(t, f, 'all-old-resource barrier', {binding, tokens, next, nextToken, opened});
});

// Design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 Revision 3 N3: the
// resource phase machine has an explicit allowed-from table. RELEASING comes
// only from ADMITTED or PUBLISHED; a CLOSED slot is monotonic and answers every
// later transition CLOSED without a mutation; RELEASING still counts as
// outstanding for the successor's grant.
test('ServiceDefinitionsOwner resource phase table: guarded RELEASING, monotonic CLOSED slots',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const admittedToken = admitted(await f.primary.reserveInstanceResource(binding,
      f.slotRequest(0)));
    const publishedToken = admitted(await f.primary.reserveInstanceResource(binding,
      f.slotRequest(1)));
    assert.equal((await f.primary.grantInstanceResource(binding, publishedToken)).outcome, 'PUBLISHED');
    const releasedAdmitted = await f.primary.releaseInstanceResource(binding, admittedToken);
    assert.deepEqual(releasedAdmitted,
      {outcome: 'RELEASING', phase: 'RELEASING', token: admittedToken}, 'ADMITTED -> RELEASING');
    assert.deepEqual(await f.primary.releaseInstanceResource(binding, admittedToken),
      releasedAdmitted, 'RELEASING answers idempotently');
    assert.equal((await f.primary.grantInstanceResource(binding, admittedToken)).outcome,
      'RESOURCE_CLOSED', 'a RELEASING slot never re-publishes');
    assert.equal((await f.primary.releaseInstanceResource(binding, publishedToken)).outcome,
      'RELEASING', 'PUBLISHED -> RELEASING');
    const next = selected(await f.primary.selectConsensusInstance(
      f.request(1, 2, binding.incarnation)));
    const nextToken = admitted(await f.primary.reserveInstanceResource(next, f.slotRequest()));
    assert.equal((await f.primary.grantInstanceResource(next, nextToken)).outcome,
      'PREDECESSOR_OUTSTANDING', 'RELEASING is outstanding for the successor');
    assert.equal((await f.primary.closeInstanceResource(binding, admittedToken)).outcome, 'CLOSED',
      'RELEASING -> CLOSED');
    const before = f.row();
    const writes = f.writes.length;
    assert.deepEqual(await f.primary.releaseInstanceResource(binding, admittedToken),
      {outcome: 'CLOSED', phase: 'CLOSED', token: admittedToken},
      'RELEASING_REGRESSED_A_CLOSED_SLOT');
    assert.deepEqual(f.row(), before, 'a CLOSED slot is never mutated');
    assert.equal(f.writes.length, writes, 'no SQL is submitted for a CLOSED slot');
    // The existing PUBLISHED rule order stands: a retiring instance answers
    // STALE_BINDING before any slot phase is consulted.
    assert.equal((await f.primary.grantInstanceResource(binding, admittedToken)).outcome,
      'STALE_BINDING', 'the historical grant answer of a retiring instance stands');
    assert.deepEqual(f.row(), before, 'a refused grant never mutates');
    assert.equal((await f.primary.closeInstanceResource(binding, publishedToken)).outcome, 'CLOSED');
    assert.equal((await f.primary.grantInstanceResource(next, nextToken)).outcome, 'PUBLISHED',
      'the last CLOSED lifts the predecessor hold');
    evidence(t, f, 'resource phase allowed-from table', {admittedToken, publishedToken, next,
      nextToken, releasedAdmitted});
  });

// Design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017, amendment A2 as
// revised by A2' (A2'.0, A2'.3, A2'.7): a slot transition whose exact
// prior-state UPDATE answers a numeric zero affected-row count has
// definitively not applied; the owner observes the row again, decides again on
// that fresh observation and submits one new exact predicate, at most
// SERVICE_INSTANCE_LIMIT.RESOURCES submissions in total. UNKNOWN (lost reply)
// and selection stay single-shot.
const UPDATE_SERVICE_INSTANCES = /^UPDATE service_instances\b/u;
function updatesSince(f, writer, from) {
  return f.writes.slice(from).filter((write) => write.writer === writer &&
    UPDATE_SERVICE_INSTANCES.test(write.sql)).map((write) => write.changes);
}
// A held CAS must be entered by the operation under test; an operation that
// settles without reaching it is a typed failure, never an unresolved wait.
async function enteredBefore(gate, operation, label) {
  const first = await Promise.race([gate.then(() => 'entered'),
    Promise.resolve(operation).then(() => 'settled', () => 'settled')]);
  assert.equal(first, 'entered', label);
}
async function reservedSlots(f, binding, count) {
  const tokens = [];
  for (let slot = 0; slot < count; slot += 1) {
    tokens.push(admitted(await f.primary.reserveInstanceResource(binding, f.slotRequest(slot))));
  }
  return tokens;
}

test('CAS-A1 a grant that loses to a sibling slot grant is re-decided and answers PUBLISHED',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const [mine, sibling] = await reservedSlots(f, binding, 2);
    const from = f.writes.length;
    const held = f.holdNext('owner-a');
    t.after(held.release);
    const pending = f.primary.grantInstanceResource(binding, mine);
    await held.entered;
    assert.equal((await f.owner('owner-b').definitions.grantInstanceResource(binding, sibling))
      .outcome, 'PUBLISHED');
    held.release();
    const grant = await pending;
    evidence(t, f, 'CAS-A1 sibling grants', {grant});
    assert.deepEqual(grant, {outcome: 'PUBLISHED', phase: 'PUBLISHED', token: mine},
      'A_SIBLING_GRANT_DEFEATED_THE_CALLERS_OWN_SLOT');
    assert.deepEqual(updatesSince(f, 'owner-a', from), [0, 1],
      'NOT_ONE_RE_DECIDED_SUBMISSION_AFTER_THE_DEFINITIVE_ZERO');
    assert.equal(f.state().selected.resources[0].phase, 'PUBLISHED',
      'CALLER_TOLD_PUBLISHED_WHILE_THE_ROW_IS_NOT');
    assert.equal(f.state().selected.resources[1].phase, 'PUBLISHED');
  });

test('CAS-A1b two consecutive losses publish on the third submission', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const binding = selected(await f.primary.selectConsensusInstance(f.request()));
  const [mine, second, third] = await reservedSlots(f, binding, 3);
  const from = f.writes.length;
  const first = f.holdNext('owner-a');
  const again = f.holdNext('owner-a');
  t.after(first.release);
  t.after(again.release);
  const pending = f.primary.grantInstanceResource(binding, mine);
  await first.entered;
  assert.equal((await f.owner('owner-b').definitions.grantInstanceResource(binding, second))
    .outcome, 'PUBLISHED');
  first.release();
  await enteredBefore(again.entered, pending, 'NO_RE_DECIDED_SUBMISSION_AFTER_THE_FIRST_LOSS');
  assert.equal((await f.owner('owner-c').definitions.grantInstanceResource(binding, third))
    .outcome, 'PUBLISHED');
  again.release();
  const grant = await pending;
  evidence(t, f, 'CAS-A1b two consecutive losses', {grant});
  assert.equal(grant.outcome, 'PUBLISHED', JSON.stringify(grant));
  assert.deepEqual(updatesSince(f, 'owner-a', from), [0, 0, 1]);
  assert.deepEqual(f.state().selected.resources.slice(0, 3).map((slot) => slot.phase),
    ['PUBLISHED', 'PUBLISHED', 'PUBLISHED']);
});

test('CAS-A1c sibling reserves of different replicas on different slots both admit',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const from = f.writes.length;
    const held = f.holdNext('owner-a');
    t.after(held.release);
    const pending = f.primary.reserveInstanceResource(binding, f.slotRequest(0));
    await held.entered;
    admitted(await f.owner('owner-b').definitions.reserveInstanceResource(binding,
      f.slotRequest(1)));
    held.release();
    const reserve = await pending;
    evidence(t, f, 'CAS-A1c sibling reserves', {reserve});
    admitted(reserve);
    assert.equal(f.state().selected.resources.filter((slot) => slot.phase !== 'CLOSED').length, 2);
    assert.deepEqual(updatesSince(f, 'owner-a', from), [0, 1]);
  });

test('CAS-A2 a close that loses to a sibling close answers CLOSED; the last CLOSED lifts the hold',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const tokens = await reservedSlots(f, binding, 2);
    for (const token of tokens) {
      assert.equal((await f.primary.grantInstanceResource(binding, token)).outcome, 'PUBLISHED');
    }
    const next = selected(await f.primary.selectConsensusInstance(
      f.request(1, 2, binding.incarnation)));
    const nextToken = admitted(await f.primary.reserveInstanceResource(next, f.slotRequest()));
    assert.equal((await f.primary.grantInstanceResource(next, nextToken)).outcome,
      'PREDECESSOR_OUTSTANDING');
    const from = f.writes.length;
    const held = f.holdNext('owner-a');
    t.after(held.release);
    const pending = f.primary.closeInstanceResource(binding, tokens[0]);
    await held.entered;
    assert.equal((await f.owner('owner-b').definitions.closeInstanceResource(binding, tokens[1]))
      .outcome, 'CLOSED');
    held.release();
    const close = await pending;
    evidence(t, f, 'CAS-A2 sibling close race', {close});
    assert.deepEqual(close, {outcome: 'CLOSED', phase: 'CLOSED', token: tokens[0]},
      'A_SIBLING_CLOSE_LEFT_THE_CALLERS_SLOT_UNRESOLVED');
    assert.deepEqual(updatesSince(f, 'owner-a', from), [0, 1]);
    assert.deepEqual(f.state().retiring.resources.slice(0, 2).map((slot) => slot.phase),
      ['CLOSED', 'CLOSED']);
    assert.equal((await f.primary.grantInstanceResource(next, nextToken)).outcome, 'PUBLISHED',
      'the last CLOSED lifts the predecessor hold');
  });

test('CAS-A3 a bound-exhausted grant answers STATE_CHANGED after exactly RESOURCES submissions',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const [token] = await reservedSlots(f, binding, 1);
    const before = f.row();
    let submissions = 0;
    f.primary.getGateway().updateSystemTableRow = async () => {
      submissions += 1;
      return {success: true, affectedRows: 0};
    };
    const grant = await f.primary.grantInstanceResource(binding, token);
    assert.deepEqual(grant, {outcome: 'STATE_CHANGED'});
    assert.equal(submissions, SERVICE_INSTANCE_LIMIT.RESOURCES, 'NOT_THE_DECLARED_SUBMISSION_BOUND');
    assert.deepEqual(f.row(), before);
  });

test('CAS-A4 a lost grant reply is resolved once and never resubmitted', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const binding = selected(await f.primary.selectConsensusInstance(f.request()));
  const [token] = await reservedSlots(f, binding, 1);
  const from = f.writes.length;
  f.loseReply('owner-a');
  const grant = await f.primary.grantInstanceResource(binding, token);
  assert.equal(grant.outcome, 'PUBLISHED', JSON.stringify(grant));
  assert.equal(f.appliedLostReplies.length, 1);
  assert.deepEqual(updatesSince(f, 'owner-a', from), [1], 'AN_UNKNOWN_ANSWER_WAS_RESUBMITTED');
});

test('CAS-A5a a selection inside the held grant re-decides to STALE_BINDING without resubmission',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const [token] = await reservedSlots(f, binding, 1);
    const from = f.writes.length;
    const held = f.holdNext('owner-a');
    t.after(held.release);
    const pending = f.primary.grantInstanceResource(binding, token);
    await held.entered;
    selected(await f.owner('owner-b').definitions.selectConsensusInstance(
      f.request(1, 2, binding.incarnation)));
    held.release();
    assert.deepEqual(await pending, {outcome: 'STALE_BINDING'});
    assert.deepEqual(updatesSince(f, 'owner-a', from), [0]);
  });

test('CAS-A5b same-slot races re-decide to the sealed answer without resubmission',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const [granting, releasing] = await reservedSlots(f, binding, 2);
    const other = f.owner('owner-b').definitions;
    let from = f.writes.length;
    let held = f.holdNext('owner-a');
    t.after(held.release);
    const grant = f.primary.grantInstanceResource(binding, granting);
    await held.entered;
    assert.equal((await other.releaseInstanceResource(binding, granting)).outcome, 'RELEASING');
    held.release();
    assert.deepEqual(await grant, {outcome: 'RESOURCE_CLOSED'}, 'the sealed N3 order stands');
    assert.deepEqual(updatesSince(f, 'owner-a', from), [0]);
    from = f.writes.length;
    held = f.holdNext('owner-a');
    t.after(held.release);
    const release = f.primary.releaseInstanceResource(binding, releasing);
    await held.entered;
    assert.equal((await other.closeInstanceResource(binding, releasing)).outcome, 'CLOSED');
    held.release();
    assert.deepEqual(await release, {outcome: 'CLOSED', phase: 'CLOSED', token: releasing},
      'RELEASING_REGRESSED_A_CLOSED_SLOT');
    assert.deepEqual(updatesSince(f, 'owner-a', from), [0]);
    assert.equal(f.state().selected.resources[1].phase, 'CLOSED');
  });

test('CAS-A6 a selection UPDATE that loses to a slot mutation stays single-shot STATE_CHANGED',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const [token] = await reservedSlots(f, binding, 1);
    const request = f.request(1, 2, binding.incarnation);
    const from = f.writes.length;
    const held = f.holdNext('owner-a');
    t.after(held.release);
    const pending = f.primary.selectConsensusInstance(request);
    await held.entered;
    assert.equal((await f.owner('owner-b').definitions.grantInstanceResource(binding, token))
      .outcome, 'PUBLISHED');
    held.release();
    assert.deepEqual(await pending, {outcome: 'STATE_CHANGED'}, 'A_SELECTION_WAS_RE_DECIDED');
    assert.deepEqual(updatesSince(f, 'owner-a', from), [0]);
    assert.equal(f.state().version, 1);
    assert.equal(f.state().selected.resources[0].phase, 'PUBLISHED');
    selected(await f.primary.selectConsensusInstance(request));
  });

test('CAS-A7 a failed re-observation after a definitive zero answers UNAVAILABLE, never UNKNOWN',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const binding = selected(await f.primary.selectConsensusInstance(f.request()));
    const [token] = await reservedSlots(f, binding, 1);
    const gateway = f.primary.getGateway();
    const update = gateway.updateSystemTableRow.bind(gateway);
    let submissions = 0;
    gateway.updateSystemTableRow = async (...args) => {
      submissions += 1;
      if (submissions > 1) return update(...args);
      f.setGatewayReadFault('owner-a', new Error('COMPONENT_AUTHORITATIVE_READ_UNAVAILABLE'));
      return {success: true, affectedRows: 0};
    };
    const before = f.row();
    assert.deepEqual(await f.primary.grantInstanceResource(binding, token),
      {outcome: 'UNAVAILABLE'}, 'A_DEFINITIVE_ZERO_WAS_REPORTED_AS_UNKNOWN');
    assert.equal(submissions, 1);
    assert.deepEqual(f.row(), before);
  });
