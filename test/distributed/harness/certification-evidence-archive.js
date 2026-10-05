/**
 * Durable certification evidence: every scenario run that REQUESTED
 * certification (certified or not) is copied, once, into its own directory
 * that no harness archive or prune touches (log-collector.js prunes only
 * `{outputDir}/{scenario}/.previous-*`):
 *
 *   test-output/certification/<requested sha>/<run start, ':' '.' -> '-'>/
 *     report-entry.json   the scenario's report entry as written
 *     certification.json  its certification block
 *     gates.json          the run's gate records (the certification ledger)
 *     logs/<node>.log.gz  every node's full log of the run
 *     manifest.json       {schema, scenario, requestedSha, sha, certified,
 *                          outcome, runStartedAt, hostSet, runIdentity,
 *                          files: [{path, bytes, sha256}], missingNodeLogs}
 *     manifest.json.sha256  the SHA-256 of manifest.json
 *
 * Evidence is archived, never deleted or overwritten (an existing run
 * directory refuses). The certification streak reads its samples from these
 * manifests only, verifying every digest; a sample whose files do not match
 * its manifest is not a sample and is reported, and one run (run start +
 * requested sha + host set) never counts twice.
 */

import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fullLogDestPath} from './full-node-log-capture.js';
import {
  evaluateCertificationStreak,
  readCertificationLedger,
} from './scenario-certification.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayAt = Function.call.bind(Array.prototype.at);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringSplit = Function.call.bind(String.prototype.split);
const jsonStringify = JSON.stringify;

const ZERO = 0;
const ONE = 1;
const JSON_INDENT = 2;
const UTF8 = 'utf8';
const SHA256 = 'sha256';
const HEX = 'hex';
const NEWLINE = '\n';
const DIGEST_SEPARATOR = '  ';
const RUN_IDENTITY_SEPARATOR = '|';
const HOST_SEPARATOR = ',';
const UNSAFE_NAME = /[^0-9A-Za-z_-]/gu;
const SAFE_REPLACEMENT = '-';
const NO_SHA = 'no-sha';
const CERTIFICATION_EVIDENCE_SCHEMA = 'certification-evidence/1';
const CERTIFICATION_EVIDENCE_ROOT = fileURLToPath(new URL(
  '../../../test-output/certification', import.meta.url));

const EVIDENCE_FILE = Object.freeze({
  CERTIFICATION: 'certification.json',
  ENTRY: 'report-entry.json',
  GATES: 'gates.json',
  LOGS: 'logs',
  MANIFEST: 'manifest.json',
  MANIFEST_DIGEST: 'manifest.json.sha256',
});

function sha256(bytes) {
  return createHash(SHA256).update(bytes).digest(HEX);
}

function safeName(value) {
  return stringReplace(String(value), UNSAFE_NAME, SAFE_REPLACEMENT);
}

