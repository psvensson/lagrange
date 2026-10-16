// R2 component oracle. Actual owners and SQL predicates; no native Raft,
// cross-process or local-resource-retirement certification is claimed here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCreationSqliteFixture} from './service-instance-creation-sqlite-fixture.js';

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

function evidence(t, f, name, results) {
  t.diagnostic(JSON.stringify({scope: 'SQLite component CAS; read adapter; no native consensus',
    name, results, row: f.row(), writes: f.writes}));
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
