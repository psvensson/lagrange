/**
 * Characterization of a split source acknowledgement the record refused
 * (managed-split-workflow-execution-gate-methods.js, acknowledgeSourceParticipant):
 * a DUPLICATE of the source failure the record already accepted dispatches its
 * abort again (the first reply may have been lost); every other refusal goes to
 * the dissolution redelivery. Written against the unchanged owner and kept green
 * across the extraction of that decision into a named predicate.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ManagedSplitWorkflowExecutionGateMethods} from
  '../../src/partition/managed-split-workflow-execution-gate-methods.js';
import {SPLIT_ACK_STATUS, SPLIT_PARTICIPANT_PREFIX} from '../../src/partition/split-ack-constants.js';

const WORKFLOW = 'split-orders';
const SOURCE_KEY = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
const FAILED = SPLIT_ACK_STATUS.SNAPSHOT_FAILED;

function owner(ackResult) {
  const calls = {aborted: [], redelivered: [], warned: []};
  const failure = {workflowId: WORKFLOW, participantKey: SOURCE_KEY, status: FAILED, fenceToken: 4};
  const self = Object.assign(Object.create(ManagedSplitWorkflowExecutionGateMethods.prototype), {
    logger: {warn: (message, fields) => calls.warned.push({message, fields}), error() {}},
    resolveWorkflowState: () => ({workflowId: WORKFLOW, status: 'split_backfilling',
      metadata: {splitSourceFailure: failure}}),
    isSplitWorkflowStateUnavailable: () => false,
    workflowCoordinator: {acknowledgeParticipant: async () => ackResult},
    abortSplitOnSourceFailure: async (workflowId, given) => {
      calls.aborted.push({workflowId, given});
    },
    resumeSplitDissolutionOnRedelivery: async (workflowId, result, ack) => {
      calls.redelivered.push({workflowId, result, ack});
    },
  });
  return {self, calls, failure};
}

const ackOf = (status, participantKey = SOURCE_KEY) => ({participantKey, status, fenceToken: 4});

test('a DUPLICATE of the accepted source failure dispatches its abort again', async () => {
  const {self, calls, failure} = owner({result: 'duplicate'});
  const answer = await self.acknowledgeSourceParticipant(WORKFLOW, ackOf(FAILED));
  assert.deepEqual(calls.aborted, [{workflowId: WORKFLOW, given: failure}]);
  assert.equal(calls.redelivered.length, 0);
  assert.equal(answer.result, 'duplicate');
  assert.equal(answer.splitCutoverApplied, false);
});

for (const [name, ackResult, ack] of [
  ['a DUPLICATE of another status', {result: 'duplicate'}, ackOf(SPLIT_ACK_STATUS.CLEANUP_COMPLETED)],
  ['a DUPLICATE of another participant', {result: 'duplicate'}, ackOf(FAILED, 'left-child')],
  ['a stale fence of the failure status', {result: 'stale_fence'}, ackOf(FAILED)],
]) {
  test(`${name} goes to the dissolution redelivery, no abort`, async () => {
    const {self, calls} = owner(ackResult);
    const answer = await self.acknowledgeSourceParticipant(WORKFLOW, ack);
    assert.equal(calls.aborted.length, 0);
    assert.deepEqual(calls.redelivered, [{workflowId: WORKFLOW, result: ackResult, ack}]);
    assert.equal(answer.result, ackResult.result);
  });
}
