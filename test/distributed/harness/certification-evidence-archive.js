/**
 * Durable certification evidence: every certification run gets its own
 * directory that no harness archive or prune touches (log-collector.js
 * prunes only `{outputDir}/{scenario}/.previous-*`):
 *
 *   test-output/certification/<requested sha>/<run start, ':' '.' -> '-'>/
 *     started.json        written BEFORE the formation starts (before any
 *                         hold or build): scenario, sha, run start, host
 *                         set, run identity, controller pid/host
 *     report-entry.json   the scenario's report entry as written
 *     certification.json  its certification block
 *     gates.json          the run's gate records (the certification ledger)
 *     logs/<node>.log.gz  every node's full log of the run
 *     manifest.json       {schema, scenario, requestedSha, sha, certified,
 *                          outcome, runStartedAt, hostSet, runIdentity,
 *                          files: [{path, bytes, sha256}], missingNodeLogs}
 *     manifest.json.sha256  the SHA-256 of manifest.json
 *
 * A run interrupted anywhere after `started.json` (killed, crashed, a lost
 * hold, an abort before the archive) leaves a directory with no manifest:
 * the streak reader counts it as a FAILED sample
 * (certification-evidence-streak.js). Evidence is never deleted or
 * overwritten (every file is created exclusively).
 *
 * Every run's outcome is printed as a ready-to-run `solve note --kind
 * evidence` line (formatCertificationRecord); the streak is claimed only
 * over runs whose digest lines are recorded in the quest log.
 *
 * Retention (owner decision, 2026-10-05): the small verdict files of EVERY
 * run are committed (keepCertificationVerdict copies them); the node logs
 * stay outside git, bound by their digests in the manifest.
 */

