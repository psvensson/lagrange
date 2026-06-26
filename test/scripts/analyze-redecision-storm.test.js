import {test} from '../../src/test-helpers/tap.js';
import {
  parseStormEvents,
  median,
  classifyPartition,
  summarizeTarget,
} from '../../scripts/analyze-redecision-storm.js';

const OPTIONS = {settleMs: 5000, minDispatches: 5};

function dispatchLine(time, entityId) {
  return JSON.stringify({
    msg: 'Executing rebalancing move',
    reason: 'increase_replica_count',
    entityId,
    entityType: 'partition',
    time,
  });
}

function deficitLine(time, entityId) {
  return JSON.stringify({
    msg: 'Critical rebalancing state detected',
    reason: 'replica_count_below_minimum: 2 < 3',
    entityId,
    time,
  });
}

test('parseStormEvents extracts corrective ADD dispatches and deficits per partition', (t) => {
  const lines = [
    dispatchLine('2026-06-25T19:55:27.995Z', 'sql_write_operations-p1'),
    dispatchLine('2026-06-25T19:55:29.588Z', 'sql_write_operations-p1'),
    // a non-corrective move (different reason) must be ignored
    JSON.stringify({msg: 'Executing rebalancing move', reason: 'spread', entityId: 'x-p1', time: '2026-06-25T19:55:30.000Z'}),
    deficitLine('2026-06-25T19:55:26.403Z', 'sql_write_operations-p1'),
    'not json',
  ];
  const {dispatches, deficits} = parseStormEvents(lines);
  t.equal(dispatches.get('sql_write_operations-p1').length, 2);
  t.equal(dispatches.has('x-p1'), false, 'non-corrective reason is not counted');
  t.equal(deficits.get('sql_write_operations-p1').length, 1);
  t.end();
});

test('median handles even and odd lengths and empty', (t) => {
  t.equal(median([]), 0);
  t.equal(median([3, 1, 2]), 2);
  t.equal(median([4, 1, 2, 3]), 2.5);
  t.end();
});

test('classifyPartition flags RE_DECISION when cadence is below the settle window', (t) => {
  // five dispatches ~1s apart => median gap 1000ms << 5000ms settle => limit cycle.
  const base = Date.parse('2026-06-25T19:55:27.000Z');
  const stamps = [0, 1000, 2000, 3000, 4000].map((d) => base + d);
  const result = classifyPartition('sql_write_operations-p1', stamps, [base], OPTIONS);
  t.equal(result.verdict, 'RE_DECISION');
  t.equal(result.dispatches, 5);
  t.equal(result.medianGapMs, 1000);
  t.end();
});

test('classifyPartition stays BOUNDED when dispatches re-decide slower than settle', (t) => {
  // six dispatches a full settle window apart => not re-deciding against lagging state.
  const base = Date.parse('2026-06-25T19:55:27.000Z');
  const stamps = [0, 6000, 12000, 18000, 24000, 30000].map((d) => base + d);
  const result = classifyPartition('sql_transactions-p1', stamps, [], OPTIONS);
  t.equal(result.verdict, 'BOUNDED', 'gaps >= settle window are paced, not a storm');
  t.end();
});

test('classifyPartition stays BOUNDED below the dispatch-count floor', (t) => {
  const base = Date.parse('2026-06-25T19:55:27.000Z');
  const stamps = [0, 1000, 2000].map((d) => base + d); // only 3 < minDispatches
  const result = classifyPartition('x-p1', stamps, [], OPTIONS);
  t.equal(result.verdict, 'BOUNDED', 'a couple dispatches is not a sequence');
  t.end();
});

test('summarizeTarget rolls up to RE_DECISION when any partition storms', (t) => {
  const base = Date.parse('2026-06-25T19:55:27.000Z');
  const dispatches = new Map([
    ['sql_write_operations-p1', [0, 1000, 2000, 3000, 4000].map((d) => base + d)],
    ['quiet-p1', [base, base + 9000]],
  ]);
  const summary = summarizeTarget('run1', 3, dispatches, new Map(), OPTIONS);
  t.equal(summary.verdict, 'RE_DECISION');
  t.equal(summary.stormedPartitions, 1);
  t.equal(summary.partitions[0].partitionId, 'sql_write_operations-p1', 'sorted by dispatch count');
  t.end();
});
