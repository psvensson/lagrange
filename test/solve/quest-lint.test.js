import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {appendEvent, saveQuest} from '../../scripts/solve/store.js';
import {
  QUEST_AUTHORING_CONTRACT_VERSION,
  assertQuestReadyToSeal,
  lintQuest,
  lintQuestCorpus,
} from '../../scripts/solve/quest-lint.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'quest-lint-'));
}

function quest(extra = {}) {
  const metric = {probe: 'scenario-harness', args: {scenario: 'demo'}};
  return {
    id: 'demo',
    authoringContractVersion: QUEST_AUTHORING_CONTRACT_VERSION,
    statement: 'The deterministic demo report passes.',
    class: 'product',
    links: {planDoc: 'solve/specs/demo/requirements.md'},
    doneWhen: metric,
    frontiers: [{id: 'demo-main', metric}],
    constraints: [],
    ...extra,
  };
}

tap.test('Quest authoring lint', async (t) => {
  t.test('an unversioned Quest remains legacy-readable', (t) => {
    const legacy = quest();
    delete legacy.authoringContractVersion;
    legacy.statement = '';
    legacy.doneWhen = {probe: 'oracle', args: {file: 'old.json'}};
    legacy.links = {};
    const result = lintQuest(legacy);
    t.equal(result.status, 'pass');
    t.equal(result.legacy, true);
    t.same(result.errors, []);
    t.end();
  });

  t.test('new product Quests require measured evidence and a planning link', (t) => {
    const result = lintQuest(quest({
      links: {},
      doneWhen: {probe: 'oracle', args: {file: 'decision.json'}},
    }));
    t.equal(result.status, 'fail');
    t.match(result.errors.join('\n'), /planning link/u);
    t.match(result.errors.join('\n'), /non-oracle/u);
    t.throws(() => assertQuestReadyToSeal(quest({links: {}})), /quest lint failed/u);
    t.end();
  });

  t.test('planDoc and parentQuest are recognized planning links', (t) => {
    t.equal(lintQuest(quest()).status, 'pass');
    t.equal(lintQuest(quest({links: {parentQuest: 'parent'}})).status, 'pass');
    t.end();
  });

  t.test('placeholder and malformed frontier declarations fail', (t) => {
    const result = lintQuest(quest({
      statement: 'Describe the terminal success condition in one line.',
      frontiers: [{id: 'same'}, {id: 'same'}],
    }));
    t.equal(result.status, 'fail');
    t.match(result.errors.join('\n'), /terminal result predicate/u);
    t.match(result.errors.join('\n'), /duplicated/u);
    t.match(result.errors.join('\n'), /metric probe/u);
    t.end();
  });

  t.test('versioned class and constraints are validated before sealing', (t) => {
    const invalidClass = lintQuest(quest({class: 'meta'}));
    t.equal(invalidClass.status, 'fail');
    t.match(invalidClass.errors.join('\n'), /class must be one of product\|process/u);

    const malformed = lintQuest(quest({constraints: [{id: 'missing-statement'}]}));
    t.equal(malformed.status, 'fail');
    t.match(malformed.errors.join('\n'), /constraint.*id and statement/u);

    const duplicate = lintQuest(quest({constraints: [
      {id: 'same', statement: 'Preserve A.'},
      {id: 'same', statement: 'Preserve B.'},
    ]}));
    t.match(duplicate.errors.join('\n'), /constraint id is duplicated/u);
    t.end();
  });

  t.test('landing requirements are staged separately from doneWhen', (t) => {
    const valid = lintQuest(quest({landingRequirements: {
      schemaVersion: 1,
      reviewReady: [{id: 'live-ab', kind: 'artifact',
        path: 'solve/evidence/live-ab.json'}],
      landReady: {independentVerification: true},
    }}));
    t.equal(valid.status, 'pass');
    const invalid = lintQuest(quest({landingRequirements: {
      schemaVersion: 1,
      reviewReady: [],
      landReady: {independentVerification: false},
    }}));
    t.match(invalid.errors.join('\n'), /independentVerification=true/u);
    t.end();
  });

  t.test('broad one-frontier statements are advisory', (t) => {
    const result = lintQuest(quest({
      statement: 'A passes and B passes while C passes, with D passing.',
    }));
    t.equal(result.status, 'pass');
    t.match(result.warnings.join('\n'), /one frontier/u);
    t.end();
  });

  t.test('corpus lint is read-only and reports the legacy count', (t) => {
    const root = tmp();
    const legacy = quest({id: 'legacy'});
    delete legacy.authoringContractVersion;
    saveQuest(root, legacy);
    saveQuest(root, quest({id: 'current'}));
    appendEvent(root, 'legacy', {
      type: 'quest', status: 'solved', evidence: 'historical-proof.json',
    });
    const before = fs.readFileSync(
      path.join(root, 'solve', 'quests', 'legacy.json'), 'utf8');
    const logBefore = fs.readFileSync(
      path.join(root, 'solve', 'log', 'legacy.ndjson'), 'utf8');
    const result = lintQuestCorpus(root, {all: true});
    const after = fs.readFileSync(
      path.join(root, 'solve', 'quests', 'legacy.json'), 'utf8');
    const logAfter = fs.readFileSync(
      path.join(root, 'solve', 'log', 'legacy.ndjson'), 'utf8');
    t.equal(result.status, 'pass');
    t.equal(result.questCount, 2);
    t.equal(result.legacyCount, 1);
    t.equal(after, before, 'historical Quest bytes are unchanged');
    t.equal(logAfter, logBefore, 'historical log and closure bytes are unchanged');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
