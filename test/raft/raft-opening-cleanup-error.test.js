import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isRaftOpeningFailure, withRaftOpeningCleanupFailure} from '../../src/raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from '../../src/raft/raft-operation-port-constants.js';

test('startup cleanup custody: immutable primary errors retain metadata without reclassifying ordinary failures', () => {
  const consensus = Object.freeze({outcome: OUTCOME.HOST_FAILURE, retryAfterMs: 39});
  const primary = Object.freeze(Object.assign(new Error('original refusal'), {
    code: 'original-startup-code', phase: 'original-phase', consensus,
    replicaId: 'original-replica', groupId: 'original-group',
  }));
  const secondary = new Error('secondary release error');
  const result = withRaftOpeningCleanupFailure(primary, secondary);
  assert.equal(result.cause, primary);
  assert.deepEqual(result.errors, [primary, secondary]);
  assert.equal(result.message, primary.message);
  assert.equal(result.consensus, consensus);
  assert.equal(result.code, primary.code);
  assert.equal(result.phase, primary.phase);
  assert.equal(result.replicaId, primary.replicaId);
  assert.equal(result.groupId, primary.groupId);
  assert.equal(isRaftOpeningFailure(result), true);
  const ordinary = new Error('ordinary startup error');
  const combined = withRaftOpeningCleanupFailure(ordinary, secondary);
  assert.equal(combined.cause, ordinary);
  assert.equal(isRaftOpeningFailure(combined), false);
  assert.equal(combined.message, ordinary.message);
});
