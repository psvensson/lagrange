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

import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {basename, dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateCertificationStreak} from './scenario-certification.js';
import {SCENARIO_OUTCOME} from './scenario-outcome.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const regExpExec = Function.call.bind(RegExp.prototype.exec);
const jsonStringify = JSON.stringify;

const ZERO = 0;
const UTF8 = 'utf8';
const SHA256 = 'sha256';
const HEX = 'hex';
const RUN_IDENTITY_SEPARATOR = '|';
const HOST_SEPARATOR = ',';
const UNSAFE_NAME = /[^0-9A-Za-z_-]/gu;
const SAFE_REPLACEMENT = '-';
const NO_SHA = 'no-sha';
const NO_MANIFEST = 'none';
const LOGS_PREFIX = 'logs/';
const CERTIFICATION_EVIDENCE_ROOT = fileURLToPath(new URL(
  '../../../test-output/certification', import.meta.url));

const EVIDENCE_FILE = Object.freeze({
  CERTIFICATION: 'certification.json',
  ENTRY: 'report-entry.json',
  GATES: 'gates.json',
  LOGS: 'logs',
  MANIFEST: 'manifest.json',
  MANIFEST_DIGEST: 'manifest.json.sha256',
  STARTED: 'started.json',
});

// One recorded certification run, as the runner prints it for
// `solve note --kind evidence` (formatCertificationRecord).
const RECORD_PATTERN = new RegExp('certification-run scenario=(\\S+) ' +
  'sha=(\\S+) start=(\\S+) outcome=(\\S+) manifest=([0-9a-f]{64}|none)', 'u');

const SAMPLE_FAILURE = Object.freeze({
  RECORDED_DIGEST_DIFFERS: 'its manifest digest is not the recorded one',
  RECORDED_MISSING: 'a recorded run with no evidence directory',
});

// What an unverifiable or missing run counts as: a FAILED certification
// sample (it resets the streak).
const FAILED_SAMPLE_ENTRY = Object.freeze({
  certification: Object.freeze({certified: false, requested: true}),
  outcome: SCENARIO_OUTCOME.FAILED, passed: false});

function sha256(bytes) {
  return createHash(SHA256).update(bytes).digest(HEX);
}

function safeName(value) {
  return stringReplace(String(value), UNSAFE_NAME, SAFE_REPLACEMENT);
}

/**
 * One run's identity: its start, the requested sha and its host set.
 * @param {{runStartedAt: string, requestedSha: ?string, hostSet: string[]}}
 *   input
 * @return {string}
 */
function certificationRunIdentity({runStartedAt, requestedSha, hostSet}) {
  return [String(runStartedAt), String(requestedSha ?? NO_SHA),
    (hostSet || []).join(HOST_SEPARATOR)].join(RUN_IDENTITY_SEPARATOR);
}

function listDirs(path) {
  try {
    return arrayMap(arrayFilter(readdirSync(path, {withFileTypes: true}),
      (entry) => entry.isDirectory()), (entry) => join(path, entry.name));
  } catch (_error) {
    return [];
  }
}

function readVerifiedJson(dir, path, manifest) {
  const listed = arrayFind(manifest.files || [], (file) => file.path === path);
  const bytes = readFileSync(join(dir, path));
  if (!listed || listed.sha256 !== sha256(bytes)) {
    throw new Error(`${path} does not match its manifest digest`);
  }
  return JSON.parse(bytes.toString(UTF8));
}

// A node log may live outside the directory (a committed copy keeps only
// the verdict files; the logs are bound by the manifest's digests).
function verifyListedFiles(dir, manifest, logsByDigest) {
  for (const file of manifest.files || []) {
    const path = join(dir, file.path);
    if (logsByDigest && stringStartsWith(String(file.path), LOGS_PREFIX) &&
        !existsSync(path)) {
      continue;
    }
    if (sha256(readFileSync(path)) !== file.sha256) {
      throw new Error(`${file.path} does not match its manifest digest`);
    }
  }
}

function verifyStarted(dir, manifest) {
  const started = readVerifiedJson(dir, EVIDENCE_FILE.STARTED, manifest);
  if (started.runStartedAt !== manifest.runStartedAt ||
      started.requestedSha !== manifest.requestedSha ||
      started.scenario !== manifest.scenario) {
    throw new Error('started.json is not the manifest\'s run');
  }
}

/**
 * Verify one run directory against its manifest; throws naming what does
 * not verify.
 * @param {string} dir
 * @param {{logsByDigest?: boolean}} [options]
 * @return {{entry, manifest, manifestDigest}}
 */
function verifyEvidenceDir(dir, {logsByDigest = false} = {}) {
  const manifestBytes = readFileSync(join(dir, EVIDENCE_FILE.MANIFEST));
  const recorded = stringSplit(stringTrim(readFileSync(join(dir,
    EVIDENCE_FILE.MANIFEST_DIGEST)).toString(UTF8)), ' ')[ZERO];
  if (recorded !== sha256(manifestBytes)) {
    throw new Error('manifest.json does not match manifest.json.sha256');
  }
  const manifest = JSON.parse(manifestBytes.toString(UTF8));
  verifyListedFiles(dir, manifest, logsByDigest);
  if (manifest.runIdentity !== certificationRunIdentity(manifest)) {
    throw new Error('manifest runIdentity is not its run start, sha and hosts');
  }
  verifyStarted(dir, manifest);
  const entry = readVerifiedJson(dir, EVIDENCE_FILE.ENTRY, manifest);
  const certification = readVerifiedJson(dir, EVIDENCE_FILE.CERTIFICATION,
    manifest);
  if (jsonStringify(entry.certification) !== jsonStringify(certification)) {
    throw new Error('certification.json is not the entry\'s certification');
  }
  return {entry, manifest, manifestDigest: recorded};
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
function parseCertificationRecords(texts) {
  const records = [];
  for (const text of texts || []) {
    const match = regExpExec(RECORD_PATTERN, String(text));
    if (match !== null) {
      records.push({manifestDigest: match[5] === NO_MANIFEST ? null : match[5],
        outcome: match[4], scenario: match[1], sha: match[2], start: match[3]});
    }
  }
  return records;
}

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
