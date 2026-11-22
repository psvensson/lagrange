// A partition ADD (or a REPLACE naming both replicas) that asks for a specific
// physical replica identity is refused by the coordinator before any
// placement payload exists (line-regression-causes stage 2, item 6; the check
// came with merge 268d439b2). The refusal is a request-shape decision, a named
// state of its own (R07): it must not reuse placement_admission_bytes_invalid,
// the code for committed placement-command bytes that fail re-validation.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {PLACEMENT_ADMISSION_ERROR} from
  '../../src/partition/partition-placement-admission-constants.js';

const PARTITION_ID = 'tables-p1';

const REQUESTS = [
  ['ADD naming a replica identity', OperationType.ADD,
    {type: OperationType.ADD, nodeId: 'node-b', replicaId: 'replica-node-b-tables-p1'}],
  ['REPLACE naming source and target replicas', OperationType.REPLACE,
    {type: OperationType.REPLACE, nodeId: 'node-b', sourceReplicaId: 'tables-p1-r1',
      replicaId: 'tables-p1-r9'}],
];

for (const [name, normalizedMoveType, requestedMove] of REQUESTS) {
  test(`${name}: refused with its own typed code, not the corrupt-bytes code`, async () => {
    const createPartitionOperation =
      RebalanceCoordinator.prototype.createPartitionOperationViaPlacementAdmission;
    let refusal = null;
    try {
      await createPartitionOperation.call({}, {requestedMove, normalizedMoveType,
        partitionId: PARTITION_ID});
    } catch (error) {
      refusal = error;
    }
    assert.ok(refusal, 'the coordinator refuses the explicit physical replica identity');
    assert.equal(typeof refusal.code, 'string', 'a typed refusal');
    assert.ok(refusal.code.length > 0, 'a named code');
    assert.equal(refusal.admissionAnswer, null, 'refused before any placement payload');
    assert.notEqual(refusal.code, PLACEMENT_ADMISSION_ERROR.BYTES,
      'a request-shape refusal is not the committed-bytes refusal');
  });
}
