import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execSync} from 'node:child_process';

const TEST_PACKAGE_PATH = 'work/packages/active-test-close-temp.md';

function mockPackageContent() {
  return [
    '# Test Close Temp Package',
    '',
    '<!-- work-package',
    JSON.stringify({
      schema: 'work-package-v2',
      status: 'active',
      intent: {
        opened: '2026-05-26',
        lane: 'lightweight-maintenance',
        scenario: 'none',
        artifact: 'none',
        playback: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'close_check',
        dominantReason: 'test_coverage',
        currentState: 'Staged for close testing.',
        nextAction: 'Succeed closure.',
      },
      scope: {
        writeScope: [],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: [],
      },
      gates: {
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'This package advances the active sprint goal by adding close testing.',
      },
      modelFit: {
        packageClass: 'bounded-implementation',
        intendedMinimumModel: 'gpt-5.3-codex-spark',
        scopeShape: 'leaf-slice',
        outputProfile: 'medium',
        ambiguityScore: 1,
        escalationTriggers: ['test package expands'],
      },
      execution: {
        theoryLedgerRefs: [],
        theoryLedger: 'no-ledger-update',
        proof: {
          commands: [
            'regression: node --test test/scripts/work-close.test.js',
          ],
        },
      },
    }, null, 2),
    '-->',
    '',
    '## Model Fit',
    '',
    '- Package class: `bounded-implementation`',
    '- Intended minimum model: `gpt-5.3-codex-spark`',
    '- Scope shape: `leaf-slice`',
    '- Output profile: `medium`',
    '- Owned files: `work/packages/<this-package>.md`',
    '- Do-not-edit scope: `src/`',
    '- Frozen decisions: package scope stays bounded.',
    '- Escalation triggers: test package expands.',
    '- Focused proof: `node --test test/scripts/work-close.test.js`',
    '',
    '- [x] checklist item: done.',
    '',
  ].join('\n');
}

describe('work-close command', () => {
  it('runs work-close dry-run successfully', async () => {
    // Write the mock package file
    await fs.writeFile(TEST_PACKAGE_PATH, mockPackageContent(), 'utf8');

    try {
      const output = execSync(`node scripts/work-close.js ${TEST_PACKAGE_PATH} --dry-run`, { encoding: 'utf8' });
      assert.match(output, /\[DRY RUN\] Would execute/u);
      assert.match(output, /Rename /u);
    } finally {
      // Clean up the mock package file
      await fs.rm(TEST_PACKAGE_PATH, { force: true });
    }
  });
});
