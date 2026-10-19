import test from 'node:test';
import assert from 'node:assert/strict';
import {ServiceLifecycleManager} from '../../src/service/service-lifecycle-manager.js';
import {ServiceTypeAdapter} from '../../src/service/service-type-adapter.js';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {createOriginFixture} from './service-consensus-creation-fixture.js';

// This suite stops at original intent + resource admission. No physical creation,
// endpoint, native quorum, local serving grant or retirement proof is inferred.
test('ServiceLifecycleManager persists original intent before reservation and token before return', async (t) => {
  const f = await createOriginFixture(t);
  const result = await f.prepare();
  t.diagnostic(JSON.stringify({scope: 'component intent-before-reservation',
    boundaries: f.events.map((event) => ({kind: event.kind,
      intentRetained: Boolean(event.intent), outcome: event.outcome, token: event.token})),
    ordinal: f.state().selected.resources[0].ordinal}));
  assert.equal(result.outcome, 'ADMISSION_RETAINED');
  assert.deepEqual(f.events.map((e) => e.kind), ['intent', 'reserve', 'admission'],
    'RESERVATION_PRECEDED_DURABLE_CREATION_INTENT');
  assert.ok(f.events.find((e) => e.kind === 'reserve').intent);
  assert.deepEqual(JSON.parse(f.row().intent_json), f.intent);
  assert.deepEqual(JSON.parse(f.row().admission_json), result.token);
  assert.equal(result.token.operationId, f.intent.consensusSlotRequest.operationId);
  assert.equal(f.row().state, 'in_progress');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM wasm_operations').get().n, 1);
  assert.equal(result.started, undefined);
  assert.equal(result.endpointIntent, undefined);
});

test('ServiceLifecycleManager redelivery retains one origin and never reserves another ordinal', async (t) => {
  const f = await createOriginFixture(t);
  const first = await f.prepare();
  const original = f.row();
  const replay = await f.manager().prepareConsensusCreation(structuredClone(f.intent));
  assert.deepEqual(replay, first);
  assert.deepEqual(f.row(), original);
  assert.equal(f.events.filter((e) => e.kind === 'reserve').length, 1);
});

test('ServiceLifecycleManager recovers lost reservation from its original durable request', async (t) => {
  const f = await createOriginFixture(t);
  f.loseReservation();
  assert.equal((await f.prepare()).outcome, 'UNKNOWN');
  const original = f.row().intent_json;
  assert.equal(f.row().admission_json, null);
  const reserved = f.state().selected.resources[0].token;
  const recovered = await f.manager()
    .recoverConsensusCreation(f.intent.consensusSlotRequest.operationId);
  assert.equal(recovered.outcome, 'ADMISSION_RETAINED');
  assert.deepEqual(recovered.token, reserved);
  assert.equal(f.row().intent_json, original);
  assert.equal(f.state().selected.resources[0].ordinal, 1);
  const requests = f.events.filter((e) => e.kind === 'reserve').map((e) => e.request);
  assert.deepEqual(requests, [f.intent.consensusSlotRequest, f.intent.consensusSlotRequest]);
});

for (const phase of ['intent', 'admission']) {
  test(`ServiceLifecycleManager resolves an applied ${phase} write with lost reply`, async (t) => {
    const f = await createOriginFixture(t);
    f.setJournalFault(`after-${phase}`);
    assert.equal((await f.prepare()).outcome, 'ADMISSION_RETAINED');
    assert.equal(f.events.filter((e) => e.kind === phase).length, 1);
    assert.equal(f.row().state, 'in_progress');
  });
}

test('ServiceLifecycleManager refuses reservation when intent write did not persist', async (t) => {
  const f = await createOriginFixture(t);
  f.setJournalFault('before-intent');
  assert.equal((await f.prepare()).outcome, 'UNKNOWN');
  assert.equal(f.row(), null);
  assert.equal(f.events.filter((e) => e.kind === 'reserve').length, 0);
});

test('ServiceLifecycleManager retains the original request when admission persistence fails', async (t) => {
  const f = await createOriginFixture(t);
  f.setJournalFault('before-admission');
  assert.equal((await f.prepare()).outcome, 'UNKNOWN');
  const retainedToken = structuredClone(f.state().selected.resources[0].token);
  assert.equal(f.row().admission_json, null);
  f.setJournalFault(null);
  const resumed = await f.manager()
    .recoverConsensusCreation(f.intent.consensusSlotRequest.operationId);
  assert.equal(resumed.outcome, 'ADMISSION_RETAINED');
  assert.deepEqual(resumed.token, retainedToken);
});

