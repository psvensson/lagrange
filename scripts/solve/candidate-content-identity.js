import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const SCHEMA_VERSION = 1;
const MODE_REGULAR = '100644';
const MODE_EXECUTABLE = '100755';
const MODE_SYMLINK = '120000';
const STATE_PRESENT = 'present';
const STATE_DELETED = 'deleted';
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

function sha256(bytes) {
  return crypto.createHash(HASH_ALGORITHM).update(bytes).digest(HASH_ENCODING);
}

function canonicalPath(root, filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0 ||
      path.isAbsolute(filePath)) {
    return null;
  }
  const normalized = filePath.split(path.sep).join('/');
  const resolved = path.resolve(root, normalized);
  const relative = path.relative(root, resolved).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../')) return null;
  return relative;
}

function modeForStat(stat) {
  if (stat.isSymbolicLink()) return MODE_SYMLINK;
  return (stat.mode & 0o111) !== 0 ? MODE_EXECUTABLE : MODE_REGULAR;
}

function worktreeEntry(root, filePath) {
  const relative = canonicalPath(root, filePath);
  if (!relative) {
    return {ok: false, problem: `candidate content path is invalid: ${filePath}`};
  }
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) && !fs.lstatSync(path.dirname(absolute)).isDirectory()) {
    return {ok: true, entry: {path: relative, state: STATE_DELETED}};
  }
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {ok: true, entry: {path: relative, state: STATE_DELETED}};
    }
    return {ok: false, problem: `candidate content stat failed for ${relative}: ${error.message}`};
  }
  if (stat.isDirectory()) {
    return {ok: false, problem: `candidate content path names a directory: ${relative}`};
  }
  const bytes = stat.isSymbolicLink() ?
    Buffer.from(fs.readlinkSync(absolute), TEXT_ENCODING) :
    fs.readFileSync(absolute);
  return {
    ok: true,
    entry: {
      path: relative,
      state: STATE_PRESENT,
      mode: modeForStat(stat),
      bytes: bytes.length,
      sha256: sha256(bytes),
    },
  };
}

function gitEntry(root, commit, filePath) {
  const relative = canonicalPath(root, filePath);
  if (!relative) {
    return {ok: false, problem: `candidate content path is invalid: ${filePath}`};
  }
  const listed = spawnSync('git', ['ls-tree', '-z', commit, '--', relative], {
    cwd: root,
    encoding: TEXT_ENCODING,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  if (listed.status !== 0) {
    return {ok: false, problem: `candidate content git ls-tree failed for ${relative}: ${String(listed.stderr || '').trim()}`};
  }
  if (!listed.stdout) {
    return {ok: true, entry: {path: relative, state: STATE_DELETED}};
  }
  const match = /^(100644|100755|120000) blob ([0-9a-f]{40})\t(.+)\0$/u.exec(listed.stdout);
  if (!match || match[3] !== relative) {
    return {ok: false, problem: `candidate content git tree entry is unsupported for ${relative}`};
  }
  const blob = spawnSync('git', ['cat-file', 'blob', match[2]], {
    cwd: root,
    encoding: null,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  if (blob.status !== 0 || !Buffer.isBuffer(blob.stdout)) {
    return {ok: false, problem: `candidate content git blob read failed for ${relative}`};
  }
  return {
    ok: true,
    entry: {
      path: relative,
      state: STATE_PRESENT,
      mode: match[1],
      bytes: blob.stdout.length,
      sha256: sha256(blob.stdout),
    },
  };
}

function buildIdentity(entries) {
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    entries,
  };
  const canonical = `${JSON.stringify(manifest)}\n`;
  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    fingerprint: `sha256:${sha256(Buffer.from(canonical, TEXT_ENCODING))}`,
    manifest,
  };
}

export function candidateContentIdentity(root, paths, options = {}) {
  const uniquePaths = [...new Set(paths || [])].sort();
  const commit = typeof options.commit === 'string' ? options.commit : null;
  if (commit && !COMMIT_SHA_PATTERN.test(commit)) {
    return {ok: false, fingerprint: null, manifest: null,
      problem: 'candidate content commit must be a full Git SHA'};
  }
  const entries = [];
  for (const filePath of uniquePaths) {
    const result = commit ? gitEntry(root, commit, filePath) :
      worktreeEntry(root, filePath);
    if (!result.ok) {
      return {ok: false, fingerprint: null, manifest: null,
        problem: result.problem};
    }
    entries.push(result.entry);
  }
  return buildIdentity(entries);
}
