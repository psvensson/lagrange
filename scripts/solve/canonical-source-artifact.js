import {spawnSync} from 'node:child_process';

import {
  requiresSourceVerification,
  parseCommitChangeRef,
} from './change-artifact.js';
import {canonicalSourceDelta} from './verification.js';
import {canonicalCommitDelta} from './content-addressed-change-artifact.js';

const CANONICAL_SOURCE_ARTIFACT_REQUIREMENT =
  'source changeRef must be the complete canonical Git delta from the ' +
  'step-pinned base over every changed path';
const PROBLEM_COMMIT_REF_RANGE_NOT_IN_HISTORY =
  'commit changeRef range must satisfy base ancestor of head and head ' +
  'ancestor of-or-equal the step-pinned base (the claimed committed work ' +
  'must already be in history, never foreign or future work)';
const GIT_BINARY = 'git';
const TEXT_ENCODING = 'utf8';
const GIT_MERGE_BASE_SUBCOMMAND = 'merge-base';
const GIT_IS_ANCESTOR_FLAG = '--is-ancestor';

function gitIsAncestor(root, ancestor, descendant) {
  return spawnSync(GIT_BINARY,
    [GIT_MERGE_BASE_SUBCOMMAND, GIT_IS_ANCESTOR_FLAG, ancestor, descendant],
    {cwd: root, encoding: TEXT_ENCODING}).status === 0;
}

export function canonicalSourceArtifactProblem(
  root,
  baseCommit,
  inspection,
) {
  const hasSourceChange = (inspection?.changedPaths || [])
    .some(requiresSourceVerification);
  if (!hasSourceChange || !baseCommit) return null;
  // A measurement-only (commit:) changeRef is canonical by construction when
  // its content reproduces the committed tree-to-tree delta over its own
  // changed paths AND its range is genuinely within history at the step-pinned
  // base. Two shapes are honest:
  //   - just-committed work: base === pinned base, head a later commit;
  //   - already-committed work (the case this path exists for): base and head
  //     both ancestors of-or-equal the pinned base, i.e. the claimed work was
  //     committed before this step began. The inspection's scope-cross rule
  //     (workflow vs runtime) independently refuses ranges that sweep in
  //     foreign-path commits, so a historical range cannot launder provenance.
  const commitRef = parseCommitChangeRef(inspection?.filePath);
  if (commitRef) {
    const inHistory = gitIsAncestor(root, commitRef.base, commitRef.head) &&
      gitIsAncestor(root, commitRef.head, baseCommit);
    const justCommitted = commitRef.base === baseCommit;
    if (!justCommitted && !inHistory) {
      return `${CANONICAL_SOURCE_ARTIFACT_REQUIREMENT}: ` +
        PROBLEM_COMMIT_REF_RANGE_NOT_IN_HISTORY;
    }
    const canonical = canonicalCommitDelta(
      root, commitRef.base, commitRef.head, inspection.changedPaths);
    if (!canonical.ok) {
      return `${CANONICAL_SOURCE_ARTIFACT_REQUIREMENT}: ${canonical.problem}`;
    }
    return canonical.content === inspection.content ?
      null : CANONICAL_SOURCE_ARTIFACT_REQUIREMENT;
  }
  const canonical = canonicalSourceDelta(
    root,
    baseCommit,
    inspection.changedPaths,
  );
  if (!canonical.ok) {
    return `${CANONICAL_SOURCE_ARTIFACT_REQUIREMENT}: ${canonical.problem}`;
  }
  return canonical.content === inspection.content ?
    null : CANONICAL_SOURCE_ARTIFACT_REQUIREMENT;
}