test('ServiceLifecycleManager captures original intent before its first awaited read', async (t) => {
  const f = await createOriginFixture(t);
  const original = structuredClone(f.intent);
  const hold = f.holdRead();
  t.after(hold.release);
  const pending = f.prepare();
  await hold.entered;
  f.intent.descriptor.runtimeRef = 'changed-after-delivery';
  f.intent.consensusSlotRequest.operationId = 'changed-after-delivery';
  hold.release();
  const result = await pending;
  assert.equal(result.outcome, 'ADMISSION_RETAINED');
  assert.deepEqual(result.intent, original);
});

test('ServiceLifecycleManager rejects changed descriptor under a retained operation ID', async (t) => {
  const f = await createOriginFixture(t);
  await f.prepare();
  const before = f.row();
  const altered = structuredClone(f.intent);
  altered.descriptor.runtimeRef = 'different-component';
  assert.equal((await f.lifecycle.prepareConsensusCreation(altered)).outcome, 'CONTENT_CONFLICT');
  assert.deepEqual(f.row(), before);
});

test('ServiceLifecycleManager recovery does not replace original intent with current resolver data', async (t) => {
  const f = await createOriginFixture(t);
  f.loseReservation();
  await f.prepare();
  let resolverCalls = 0;
  const result = await f.manager().recoverPendingOperations({resolveServiceContext: async () => {
    resolverCalls += 1;
    throw new Error('current definition is not original creation intent');
  }});
  assert.equal(resolverCalls, 0);
  assert.equal(result.length, 1);
  // SUPERSEDED (design RECOVERY-DESIGN-20261017 Revision 5 R5-A; successor
  // appended below): the scan no longer resolves the reservation (F3).
  // assert.equal(result[0].status, 'held');
  // assert.equal(result[0].outcome, 'ADMISSION_RETAINED');
  // assert.equal(f.row().state, 'in_progress');
});

// Successor of the witness above (design RECOVERY-DESIGN-20261017 Revision 5
// R5-A, R1-A): the restart scan answers the journal half only - an INVENTORIED
// PENDING entry, nothing reserved, the row left PENDING; the RE-ENTRY resolves
// the same request (P-R12 is the successor of the F3 claim).
test('R5-A successor (:113-126): the scan inventories a PENDING row and reserves nothing; ' +
  'the re-entry resolves the same request', async (t) => {
  const f = await createOriginFixture(t);
  f.loseReservation();
  await f.prepare();
  const reserves = () => f.events.filter((event) => event.kind === 'reserve');
  const before = reserves().length;
  let resolverCalls = 0;
  const result = await f.manager().recoverPendingOperations({resolveServiceContext: async () => {
    resolverCalls += 1;
    throw new Error('current definition is not original creation intent');
  }});
  assert.equal(resolverCalls, 0);
  assert.equal(result.length, 1);
  const {intent, ...entry} = result[0];
  assert.deepEqual(entry, {status: 'INVENTORIED', operationId: f.intent.consensusSlotRequest.operationId,
    token: null, rowState: 'pending', opening: null, nodeId: f.intent.consensusSlotRequest.nodeId});
  assert.deepEqual(intent, f.intent, 'the journaled intent, never the resolver');
  assert.equal(reserves().length, before, 'THE_SCAN_RESERVED');
  assert.equal(f.row().state, 'pending');
  const resumed = await f.manager().recoverConsensusCreation(entry.operationId);
  assert.equal(resumed.outcome, 'ADMISSION_RETAINED');
  assert.equal(reserves().length, before + 1);
  assert.deepEqual(reserves().at(-1).request, f.intent.consensusSlotRequest, 'the same request');
  assert.equal(f.state().selected.resources[0].ordinal, 1, 'no second allocation');
  assert.equal(f.row().state, 'in_progress');
});

test('ServiceLifecycleManager never revives CLOSED resource from retained admission', async (t) => {
  const f = await createOriginFixture(t);
  const prepared = await f.prepare();
  // Explicit trusted lifecycle ingress, not a claim of physical retirement.
  await f.primary.closeInstanceResource(f.intent.consensusBinding, prepared.token);
  const before = f.row();
  assert.equal((await f.manager().recoverConsensusCreation(prepared.operationId)).outcome, 'RESOURCE_CLOSED');
  assert.deepEqual(f.row(), before);
  assert.equal(f.events.filter((e) => e.kind === 'reserve').length, 1);
});

