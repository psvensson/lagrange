import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {auditQuest} from '../../scripts/solve/audit.js';
import {runStep} from '../../scripts/solve/step.js';
import {appendEvent, saveQuest} from '../../scripts/solve/store.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-audit-'));
}

function makeQuest(root, id = 'demo') {
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: `${id}-main`, priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return {quest, oracle};
}

function makeDiff(root, questId, name, changedPath = 'src/demo.js') {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
  ].join('\n'));
  return `diff:${file}`;
}

tap.test('Quest audit', async (t) => {
  t.test('passes a valid fingerprinted attempt with scoped patch artifact', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'valid'),
      summary: 'valid scoped patch',
    });

    const audit = auditQuest(root, quest);
    t.equal(audit.status, 'pass');
    t.same(audit.problems, []);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fails source-file changeRefs and missing evidence identity', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      changeRef: 'diff:src/demo.js',
    });

    const audit = auditQuest(root, quest);
    const messages = audit.problems.map((item) => item.message).join('\n');
    t.equal(audit.status, 'fail');
    t.match(messages, /changeRef artifact does not exist/);
    t.match(messages, /evidence event is missing fingerprint identity/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fails workflow changes recorded under runtime Quest', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      evidenceFingerprint: 'fingerprint',
      changeRef: makeDiff(root, quest.id, 'workflow', 'scripts/solve/step.js'),
    });

    const audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /workflow changes must be recorded/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('classifies Solver command and test surfaces as workflow changes', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      evidenceFingerprint: 'fingerprint',
      changeRef: makeDiff(root, quest.id, 'solver-test', 'test/solve/audit.test.js'),
    });

    const audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /workflow changes must be recorded/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('classifies package script changes as workflow changes', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      evidenceFingerprint: 'fingerprint',
      changeRef: makeDiff(root, quest.id, 'package', 'package.json'),
    });

    const audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /workflow changes must be recorded/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fails patch artifacts without a real unified hunk', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    const file = path.join(root, 'solve', 'changes', quest.id, 'synthetic.diff');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, [
      'diff --git a/src/demo.js b/src/demo.js',
      '--- a/src/demo.js',
      '+++ b/src/demo.js',
      '@@ synthetic header',
    ].join('\n'));
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      evidenceFingerprint: 'fingerprint',
      changeRef: `diff:${file}`,
    });

    const audit = auditQuest(root, quest);
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /unified diff hunk/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
