/**
 * The certification streak, read from durable evidence only
 * (certification-evidence-archive.js writes it).
 *
 * The sample model (verifier finding B3):
 * - every run directory under `<root>/<sha>/<run start>/` is a sample;
 * - a directory whose manifest verifies is its report entry: certified at
 *   its sha counts, uncertified resets, refused is not a sample;
 * - a directory that does NOT verify (no manifest because the run was
 *   interrupted or killed mid-archive, only `started.json`, a digest
 *   mismatch, a partial copy) is a FAILED sample: it resets the streak, is
 *   ordered by its directory name (the run start), and is reported by name;
 * - with the quest log's recorded digest lines (`recorded`): a recorded run
 *   whose directory is missing, or whose manifest digest differs from the
 *   recorded one, is a FAILED sample at its recorded run start; a certified
 *   sample whose digest is not recorded is `unrecorded` and not counted.
 *   Without `recorded` the streak is never done (the claim is made only
 *   over recorded runs).
 *
 * What stays undetectable: a run directory deleted before anyone recorded
 * its digest line. The operating rule is therefore: record the printed
 * `solve note` line after EVERY certification run.
 */

import {readFileSync, readdirSync} from 'node:fs';
import {basename, dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateCertificationStreak} from './scenario-certification.js';
import {SCENARIO_OUTCOME} from './scenario-outcome.js';
import {
  EVIDENCE_FILE, NO_MANIFEST, certificationRunIdentity, parseCertificationRecords,
  safeName, sha256, verifyEvidenceDir,
} from '../../../src/utils/certification-evidence-record.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);

const ZERO = 0;
const UTF8 = 'utf8';
const CERTIFICATION_EVIDENCE_ROOT = fileURLToPath(new URL(
  '../../../test-output/certification', import.meta.url));

const SAMPLE_FAILURE = Object.freeze({
  RECORDED_DIGEST_DIFFERS: 'its manifest digest is not the recorded one',
  RECORDED_MISSING: 'a recorded run with no evidence directory',
});

// What an unverifiable or missing run counts as: a FAILED certification
// sample (it resets the streak).
const FAILED_SAMPLE_ENTRY = Object.freeze({
  certification: Object.freeze({certified: false, requested: true}),
  outcome: SCENARIO_OUTCOME.FAILED, passed: false});

function listDirs(path) {
  try {
    return arrayMap(arrayFilter(readdirSync(path, {withFileTypes: true}),
      (entry) => entry.isDirectory()), (entry) => join(path, entry.name));
  } catch (_error) {
    return [];
  }
}

function readStartedLoosely(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, EVIDENCE_FILE.STARTED), UTF8));
  } catch (_error) {
    return null;
  }
}

function describeFailure(error) {
  return error?.code === 'ENOENT' ?
    `no ${basename(String(error.path || ''))} (interrupted or partial run)` :
    String(error?.message || error);
}

/**
 * Every run directory under the root: verified samples of the scenario
 * (one per run identity) and every directory that does not verify.
 * @param {{root?: string, scenario: string, logsByDigest?: boolean}} input
 * @return {{samples, invalid, duplicates}}
 */
function readCertificationEvidence({root = CERTIFICATION_EVIDENCE_ROOT,
  scenario, logsByDigest = false}) {
  const samples = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();
  for (const shaDir of arraySort(listDirs(root))) {
    for (const dir of arraySort(listDirs(shaDir))) {
      const where = {dir: relative(root, dir), key: basename(dir),
        shaDir: basename(shaDir)};
      let verified;
      try {
        verified = verifyEvidenceDir(dir, {logsByDigest});
      } catch (error) {
        // Fail closed: an unverifiable run resets every scenario's streak
        // (its own scenario claim is unverified too).
        invalid.push({...where, reason: describeFailure(error),
          started: readStartedLoosely(dir)});
        continue;
      }
      if (verified.manifest.scenario !== scenario) {
        continue;
      }
      if (seen.has(verified.manifest.runIdentity)) {
        duplicates.push({dir: where.dir,
          runIdentity: verified.manifest.runIdentity});
        continue;
      }
      seen.add(verified.manifest.runIdentity);
      samples.push({...verified, ...where,
        key: safeName(verified.manifest.runStartedAt)});
    }
  }
  return {duplicates, invalid, samples};
}

