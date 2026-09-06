/**
 * Solver evidence store (solve-v2 phase 1): binaries never enter git.
 *
 *   node scripts/solve.js evidence add <path> --quest <id> [--frontier <f>]
 *
 * Uploads <path> as the asset `<quest-id>--<path under solve/ with __>` (the
 * basename outside solve/) of the dedicated GitHub pre-release `solve-evidence`, verifies the upload by downloading the asset
 * again and re-hashing it, and only then records a `finding` of kind
 * `evidence` on the quest carrying sha256, size, asset name and URL. A hash
 * mismatch, a failed upload or a failed download records nothing and exits 1.
 * The release is created once with `gh release create solve-evidence
 * --prerelease --latest=false`; its tag never matches release.yml's `v*`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

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
  file, questId, run = gh, tmpdir = os.tmpdir(), root = process.cwd(),
}) {
  const name = assetName(questId, file, root);
  const sha256 = sha256Of(file);
  const bytes = fs.statSync(file).size;
  const scratch = fs.mkdtempSync(path.join(tmpdir, SCRATCH_PREFIX));
  try {
    const staged = path.join(scratch, name);
    fs.copyFileSync(file, staged);
    run([GH_RELEASE, GH_UPLOAD, EVIDENCE_RELEASE_TAG, staged, GH_CLOBBER_FLAG]);
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

export {
  ASSET_SEPARATOR, EVIDENCE_RELEASE_TAG, EVIDENCE_REF_PREFIX,
  FINDING_KIND_EVIDENCE, assetName, sha256Of, uploadAndVerify,
};
