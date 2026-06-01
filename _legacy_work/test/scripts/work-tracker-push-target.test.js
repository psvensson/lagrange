import tap from 'tap';

import {
  validateCommitAndPushLedger,
} from '../../scripts/work-tracker.js';

// F7 — Push target rename + optional `Pushed:` boolean.

function ledger({label = 'Push target', branch = 'origin/main', pushedLine = ''} = {}) {
  return [
    '## Commit And Push Ledger',
    '',
    `1. ${label}: ${branch}`,
    '2. Commit contains only package-owned files/package-status/allowed sprint handoff: yes',
    pushedLine,
    '',
  ].filter((l) => l !== '').join('\n');
}

tap.test('commit-and-push ledger push target rename (F7)', async (t) => {
  t.test('accepts new "Push target" label', (t) => {
    const errs = validateCommitAndPushLedger(ledger(), 'pkg.md', {});
    t.same(errs, []);
    t.end();
  });

  t.test('accepts legacy "Pushed to" label', (t) => {
    const errs = validateCommitAndPushLedger(ledger({label: 'Pushed to'}), 'pkg.md', {});
    t.same(errs, []);
    t.end();
  });

  t.test('accepts optional "Pushed: yes" boolean', (t) => {
    const errs = validateCommitAndPushLedger(
      ledger({pushedLine: '4. Pushed: yes 2026-05-29T12:00:00.000Z'}),
      'pkg.md', {},
    );
    t.same(errs, []);
    t.end();
  });

  t.test('accepts "Pushed: no" boolean', (t) => {
    const errs = validateCommitAndPushLedger(
      ledger({pushedLine: '4. Pushed: no'}),
      'pkg.md', {},
    );
    t.same(errs, []);
    t.end();
  });

  t.test('rejects invalid Pushed: value', (t) => {
    const errs = validateCommitAndPushLedger(
      ledger({pushedLine: '4. Pushed: maybe'}),
      'pkg.md', {},
    );
    t.equal(errs.length, 1);
    t.match(errs[0], /Pushed.*must be yes or no/);
    t.end();
  });

  t.test('Push target with bad remote/branch shape errors with new label', (t) => {
    const errs = validateCommitAndPushLedger(
      ledger({branch: 'not-a-remote-branch'}),
      'pkg.md', {},
    );
    t.equal(errs.length, 1);
    t.match(errs[0], /Push target.*must be <remote>\/<branch>/);
    t.end();
  });
});
