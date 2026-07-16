import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import t from 'tap';

const REPORT_DIR = 'test-output/reports';
const CASES = Object.freeze([
  Object.freeze({
    report: 'local-leader-row-visibility-fixed.model.report.json',
    converged: true,
    mode: 'local-leader-row-visibility-fixed',
  }),
  Object.freeze({
    report: 'local-leader-row-visibility-missing-seed.model.report.json',
    converged: false,
    mode: 'local-leader-row-visibility-missing-seed',
  }),
  Object.freeze({
    report: 'local-leader-row-visibility-stale-publish.model.report.json',
    converged: false,
    mode: 'local-leader-row-visibility-stale-publish',
  }),
  Object.freeze({
    report: 'local-leader-row-visibility-timestamp-bump.model.report.json',
    converged: false,
    mode: 'local-leader-row-visibility-timestamp-bump',
  }),
  Object.freeze({
    report: 'local-leader-row-visibility-demoted-replay.model.report.json',
    converged: false,
    mode: 'local-leader-row-visibility-demoted-replay',
  }),
]);

t.test('focused local leader-row TLC route and mutants meet their declared outcomes', (t) => {
  const result = spawnSync(
    process.execPath,
    ['scripts/model-tlc.js', '--mode', 'local-leader-row-visibility-fixed'],
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
