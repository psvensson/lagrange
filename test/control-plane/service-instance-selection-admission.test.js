// Component admission/recovery oracle. The fixture explicitly adapts reads to
// one SQLite database; no native metadata quorum or physical serving is claimed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ServiceLifecycleCommandOwner, SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY} from
  '../../src/service/service-lifecycle-command-owner.js';
import {createCreationSqliteFixture} from './service-instance-creation-sqlite-fixture.js';

for (const field of ['tenantId', 'revisionId', 'definition', 'profile']) {
  test(`fresh instance selection refuses mismatched immutable lineage: ${field}`, async (t) => {
    const f = await createCreationSqliteFixture(t);
    const request = f.request();
    request[field] = field === 'definition' ? {...request.definition, safetyIntervalMs: 42} :
      `different-${request[field]}`;
    const result = await f.primary.selectConsensusInstance(request);
    assert.equal(result.outcome, 'INVALID_LINEAGE');
    assert.equal(f.row(), null);
  });
}

for (const version of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`selection refuses invalid request counter ${version}`, async (t) => {
    const f = await createCreationSqliteFixture(t);
    const result = await f.primary.selectConsensusInstance(f.request(version));
    assert.equal(result.outcome, 'INVALID_REQUEST');
    assert.equal(f.row(), null);
  });
}

test('selection captures complete request before its first await', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const request = f.request();
  const captured = structuredClone(request);
  const pending = f.primary.selectConsensusInstance(request);
  request.requestId.nonce = 'f'.repeat(64);
  request.definition.safetyIntervalMs = 42;
  const result = await pending;
  assert.equal(result.outcome, 'SELECTED');
  assert.deepEqual(result.binding.requestId, captured.requestId);
  assert.deepEqual(await f.primary.selectConsensusInstance(captured), result);
});

test('selection binds expected incarnation as well as expected version', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const result = await f.primary.selectConsensusInstance(f.request());
  assert.equal(result.outcome, 'SELECTED');
  const before = f.row();
  assert.equal((await f.primary.selectConsensusInstance(f.request(1, 2))).outcome,
    'INVALID_EXPECTED_STATE');
  assert.deepEqual(f.row(), before);
});

test('zero affected rows cannot manufacture a successful selection', async (t) => {
  const f = await createCreationSqliteFixture(t);
  let attempts = 0;
  f.primary.getGateway().insertSystemTableRow = async () => {
    attempts += 1;
    return {success: true, affectedRows: 0};
  };
  assert.equal((await f.primary.selectConsensusInstance(f.request())).outcome, 'STATE_CHANGED');
  assert.equal(attempts, 1);
  assert.equal(f.row(), null);
});

test('uncertain selection without an authoritative record stays UNKNOWN', async (t) => {
  const f = await createCreationSqliteFixture(t);
  let attempts = 0;
  f.primary.getGateway().insertSystemTableRow = async () => {
    attempts += 1;
    throw new Error('COMPONENT_UNCERTAIN_SUBMISSION');
  };
  assert.equal((await f.primary.selectConsensusInstance(f.request())).outcome, 'UNKNOWN');
  assert.equal(attempts, 1);
  assert.equal(f.row(), null);
});

test('failed authoritative read is not never-created absence', async (t) => {
  const f = await createCreationSqliteFixture(t);
  f.primary.getGateway().readAuthoritativeRows = async () => ({success: false, rows: []});
  assert.equal((await f.primary.selectConsensusInstance(f.request())).outcome, 'UNAVAILABLE');
  assert.equal(f.row(), null);
});

for (const corrupt of [
  (state) => {
    state.selected.resources.pop();
  },
  (state) => {
    state.version += 1;
  },
  (state) => {
    state.decisions[0].originalResult.binding.incarnation = 'f'.repeat(64);
  },
]) {
  test('malformed retained state is refused, not repaired into new authority', async (t) => {
    const f = await createCreationSqliteFixture(t);
    const result = await f.primary.selectConsensusInstance(f.request());
    assert.equal(result.outcome, 'SELECTED');
    const value = f.state();
    corrupt(value);
    f.db.prepare('UPDATE service_instances SET state = ?').run(JSON.stringify(value));
    const before = f.row();
    assert.equal((await f.primary.selectConsensusInstance(
      f.request(1, 2, result.binding.incarnation))).outcome, 'CORRUPT_STATE');
    assert.deepEqual(f.row(), before);
  });
}

test('oversize and non-JSON requests allocate no instance row', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const large = f.request();
  large.definition.payload = 'x'.repeat(8193);
  assert.equal((await f.primary.selectConsensusInstance(large)).outcome, 'INVALID_REQUEST');
  const cyclic = f.request();
  cyclic.definition.self = cyclic;
  assert.equal((await f.primary.selectConsensusInstance(cyclic)).outcome, 'INVALID_REQUEST');
  assert.equal(f.row(), null);
});

test('uncertain submission plus failed resolution cannot become pre-admission UNAVAILABLE', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const gateway = f.primary.getGateway();
  gateway.insertSystemTableRow = async () => {
    gateway.readAuthoritativeRows = async () => ({success: false, rows: []});
    throw new Error('COMPONENT_UNCERTAIN_SUBMISSION');
  };
  assert.equal((await f.primary.selectConsensusInstance(f.request())).outcome, 'UNKNOWN');
  assert.equal(f.row(), null);
});

