/**
 * Solver evidence store (solve-v2 phase 1): binaries never enter git.
 *
 *   node scripts/solve.js evidence add <path> --id <id> [--text "<why>"]
 *
 * Uploads <path> as the asset `<quest-id>--<path under solve/ with __>` (the
 * basename outside solve/) of the dedicated GitHub pre-release `solve-evidence`, verifies the upload by downloading the asset
 * again and re-hashing it, and only then records a `finding` of kind
 * `evidence` on the quest carrying sha256, size, asset name and URL. A hash
 * mismatch, a failed upload or a failed download records nothing and exits 1.
 * The release is created once with `gh release create solve-evidence
 * --prerelease --latest=false`; its tag never matches release.yml's `v*`.
 *
 *   node scripts/solve.js evidence relocate --id <quest> --paths-file <list>
 *     --source-commit <sha> [--record-to <quest>] [--label <name>] [--dry-run]
 *
 * Relocation moves bulk evidence already committed under solve/ out of the
 * tree: the listed paths become one `.tar.gz` bundle with a MANIFEST.json
 * (path, bytes, sha256, adding commit), the bundle is uploaded through the
 * same add path above, then downloaded again independently, extracted, and
 * every member is hashed against the manifest and against the blob at the
 * source commit. Only then are the inventory and verification records written
 * (under RELOCATION.RECORDS_DIR/<record quest>/, outside every quest
 * directory) and the verified paths removed with `git rm`; a path that fails any check
 * stays in the tree.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

import {ACTION, authorizeAction, isAuthorized} from '../action-authority.js';
import {GIT_OUTPUT_BOUND, spawnGit} from '../checks/git-invocation.js';
import {LOG_FILE, QUEST_FILE} from './schema.js';

const EVIDENCE_RELEASE_TAG = 'solve-evidence';
const ASSET_SEPARATOR = '--';
const GH_BINARY = 'gh';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const SCRATCH_PREFIX = 'solve-evidence-';
const FINDING_KIND_EVIDENCE = 'evidence';
const EVIDENCE_REF_PREFIX = 'sha256:';
const RELEASE_URL_FIELD = 'url';
const ASSETS_FIELD = 'assets';
const NAME_FIELD = 'name';
const GH_RELEASE = 'release';
const GH_UPLOAD = 'upload';
const GH_DOWNLOAD = 'download';
const GH_VIEW = 'view';
const GH_CLOBBER_FLAG = '--clobber';
const REPLACEMENT_REFUSED_PREFIX = 'evidence add: replacing ';
const DELETION_REFUSED_PREFIX = 'evidence delete: deleting ';
const GH_DELETE_ASSET = 'delete-asset';
const GH_YES_FLAG = '--yes';
const GH_PATTERN_FLAG = '--pattern';
const GH_DIR_FLAG = '--dir';
const GH_JSON_FLAG = '--json';
const VERIFY_DIR = 'verify';
const PATH_SEGMENT_JOINER = '__';
const SOLVE_PREFIX = 'solve/';

function sha256Of(file) {
  return crypto.createHash(HASH_ALGORITHM)
    .update(fs.readFileSync(file)).digest(HASH_ENCODING);
}

function gh(args, options = {}) {
  return execFileSync(GH_BINARY, args, {encoding: TEXT_ENCODING, ...options});
}

// `<quest-id>--<original-name>` where the original name is the file's path
// under solve/ with the quest's own directory dropped and `/` joined by `__`,
// so sibling bundles that share a basename (round-2/fixed-1/node-logs.tar.gz
// and round-2/fixed-2/node-logs.tar.gz) never clobber each other. A file
// outside solve/ keeps its basename.
function assetName(questId, file, root = process.cwd()) {
  const relative = path.relative(root, path.resolve(root, file))
    .split(path.sep).join('/');
  const underSolve = relative.startsWith(SOLVE_PREFIX) ?
    relative.slice(SOLVE_PREFIX.length) : path.basename(relative);
  const segments = underSolve.split('/');
  const withoutQuestDir = segments.length > 2 && segments[1] === questId ?
    [segments[0], ...segments.slice(2)] : segments;
  return `${questId}${ASSET_SEPARATOR}${withoutQuestDir.join(PATH_SEGMENT_JOINER)}`;
}

function assetUrl(name, run) {
  const release = JSON.parse(run([GH_RELEASE, GH_VIEW, EVIDENCE_RELEASE_TAG,
    GH_JSON_FLAG, `${ASSETS_FIELD},${RELEASE_URL_FIELD}`]));
  const asset = (release[ASSETS_FIELD] || []).find((entry) =>
    entry[NAME_FIELD] === name);
  return asset ? asset[RELEASE_URL_FIELD] : null;
}

/**
 * Upload one file, verify it by re-download and re-hash, and return the
 * record to log. Throws on any mismatch; never records on failure.
 * @param {Object} options {file, questId, gh?, tmpdir?}
 * @return {{sha256: string, bytes: number, asset: string, url: string}}
 */