for (const state of ['completed', 'cancelled', 'failed']) {
  test(`ServiceLifecycleManager ${state} journal is history, not a new effect grant`, async (t) => {
    const f = await createOriginFixture(t);
    const result = await f.prepare();
    f.db.prepare('UPDATE wasm_operations SET state = ? WHERE operation_id = ?')
      .run(state, result.operationId);
    const count = f.events.length;
    assert.equal((await f.manager().recoverConsensusCreation(result.operationId)).outcome, 'TERMINAL_OPERATION');
    assert.equal(f.events.length, count);
  });
}

test('ServiceLifecycleManager refuses forged persisted admission rather than borrowing another token', async (t) => {
  const f = await createOriginFixture(t);
  const first = await f.prepare();
  const altered = {...first.token, operationId: 'foreign-operation'};
  f.db.prepare('UPDATE wasm_operations SET admission_json = ? WHERE operation_id = ?')
    .run(JSON.stringify(altered), first.operationId);
  assert.equal((await f.manager().recoverConsensusCreation(first.operationId)).outcome, 'CORRUPT_STATE');
});

test('ServiceLifecycleManager absent or unavailable journal cannot invent recovery intent', async (t) => {
  const f = await createOriginFixture(t);
  assert.equal((await f.lifecycle.recoverConsensusCreation('absent')).outcome, 'INTENT_NOT_FOUND');
  f.setReadFault('journal unavailable');
  assert.equal((await f.prepare()).outcome, 'UNAVAILABLE');
  assert.equal(f.events.length, 0);
});

test('ServiceLifecycleManager requires durable journal capabilities before resource admission', async (t) => {
  const f = await createOriginFixture(t);
  const manager = new ServiceLifecycleManager({serviceDefinitionsOwner: f.primary});
  assert.equal((await manager.prepareConsensusCreation(f.intent)).outcome, 'UNAVAILABLE');
  assert.equal(f.events.length, 0);
});

test('ServiceLifecycleManager malformed or oversized intent allocates no journal or reservation', async (t) => {
  const f = await createOriginFixture(t);
  for (const intent of [null, {...f.intent, extra: true},
    {...f.intent, descriptor: {...f.intent.descriptor, runtimeRef: 'x'.repeat(20000)}}]) {
    assert.equal((await f.lifecycle.prepareConsensusCreation(intent)).outcome, 'INVALID_REQUEST');
  }
  assert.equal(f.row(), null);
  assert.equal(f.events.length, 0);
});

test('ServiceLifecycleManager concurrent identical delivery converges on one original operation and token', async (t) => {
  const f = await createOriginFixture(t);
  const results = await Promise.all([f.prepare(), f.manager().prepareConsensusCreation(f.intent)]);
  assert.equal(results[0].outcome, 'ADMISSION_RETAINED');
  assert.deepEqual(results[0], results[1]);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM wasm_operations').get().n, 1);
  assert.equal(f.state().selected.resources[0].ordinal, 1);
});

test('ServiceLifecycleManager validates descriptor lineage before retaining a new request', async (t) => {
  const f = await createOriginFixture(t);
  const intent = structuredClone(f.intent);
  const config = JSON.parse(intent.descriptor.runtimeConfig);
  config.definition.serviceName = 'not-selected-definition';
  intent.descriptor.runtimeConfig = JSON.stringify(config);
  assert.equal((await f.lifecycle.prepareConsensusCreation(intent)).outcome, 'INVALID_LINEAGE');
  assert.equal(f.row(), null);
  assert.equal(f.events.length, 0);
});

test('SystemTableCache projects actual intent/admission columns without granting lifecycle completion', async (t) => {
  const f = await createOriginFixture(t);
  await f.prepare();
  const row = f.row();
  const cache = new SystemTableCache();
  cache.applySystemTableChange('wasm_operations', CDC_OPERATIONS.INSERT, row);
  assert.deepEqual(cache.get('wasm_operations', row.operation_id), row);
  assert.equal(cache.get('wasm_operations', row.operation_id).state, 'in_progress');
});


