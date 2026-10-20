// Diagnostic only: derive the existing repository classification owners
// against the precise 38-file U1 candidate, without adding this diagnostic
// to their test census. Executes in a disposable lab checkout only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildManifest} from '../../scripts/checks/test-primary-classification.js';
import {buildResourceManifest} from '../../scripts/checks/test-resource-classification.js';
import {buildSubsystemManifest} from '../../scripts/checks/test-subsystem-classification.js';

function changes(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return [...keys].sort().filter((key) => JSON.stringify(left?.[key]) !==
    JSON.stringify(right?.[key])).map((key) =>
    ({path: key, before: left?.[key] ?? null, after: right?.[key] ?? null}));
}

test('read-only classification census of the exact 38-file U1 candidate', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const original = fileURLToPath(import.meta.url);
  const hidden = original + '.probe-hidden';
  assert.equal(fs.existsSync(hidden), false, 'exclusive diagnostic path required');
  const output = {};
  // The only temporary filesystem operation is hiding this diagnostic file
  // from the census it inspects. Every ordinary test and production file is
  // read-only; the diagnostic is restored in finally before exit.
  fs.renameSync(original, hidden);
  try {
    const specs = [
      ['primary', 'test/shards/primary-classes.json', buildManifest],
      ['resource', 'test/shards/resource-classes.json', buildResourceManifest],
      ['subsystem', 'test/shards/subsystem-classes.json', buildSubsystemManifest],
    ];
    for (const [kind, location, build] of specs) {
      const produced = build(root);
      const stored = JSON.parse(fs.readFileSync(path.join(root, location), 'utf8'));
      const delta = changes(stored.classes, produced.classes);
      const observationDelta = kind === 'subsystem' ?
        changes(stored.observations, produced.observations) : [];
      output[kind] = {
        count: produced.censusSize, digest: produced.digest,
        counts: produced.counts,
        problems: produced.problems || [],
        classDelta: delta,
        observationDelta: observationDelta.slice(0, 15),
        observationDeltaCount: observationDelta.length,
        observationDigest: produced.observationDigest || null,
        oldDigest: stored.digest,
        oldObservationDigest: stored.observationDigest || null,
      };
    }
  } finally {
    fs.renameSync(hidden, original);
  }
  assert.equal(fs.existsSync(original), true, 'diagnostic was restored');
  console.log('U1_METADATA_CENSUS_RESULT=' + JSON.stringify(output));
  for (const manifest of Object.values(output)) {
    assert.deepEqual(manifest.problems, [], 'classification owner returned problems');
  }
});
