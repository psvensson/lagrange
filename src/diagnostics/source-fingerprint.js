// Deterministic content fingerprint of a source tree, shared verbatim by the
// node entrypoint (src/index.js) and the distributed test harness. Because both
// import THIS module, the algorithm is identical by construction — the harness
// can compute the working-tree fingerprint, the node can compute the fingerprint
// of the code it actually booted from (/app/src), and a mismatch is proof the
// container ran stale code (the fast-local reuse trap).
//
// CONTENT hash, not mtime/size: branch switches, reverts, `git checkout`,
// formatters and editors routinely change file CONTENT while leaving size/mtime
// unchanged (false negative → stale code passes as fresh), and Docker bind
// mounts do not preserve mtime identically across platforms (false positive →
// fresh code flagged stale). Bytes are bytes across the mount, so a content hash
// is the only basis that is sound in both directions.

import crypto from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';

// Versioned so a future change to the hashing scheme is visibly distinguishable
// in stamped artifacts rather than silently comparing across incompatible algos.
const SOURCE_FINGERPRINT_ALGORITHM = 'sha256-content-v1';
// Container env var carrying the harness-computed working-tree fingerprint into
// the node. Bare (not LAGRANGE_-prefixed) so it is an explicit harness→node
// channel set verbatim, never shadowed by the LAGRANGE_* host auto-forward.
const SOURCE_FINGERPRINT_ENV_VAR = 'SRC_FINGERPRINT';
const HASH_NAME = 'sha256';
const FINGERPRINT_HEX_LENGTH = 16;
const POSIX_PATH_SEPARATOR = '/';

async function collectFilePathsRecursively(currentDir, accumulator) {
  const entries = await readdir(currentDir, {withFileTypes: true});
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectFilePathsRecursively(absolutePath, accumulator);
    } else if (entry.isFile()) {
      accumulator.push(absolutePath);
    }
  }
  return accumulator;
}

function toPosixRelativePath(rootDir, absolutePath) {
  return path
    .relative(rootDir, absolutePath)
    .split(path.sep)
    .join(POSIX_PATH_SEPARATOR);
}

// Each file contributes a length-prefixed (relative-path, content) record:
// "<pathByteLen>:<path><contentByteLen>:<content>". The explicit byte lengths
// make record framing unambiguous regardless of which bytes a path or file
// content contains, so two distinct trees cannot collide by shuffling where one
// file's bytes end and the next begins.
function updateHashWithRecord(hash, relativePath, content) {
  const pathBuffer = Buffer.from(relativePath, 'utf8');
  hash.update(String(pathBuffer.length), 'utf8');
  hash.update(':', 'utf8');
  hash.update(pathBuffer);
  hash.update(String(content.length), 'utf8');
  hash.update(':', 'utf8');
  hash.update(content);
}

/**
 * Compute a deterministic content fingerprint of every regular file under
 * rootDir. Order-independent (paths are sorted) and location-independent (only
 * the POSIX relative path participates), so the same tree yields the same hex on
 * the host and inside the container regardless of readdir order or absolute path.
 * @param {string} rootDir Directory to fingerprint.
 * @return {Promise<string>} Short lowercase hex digest.
 */
async function computeSourceFingerprint(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const filePaths = await collectFilePathsRecursively(absoluteRoot, []);
  const records = filePaths
    .map((absolutePath) => ({
      relativePath: toPosixRelativePath(absoluteRoot, absolutePath),
      absolutePath,
    }))
    .sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));

  const hash = crypto.createHash(HASH_NAME);
  // Bind the file count into the digest so adding/removing files always changes
  // the fingerprint even in degenerate empty/single-file edge cases.
  hash.update(String(records.length), 'utf8');
  hash.update(':', 'utf8');
  for (const {relativePath, absolutePath} of records) {
    const content = await readFile(absolutePath);
    updateHashWithRecord(hash, relativePath, content);
  }
  return hash.digest('hex').slice(0, FINGERPRINT_HEX_LENGTH);
}

export {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ALGORITHM,
  SOURCE_FINGERPRINT_ENV_VAR,
  FINGERPRINT_HEX_LENGTH,
};
