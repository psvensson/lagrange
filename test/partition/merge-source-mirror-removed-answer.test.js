/**
 * Witness (B01 ruling N1): the merge owner's answer to an accepted
 * SOURCE_MIRROR_REMOVED acknowledgement is the acknowledgement result plus
 * `mergeCutoverApplied`, as before the 2026-11-26 checkpoint: it carries no
 * `mergeSourcesRetired` and no `terminalCustody` (no consumer reads either; the
 * merge source decides its terminal from the result alone). The dissolution
 * evidence is still finalized, once, before the answer.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ManagedMergeWorkflowExecutionGateMethods} from
  '../../src/partition/managed-merge-workflow-execution-gate-methods.js';
import {MERGE_ACK_STATUS} from '../../src/partition/merge-ack-constants.js';

const WORKFLOW = 'merge-orders';

test('an accepted SOURCE_MIRROR_REMOVED answers the result and mergeCutoverApplied only',
  async () => {
    const finalized = [];
    const accepted = {result: 'accepted', participantKey: 'merge-source:orders-p1',
      acknowledgedAt: 11};
    const self = Object.assign(Object.create(ManagedMergeWorkflowExecutionGateMethods.prototype), {
      logger: {warn() {}, error() {}},
      resolveWorkflowState: () => ({workflowId: WORKFLOW, status: 'merge_cutover_active',
        metadata: {}}),
      isMergeWorkflowStateUnavailable: () => false,
      workflowCoordinator: {acknowledgeParticipant: async () => accepted},
      finalizeMergeDissolutionEvidence: async (workflowId) => {
        finalized.push(workflowId);
        return Object.freeze({workflowId, family: 'merge'});
      },
    });
    const answer = await self.acknowledgeMergeSourceParticipant(WORKFLOW,
      {participantKey: accepted.participantKey, status: MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
        fenceToken: 3});
    assert.deepEqual(finalized, [WORKFLOW]);
    assert.deepEqual(answer, {...accepted, mergeCutoverApplied: true});
  });
