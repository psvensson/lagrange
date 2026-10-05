/**
 * Witnesses for the automatic split/merge policy (hysteresis, minimum
 * durable age, no-signal rule) and for the re-drive of outstanding durable
 * split proposals.
 *
 * The policy witnesses run the REAL PartitionSplitMergeManager against the
 * REAL managed-split metrics provider on an injected clock
 * (split-merge-load-simulation.js). The defect they pin: auto-merge undid
 * every split seconds after it completed (a fresh child's first QPM sample
 * read 0, the merge loop re-sampled a partition microseconds after the split
 * loop and read a zero delta, and nothing gated on age), so splits and
 * merges flapped continuously, even under sustained load.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PartitionSplitMergeManager,
} from '../../src/partition/partition-split-merge-manager.js';
import {
  PARTITION_TRANSITION_STATE,
  SPLIT_MERGE_DEFAULT,
  SPLIT_MERGE_REASON,
} from '../../src/partition/partition-constants.js';
import {
  describeOutstandingSplitProposal,
} from '../../src/partition/partition-split-merge-manager-proposal-methods.js';
import {
  parseTablePartitionTransition,
} from '../../src/partition/partition-transition-row.js';
import {
  defineTableCreationSplitMergeCoordination,
} from '../../src/query/table-creation-service-split-merge-coordination.js';
import {
  SQLQueryEnginePartitionRoutingReadiness,
} from '../../src/query/sql-query-engine-partition-routing-readiness.js';
import {
  createSQLQueryEngineTableRoutingMethods,
} from '../../src/query/sql-query-engine-table-routing-methods.js';
import {TABLES} from '../../src/constants/index.js';
import {
  MINUTE_MS,
  SECOND_MS,
  createSplitMergeSimulation,
} from './split-merge-load-simulation.js';

const MIN_AGE_MS = SPLIT_MERGE_DEFAULT.MERGE_MINIMUM_PARTITION_AGE_MS;
const WINDOW_MS = SPLIT_MERGE_DEFAULT.TRAFFIC_WINDOW_MS;
const LIGHT_QPM = 20;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'sim-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Collect the merge-ineligibility reasons each evaluation reports.
 * @return {{reasons: Set<string>, onEvaluation: Function}}
 */
function collectIneligibleReasons() {
  const reasons = new Set();
  return {
    reasons,
    onEvaluation(results) {
      for (const entry of results.mergeIneligible || []) {
        reasons.add(entry.reason);
      }
    },
  };
}

test('W1: an explicit split of a small table is not merged back before the ' +
  'minimum durable age, however often the debounced evaluation fires',
async (t) => {
  const log = collectIneligibleReasons();
  const sim = createSplitMergeSimulation({onEvaluation: log.onEvaluation});
  t.equal(MIN_AGE_MS, 10 * MINUTE_MS, 'default minimum merge age is 10 min');
  t.equal(sim.manager.mergeMinimumAgeMs, MIN_AGE_MS);

  await sim.splitRequest(sim.rows[0].partition_id);
  // Light writes: the reactive evaluation fires every simulated second.
  await sim.run(MIN_AGE_MS / SECOND_MS - 1, () => LIGHT_QPM);

  t.equal(sim.partitionCount(), 2, 'both children are still present');
  t.equal(sim.count('merge'), 0, 'no merge was proposed');
  t.ok(log.reasons.has('partition_below_minimum_age'),
    'the decision log names the age gate');
  sim.manager.shutdown();
});

test('W2: after the minimum age and a full window of genuinely low load, ' +
  'the merge IS proposed', async (t) => {
  const sim = createSplitMergeSimulation();
  const splitAtMs = sim.now();
  await sim.splitRequest(sim.rows[0].partition_id);
  await sim.run(MIN_AGE_MS / SECOND_MS + 5, () => LIGHT_QPM);

  t.equal(sim.count('merge'), 1, 'exactly one merge');
  const merge = sim.events.find((event) => event.kind === 'merge');
  t.ok(merge.atMs - splitAtMs >= MIN_AGE_MS,
    'not before the minimum age');
  t.ok(merge.atMs - splitAtMs <= MIN_AGE_MS + 2 * SECOND_MS,
    'promptly once the age and the window are satisfied');
  t.equal(sim.partitionCount(), 1);
  sim.manager.shutdown();
});

