import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  attemptIsNonMeasuring,
  frontierHasValidSample,
  harnessArgs,
} from '../../scripts/solve/sample-validity.js';

const SC = 'rolling-restart';
const INCOMPLETE_REASON = 'execution_incomplete_or_metrics_missing';
const TOPOLOGY_BLOCKED_REASON = 'topology_progress_blocked';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-sv-'));
}

// Mirror the scenario-harness report shape the probe writes, so attempts can be
// re-classified by reading recorded evidence (the pre-fix historical path).
function writeReport(root, rel, {passed, priorityItems, failed, verdictReason}) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({
    timestamp: '2026-06-02T00:00:00Z',
    summary: {total: 1, passed: passed ? 1 : 0, failed},
    optimizationSummary: {totalPriorityItems: priorityItems},
    standardSummary: {
      scenarios: [{
        scenario: SC,
        current: {
          passed,
          verdict: passed ? 'PASS' : 'BLOCK_EVIDENCE_INCOMPLETE',
          ...(verdictReason ? {verdictReason} : {}),
        },
      }],
    },
  }));
  return rel;
}

const HARNESS_DEF = {
  id: 'main',
  metric: {probe: 'scenario-harness', args: {scenario: SC, metric: 'priority'}},
};

tap.test('sample-validity classifier', async (t) => {
  t.test('harnessArgs returns args only for scenario-harness metrics', (t) => {
    t.same(harnessArgs(HARNESS_DEF), {scenario: SC, metric: 'priority'});
    t.equal(harnessArgs({metric: {probe: 'oracle', args: {file: 'x'}}}), null);
    t.equal(harnessArgs({}), null);
    t.end();
  });

  t.test('honors a post-fix invalidSample flag without reading evidence', (t) => {
    const root = tmp();
    t.equal(
      attemptIsNonMeasuring(root, {invalidSample: true}, HARNESS_DEF), true);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('re-classifies a historical attempt from its evidence report', (t) => {
    const root = tmp();
    const ev = writeReport(root, 'reports/incomplete.report.json', {
      passed: false, priorityItems: null, failed: 1,
      verdictReason: INCOMPLETE_REASON});
    t.equal(attemptIsNonMeasuring(root, {evidence: ev}, HARNESS_DEF), true);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a genuinely measured attempt is a valid sample', (t) => {
    const root = tmp();
    const ev = writeReport(root, 'reports/measured.report.json', {
      passed: false, priorityItems: 2, failed: 1});
    t.equal(attemptIsNonMeasuring(root, {evidence: ev}, HARNESS_DEF), false);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a topology convergence block with a metric is a valid sample', (t) => {
    const root = tmp();
    const ev = writeReport(root, 'reports/topology-blocked.report.json', {
      passed: false, priorityItems: 2, failed: 1,
      verdictReason: TOPOLOGY_BLOCKED_REASON});
    t.equal(attemptIsNonMeasuring(root, {evidence: ev}, HARNESS_DEF), false);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('frontierHasValidSample is false only when every attempt is invalid', (t) => {
    const root = tmp();
    const bad = writeReport(root, 'reports/bad.report.json', {
      passed: false, priorityItems: null, failed: 1,
      verdictReason: INCOMPLETE_REASON});
    const good = writeReport(root, 'reports/good.report.json', {
      passed: true, priorityItems: 0, failed: 0});
    t.equal(
      frontierHasValidSample(root, [{evidence: bad}], HARNESS_DEF), false,
      'all-invalid frontier has no valid sample');
    t.equal(
      frontierHasValidSample(root, [{evidence: bad}, {evidence: good}], HARNESS_DEF),
      true, 'one measuring sample is enough');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