test('ServiceLifecycleManager damaged bound journal cannot fall through to old unbound recovery', async (t) => {
  const f = await createOriginFixture(t);
  await f.prepare();
  f.db.prepare('UPDATE wasm_operations SET intent_json = NULL, admission_json = NULL').run();
  let resolverCalls = 0;
  const results = await f.manager().recoverPendingOperations({resolveServiceContext: async () => {
    resolverCalls += 1;
    return null;
  }});
  assert.equal(resolverCalls, 0);
  assert.equal(results[0].outcome, 'CORRUPT_STATE');
  // SUPERSEDED (design RECOVERY-DESIGN-20261017 Revision 5 R5-A; successor
  // appended below): the scan no longer re-enters a corrupt row.
  // assert.equal(results[0].status, 'held');
  assert.equal(f.row().state, 'in_progress');
});

// Successor (design RECOVERY-DESIGN-20261017 Revision 5 R5-A, R3-F): an
// undecodable intent names no replica: a typed entry never re-entered.
test('R5-A successor (:222-230): a corrupt journal row is an INVENTORIED CORRUPT_STATE entry ' +
  'with reentry false', async (t) => {
  const f = await createOriginFixture(t);
  await f.prepare();
  f.db.prepare('UPDATE wasm_operations SET intent_json = NULL, admission_json = NULL').run();
  const results = await f.manager().recoverPendingOperations({
    resolveServiceContext: async () => null});
  assert.deepEqual(results, [{status: 'INVENTORIED',
    operationId: f.intent.consensusSlotRequest.operationId, outcome: 'CORRUPT_STATE',
    reentry: false}]);
  assert.equal(f.row().state, 'in_progress');
});

test('ServiceLifecycleManager unavailable resource resolution after retention stays UNKNOWN', async (t) => {
  const f = await createOriginFixture(t);
  const prepared = await f.prepare();
  f.primary.resolveInstanceResource = async () => ({outcome: 'UNAVAILABLE'});
  const result = await f.manager().recoverConsensusCreation(prepared.operationId);
  // SUPERSEDED (design RECOVERY-DESIGN-20261017 Revision 5 R5-A; successor
  // appended below): the manager no longer refuses on an unreachable owner.
  // assert.deepEqual(result, {outcome: 'UNKNOWN', reason: 'UNAVAILABLE'});
  assert.equal(result.phase, 'UNAVAILABLE', 'R5-A: the successor below pins the full answer');
  assert.equal(f.row().state, 'in_progress');
});

// Successor (design RECOVERY-DESIGN-20261017 Revision 5 R5-A, R2-B): the
// UNAVAILABLE class passes through as ADMISSION_RETAINED with phase
// UNAVAILABLE; no new outcome value; the opening module decides on its own
// owner read (witnessed in test/wasm-service/bound-creation-restart.integration.test.js,
// the named open-time deferral of R3-B).
test('R5-A successor (:232-239): an unreachable owner after retention is ADMISSION_RETAINED ' +
  'with phase UNAVAILABLE (answered or thrown)', async (t) => {
  const f = await createOriginFixture(t);
  const prepared = await f.prepare();
  for (const owner of [async () => ({outcome: 'UNAVAILABLE'}), async () => {
    throw new Error('OWNER_READ_THREW');
  }]) {
    f.primary.resolveInstanceResource = owner;
    const result = await f.manager().recoverConsensusCreation(prepared.operationId);
    assert.deepEqual(result, {outcome: 'ADMISSION_RETAINED', operationId: prepared.operationId,
      intent: prepared.intent, token: prepared.token, phase: 'UNAVAILABLE'});
    assert.equal(f.row().state, 'in_progress');
  }
});


test('ServiceLifecycleManager does not erase bound descriptor fields into legacy physical CREATE', async (t) => {
  const f = await createOriginFixture(t);
  let effects = 0;
  class CountingAdapter extends ServiceTypeAdapter {
    constructor() {
      super('runtime_service');
    }
    validateDefinition() {
      return {valid: true};
    }
    async createReplica() {
      effects += 1; return {created: true};
    }
  }
  f.lifecycle.registerAdapter(new CountingAdapter());
  const descriptor = {...f.intent.descriptor, consensusBinding: f.intent.consensusBinding,
    consensusSlotRequest: f.intent.consensusSlotRequest};
  await assert.rejects(() => f.lifecycle.createReplica(descriptor),
    /bound consensus physical creation is not yet composed/u);
  assert.equal(effects, 0);
  assert.equal(f.row(), null);
});