test('W3: no observations is not low load - an old pair with zero samples ' +
  'is not merge-eligible until a full window is observed', async (t) => {
  const log = collectIneligibleReasons();
  const sim = createSplitMergeSimulation({onEvaluation: log.onEvaluation});
  await sim.splitRequest(sim.rows[0].partition_id);
  // Both children are far past the minimum age, but this manager (and its
  // QPM authority) has never observed them.
  sim.advance(2 * MIN_AGE_MS);
  sim.restartManager();

  await sim.run(WINDOW_MS / SECOND_MS - 1, () => 1);
  t.equal(sim.count('merge'), 0, 'zero/partial samples never merge');
  t.ok(log.reasons.has('traffic_signal_unavailable'),
    'the decision log names the missing signal');
  t.notOk(log.reasons.has('partition_below_minimum_age'),
    'the pair is past the age gate');

  await sim.run(3, () => 1);
  t.equal(sim.count('merge'), 1, 'a full low window then merges');
  sim.manager.shutdown();
});

test('W4: oscillating load does not flap - at most one split and zero merges ' +
  'over the cool-down horizon', async (t) => {
  for (const pattern of [
    {name: '1200 QPM 30 s / idle 30 s', on: 30, qpm: 1200},
    {name: '1500 QPM 2 min / idle 2 min', on: 120, qpm: 1500},
  ]) {
    const sim = createSplitMergeSimulation();
    await sim.run(MIN_AGE_MS / SECOND_MS, (elapsedMs) =>
      (Math.floor(elapsedMs / (pattern.on * SECOND_MS)) % 2 === 0 ?
        pattern.qpm :
        0));
    t.ok(sim.count('split') <= 1, `${pattern.name}: splits ` +
      `${sim.count('split')} <= 1`);
    t.equal(sim.count('merge'), 0, `${pattern.name}: no merge`);
    sim.manager.shutdown();
  }
});

test('W5: a just-merged partition does not re-split on a stale signal; it ' +
  'splits only after a full window of its own observations', async (t) => {
  const sim = createSplitMergeSimulation();
  await sim.splitRequest(sim.rows[0].partition_id);
  // Step until the merge lands (whenever the policy allows it) ...
  for (let second = 0; sim.count('merge') === 0 &&
      second < MIN_AGE_MS / SECOND_MS + 30; second += 1) {
    await sim.run(1, () => LIGHT_QPM);
  }
  t.equal(sim.count('merge'), 1, 'merged');
  // ... then a burst starting at the moment of the merge.
  const burstStartMs = sim.now();
  await sim.run(2 * WINDOW_MS / SECOND_MS, () => 3000);
  const resplit = sim.events.filter((event) =>
    event.kind === 'split' && event.atMs > burstStartMs);
  t.ok(resplit.length >= 1, 'a sustained burst does split again');
  t.ok(resplit[0].atMs - burstStartMs >= WINDOW_MS,
    'but only after one full window observed on the merged partition ' +
    `(re-split ${resplit[0].atMs - burstStartMs} ms after the merge)`);
  sim.manager.shutdown();
});

test('W6: a manager restart mid cool-down keeps the DURABLE age - no merge ' +
  'before created_at + minimum age, and the merge lands then (not restart + ' +
  'minimum age)', async (t) => {
  const sim = createSplitMergeSimulation();
  const splitAtMs = sim.now();
  await sim.splitRequest(sim.rows[0].partition_id);
  await sim.run(5 * MINUTE_MS / SECOND_MS, () => LIGHT_QPM);
  sim.restartManager();
  await sim.run((MIN_AGE_MS - 5 * MINUTE_MS) / SECOND_MS - 1, () => LIGHT_QPM);
  t.equal(sim.count('merge'), 0, 'still not eligible after the restart');
  await sim.run(5, () => LIGHT_QPM);
  t.equal(sim.count('merge'), 1, 'eligible on the durable age');
  const merge = sim.events.find((event) => event.kind === 'merge');
  t.ok(merge.atMs - splitAtMs < MIN_AGE_MS + 10 * SECOND_MS,
    'the age counted from partitions.created_at, not from the restart');
  sim.manager.shutdown();
});

