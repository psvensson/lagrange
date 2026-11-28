/**
 * Witness (B01 ruling N2): a split child descriptor write is confirmed only
 * when the mutation outcome owner (classifyControlPlaneMutationResult) counts
 * exactly one affected row. An answer whose outcome is UNKNOWN has no known
 * count, whatever its nested partition answer says, and is refused; the
 * ordinary nested and top-level answers stay accepted.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyManagedSplitWorkflowPersistenceMethods} from
  '../../src/partition/managed-split-workflow-persistence-methods.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';

const ROW = Object.freeze({partition_id: 'orders-left', table_id: 'tbl-orders'});

class PersistenceOwner {}
applyManagedSplitWorkflowPersistenceMethods(PersistenceOwner);

function owner(answer) {
  const submitted = [];
  const self = Object.assign(new PersistenceOwner(), {
    getControlPlaneSystemTableGateway: () => ({
      async submitMutation(mutation) {
        submitted.push(mutation);
        return answer;
      },
    }),
    buildManagedSplitMutationOptions: () => ({}),
  });
  return {self, submitted};
}

for (const [name, answer] of [
  ['a nested partition answer of one row', {success: true, partitionResult: {affectedRows: 1}}],
  ['a top-level answer of one row', {success: true, affectedRows: 1}],
]) {
  test(`${name} confirms the child descriptor write`, async () => {
    const {self, submitted} = owner(answer);
    await self.insertPartitionMetadata(ROW);
    assert.equal(submitted.length, 1);
  });
}

for (const [name, answer] of [
  ['an UNKNOWN outcome with a nested count of one', {success: true,
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.UNKNOWN, partitionResult: {affectedRows: 1}}],
  ['an answer without a count', {success: true}],
  ['an answer of zero rows', {success: true, partitionResult: {affectedRows: 0}}],
  ['a refused answer', {success: false, affectedRows: 1, error: 'refused'}],
]) {
  test(`${name} is refused split_child_descriptor_write_refused`, async () => {
    const {self} = owner(answer);
    await assert.rejects(self.insertPartitionMetadata(ROW),
      {code: 'split_child_descriptor_write_refused'});
  });
}
