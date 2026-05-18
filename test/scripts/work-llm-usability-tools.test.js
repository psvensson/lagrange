import fs from 'node:fs/promises';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {buildOwnerFileIndex} from '../../scripts/analyze-owner-files.js';
import {buildPriorityRecoveryResiduals} from '../../scripts/analyze-priority-recovery-residuals.js';
import {buildSubagentPrompt} from '../../scripts/work-subagent-prompt.js';
import {buildSubagentNextLines} from '../../scripts/work-subagent-next.js';
import {buildPackageContent, runCli} from '../../scripts/work-package-new.js';
import {buildLlmStartLines} from '../../scripts/work-llm-start.js';
import {buildScenarioTriageSummary} from '../../scripts/work-scenario-triage.js';
import {renderSchemaReference} from '../../scripts/work-package-schema.js';

const TEMP_ROOT = 'test-output/work-llm-usability-tools';
const TEMP_OWNER_ROOT = path.join(TEMP_ROOT, 'owner-index');
const TEMP_PACKAGE_ROOT = path.join(TEMP_ROOT, 'packages');
const TEMP_LEDGER_PATH = path.join(TEMP_ROOT, 'missing-ledger.jsonl');
const TEMP_CURRENT_BLOCKER_PATH = path.join(TEMP_ROOT, 'current-blocker.json');
const TEMP_PACKAGE_PATH = path.join(
  TEMP_PACKAGE_ROOT,
  'todo-20260512-llm-usability-test.md',
);
const TEMP_MISSING_ACTIVE_PACKAGE_PATH = path.join(
  TEMP_PACKAGE_ROOT,
  'active-20260512-missing-package.md',
);
const OWNER_NAME = 'operation_workflow_owner';
const BOUNDARY_NAME = 'workflow_progress';
const TEST_TITLE = 'LLM Usability Test Package';
const TEST_SLUG = 'llm-usability-test';
const FIXTURE_PATH =
  'test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json';

async function writeTempPackage() {
  await fs.mkdir(TEMP_PACKAGE_ROOT, {recursive: true});
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'lightweight-maintenance',
    'owner': 'workflow_tooling_owner',
    'boundary': 'llm_usability_handoff',
    'dominant-reason': 'test_package',
    'next-action': 'Render LLM start output.',
    'proof': ['node --test test/scripts/work-llm-usability-tools.test.js'],
    'write-scope': ['scripts/work-package-new.js'],
    'ledger': TEMP_LEDGER_PATH,
  });
  await fs.writeFile(TEMP_PACKAGE_PATH, `${content}\n`, 'utf8');
  return content;
}

test('shared package schema lists validator enums for LLM scaffolding', (t) => {
  const rendered = renderSchemaReference();

  t.match(rendered, /scenario-release-gate/u);
  t.match(rendered, /Output Profiles/u);
  t.match(rendered, /extra-high/u);
  t.match(rendered, /writeScope/u);
  t.match(rendered, /pre-impl/u);
  t.match(rendered, /tool-unavailable/u);
  t.match(rendered, /pending-before-rerun/u);
  t.match(rendered, /classification-only-stop/u);
  t.match(rendered, /ownerBoundaryMigrationProof/u);
  t.match(rendered, /fromOwner/u);
  t.match(rendered, /Architecture Decision Gate/u);
  t.match(rendered, /architectureDecisionGate/u);
  t.end();
});