import {existsSync, readFileSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {hostname} from 'node:os';
import {basename, join} from 'node:path';
import {fullLogDestPath} from './full-node-log-capture.js';
import {readCertificationLedger} from './scenario-certification.js';
import {
  CERTIFICATION_EVIDENCE_ROOT,
  EVIDENCE_FILE,
  NO_MANIFEST,
  certificationRunIdentity,
  safeName,
  sha256,
  shaDirOf,
  verifyEvidenceDir,
} from './certification-evidence-streak.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayAt = Function.call.bind(Array.prototype.at);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const jsonStringify = JSON.stringify;

const ONE = 1;
const JSON_INDENT = 2;
const UTF8 = 'utf8';
const NEWLINE = '\n';
const DIGEST_SEPARATOR = '  ';
const NO_SHA = 'no-sha';
const EXCLUSIVE = Object.freeze({flag: 'wx'});
const LOGS_PREFIX = 'logs/';
const CERTIFICATION_EVIDENCE_SCHEMA = 'certification-evidence/1';
const STARTED_SCHEMA = 'certification-run-started/1';
const QUEST_PLACEHOLDER = '<quest-id>';

// The files committed for every run (owner decision, option 1).
const VERDICT_FILES = Object.freeze([EVIDENCE_FILE.STARTED,
  EVIDENCE_FILE.ENTRY, EVIDENCE_FILE.CERTIFICATION, EVIDENCE_FILE.GATES,
  EVIDENCE_FILE.MANIFEST, EVIDENCE_FILE.MANIFEST_DIGEST]);

const RUN_OUTCOME = Object.freeze({
  CERTIFIED: 'certified',
  INTERRUPTED: 'interrupted',
  NOT_CERTIFIED: 'not-certified',
  REFUSED: 'refused',
  UNVERIFIABLE: 'unverifiable',
});

function hostSetOf(nodes) {
  return arraySort([...new Set(arrayFilter(arrayMap(nodes || [],
    (node) => node?.hostIdentity?.hostId ?? null),
  (hostId) => typeof hostId === 'string'))]);
}

function jsonBytes(value) {
  return Buffer.from(jsonStringify(value, null, JSON_INDENT) + NEWLINE, UTF8);
}

/**
 * Create a certification run's directory and its `started.json`, before
 * the formation starts. Refuses an existing directory (EEXIST); a failure
 * must abort the run.
 * @param {{root?: string, requestedSha: string, scenario: ?string,
 *   runStartedAt?: string, hostSet?: string[], hosts?: string[]}} input
 * @return {Promise<{dir: string, started: Object}>}
 */
async function startCertificationRun(input) {
  const root = input.root || CERTIFICATION_EVIDENCE_ROOT;
  const runStartedAt = input.runStartedAt || new Date().toISOString();
  const requestedSha = input.requestedSha ?? null;
  const hostSet = input.hostSet || [];
  const dir = join(root, safeName(requestedSha ?? NO_SHA),
    safeName(runStartedAt));
  await mkdir(join(dir, '..'), {recursive: true});
  await mkdir(dir);
  const started = {controller: {host: hostname(), pid: process.pid},
    hostSet, hosts: input.hosts || [], requestedSha,
    runIdentity: certificationRunIdentity({hostSet, requestedSha,
      runStartedAt}),
    runStartedAt, scenario: input.scenario ?? null, schema: STARTED_SCHEMA};
  await writeFile(join(dir, EVIDENCE_FILE.STARTED), jsonBytes(started),
    EXCLUSIVE);
  return {dir, started};
}

// An existing run directory (the lab harness created it): its started.json
// must name this run's sha and scenario.
async function adoptCertificationRun(dir, requestedSha, scenarioName) {
  const started = JSON.parse(await readFile(join(dir, EVIDENCE_FILE.STARTED),
    UTF8));
  if (started.requestedSha !== requestedSha ||
      started.scenario !== scenarioName) {
    throw new Error(`${dir}: started.json names ${started.scenario} at ` +
      `${started.requestedSha}, not ${scenarioName} at ${requestedSha}`);
  }
  return {dir, started};
}

async function writeEvidenceFile(dir, path, bytes, files) {
  await writeFile(join(dir, path), bytes, EXCLUSIVE);
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

/**
 * Archive one certification-requesting scenario run into its run directory
 * (`runDir`, created by startCertificationRun; without one, the directory
 * is started here at `runStartedAt`). Never overwrites.
 * @param {{entry: Object, gates: Array, nodes: Array, outputDir: ?string,
 *   scenarioName: string, runDir?: string, runStartedAt?: string,
 *   root?: string}} input
 * @return {Promise<{dir, manifestDigest, runIdentity}>}
 */
async function archiveCertificationRun(input) {
  const certification = input.entry?.certification || {};
  const requestedSha = certification.requestedSha ?? null;
  const run = input.runDir ?
    await adoptCertificationRun(input.runDir, requestedSha,
      input.scenarioName) :
    await startCertificationRun({requestedSha, root: input.root,
      runStartedAt: input.runStartedAt, scenario: input.scenarioName});
  const {dir} = run;
  const runStartedAt = run.started.runStartedAt;
  const hostSet = hostSetOf(input.nodes);
  const startedBytes = await readFile(join(dir, EVIDENCE_FILE.STARTED));
  const files = [{bytes: startedBytes.length, path: EVIDENCE_FILE.STARTED,
    sha256: sha256(startedBytes)}];
  await writeEvidenceFile(dir, EVIDENCE_FILE.ENTRY, jsonBytes(input.entry),
    files);
  await writeEvidenceFile(dir, EVIDENCE_FILE.CERTIFICATION,
    jsonBytes(certification), files);
  await writeEvidenceFile(dir, EVIDENCE_FILE.GATES,
    jsonBytes(input.gates || []), files);
  const missingNodeLogs = await copyNodeLogs(dir, input, files);
  const runIdentity = certificationRunIdentity({hostSet, requestedSha,
    runStartedAt});
  const manifestBytes = jsonBytes({certified: certification.certified === true,
    files, hostSet, missingNodeLogs, outcome: input.entry?.outcome ?? null,
    requestedSha, runIdentity, runStartedAt,
    scenario: input.scenarioName,
    schema: CERTIFICATION_EVIDENCE_SCHEMA, sha: certification.sha ?? null});
  await writeFile(join(dir, EVIDENCE_FILE.MANIFEST), manifestBytes, EXCLUSIVE);
  const manifestDigest = sha256(manifestBytes);
  await writeFile(join(dir, EVIDENCE_FILE.MANIFEST_DIGEST),
    `${manifestDigest}${DIGEST_SEPARATOR}${EVIDENCE_FILE.MANIFEST}${NEWLINE}`,
    EXCLUSIVE);
  return {dir, manifestDigest, runIdentity};
}

/**
 * The runner's hook after a certification-requesting entry was reported:
 * archive it and print the manifest digest. Never throws.
 * @param {Object} input {report, scenarioName, cluster?, nodes?, config?,
 *   runDir?, runStartedAt, root?, write?}
 * @return {Promise<{error: ?string, dir?: string, manifestDigest?: string}>}
 */
async function archiveReportedCertification(input) {
  const write = input.write || ((text) => process.stdout.write(text));
  const entry = arrayAt(input.report.scenarios, -ONE);
  try {
    const archived = await archiveCertificationRun({entry,
      gates: readCertificationLedger(input.cluster ?? null).gates,
      nodes: input.nodes || [], outputDir: input.config?.outputDir ?? null,
      root: input.root, runDir: input.runDir,
      runStartedAt: input.runStartedAt, scenarioName: input.scenarioName});
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

function readJsonOrNull(path) {
  try {
    return JSON.parse(readFileSync(path, UTF8));
  } catch (_error) {
    return null;
  }
}

function outcomeOfVerified(verified) {
  if (verified.manifest.certified === true) return RUN_OUTCOME.CERTIFIED;
  return verified.manifest.outcome === RUN_OUTCOME.REFUSED ?
    RUN_OUTCOME.REFUSED : RUN_OUTCOME.NOT_CERTIFIED;
}

/**
 * What one run directory says about its run, for its record line.
 * @param {string} runDir
 * @return {{scenario, requestedSha, runStartedAt, outcome, manifestDigest,
 *   reason}}
 */
function describeCertificationRun(runDir) {
  const started = readJsonOrNull(join(runDir, EVIDENCE_FILE.STARTED)) || {};
  const base = {requestedSha: started.requestedSha ?? shaDirOf(runDir),
    runStartedAt: started.runStartedAt ?? basename(runDir),
    scenario: started.scenario ?? null};
  if (!existsSync(join(runDir, EVIDENCE_FILE.MANIFEST))) {
    return {...base, manifestDigest: null, outcome: RUN_OUTCOME.INTERRUPTED,
      reason: 'no manifest: interrupted'};
  }
  try {
    const verified = verifyEvidenceDir(runDir);
    return {...base, manifestDigest: verified.manifestDigest,
      outcome: outcomeOfVerified(verified), reason: null};
  } catch (error) {
    return {...base, manifestDigest: null, outcome: RUN_OUTCOME.UNVERIFIABLE,
      reason: `manifest does not verify: ${String(error?.message || error)}`};
  }
}

/**
 * The ready-to-run `solve note --kind evidence` line of one run (the
 * streak reader parses its finding text back: parseCertificationRecords).
 * @param {Object} run describeCertificationRun's result
 * @param {?string} questId
 * @return {string}
 */
function formatCertificationRecord(run, questId) {
  const manifest = run.manifestDigest ??
    `${NO_MANIFEST} (${run.reason ?? 'no manifest: interrupted'})`;
  return `node scripts/solve.js note --id ${questId || QUEST_PLACEHOLDER} ` +
    '--kind evidence --finding "certification-run ' +
    `scenario=${run.scenario ?? 'unknown'} sha=${run.requestedSha} ` +
    `start=${run.runStartedAt} outcome=${run.outcome} manifest=${manifest}"`;
}

/**
 * Print a run's record line; never throws.
 * @param {string} runDir
 * @param {{questId?: string, write?: Function}} [options]
 * @return {string} the line
 */
function printCertificationRecord(runDir, {questId = null,
  write = (text) => process.stdout.write(text)} = {}) {
  const line = formatCertificationRecord(describeCertificationRun(runDir),
    questId);
  write(`certification run record (record it after EVERY run):${NEWLINE}` +
    `  ${line}${NEWLINE}`);
  return line;
}

/**
 * The runner's (run.js) certification run directory, opened before
 * anything is built: the lab harness's (`--certify-run-dir`), or one
 * created here, whose record line is then printed on every exit but
 * SIGKILL.
 * @param {{certify: string, certifyRunDir: ?string, scenario: ?string}} args
 * @param {{root?: string, onExit?: Function}} [options]
 * @return {Promise<{dir: string, created: boolean}>}
 */
async function openRunnerCertificationRun(args, {root,
  onExit = (listener) => process.on('exit', listener)} = {}) {
  if (!args.scenario) {
    throw new Error('--certify names exactly one --scenario');
  }
  if (args.certifyRunDir) {
    await adoptCertificationRun(args.certifyRunDir, args.certify,
      args.scenario);
    return {created: false, dir: args.certifyRunDir};
  }
  const run = await startCertificationRun({requestedSha: args.certify, root,
    scenario: args.scenario});
  onExit(() => printCertificationRecord(run.dir));
  return {created: true, dir: run.dir};
}

/**
 * Copy one run's verdict files (VERDICT_FILES present in the directory)
 * into `<destRoot>/<sha>/<run start>/` to be committed; node logs stay
 * where they are, bound by the manifest digests returned. Never
 * overwrites.
 * @param {{runDir: string, destRoot: string}} input
 * @return {Promise<{dest, copied, logs, logsDir}>}
 */
async function keepCertificationVerdict({runDir, destRoot}) {
  const dest = join(destRoot, shaDirOf(runDir), basename(runDir));
  await mkdir(join(dest, '..'), {recursive: true});
  await mkdir(dest);
  const copied = [];
  for (const file of VERDICT_FILES) {
    const source = join(runDir, file);
    if (existsSync(source)) {
      await writeFile(join(dest, file), await readFile(source), EXCLUSIVE);
      copied.push(file);
    }
  }
  const manifest = readJsonOrNull(join(runDir, EVIDENCE_FILE.MANIFEST));
  return {copied, dest,
    logs: arrayFilter(manifest?.files || [], (file) =>
      stringStartsWith(String(file.path), LOGS_PREFIX)),
    logsDir: join(runDir, EVIDENCE_FILE.LOGS)};
}

export {
  EVIDENCE_FILE,
  VERDICT_FILES,
  archiveCertificationRun,
  archiveReportedCertification,
  describeCertificationRun,
  formatCertificationRecord,
  keepCertificationVerdict,
  openRunnerCertificationRun,
  printCertificationRecord,
  startCertificationRun,
};
