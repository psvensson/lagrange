
async function holdPostDeliveryBoot(fx) {
  const entered = Promise.withResolvers();
  const released = Promise.withResolvers();
  fx.f.pauseNodes(async () => { entered.resolve(); await released.promise; });
  return {entered: entered.promise, release: released.resolve};
}
async function assertReadRefusedAfterOwnerRetires(t, retire) {
  const fx = await receiverFixture(t);
  const held = await holdPostDeliveryBoot(fx);
  t.after(held.release);
  const before = {...fx.f.row()};
  let writes = 0;
  const execute = fx.f.gateway.executeQuery;
  fx.f.gateway.executeQuery = (...args) => { writes += 1; return execute(...args); };
  const pending = record(fx);
  await assertNativeReadEntered(held, pending);
  retire(fx);
  held.release();
  assert.equal((await pending).outcome, 'unavailable',
    'retired owner must refuse after the post-delivery authority read');
  assert.equal(writes, 0, 'retired owner must not submit a recording write');
  assert.deepEqual(fx.f.row(), before);
  assert.equal(fx.physical(), 0);
}

test('registered learner invocation and owner-submission fences', {timeout: 30000}, async (t) => {
  await t.test('callback retired between capture and invocation cannot borrow its replacement', async (t) => {
    const fx = await receiverFixture(t);
    const before = {...fx.f.row()};
    let entered = 0;
    fx.service.raft = createRaftOperationPort({...fx.native, readCommittedMembership: (q) => {
      entered += 1; return fx.native.readCommittedMembership(q);
    }});
    const original = fx.recipient.handleServiceMessage.bind(fx.recipient);
    let replaced = false;
    fx.recipient.handleServiceMessage = (...args) => {
      original(...args);
      if (!replaced) {
        replaced = true;
        fx.handler.registerWithRouter(fx.recipient);
      }
    };
    assert.equal((await record(fx)).outcome, 'unavailable',
      'captured old callback must not borrow successor registration');
    assert.equal(replaced, true, 'replacement must occur inside actual inbound dispatch');
    assert.equal(entered, 0, 'retired callback must not reach native read');
    assert.deepEqual(fx.f.row(), before);
    fx.recipient.handleServiceMessage = original;
    assert.equal((await record(fx)).outcome, 'recorded', 'fresh registered invocation must recover');
  });
  await t.test('retiring handler cannot unregister another owner at its address', async (t) => {
    const fx = await receiverFixture(t);
    const successor = async () => ({owner: 'successor'});
    fx.recipient.register(address, successor);
    t.after(() => fx.recipient.unregisterExact(address, successor));
    fx.handler.unregisterFromRouter(fx.recipient);
    assert.equal(fx.recipient.getRegisteredHandler(address) === successor, true,
      'retiring handler must preserve exact successor registration');
  });
  await t.test('registered read uses the workflow normalized dispatch timeout', async (t) => {
    const fx = await receiverFixture(t, {timeoutMs: 1234});
    const deliver = fx.source.deliver.bind(fx.source);
    let actual;
    fx.source.deliver = (address, payload, options) => {
      actual = options.timeoutMs; return deliver(address, payload, options);
    };
    assert.equal((await record(fx)).outcome, 'recorded');
    assert.equal(actual, fx.owner.replicaOperationDispatchTimeoutMs,
      'registered read must use normalized owner timeout');
    assert.equal(actual, 1234);
  });
  await t.test('shutdown after delivery but before final row read submits nothing', (t) =>
    assertReadRefusedAfterOwnerRetires(t, (fx) => fx.shutOwner()));
  await t.test('fence advance alone after delivery submits nothing', (t) =>
    assertReadRefusedAfterOwnerRetires(t, (fx) => fx.owner.bumpOperationOwnershipFenceEpoch()));
  await t.test('a retired owner cannot submit a retry after pre-submission failure', async (t) => {
    const fx = await receiverFixture(t);
    const before = {...fx.f.row()};
    const execute = fx.f.gateway.executeQuery;
    const refused = {success: false, error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE};
    assert.equal(fx.f.repository.isRetryableOperationPersistError(refused), true,
      'the real retry owner must classify the supplied failure as retryable');
    let submissions = 0;
    fx.f.gateway.executeQuery = (...args) => {
      submissions += 1;
      return submissions === 1 ? refused : execute(...args);
    };
    let waited = 0;
    fx.f.repository.waitForOperationPersistRetry = async () => {
      waited += 1; fx.owner.bumpOperationOwnershipFenceEpoch();
    };
    assert.equal((await record(fx)).outcome, 'unknown',
      'retirement after a submitted attempt must preserve uncertainty');
    assert.equal(waited, 1, 'the actual retry boundary must engage');
    assert.equal(submissions, 1, 'retired owner must not submit another gateway attempt');
    assert.deepEqual(fx.f.row(), before);
  });
  await t.test('lease expiry prevents a new retry but preserves an unresolved submitted attempt', async (t) => {
    const fx = await receiverFixture(t);
    const before = {...fx.f.row()};
    const execute = fx.f.gateway.executeQuery;
    const refused = {success: false, error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE};
    let submissions = 0;
    fx.f.gateway.executeQuery = (...args) => {
      submissions += 1; return submissions === 1 ? refused : execute(...args);
    };
    fx.f.repository.waitForOperationPersistRetry = async () => {
      const expiresAt = JSON.parse(fx.f.request.executionClaim).expiresAt;
      fx.f.clock.advance(expiresAt - fx.f.clock.now());
    };
    assert.equal((await record(fx)).outcome, 'unknown',
      'expiry after an attempted write must preserve uncertainty');
    assert.equal(submissions, 1, 'expired holder must not submit a new retry');
    assert.deepEqual(fx.f.row(), before);
  });
  await t.test('recording waits for its own actual owner-lane turn and never borrows foreign success', async (t) => {
    const fx = await receiverFixture(t);
    const blocker = Promise.withResolvers();
    const key = fx.owner.getOperationOwnerSingleFlightKey(fx.f.request.operationId);
    const occupied = fx.coordinator.runExclusive(key, () => blocker.promise);
    const readsBefore = fx.f.reads.length;
    const pending = record(fx);
    t.after(async () => { blocker.resolve(); await pending; });
    let finished = false;
    pending.then(() => { finished = true; });
    await immediate();
    assert.equal(fx.f.reads.length, readsBefore, 'recorder must wait for its own owner turn');
    assert.equal(finished, false, 'a foreign owner lane cannot be bypassed');
    blocker.resolve({outcome: 'recorded', operation: {foreign: true}});
    await occupied;
    const result = await pending;
    assert.equal(result.outcome, 'recorded');
    assert.equal(result.operation.operationId, fx.f.request.operationId,
      'only this invocation may report its operation result');
    assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_COMMITTED);
    assert.equal(fx.coordinator.inFlightExecutionsByOwnerKey.size, 0);
  });
  await t.test('a queued recording cannot borrow another owner lane result or a later fence', async (t) => {
    const fx = await receiverFixture(t);
    const blocker = Promise.withResolvers();
    t.after(blocker.resolve);
    const key = fx.owner.getOperationOwnerSingleFlightKey(fx.f.request.operationId);
    const occupied = fx.coordinator.runExclusive(key, () => blocker.promise);
    let deliveries = 0;
    const deliver = fx.source.deliver.bind(fx.source);
    fx.source.deliver = (...args) => { deliveries += 1; return deliver(...args); };
    const pending = record(fx);
    assert.equal(fx.coordinator.inFlightExecutionsByOwnerKey.has(key), true,
      'the actual workflow lane must be occupied');
    fx.owner.bumpOperationOwnershipFenceEpoch();
    blocker.resolve({outcome: 'recorded', operation: {foreign: true}});
    await occupied;
    assert.equal((await pending).outcome, 'unavailable',
      'queued recorder must not borrow foreign success or refreshed owner authority');
    assert.equal(deliveries, 0, 'retired queued recorder must not dispatch');
    assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_IN_FLIGHT);
    assert.equal((await record(fx)).outcome, 'recorded',
      'a fresh owned invocation must retain a legitimate recovery path');
    assert.equal(fx.coordinator.inFlightExecutionsByOwnerKey.size, 0);
  });
  await t.test('late already-submitted commit is UNKNOWN and cannot grant activation', async (t) => {
    const fx = await receiverFixture(t);
    const execute = fx.f.gateway.executeQuery;
    let writes = 0;
    fx.f.gateway.executeQuery = async (...args) => {
      writes += 1;
      fx.shutOwner();
      return execute(...args);
    };
    const before = {...fx.f.row()};
    assert.equal((await record(fx)).outcome, 'unknown',
      'shutdown cannot relabel a possibly committed attempt as not committed');
    assert.equal(writes, 1);
    assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_COMMITTED);
    for (const key of ['status', 'workflow_step', 'completed_at',
      'message_group_membership_obligation_state', 'message_group_membership_lane_key']) {
      assert.equal(fx.f.row()[key], before[key]);
    }
    assert.equal(fx.physical(), 0, 'historical recording cannot activate CREATE');
  });
});