function uploadAndVerify({
  file, questId, replace = false, run = gh, tmpdir = os.tmpdir(),
  root = process.cwd(),
}) {
  const name = assetName(questId, file, root);
  const sha256 = sha256Of(file);
  const bytes = fs.statSync(file).size;
  // Clobbering an asset that already carries this name cannot be taken back,
  // so it happens only where the operator asked for a replacement. Without
  // that, the upload does not clobber and the remote refuses a collision -
  // there is no path here that silently overwrites.
  if (replace) {
    const decision = authorizeAction({
      action: ACTION.REPLACE_SHARED_EVIDENCE,
      signal: {action: ACTION.REPLACE_SHARED_EVIDENCE, replace, asset: name},
    });
    if (!isAuthorized(decision)) {
      throw new Error(`${REPLACEMENT_REFUSED_PREFIX}${name} is ` +
        `${decision.outcome}: ${decision.because}`);
    }
  }
  const scratch = fs.mkdtempSync(path.join(tmpdir, SCRATCH_PREFIX));
  try {
    const staged = path.join(scratch, name);
    fs.copyFileSync(file, staged);
    run([GH_RELEASE, GH_UPLOAD, EVIDENCE_RELEASE_TAG, staged,
      ...(replace ? [GH_CLOBBER_FLAG] : [])]);
    const downloadDir = path.join(scratch, VERIFY_DIR);
    fs.mkdirSync(downloadDir);
    run([GH_RELEASE, GH_DOWNLOAD, EVIDENCE_RELEASE_TAG, GH_PATTERN_FLAG, name,
      GH_DIR_FLAG, downloadDir]);
    const downloaded = sha256Of(path.join(downloadDir, name));
    if (downloaded !== sha256) {
      throw new Error(`evidence add: re-downloaded ${name} hashes to ` +
        `${downloaded}, expected ${sha256}; nothing recorded`);
    }
    const url = assetUrl(name, run);
    if (!url) throw new Error(`evidence add: ${name} not listed after upload`);
    return {sha256, bytes, asset: name, url};
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}

/**
 * Remove one published evidence asset, where the operator authorized removing
 * that exact asset. Deleting something already shared cannot be taken back, so
 * the operator names the target and the authority compares it with the target
 * at hand: an authorization for one asset removes no other.
 * @param {{asset: string, authorizedAsset: ?string, run?: Function}} options
 * @return {{asset: string}}
 */
function deleteSharedEvidenceAsset({asset, authorizedAsset, run = gh}) {
  const decision = authorizeAction({
    action: ACTION.DELETE_SHARED_EVIDENCE,
    signal: {action: ACTION.DELETE_SHARED_EVIDENCE, asset: authorizedAsset},
    context: {asset},
  });
  if (!isAuthorized(decision)) {
    throw new Error(`${DELETION_REFUSED_PREFIX}${asset} is ` +
      `${decision.outcome}: ${decision.because}`);
  }
  run([GH_RELEASE, GH_DELETE_ASSET, EVIDENCE_RELEASE_TAG, asset, GH_YES_FLAG]);
  return {asset};
}

// --- relocation ---------------------------------------------------------------

const RELOCATION = Object.freeze({
  // Where relocation records live: one directory per recording quest under
  // this cross-cutting record home, never under a quest's evidence/. A closed
  // quest keeps only its record, its log and its sealed claim's artifacts
  // (closed-quest-shape owner), so records written there go off-shape the
  // moment the recording quest closes.
  RECORDS_DIR: 'solve/changes/evidence-relocation',
  INVENTORY_FILE: 'relocation-inventory.json',
  SHARD_DIR: 'relocation-inventory',
  VERIFICATION_FILE: 'relocation-verification.json',
  MANIFEST_MEMBER: 'MANIFEST.json',
  MANIFEST_SCHEMA: 'solve-evidence-bundle/1',
  INVENTORY_SCHEMA: 'solve-relocation-inventory/1',
  SHARD_SCHEMA: 'solve-relocation-shard/1',
  VERIFICATION_SCHEMA: 'solve-relocation-verification/1',
  BUNDLE_SUFFIX: '.tar.gz',
  // One character per shard file, in shard order: the member's extracted
  // bytes hash equal to both the manifest and the source-commit blob.
  RESULT_MATCH: '1',
  RESULT_MISMATCH: '0',
  SHORT_SHA_LENGTH: 9,
});
// Why a listed path may not be relocated (R07: each refusal is named).
const RELOCATION_REFUSAL = Object.freeze({
  OUTSIDE_SOLVE: 'outside solve/',
  QUEST_RECORD: 'a quest record',
  QUEST_LOG: 'an append-only quest log',
  REQUIRED_ARTIFACT: 'a proof artifact a sealed doneWhen requires',
  DUPLICATE: 'listed twice',
  NOT_AT_SOURCE: 'not a blob at the source commit',
  TREE_DRIFT: 'working-tree bytes differ from the source commit',
});
const MEMBER_MISMATCH = Object.freeze({
  ABSENT: 'absent from the downloaded bundle',
  MANIFEST: 'bytes differ from the manifest',
  SOURCE: 'bytes differ from the source-commit blob',
});
const TAR_BINARY = 'tar';
const BUNDLE_DIR = 'bundle';
const EXTRACT_DIR = 'extract';
const LIST_FILE = 'members.list';
const PATH_SEPARATOR = '/';
const PARENT_SEGMENT = '..';
const LINE_SEPARATOR = '\n';
const COMMENT_PREFIX = '#';
const SPACE = ' ';
const MISSING_MARKER = 'missing';
const BLOB_TYPE = 'blob';
const ADDED_MARKER = '\u0000';
const ADDED_FORMAT = '--format=%x00%H';
const JSON_INDENT = 2;
const CLOSING_TAIL = '\n}';
const SPAWN_MAX_BUFFER = 1024 * 1024 * 1024;
const TAR_CREATE = Object.freeze(['--sort=name', '--owner=0', '--group=0',
  '--numeric-owner', '--mtime=@0', '-czf']);
const TAR_LIST = '-tzf';
const TAR_DIRECTORY_FLAG = '-C';
const TAR_FILES_FROM_FLAG = '-T';
const GIT_RM_FROM_STDIN = Object.freeze(['rm', '--quiet', '--pathspec-from-file=-',
  '--pathspec-file-nul', '--']);
const TAR_EXTRACT = Object.freeze(['--no-same-owner', '--no-same-permissions',
  '-xzf']);

function stdoutOrThrow(command, result) {
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || '')}`);
  }
  return result.stdout;
}

function spawnOrThrow(binary, args, options = {}) {
  return stdoutOrThrow(`${binary} ${args[0]}`,
    spawnSync(binary, args, {maxBuffer: SPAWN_MAX_BUFFER, ...options}));
}

// Git starts only through the git-invocation owner, under one of its named
// output bounds; output past the bound is its GitOutputTooLargeError.
function gitOrThrow(args, options) {
  return stdoutOrThrow(`git ${args[0]}`, spawnGit(args, options));
}

function sha256OfBuffer(buffer) {
  return crypto.createHash(HASH_ALGORITHM).update(buffer).digest(HASH_ENCODING);
}

/**
 * The paths a relocation list names: one per line, blank lines and `#`
 * comments ignored.
 * @param {string} content
 * @return {string[]}
 */