// Design RECOVERY-DESIGN-20261017 R2-E: the restart scan is total; one
// unreadable row is that row's typed result, never the end of the scan.
test('recovery R2-E the restart scan is total: a malformed row fails alone, the creation ' +
  'row after it is still inventoried', async (t) => {
  const f = await createOriginFixture(t);
  await f.prepare();
  const manager = f.manager();
  manager.setRecoveryReader(async (sql, params) => {
    const rows = await f.reader(sql, params);
    return params.includes('pending') ?
      [{command: 'start:svc', state: 'pending', created_at: 0}, ...rows] : rows;
  });
  const results = await manager.recoverPendingOperations({resolveServiceContext: async () => null});
  assert.deepEqual(results.map((result) => result.status), ['failed', 'INVENTORIED']);
  assert.equal(results[1].operationId, f.intent.consensusSlotRequest.operationId);
});

// A collision in one operation ID poisons that ID without discarding
// unrelated journal work. No contender is allowed to resume.
test('recovery R2-E conflicting duplicate ID is isolated from later creation', async (t) => {
  const f = await createOriginFixture(t);
  await f.prepare();
  const manager = f.manager();
  manager.setRecoveryReader(async (sql, params) => {
    const rows = await f.reader(sql, params);
    return [...rows, {...rows[0], command: 'start:conflicting-service'}];
  });
  const results = await manager.recoverPendingOperations({resolveServiceContext: async () => {
    throw new Error('a conflicting row must not reach a resolver');
  }});
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].error, 'CORRUPT_STATE');
});

// Design RECOVERY-DESIGN-20261017 R1-D, R3-D: a terminal row's answer
// carries its state (the REMOVE decides COMPLETED/CANCELLED vs FAILED by it).
test('recovery R1-D/R3-D the TERMINAL answer carries the row state', async (t) => {
  for (const state of ['completed', 'cancelled', 'failed']) {
    const f = await createOriginFixture(t);
    const prepared = await f.prepare();
    f.db.prepare('UPDATE wasm_operations SET state = ? WHERE operation_id = ?')
      .run(state, prepared.operationId);
    assert.deepEqual(await f.manager().readRetainedCreation(prepared.operationId),
      {outcome: 'TERMINAL_OPERATION', rowState: state});
  }
});

// Independently authored by /root/verify_recovery_u1, a251ce4fd review.
// Append to test/service/service-consensus-creation-intent.test.js: uses its
// actual component SQLite owner fixture, without replacing owner decisions.
for (const condition of ['TARGET_ALREADY_OWNED', 'INVALID_EXPECTED_STATE']) {
  test(`independent U1: ${condition} is not a sealed reservation refusal under a delayed original request`, async (t) => {
    const f = await createOriginFixture(t);
    const binding = f.intent.consensusBinding;
    const request = f.intent.consensusSlotRequest;
    // Both are currently inadmissible but legally become admissible after an
    // existing resource closes. Every owner call below uses the real CAS.
    const blocker = condition === 'TARGET_ALREADY_OWNED' ?
      f.slotRequest(3, 0, 'independent-blocker', 0) :
      f.slotRequest(0, 0, 'independent-blocker', 0);
    if (condition === 'INVALID_EXPECTED_STATE') request.expectedOrdinal = 1;
    const blockedBy = await f.primary.reserveInstanceResource(binding, blocker);
    assert.equal(blockedBy.outcome, 'ADMITTED', 'the prior resource is durably owed');
    const reserve = f.primary.reserveInstanceResource.bind(f.primary);
    const arrived = Promise.withResolvers();
    const release = Promise.withResolvers();
    let delayed = false;
    f.primary.reserveInstanceResource = async (...args) => {
      if (args[1].operationId === request.operationId && !delayed) {
        delayed = true;
        arrived.resolve();
        await release.promise;
      }
      return reserve(...args);
    };
    const original = f.prepare();
    await arrived.promise;
    assert.equal(f.row().state, 'pending', 'original intent durable, original reservation pending');
    const resolution = await f.manager().resolveRetainedReservation(request.operationId);
    const rowAfterResolution = f.row().state;
    assert.equal((await f.primary.closeInstanceResource(binding, blockedBy.token)).outcome,
      'CLOSED', 'only the genuine prior token is closed');
    release.resolve();
    const originalResult = await original;
    const finalRow = f.row();
    const resource = f.state().selected.resources[request.slot];
    t.diagnostic(JSON.stringify({condition, resolution, rowAfterResolution, originalResult,
      finalJournalState: finalRow.state, admissionJson: finalRow.admission_json,
      finalResource: resource,
      inventory: await f.manager().recoverPendingOperations({resolveServiceContext: () => null})}));
    assert.ok(!(finalRow.state === 'cancelled' && resource.phase === 'ADMITTED' &&
      resource.token.operationId === request.operationId),
    'CANCELLED_JOURNAL_WITH_DELAYED_ADMITTED_RESOURCE: unresolved obligation lost');
  });
}

