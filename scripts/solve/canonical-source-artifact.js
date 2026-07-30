import {
  requiresSourceVerification,
  parseCommitChangeRef,
} from './change-artifact.js';
import {canonicalSourceDelta} from './verification.js';
import {canonicalCommitDelta} from './content-addressed-change-artifact.js';

const CANONICAL_SOURCE_ARTIFACT_REQUIREMENT =
  'source changeRef must be the complete canonical Git delta from the ' +
  'step-pinned base over every changed path';
const PROBLEM_COMMIT_REF_BASE_MISMATCH =
  'commit changeRef base does not match the step-pinned base';

export function canonicalSourceArtifactProblem(
  root,
  baseCommit,
  inspection,
) {
  const hasSourceChange = (inspection?.changedPaths || [])
    .some(requiresSourceVerification);
  if (!hasSourceChange || !baseCommit) return null;
  // A measurement-only (commit:) changeRef is canonical by construction when
  // its recorded base matches the ref's base and its content reproduces the
  // committed tree-to-tree delta over its own changed paths.
  const commitRef = parseCommitChangeRef(inspection?.filePath);
  if (commitRef) {
    if (commitRef.base !== baseCommit) {
      return `${CANONICAL_SOURCE_ARTIFACT_REQUIREMENT}: ` +
        PROBLEM_COMMIT_REF_BASE_MISMATCH;
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