function parsePathsList(content) {
  return String(content).split(LINE_SEPARATOR).map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(COMMENT_PREFIX));
}

function refusalOf(file, required, seen) {
  if (!file.startsWith(SOLVE_PREFIX) || file.split(PATH_SEPARATOR)
    .includes(PARENT_SEGMENT)) return RELOCATION_REFUSAL.OUTSIDE_SOLVE;
  const base = path.posix.basename(file);
  if (base === QUEST_FILE) return RELOCATION_REFUSAL.QUEST_RECORD;
  if (base === LOG_FILE) return RELOCATION_REFUSAL.QUEST_LOG;
  if (required.has(file)) return RELOCATION_REFUSAL.REQUIRED_ARTIFACT;
  if (seen.has(file)) return RELOCATION_REFUSAL.DUPLICATE;
  return null;
}

/**
 * Paths the relocation must refuse before anything is bundled: outside
 * solve/, a quest record or log, a required proof artifact, or a repeat.
 * @param {string[]} paths
 * @param {Set<string>} required
 * @return {{path: string, reason: string}[]}
 */
function relocationRefusals(paths, required) {
  const seen = new Set();
  const refusals = [];
  for (const file of paths) {
    const reason = refusalOf(file, required, seen);
    if (reason) refusals.push({path: file, reason});
    seen.add(file);
  }
  return refusals;
}

