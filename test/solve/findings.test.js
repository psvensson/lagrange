import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {appendFinding, readFindings, projectState, saveQuest, readLog}
  from '../../scripts/solve/store.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'finding-'));
}

const GOAL = {
  id: 'demo',
  statement: 's',
  priority: 1,
  doneWhen: {probe: 'oracle', args: {file: 'x'}},
  frontiers: [
    {id: 'a', priority: 1, metric: {probe: 'oracle', args: {file: 'x'}}},
    {id: 'b', priority: 1, metric: {probe: 'oracle', args: {file: 'y'}}},
  ],
};

tap.test('findings store (finding event)', async (t) => {
  t.test('append + read round-trips per frontier', (t) => {
    const root = tmp();
    saveQuest(root, GOAL);
    appendFinding(root, GOAL.id,
      {frontier: 'a', claim: 'X holds', evidence: 'e1', rulesOut: 'approach-Y'});
    appendFinding(root, GOAL.id, {frontier: 'b', claim: 'unrelated'});
    appendFinding(root, GOAL.id, {frontier: 'a', claim: 'Z is flaky'});
    const aFindings = readFindings(root, GOAL.id, 'a');
    t.equal(aFindings.length, 2, 'only frontier a findings');
    t.equal(aFindings[0].claim, 'X holds');
    t.equal(aFindings[0].rulesOut, 'approach-Y');
    t.equal(aFindings[1].claim, 'Z is flaky');
    t.equal(readFindings(root, GOAL.id, 'b').length, 1);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('projectState attaches findings to the right frontier', (t) => {
    const root = tmp();
    saveQuest(root, GOAL);
    appendFinding(root, GOAL.id, {frontier: 'a', claim: 'one'});
    appendFinding(root, GOAL.id, {frontier: 'a', claim: 'two', rulesOut: 'dead-end'});
    const state = projectState(GOAL, readLog(root, GOAL.id));
    const a = state.frontiers.find((f) => f.id === 'a');
    const b = state.frontiers.find((f) => f.id === 'b');
    t.equal(a.findings.length, 2);
    t.equal(a.findings[1].rulesOut, 'dead-end');
    t.equal(b.findings.length, 0, 'other frontiers stay empty');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('structured verification survives append, read, and projection', (t) => {
    const root = tmp();
    saveQuest(root, GOAL);
    const verification = {
      schemaVersion: 1,
      scope: 'attempt',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    };
    appendFinding(root, GOAL.id, {
      frontier: 'a',
      claim: 'approved',
      kind: 'verifier-approval',
      evidence: 'subagent:verify-1',
      verification,
    });
    t.same(readFindings(root, GOAL.id, 'a')[0].verification, verification);
    t.same(projectState(GOAL, readLog(root, GOAL.id))
      .frontiers[0].findings[0].verification, verification);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('findings for an unknown frontier are dropped by projection', (t) => {
    const root = tmp();
    saveQuest(root, GOAL);
    appendFinding(root, GOAL.id, {frontier: 'ghost', claim: 'nope'});
    const state = projectState(GOAL, readLog(root, GOAL.id));
    t.same(state.frontiers.map((f) => f.findings.length), [0, 0]);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
