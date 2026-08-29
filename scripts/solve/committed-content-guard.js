import {spawnSync} from 'node:child_process';

import {candidateContentIdentity} from './candidate-content-identity.js';

export const COMMITTED_CANDIDATE_IDENTITY_MISMATCH =
  'COMMITTED_CANDIDATE_IDENTITY_MISMATCH';

function headCommit(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `${COMMITTED_CANDIDATE_IDENTITY_MISMATCH}: committed HEAD is unreadable`,
    );
  }
  return String(result.stdout || '').trim();
}

export function assertCommittedContentIdentity(
  root,
  paths,
  expectedFingerprint,
) {
  if (!expectedFingerprint) return null;
  const commit = headCommit(root);
  const identity = candidateContentIdentity(root, paths, {commit});
  if (!identity.ok || identity.fingerprint !== expectedFingerprint) {
    throw new Error(
      `${COMMITTED_CANDIDATE_IDENTITY_MISMATCH}: reviewed ${expectedFingerprint} ` +
      `but committed ${identity.fingerprint || identity.problem || '<unavailable>'}`,
    );
  }
  return {
    commit,
    fingerprint: identity.fingerprint,
    paths: [...paths].sort(),
  };
}
