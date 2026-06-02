import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent, projectState, readLog}
  from '../../scripts/solve/store.js';
import {reopenFrontier, assessReopen} from '../../scripts/solve/reopen.js';

const SC = 'rolling-restart';
const INCOMPLETE_REASON = 'execution_incomplete_or_metrics_missing';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-reopen-'));
}

function writeReport(root, rel, {ts, passed, priorityItems, failed, verdictReason}) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({
    timestamp: ts,
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

function makeQuest(root, reportDir) {
  const metric = {probe: 'scenario-harness',
    args: {scenario: SC, reportDir, metric: 'priority'}};
  const quest = {
    id: 'reopen-demo',
    statement: 'rolling-restart stays green.',
    priority: 1,
    doneWhen: {probe: 'scenario-harness',
      args: {scenario: SC, reportDir, metric: 'priority', consecutive: 3}},
    frontiers: [{id: 'reopen-demo-main', priority: 1, metric}],
  };
  saveQuest(root, quest);
  return quest;
}

function makeDiff(root, questId, name, changedPath = 'docs/reopen.md') {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
    '',
  ].join('\n'));
  return `diff:${path.relative(root, file)}`;
}

function appendAttempt(root, quest, evidence, extra = {}) {
  appendEvent(root, quest.id, {
    type: 'attempt',
    frontier: 'reopen-demo-main',
    rung: 'local-fix',
    rungIndex: 0,
    metricBefore: 0,
    metricAfter: 0,
    metricDirection: 'lower-is-better',
    evidence,
    ...extra,
  });
}

function park(root, quest) {
  appendEvent(root, quest.id, {
    type: 'park',
    frontier: 'reopen-demo-main',
    reason: 'ladder exhausted without metric movement',
    finalMetric: 0,
  });
}

function parkWithKind(root, quest, kind) {
  appendEvent(root, quest.id, {
    type: 'park',
    frontier: 'reopen-demo-main',
    kind,
    reason: kind === 'cannot_measure' ?
      'measurement unavailable: no attempt produced a trustworthy sample' :
      'ladder exhausted without metric movement',
    finalMetric: 0,
  });
}

