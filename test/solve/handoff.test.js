import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent, appendFinding} from '../../scripts/solve/store.js';
import {runStep} from '../../scripts/solve/step.js';
import {
  buildHandoff,
  classifyDirtyPaths,
  renderHandoff,
} from '../../scripts/solve/handoff.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));
}

function makeQuest(root, id = 'demo') {
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    class: 'process',
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
    '',
  ].join('\n'));
  return `diff:${path.relative(root, file)}`;
}

tap.test('scope-safe handoff (Concern 4)', async (t) => {
  t.test('classifies dirty files into in-scope and out-of-scope', (t) => {
    const scope = {
      files: ['solve/quests/demo.json', 'solve/log/demo.ndjson',
        'solve/report/demo.md', 'solve/state/demo.json'],
      changeDirPrefix: 'solve/changes/demo/',
      diffReferenced: ['src/demo.js', 'test/demo.test.js'],
    };
    const dirty = [
      'solve/quests/demo.json',
      'solve/changes/demo/fix.diff',
      'src/demo.js',
      'test/demo.test.js',
      'src/unrelated.js',
      'solve/quests/other.json',
      'README.md',
    ];
    const {inScope, outOfScope} = classifyDirtyPaths(dirty, scope);
    t.same(inScope, [
      'solve/changes/demo/fix.diff',
      'solve/quests/demo.json',
      'src/demo.js',
      'test/demo.test.js',
    ], 'owns its solve artifacts, change dir and diff-referenced files');
    t.same(outOfScope, [
      'README.md',
      'solve/quests/other.json',
      'src/unrelated.js',
    ], 'excludes other quests and unrelated dirty files');
    t.end();
  });

  t.test('builds a handoff that excludes unrelated dirty files', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'src/demo.js'),
      summary: 'scoped fix',
    });
    // A source-file change requires a recorded subagent verification finding.
    appendFinding(root, quest.id, {
      frontier: `${quest.id}-main`,
      claim: 'subagent verified the source change against quest intent',
      evidence: 'subagent:verify-1',
    });

    const dirtyFiles = [
      'solve/quests/demo.json',
      'solve/log/demo.ndjson',
      'solve/report/demo.md',
      'solve/changes/demo/fix.diff',
      'src/demo.js',
      'src/unrelated-other-quest.js',
      'solve/quests/other-quest.json',
    ];
    const handoff = buildHandoff(root, quest, {dirtyFiles});
    t.ok(handoff.ok, 'audit passed so handoff is allowed');
    t.ok(handoff.inScope.includes('src/demo.js'), 'includes diff-referenced source');
    t.ok(handoff.inScope.includes('solve/changes/demo/fix.diff'), 'includes change artifact');
    t.ok(handoff.inScope.includes('solve/quests/demo.json'), 'includes quest file');
    t.notOk(handoff.inScope.includes('src/unrelated-other-quest.js'),
      'excludes unrelated source');
    t.notOk(handoff.inScope.includes('solve/quests/other-quest.json'),
      'excludes another quest file');
    t.same(handoff.outOfScope,
      ['solve/quests/other-quest.json', 'src/unrelated-other-quest.js'].sort(),
      'reports the excluded files explicitly');

    const md = renderHandoff(handoff);
    t.match(md, /In scope/, 'renders an in-scope section');
    t.match(md, /Out of scope/, 'renders an out-of-scope section');
    t.match(md, /git add/, 'prints the git add command');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses to hand off when the audit fails', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    // An attempt referencing a non-existent diff makes the audit fail.
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
    const handoff = buildHandoff(root, quest, {dirtyFiles: ['solve/quests/demo.json']});
    t.notOk(handoff.ok, 'handoff refused because audit failed');
    t.equal(handoff.audit.status, 'fail');
    const md = renderHandoff(handoff);
    t.match(md, /REFUSED/, 'render makes the refusal explicit');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a clean in-scope set still commits nothing when nothing is dirty', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'doc fix',
    });
    const handoff = buildHandoff(root, quest, {dirtyFiles: []});
    t.ok(handoff.ok, 'audit passes');
    t.same(handoff.inScope, [], 'nothing dirty means nothing to commit');
    const md = renderHandoff(handoff);
    t.match(md, /nothing to commit/, 'render notes there is nothing to do');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