test('hysteresis: a merge threshold is clamped under the split threshold of ' +
  'its dimension (an inverted policy cannot merge into a split candidate)',
async (t) => {
  const manager = new PartitionSplitMergeManager();
  const policy = {splitTrafficThreshold: 300, mergeTrafficThreshold: 200};
  const half = (qpm) => ({sizeBytes: 1024, queriesPerMinute: qpm});
  t.notOk(manager.evaluateMergeCriteria('l', 'r', half(80), half(80), policy),
    'combined 160 QPM exceeds 0.5 x 300 = 150: not merge-eligible');
  t.ok(manager.evaluateMergeCriteria('l', 'r', half(70), half(70), policy),
    'combined 140 QPM is under the clamped threshold');
  t.notOk(manager.evaluateMergeCriteria('l', 'r',
    {sizeBytes: 1024, queriesPerMinute: null}, half(0), {}),
  'a pair with no traffic signal is never within the merge threshold');
  t.notOk(manager.evaluateSplitCriteria('p',
    {sizeBytes: 1024, queriesPerMinute: null}, {splitTrafficThreshold: 1}),
  'no traffic signal never splits on traffic');
  manager.shutdown();
});

// --- Outstanding durable split proposals (BLOCKED explicit split) ---

const SOURCE_ID = 'tbl-x-p1';

function buildBlockedTableRow(retry) {
  return {
    table_id: 'tbl-x',
    table_name: 'x',
    partition_transition_state: PARTITION_TRANSITION_STATE.BLOCKED,
    partition_transition_metadata: JSON.stringify({
      workflowId: `split-tbl-x-${SOURCE_ID}-v2`,
      sourcePartitionId: SOURCE_ID,
      admission: {blockingReasons: ['source_quorum_not_routable']},
      retry,
    }),
  };
}

function buildProposalManager(proposal, executed) {
  return new PartitionSplitMergeManager({
    pressureGovernor: {configure() {}, evaluate: () => ({action: 'allow'})},
    listPartitions: () => [{
      partition_id: SOURCE_ID,
      table_id: 'tbl-x',
      partition_key_start: null,
      partition_key_end: null,
      size_bytes: 4096,
      created_at: 1,
    }],
    getPartitionMetrics: () => ({sizeBytes: 4096, queriesPerMinute: null}),
    listOutstandingSplitProposals: () => [{...proposal, localLeader: true}],
    executeSplitCandidate: async (partitionId) => {
      executed.push(partitionId);
      return {success: true};
    },
  });
}

test('W7a: a BLOCKED explicit split (source_quorum_not_routable) whose retry ' +
  'is due is re-driven by the manager although the partition is far below ' +
  'every split threshold', async (t) => {
  const nowMs = Date.now();
  const proposal = describeOutstandingSplitProposal(
    parseTablePartitionTransition(buildBlockedTableRow({
      attemptCount: 1,
      nextAttemptAt: new Date(nowMs - 1).toISOString(),
    })),
    {tableId: 'tbl-x', nowMs},
  );
  t.same(
    {partitionId: proposal.partitionId, retryDue: proposal.retryDue,
      blockingReasons: proposal.blockingReasons},
    {partitionId: SOURCE_ID, retryDue: true,
      blockingReasons: ['source_quorum_not_routable']},
    'the durable BLOCKED record describes the outstanding proposal',
  );
  const executed = [];
  const manager = buildProposalManager(proposal, executed);
  const results = await manager.evaluateAllPartitions();
  t.same(executed, [SOURCE_ID], 'the proposal is re-driven');
  t.same(results.splitCandidates, [SOURCE_ID]);
  manager.shutdown();
});

test('W7b: a not-yet-due proposal arms the deferred retry at the record\'s ' +
  'own nextAttemptAt and is not executed early', async (t) => {
  const nowMs = Date.now();
  const nextAttemptAt = new Date(nowMs + 60_000).toISOString();
  const proposal = describeOutstandingSplitProposal(
    parseTablePartitionTransition(buildBlockedTableRow({
      attemptCount: 2, nextAttemptAt,
    })),
    {tableId: 'tbl-x', nowMs},
  );
  const executed = [];
  const manager = buildProposalManager(proposal, executed);
  await manager.evaluateAllPartitions();
  t.same(executed, [], 'not executed before the record is due');
  t.equal(manager.getEvaluationDiagnostics().deferredRetryEvaluationDueAtMs,
    Date.parse(nextAttemptAt), 'the re-drive is armed for the due time');
  manager.shutdown();
});

