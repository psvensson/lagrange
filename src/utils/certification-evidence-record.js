// The distributed certification archive's reader. Both the harness and
// release evidence admission share this verification of retained originals.
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, realpathSync} from 'node:fs';
import {isAbsolute, join, relative, resolve} from 'node:path';

const arrayFind = Function.call.bind(Array.prototype.find);
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
const PARENT_DIRECTORY = '..';
const MAX_ARCHIVE_MEMBERS = 64;
const MAX_ARCHIVE_MEMBER_BYTES = 128 * 1024 * 1024;
const MAX_ARCHIVE_METADATA_BYTES = 8 * 1024 * 1024;

const PARENT_PATH_PREFIX = '../';
const DIGEST_PATH_SEPARATOR = ' ';
const CERTIFICATION_RECORD_GROUP = Object.freeze({
  SCENARIO: 1, SHA: 2, START: 3, OUTCOME: 4, MANIFEST: 5,
});
const ARCHIVE_ERROR = Object.freeze({
  INVALID_MEMBER: 'invalid archive member',
  ESCAPED_MEMBER: 'certification archive member escapes its original directory',
  INVALID_FILE: 'invalid certification archive file',
  INVALID_MANIFEST_MEMBERS: 'invalid original certification archive manifest members',
  START_MISMATCH: 'started.json is not the manifest\'s run',
  MANIFEST_MISMATCH: 'manifest.json does not match manifest.json.sha256',
  RECORD_MISMATCH: 'certification manifest does not match the retained run record',
  RUN_IDENTITY_MISMATCH: 'manifest runIdentity is not its run start, sha and hosts',
  CERTIFICATION_MISMATCH: 'certification.json is not the entry\'s certification',
});

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

function readArchiveMember(dir, file) {
  return readFileSync(join(dir, file));
}

function readContainedMember(dir, file, maxBytes) {
  if (typeof file !== 'string' || isAbsolute(file)) throw new Error(ARCHIVE_ERROR.INVALID_MEMBER);
  const root = realpathSync(dir);
  const absolute = resolve(root, file);
  const path = relative(root, absolute);
  if (path === '' || path === PARENT_DIRECTORY || stringStartsWith(path, PARENT_PATH_PREFIX) ||
    realpathSync(absolute) !== absolute) {
    throw new Error(ARCHIVE_ERROR.ESCAPED_MEMBER);
  }
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error(ARCHIVE_ERROR.INVALID_FILE);
  return readFileSync(absolute);
}

function assertOriginalMemberList(manifest) {
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_ARCHIVE_MEMBERS ||
      new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length ||
      !manifest.files.some((file) => file.path === EVIDENCE_FILE.GATES)) {
    throw new Error(ARCHIVE_ERROR.INVALID_MANIFEST_MEMBERS);
  }
}

function readVerifiedJson(dir, path, manifest, readMember) {
  const listed = arrayFind(manifest.files || [], (file) => file.path === path);
  const bytes = readMember(dir, path, MAX_ARCHIVE_METADATA_BYTES);
  if (!listed || listed.sha256 !== sha256(bytes)) {
    throw new Error(`${path} does not match its manifest digest`);
  }
  return JSON.parse(bytes.toString(UTF8));
}

// A node log may live outside the directory (a committed copy keeps only
// the verdict files; the logs are bound by the manifest's digests).
function verifyListedFiles(dir, manifest, logsByDigest, readMember, checkLengths) {
  for (const file of manifest.files || []) {
    const path = join(dir, file.path);
    if (logsByDigest && stringStartsWith(String(file.path), LOGS_PREFIX) &&
        !existsSync(path)) {
      continue;
    }
    const bytes = readMember(dir, file.path, MAX_ARCHIVE_MEMBER_BYTES);
    if (sha256(bytes) !== file.sha256 || (checkLengths && bytes.length !== file.bytes)) {
      throw new Error(`${file.path} does not match its manifest digest`);
    }
  }
}

function verifyStarted(dir, manifest, readMember) {
  const started = readVerifiedJson(dir, EVIDENCE_FILE.STARTED, manifest, readMember);
  if (started.runStartedAt !== manifest.runStartedAt ||
      started.requestedSha !== manifest.requestedSha ||
      started.scenario !== manifest.scenario) {
    throw new Error(ARCHIVE_ERROR.START_MISMATCH);
  }
  return started;
}

function verifyManifestDigest(dir, readMember, expectedManifestDigest) {
  const manifestBytes = readMember(dir, EVIDENCE_FILE.MANIFEST, MAX_ARCHIVE_METADATA_BYTES);
  const digestBytes = readMember(dir, EVIDENCE_FILE.MANIFEST_DIGEST, MAX_ARCHIVE_METADATA_BYTES);
  const recorded = stringSplit(stringTrim(digestBytes.toString(UTF8)), DIGEST_PATH_SEPARATOR)[ZERO];
  if (recorded !== sha256(manifestBytes)) {
    throw new Error(ARCHIVE_ERROR.MANIFEST_MISMATCH);
  }
  if (expectedManifestDigest !== null && recorded !== expectedManifestDigest) {
    throw new Error(ARCHIVE_ERROR.RECORD_MISMATCH);
  }
  return {manifestBytes, recorded};
}

/**
 * Verify one run directory against its manifest; throws naming what does
 * not verify.
 * @param {string} dir
 * @param {{logsByDigest?: boolean}} [options]
 * @return {{entry, manifest, manifestDigest}}
 */
function verifyEvidenceDir(dir, {logsByDigest = false, expectedManifestDigest = null} = {}) {
  const strict = expectedManifestDigest !== null;
  const readMember = strict ? readContainedMember : readArchiveMember;
  const {manifestBytes, recorded} = verifyManifestDigest(dir, readMember, expectedManifestDigest);
  const manifest = JSON.parse(manifestBytes.toString(UTF8));
  if (strict) assertOriginalMemberList(manifest);
  verifyListedFiles(dir, manifest, logsByDigest && !strict, readMember, strict);
  if (manifest.runIdentity !== certificationRunIdentity(manifest)) {
    throw new Error(ARCHIVE_ERROR.RUN_IDENTITY_MISMATCH);
  }
  const started = verifyStarted(dir, manifest, readMember);
  const entry = readVerifiedJson(dir, EVIDENCE_FILE.ENTRY, manifest, readMember);
  const certification = readVerifiedJson(dir, EVIDENCE_FILE.CERTIFICATION, manifest, readMember);
  if (jsonStringify(entry.certification) !== jsonStringify(certification)) {
    throw new Error(ARCHIVE_ERROR.CERTIFICATION_MISMATCH);
  }
  return {entry, manifest, manifestDigest: recorded, ...(strict ? {started} : {})};
}

function parseCertificationRecords(texts) {
  const records = [];
  for (const text of texts || []) {
    const match = regExpExec(RECORD_PATTERN, String(text));
    if (match !== null) {
      const {SCENARIO, SHA, START, OUTCOME, MANIFEST} = CERTIFICATION_RECORD_GROUP;
      const digest = match[MANIFEST];
      records.push({
        manifestDigest: digest === NO_MANIFEST ? null : digest,
        outcome: match[OUTCOME], scenario: match[SCENARIO],
        sha: match[SHA], start: match[START],
      });
    }
  }
  return records;
}

export {
  EVIDENCE_FILE, NO_MANIFEST, certificationRunIdentity, parseCertificationRecords,
  safeName, sha256, verifyEvidenceDir,
};
