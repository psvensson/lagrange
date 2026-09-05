/**
 * Local seed-starvation gate: exit status follows the formation verdict and
 * the seed budget only; a missing report or verdict is red, never green.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  GATE_OUTCOME,
  decideSeedBudgetGate,
  newestFormationOnlyReport,
  runFormationSeedBudgetGate,
} from '../../scripts/checks/run-formation-seed-budget.js';

function verdictReport(verdict, seedStarved) {
  return {
    scenario: 'movielens-lagrange-formation-only-live',
    formationVerdict: {
      verdict, reason: 'schema_admitted', seedStarved,
      budget: {maxBlockedMs: 10000, maxBlockedPercent: 25, machineFactor: 1},
      causalChain: [
        {stage: 'seed_event_loop', broken: seedStarved, detail: 'gaps'},
        {stage: 'schema_admission', broken: verdict !== 'PASS', detail: 'x'},
      ],
    },
  };
}

test('decideSeedBudgetGate follows the verdict then the seed budget', (t) => {
  t.same(decideSeedBudgetGate(null).outcome, GATE_OUTCOME.REPORT_MISSING);
  t.same(decideSeedBudgetGate({}).outcome, GATE_OUTCOME.VERDICT_MISSING);
  t.same(
    decideSeedBudgetGate(verdictReport('FAIL', true)).outcome,
    GATE_OUTCOME.VERDICT_NOT_PASS,
  );
  t.same(
    decideSeedBudgetGate(verdictReport('UNKNOWN', null)).outcome,
    GATE_OUTCOME.VERDICT_NOT_PASS,
  );
  t.same(
    decideSeedBudgetGate(verdictReport('PASS', true)).outcome,
    GATE_OUTCOME.SEED_STARVED,
  );
  const green = decideSeedBudgetGate(verdictReport('PASS', false));
  t.same(green.outcome, GATE_OUTCOME.PASS);
  t.equal(green.ok, true);
  t.end();
});

test('the gate runs the formation-only demo behind the thermal gate and reads ' +
  'the newest formation-only report', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-budget-'));
  const reportDir = path.join(root, 'test-output/reports');
  fs.mkdirSync(reportDir, {recursive: true});
  const calls = [];
  const lines = [];
  const run = (command, args) => {
    calls.push(args.join(' '));
    if (args[0].endsWith('run-affinity-demo.js')) {
      fs.writeFileSync(
        path.join(reportDir,
          'movielens-lagrange-formation-only-live-2026-09-05T20-00-00-000Z' +
          '.report.json'),
        JSON.stringify(verdictReport('PASS', false)),
      );
    }
    return {status: 0};
  };
  const result = runFormationSeedBudgetGate({
    root, run, log: (line) => lines.push(line),
  });
  t.same(calls, [
    'scripts/checks/wait-for-thermal-headroom.js',
    'examples/service-data-affinity/run-affinity-demo.js --formation-only',
  ]);
  t.equal(result.exitCode, 0);
  t.match(lines.join('\n'), /formation seed budget: PASS \(pass\)/);
  t.match(lines.join('\n'), /- seed_event_loop: gaps/);
  fs.writeFileSync(
    path.join(reportDir,
      'movielens-lagrange-service-affinity-live-2026-09-05T21-00-00-000Z' +
      '.report.json'),
    JSON.stringify(verdictReport('FAIL', true)),
  );
  t.match(
    newestFormationOnlyReport(root),
    /formation-only-live-2026-09-05T20-00-00-000Z/,
    'a later full-certification report is not the formation-only report',
  );
  const red = runFormationSeedBudgetGate({
    root, report: 'test-output/reports/movielens-lagrange-service-affinity-' +
      'live-2026-09-05T21-00-00-000Z.report.json',
    run, log: () => {},
  });
  t.equal(red.exitCode, 1);
  t.equal(red.decision.outcome, GATE_OUTCOME.VERDICT_NOT_PASS);
  // Fail closed: a refused thermal gate never spawns the demo, and a demo
  // that produced no NEW report never falls back to the report on disk.
  const refusedCalls = [];
  const refused = runFormationSeedBudgetGate({
    root, run: (command, args) => {
      refusedCalls.push(args[0]);
      return {status: 1};
    }, log: () => {},
  });
  t.equal(refused.exitCode, 1);
  t.equal(refused.decision.outcome, GATE_OUTCOME.THERMAL_GATE_REFUSED);
  t.same(refusedCalls, ['scripts/checks/wait-for-thermal-headroom.js'],
    'a refused thermal gate never starts the demo');
  const killed = runFormationSeedBudgetGate({
    root, run: (command, args) =>
      ({status: args[0].endsWith('run-affinity-demo.js') ? 1 : 0}),
    log: () => {},
  });
  t.equal(killed.exitCode, 1);
  t.equal(killed.decision.outcome,
    GATE_OUTCOME.FORMATION_RUN_PRODUCED_NO_REPORT,
    'the earlier PASS report on disk is not this run\'s evidence');
  const absent = runFormationSeedBudgetGate({
    root: fs.mkdtempSync(path.join(os.tmpdir(), 'seed-budget-empty-')),
    run: () => ({status: 0}), log: () => {},
  });
  t.equal(absent.exitCode, 1);
  t.equal(absent.decision.outcome,
    GATE_OUTCOME.FORMATION_RUN_PRODUCED_NO_REPORT,
    'a run in an empty tree produced nothing to decide on');
  t.equal(decideSeedBudgetGate(null).outcome, GATE_OUTCOME.REPORT_MISSING,
    'the decision itself still names a missing report');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