test('W7c: a proposal that spent its attempt bound is reported as a spent ' +
  'wait naming what was awaited and its last state, and not re-driven',
async (t) => {
  const nowMs = Date.now();
  const proposal = describeOutstandingSplitProposal(
    parseTablePartitionTransition(buildBlockedTableRow({
      attemptCount: SPLIT_MERGE_DEFAULT.OUTSTANDING_SPLIT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(nowMs - 1).toISOString(),
    })),
    {tableId: 'tbl-x', nowMs},
  );
  const executed = [];
  const lines = [];
  const manager = buildProposalManager(proposal, executed);
  manager.logger = {
    debug() {}, info() {}, warn() {},
    error: (message, context) => lines.push({message, context}),
  };
  await manager.evaluateAllPartitions();
  t.same(executed, [], 'the spent proposal is not re-driven');
  const spent = lines.find((line) =>
    line.context?.event === 'wait_bound_spent');
  t.ok(spent, 'one wait_bound_spent line');
  t.equal(spent.context.wait, 'outstanding_split_proposal_attempts');
  t.match(spent.context.awaited, /split admission/u);
  t.same(spent.context.lastObserved.blockingReasons,
    ['source_quorum_not_routable']);
  t.equal(spent.context.lastObserved.state, PARTITION_TRANSITION_STATE.BLOCKED);
  manager.shutdown();
});

test('W7d: the proposal\'s tables-row write and its source partition\'s ' +
  'row change wake the manager; other partitions do not', async (t) => {
  class CoordinationProbe {}
  defineTableCreationSplitMergeCoordination(CoordinationProbe);
  const probe = new CoordinationProbe();
  const tableRow = buildBlockedTableRow({
    attemptCount: 1,
    nextAttemptAt: new Date(Date.now() + 5000).toISOString(),
  });
  const requests = [];
  probe.tablePolicyByTableId = new Map();
  probe.partitionSizeByPartitionId = new Map();
  probe.logger = {debug() {}};
  probe.systemCache = {
    get: (tableName, key) =>
      (tableName === TABLES.TABLES && key === 'tbl-x' ? tableRow : null),
  };
  probe.partitionSplitMergeManager = {
    requestEvaluation: (context) => requests.push(context),
  };

  probe.onSystemTableCacheChange(TABLES.TABLES, 'UPDATE', tableRow);
  t.same(requests, [{
    reasonCode: SPLIT_MERGE_REASON.OUTSTANDING_SPLIT_PROPOSAL,
    partitionId: SOURCE_ID,
  }], 'the tables-row write of the proposal wakes the manager');

  requests.length = 0;
  probe.onSystemTableCacheChange(TABLES.PARTITIONS, 'UPDATE', {
    partition_id: SOURCE_ID, table_id: 'tbl-x', leader_node_id: 'n1',
  });
  t.same(requests.map((request) => request.reasonCode),
    [SPLIT_MERGE_REASON.OUTSTANDING_SPLIT_PROPOSAL],
    'the source partition\'s leader row change wakes the manager');

  requests.length = 0;
  probe.onSystemTableCacheChange(TABLES.PARTITIONS, 'UPDATE', {
    partition_id: 'tbl-x-other', table_id: 'tbl-x', leader_node_id: 'n1',
  });
  t.same(requests, [], 'another partition\'s row change does not');
});

test('W7e: the engine lists every outstanding split proposal from the tables ' +
  'rows, with local-leader ownership; merges and clean rows are not ' +
  'proposals', async (t) => {
  const nowMs = Date.now();
  const rows = {
    [TABLES.TABLES]: [
      buildBlockedTableRow({attemptCount: 1,
        nextAttemptAt: new Date(nowMs - 1).toISOString()}),
      {table_id: 'tbl-clean', partition_transition_state: null},
      {
        table_id: 'tbl-merge',
        partition_transition_state: PARTITION_TRANSITION_STATE.BLOCKED,
        partition_transition_metadata: JSON.stringify({
          sourcePartitionIds: ['a', 'b'],
        }),
      },
    ],
    [TABLES.PARTITIONS]: [
      {partition_id: SOURCE_ID, table_id: 'tbl-x', leader_node_id: 'me'},
    ],
  };
  const engine = Object.create(SQLQueryEnginePartitionRoutingReadiness.prototype);
  engine.isLocalManagedSplitLeader =
    createSQLQueryEngineTableRoutingMethods().isLocalManagedSplitLeader.value;
  engine.nodeId = 'me';
  engine.nowFn = () => nowMs;
  engine.systemCache = {getAll: (tableName) => rows[tableName] || []};
  const proposals = engine.listOutstandingManagedSplitProposals();
  t.equal(proposals.length, 1);
  t.equal(proposals[0].partitionId, SOURCE_ID);
  t.equal(proposals[0].localLeader, true);
  t.equal(proposals[0].retryDue, true);
});
