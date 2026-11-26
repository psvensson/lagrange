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
