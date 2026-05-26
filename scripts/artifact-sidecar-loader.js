import fs from 'node:fs';
import path from 'node:path';

const ENCODING_UTF8 = 'utf8';
const NUM_ZERO = 0;
const EMPTY_TEXT = '';
const PROPERTY_FAILURE_BUNDLE = 'failureBundle';
const PROPERTY_SCENARIOS = 'scenarios';
const PROPERTY_JSON_PATH = 'jsonPath';
const PROPERTY_TRIAGE_JSON_PATH = 'triageJsonPath';

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ?
    value :
    {};
}

function firstScenario(artifact) {
  const scenarios = Array.isArray(artifact?.[PROPERTY_SCENARIOS]) ?
    artifact[PROPERTY_SCENARIOS] :
    [];
  return asRecord(scenarios[NUM_ZERO]);
}

function readLinkedJsonFile(linkPath) {
  return JSON.parse(fs.readFileSync(linkPath, ENCODING_UTF8));
}

function resolveLinkedArtifactPath(sourceArtifactPath, linkedPath) {
  const candidate = String(linkedPath || EMPTY_TEXT).trim();
  if (!candidate) {
    return EMPTY_TEXT;
  }
  if (path.isAbsolute(candidate) || fs.existsSync(candidate)) {
    return candidate;
  }
  return path.resolve(path.dirname(sourceArtifactPath), candidate);
}

function readOptionalLinkedJson(sourceArtifactPath, linkedPath) {
  const resolvedPath = resolveLinkedArtifactPath(sourceArtifactPath, linkedPath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return {};
  }
  return readLinkedJsonFile(resolvedPath);
}

function selectSidecarLinks(artifact) {
  return asRecord(firstScenario(artifact)[PROPERTY_FAILURE_BUNDLE]);
}

function enrichArtifactWithSidecarsSync(sourceArtifactPath, artifact) {
  const links = selectSidecarLinks(artifact);
  const failureBundle = readOptionalLinkedJson(
    sourceArtifactPath,
    links[PROPERTY_JSON_PATH],
  );
  const triageSummary = readOptionalLinkedJson(
    sourceArtifactPath,
    links[PROPERTY_TRIAGE_JSON_PATH],
  );
  if (
    Object.keys(failureBundle).length === NUM_ZERO &&
    Object.keys(triageSummary).length === NUM_ZERO
  ) {
    return artifact;
  }
  return {
    report: artifact,
    ...(Object.keys(failureBundle).length > NUM_ZERO ? {failureBundle} : {}),
    ...(Object.keys(triageSummary).length > NUM_ZERO ? {triageSummary} : {}),
  };
}

function readArtifactWithSidecarsSync(sourceArtifactPath) {
  const artifact = readLinkedJsonFile(sourceArtifactPath);
  return enrichArtifactWithSidecarsSync(sourceArtifactPath, artifact);
}

export {
  enrichArtifactWithSidecarsSync,
  readArtifactWithSidecarsSync,
};
