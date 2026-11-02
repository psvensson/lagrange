// Quest fresh-create-failure-after-committed-admission(-v2), link L2: the
// create-admission authority read of the committed replica_operations row
// types a refused read as DEFERRED and carries the read's own outcome and
// error text, so a refusing projection is named, not inferred.
//
// R09 (quest fresh-create-release-authority-from-committed-operation): the two
// pending-token witnesses this file held are superseded with the token itself.
// The typed, retried create-admission unavailability is now decided by the
// answering leader from the committed create operation and witnessed by
// test/partition/fresh-create-release-authority-cross-node.integration.test.js
// tests 4a and 4b (and by the induced-unavailability native witness).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  CREATE_ADMISSION_ERROR_CODE,
  ReplicaCreateAdmissionOwner,
} from '../../src/node/replica-create-admission-owner.js';

const NODE_ID = 'fresh-authority-node';
const OPERATION_ID = 'c44b07a7-c09a-4925-9181-7729739b677a';
const ROUTING_REFUSAL = Object.freeze({success: false, outcome: 'owner_not_ready',
  error: 'all_services_filtered_by_readiness'});

test('L2: readOperation carries the authority read outcome and error on its typed deferral',
  async () => {
    const owner = new ReplicaCreateAdmissionOwner({nodeId: NODE_ID, gateway: {
      async readAuthoritativeRows() {
        return ROUTING_REFUSAL;
      },
    }});
    await assert.rejects(owner.readOperation(OPERATION_ID), (error) => {
      assert.equal(error.code, CREATE_ADMISSION_ERROR_CODE.DEFERRED);
      assert.equal(error.deferRetry, true);
      assert.equal(error.authorityOutcome, ROUTING_REFUSAL.outcome);
      assert.equal(error.authorityError, ROUTING_REFUSAL.error);
      return true;
    });
    const cause = new Error('owner rpc transport refused');
    const throwing = new ReplicaCreateAdmissionOwner({nodeId: NODE_ID, gateway: {
      async readAuthoritativeRows() {
        throw cause;
      },
    }});
    await assert.rejects(throwing.readOperation(OPERATION_ID), (error) => {
      assert.equal(error.cause, cause);
      assert.equal(error.authorityError, cause.message);
      return true;
    });
  });
