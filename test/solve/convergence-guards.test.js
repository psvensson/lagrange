import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  detectCoupledOscillation,
  regressionRestoreStatus,
  scopeTerminalStatus,
} from '../../scripts/solve/convergence-guards.js';
import {projectInvariantLedger} from '../../scripts/solve/store.js';
import {SCOPE_PRESSURE_FILE_LIMIT} from '../../scripts/solve/constants.js';
import {stepTheoryGateProblems} from '../../scripts/solve/theory.js';

const FRONTIER = 'f-main';
const CLUSTER_A = ['publication_converged', 'priority_spread_settled'];
const CLUSTER_B = [
  'priority_recovery_bootstrap_ready',
  'priority_recovery_cluster_active',
  'priority_recovery_readyz_closed',
];

function measured(satisfiedInvariants, ts) {
  return {
    type: 'attempt',
    frontier: FRONTIER,
    metricAfter: 0,
    satisfiedInvariants,
    ts: ts || '2026-06-03T00:00:00.000Z',
  };
}

function regression(regressed, ts) {
  return {
    type: 'violation',
    scope: 'regression',
    frontier: FRONTIER,
    regressed,
    ts: ts || '2026-06-03T00:00:00.000Z',
  };
}

function finding(ts) {
  return {type: 'finding', frontier: FRONTIER, claim: 'abandoned on purpose', ts};
}

function regressionFinding(ts, labels = CLUSTER_A) {
  return {
    ...finding(ts),
    regressionClassification: {
      resolution: 'abandoned',
      labels,
    },
  };
}

tap.test('projectInvariantLedger tracks green high-water and current red', (t) => {
  const log = [
    measured([...CLUSTER_A]),
    measured([]),
  ];
  const ledger = projectInvariantLedger(log, FRONTIER);
  t.same(ledger.greenHighWater.sort(), [...CLUSTER_A].sort(), 'high-water is the union');
  t.same(ledger.currentRed.sort(), [...CLUSTER_A].sort(), 'all red on the latest run');
  t.same(ledger.regressedThisRun.sort(), [...CLUSTER_A].sort(), 'regressed this run');
  t.same(ledger.restoredThisRun, [], 'nothing restored this run');
  t.end();
});

tap.test('projectInvariantLedger ignores invalid samples', (t) => {
  const log = [
    measured([...CLUSTER_A]),
    {...measured([]), invalidSample: true},
  ];
  const ledger = projectInvariantLedger(log, FRONTIER);
  t.same(ledger.currentGreen.sort(), [...CLUSTER_A].sort(),
    'invalid sample does not move the ledger');
  t.same(ledger.currentRed, [], 'no regression from an invalid sample');
  t.end();
});

tap.test('detectCoupledOscillation: single A->B move does NOT qualify', (t) => {
  const log = [
    regression([...CLUSTER_A]),
    regression([...CLUSTER_B]),
  ];
  const result = detectCoupledOscillation(log, FRONTIER);
  t.equal(result.coupled, false, 'one swap with no revisit is ordinary whack-a-mole');
  t.equal(result.distinctFamilies, 2, 'two families seen');
  t.end();
});

tap.test('detectCoupledOscillation: A->B->A revisit qualifies', (t) => {
  const log = [
    regression([...CLUSTER_A]),
    regression([...CLUSTER_B]),
    regression([...CLUSTER_A]),
  ];
  const result = detectCoupledOscillation(log, FRONTIER);
  t.equal(result.coupled, true, 'a revisited family with >=2 transitions is coupling');
  t.equal(result.distinctFamilies, 2, 'exactly two coupled families');
  t.equal(result.swaps, 2, 'two family transitions');
  t.equal(result.clusters.length, 2, 'two clusters reported');
  t.end();
});

tap.test('detectCoupledOscillation: repeated same family is not coupling', (t) => {
  const log = [
    regression([...CLUSTER_A]),
    regression([...CLUSTER_A]),
    regression([...CLUSTER_A]),
  ];
  const result = detectCoupledOscillation(log, FRONTIER);
  t.equal(result.coupled, false, 'one persistent family is not an oscillation');
  t.equal(result.distinctFamilies, 1, 'single family');
  t.end();
});

