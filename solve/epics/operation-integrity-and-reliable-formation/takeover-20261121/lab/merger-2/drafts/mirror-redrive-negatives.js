// The retained owner's verdicts as its workflow owner consumes them (the port
// the coordinator composes), recorded with the consumer's answer.
function observeRetainedVerdicts(owner) {
  const verdicts = [];
  const consume = owner.observeRetainedRepairVerdict;
  owner.observeRetainedRepairVerdict = (event) => {
    const answer = consume.call(owner, event);
    verdicts.push({event, answer});
    return answer;
  };
  return verdicts;
}

function failFirstRetainedRead(repository) {
  const read = repository.executeReplicaOperationsRead;
  let failed = 0;
  repository.executeReplicaOperationsRead = (sql, params, options) =>
    sql.startsWith(RETAINED_READ_PREFIX) && failed++ === 0 ?
      Promise.resolve({success: false, rowSetComplete: false}) :
      read.call(repository, sql, params, options);
}

function settleOperationLane(owner, initial) {
  return owner.operationWorkflowRunExclusive(
    owner.getOperationOwnerSingleFlightKey(initial.operation_id), async () => {});
}

function verdictFor(initial, verdict) {
  return {operationId: initial.operation_id, createdAt: initial.created_at, verdict};
}

// Only a dispatch the gate withheld is re-driven: a confirmation for an
// operation whose dispatch was never withheld dispatches nothing, and a row the
// owner confirmed at the first ask leaves no verdict behind.
test('a retained confirmation for an operation whose dispatch was never withheld re-drives ' +
  'nothing', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const verdicts = observeRetainedVerdicts(owner);
    owner.repository.reportRetainedRepairVerdict(
      verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
    await settleOperationLane(owner, initial);
    assert.equal(verdicts.length, 1, 'the composed port reaches the workflow owner');
    assert.equal(deliveries.length, 0, 'nothing was withheld: nothing is dispatched');
    await claimAndReenter(owner, leader, initial);
    await settleOperationLane(owner, initial);
    assert.equal(deliveries.length, 1, 'the gate dispatches the confirmed row itself, once');
    assert.equal(verdicts.length, 1, 'a record that answered its caller emits no verdict');
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});

// A withheld dispatch whose operation became terminal, or whose owner shut
// down, is not re-driven by a verdict that arrives afterwards.
test('a retained confirmation after the operation became terminal, or after shutdown, ' +
  're-drives nothing', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const repository = owner.repository;
    const clock = installVirtualClock(repository);
    failFirstRetainedRead(repository);
    const verdicts = observeRetainedVerdicts(owner);
    await claimAndReenter(owner, leader, initial);
    assert.equal(deliveries.length, 0, 'withheld while the owner read failed');
    owner.clearTerminalOperationRetryState(repository.rowToOperation(initial));
    await advanceContinuation(clock, [repository],
      () => repository.retainedPlacementRepairs.size === 0);
    await settleOperationLane(owner, initial);
    assert.equal(verdicts.length, 1, 'the record that refused its caller settles once, visibly');
    assert.deepEqual(verdicts[0].event,
      verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
    assert.equal(deliveries.length, 0, 'the terminal operation is not dispatched');
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
  await withPlacementExecution(async ({coordinator, owner, leader, initial, deliveries}) => {
    failFirstRetainedRead(owner.repository);
    const verdicts = observeRetainedVerdicts(owner);
    await claimAndReenter(owner, leader, initial);
    assert.equal(deliveries.length, 0, 'withheld while the owner read failed');
    await coordinator.shutdown();
    owner.repository.reportRetainedRepairVerdict(
      verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
    assert.equal(verdicts.length, 1);
    assert.equal(deliveries.length, 0, 'a shut-down owner dispatches nothing');
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});
