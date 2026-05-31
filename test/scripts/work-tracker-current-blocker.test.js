import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {normalizeMetadata} from '../../scripts/work-package-schema.js';
import {buildCurrentBlockerPayload} from '../../scripts/work-tracker.js';

const CURRENT_BLOCKER_JSON = 'work/sprints/current-blocker.json';

describe('work-tracker current-blocker command', () => {
  it('refreshes canonical current-blocker json successfully and matches structure',
    async () => {
    // Run the current-blocker refresh command
    const output = execSync('node scripts/work-tracker.js current-blocker --write', { encoding: 'utf8' });
    assert.match(output, /Updated /u);
    assert.match(output, /current-blocker\.json/u);
    assert.doesNotMatch(output, /current-blocker\.md/u);

    // Read the current-blocker.json
    const jsonContent = await fs.readFile(CURRENT_BLOCKER_JSON, 'utf8');
    const payload = JSON.parse(jsonContent);

    assert.ok(payload.schema);
    assert.ok(payload.package);
    assert.ok(payload.status);
    assert.doesNotMatch(JSON.stringify(payload), /current-blocker\.md/u);
  });

  it('renders markdown on demand without making it part of repair output', () => {
    const output = execSync('node scripts/work-tracker.js current-blocker --markdown', { encoding: 'utf8' });
    assert.match(output, /# Current Blocker/u);
  });

  it('derives lifecycle and commit scope without handwritten mirrors', () => {
    const packagePath =
      'work/packages/active-20260531-derived-metadata-test.md';
    const metadata = normalizeMetadata({
      schema: 'work-package-v2',
      intent: {
        lane: 'lightweight-maintenance',
        scenario: 'none',
        artifact: 'none',
        playback: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'metadata_derivation',
        dominantReason: 'admin_reduction',
        currentState: 'testing derived metadata',
        nextAction: 'derive payload',
      },
      scope: {
        writeScope: ['scripts/work-tracker.js'],
        handoffFiles: [],
        generatedFiles: [
          'work/sprints/current-blocker.json',
          'work/sprints/current-blocker.md',
        ],
        candidateRuntimeFiles: [],
        commitScopeExtra: ['test/scripts/work-tracker-current-blocker.test.js'],
        commitScopeExclude: ['work/sprints/current-blocker.json'],
      },
      gates: {
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'test',
      },
      modelFit: {
        packageClass: 'bounded-implementation',
        intendedMinimumModel: 'gpt-5.3-codex-spark',
        scopeShape: 'leaf-slice',
        outputProfile: 'medium',
        ambiguityScore: 1,
        escalationTriggers: ['test'],
      },
      execution: {
        proof: {
          commands: ['regression: node --test test/scripts/work-tracker-current-blocker.test.js'],
        },
      },
    }, packagePath);

    const payload = buildCurrentBlockerPayload(
      'work/sprints/active-test.md',
      packagePath,
      metadata,
    );

    assert.equal(payload.status, 'active');
    assert.equal(metadata.opened, '2026-05-31');
    assert.deepEqual(payload.commitScope, [
      'scripts/work-tracker.js',
      'test/scripts/work-tracker-current-blocker.test.js',
      packagePath,
    ]);
    assert.deepEqual(payload.generatedFiles, ['work/sprints/current-blocker.json']);
  });
});
