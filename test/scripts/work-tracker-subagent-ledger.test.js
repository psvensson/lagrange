import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {validateSubagentSequencingLedger} from '../../scripts/work-tracker.js';

const WORK_TRACKER_LEDGER_TEST_FILE = 'work/packages/active-test-package.md';
const WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT = '# Test Package\n';
const WORK_TRACKER_LEDGER_OPEN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [ ] Review subagent recorded: `review-agent` reviewed `done-package` on `owner`;',
  '      result `clean`.',
  '- [ ] Fix subagent recorded or explicitly not needed: `not-needed`; fixes `none`.',
  '- [ ] Implementation subagent recorded: `impl-agent`;',
  '      started only after review/fix ledger was clean.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_CLOSED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `review-agent` reviewed `done-package` on `owner`;',
  '      result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`; fixes `none`.',
  '- [x] Implementation subagent recorded: `impl-agent`;',
  '      started only after review/fix ledger was clean.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `pending-before-implementation-resumes`',
  '      reviewed `done-package` on `owner`; result `pending`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  '      `pending-before-implementation-resumes`; fixes `pending`.',
  '- [x] Implementation subagent recorded: `pending-before-implementation-resumes`;',
  '      started only after review/fix ledger was clean.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `<fresh subagent/session>` reviewed',
  '      `<most recently executed package>` on `<same sprint or owner boundary>`;',
  '      result `<clean|fixes required>`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  '      `<fresh separate subagent/session|not-needed>`; fixes `<summary|none>`.',
  '- [x] Implementation subagent recorded: `<fresh separate subagent/session>`;',
  '      started only after review/fix ledger was clean.',
  '',
].join('\n');

describe('work tracker subagent sequencing ledger validation', () => {
  it('reports active metadata-bearing packages without the new ledger', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Subagent Sequencing Ledger is required/u);
  });

  it('allows done historical packages without the new ledger', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: false},
    );

    assert.deepEqual(errors, []);
  });

  it('reports open and unchecked required ledger items', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_OPEN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.equal(errors.length, 4);
    assert.match(errors[0], /has open items/u);
    assert.match(errors[1], /Review subagent recorded/u);
    assert.match(errors[2], /Fix subagent recorded or explicitly not needed/u);
    assert.match(errors[3], /Implementation subagent recorded/u);
  });

  it('accepts a closed ledger with all required subagent roles recorded', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CLOSED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('reports checked ledger items that still contain pending markers', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.equal(errors.length, 3);
    assert.match(errors[0], /pending-before-implementation-resumes/u);
    assert.match(errors[1], /pending-before-implementation-resumes/u);
    assert.match(errors[2], /pending-before-implementation-resumes/u);
  });

  it('reports checked ledger items that still contain template placeholders', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.equal(errors.length, 3);
    assert.match(errors[0], /template placeholder/u);
    assert.match(errors[1], /template placeholder/u);
    assert.match(errors[2], /template placeholder/u);
  });
});
