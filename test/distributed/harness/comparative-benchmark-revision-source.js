// Read immutable local Git blobs without changing the checkout or inspecting the image.
import {execGit} from '../../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../../scripts/checks/git-process-environment.js';
import {computeContentRecordsFingerprint, FINGERPRINT_HEX_LENGTH} from
  '../../../src/diagnostics/source-fingerprint.js';
import {deploymentFailure, DEPLOYMENT_FAILURE} from './real-product-deployment-contract.js';

export function localRevisionSourceFingerprint(root, revision) {
  const git = {cwd: root, env: gitProcessEnvironment()};
  try {
    if (!/^[a-f0-9]{7,64}$/iu.test(revision)) throw new Error('expected a Git revision SHA');
    const matches = execGit(['rev-parse', '--disambiguate=' + revision], git)
      .toString().trim().split('\n').filter(Boolean);
    if (!matches.length) return null;
    if (matches.length !== 1) throw new Error('ambiguous revision');
    const commit = matches[0];
    if (execGit(['cat-file', '-t', commit], git).toString().trim() !== 'commit') {
      throw new Error('revision is not a commit');
    }
    const tree = execGit(['ls-tree', '-rz', commit + ':src'], git).toString('utf8');
    const entries = tree.split('\0').filter(Boolean).map((entry) => {
      const match = /^100(?:644|755) blob ([0-9a-f]+)\t([\s\S]+)$/u.exec(entry);
      if (!match) throw new Error('unsupported source tree entry');
      return {oid: match[1], relativePath: match[2]};
    }).filter(({relativePath}) => !relativePath.split('/').includes('node_modules'));
    const output = execGit(['cat-file', '--batch'], {...git,
      input: entries.map(({oid}) => oid + '\n').join('')});
    let offset = 0;
    const records = entries.map(({oid, relativePath}) => {
      const end = output.indexOf(10, offset);
      const [id, type, size] = output.toString('ascii', offset, end).split(' ');
      if (id !== oid || type !== 'blob') throw new Error('incomplete revision source');
      const start = end + 1;
      const next = start + Number(size);
      if (output[next] !== 10) throw new Error('truncated revision source');
      offset = next + 1;
      return {relativePath, content: output.subarray(start, next)};
    });
    return computeContentRecordsFingerprint(records).slice(0, FINGERPRINT_HEX_LENGTH);
  } catch (error) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      'cannot verify requested image revision source', {revision, reason: error.message});
  }
}

const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
export const PRODUCT_COMMIT_ABSENT = 'product_commit_absent';

/**
 * What a research plan declares about the product source it tests, read from the commit's
 * tree through the one fingerprint function above: the expected source fingerprint and the
 * package version of that commit. An absent commit is a typed refusal.
 * @param {string} root the repository holding the commit
 * @param {string} commit a full 40-hex commit id
 * @return {{declaredCommit: string, sourceFingerprintExpected: string, version: string}}
 */
export function productCommitProvenance(root, commit) {
  const git = {cwd: root, env: gitProcessEnvironment()};
  const fingerprint = FULL_COMMIT_PATTERN.test(commit) ?
    localRevisionSourceFingerprint(root, commit) : null;
  if (!fingerprint) {
    throw deploymentFailure(PRODUCT_COMMIT_ABSENT,
      `the product commit ${commit} is not a commit of the load generator repository`, {commit});
  }
  const version = JSON.parse(execGit(['show', `${commit}:package.json`], git).toString()).version;
  return {declaredCommit: commit, sourceFingerprintExpected: fingerprint, version};
}
