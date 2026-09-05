// Shared fixture for supervised-step theory-gate witnesses: an oracle quest
// whose flat steps climb the rung ladder, with a canonical diff artifact per
// attempt and a flat-evidence refresh so every commit measures.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {runStep} from '../../scripts/solve/step.js';
import {saveQuest} from '../../scripts/solve/store.js';

export const FRONTIER = 'demo-main';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'override-run-'));
}

export function makeDiff(root, name) {
  const file = path.join(root, 'solve', 'changes', 'demo', `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    'diff --git a/src/demo.js b/src/demo.js',
    '--- a/src/demo.js',
    '+++ b/src/demo.js',
    '@@ -1 +1 @@',
    `-${name} before`,
    `+${name} after`,
  ].join('\n'));
  return `diff:${file}`;
}

export function refreshFlatEvidence(quest, revision) {
  const file = quest.frontiers[0].metric.args.file;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.observationRevision = revision;
  fs.writeFileSync(file, JSON.stringify(data));
}

export function commitStep(root, quest, name, options = {}) {
  runStep(root, quest);
  refreshFlatEvidence(quest, name);
  return runStep(root, quest, {
    changeRef: makeDiff(root, name),
    summary: name,
    ...options,
  });
}

export function setup() {
  const root = tmp();
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
  const quest = {
    id: 'demo',
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: FRONTIER, priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return {root, quest};
}