function hostSetOf(nodes) {
  return arraySort([...new Set(arrayFilter(arrayMap(nodes || [],
    (node) => node?.hostIdentity?.hostId ?? null),
  (hostId) => typeof hostId === 'string'))]);
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

async function writeEvidenceFile(dir, path, bytes, files) {
  await writeFile(join(dir, path), bytes);
  files.push({bytes: bytes.length, path, sha256: sha256(bytes)});
}

async function copyNodeLogs(dir, input, files) {
  const missingNodeLogs = [];
  await mkdir(join(dir, EVIDENCE_FILE.LOGS));
  for (const node of input.nodes || []) {
    const source = input.outputDir ?
      fullLogDestPath(input.outputDir, input.scenarioName, node.id) :
      null;
    if (source === null || !existsSync(source)) {
      missingNodeLogs.push(node.id);
      continue;
    }
    await writeEvidenceFile(dir,
      join(EVIDENCE_FILE.LOGS, `${safeName(node.id)}.log.gz`),
      await readFile(source), files);
  }
  return missingNodeLogs;
}

function jsonBytes(value) {
  return Buffer.from(jsonStringify(value, null, JSON_INDENT) + NEWLINE, UTF8);
}

/**
 * Archive one certification-requesting scenario run (see the module
 * header). Never overwrites: an existing run directory is an error.
 * @param {{entry: Object, gates: Array, nodes: Array, outputDir: ?string,
 *   scenarioName: string, runStartedAt: string, root?: string}} input
 * @return {Promise<{dir, manifestDigest, runIdentity}>}
 */
async function archiveCertificationRun(input) {
  const root = input.root || CERTIFICATION_EVIDENCE_ROOT;
  const certification = input.entry?.certification || {};
  const requestedSha = certification.requestedSha ?? null;
  const hostSet = hostSetOf(input.nodes);
  const dir = join(root, safeName(requestedSha ?? NO_SHA),
    safeName(input.runStartedAt));
  await mkdir(join(dir, '..'), {recursive: true});
  await mkdir(dir);
  const files = [];
  await writeEvidenceFile(dir, EVIDENCE_FILE.ENTRY, jsonBytes(input.entry),
    files);
  await writeEvidenceFile(dir, EVIDENCE_FILE.CERTIFICATION,
    jsonBytes(certification), files);
  await writeEvidenceFile(dir, EVIDENCE_FILE.GATES,
    jsonBytes(input.gates || []), files);
  const missingNodeLogs = await copyNodeLogs(dir, input, files);
  const runIdentity = certificationRunIdentity({hostSet, requestedSha,
    runStartedAt: input.runStartedAt});
  const manifestBytes = jsonBytes({certified: certification.certified === true,
    files, hostSet, missingNodeLogs, outcome: input.entry?.outcome ?? null,
    requestedSha, runIdentity, runStartedAt: input.runStartedAt,
    scenario: input.scenarioName, schema: CERTIFICATION_EVIDENCE_SCHEMA,
    sha: certification.sha ?? null});
  await writeFile(join(dir, EVIDENCE_FILE.MANIFEST), manifestBytes);
  const manifestDigest = sha256(manifestBytes);
  await writeFile(join(dir, EVIDENCE_FILE.MANIFEST_DIGEST),
    `${manifestDigest}${DIGEST_SEPARATOR}${EVIDENCE_FILE.MANIFEST}${NEWLINE}`);
  return {dir, manifestDigest, runIdentity};
}

/**
 * The runner's hook after a certification-requesting entry was reported:
 * archive it and print the manifest digest. Never throws.
 * @param {Object} input {report, scenarioName, cluster?, nodes?, config?,
 *   runStartedAt, root?, write?}
 * @return {Promise<{error: ?string, dir?: string, manifestDigest?: string}>}
 */
async function archiveReportedCertification(input) {
  const write = input.write || ((text) => process.stdout.write(text));
  const entry = arrayAt(input.report.scenarios, -ONE);
  try {
    const archived = await archiveCertificationRun({entry,
      gates: readCertificationLedger(input.cluster ?? null).gates,
      nodes: input.nodes || [], outputDir: input.config?.outputDir ?? null,
      root: input.root, runStartedAt: input.runStartedAt,
      scenarioName: input.scenarioName});
    entry.certificationEvidence = {dir: archived.dir, error: null,
      manifestDigest: archived.manifestDigest,
      runIdentity: archived.runIdentity};
    write(`certification evidence: ${archived.dir} manifest sha256 ` +
      `${archived.manifestDigest}${NEWLINE}`);
    return {...archived, error: null};
  } catch (error) {
    const message = String(error?.message || error);
    entry.certificationEvidence = {error: message};
    write(`certification evidence NOT archived (${message}): the run is ` +
      `not a certification sample${NEWLINE}`);
    return {error: message};
  }
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

function verifyEvidenceDir(dir) {
  const manifestBytes = readFileSync(join(dir, EVIDENCE_FILE.MANIFEST));
  const recorded = stringSplit(stringTrim(readFileSync(join(dir,
    EVIDENCE_FILE.MANIFEST_DIGEST)).toString(UTF8)), ' ')[ZERO];
  if (recorded !== sha256(manifestBytes)) {
    throw new Error('manifest.json does not match manifest.json.sha256');
  }
  const manifest = JSON.parse(manifestBytes.toString(UTF8));
  for (const file of manifest.files || []) {
    if (sha256(readFileSync(join(dir, file.path))) !== file.sha256) {
      throw new Error(`${file.path} does not match its manifest digest`);
    }
  }
  if (manifest.runIdentity !== certificationRunIdentity(manifest)) {
    throw new Error('manifest runIdentity is not its run start, sha and hosts');
  }
  const entry = readVerifiedJson(dir, EVIDENCE_FILE.ENTRY, manifest);
  const certification = readVerifiedJson(dir, EVIDENCE_FILE.CERTIFICATION,
    manifest);
  if (jsonStringify(entry.certification) !== jsonStringify(certification)) {
    throw new Error('certification.json is not the entry\'s certification');
  }
  return {entry, manifest, manifestDigest: recorded};
}

function newestFirst(left, right) {
  return String(right.manifest.runStartedAt)
    .localeCompare(String(left.manifest.runStartedAt));
}

/**
 * Every archived certification sample of a scenario, verified, newest
 * first, one per run identity. Synchronous (the solve probe is).
 * @param {{root?: string, scenario: string}} input
 * @return {{samples, invalid, duplicates}}
 */
function readCertificationEvidence({root = CERTIFICATION_EVIDENCE_ROOT,
  scenario}) {
  const samples = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();
  const runDirs = [];
  for (const shaDir of arraySort(listDirs(root))) {
    runDirs.push(...arraySort(listDirs(shaDir)));
  }
  for (const dir of runDirs) {
    let sample;
    try {
      sample = {...verifyEvidenceDir(dir), dir: relative(root, dir)};
    } catch (error) {
      invalid.push({dir: relative(root, dir),
        reason: String(error?.message || error)});
      continue;
    }
    if (sample.manifest.scenario !== scenario) {
      continue;
    }
    if (seen.has(sample.manifest.runIdentity)) {
      duplicates.push({dir: sample.dir,
        runIdentity: sample.manifest.runIdentity});
      continue;
    }
    seen.add(sample.manifest.runIdentity);
    samples.push(sample);
  }
  return {duplicates, invalid, samples: arraySort(samples, newestFirst)};
}

/**
 * The certification streak of a scenario, from durable evidence only.
 * @param {{root?: string, scenario: string, consecutive: number}} input
 * @return {Object} evaluateCertificationStreak's result plus
 *   {samples, invalidSamples, duplicateSamples, newest}
 */
function evaluateCertificationStreakFromEvidence({root, scenario,
  consecutive}) {
  const evidence = readCertificationEvidence({root, scenario});
  const streak = evaluateCertificationStreak(arrayMap(evidence.samples,
    (sample) => sample.entry), consecutive);
  return {...streak, duplicateSamples: evidence.duplicates,
    invalidSamples: evidence.invalid,
    newest: evidence.samples[ZERO] ? {dir: evidence.samples[ZERO].dir,
      manifestDigest: evidence.samples[ZERO].manifestDigest} : null,
    samples: evidence.samples.length};
}

export {
  EVIDENCE_FILE,
  archiveCertificationRun,
  archiveReportedCertification,
  evaluateCertificationStreakFromEvidence,
};