test('package scaffolder pre-fills Model Fit from schema defaults', async (t) => {
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'lightweight-maintenance',
    'owner': 'workflow_tooling_owner',
    'boundary': 'llm_usability_handoff',
    'dominant-reason': 'test_package',
    'next-action': 'Create a package.',
    'proof': ['git diff --check'],
    'write-scope': ['scripts/work-package-new.js'],
    'ledger': TEMP_LEDGER_PATH,
  });

  t.match(content, /"schema": "work-package-v1"/u);
  t.match(content, /"lane": "lightweight-maintenance"/u);
  t.match(content, /"writeScope": \[/u);
  t.match(content, /"commitScope": \[/u);
  t.match(content, /"outputProfile": "medium"/u);
  t.match(content, /Intended minimum model: `gpt-5\.3-codex-spark`/u);
  t.match(content, /Output profile: `medium`/u);
  t.match(content, /Model ledger advisory: `hold`/u);
  t.match(content, /## LLM Tool-First Contract/u);
  t.match(content, /## Workflow Acceleration Contract/u);
  t.match(content, /work:advance -- --check/u);
  t.match(content, /work:evidence-summary/u);
  t.match(content, /ad hoc `jq`/u);
});

test('package scaffolder keeps Model Fit focused proof concrete', async (t) => {
  const content = await buildPackageContent({
    'title': TEST_TITLE,
    'slug': TEST_SLUG,
    'lane': 'lightweight-maintenance',
    'owner': 'workflow_tooling_owner',
    'boundary': 'llm_usability_handoff',
    'dominant-reason': 'test_package',
    'next-action': 'Create a package.',
    'proof': ['npm run work:evidence-summary -- <fresh-artifact>'],
    'write-scope': ['work/packages/active-test.md'],
    'ledger': TEMP_LEDGER_PATH,
  });

  t.match(content, /Focused proof: `npm run work:advance -- --check`/u);
  t.match(content, /npm run work:evidence-summary -- <fresh-artifact>/u);
});

test('package scaffolder uses package filename date convention', async (t) => {
  const rendered = await runCli([
    '--title',
    TEST_TITLE,
    '--slug',
    TEST_SLUG,
    '--opened',
    '2026-05-12',
    '--lane',
    'lightweight-maintenance',
    '--owner',
    'workflow_tooling_owner',
    '--boundary',
    'llm_usability_handoff',
    '--dominant-reason',
    'test_package',
    '--next-action',
    'Create a package.',
    '--ledger',
    TEMP_LEDGER_PATH,
  ]);

  t.match(rendered, /Path: work\/packages\/todo-20260512-llm-usability-test\.md/u);
});

test('package scaffolder can infer package defaults from an artifact',
  async (t) => {
    const rendered = await runCli([
      '--from-artifact',
      FIXTURE_PATH,
      '--ledger',
      TEMP_LEDGER_PATH,
    ]);

    t.match(rendered, /Path: work\/packages\/todo-/u);
    t.match(rendered, /"lane": "causal-escalation"/u);
    t.match(rendered, /"artifact": "test\/scripts\/__fixtures__/u);
    t.match(rendered, /"owner": "operation_workflow_owner"/u);
    t.match(rendered, /work:scenario-triage/u);
    t.match(rendered, /analyze:priority-recovery-residuals/u);
  });

test('owner file index ranks files that mention owner and boundary', async (t) => {
  await fs.rm(TEMP_OWNER_ROOT, {recursive: true, force: true});
  await fs.mkdir(path.join(TEMP_OWNER_ROOT, 'src', 'rebalancer'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(TEMP_OWNER_ROOT, 'src', 'rebalancer', 'owner.js'),
    [
      `const owner = '${OWNER_NAME}';`,
      `const boundary = '${BOUNDARY_NAME}';`,
    ].join('\n'),
  );

  const index = await buildOwnerFileIndex({
    root: TEMP_OWNER_ROOT,
    owner: OWNER_NAME,
    boundary: BOUNDARY_NAME,
  });

  t.equal(index.files[0].path, 'src/rebalancer/owner.js');
  t.equal(index.files[0].ownerMatches, 1);
  t.equal(index.files[0].boundaryMatches, 1);
});

test('priority recovery residual extractor groups by owner boundary', async (t) => {
  const artifact = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
  const summary = buildPriorityRecoveryResiduals(FIXTURE_PATH, artifact);

  t.equal(summary.schemaVersion, 'priority-recovery-residuals-v1');
  t.equal(summary.splitRequired, true);
  t.ok(
    summary.ownerBoundaryGroups.some((group) =>
      group.owner === 'operation_workflow_owner' &&
      group.boundary === 'workflow_progress'),
  );
  t.ok(summary.suggestedSuccessors[0].command.includes('work:package:new'));
});

test('scenario triage combines representative and priority residual evidence',
  async (t) => {
    const artifact = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
    const summary = buildScenarioTriageSummary(FIXTURE_PATH, artifact);

    t.equal(summary.schemaVersion, 'scenario-triage-v1');
    t.equal(summary.representativeEvidence.topology.firstFrontierEdgeId,
      'priority_recovery_partition_progress');
    t.equal(summary.priorityRecoveryResiduals.schemaVersion,
      'priority-recovery-residuals-v1');
    t.match(summary.suggestedPackageCommand, /--from-artifact/u);
    t.ok(summary.extractorCommands.some((command) =>
      command.includes('work:scenario-triage')));
  });

test('subagent prompt generator emits bounded task and ledger guidance',
  async (t) => {
    const content = await writeTempPackage();
    const prompt = buildSubagentPrompt(
      'implementation',
      TEMP_PACKAGE_PATH,
      content,
    );

    t.match(prompt, /implementation Subagent Prompt/u);
    t.match(prompt, /workflow_tooling_owner/u);
    t.match(prompt, /Predecessor: `none`/u);
    t.match(prompt, /Do not widen beyond the write scope/u);
    t.match(prompt, /## Output Budget/u);
    t.match(prompt, /Profile: `medium`/u);
    t.match(prompt, /More output is not evidence/u);
    t.match(prompt, /## Tool-First Workflow/u);
    t.match(prompt, /## Write Scope/u);
    t.match(prompt, /## Commit Scope/u);
    t.match(prompt, /work:evidence-summary/u);
    t.match(prompt, /ad hoc `jq`/u);
    t.match(prompt, /Add the real returned agent name and id/u);
  });

test('subagent-next emits the next required role and prompt', async (t) => {
  await writeTempPackage();
  const lines = await buildSubagentNextLines([
    '--package',
    TEMP_PACKAGE_PATH,
  ]);
  const rendered = lines.join('\n');

  t.match(rendered, /# Next Subagent/u);
  t.match(rendered, /Role: `none`|Role: `review`/u);
});

test('llm-start combines context, doctor, dirty scope, model ledger, and evidence',
  async (t) => {
    await writeTempPackage();
    const lines = await buildLlmStartLines([
      '--package',
      TEMP_PACKAGE_PATH,
      '--ledger',
      TEMP_LEDGER_PATH,
    ]);
    const rendered = lines.join('\n');

    t.match(rendered, /# LLM Start/u);
    t.match(rendered, /## Work Context/u);
    t.match(rendered, /## Package Doctor/u);
    t.match(rendered, /## Dirty Scope/u);
    t.match(rendered, /## Model Ledger/u);
    t.match(rendered, /## Representative Evidence/u);
  });

test('llm-start gives a repair command for stale current-blocker packages',
  async (t) => {
    await fs.mkdir(TEMP_ROOT, {recursive: true});
    await fs.writeFile(
      TEMP_CURRENT_BLOCKER_PATH,
      `${JSON.stringify({
        schema: 'current-blocker-v1',
        sprint: 'work/sprints/active-test.md',
        package: TEMP_MISSING_ACTIVE_PACKAGE_PATH,
        status: 'active',
      })}\n`,
      'utf8',
    );

    try {
      await buildLlmStartLines([
        '--current-blocker',
        TEMP_CURRENT_BLOCKER_PATH,
        '--ledger',
        TEMP_LEDGER_PATH,
      ]);
      t.fail('expected stale current-blocker package to fail');
    } catch (error) {
      t.match(error.message, /Current blocker package .* is missing/u);
      t.match(error.message, /npm run work:current-blocker -- --write/u);
    }
  });
