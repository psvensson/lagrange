import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readJson, verifyStage, verifyPacked, GraphRefusal, packetErrors,
  LIMITS, outcomeFor, inventory, classify, digest, verifySource,
} from '../../scripts/checks/npm-staging-feasibility-evidence.js';

// Deliberate controls against the actual frozen source and generated output, not toy claims.
const artifactRoot = process.env.NPM_STAGING_EVIDENCE_ROOT;
test('source-bound staging and counterfeits', () => {
  assert.ok(artifactRoot, 'NPM_STAGING_EVIDENCE_ROOT must name a frozen diagnostic run');
  const {first, second, packet} = readJson(path.join(artifactRoot, 'run.json'));
  const graph = classify(first.inputRoot, inventory(first.inputRoot));
  assert.equal(digest(graph), digest(first.graph));
  verifySource(first.sourceRoot, first.inputRoot, inventory(first.inputRoot));
  const meta = readJson(path.join(first.runRoot, 'metafile.json'));
  const positive = verifyStage(first.inputRoot, first.outputRoot, graph, meta);
  assert.equal(positive.inventoryDigest, second.stats.inventoryDigest);
  assert.deepEqual(positive.violations, first.violations);
  assert.equal(packet.outcome, outcomeFor(first.stats, positive.violations.length));
  const packed = readJson(path.join(first.runRoot, 'npm-pack.json'));
  const tarBytes = fs.readFileSync(first.tarball);
  const tarRows = inventory(first.tarRoot);
  verifyPacked(packed, positive.inventory, tarBytes, tarRows);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-staging-controls-'));
  const controls = [];
  const rejects = (name, fn, expected) => {
    let reason;
    assert.throws(fn, (error) => {
      reason = error.message;
      return error instanceof GraphRefusal && reason.includes(expected);
    });
    controls.push({name, rejected: true, reason});
  };
  try {
    const copy = path.join(scratch, 'package');
    fs.cpSync(first.outputRoot, copy, {recursive: true});
    const alter = (name, content, action) => {
      const file = path.join(copy, name);
      const original = fs.readFileSync(file);
      try {
        if (content === null) fs.unlinkSync(file);
        else fs.writeFileSync(file, content);
        action();
      } finally {
        fs.writeFileSync(file, original);
      }
    };
    const check = () => verifyStage(first.inputRoot, copy, graph, meta);
    alter('src/threading/service-worker.js', null, () =>
      rejects('missing-worker', check, 'missing-entry:'));
    alter('src/lagrange-runtime-startup.js', null, () =>
      rejects('missing-computed', check, 'missing-entry:'));
    alter('src/admin/static/playback-viewer.html', 'counterfeit', () =>
      rejects('changed-asset', check, 'preserved-bytes:'));
    alter('src/public-api.js', `export * from '${first.inputRoot}/src/public-api.js';`, () =>
      rejects('input-root-external', check, 'root-leak:'));
    const overlap = structuredClone(meta);
    overlap.inputs['src/storage/sqlite-prepared-statement-owner.js'] = {bytes: 1, imports: []};
    rejects('raw-compiled-overlap', () =>
      verifyStage(first.inputRoot, first.outputRoot, graph, overlap), 'raw-compiled-overlap:');
    rejects('forged-count', () => verifyPacked({...packed, entryCount: packed.entryCount - 1},
      positive.inventory, tarBytes, tarRows), 'packed-count');
    rejects('forged-hash', () => verifyPacked({...packed, integrity: 'sha512-counterfeit'},
      positive.inventory, tarBytes, tarRows), 'packed-hash');
    assert.equal(outcomeFor({...first.stats, entries: LIMITS.entries + 1}), 'budget_exceeded');
    assert.equal(outcomeFor(first.stats, 1), 'graph_refused');
    assert.ok(packetErrors({...packet, limits: {...LIMITS, entries: 9999}}).includes('limits'));
    assert.ok(packetErrors({...packet, source: 'counterfeit'}).includes('source'));
    assert.ok(packetErrors({...packet, ceiling: {}}).includes('ceiling'));
    assert.ok(packetErrors({...packet, candidate: []}).includes('candidate-binding'));
    assert.ok(packetErrors({...packet, artifacts: []}).includes('artifacts-binding'));
    const badGraph = {...packet.graph, raw: '', compiled: '', modules: '', digest: 'fake'};
    const errors = packetErrors({...packet, graph: badGraph});
    assert.ok(errors.includes('graph-counts'));
    assert.ok(errors.includes('graph-hash'));
    fs.writeFileSync(path.join(artifactRoot, 'controls.json'), JSON.stringify(controls, null, 2) + '\n');
  } finally {
    fs.rmSync(scratch, {recursive: true});
  }
});

test('CLI refusal preserves preexisting failure evidence and never writes under probe', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-staging-refusal-'));
  const script = fileURLToPath(new URL('../../scripts/npm-package-stage-diagnostic.js',
    import.meta.url));
  const timeout = 10000;
  const sentinel = 'preserved-first-failure\n';
  const failureFile = path.join(scratch, 'first-unexpected.json');
  fs.writeFileSync(failureFile, sentinel);
  try {
    for (const probe of ['0', '1']) {
      const result = spawnSync(process.execPath, [script, scratch], {
        env: {...process.env, LAGRANGE_PROBE: probe}, encoding: 'utf8', timeout,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, probe === '1' ? /refused under LAGRANGE_PROBE/u : /EEXIST/u);
      assert.equal(fs.readFileSync(failureFile, 'utf8'), sentinel);
      assert.deepEqual(fs.readdirSync(scratch), ['first-unexpected.json']);
    }
    const absent = path.join(scratch, 'absent');
    const result = spawnSync(process.execPath, [script, absent], {
      env: {...process.env, LAGRANGE_PROBE: '1'}, encoding: 'utf8', timeout,
    });
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(absent), false);
    const admitted = path.join(scratch, 'admitted');
    const failed = spawnSync(process.execPath, [script, admitted], {
      env: {...process.env, LAGRANGE_PROBE: '0', PATH: path.join(scratch, 'no-tools')},
      encoding: 'utf8', timeout,
    });
    assert.equal(failed.status, 1);
    const recorded = path.join(admitted, 'first-unexpected.json');
    const original = fs.readFileSync(recorded, 'utf8');
    assert.match(JSON.parse(original).message, /git.*ENOENT/u);
    const retry = spawnSync(process.execPath, [script, admitted], {
      env: {...process.env, LAGRANGE_PROBE: '0'}, encoding: 'utf8', timeout,
    });
    assert.equal(retry.status, 1);
    assert.equal(fs.readFileSync(recorded, 'utf8'), original);
  } finally {
    fs.rmSync(scratch, {recursive: true});
  }
});
