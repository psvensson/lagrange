/**
 * Witnesses of the durable certification evidence
 * (certification-evidence-archive.js, certification-evidence-streak.js):
 * one directory per certification-requesting run, started before the
 * formation, a manifest of SHA-256 digests, a streak read only from
 * verified manifests, one run counted once, a run directory that does not
 * verify counted as a FAILED sample (B3), the quest log's recorded digest
 * lines cross-checked, the committed verdict copy readable, and the
 * harness's own earlier-run archive prune never touching it.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {
  EVIDENCE_FILE,
  VERDICT_FILES,
  archiveCertificationRun,
  describeCertificationRun,
  formatCertificationRecord,
  keepCertificationVerdict,
  openRunnerCertificationRun,
  startCertificationRun,
} from '../certification-evidence-archive.js';
import {
  evaluateCertificationStreakFromEvidence,
  parseCertificationRecords,
} from '../certification-evidence-streak.js';
import {fullLogDestPath} from '../full-node-log-capture.js';
import {LogCollector} from '../log-collector.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
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

function entry(certified = true, outcome = 'passed') {
  return {certification: {certified, requested: true, requestedSha: SHA,
    sha: certified ? SHA : null}, outcome, passed: outcome === 'passed',
  scenario: SCENARIO};
}

function writeLogs(outputDir) {
  for (const node of NODES) {
    const path = fullLogDestPath(outputDir, SCENARIO, node.id);
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, gzipSync(`{"node":"${node.id}"}\n`));
  }
}

async function archiveRun(root, outputDir, runStartedAt, certified = true,
  outcome = 'passed') {
  return archiveCertificationRun({entry: entry(certified, outcome),
    gates: [{gate: 'split-leader-host-spread', passed: true}], nodes: NODES,
    outputDir, root, runStartedAt, scenarioName: SCENARIO});
}

function runDirs(root) {
  const dirs = [];
  for (const sha of existsSync(root) ? readdirSync(root) : []) {
    for (const run of readdirSync(join(root, sha))) {
      dirs.push(join(root, sha, run));
    }
  }
  return dirs;
}

// What the operator records after every run: the printed `solve note`
// line's finding text, parsed back exactly as the probe does.
function recordAll(root, except = []) {
  const skipped = new Set(except);
  return parseCertificationRecords(arrayMap(arrayFilter(runDirs(root),
    (dir) => !skipped.has(dir)), (dir) => formatCertificationRecord(
    describeCertificationRun(dir), 'q')));
}

function streak(root, consecutive = 3, recorded = recordAll(root),
  options = {}) {
  return evaluateCertificationStreakFromEvidence({consecutive, recorded,
    root, scenario: SCENARIO, ...options});
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
      'started.json', 'report-entry.json', 'certification.json', 'gates.json',
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
        const result = streak(root, 1, []);
        assert.equal(result.samples, 0, file);
        assert.equal(result.count, 0, file);
        assert.equal(result.endedBy, 'failed', file);
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

describe('a run that left no verifiable evidence resets the streak (B3)',
  () => {
    const at = (hour) => `2026-10-05T${hour}:00:00.000Z`;

    async function certifiedAround(t, middle) {
      const dir = scratch(t);
      const root = join(dir, 'cert');
      const out = join(dir, 'out');
      writeLogs(out);
      await archiveRun(root, out, at('10'));
      const failed = await middle(root, out);
      await archiveRun(root, out, at('12'));
      await archiveRun(root, out, at('13'));
      return {failed, root};
    }

    it('a FAILED run whose directory was later edited still resets, and ' +
      'is reported by name', async (t) => {
      const {root} = await certifiedAround(t, async (evidenceRoot, out) => {
        const failed = await archiveRun(evidenceRoot, out, at('11'), false,
          'failed');
        writeFileSync(join(failed.dir, EVIDENCE_FILE.GATES), '[]\n ');
        return failed;
      });
      const result = streak(root);
      assert.equal(result.count, 2);
      assert.equal(result.done, false);
      assert.equal(result.endedBy, 'failed');
      assert.deepEqual(arrayMap(result.invalidSamples, (sample) =>
        sample.dir), [`${SHA}/2026-10-05T11-00-00-000Z`]);
      assert.match(result.invalidSamples[0].reason, /gates\.json does not match/u);
    });

    it('a run killed mid-archive (no manifest) resets', async (t) => {
      const {root} = await certifiedAround(t, async (evidenceRoot, out) => {
        const killed = await archiveRun(evidenceRoot, out, at('11'), false,
          'failed');
        unlinkSync(join(killed.dir, EVIDENCE_FILE.MANIFEST));
        unlinkSync(join(killed.dir, EVIDENCE_FILE.MANIFEST_DIGEST));
        return killed;
      });
      const result = streak(root);
      assert.equal(result.count, 2);
      assert.equal(result.done, false);
      assert.match(result.invalidSamples[0].reason,
        /no manifest\.json \(interrupted or partial run\)/u);
    });

    it('a directory holding only started.json (interrupted before the ' +
      'archive: a crash, a lost hold, SIGKILL) resets; its record line ' +
      'says so', async (t) => {
      const {failed, root} = await certifiedAround(t, (evidenceRoot) =>
        startCertificationRun({hostSet: ['boot:0'], requestedSha: SHA,
          root: evidenceRoot, runStartedAt: at('11'), scenario: SCENARIO}));
      assert.deepEqual(readdirSync(failed.dir), [EVIDENCE_FILE.STARTED]);
      const result = streak(root);
      assert.equal(result.count, 2);
      assert.equal(result.done, false);
      assert.equal(result.invalidSamples[0].startedScenario, SCENARIO);
      const line = formatCertificationRecord(describeCertificationRun(
        failed.dir), 'zero-liferaft-active-runtime');
      assert.equal(line, 'node scripts/solve.js note --id ' +
        'zero-liferaft-active-runtime --kind evidence --finding ' +
        `"certification-run scenario=${SCENARIO} sha=${SHA} start=${at('11')} ` +
        'outcome=interrupted manifest=none (no manifest: interrupted)"');
      assert.deepEqual(parseCertificationRecords([line]), [{
        manifestDigest: null, outcome: 'interrupted', scenario: SCENARIO,
        sha: SHA, start: at('11')}]);
      // A second start at the same instant refuses (nothing overwritten).
      await assert.rejects(startCertificationRun({requestedSha: SHA, root,
        runStartedAt: at('11'), scenario: SCENARIO}), /EEXIST/u);
    });

    it('a certified sample whose digest is not recorded is unrecorded and ' +
      'not counted; a recorded run whose directory was deleted resets; ' +
      'without the recorded log the streak is never done', async (t) => {
      const dir = scratch(t);
      const root = join(dir, 'cert');
      writeLogs(join(dir, 'out'));
      for (const hour of ['10', '11', '12']) {
        await archiveRun(root, join(dir, 'out'), at(hour));
      }
      assert.equal(streak(root).done, true);
      const unrecorded = runDirs(root)[2];
      const partial = streak(root, 3, recordAll(root, [unrecorded]));
      assert.equal(partial.count, 2);
      assert.equal(partial.done, false);
      assert.deepEqual(partial.unrecordedSamples,
        [`${SHA}/2026-10-05T12-00-00-000Z`]);
      const unsupplied = streak(root, 3, null);
      assert.equal(unsupplied.count, 3);
      assert.equal(unsupplied.done, false);
      assert.equal(unsupplied.recordedCheck, 'not_supplied');
      // A failed run is recorded, then its directory deleted: detectable.
      const failed = await archiveRun(root, join(dir, 'out'), at('13'), false,
        'failed');
      await archiveRun(root, join(dir, 'out'), at('14'));
      const recorded = recordAll(root);
      rmSync(failed.dir, {force: true, recursive: true});
      const deleted = streak(root, 3, recorded);
      assert.equal(deleted.count, 1);
      assert.equal(deleted.endedBy, 'failed');
      assert.deepEqual(arrayMap(deleted.missingRecordedRuns, (record) =>
        record.start), [at('13')]);
      // A rewritten run whose digest no longer matches the recorded one.
      const rewritten = runDirs(root)[3];
      const before = recordAll(root);
      rmSync(rewritten, {force: true, recursive: true});
      // Re-archived certified, with different (empty) gate records.
      await archiveCertificationRun({entry: entry(true), gates: [],
        nodes: NODES, outputDir: join(dir, 'out'), root, runStartedAt: at('14'),
        scenarioName: SCENARIO});
      const mismatch = streak(root, 1, [...before]);
      assert.notEqual(before.length, 0);
      assert.equal(mismatch.count, 0);
      assert.equal(mismatch.recordedDigestMismatches.length, 1);
    });

    it('a started.json that is not the manifest\'s run (re-digested so ' +
      'every file matches) does not verify', async (t) => {
      const dir = scratch(t);
      const root = join(dir, 'cert');
      writeLogs(join(dir, 'out'));
      const archived = await archiveRun(root, join(dir, 'out'), at('10'));
      const startedPath = join(archived.dir, EVIDENCE_FILE.STARTED);
      const started = JSON.parse(readFileSync(startedPath, 'utf8'));
      const forged = Buffer.from(JSON.stringify({...started,
        scenario: 'another-scenario'}));
      writeFileSync(startedPath, forged);
      const manifestPath = join(archived.dir, EVIDENCE_FILE.MANIFEST);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.files[0] = {bytes: forged.length, path: EVIDENCE_FILE.STARTED,
        sha256: createHash('sha256').update(forged).digest('hex')};
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      writeFileSync(manifestPath, manifestBytes);
      writeFileSync(join(archived.dir, EVIDENCE_FILE.MANIFEST_DIGEST),
        `${createHash('sha256').update(manifestBytes).digest('hex')}  ` +
        'manifest.json\n');
      const result = streak(root, 1);
      assert.equal(result.samples, 0);
      assert.match(result.invalidSamples[0].reason,
        /started\.json is not the manifest's run/u);
    });

    it('samples are ordered by run start across valid and invalid ' +
      'directories: an invalid run before the window does not block, one ' +
      'after it does', async (t) => {
      const dir = scratch(t);
      const root = join(dir, 'cert');
      writeLogs(join(dir, 'out'));
      await startCertificationRun({requestedSha: SHA, root,
        runStartedAt: at('09'), scenario: SCENARIO});
      for (const hour of ['10', '11', '12']) {
        await archiveRun(root, join(dir, 'out'), at(hour));
      }
      const older = streak(root);
      assert.equal(older.done, true);
      assert.equal(older.invalidSamples.length, 1);
      await startCertificationRun({requestedSha: SHA, root,
        runStartedAt: at('13'), scenario: SCENARIO});
      const newer = streak(root);
      assert.equal(newer.count, 0);
      assert.equal(newer.done, false);
    });
  });

describe('committed verdict copies (owner decision: option 1)', () => {
  it('the verdict files of every run are copied (never overwritten), the ' +
    'logs stay outside by digest, and the streak re-derives from the copies',
  async (t) => {
    const dir = scratch(t);
    const root = join(dir, 'cert');
    const committed = join(dir, 'committed');
    writeLogs(join(dir, 'out'));
    for (const hour of ['10', '11', '12']) {
      await archiveRun(root, join(dir, 'out'), `2026-10-05T${hour}:00:00Z`);
    }
    const interrupted = await startCertificationRun({requestedSha: SHA, root,
      runStartedAt: '2026-10-05T09:00:00Z', scenario: SCENARIO});
    const recorded = recordAll(root);
    const kept = [];
    for (const runDir of runDirs(root)) {
      kept.push(await keepCertificationVerdict({destRoot: committed, runDir}));
    }
    assert.deepEqual(kept[0].copied, [EVIDENCE_FILE.STARTED]);
    assert.equal(kept[0].dest, join(committed, SHA,
      '2026-10-05T09-00-00Z'));
    assert.deepEqual(kept[1].copied, VERDICT_FILES);
    assert.equal(kept[1].logs.length, NODES.length);
    assert.match(kept[1].logs[0].sha256, /^[0-9a-f]{64}$/u);
    assert.equal(existsSync(join(kept[1].dest, EVIDENCE_FILE.LOGS)), false);
    await assert.rejects(keepCertificationVerdict({destRoot: committed,
      runDir: interrupted.dir}), /EEXIST/u);
    const fromCopies = streak(committed, 3, recorded, {logsByDigest: true});
    assert.equal(fromCopies.done, true);
    assert.equal(fromCopies.invalidSamples.length, 1);
    // Without logsByDigest a copy without its logs does not verify.
    assert.equal(streak(committed, 3, recorded).samples, 0);
    // A committed copy whose verdict file was edited does not verify.
    writeFileSync(join(kept[2].dest, EVIDENCE_FILE.GATES), '[]\n');
    assert.equal(streak(committed, 3, recorded, {logsByDigest: true}).done,
      false);
  });

  it('the runner opens its run directory before anything is built: the ' +
    'lab harness\'s, checked, or its own, recorded on exit', async (t) => {
    const root = join(scratch(t), 'cert');
    const exits = [];
    const own = await openRunnerCertificationRun({certify: SHA,
      certifyRunDir: null, scenario: SCENARIO}, {onExit: (listener) =>
      exits.push(listener), root});
    assert.equal(own.created, true);
    assert.deepEqual(readdirSync(own.dir), [EVIDENCE_FILE.STARTED]);
    assert.equal(exits.length, 1);
    const adopted = await openRunnerCertificationRun({certify: SHA,
      certifyRunDir: own.dir, scenario: SCENARIO}, {root});
    assert.equal(adopted.created, false);
    await assert.rejects(openRunnerCertificationRun({certify: SHA,
      certifyRunDir: own.dir, scenario: 'another'}, {root}), /started\.json/u);
    await assert.rejects(openRunnerCertificationRun({certify: SHA,
      certifyRunDir: null, scenario: null}, {root}), /exactly one --scenario/u);
  });
});
