// A placement attempt whose entry key already holds another record is kept
// (its command can never settle there) and must be VISIBLE as blocked work:
// a typed, named state in the placement owner's diagnostic, naming the entry
// id and the colliding record's class, warned once - not once per pass. Its
// release condition is owned, not automatic: the intent changes (a fresh
// attempt and entry id) or an operator acts.
//
// REAL: the replica_operations-p1 PartitionService and its committed apply
// path, the native admission request (owner-command prelude), the outcome
// owner's record class, the placement owner's attempt store. DOUBLES: the
// consensus port (the test commits), the node authority and cache (unused by
// a direct admission), the logger (records warnings).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {PLACEMENT_ADMISSION_ERROR} from
  '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {PARTITION_COMMITTED_RECORD_CLASS} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';
import {PLACEMENT_ATTEMPT_STATE} from
  '../../src/rebalancer/replica-placement-owner-attempts.js';
import {clearFixtureSingletons, resetFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {NODE, commitLedgerStatement, onLedgerLeader, placementStatement} from
  '../partition/placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const ATTEMPT_KEY = 'admit:tables-p1';
const ATTEMPT_ROW_SQL =
  'SELECT entry_id FROM _placement_owner_unresolved_attempts WHERE attempt_key = ?';

test('a kept attempt blocked on an entry-key collision is typed blocked work in the ' +
  'owner diagnostic, warned once, and stays durable', () =>
  onLedgerLeader(async (leader) => {
    const warnings = [];
    const logger = {debug() {}, info() {}, error() {},
      warn: (message, fields) => warnings.push({message, fields})};
    const answers = [];
    let collidingEntryId = null;
    const owner = createReplicaPlacementOwner({
      nodeId: 'blocked-attempt-node', ledgerPartitionService: leader,
      nodeAuthority: {answerCommittedNodes: () => null, scheduleRefresh() {},
        subscribe: () => () => {}},
      systemTableCache: {getAll: () => [], onCacheApplyChange() {}, offCacheApplyChange() {}},
      now: () => 0, logger,
      admitPlacement: async (payload) => {
        if (collidingEntryId === null) {
          // An SQL statement settles first under the attempt's entry key.
          collidingEntryId = payload.entryId;
          assert.equal(commitLedgerStatement(leader, payload.entryId,
            'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
            [1, 'none']), null);
        }
        const answer = await requestPlacementAdmission(leader, payload);
        answers.push(answer);
        return answer;
      },
    });
    const statement = placementStatement({partitionId: 'tables-p1', target: NODE.B});
    try {
      owner.setLeader(true);
      await owner.awaitCurrentWorkIdle();
      await owner.submitAdmission(statement);
      await owner.submitAdmission(statement);
      assert.deepEqual(answers.map((answer) => answer.failureCode),
        [PLACEMENT_ADMISSION_ERROR.BYTES, PLACEMENT_ADMISSION_ERROR.BYTES],
        'the same attempt re-requests under the same entry and meets the collision');
      assert.deepEqual(owner.blockedPlacementAttempts(), [{
        state: PLACEMENT_ATTEMPT_STATE.BLOCKED_ON_KEY_COLLISION, attemptKey: ATTEMPT_KEY,
        entryId: collidingEntryId, recordClass: PARTITION_COMMITTED_RECORD_CLASS.STATEMENT,
      }], 'the blocked attempt is a typed, named state');
      assert.equal(warnings.length, 1, 'one warning for the blocked attempt, not one per pass');
      assert.equal(warnings[0].fields.entryId, collidingEntryId);
      assert.equal(warnings[0].fields.recordClass, PARTITION_COMMITTED_RECORD_CLASS.STATEMENT);
      assert.equal(leader.db.prepare(ATTEMPT_ROW_SQL).get(ATTEMPT_KEY)?.entry_id,
        collidingEntryId, 'the attempt stays durable: nothing retires it automatically');
    } finally {
      owner.shutdown();
    }
  }));
