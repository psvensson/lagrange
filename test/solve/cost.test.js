import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCostReport,
  classifyCostLineage,
  tallyCostEntries,
  renderCostReport,
} from '../../scripts/solve/cost.js';

function entry(questId, event) {
  return {questId, event};
}

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-cost-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

function writeQuest(root, id, parentQuest = null, parentRelation = null) {
  const dir = path.join(root, 'solve', 'quests');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    id,
    links: {parentQuest, ...(parentRelation ? {parentRelation} : {})},
  }));
}

function writeLog(root, questId, events) {
  const dir = path.join(root, 'solve', 'log');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, `${questId}.ndjson`),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
}

tap.test('cost rollup', async (t) => {
  t.test('tallies attempts, rejections, violations, and telemetry coverage',
    (t) => {
      const byQuest = tallyCostEntries([
        entry('q-a', {type: 'attempt', ts: '2026-07-26T10:00:00.000Z',
          telemetry: {agentDurationMs: 60000}}),
        entry('q-a', {type: 'attempt', ts: '2026-07-26T10:30:00.000Z',
          telemetry: null}),
        entry('q-a', {type: 'finding', kind: 'verifier-rejection',
          ts: '2026-07-26T10:20:00.000Z'}),
        entry('q-a', {type: 'violation', ts: '2026-07-26T10:31:00.000Z'}),
        entry('q-b', {type: 'attempt', ts: '2026-07-26T11:00:00.000Z'}),
      ]);
      const a = byQuest.get('q-a');
      t.equal(a.attempts, 2);
      t.equal(a.rejections, 1);
      t.equal(a.violations, 1);
      t.equal(a.measuredAttempts, 1, 'null telemetry is unmeasured, not zero');
      t.equal(a.durationMs, 60000);
      t.equal(byQuest.get('q-b').measuredAttempts, 0);
      t.end();
    });

  t.test('fresh cost excludes inherited and malformed provenance', (t) => {
    const byQuest = tallyCostEntries([
      entry('q-a', {type: 'attempt', telemetry: {agentDurationMs: 1000}}),
      entry('q-a', {type: 'attempt', inherited: {fromQuest: 'q-parent'},
        telemetry: {agentDurationMs: 3_900_000}}),
      entry('q-a', {type: 'attempt', inherited: true,
        telemetry: {agentDurationMs: 8_000_000}}),
      entry('q-a', {type: 'attempt', telemetry: {agentDurationMs: -1}}),
    ]);
    const row = byQuest.get('q-a');
    t.equal(row.totalAttemptEvents, 4);
    t.equal(row.attempts, 2, 'only unmarked events are fresh');
    t.equal(row.inheritedAttempts, 1);
    t.equal(row.malformedInheritedAttempts, 1);
    t.equal(row.measuredAttempts, 1, 'negative duration is unmeasured');
    t.equal(row.durationMs, 1000, 'copied telemetry is excluded');
    t.equal(row.inheritedMeasuredAttempts, 1);
    t.equal(row.inheritedDurationMs, 3_900_000);
    t.end();
  });

  t.test('ambient inherited provenance and unsafe duration sums cannot leak',
    (t) => {
      const inheritedPrototypeEvent = Object.create({
        inherited: {fromQuest: 'polluted-parent'},
      });
      inheritedPrototypeEvent.type = 'attempt';
      inheritedPrototypeEvent.telemetry = {
        agentDurationMs: Number.MAX_VALUE,
      };
      const byQuest = tallyCostEntries([
        entry('q-a', inheritedPrototypeEvent),
        entry('q-a', {type: 'attempt',
          telemetry: {agentDurationMs: Number.MAX_SAFE_INTEGER}}),
        entry('q-a', {type: 'attempt',
          telemetry: {agentDurationMs: 1}}),
      ]);
      const row = byQuest.get('q-a');
      t.equal(row.attempts, 3, 'prototype provenance cannot reclassify events');
      t.equal(row.inheritedAttempts, 0);
      t.equal(row.measuredAttempts, 1,
        'unsafe input and a derived unsafe sum remain unmeasured');
      t.equal(row.durationMs, Number.MAX_SAFE_INTEGER);
      t.ok(Number.isSafeInteger(row.durationMs));
      t.end();
    });

  t.test('deduplicates valid rejection fingerprints but not missing ones', (t) => {
    const fingerprint = `sha256:${'a'.repeat(64)}`;
    const byQuest = tallyCostEntries([
      entry('q-a', {type: 'finding', kind: 'verifier-rejection',
        verification: {fingerprint}}),
      entry('q-a', {type: 'finding', kind: 'verifier-rejection',
        verification: {fingerprint}}),
      entry('q-a', {type: 'finding', kind: 'verifier-rejection'}),
      entry('q-a', {type: 'finding', kind: 'verifier-rejection'}),
      entry('q-a', {type: 'finding', kind: 'verifier-rejection',
        verification: {fingerprint: 'sha256:not-a-digest'}}),
    ]);
    const row = byQuest.get('q-a');
    t.equal(row.rejections, 4);
    t.equal(row.rejectionEvents, 5);
    t.notOk(Object.hasOwn(row, 'rejectionKeys'),
      'dedupe implementation details do not leak into public rows');
    t.end();
  });

  t.test('non-rejection findings and unknown events never count', (t) => {
    const byQuest = tallyCostEntries([
      entry('q-a', {type: 'finding', kind: 'repro-on-head',
        ts: '2026-07-26T10:00:00.000Z'}),
      entry('q-a', {type: 'gate-decision', ts: '2026-07-26T10:01:00.000Z'}),
    ]);
    const a = byQuest.get('q-a');
    t.equal(a.rejections, 0);
    t.equal(a.attempts, 0);
    t.end();
  });

  t.test('renders measured coverage next to duration, never a bare zero',
    (t) => {
      const rendered = renderCostReport({days: 2, rows: [{
        questId: 'q-a', attempts: 3, rejections: 2, violations: 0,
        measuredAttempts: 1, durationMs: 120000,
        firstTs: Date.parse('2026-07-26T10:00:00.000Z'),
        lastTs: Date.parse('2026-07-26T11:00:00.000Z'),
        solved: true, chain: null,
      }]});
      t.match(rendered,
        /\| q-a \| 3 \| 0 \| 2 \| 2 \| 0 \| 1\/3 \| 2m \| 60m \| — \|/u);
      t.match(rendered, /telemetry measured on 1\/3 attempt\(s\)/u);
      t.end();
    });

  t.test('an inherited-only quest remains visible without fresh cost', (t) => {
    const rendered = renderCostReport({days: 1, rows: [{
      questId: 'q-child', attempts: 0, totalAttemptEvents: 1,
      inheritedAttempts: 1, rejections: 0, rejectionEvents: 0,
      violations: 0, measuredAttempts: 0, durationMs: 0,
      firstTs: 1, lastTs: 1, lineage: 'q-parent (planned-child)',
      lineageKind: 'planned-child',
    }]});
    t.match(rendered, /\| q-child \| 0 \| 1 \|/u);
    t.match(rendered, /0 fresh attempt\(s\), 1 inherited attempt\(s\)/u);
    t.match(rendered, /1 planned child quest\(s\), 0 rejection respin/u);
    t.end();
  });

  t.test('a quest with no work in the window is omitted from the table',
    (t) => {
      const rendered = renderCostReport({days: 2, rows: [{
        questId: 'q-idle', attempts: 0, rejections: 0, violations: 0,
        measuredAttempts: 0, durationMs: 0,
        firstTs: Number.POSITIVE_INFINITY, lastTs: Number.NEGATIVE_INFINITY,
        solved: false, chain: null,
      }]});
      t.notMatch(rendered, /q-idle/u);
      t.match(rendered, /No attempts, rejections, or violations/u);
      t.end();
    });

  t.test('global rejection totals deduplicate across successor quests', (t) => {
    const root = tempRoot(t);
    const fingerprint = `sha256:${'b'.repeat(64)}`;
    const ts = '2026-08-02T10:00:00.000Z';
    writeQuest(root, 'q-a');
    writeQuest(root, 'q-b', 'q-a');
    writeLog(root, 'q-a', [
      {type: 'finding', kind: 'verifier-rejection', ts,
        verification: {fingerprint}},
      {type: 'finding', kind: 'verifier-rejection', ts},
    ]);
    writeLog(root, 'q-b', [
      {type: 'finding', kind: 'verifier-rejection', ts,
        verification: {fingerprint}},
      {type: 'finding', kind: 'verifier-rejection', ts},
    ]);
    const report = buildCostReport(root, {
      days: 1,
      now: Date.parse('2026-08-02T11:00:00.000Z'),
    });
    t.same(report.totals, {rejections: 3, rejectionEvents: 4},
      'one shared fingerprint plus two distinct unfingerprinted events');
    t.equal(report.rows.find((row) => row.questId === 'q-b').chain, 'q-a',
      'legacy chain field remains the raw parent Quest id');
    t.match(renderCostReport(report),
      /3 unique rejected candidate\(s\) across 4 rejection event\(s\)/u);
    t.end();
  });

  t.test('lineage defaults to planned children and infers only strong respins',
    (t) => {
      const root = tempRoot(t);
      writeQuest(root, 'parent');
      writeQuest(root, 'ordinary-child', 'parent');
      writeQuest(root, 'parent-v2', 'parent');
      writeQuest(root, 'parent-final', 'parent');
      writeQuest(root, 'parent-clean-replay', 'parent');
      writeQuest(root, 'parent-verifier-fix', 'parent');
      writeQuest(root, 'parent-validation-fix-v2', 'parent');
      writeQuest(root, 'explicit-planned-verifier-fix', 'parent', 'planned-child');
      writeQuest(root, 'unverified-explicit-respin', 'parent', 'rejection-respin');
      t.equal(classifyCostLineage(root, 'ordinary-child').kind, 'planned-child');
      t.equal(classifyCostLineage(root, 'parent-v2').kind, 'planned-child');
      t.equal(classifyCostLineage(root, 'parent-final').kind, 'planned-child');
      t.equal(classifyCostLineage(root, 'parent-clean-replay').kind,
        'planned-child');
      t.equal(classifyCostLineage(root, 'parent-verifier-fix').kind,
        'rejection-respin');
      t.equal(classifyCostLineage(root, 'parent-validation-fix-v2').kind,
        'rejection-respin');
      t.equal(classifyCostLineage(root, 'explicit-planned-verifier-fix').kind,
        'planned-child', 'structured relation wins over naming');
      t.equal(classifyCostLineage(root, 'unverified-explicit-respin').kind,
        'planned-child', 'a relation assertion is not rejection evidence');

      writeLog(root, 'parent', [{
        type: 'finding',
        kind: 'verifier-rejection',
        verification: {fingerprint: `sha256:${'c'.repeat(64)}`},
      }]);
      t.equal(classifyCostLineage(root, 'unverified-explicit-respin').kind,
        'rejection-respin', 'a verified parent rejection validates the relation');

      writeQuest(root, 'cycle-a', 'cycle-b');
      writeQuest(root, 'cycle-b', 'cycle-a');
      writeQuest(root, 'orphan-verifier-fix', 'missing-parent');
      writeQuest(root, 'orphan');
      writeQuest(root, 'orphan-validation-fix', 'missing-parent');
      writeQuest(root, 'self-verifier-fix', 'self-verifier-fix');
      t.equal(classifyCostLineage(root, 'cycle-a').kind, 'planned-child',
        'a cycle cannot claim rejection ceremony');
      t.equal(classifyCostLineage(root, 'orphan-verifier-fix'), null,
        'an unresolved parent fails safely');
      t.equal(classifyCostLineage(root, 'orphan-validation-fix'), null,
        'an explicit missing parent never falls through to a resolvable base');
      t.equal(classifyCostLineage(root, 'self-verifier-fix'), null,
        'a self-parent never falls through to suffix inference');
      t.end();
    });
});