function parseBatchHeader(output, offset) {
  const end = output.indexOf(LINE_SEPARATOR, offset);
  const fields = output.subarray(offset, end).toString(TEXT_ENCODING).split(SPACE);
  return {end, missing: fields[fields.length - 1] === MISSING_MARKER,
    type: fields[1], size: Number(fields[2])};
}

/**
 * The bytes of each path at `commit`, read in one `git cat-file --batch`.
 * @param {string} root
 * @param {string} commit
 * @param {string[]} paths
 * @return {Map<string, {sha256: string, bytes: number}|null>}
 */
function sourceBlobs(root, commit, paths) {
  const input = paths.map((file) => `${commit}:${file}${LINE_SEPARATOR}`).join('');
  const output = gitOrThrow(['cat-file', '--batch'],
    {cwd: root, input, bound: GIT_OUTPUT_BOUND.HISTORY_BLOB_BATCH});
  const blobs = new Map();
  let offset = 0;
  for (const file of paths) {
    const header = parseBatchHeader(output, offset);
    if (header.missing || header.type !== BLOB_TYPE) {
      blobs.set(file, null);
      offset = header.end + 1;
      continue;
    }
    const start = header.end + 1;
    const content = output.subarray(start, start + header.size);
    blobs.set(file, {sha256: sha256OfBuffer(content), bytes: header.size});
    offset = start + header.size + 1;
  }
  return blobs;
}

/**
 * The newest commit at or before `commit` that added each path.
 * @param {string} root
 * @param {string} commit
 * @param {string[]} paths
 * @return {Map<string, string>}
 */
function addingCommits(root, commit, paths) {
  const wanted = new Set(paths);
  const directories = [...new Set(paths.map((file) => path.posix.dirname(file)))];
  const output = String(gitOrThrow(['log', '--diff-filter=A',
    '--name-only', ADDED_FORMAT, commit, '--', ...directories],
  {cwd: root, encoding: TEXT_ENCODING, bound: GIT_OUTPUT_BOUND.COMMAND}));
  const adds = new Map();
  let current = null;
  for (const line of output.split(LINE_SEPARATOR)) {
    if (line.startsWith(ADDED_MARKER)) current = line.slice(ADDED_MARKER.length);
    else if (wanted.has(line) && !adds.has(line)) adds.set(line, current);
  }
  return adds;
}

/**
 * Source-commit refusals: a path that is no blob there, or whose working-tree
 * bytes no longer equal that blob, is never bundled.
 * @param {string} root
 * @param {string[]} paths
 * @param {Map} blobs
 * @return {{path: string, reason: string}[]}
 */
