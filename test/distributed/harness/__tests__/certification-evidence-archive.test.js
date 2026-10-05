/**
 * Witnesses of the durable certification evidence
 * (certification-evidence-archive.js): one directory per certification-
 * requesting run, a manifest of SHA-256 digests, a streak read only from
 * verified manifests, one run counted once, a tampered sample refused, and
 * the harness's own earlier-run archive prune never touching it.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {
  EVIDENCE_FILE,
  archiveCertificationRun,
  evaluateCertificationStreakFromEvidence,
} from '../certification-evidence-archive.js';
import {fullLogDestPath} from '../full-node-log-capture.js';
import {LogCollector} from '../log-collector.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayMap = Function.call.bind(Array.prototype.map);
const stringReplace = Function.call.bind(String.prototype.replace);

const SHA = '0123456789abcdef0123456789abcdef01234567';
const SCENARIO = 'public-path-multinode-baseline';
const NODES = Object.freeze(arrayMap([0, 1, 2, 3, 4], (index) => ({
  hostIdentity: {hostId: `boot:${index}`}, id: `n${index}`})));

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'certification-evidence-'));
  t.after(() => rmSync(dir, {force: true, recursive: true}));
  return dir;
}

function entry(certified = true) {
  return {certification: {certified, requested: true, requestedSha: SHA,
    sha: certified ? SHA : null}, outcome: 'passed', passed: true,
  scenario: SCENARIO};
}

function writeLogs(outputDir) {
  for (const node of NODES) {
    const path = fullLogDestPath(outputDir, SCENARIO, node.id);
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, gzipSync(`{"node":"${node.id}"}\n`));
  }
}

async function archiveRun(root, outputDir, runStartedAt, certified = true) {
  return archiveCertificationRun({entry: entry(certified),
    gates: [{gate: 'split-leader-host-spread', passed: true}], nodes: NODES,
    outputDir, root, runStartedAt, scenarioName: SCENARIO});
}

function streak(root, consecutive = 3) {
  return evaluateCertificationStreakFromEvidence({consecutive, root,
    scenario: SCENARIO});
}

describe('durable certification evidence (S4)', () => {
  it('a run is archived with its entry, certification, gates and every ' +
    'node log; the manifest lists each digest and its own digest verifies',
  async (t) => {
    const dir = scratch(t);
    const outputDir = join(dir, 'out');
    writeLogs(outputDir);
    const archived = await archiveRun(join(dir, 'cert'), outputDir,
      '2026-10-05T10:00:00.000Z');
    const manifestBytes = readFileSync(join(archived.dir,
      EVIDENCE_FILE.MANIFEST));
    assert.equal(archived.manifestDigest,
      createHash('sha256').update(manifestBytes).digest('hex'));
    assert.match(readFileSync(join(archived.dir,
      EVIDENCE_FILE.MANIFEST_DIGEST), 'utf8'),
    new RegExp(`^${archived.manifestDigest}  manifest\\.json\\n$`, 'u'));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    assert.deepEqual(arrayMap(manifest.files, (file) => file.path), [
      'report-entry.json', 'certification.json', 'gates.json',
      'logs/n0.log.gz', 'logs/n1.log.gz', 'logs/n2.log.gz', 'logs/n3.log.gz',
      'logs/n4.log.gz']);
    assert.deepEqual(manifest.hostSet, ['boot:0', 'boot:1', 'boot:2',
      'boot:3', 'boot:4']);
    assert.equal(manifest.runIdentity, `2026-10-05T10:00:00.000Z|${SHA}|` +
      'boot:0,boot:1,boot:2,boot:3,boot:4');
    assert.match(archived.dir, new RegExp(`${SHA}/2026-10-05T10-00-00-000Z$`,
      'u'));
    // Evidence is never overwritten, not even partly.
    const entryBytes = readFileSync(join(archived.dir, EVIDENCE_FILE.ENTRY));
    await assert.rejects(archiveRun(join(dir, 'cert'), outputDir,
      '2026-10-05T10:00:00.000Z', false), /EEXIST/u);
    assert.deepEqual(readFileSync(join(archived.dir, EVIDENCE_FILE.ENTRY)),
      entryBytes);
  });

  it('three certified runs at one sha make the streak; an uncertified ' +
    'certification run resets it', async (t) => {
    const dir = scratch(t);
    const root = join(dir, 'cert');
    writeLogs(join(dir, 'out'));
    for (const minute of ['01', '02', '03']) {
      await archiveRun(root, join(dir, 'out'), `2026-10-05T10:${minute}:00Z`);
    }
    assert.equal(streak(root).done, true);
    assert.equal(streak(root).samples, 3);
    await archiveRun(root, join(dir, 'out'), '2026-10-05T10:04:00Z', false);
    assert.equal(streak(root).count, 0);
    assert.equal(streak(root).endedBy, 'failed');
  });

  it('one run copied twice (same run identity) counts once', async (t) => {
    const dir = scratch(t);
    const root = join(dir, 'cert');
    writeLogs(join(dir, 'out'));
    const archived = await archiveRun(root, join(dir, 'out'),
      '2026-10-05T10:00:00Z');
    cpSync(archived.dir, `${archived.dir}-copy`, {recursive: true});
    cpSync(archived.dir, `${archived.dir}-copy2`, {recursive: true});
    const result = streak(root);
    assert.equal(result.count, 1);
    assert.equal(result.done, false);
    assert.equal(result.duplicateSamples.length, 2);
  });

  it('a tampered log, entry or manifest is not a sample and is reported',
    async (t) => {
      const dir = scratch(t);
      writeLogs(join(dir, 'out'));
      for (const [file, content] of [['logs/n2.log.gz', 'edited'],
        [EVIDENCE_FILE.MANIFEST, '{}'],
        [EVIDENCE_FILE.ENTRY, JSON.stringify(entry(true))]]) {
        const root = join(dir, `cert-${stringReplace(file, /\W/gu, '-')}`);
        const archived = await archiveRun(root, join(dir, 'out'),
          '2026-10-05T10:00:00Z', file === EVIDENCE_FILE.ENTRY ? false : true);
        writeFileSync(join(archived.dir, file), content);
        const result = streak(root, 1);
        assert.equal(result.samples, 0, file);
        assert.equal(result.count, 0, file);
        assert.equal(result.invalidSamples.length, 1, file);
        assert.match(result.invalidSamples[0].reason,
          /does not match/u, file);
      }
    });

  it('the harness archive prune of earlier runs leaves certification ' +
    'evidence intact', async (t) => {
    const dir = scratch(t);
    const outputDir = join(dir, 'test-output');
    const root = join(outputDir, 'certification');
    writeLogs(outputDir);
    await archiveRun(root, outputDir, '2026-10-05T10:00:00Z');
    const collector = new LogCollector(outputDir);
    for (let run = 0; run < 6; run += 1) {
      mkdirSync(join(outputDir, SCENARIO), {recursive: true});
      writeFileSync(join(outputDir, SCENARIO, '_timeline.log'), `run ${run}`);
      writeLogs(outputDir);
      await collector.archivePreviousScenarioRun(SCENARIO, {log: () => {}});
    }
    const result = streak(root, 1);
    assert.equal(result.samples, 1);
    assert.equal(result.invalidSamples.length, 0);
    assert.equal(result.done, true);
  });
});
