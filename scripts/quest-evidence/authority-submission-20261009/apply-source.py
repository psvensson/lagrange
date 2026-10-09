from pathlib import Path

def edit(path, before, after):
    p = Path(path)
    text = p.read_text()
    assert text.count(before) == 1, (path, 'source anchor drift', before)
    p.write_text(text.replace(before, after))

p = 'src/node/message-group-service-handler.js'
edit(p, 'async handleMessage(envelope, delivery) {', 'async handleMessage(envelope, delivery, registration) {')
edit(p, 'readMessageGroupLearnerAtRecipient(this, payload, delivery);', 'readMessageGroupLearnerAtRecipient(this, payload, delivery, registration);')
edit(p, '    this.messageRouter = messageRouter;\n\n    const handlerAddress =', '''    // Retire only this instance's previous token. A successor at that address
    // belongs to its own owner and must survive delayed retirement.
    this.unregisterFromRouter(this.messageRouter);
    this.messageRouter = messageRouter;

    const handlerAddress =''')
edit(p, 'const response = await this.handleMessage(envelope, delivery);', 'const response = await this.handleMessage(envelope, delivery, registration);')
edit(p, '    this.registeredRouterHandler = routerHandler;', '''    const registration = Object.freeze({router: messageRouter, callback: routerHandler});
    this.registeredRouterHandler = routerHandler;''')
edit(p, '''    this.registeredRouterHandler = null;
    if (!messageRouter) {
      return;
    }''', '''    if (!messageRouter || messageRouter !== this.messageRouter) return;
    const registration = this.registeredRouterHandler;
    this.registeredRouterHandler = null;''')
edit(p, '''    if (isFunction(messageRouter.unregister)) {
      messageRouter.unregister(handlerAddress);
    }''', '''    if (isFunction(messageRouter.unregisterExact)) {
      messageRouter.unregisterExact(handlerAddress, registration);
    }''')

p = 'src/node/message-group-membership-recipient.js'
edit(p, '''function captureRecipient(handler, replicaId, delivery) {
  const router = handler.messageRouter;
  const registration = handler.registeredRouterHandler;''', '''function captureRecipient(handler, replicaId, delivery, invocation) {
  const router = invocation?.router;
  const registration = invocation?.callback;''')
edit(p, 'async function readOrigin(handler, request, delivery) {', 'async function readOrigin(handler, request, delivery, invocation) {')
edit(p, 'captureRecipient(handler, input.replicaId, delivery);', 'captureRecipient(handler, input.replicaId, delivery, invocation);')
edit(p, 'async function readMessageGroupLearnerAtRecipient(handler, request, delivery) {', 'async function readMessageGroupLearnerAtRecipient(handler, request, delivery, invocation) {')
edit(p, 'membership = await readOrigin(handler, request, delivery);', 'membership = await readOrigin(handler, request, delivery, invocation);')

p = 'src/rebalancer/operation-workflow-message-group-native-read.js'
edit(p, 'const {OPERATION_WORKFLOW_OWNER_LITERAL, REPLICA_OPERATION_DISPATCH_TIMEOUT_MS} =', 'const {OPERATION_WORKFLOW_OWNER_LITERAL} =')
edit(p, 'timeoutMs: REPLICA_OPERATION_DISPATCH_TIMEOUT_MS', 'timeoutMs: owner.replicaOperationDispatchTimeoutMs')
edit(p, '''  const recipient = Object.freeze({nodeId, replicaId});
  return owner.repository.recordMessageGroupLearnerOutcome(request,
    (query) => readAtRecipient(owner, recipient, query));''', '''  const recipient = Object.freeze({nodeId, replicaId});
  const epoch = owner.getOperationOwnershipFenceEpoch();
  // Captured before waiting for a turn; shutdown/reinitialization cannot lend
  // a queued invocation the next owner's authority. This is host-only and
  // never serialized into query options or taken from a payload.
  const canSubmit = () => !owner.isShuttingDown &&
    owner.getOperationOwnershipFenceEpoch() === epoch;
  return owner.runRetainedOperationOwnerAction(request?.operationId, () =>
    owner.repository.recordMessageGroupLearnerOutcome(request,
      (query) => readAtRecipient(owner, recipient, query), canSubmit))
    .then((answer) => answer?.outcome ? answer :
      Object.freeze({outcome: OUTCOME.UNAVAILABLE, operation: null}));''')