function sourceRefusals(root, paths, blobs) {
  const refusals = [];
  for (const file of paths) {
    const blob = blobs.get(file);
    const absolute = path.join(root, file);
    if (!blob) refusals.push({path: file, reason: RELOCATION_REFUSAL.NOT_AT_SOURCE});
    else if (!fs.existsSync(absolute) || sha256Of(absolute) !== blob.sha256) {
      refusals.push({path: file, reason: RELOCATION_REFUSAL.TREE_DRIFT});
    }
  }
  return refusals;
}

/**
 * The bundle manifest: one entry per path with its source-commit identity.
 * @param {{paths: string[], sourceCommit: string, blobs: Map, adds: Map}} input
 * @return {Object}
 */
function relocationManifest({paths, sourceCommit, blobs, adds}) {
  return {
    schema: RELOCATION.MANIFEST_SCHEMA,
    sourceCommit,
    files: [...paths].sort().map((file) => ({path: file,
      bytes: blobs.get(file).bytes, sha256: blobs.get(file).sha256,
      addedCommit: adds.get(file) || null})),
  };
}

/**
 * `<label>-<short source sha>-<date>.tar.gz`.
 * @param {{label: string, sourceCommit: string, date: string}} input
 * @return {string}
 */
function bundleBasename({label, sourceCommit, date}) {
  return `${label}-${sourceCommit.slice(0, RELOCATION.SHORT_SHA_LENGTH)}-` +
    `${date}${RELOCATION.BUNDLE_SUFFIX}`;
}

/**
 * Write the bundle: the listed paths read from the working tree under
 * `root` plus MANIFEST.json at the archive root.
 * @param {{root: string, manifest: Object, scratch: string, basename: string}} input
 * @return {string} the bundle's absolute path
 */