// Independent future-binding member of the reservation-finality class.
test('independent U1: STALE_BINDING before the exact future selection is not a sealed reservation refusal', async (t) => {
  const {selectInstanceState} = await import('../../src/control-plane/owners/service-instance-state.js');
  const f = await createOriginFixture(t);
  const previous = f.intent.consensusBinding;
  const nextRequest = f.request(previous.selectionVersion, 73, previous.incarnation);
  const revision = await f.primary.catalogOwner.getCreationRevision(
    nextRequest.revisionId, nextRequest.tenantId);
  const predicted = selectInstanceState(f.state(), nextRequest, revision).result.binding;
  // This is a syntactically valid immutable intent. Predicting the deterministic
  // binding grants no authority: the real owner refuses it until the selection.
  f.intent.consensusBinding = predicted;
  const request = f.intent.consensusSlotRequest;
  const reserve = f.primary.reserveInstanceResource.bind(f.primary);
  const arrived = Promise.withResolvers();
  const release = Promise.withResolvers();
  let delayed = false;
  f.primary.reserveInstanceResource = async (...args) => {
    if (args[1].operationId === request.operationId && !delayed) {
      delayed = true;
      arrived.resolve();
      await release.promise;
    }
    return reserve(...args);
  };
  const original = f.prepare();
  await arrived.promise;
  assert.equal(f.row().state, 'pending');
  const resolution = await f.manager().resolveRetainedReservation(request.operationId);
  const selected = await f.primary.selectConsensusInstance(nextRequest);
  assert.equal(selected.outcome, 'SELECTED');
  assert.deepEqual(selected.binding, predicted, 'the actual authoritative future selection is the exact binding');
  release.resolve();
  const originalResult = await original;
  const finalRow = f.row();
  const resource = f.state().selected.resources[request.slot];
  t.diagnostic(JSON.stringify({resolution, originalResult, finalJournalState: finalRow.state,
    admissionJson: finalRow.admission_json, resource}));
  assert.ok(!(finalRow.state === 'cancelled' && resource.phase === 'ADMITTED' &&
    resource.token.operationId === request.operationId),
  'FUTURE_BINDING_CANCELLED_BEFORE_EXACT_REQUEST_BECAME_ADMISSIBLE');
});

async function pendingReservation(f) {
  const reserve = f.primary.reserveInstanceResource.bind(f.primary);
  f.primary.reserveInstanceResource = async () => {
    throw new Error('ORIGINAL_RESERVATION_UNAVAILABLE');
  };
  assert.equal((await f.prepare()).outcome, 'UNKNOWN');
  assert.equal(f.row().state, 'pending');
  f.primary.reserveInstanceResource = reserve;
  return reserve;
}

test('F1 REMOVE-time resolution fails closed for untagged or UNRESOLVED owner refusals', async (t) => {
  const f = await createOriginFixture(t);
  const reserve = await pendingReservation(f);
  const before = f.row();
  const manager = f.manager();
  manager._enforceRuntimePolicy = () => {
    assert.fail('REMOVE_RESOLUTION_USED_FRESH_RUNTIME_POLICY');
  };
  const outcomes = ['STALE_BINDING', 'HISTORY_UNAVAILABLE', 'CONFLICT', 'CONTENT_CONFLICT',
    'CAPACITY_EXHAUSTED', 'INVALID_EXPECTED_STATE', 'TARGET_ALREADY_OWNED', 'INVALID_REQUEST',
    'CORRUPT_STATE', 'STATE_CHANGED', 'UNKNOWN', 'UNAVAILABLE'];
  for (const outcome of outcomes) {
    for (const tag of [{}, {reservationRefusal: 'UNRESOLVED'}]) {
      f.primary.reserveInstanceResource = async () => ({outcome, ...tag});
      assert.deepEqual(await manager.resolveRetainedReservation(before.operation_id),
        {outcome: 'UNKNOWN', reason: outcome}, 'CALLER_RECONSTRUCTED_FINALITY_FROM_OUTCOME');
      assert.deepEqual(f.row(), before, 'NONFINAL_REFUSAL_CHANGED_ORIGINAL_JOURNAL_BYTES');
    }
  }
  f.primary.reserveInstanceResource = reserve;
  const retained = await manager.resolveRetainedReservation(before.operation_id);
  assert.equal(retained.outcome, 'ADMISSION_RETAINED');
  assert.deepEqual(JSON.parse(f.row().admission_json), retained.token,
    'EXACT_TOKEN_NOT_PERSISTED_BEFORE_RETURN');
  assert.equal(f.row().intent_json, before.intent_json);
  assert.equal(f.row().state, 'in_progress');
});

