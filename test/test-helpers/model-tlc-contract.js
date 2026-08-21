import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const UTF8 = 'utf8';
const MODEL_TLC_SCRIPT = 'scripts/model-tlc.js';

export function assertFreshModelTlcCases(t, cases, options = {}) {
  const reportDirectory = options.reportDirectory ?? 'test-output/reports';
  const timeout = options.timeout ?? 60000;
  for (const expected of cases) {
    const reportPath = `${reportDirectory}/${expected.report}`;
    fs.rmSync(reportPath, {force: true});
    const result = spawnSync(
      process.execPath,
      [MODEL_TLC_SCRIPT, '--mode', expected.mode],
      {cwd: process.cwd(), encoding: UTF8, timeout},
    );
    t.equal(result.status, 0, result.stderr || result.stdout);
    t.equal(fs.existsSync(reportPath), true,
      `${expected.mode} must produce the report this test asserts`);
    if (!fs.existsSync(reportPath)) continue;
    const report = JSON.parse(fs.readFileSync(reportPath, UTF8));
    t.equal(report.mode, expected.mode, `${expected.mode} report is current`);
    t.equal(report.expectationMet, true,
      `${expected.mode} meets its declared TLC expectation`);
    t.equal(report.converged, expected.converged,
      `${expected.mode} has the declared convergence outcome`);
  }
}