tap.test('detectCoupledOscillation: a bridging regression merges families transitively', (t) => {
  const log = [
    regression(['a', 'b']),
    regression(['c', 'd']),
    regression(['b', 'c']),
  ];
  const result = detectCoupledOscillation(log, FRONTIER);
  t.equal(result.distinctFamilies, 1,
    'a set sharing labels with both prior families collapses all into one cluster');
  t.equal(result.coupled, false,
    'one transitively-connected cluster is not coupled oscillation');
  t.equal(result.clusters.length, 1, 'a single merged cluster is reported');
  t.same(result.clusters[0], ['a', 'b', 'c', 'd'], 'the cluster is the full label union');
  t.end();
});

tap.test('detectCoupledOscillation: empty regressed sets are dropped', (t) => {
  const log = [
    regression([]),
    {type: 'violation', scope: 'regression', frontier: FRONTIER},
  ];
  const result = detectCoupledOscillation(log, FRONTIER);
  t.equal(result.coupled, false, 'malformed/empty regressions cannot form a cluster');
  t.equal(result.distinctFamilies, 0, 'no families');
  t.end();
});

tap.test('regressionRestoreStatus: pending when red and no finding follows', (t) => {
  const log = [
    measured([...CLUSTER_A]),
    regression([...CLUSTER_A]),
    measured([]),
  ];
  const status = regressionRestoreStatus(log, FRONTIER);
  t.equal(status.pending, true, 'restore obligation is pending');
  t.same(status.redLabels.sort(), [...CLUSTER_A].sort(), 'names the red labels');
  t.equal(status.explained, false, 'not explained');
  t.end();
});

tap.test('regressionRestoreStatus: prose-only findings do not discharge regressions',
  (t) => {
    const log = [
      measured([...CLUSTER_A]),
      regression([...CLUSTER_A], '2026-06-03T01:00:00.000Z'),
      measured([]),
      finding('2026-06-03T02:00:00.000Z'),
    ];
    const status = regressionRestoreStatus(log, FRONTIER);
    t.equal(status.pending, true, 'a finding needs structured regression labels');
    t.equal(status.explained, false, 'not marked explained');
    t.end();
  });

tap.test('regressionRestoreStatus: discharged by a structured later finding (explain)', (t) => {
  const log = [
    measured([...CLUSTER_A]),
    regression([...CLUSTER_A], '2026-06-03T01:00:00.000Z'),
    measured([]),
    regressionFinding('2026-06-03T02:00:00.000Z'),
  ];
  const status = regressionRestoreStatus(log, FRONTIER);
  t.equal(status.pending, false, 'a structured finding after the regression discharges it');
  t.equal(status.explained, true, 'marked explained');
  t.end();
});

tap.test('regressionRestoreStatus: discharged by a re-greening run (restore)', (t) => {
  const log = [
    measured([...CLUSTER_A]),
    regression([...CLUSTER_A]),
    measured([]),
    measured([...CLUSTER_A]),
  ];
  const status = regressionRestoreStatus(log, FRONTIER);
  t.equal(status.pending, false, 'restoring all red labels discharges the obligation');
  t.same(status.redLabels, [], 'nothing red');
  t.end();
});

tap.test('scopeTerminalStatus: crosses the file bound', (t) => {
  const under = scopeTerminalStatus({
    changedPaths: Array.from({length: SCOPE_PRESSURE_FILE_LIMIT}, (_, i) => `f${i}.js`),
  });
  t.equal(under.terminal, false, 'at the limit is not terminal');
  const over = scopeTerminalStatus({
    changedPaths: Array.from({length: SCOPE_PRESSURE_FILE_LIMIT + 1}, (_, i) => `f${i}.js`),
  });
  t.equal(over.terminal, true, 'one past the limit is terminal');
  t.equal(over.fileCount, SCOPE_PRESSURE_FILE_LIMIT + 1, 'reports the file count');
  t.end();
});

