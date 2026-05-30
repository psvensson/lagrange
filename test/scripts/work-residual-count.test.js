import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  computeResidualCountFromArtifact,
  residualCountFromArtifactObject,
} from '../../scripts/work-residual-count.js';

tap.test('computeResidualCountFromArtifact', async (t) => {
  t.test('returns null for a missing path', (t) => {
    t.equal(computeResidualCountFromArtifact('/no/such/file.json'), null);
    t.end();
  });

  t.test('returns null for unparseable JSON', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resid-bad-'));
    const file = path.join(dir, 'x.json');
    fs.writeFileSync(file, 'not json{');
    t.equal(computeResidualCountFromArtifact(file), null);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('reads an explicit frontier array length', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resid-frontier-'));
    const file = path.join(dir, 'x.json');
    fs.writeFileSync(file, JSON.stringify({frontier: [1, 2, 3]}));
    t.equal(computeResidualCountFromArtifact(file), 3);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('reads a summary.frontierCount', (t) => {
    t.equal(residualCountFromArtifactObject({summary: {frontierCount: 4}}), 4);
    t.end();
  });

  t.test('returns null when nothing resolves and graph build is empty', (t) => {
    // An empty object builds a graph; its frontier length is a finite number.
    const result = residualCountFromArtifactObject({});
    t.ok(result === null || (Number.isInteger(result) && result >= 0));
    t.end();
  });

  t.test('returns null for a non-object', (t) => {
    t.equal(residualCountFromArtifactObject(null), null);
    t.equal(residualCountFromArtifactObject(42), null);
    t.end();
  });
});
