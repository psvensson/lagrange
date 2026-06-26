/**
 * Unit test: replace_remove_safety_blocked sub-reason decomposition.
 *
 * The deferReason is an umbrella over genuinely different roots; multiple
 * sessions mis-attributed the binding root because only the umbrella code was
 * surfaced. These pin the classifier + folding so a gate verdict stays
 * attributable: the dominant sub-reason per partition/run is the binding root.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  classifySubReason,
  parseSafetyBlockEvents,
  summarizeTarget,
} from '../../scripts/analyze-replace-safety-blocks.js';

test('classifySubReason maps each errorMessage family', async (t) => {
  t.equal(
    classifySubReason(
      'Quorum check failed: concurrent partition operation 28cec12a is active',
    ),
    'concurrent_op',
  );
  t.equal(
    classifySubReason('Quorum check failed: peer node 7493b0ab is uncontactable'),
    'uncontactable_peer',
  );
  t.equal(
    classifySubReason(
      'Priority control-plane partition sql_write_operations-p1 projected ' +
        'voter-ready spread would fall below the published requirement (2/3)',
    ),
    'spread_floor',
  );
  t.equal(
    classifySubReason(
      'Critical partition x replacement replica r5 is not voter-ready',
    ),
    'replacement_not_voter_ready',
  );
  t.equal(classifySubReason('something brand new'), 'other',
    'unrecognized messages fall to other so taxonomy drift is visible');
  t.equal(classifySubReason(undefined), 'other');
});

test('parseSafetyBlockEvents reads both log shapes and ignores noise', async (t) => {
  const lines = [
    JSON.stringify({
      reason: 'replace_remove_safety_blocked',
      partitionId: 'sql_transactions-p1',
      operationId: 'op-1',
      errorMessage: 'concurrent partition operation 50ad8b63 is active',
    }),
    // The same defer re-emitted on the dispatch-failure path (deferReason key).
    JSON.stringify({
      deferReason: 'replace_remove_safety_blocked',
      partitionId: 'sql_transactions-p1',
      operationId: 'op-1',
      errorMessage: 'concurrent partition operation 50ad8b63 is active',
    }),
    JSON.stringify({reason: 'some_other_reason', partitionId: 'x'}),
    'not json at all',
  ];
  const events = parseSafetyBlockEvents(lines);
  t.equal(events.length, 2, 'two safety-block events parsed (noise ignored)');
  t.equal(events[0].subReason, 'concurrent_op');
  t.equal(events[0].partitionId, 'sql_transactions-p1');
});

test('summarizeTarget folds to dominant sub-reason and dedups distinct ops', async (t) => {
  // sql_transactions-p1: one op deferred 5x on concurrent_op = the over-creation
  // standoff shape (high occurrences, few distinct ops). spread_floor on another
  // partition. Dominant (by distinct ops) is concurrent_op here only if ops tie —
  // construct so concurrent_op has 2 distinct ops vs spread_floor 1.
  const events = [
    {partitionId: 'sql_transactions-p1', subReason: 'concurrent_op', operationId: 'op-a'},
    {partitionId: 'sql_transactions-p1', subReason: 'concurrent_op', operationId: 'op-a'},
    {partitionId: 'sql_transactions-p1', subReason: 'concurrent_op', operationId: 'op-b'},
    {partitionId: 'replica_operations-p1', subReason: 'spread_floor', operationId: 'op-c'},
  ];
  const summary = summarizeTarget('run1', 3, events);
  t.equal(summary.dominantSubReason, 'concurrent_op',
    'dominant sub-reason is the one affecting the most distinct ops');
  t.equal(summary.totalOccurrences, 4);
  const sqlTx = summary.partitions.find(
    (p) => p.partitionId === 'sql_transactions-p1',
  );
  t.equal(sqlTx.dominantSubReason, 'concurrent_op');
  const concurrent = sqlTx.subReasons.find((s) => s.subReason === 'concurrent_op');
  t.equal(concurrent.occurrences, 3, 'raw occurrences counted');
  t.equal(concurrent.distinctOps, 2, 'distinct ops deduped (op-a counted once)');
});
