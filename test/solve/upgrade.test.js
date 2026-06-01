import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {auditQuest} from '../../scripts/solve/audit.js';
import {upgradeQuest} from '../../scripts/solve/upgrade.js';
import {appendEvent, readLog, saveQuest} from '../../scripts/solve/store.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-upgrade-'));
}

function makeQuest(root) {
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
  const quest = {
    id: 'upgrade-demo',
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: 'upgrade-demo-main', priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return {quest, oracle};
}

function appendLegacyAttempt(root, quest, oracle) {
  appendEvent(root, quest.id, {
    type: 'attempt',
    frontier: 'upgrade-demo-main',
    rung: 'local-fix',
    rungIndex: 1,
    metricBefore: 2,
    metricAfter: 1,
    metricDirection: 'lower-is-better',
    evidence: oracle,
    changeRef: 'diff:src/demo.js',
  });
}

tap.test('Quest upgrade baseline', async (t) => {
  t.test('baselines legacy audit problems and ingests current evidence', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendLegacyAttempt(root, quest, oracle);

    t.equal(auditQuest(root, quest).status, 'fail', 'legacy log fails strict audit');
    const result = upgradeQuest(root, {id: quest.id, reason: 'test baseline'});

    t.equal(result.baseline.type, 'quest-upgraded');
    t.equal(result.ingested.type, 'evidence-ingested');
    const audit = auditQuest(root, quest);
    t.equal(audit.status, 'pass');
    t.type(audit.strictAuditStartedAt, 'string');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('still fails new invalid events after the upgrade marker', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendLegacyAttempt(root, quest, oracle);
    upgradeQuest(root, {id: quest.id, reason: 'test baseline'});

    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'upgrade-demo-main',
      rung: 'widen-scope',
      rungIndex: 1,
      metricBefore: 1,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      changeRef: 'diff:src/new-bad.js',
    });

    const audit = auditQuest(root, quest);
    t.equal(audit.status, 'fail');
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /changeRef artifact does not exist/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('re-running upgrade does not reset the strict audit baseline', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    appendLegacyAttempt(root, quest, oracle);
    const firstUpgrade = upgradeQuest(root, {id: quest.id, reason: 'test baseline'});

    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'upgrade-demo-main',
      rung: 'widen-scope',
      rungIndex: 1,
      metricBefore: 1,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      changeRef: 'diff:src/new-bad.js',
    });

    t.equal(auditQuest(root, quest).status, 'fail');
    const secondUpgrade = upgradeQuest(root, {id: quest.id, reason: 'try reset'});
    const upgradeEvents = readLog(root, quest.id)
      .filter((event) => event.type === 'quest-upgraded');

    t.equal(secondUpgrade.alreadyUpgraded, true);
    t.equal(secondUpgrade.baseline.ts, firstUpgrade.baseline.ts);
    t.equal(upgradeEvents.length, 1);
    const audit = auditQuest(root, quest);
    t.equal(audit.status, 'fail');
    t.match(
      audit.problems.map((item) => item.message).join('\n'),
      /changeRef artifact does not exist/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