test('resource requests cannot change their content while awaiting the row owner', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const {binding} = await f.primary.selectConsensusInstance(f.request());
  const request = f.slotRequest();
  const original = structuredClone(request);
  const pending = f.primary.reserveInstanceResource(binding, request);
  request.nodeId = 'changed-after-submission';
  const result = await pending;
  assert.equal(result.outcome, 'ADMITTED');
  assert.deepEqual(f.state().selected.resources[0].request, original);
});

test('forged binding and altered tokens cannot close or publish a resource', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const {binding} = await f.primary.selectConsensusInstance(f.request());
  const {token} = await f.primary.reserveInstanceResource(binding, f.slotRequest());
  const before = f.row();
  const forged = {...binding, definitionDigest: 'b'.repeat(64)};
  assert.notEqual((await f.primary.grantInstanceResource(forged, token)).outcome, 'PUBLISHED');
  assert.notEqual((await f.primary.closeInstanceResource(binding,
    {...token, operationId: 'forged-operation'})).outcome, 'CLOSED');
  assert.deepEqual(f.row(), before);
});

test('lost grant and closure replies resolve exact persisted resource phases', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const {binding} = await f.primary.selectConsensusInstance(f.request());
  const {token} = await f.primary.reserveInstanceResource(binding, f.slotRequest());
  f.loseReply('owner-a');
  assert.equal((await f.primary.grantInstanceResource(binding, token)).outcome, 'PUBLISHED');
  assert.equal(f.appliedLostReplies.length, 1);
  assert.equal(f.appliedLostReplies[0].state.selected.resources[0].phase, 'PUBLISHED');
  f.loseReply('owner-a');
  assert.equal((await f.primary.closeInstanceResource(binding, token)).outcome, 'CLOSED');
  assert.equal(f.appliedLostReplies.length, 2);
  assert.equal(f.appliedLostReplies[1].state.selected.resources[0].phase, 'CLOSED');
});

test('command constructor captures immutable request without creating metadata or changing identity',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const command = new ServiceLifecycleCommandOwner({catalogOwner: f.owner('constructor').catalog,
      artifactResolver: {}, signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY});
    const request = f.request();
    const security = {tenantId: request.tenantId, principal: 'test', roles: ['service-operator']};
    const captured = command.prepareConsensusInstanceRequest(request, security);
    assert.deepEqual(captured, request);
    assert.notEqual(captured, request);
    assert.equal(Object.isFrozen(captured.requestId), true);
    assert.equal(Object.isFrozen(captured.definition), true);
    assert.equal(f.row(), null);
    assert.throws(() => command.prepareConsensusInstanceRequest(request,
      {...security, tenantId: 'other-tenant'}));
    request.definition.safetyIntervalMs = 42;
    assert.equal((await f.primary.selectConsensusInstance(captured)).outcome, 'SELECTED');
  });

test('selection overtaking an in-flight grant defeats its exact whole-row predicate', async (t) => {
  const f = await createCreationSqliteFixture(t);
  const {binding} = await f.primary.selectConsensusInstance(f.request());
  const {token} = await f.primary.reserveInstanceResource(binding, f.slotRequest());
  const held = f.holdNext('owner-a');
  t.after(held.release);
  const grant = f.primary.grantInstanceResource(binding, token);
  await held.entered;
  const winner = await f.owner('owner-b').definitions.selectConsensusInstance(
    f.request(1, 2, binding.incarnation));
  assert.equal(winner.outcome, 'SELECTED');
  held.release();
  assert.equal((await grant).outcome, 'STALE_BINDING');
  assert.equal(f.state().retiring.resources[0].phase, 'ADMITTED');
  assert.ok(f.writes.some((write) => write.sql.startsWith('UPDATE service_instances') &&
    write.changes === 0));
});

// Superseded by design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 amendment
// A2 as revised by A2' (A2'.0, A2'.7): this witness was sealed as "closed-slot
// contention reports STATE_CHANGED and caller replay closes only its exact
// token". A close whose exact predicate loses to a sibling slot's reservation
// is now re-decided by the owner from a fresh observation: the held close
// answers CLOSED in the same call, closing only its exact token.
test('closed-slot contention is re-decided and closes only the exact token in the same call',
  async (t) => {
    const f = await createCreationSqliteFixture(t);
    const {binding} = await f.primary.selectConsensusInstance(f.request());
    const {token} = await f.primary.reserveInstanceResource(binding, f.slotRequest());
    const held = f.holdNext('owner-a');
    t.after(held.release);
    const closing = f.primary.closeInstanceResource(binding, token);
    await held.entered;
    const other = f.owner('owner-b').definitions;
    const second = await other.reserveInstanceResource(binding, f.slotRequest(1));
    assert.equal(second.outcome, 'ADMITTED');
    held.release();
    assert.deepEqual(await closing, {outcome: 'CLOSED', phase: 'CLOSED', token});
    assert.equal(f.state().selected.resources[0].phase, 'CLOSED');
    assert.equal(f.state().selected.resources[1].phase, 'ADMITTED');
    assert.deepEqual(await f.primary.closeInstanceResource(binding, token),
      {outcome: 'CLOSED', phase: 'CLOSED', token});
  });
