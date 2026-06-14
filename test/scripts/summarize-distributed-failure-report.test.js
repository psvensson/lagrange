import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT_PATH = 'scripts/summarize-distributed-failure-report.sh';
const ENCODING_UTF8 = 'utf8';
const ROOT_CAUSE_CLASS = 'topology';
const DOMINANT_REASON = 'publication_missing_active_node=35a891b8';
const SCENARIO_NAME = 'rolling-restart';

// A single-scenario failure bundle: scenario fields at top level, no .scenarios[]
// wrapper. This is the shape written to .playback/<run>/<scenario>/failure-bundle.json.
// Before the report-shape normalization, pointing the analyzer at this shape made every
// .scenarios[$i]... extract resolve to null and the whole report printed "n/a".
const BUNDLE_FIXTURE = {
  scenario: SCENARIO_NAME,
  reportSummary: {total: 1, passed: 0, failed: 1, duration: 476636},
  summary: {passed: false, error: 'Cluster ACTIVE wait stalled'},
  diagnostics: {
    failure: {
      rootCauseClass: ROOT_CAUSE_CLASS,
      dominantReason: DOMINANT_REASON,
      reasonCounts: {[DOMINANT_REASON]: 1},
    },
  },
  playback: {
    durationMs: 492215,
    files: {},
    warnings: [],
  },
};

// A multi-scenario report: the canonical shape the analyzer already supported.
const REPORT_FIXTURE = {
  summary: {total: 1, passed: 0, failed: 1, duration: 476636},
  scenarios: [
    {
      scenario: SCENARIO_NAME,
      passed: false,
      duration: 476636,
      error: 'Cluster ACTIVE wait stalled',
      details: {
        diagnostics: {
          failure: {
            rootCauseClass: ROOT_CAUSE_CLASS,
            dominantReason: DOMINANT_REASON,
            reasonCounts: {[DOMINANT_REASON]: 1},
          },
        },
      },
      playback: {durationMs: 476636, files: {}, warnings: []},
    },
  ],
};

function runAnalyzer(filePath) {
  return execFileSync('bash', [SCRIPT_PATH, '--report', filePath], {
    encoding: ENCODING_UTF8,
  });
}

let tmpDir;
let bundlePath;
let reportPath;

describe('summarize-distributed-failure-report shape handling', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdfr-test-'));
    bundlePath = path.join(tmpDir, 'failure-bundle.json');
    reportPath = path.join(tmpDir, 'run.report.json');
    fs.writeFileSync(bundlePath, JSON.stringify(BUNDLE_FIXTURE), ENCODING_UTF8);
    fs.writeFileSync(reportPath, JSON.stringify(REPORT_FIXTURE), ENCODING_UTF8);
  });

  after(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it('extracts diagnostics from a single-scenario failure bundle (not all n/a)', () => {
    const out = runAnalyzer(bundlePath);
    // The original path is still shown even though normalization wraps the bundle.
    assert.match(out, new RegExp(`path=${bundlePath.replace(/[.\\/]/g, '\\$&')}`));
    assert.match(out, /scenario\.name=rolling-restart/);
    assert.match(out, new RegExp(`rootCauseClass=${ROOT_CAUSE_CLASS}`));
    assert.match(out, new RegExp(`dominantReason=${DOMINANT_REASON.replace(/[=]/g, '\\$&')}`));
    // Red-on-revert: pre-fix this printed rootCauseClass=n/a for the bundle shape.
    assert.doesNotMatch(out, /rootCauseClass=n\/a/);
  });

  it('still parses the canonical multi-scenario report shape', () => {
    const out = runAnalyzer(reportPath);
    assert.match(out, /scenario\.name=rolling-restart/);
    assert.match(out, new RegExp(`rootCauseClass=${ROOT_CAUSE_CLASS}`));
    assert.match(out, new RegExp(`dominantReason=${DOMINANT_REASON.replace(/[=]/g, '\\$&')}`));
    assert.doesNotMatch(out, /rootCauseClass=n\/a/);
  });
});