tap.test('reopen (evidence-gated frontier reopen)', async (t) => {
  t.test('reopens a frontier parked on a non-measuring (incomplete) sample', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    const ev = writeReport(root, 'reports/incomplete.report.json', {
      ts: '2026-06-01T01:00:00Z', passed: false, priorityItems: null,
      failed: 1, verdictReason: INCOMPLETE_REASON});
    appendAttempt(root, quest, ev);
    park(root, quest);

    const before = projectState(quest, readLog(root, quest.id))
      .frontiers.find((f) => f.id === 'reopen-demo-main');
    t.equal(before.status, 'parked');

    const result = reopenFrontier(root,
      {id: quest.id, reason: 'park driven by incomplete harness run'});
    t.equal(result.event.type, 'frontier-reopened');
    t.equal(result.assessment.invalidSampleCount, 1);

    const after = projectState(quest, readLog(root, quest.id))
      .frontiers.find((f) => f.id === 'reopen-demo-main');
    t.equal(after.status, 'open', 'frontier is open again');
    t.equal(after.rungIndex, 0, 'reset to the first rung');
    t.equal(after.parkedCount, 1, 'park history is preserved');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('honors a post-fix invalidSample flag without re-reading reports', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    appendAttempt(root, quest, 'reports/gone.report.json', {invalidSample: true});
    park(root, quest);
    const result = reopenFrontier(root, {id: quest.id, reason: 'invalid sample'});
    t.equal(result.assessment.invalidSampleCount, 1);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses to reopen a frontier parked on honest measurements', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    const ev = writeReport(root, 'reports/measured.report.json', {
      ts: '2026-06-01T01:00:00Z', passed: false, priorityItems: 2, failed: 1});
    appendAttempt(root, quest, ev);
    park(root, quest);

    const assessment = assessReopen(root, quest, 'reopen-demo-main');
    t.equal(assessment.ok, false);
    t.match(assessment.reason, /honestly-measured/);
    t.throws(() => reopenFrontier(root, {id: quest.id, reason: 'should fail'}),
      /reopen refused/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reopens a mixed park whose climb counted a non-measuring sample', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    const bad = writeReport(root, 'reports/incomplete.report.json', {
      ts: '2026-06-01T01:00:00Z', passed: false, priorityItems: null,
      failed: 1, verdictReason: INCOMPLETE_REASON});
    const good = writeReport(root, 'reports/measured.report.json', {
      ts: '2026-06-01T01:01:00Z', passed: false, priorityItems: 2, failed: 1});
    appendAttempt(root, quest, good);
    appendAttempt(root, quest, bad);
    // An exhausted-kind park (it had a measured sample) that still counted one
    // non-measuring rung is reopenable on the first reopen: that rung was untested.
    parkWithKind(root, quest, 'exhausted');

    const assessment = assessReopen(root, quest, 'reopen-demo-main');
    t.equal(assessment.ok, true, 'a mixed park is not an honest park');
    t.equal(assessment.invalidSampleCount, 1);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('bounds a re-reopen of any park kind once nothing changes', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    const good = writeReport(root, 'reports/measured.report.json', {
      ts: '2026-06-01T01:01:00Z', passed: false, priorityItems: 2, failed: 1});
    appendAttempt(root, quest, good);
    appendAttempt(root, quest, 'reports/x.report.json', {invalidSample: true});
    parkWithKind(root, quest, 'exhausted');
    reopenFrontier(root, {id: quest.id, reason: 'first reopen'});
    // Re-park with nothing changed since the reopen.
    parkWithKind(root, quest, 'exhausted');
    const assessment = assessReopen(root, quest, 'reopen-demo-main');
    t.equal(assessment.ok, false, 'second reopen is bounded for exhausted parks too');
    t.match(assessment.reason, /already reopened/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses to reopen a frontier that is not parked', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    const ev = writeReport(root, 'reports/incomplete.report.json', {
      ts: '2026-06-01T01:00:00Z', passed: false, priorityItems: null,
      failed: 1, verdictReason: INCOMPLETE_REASON});
    appendAttempt(root, quest, ev);

    t.throws(() => reopenFrontier(root, {id: quest.id, reason: 'not parked'}),
      /no single parked frontier/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('requires a justification reason', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    appendAttempt(root, quest, 'reports/x.report.json', {invalidSample: true});
    park(root, quest);
    t.throws(() => reopenFrontier(root, {id: quest.id}), /--reason/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('tracks reopenCount across reopens', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    appendAttempt(root, quest, 'reports/x.report.json', {invalidSample: true});
    parkWithKind(root, quest, 'cannot_measure');
    reopenFrontier(root, {id: quest.id, reason: 'first reopen'});
    const after = projectState(quest, readLog(root, quest.id))
      .frontiers.find((f) => f.id === 'reopen-demo-main');
    t.equal(after.reopenCount, 1, 'reopen is counted');
    t.equal(after.parkedCount, 1, 'park history preserved');
    t.equal(after.parkKind, null, 'parkKind cleared on reopen');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses a second cannot-measure reopen with nothing changed', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    appendAttempt(root, quest, 'reports/x.report.json', {invalidSample: true});
    parkWithKind(root, quest, 'cannot_measure');
    reopenFrontier(root, {id: quest.id, reason: 'first reopen'});
    // Re-park with nothing changed since the reopen.
    parkWithKind(root, quest, 'cannot_measure');
    const assessment = assessReopen(root, quest, 'reopen-demo-main');
    t.equal(assessment.ok, false, 'second reopen is bounded');
    t.match(assessment.reason, /fix the measurement harness/);
    t.throws(() => reopenFrontier(root, {id: quest.id, reason: 'again'}),
      /reopen refused/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('does not count an unresolved changeRef as a reopen-worthy change', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    appendAttempt(root, quest, 'reports/x.report.json', {invalidSample: true});
    parkWithKind(root, quest, 'cannot_measure');
    reopenFrontier(root, {id: quest.id, reason: 'first reopen'});
    appendAttempt(root, quest, 'reports/x.report.json',
      {invalidSample: true, changeRef: 'diff:missing.diff'});
    parkWithKind(root, quest, 'cannot_measure');
    const assessment = assessReopen(root, quest, 'reopen-demo-main');
    t.equal(assessment.ok, false, 'bogus changeRef cannot bypass the reopen bound');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('re-allows reopen once evidence changes after the last reopen', (t) => {
    const root = tmp();
    const quest = makeQuest(root, 'reports');
    appendAttempt(root, quest, 'reports/x.report.json', {invalidSample: true});
    parkWithKind(root, quest, 'cannot_measure');
    reopenFrontier(root, {id: quest.id, reason: 'first reopen'});
    // A fresh attempt carrying a resolved changeRef means something changed.
    appendAttempt(root, quest, 'reports/x.report.json',
      {invalidSample: true, changeRef: makeDiff(root, quest.id, 'fix')});
    parkWithKind(root, quest, 'cannot_measure');
    const assessment = assessReopen(root, quest, 'reopen-demo-main');
    t.equal(assessment.ok, true, 'reopen re-allowed after a change');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