/**
 * The certification-run records in recorded `solve note` finding texts.
 * @param {Array<string>} texts
 * @return {Array<{scenario, sha, start, outcome, manifestDigest}>}
 */
function sameRun(sample, record) {
  return sample.key === safeName(record.start) &&
    sample.shaDir === safeName(record.sha);
}

// Cross-check the samples against the recorded runs: a recorded run
// without a directory, or whose digest differs, fails; a certified sample
// whose digest is not recorded is unrecorded (not counted).
function crossCheckRecorded(timeline, recorded, scenario) {
  const records = arrayFilter(recorded, (record) =>
    record.scenario === scenario);
  const digests = new Set(arrayMap(records, (record) => record.manifestDigest));
  const missing = [];
  for (const record of records) {
    const sample = arrayFind(timeline, (entry) => sameRun(entry, record));
    if (sample === undefined) {
      missing.push({failure: SAMPLE_FAILURE.RECORDED_MISSING,
        key: safeName(record.start), record, shaDir: safeName(record.sha)});
    } else if (sample.manifestDigest !== undefined &&
        sample.manifestDigest !== record.manifestDigest) {
      sample.failure = SAMPLE_FAILURE.RECORDED_DIGEST_DIFFERS;
    }
  }
  for (const sample of timeline) {
    sample.unrecorded = sample.failure === undefined &&
      sample.entry?.certification?.certified === true &&
      !digests.has(sample.manifestDigest);
  }
  return missing;
}

function newestFirst(left, right) {
  return String(right.key).localeCompare(String(left.key));
}

/**
 * The certification streak of a scenario, from durable evidence only (see
 * the module header for the sample model).
 * @param {{root?: string, scenario: string, consecutive: number,
 *   recorded?: ?Array, logsByDigest?: boolean}} input `recorded`: the
 *   quest log's certification-run records (parseCertificationRecords).
 * @return {Object} evaluateCertificationStreak's result plus
 *   {samples, invalidSamples, duplicateSamples, unrecordedSamples,
 *   missingRecordedRuns, recordedCheck, newest}
 */
function evaluateCertificationStreakFromEvidence({root, scenario,
  consecutive, recorded = null, logsByDigest = false}) {
  const evidence = readCertificationEvidence({logsByDigest, root, scenario});
  const timeline = [...evidence.samples, ...arrayMap(evidence.invalid,
    (entry) => ({...entry, failure: entry.reason}))];
  const missing = recorded === null ? [] :
    crossCheckRecorded(timeline, recorded, scenario);
  const ordered = arraySort([...timeline, ...missing], newestFirst);
  const counted = arrayFilter(ordered, (sample) => sample.unrecorded !== true);
  const streak = evaluateCertificationStreak(arrayMap(counted, (sample) =>
    (sample.failure === undefined ? sample.entry : FAILED_SAMPLE_ENTRY)),
  consecutive);
  const newest = evidence.samples.length > ZERO ?
    arraySort([...evidence.samples], newestFirst)[ZERO] : null;
  return {...streak, done: streak.done && recorded !== null,
    duplicateSamples: evidence.duplicates,
    invalidSamples: arrayMap(evidence.invalid, ({dir, reason, started}) =>
      ({dir, reason, startedScenario: started?.scenario ?? null})),
    missingRecordedRuns: arrayMap(missing, (entry) => entry.record),
    newest: newest ? {dir: newest.dir,
      manifestDigest: newest.manifestDigest} : null,
    recordedCheck: recorded === null ? 'not_supplied' : 'checked',
    recordedDigestMismatches: arrayMap(arrayFilter(timeline, (sample) =>
      sample.failure === SAMPLE_FAILURE.RECORDED_DIGEST_DIFFERS),
    (sample) => sample.dir),
    samples: evidence.samples.length,
    unrecordedSamples: arrayMap(arrayFilter(timeline,
      (sample) => sample.unrecorded === true), (sample) => sample.dir)};
}

/**
 * Where a run directory's sha lives: its parent directory's name.
 * @param {string} runDir
 * @return {string}
 */
function shaDirOf(runDir) {
  return basename(dirname(runDir));
}

export {
  CERTIFICATION_EVIDENCE_ROOT,
  EVIDENCE_FILE,
  NO_MANIFEST,
  certificationRunIdentity,
  evaluateCertificationStreakFromEvidence,
  parseCertificationRecords,
  safeName,
  sha256,
  shaDirOf,
  verifyEvidenceDir,
};
