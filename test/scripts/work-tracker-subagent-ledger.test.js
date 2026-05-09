import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCommitAndPushLedger,
  validateModelFitContract,
  validateSubagentSequencingLedger,
} from '../../scripts/work-tracker.js';

const WORK_TRACKER_LEDGER_TEST_FILE = 'work/packages/active-test-package.md';
const WORK_TRACKER_DONE_TEST_FILE = 'work/packages/done-test-package.md';
const REVIEW_AGENT_ID = '019e02b6-1920-7130-b040-da2e6f4efbc4';
const FIX_AGENT_ID = '019e02b7-ece3-73a2-a664-389d40dfd575';
const IMPLEMENTATION_AGENT_ID = '019e02b9-7651-7851-bc85-a0cef8a90176';
const TEST_COMMIT_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const TEST_PUSH_TARGET = 'origin/main';
const MODEL_FIT_VALID_SPARK_SAFE_CONTENT = [
  '# Test Package',
  '',
  '## Model Fit',
  '',
  '- Package class: `bounded-implementation`',
  '- Intended minimum model: `gpt-5.3-codex-spark`',
  '- Scope shape: `leaf-slice`',
  '- Owned files: `scripts/work-tracker.js`, `test/scripts/work-tracker-subagent-ledger.test.js`',
  '- Forbidden files: `src/`, `test/distributed/harness/`',
  '- Frozen decisions: active package metadata requires the section.',
  '- Escalation triggers: owned files expand beyond tracker scripts.',
  '- Focused proof: `node --test test/scripts/work-tracker-subagent-ledger.test.js`',
  '',
].join('\n');
const MODEL_FIT_MISSING_CONTENT = '# Test Package\n';
const MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT = [
  '# Test Package',
  '',
  '## Model Fit',
  '',
  '- Package class: `spark-safe`',
  '- Intended minimum model: `gpt-5`',
  '- Scope shape: `broad-frontier`',
  '- Owned files: `scripts/work-tracker.js`',
  '- Forbidden files: `src/`',
  '- Frozen decisions: tracker metadata only.',
  '- Escalation triggers: find the next frontier.',
  '- Focused proof: `node --test test/scripts/work-tracker-subagent-ledger.test.js`',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT = '# Test Package\n';
const WORK_TRACKER_LEDGER_OPEN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [ ] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [ ] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [ ] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_CLEAN_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  `      Agent Fix (${FIX_AGENT_ID}) fixed`,
  '      `work/packages/done-test-package.md`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `not-needed` (`first-package-in-sprint`).',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `not-needed`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  '      Agent Review reviewed `work/packages/done-test-package.md`;',
  '      result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  '      Agent Implement implemented `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent local session (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `clean`.',
  '      Manual parent Codex note carried forward.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  `      Agent Review (${REVIEW_AGENT_ID}) reviewed`,
  '      `work/packages/done-test-package.md`; result `fixes-required`.',
  '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
  '- [x] Implementation subagent recorded:',
  `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
  '      `work/packages/active-test-package.md`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded:',
  '      `Codex local review session 2026-05-07` reviewed',
  '      `work/packages/done-test-package.md`; result `clean`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  '      `Codex local fix session 2026-05-07` was `not-needed`.',
  '- [x] Implementation subagent recorded:',
  '      `Codex local implementation session 2026-05-07` implemented',
  '      `work/packages/active-test-package.md`.',
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
  '- [x] Implementation subagent recorded:',
  '      `pending-before-implementation-resumes`.',
  '',
].join('\n');
const WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT = [
  '# Test Package',
  '',
  '## Subagent Sequencing Ledger',
  '',
  '- [x] Review subagent recorded: `<fresh review agent>` reviewed',
  '      `<most recently executed package>`; result `<clean|fixes-required>`.',
  '- [x] Fix subagent recorded or explicitly not needed:',
  '      `<fresh fix agent|not-needed>`.',
  '- [x] Implementation subagent recorded: `<fresh implementation agent>`.',
  '',
].join('\n');
const WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT = [
  '# Test Package',
  '',
  '## Commit And Push Ledger',
  '',
  `- Focused package commit: ${TEST_COMMIT_SHA}`,
  `- Pushed to: ${TEST_PUSH_TARGET}`,
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: yes',
  '',
].join('\n');
const WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT = [
  '# Test Package',
  '',
  '## Commit And Push Ledger',
  '',
  '- Focused package commit: <sha>',
  '- Pushed to: <remote>/<branch>',
  '- Commit contains only package-owned files/package-status/allowed sprint handoff: <yes>',
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

  it('accepts a clean review with an explicit not-needed fix entry', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('accepts a fixes-required review with a separate real fix agent', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('accepts not-needed review for the first package in a sprint', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('reports ambiguous not-needed review without first-package reason', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /first-package-in-sprint/u);
  });

  it('reports checked ledger items without real agent id proof', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /review entry must match/u);
    assert.match(errors.join('\n'), /implementation entry must/u);
  });

  it('reports implementation entries using local session identities', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
  });

  it('reports non-real identity words anywhere in checked strict entries', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
  });

  it('reports not-needed fixes when review found fixes required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /cannot be not-needed/u);
  });

  it('grandfathers historical done-package session labels when strict entries are not required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: false, requiresStrictEntries: false},
    );

    assert.deepEqual(errors, []);
  });

  it('reports historical session labels when strict entries are required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /review entry must match/u);
    assert.match(errors.join('\n'), /implementation entry must/u);
  });

  it('reports checked ledger items that still contain pending markers', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /pending-before-implementation-resumes/u);
  });

  it('reports checked ledger items that still contain template placeholders', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /template placeholder/u);
  });
});

describe('work tracker commit and push ledger validation', () => {
  it('grandfathers historical done packages without commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: false},
    );

    assert.deepEqual(errors, []);
  });

  it('reports done metadata-bearing packages without commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Commit And Push Ledger is required/u);
  });

  it('accepts complete commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('reports placeholders in commit and push proof fields', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.match(errors.join('\n'), /placeholder/u);
    assert.match(errors.join('\n'), /must be a git commit SHA/u);
    assert.match(errors.join('\n'), /must be <remote>\/<branch>/u);
    assert.match(errors.join('\n'), /must be yes/u);
  });
});

describe('work tracker model fit validation', () => {
  it('requires model fit on active metadata-bearing packages', () => {
    const errors = validateModelFitContract(
      MODEL_FIT_MISSING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Model Fit section is required/u);
  });

  it('accepts a complete Spark-safe leaf-slice contract', () => {
    const errors = validateModelFitContract(
      MODEL_FIT_VALID_SPARK_SAFE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects Spark-safe packages without Spark model, leaf scope, or bounded language',
    () => {
      const errors = validateModelFitContract(
        MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true},
      );

      assert.match(errors.join('\n'), /gpt-5\.3-codex-spark/u);
      assert.match(errors.join('\n'), /leaf-slice/u);
      assert.match(errors.join('\n'), /open-ended frontier language/u);
    });
});
