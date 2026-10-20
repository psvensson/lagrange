// Diagnostic only: prove the U1 classification manifests against the source
// tree, excluding this diagnostic itself and lab-injected data/examples
// symlink. This is an isolated lab checkout, not an update to a user worktree.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildManifest} from '../../scripts/checks/test-primary-classification.js';
import {buildResourceManifest} from '../../scripts/checks/test-resource-classification.js';
import {buildSubsystemManifest} from '../../scripts/checks/test-subsystem-classification.js';

test('U1 classification bytes match generated owners on canonical source census', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const self = fileURLToPath(import.meta.url);
  const hidden = self + '.u1-temporary-probe';
  const mount = path.join(root, 'data', 'examples');
  const hiddenMount = mount + '.u1-temporary-probe';
  let movedMount = false;
  assert.equal(fs.existsSync(hidden), false);
  assert.equal(fs.existsSync(hiddenMount), false);
  fs.renameSync(self, hidden);
  try {
    if (fs.existsSync(mount) && fs.lstatSync(mount).isSymbolicLink()) {
      fs.renameSync(mount, hiddenMount);
      movedMount = true;
    }
    const entries = [
      ['primary', 'test/shards/primary-classes.json', buildManifest],
      ['resource', 'test/shards/resource-classes.json', buildResourceManifest],
      ['subsystem', 'test/shards/subsystem-classes.json', buildSubsystemManifest],
    ];
    for (const [name, location, build] of entries) {
      const produced = build(root);
      const stored = JSON.parse(fs.readFileSync(path.join(root, location), 'utf8'));
      assert.deepEqual(produced.problems || [], []);
      assert.equal(produced.censusSize, 2413, name + ' census');
      assert.equal(produced.digest, stored.digest, name + ' owner class digest');
      assert.deepEqual(produced.classes, stored.classes, name + ' class assignments');
      if (name === 'subsystem') {
        const mismatches = Object.keys({...stored.observations, ...produced.observations})
          .filter((p) => JSON.stringify(produced.observations[p]) !==
            JSON.stringify(stored.observations[p]));
        assert.deepEqual(mismatches, [], 'OBSERVATION_CENSUS_DRIFT_AFTER_LAB_MOUNT_EXCLUSION');
        assert.equal(produced.observationDigest, stored.observationDigest);
      }
    }
  } finally {
    if (movedMount) fs.renameSync(hiddenMount, mount);
    fs.renameSync(hidden, self);
  }
  assert.equal(fs.existsSync(self), true);
});
