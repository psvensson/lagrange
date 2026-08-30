import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  assertSafeQuestId,
  questFilePath,
  logFilePath,
  stateFilePath,
  saveQuest,
} from '../../scripts/solve/store.js';
import {reportFilePath} from '../../scripts/solve/report.js';
import {pendingFilePath} from '../../scripts/solve/pending-step.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'safeid-'));
}

const EVIL = [
  '../../../etc/cron.d/evil',
  '..',
  'a/b',
  'a\\b',
  'foo/../bar',
  '.hidden',
  '',
  '/abs',
];

tap.test('quest id is a safe single path segment', async (t) => {
  t.test('valid ids pass', (t) => {
    for (const id of ['rolling-restart', 'demo', 'a.b_c-1', 'X1']) {
      t.equal(assertSafeQuestId(id), id, `${id} accepted`);
    }
    t.end();
  });

  t.test('traversal / separator ids are rejected by every path helper', (t) => {
    for (const id of EVIL) {
      t.throws(() => assertSafeQuestId(id), /invalid quest id/, `assert rejects ${id}`);
      t.throws(() => questFilePath('/root', id), /invalid quest id/);
      t.throws(() => logFilePath('/root', id), /invalid quest id/);
      t.throws(() => stateFilePath('/root', id), /invalid quest id/);
      t.throws(() => reportFilePath('/root', id), /invalid quest id/);
      t.throws(() => pendingFilePath('/root', id), /invalid quest id/);
    }
    t.end();
  });

  t.test('saveQuest cannot escape the quests dir via a crafted id', (t) => {
    const root = tmp();
    t.throws(() => saveQuest(root, {id: '../../escape', frontiers: []}),
      /invalid quest id/, 'malicious id blocked before any write');
    // Nothing was written outside solve/quests/.
    t.notOk(fs.existsSync(path.join(root, '..', 'escape.json')));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
