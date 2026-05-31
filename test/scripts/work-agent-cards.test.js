import fs from 'node:fs/promises';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildCollectLines,
  buildPlanLines,
  readPackageMetadata,
  validateAgentCardMetadata,
  validateAgentReports,
} from '../../scripts/work-agent-cards.js';

const TEMP_ROOT = 'test-output/work-agent-cards';
const REPORT_DIR = 'work/agent-reports/test-agent-cards';
const PACKAGE_PATH = path.join(TEMP_ROOT, 'active-20260531-agent-cards-test.md');

function packageMetadata() {
  return {
    schema: 'work-package-v2',
    status: 'active',
    intent: {
      opened: '2026-05-31',
      lane: 'lightweight-maintenance',
      scenario: 'none',
      artifact: 'none',
      playback: 'none',
      owner: 'workflow_tooling_owner',
      boundary: 'parallel_diagnostics',
      dominantReason: 'route_card_validation',
      currentState: 'Parallel diagnostics are being validated.',
      nextAction: 'Validate route cards.',
    },
    scope: {
      writeScope: ['scripts/work-agent-cards.js'],
      handoffFiles: [],
      generatedFiles: [],
      candidateRuntimeFiles: [],
      commitScope: ['scripts/work-agent-cards.js'],
    },
    gates: {
      stabilityCredit: 'local-proof-only',
      whyHighestLeverageNow:
        'The active sprint needs route-card diagnostics before successor selection.',
    },
    modelFit: {
      packageClass: 'lightweight-maintenance',
      intendedMinimumModel: 'gpt-5.3-codex-spark',
      scopeShape: 'workflow-tooling',
      outputProfile: 'medium',
      ambiguityScore: 1,
      escalationTriggers: ['route card schema drifts'],
    },
    parallelDiagnostics: {
      mode: 'read-only-scouts',
      requiredCards: [
        'evidence-scout',
        'model-contract-scout',
        'source-map-scout',
      ],
      reportDir: REPORT_DIR,
      coordinatorOnlyWrites: [
        'work/packages/',
        'work/sprints/current-blocker.json',
        'work/theory-ledger.md',
      ],
      routeDecisionRequired: true,
      trigger: 'test route collection',
    },
  };
}

function packageContent() {
  return [
    '# Agent Cards Test',
    '',
    '<!-- work-package',
    JSON.stringify(packageMetadata(), null, 2),
    '-->',
    '',
  ].join('\n');
}

function cardMetadata(role, overrides = {}) {
  const base = {
    schema: 'agent-route-card-v1',
    package: PACKAGE_PATH,
    agentRole: role,
    mode: 'read-only',
    status: 'complete',
    recommendedRoute: 'evidence-regeneration',
    confidence: 'medium',
    ownerBoundary: 'workflow_tooling_owner / scenario_router',
    evidenceUsed: [PACKAGE_PATH],
    mustNotEdit: ['src/'],
    writesAllowed: [],
    rationale: `${role} selected a bounded route.`,
  };
  if (role === 'evidence-scout') {
    base.stalenessRisk = 'medium';
  }
  if (role === 'model-contract-scout') {
    base.recommendedRoute = 'contract-model-repair';
    base.contractRefs = ['work/RULES.md'];
    base.modelRefs = ['.kiro/steering/schemas/work-package.schema.json'];
  }
  if (role === 'source-map-scout') {
    base.recommendedRoute = 'runtime-owner-implementation';
    base.ownerBoundary = 'workflow_tooling_owner / parallel_diagnostics';
    base.candidateFiles = ['scripts/work-agent-cards.js'];
  }
  return {...base, ...overrides};
}

function cardContent(role, overrides = {}) {
  return [
    '# Route Card',
    '',
    '<!-- agent-route-card',
    JSON.stringify(cardMetadata(role, overrides), null, 2),
    '-->',
    '',
  ].join('\n');
}

async function writeFixturePackage() {
  await fs.rm(TEMP_ROOT, {recursive: true, force: true});
  await fs.rm(REPORT_DIR, {recursive: true, force: true});
  await fs.mkdir(TEMP_ROOT, {recursive: true});
  await fs.mkdir(REPORT_DIR, {recursive: true});
  await fs.writeFile(PACKAGE_PATH, packageContent(), 'utf8');
}

async function writeCard(role, overrides = {}) {
  await fs.writeFile(
    path.join(REPORT_DIR, `${role}.md`),
    cardContent(role, overrides),
    'utf8',
  );
}

test('parallel diagnostic plan renders required card prompts', async (t) => {
  await writeFixturePackage();
  const {metadata} = await readPackageMetadata(PACKAGE_PATH);
  const lines = buildPlanLines(PACKAGE_PATH, metadata).join('\n');

  t.match(lines, /evidence-scout/u);
  t.match(lines, /model-contract-scout/u);
  t.match(lines, /source-map-scout/u);
  t.match(lines, /work\/agent-reports\/test-agent-cards/u);
});

test('agent report validation rejects missing required cards', async (t) => {
  await writeFixturePackage();
  await writeCard('evidence-scout');

  const validation = await validateAgentReports(PACKAGE_PATH);
  const errors = validation.errors.join('\n');

  t.match(errors, /missing model-contract-scout card/u);
  t.match(errors, /missing source-map-scout card/u);
});

test('agent report collection surfaces route disagreement', async (t) => {
  await writeFixturePackage();
  await writeCard('evidence-scout');
  await writeCard('model-contract-scout');
  await writeCard('source-map-scout');

  const validation = await validateAgentReports(PACKAGE_PATH);
  const lines = buildCollectLines(PACKAGE_PATH, validation).join('\n');

  t.same(validation.errors, []);
  t.match(lines, /disagreement present/u);
  t.match(lines, /evidence-regeneration/u);
  t.match(lines, /contract-model-repair/u);
  t.match(lines, /runtime-owner-implementation/u);
});

test('scout cards must remain read-only', (t) => {
  const errors = validateAgentCardMetadata(
    path.join(REPORT_DIR, 'evidence-scout.md'),
    cardMetadata('evidence-scout', {
      writesAllowed: ['src/example.js'],
      writeScope: ['src/example.js'],
      commitScope: ['scripts/example.js'],
      mustNotEdit: [],
    }),
    PACKAGE_PATH,
  ).join('\n');

  t.match(errors, /must include src\/ in mustNotEdit/u);
  t.match(errors, /must not allow writes/u);
  t.match(errors, /must not declare writeScope/u);
  t.match(errors, /must not declare commitScope/u);
  t.end();
});
