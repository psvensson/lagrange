import fs from 'node:fs/promises';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {buildAdvanceResult} from '../../scripts/work-advance.js';

const TEST_TEMP_DIR = path.join('test-output', 'tmp', 'work-advance-test');
const TEST_PACKAGE_PATH = path.join(
  TEST_TEMP_DIR,
  'active-20260526-work-advance-invalid.md',
);

function invalidPackageContent() {
  return [
    '# Work Advance Invalid Package',
    '',
    '<!-- work-package',
    JSON.stringify({
      schema: 'work-package-v2',
      status: 'done',
      intent: {
        opened: '2026-05-26',
        lane: 'lightweight-maintenance',
        scenario: 'none',
        artifact: 'none',
        playback: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'advance_check',
        dominantReason: 'validator_failure',
        currentState: 'Invalid by construction.',
        nextAction: 'Fail entry validation.',
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
        whyHighestLeverageNow: 'Exercise work advance status propagation.',
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
        proof: {
          commands: [
            'regression: node --test test/scripts/work-advance.test.js',
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
    '- Frozen decisions: package scope and lane stay bounded.',
    '- Escalation triggers: test package expands.',
    '- Focused proof: `node --test test/scripts/work-advance.test.js`',
    '',
  ].join('\n');
}

test('work advance check returns failure when validation subcommands fail',
  async (t) => {
    await fs.mkdir(TEST_TEMP_DIR, {recursive: true});
    await fs.writeFile(TEST_PACKAGE_PATH, invalidPackageContent(), 'utf8');
    t.teardown(async () => {
      await fs.rm(TEST_TEMP_DIR, {recursive: true, force: true});
    });

    const result = await buildAdvanceResult([
      '--package',
      TEST_PACKAGE_PATH,
      '--check',
    ]);

    t.equal(result.status, 1);
    t.match(result.output, /Entry Validation/u);
    t.match(result.output, /metadata status done does not match filename status active/u);
    t.end();
  });