tap.test('scopeTerminalStatus: tolerates a missing scope-pressure object', (t) => {
  t.same(scopeTerminalStatus(null), {terminal: false, fileCount: 0}, 'null is safe');
  t.same(scopeTerminalStatus({}), {terminal: false, fileCount: 0}, 'empty is safe');
  t.end();
});

tap.test('golden replay: the real rolling-restart log trips coupled oscillation', (t) => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const logPath = path.resolve(
    here, '../../solve/log/rolling-restart-core-stability.ndjson');
  const log = fs.readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
  const frontierId = 'rolling-restart-core-stability-main';

  const result = detectCoupledOscillation(log, frontierId);
  t.equal(result.coupled, true,
    'the recorded A/B/A regression history is recognised as coupling');
  t.ok(result.distinctFamilies >= 2, 'at least two coupled families');
  t.ok(result.swaps >= 2, 'multiple family transitions recorded');

  const restore = regressionRestoreStatus(log, frontierId);
  t.same(restore.redLabels.sort(),
    [
      'priority_recovery_bootstrap_ready_allows_join_during_priority_recovery',
      'priority_recovery_cluster_active_requires_publication_convergence_and_priority_spread',
      'priority_recovery_readyz_closed_during_priority_recovery',
    ].sort(),
    'the latest measured run still leaves cluster B red');
  t.equal(restore.explained, false,
    'legacy prose findings no longer discharge the restore obligation');
  t.equal(restore.pending, true, 'so a structured restore-or-explain move is owed');
  t.end();
});

function emptyState() {
  return {
    theories: {
      system: [],
      frontier: [],
      selectedByFrontier: {},
      byId: {},
    },
  };
}

const GATE_BASE = {
  state: emptyState(),
  frontierId: FRONTIER,
  rungIndex: 0,
  theoryRef: null,
  modelRef: null,
  modelNotApplicable: false,
};

tap.test('gate rr-D: coupled oscillation demands a system theory', (t) => {
  const log = [
    regression([...CLUSTER_A]),
    regression([...CLUSTER_B]),
    regression([...CLUSTER_A]),
  ];
  const problems = stepTheoryGateProblems({...GATE_BASE, log, state: emptyState()});
  t.ok(problems.some((p) => p.includes('coupled-invariant oscillation')),
    'the coupling routes the next move to a reconciling system theory');
  t.end();
});

tap.test('gate rr-C: a pending regression pins the next begin move to restore-or-explain',
  (t) => {
    const log = [
      measured([...CLUSTER_A]),
      regression([...CLUSTER_A]),
      measured([]),
    ];
    const begin = stepTheoryGateProblems(
      {...GATE_BASE, log, state: emptyState(), phase: 'begin'});
    t.ok(begin.some((p) => p.includes('restore previously-green invariant')),
      'the begin gate demands a restore-or-explain move');
    const commit = stepTheoryGateProblems(
      {...GATE_BASE, log, state: emptyState(), phase: 'commit'});
    t.notOk(commit.some((p) => p.includes('restore previously-green invariant')),
      'the commit phase does not retroactively invalidate the exposing attempt');
    t.end();
  });

tap.test('gate rr-E: a terminal scope bound blocks the next begin move', (t) => {
  const log = [measured([...CLUSTER_A])];
  const blocked = stepTheoryGateProblems(
    {...GATE_BASE, log, state: emptyState(), phase: 'begin', scopeTerminal: true});
  t.ok(blocked.some((p) => p.includes('scope pressure terminal')),
    'crossing the file bound demands a scope reduction first');
  const allowed = stepTheoryGateProblems(
    {...GATE_BASE, log, state: emptyState(), phase: 'begin', scopeTerminal: false});
  t.notOk(allowed.some((p) => p.includes('scope pressure terminal')),
    'under the bound there is no scope gate');
  t.end();
});
