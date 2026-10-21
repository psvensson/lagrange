// Diagnostic branch only. Read the live producer and report environmental
// drift without modifying metadata, production, or any worktree input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {buildSubsystemManifest} from '../../scripts/checks/test-subsystem-classification.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const diagnosticPath = 'test/closure/original-handoff-static.integration.test.js';

test('diagnose exact-candidate subsystem metadata environmental drift', () => {
  const committed = JSON.parse(fs.readFileSync(
    path.join(root, 'test/shards/subsystem-classes.json'), 'utf8'));
  const generated = buildSubsystemManifest(root);
  const differences = [];
  for (const name of new Set([
    ...Object.keys(committed.observations), ...Object.keys(generated.observations),
  ])) {
    if (name === diagnosticPath) continue;
    const before = committed.observations[name];
    const after = generated.observations[name];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      differences.push({name, committed: before, generated: after});
    }
  }
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'],
    {cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  const report = {
    node: process.version,
    committedCensus: committed.censusSize,
    generatedCensus: generated.censusSize,
    classificationEqual: JSON.stringify(committed.classes) === JSON.stringify(generated.classes),
    problemCount: generated.problems.length,
    problems: generated.problems,
    diagnosticSelfExcludedFromComparison: diagnosticPath,
    differenceCount: differences.length,
    differences: differences.slice(0, 50),
    untrackedExit: untracked.status,
    untrackedPaths: untracked.stdout?.split('\n').filter(Boolean).slice(0, 100),
    gitError: untracked.error?.message ?? untracked.stderr,
  };
  process.stdout.write(`SUBSYSTEM_ENVIRONMENT_DIAGNOSTIC ${JSON.stringify(report)}\n`);
  assert.deepEqual(differences, [], 'environmental drift remains; diagnostic is not acceptance');
});
