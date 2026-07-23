import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {RUNG_INDEX_MODEL} from '../../scripts/solve/constants.js';
import {buildNextLines, buildNextProjection} from '../../scripts/solve/next.js';
import {pendingFilePath} from '../../scripts/solve/step.js';
import {saveQuest} from '../../scripts/solve/store.js';

const QUEST_ID = 'next-model-rung-quest';

function setup(rungIndex) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-model-rung-'));
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const quest = {
    id: QUEST_ID,
    class: 'process',
    statement: 'Surface the model-rung commit requirement at next time.',
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [{id: `${QUEST_ID}-main`}],
  };
  saveQuest(root, quest);
  const pendingFile = pendingFilePath(root, QUEST_ID);
  fs.mkdirSync(path.dirname(pendingFile), {recursive: true});
  fs.writeFileSync(pendingFile, JSON.stringify({
    frontier: `${QUEST_ID}-main`,
    rungIndex,
    headCommit: 'deadbeef',
    before: {metric: 1, done: false, evidence: null},
  }, null, 2));
  return root;
}

tap.test('next surfaces the model-rung commit declaration before commit', async (t) => {
  t.test('a pending model-rung step names the required declaration', (t) => {
    const root = setup(RUNG_INDEX_MODEL);
    const projection = buildNextProjection(root, QUEST_ID);
    t.equal(projection.pendingStep.rungIndex, RUNG_INDEX_MODEL);
    t.equal(projection.pendingStep.modelEvidenceRequiredAtCommit, true);
    t.match(projection.action.value, /--modelRef/,
      'the typed commit action carries the model declaration hint');
    const lines = buildNextLines(root, QUEST_ID);
    t.ok(lines.some((line) => line.startsWith('model rung: commit requires')),
      'a dedicated line states the requirement before the attempt is spent');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a pending step below the model rung stays unchanged', (t) => {
    const root = setup(0);
    const projection = buildNextProjection(root, QUEST_ID);
    t.equal(projection.pendingStep.modelEvidenceRequiredAtCommit, false);
    t.notMatch(projection.action.value, /--modelRef/);
    const lines = buildNextLines(root, QUEST_ID);
    t.notOk(lines.some((line) => line.startsWith('model rung:')));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
