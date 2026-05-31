import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  hardenCommitLedgerContent,
} from '../../scripts/work-commit-ledger-harden.js';

const NEW_SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const PARENT_SHA = '0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f';

function ledger(focusedLine) {
  return [
    '## Commit And Push Ledger',
    '',
    focusedLine,
    '2. Push target: origin/main',
    '3. Commit contains only package-owned files: yes',
    '4. Pushed: no',
    '',
  ].join('\n');
}

describe('hardenCommitLedgerContent', () => {
  it('replaces a backtick-wrapped <sha> placeholder, preserving backticks', () => {
    const input = ledger('- Focused package commit: `<sha>`');
    const out = hardenCommitLedgerContent(input, NEW_SHA, PARENT_SHA);
    assert.ok(out.includes('- Focused package commit: `' + NEW_SHA + '`'));
    assert.ok(!out.includes('<sha>'));
  });

  it('replaces a bare stale SHA on a numbered line, staying bare', () => {
    const input = ledger('1. Focused package commit: deadbeefdeadbeef');
    const out = hardenCommitLedgerContent(input, NEW_SHA, PARENT_SHA);
    assert.ok(out.includes('1. Focused package commit: ' + NEW_SHA));
    assert.ok(!out.includes('deadbeefdeadbeef'));
    assert.ok(!out.includes('`' + NEW_SHA + '`'));
  });

  it('rewrites the pre-commit parent SHA both in the ledger and elsewhere', () => {
    const input =
      ledger('1. Focused package commit: ' + PARENT_SHA) +
      '\nSee prior commit ' + PARENT_SHA + ' for context.\n';
    const out = hardenCommitLedgerContent(input, NEW_SHA, PARENT_SHA);
    assert.ok(!out.includes(PARENT_SHA));
    assert.strictEqual(out.split(NEW_SHA).length - 1, 2);
  });

  it('only rewrites the first Focused package commit line', () => {
    const input =
      ledger('1. Focused package commit: `<sha>`') +
      '- Focused package commit: `<sha>`\n';
    const out = hardenCommitLedgerContent(input, NEW_SHA, PARENT_SHA);
    assert.strictEqual(out.split(NEW_SHA).length - 1, 1);
    assert.ok(out.includes('<sha>'));
  });

  it('returns content unchanged when there is no ledger line', () => {
    const input = '# Package\n\nNo ledger here.\n';
    assert.strictEqual(
      hardenCommitLedgerContent(input, NEW_SHA, PARENT_SHA),
      input,
    );
  });

  it('is a no-op for invalid inputs', () => {
    const input = ledger('1. Focused package commit: `<sha>`');
    assert.strictEqual(hardenCommitLedgerContent(input, '', PARENT_SHA), input);
    assert.strictEqual(hardenCommitLedgerContent(null, NEW_SHA), null);
  });

  it('does not require a parent SHA to harden the ledger line', () => {
    const input = ledger('1. Focused package commit: `<sha>`');
    const out = hardenCommitLedgerContent(input, NEW_SHA);
    assert.ok(out.includes('1. Focused package commit: `' + NEW_SHA + '`'));
  });
});