function writeRelocationBundle({root, manifest, scratch, basename}) {
  const dir = path.join(scratch, BUNDLE_DIR);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, RELOCATION.MANIFEST_MEMBER),
    `${JSON.stringify(manifest, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  const list = path.join(scratch, LIST_FILE);
  fs.writeFileSync(list, manifest.files.map((entry) => entry.path)
    .join(LINE_SEPARATOR) + LINE_SEPARATOR);
  const bundle = path.join(scratch, basename);
  spawnOrThrow(TAR_BINARY, [...TAR_CREATE, bundle, TAR_DIRECTORY_FLAG, root,
    TAR_FILES_FROM_FLAG, list, TAR_DIRECTORY_FLAG, dir, RELOCATION.MANIFEST_MEMBER]);
  return bundle;
}

function unsafeMember(name) {
  return path.posix.isAbsolute(name) ||
    name.split(PATH_SEPARATOR).includes(PARENT_SEGMENT);
}

// The member names, or null when the download is no readable archive or
// names a member outside the extraction directory: either way nothing in it
// is extracted, and every member then reads as absent.
function extractBundle(bundle, dir) {
  fs.mkdirSync(dir, {recursive: true});
  const listed = spawnSync(TAR_BINARY, [TAR_LIST, bundle],
    {encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});
  if (listed.status !== 0) return null;
  const names = String(listed.stdout).split(LINE_SEPARATOR).filter(Boolean);
  if (names.some(unsafeMember)) return null;
  spawnOrThrow(TAR_BINARY, [...TAR_EXTRACT, bundle, TAR_DIRECTORY_FLAG, dir]);
  return names;
}

function memberMismatch(entry, extracted, blobs) {
  const file = path.join(extracted, entry.path);
  if (!fs.existsSync(file)) return MEMBER_MISMATCH.ABSENT;
  const sha256 = sha256Of(file);
  if (sha256 !== entry.sha256) return MEMBER_MISMATCH.MANIFEST;
  return sha256 === blobs.get(entry.path)?.sha256 ? null : MEMBER_MISMATCH.SOURCE;
}

/**
 * Hash every manifest member of an extracted bundle against the manifest and
 * the source-commit blob; the result string is in manifest order.
 * @param {{manifest: Object, extracted: string, blobs: Map}} input
 * @return {{results: string, mismatches: {path: string, reason: string}[]}}
 */
function memberResults({manifest, extracted, blobs}) {
  const mismatches = [];
  let results = '';
  for (const entry of manifest.files) {
    const reason = memberMismatch(entry, extracted, blobs);
    if (reason) mismatches.push({path: entry.path, reason});
    results += reason ? RELOCATION.RESULT_MISMATCH : RELOCATION.RESULT_MATCH;
  }
  return {results, mismatches};
}

function manifestMatches(extracted, manifest) {
  const file = path.join(extracted, RELOCATION.MANIFEST_MEMBER);
  if (!fs.existsSync(file)) return false;
  return JSON.stringify(JSON.parse(fs.readFileSync(file, TEXT_ENCODING))) ===
    JSON.stringify(manifest);
}

/**
 * Download the uploaded bundle again into fresh scratch, hash it, extract it
 * and hash every member. Independent of the upload's own check.
 * @param {{asset: string, manifest: Object, blobs: Map, run?: Function,
 *   tmpdir?: string}} input
 * @return {Object} the verification record for this bundle
 */
function verifyRelocationBundle({asset, manifest, blobs, run = gh,
  tmpdir = os.tmpdir()}) {
  const scratch = fs.mkdtempSync(path.join(tmpdir, SCRATCH_PREFIX));
  try {
    const downloadDir = path.join(scratch, VERIFY_DIR);
    fs.mkdirSync(downloadDir);
    run([GH_RELEASE, GH_DOWNLOAD, EVIDENCE_RELEASE_TAG, GH_PATTERN_FLAG, asset,
      GH_DIR_FLAG, downloadDir]);
    const bundle = path.join(downloadDir, asset);
    const extracted = path.join(scratch, EXTRACT_DIR);
    const downloadedSha256 = sha256Of(bundle);
    const names = extractBundle(bundle, extracted);
    const expected = new Set([RELOCATION.MANIFEST_MEMBER,
      ...manifest.files.map((entry) => entry.path)]);
    const {results, mismatches} = memberResults({manifest, extracted, blobs});
    return {downloadedSha256, extracted: names !== null,
      manifestMatches: manifestMatches(extracted, manifest),
      unexpectedMembers: (names || []).filter((name) => !expected.has(name) &&
        !name.endsWith(PATH_SEPARATOR)),
      members: manifest.files.length, results, mismatches};
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}

/**
 * The longest directory prefix (ending in `/`) every path shares.
 * @param {string[]} paths
 * @return {string}
 */
function commonRoot(paths) {
  const split = paths.map((file) => path.posix.dirname(file).split(PATH_SEPARATOR));
  const shared = [];
  for (let index = 0; split.every((parts) => index < parts.length &&
    parts[index] === split[0][index]); index += 1) shared.push(split[0][index]);
  return shared.length === 0 ? '' : `${shared.join(PATH_SEPARATOR)}${PATH_SEPARATOR}`;
}

/**
 * The inventory shard for one bundle: every old path (relative to `root`)
 * with its sha256 and size, in manifest order.
 * @param {{manifest: Object, uploaded: Object}} input
 * @return {Object}
 */
function relocationShard({manifest, uploaded}) {
  const root = commonRoot(manifest.files.map((entry) => entry.path));
  return {schema: RELOCATION.SHARD_SCHEMA, bundle: uploaded.asset,
    bundleSha256: uploaded.sha256, url: uploaded.url,
    sourceCommit: manifest.sourceCommit, root,
    files: manifest.files.map((entry) =>
      [entry.path.slice(root.length), entry.sha256, entry.bytes])};
}

/**
 * The directory holding the relocation records a quest wrote.
 * @param {string} root repository root
 * @param {string} questId the recording quest
 * @return {string}
 */
function relocationRecordsDir(root, questId) {
  return path.join(root, RELOCATION.RECORDS_DIR, questId);
}

function readJsonOr(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, TEXT_ENCODING)) : fallback;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const content = `${JSON.stringify(value, null, JSON_INDENT)}${LINE_SEPARATOR}`;
  fs.writeFileSync(file, content);
  return sha256OfBuffer(Buffer.from(content, TEXT_ENCODING));
}

// A shard keeps one file tuple per line so the record stays reviewable and
// small; the rest is ordinary indented JSON.
function shardText(shard) {
  const {files, ...head} = shard;
  const body = JSON.stringify(head, null, JSON_INDENT).slice(0, -CLOSING_TAIL.length);
  const tuples = files.map((tuple) => `    ${JSON.stringify(tuple)}`)
    .join(`,${LINE_SEPARATOR}`);
  return `${body},${LINE_SEPARATOR}  "files": [${LINE_SEPARATOR}${tuples}` +
    `${LINE_SEPARATOR}  ]${LINE_SEPARATOR}}${LINE_SEPARATOR}`;
}

function withBundle(list, entry) {
  return [...list.filter((existing) => existing.bundle !== entry.bundle), entry];
}

/**
 * Write the shard, then merge its index entry into the inventory and its
 * verification into the verification record, all under `recordsRoot` (the
 * recording quest's `relocationRecordsDir`).
 * @param {{recordsRoot: string, shard: Object, verification: Object,
 *   verifiedAt: string}} input
 * @return {{shard: string, shardSha256: string}}
 */
function recordRelocation({recordsRoot, shard, verification, verifiedAt}) {
  const shardRelative = `${RELOCATION.SHARD_DIR}${PATH_SEPARATOR}` +
    `${shard.bundle.slice(0, -RELOCATION.BUNDLE_SUFFIX.length)}.json`;
  const content = shardText(shard);
  fs.mkdirSync(path.join(recordsRoot, RELOCATION.SHARD_DIR), {recursive: true});
  fs.writeFileSync(path.join(recordsRoot, shardRelative), content);
  const shardSha256 = sha256OfBuffer(Buffer.from(content, TEXT_ENCODING));
  const inventoryFile = path.join(recordsRoot, RELOCATION.INVENTORY_FILE);
  const inventory = readJsonOr(inventoryFile,
    {schema: RELOCATION.INVENTORY_SCHEMA, bundles: []});
  writeJson(inventoryFile, {...inventory, bundles: withBundle(inventory.bundles,
    {bundle: shard.bundle, bundleSha256: shard.bundleSha256, url: shard.url,
      sourceCommit: shard.sourceCommit, root: shard.root,
      files: shard.files.length, shard: shardRelative})});
  const verificationFile = path.join(recordsRoot, RELOCATION.VERIFICATION_FILE);
  const record = readJsonOr(verificationFile,
    {schema: RELOCATION.VERIFICATION_SCHEMA, bundles: []});
  writeJson(verificationFile, {...record, bundles: withBundle(record.bundles,
    {bundle: shard.bundle, url: shard.url, bundleSha256: shard.bundleSha256,
      sourceCommit: shard.sourceCommit, shard: shardRelative, shardSha256,
      verifiedAt, ...verification})});
  return {shard: shardRelative, shardSha256};
}

/**
 * `git rm` exactly the given paths (read from stdin, never a glob).
 * @param {string} root
 * @param {string[]} paths
 * @return {number} how many were removed
 */
function removeRelocated(root, paths) {
  if (paths.length === 0) return 0;
  gitOrThrow([...GIT_RM_FROM_STDIN],
    {cwd: root, input: paths.join(ADDED_MARKER), bound: GIT_OUTPUT_BOUND.COMMAND});
  return paths.length;
}

export {
  ASSET_SEPARATOR, EVIDENCE_RELEASE_TAG, EVIDENCE_REF_PREFIX,
  FINDING_KIND_EVIDENCE, MEMBER_MISMATCH, RELOCATION, RELOCATION_REFUSAL,
  addingCommits, assetName, bundleBasename, deleteSharedEvidenceAsset,
  parsePathsList, recordRelocation, relocationManifest, relocationRefusals,
  relocationRecordsDir, relocationShard, removeRelocated, sha256Of, sourceBlobs, sourceRefusals,
  uploadAndVerify, verifyRelocationBundle, writeRelocationBundle,
};