p = 'src/rebalancer/replica-operation-repository.js'
edit(p, '''  recordMessageGroupLearnerOutcome(request, readCommittedLearner) {
    return recordMessageGroupLearnerOutcome(this, request, readCommittedLearner);
  }''', '''  recordMessageGroupLearnerOutcome(request, readCommittedLearner, canSubmit) {
    return recordMessageGroupLearnerOutcome(this, request, readCommittedLearner, canSubmit);
  }''')

p = 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
edit(p, 'async function recordObservedLearner(repository, row, input, evidence) {', 'async function recordObservedLearner(repository, row, input, evidence, canSubmit) {')
edit(p, '[PHASE.LEARNER_COMMITTED, evidence.committedPermit, evidence.stamp, ...basis.params]);', '''[PHASE.LEARNER_COMMITTED, evidence.committedPermit, evidence.stamp, ...basis.params],
      {canSubmit: () => canSubmit() &&
        membershipClaimIsLocalAndLive(repository, input.claim, input.identity)});''')
edit(p, '''  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNKNOWN);
  const after = await observeMembershipOperation(repository, input.operationId);''', '''  // A submitted write may already have committed. Local retirement can only
  // stop further submissions; it cannot erase that fact or grant next actions.
  if (!canSubmit() || !await membershipBootIsCurrent(repository)) return result(OUTCOME.UNKNOWN);
  const after = await observeMembershipOperation(repository, input.operationId);''')
edit(p, '  const recorded = recordingBasisRefusal(repository, after.row, input) === null &&', '  const recorded = canSubmit() && recordingBasisRefusal(repository, after.row, input) === null &&')
edit(p, 'function finishLearnerRecording(repository, row, input, evidence) {', '''function finishLearnerRecording(repository, row, input, evidence, canSubmit) {
  if (!canSubmit()) return result(OUTCOME.UNAVAILABLE, row);''')
edit(p, 'return recordObservedLearner(repository, row, input, evidence);', 'return recordObservedLearner(repository, row, input, evidence, canSubmit);')
edit(p, '''async function recordMessageGroupLearnerOutcome(repository, request, readCommittedLearner) {
  const input = learnerRecordingInput(request);
  if (!input || typeof readCommittedLearner !== 'function') return result(OUTCOME.INVALID);''', '''async function recordMessageGroupLearnerOutcome(repository, request, readCommittedLearner,
  canSubmit = () => true) {
  const input = learnerRecordingInput(request);
  if (!input || typeof readCommittedLearner !== 'function' ||
    typeof canSubmit !== 'function') return result(OUTCOME.INVALID);
  if (!canSubmit()) return result(OUTCOME.UNAVAILABLE);''')
edit(p, '  const initialRefusal = recordingBasisRefusal(repository, before.row, input);', '''  if (!canSubmit()) return result(OUTCOME.UNAVAILABLE, before.row);
  const initialRefusal = recordingBasisRefusal(repository, before.row, input);''')
edit(p, 'return finishLearnerRecording(repository, current.row, input, evidence);', 'return finishLearnerRecording(repository, current.row, input, evidence, canSubmit);')

p = 'src/rebalancer/replica-operation-repository-mutation-gateway-methods.js'
edit(p, '''      while (true) {
        const queryOptions = this.buildOperationMutationQueryOptions(''', '''      while (true) {
        // Host-lifetime admission only. No await between this check and issuing
        // the attempt. A prior attempt can still commit; the caller owns exact
        // readback and must not turn retirement into definitive noncommitment.
        if (typeof options.canSubmit === 'function' && options.canSubmit() !== true) {
          return {success: false, admissionRefused: true};
        }
        const queryOptions = this.buildOperationMutationQueryOptions(''')
print('Prepared six source corrections; no full commit-authority claim.')
