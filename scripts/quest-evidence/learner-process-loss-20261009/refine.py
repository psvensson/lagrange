from pathlib import Path

def replace(path, old, new):
    p = Path(path); text = p.read_text()
    assert text.count(old) == 1, (path, 'refinement anchor drift')
    p.write_text(text.replace(old, new))

replace('scripts/checks/test-subsystem-classification-constants.js',
    'export const SUBSYSTEM_OVERRIDES = Object.freeze({',
    """export const SUBSYSTEM_OVERRIDES = Object.freeze({
  'test/integration/message-group-learner-process-loss.integration.test.js': {
    subsystem: SUBSYSTEM_STORAGE_RAFT,
    reason: 'proves committed learner recovery across process loss and membership-holder replacement; local SQL and transport are fixture physics',
  },""")
replace('test/test-helpers/learner-process-loss-worker.js',
    '  await notify(state);\n  await new Promise(() => {});',
    """  // Ref the IPC channel before notifying the parent. A pending Promise alone
  // must not turn this intended SIGKILL cut into a possible normal Node exit.
  const stopped = new Promise(() => {
    process.on('message', () => assert.fail('a cut worker must not be resumed'));
  });
  await notify(state);
  await stopped;""")
replace('test/test-helpers/learner-process-loss-worker.js',
    "  const claim = {operationId: O, identity: cut.request.identity,\n    expectedClaim: cut.request.executionClaim};",
    """  const durable = await f.repository.queryAuthoritativeOperationById(O);
  const restored = {operationId: durable.operationId,
    identity: durable.messageGroupMembershipIdentity,
    permit: durable.messageGroupMembershipPermit,
    executionClaim: durable.messageGroupMembershipOwnerClaim};
  // Before recording, all inputs come from the actual operation-row owner.
  // The after-COMMIT case instead tests redelivery of the original caller's
  // request, not an automatic scan of already-recorded operations.
  if (scenario !== 'record-answer-lost') assert.deepEqual(restored, cut.request);
  const originalRequest = scenario === 'record-answer-lost' ? cut.request : restored;
  const claim = {operationId: O, identity: restored.identity,
    expectedClaim: restored.executionClaim};""")
replace('test/test-helpers/learner-process-loss-worker.js',
    'readCommittedMembership(query(cut.request))',
    'readCommittedMembership(query(originalRequest))')
replace('test/test-helpers/learner-process-loss-worker.js',
    'recordMessageGroupLearnerOutcome(cut.request, read)',
    'recordMessageGroupLearnerOutcome(originalRequest, read)')
replace('test/test-helpers/learner-process-loss-worker.js',
    '  const request = {...cut.request, executionClaim: adopted.claim};',
    '  const request = {...originalRequest, executionClaim: adopted.claim};')
replace('test/test-helpers/learner-process-loss-worker.js',
    '    receipt: recovered.receipt, row: f.row(), nativeReads, proposals: native.proposals()});',
    """    receipt: recovered.receipt, row: f.row(), nativeReads, proposals: native.proposals(),
    recoveryInput: scenario === 'record-answer-lost' ? 'original-redelivery' : 'durable-row'});""")
