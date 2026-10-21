// Diagnostic-only branch: compact read-only environment comparison.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {buildSubsystemManifest} from '../../scripts/checks/test-subsystem-classification.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const diagnosticPath = 'test/closure/original-handoff-static.integration.test.js';
function gitObservation(args, env = process.env) {
  const result = spawnSync('git', args, {cwd: root, env, encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024});
  return {status: result.status, signal: result.signal, error: result.error?.message,
    bytes: Buffer.byteLength(result.stdout || ''),
    output: (result.stdout || '').slice(0, 1500), stderr: result.stderr};
}

test('diagnose exact-candidate subsystem metadata environmental drift', () => {
  const committed = JSON.parse(fs.readFileSync(
    path.join(root, 'test/shards/subsystem-classes.json'), 'utf8'));
  const generated = buildSubsystemManifest(root);
  const differences = [];
  for (const name of new Set([
    ...Object.keys(committed.observations), ...Object.keys(generated.observations),
  ])) {
    if (name === diagnosticPath) continue;
    const before = committed.observations[name] || {};
    const after = generated.observations[name] || {};
    const changes = {};
    for (const kind of ['files', 'directories', 'env']) {
      const added = (after[kind] || []).filter((value) => !(before[kind] || []).includes(value));
      const removed = (before[kind] || []).filter((value) => !(after[kind] || []).includes(value));
      if (added.length || removed.length) changes[kind] = {added, removed};
    }
    if (Object.keys(changes).length) differences.push({name, changes});
  }
  const report = {
    node: process.version,
    committedCensus: committed.censusSize, generatedCensus: generated.censusSize,
    problems: generated.problems,
    diagnosticSelfExcludedFromComparison: diagnosticPath,
    differenceCount: differences.length, differences,
    repositoryPointerNames: Object.keys(process.env).filter((key) =>
      ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX'].includes(key)),
    rawRoot: gitObservation(['rev-parse', '--show-toplevel']),
    sanitizedRoot: gitObservation(['rev-parse', '--show-toplevel'], gitProcessEnvironment()),
    tracked: gitObservation(['ls-files', '-z']),
    untracked: gitObservation(['ls-files', '-z', '--others', '--exclude-standard']),
    sanitizedUntracked: gitObservation(['ls-files', '-z', '--others', '--exclude-standard'],
      gitProcessEnvironment()),
  };
  process.stdout.write(`SUBSYSTEM_ENVIRONMENT_DIAGNOSTIC ${JSON.stringify(report)}\n`);
  assert.equal(differences.length, 0, 'diagnostic environmental differences remain');
});
