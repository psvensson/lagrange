import {requiresSourceVerification} from './change-artifact.js';
import {canonicalSourceDelta} from './verification.js';

const CANONICAL_SOURCE_ARTIFACT_REQUIREMENT =
  'source changeRef must be the complete canonical Git delta from the ' +
  'step-pinned base over every changed path';

export function canonicalSourceArtifactProblem(
  root,
  baseCommit,
  inspection,
) {
  const hasSourceChange = (inspection?.changedPaths || [])
    .some(requiresSourceVerification);
  if (!hasSourceChange || !baseCommit) return null;
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