test('F1 irrevocably absent old binding permits exact positive cancellation and terminal reread',
  async (t) => {
    const f = await createOriginFixture(t);
    await pendingReservation(f);
    const before = f.row();
    const binding = f.intent.consensusBinding;
    assert.equal((await f.primary.selectConsensusInstance(
      f.request(binding.selectionVersion, 2, binding.incarnation))).outcome, 'SELECTED');
    const refusal = await f.primary.reserveInstanceResource(binding, f.intent.consensusSlotRequest);
    assert.deepEqual(refusal, {outcome: 'STALE_BINDING', reservationRefusal: 'SEALED'});
    const manager = f.manager();
    manager._enforceRuntimePolicy = () => {
      assert.fail('CANCELLATION_USED_FRESH_RUNTIME_POLICY');
    };
    const result = await manager.resolveRetainedReservation(before.operation_id);
    assert.deepEqual(result, {outcome: 'RESERVATION_CANCELLED',
      operationId: before.operation_id, reason: 'STALE_BINDING'});
    assert.equal(f.row().state, 'cancelled');
    assert.equal(f.row().intent_json, before.intent_json);
    assert.equal(f.row().admission_json, null);
    assert.deepEqual(JSON.parse(f.row().error), {reason: 'STALE_BINDING'});
    assert.deepEqual(await manager.resolveRetainedReservation(before.operation_id),
      {outcome: 'TERMINAL_OPERATION', rowState: 'cancelled'});
  });

for (const write of ['admission', 'cancellation']) {
  for (const terminal of ['completed', 'failed']) {
    test(`F1 ${write} reread preserves concurrently observed ${terminal} journal authority`,
      async (t) => {
        const f = await createOriginFixture(t);
        await pendingReservation(f);
        const before = f.row();
        if (write === 'cancellation') {
          assert.equal((await f.primary.reserveInstanceResource(f.intent.consensusBinding,
            {...f.intent.consensusSlotRequest, operationId: 'ordinal-winner'})).outcome,
          'ADMITTED');
        }
        const manager = f.manager();
        manager.setOperationWriter(async (sql, params) => {
          // Fault seam: another writer's terminal transition wins before our
          // exact expected-state mutation. The reread must expose that state.
          f.db.prepare('UPDATE wasm_operations SET state = ? WHERE operation_id = ?')
            .run(terminal, before.operation_id);
          return f.writer(sql, params);
        });
        assert.deepEqual(await manager.resolveRetainedReservation(before.operation_id),
          {outcome: 'TERMINAL_OPERATION', rowState: terminal},
          'CONCURRENT_TERMINAL_JOURNAL_WAS_NORMALIZED_TO_RESOURCE_UNCERTAINTY');
        assert.equal(f.row().intent_json, before.intent_json);
        assert.equal(f.row().state, terminal);
      });
  }
}

test('F1 corrupt retained identity remains a journal error, never resource UNKNOWN', async (t) => {
  const f = await createOriginFixture(t);
  await pendingReservation(f);
  const id = f.row().operation_id;
  f.db.prepare('UPDATE wasm_operations SET tenant_id = ? WHERE operation_id = ?')
    .run('foreign-tenant', id);
  const before = f.row();
  const reserves = f.events.filter((event) => event.kind === 'reserve').length;
  assert.deepEqual(await f.manager().resolveRetainedReservation(id), {outcome: 'CONTENT_CONFLICT'});
  assert.deepEqual(f.row(), before);
  assert.equal(f.events.filter((event) => event.kind === 'reserve').length, reserves);
});
