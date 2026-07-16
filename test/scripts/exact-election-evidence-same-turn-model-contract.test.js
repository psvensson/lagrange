import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import t from 'tap';

const REPORT_DIR = 'test-output/reports';
const CASES = Object.freeze([
  Object.freeze({
    report: 'exact-election-evidence-same-turn-fixed.model.report.json',
    converged: true,
    mode: 'exact-election-evidence-same-turn-fixed',
  }),
  Object.freeze({
    report: 'exact-election-evidence-delayed-continuation.model.report.json',
    converged: false,
    mode: 'exact-election-evidence-delayed-continuation',
  }),
  Object.freeze({
    report: 'exact-election-evidence-continuation-authority.model.report.json',
    converged: false,
    mode: 'exact-election-evidence-continuation-authority',
  }),
]);

t.test('focused exact-election evidence TLC route and mutants meet their declared outcomes', (t) => {
  const result = spawnSync(
    process.execPath,
    ['scripts/model-tlc.js', '--mode', 'exact-election-evidence-same-turn-fixed'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 60000,
    },
  );
  t.equal(result.status, 0, result.stderr || result.stdout);

  for (const expected of CASES) {
    const report = JSON.parse(fs.readFileSync(
      `${REPORT_DIR}/${expected.report}`,
      'utf8',
    ));
    t.equal(report.mode, expected.mode, `${expected.mode} report is current`);
    t.equal(
      report.expectationMet,
      true,
      `${expected.mode} meets its declared TLC expectation`,
    );
    t.equal(
      report.converged,
      expected.converged,
      `${expected.mode} has the declared convergence outcome`,
    );
  }
  t.end();
});
