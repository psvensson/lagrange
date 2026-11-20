import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  parseCertificationRecords, safeName, verifyEvidenceDir,
} from '../../utils/certification-evidence-record.js';

const RELEASE_SCENARIO = 'supported-upgrade-and-recovery-envelope';
const OBSERVATION_SCHEMA = 'support-upgrade-physical-execution/1';
const DEPENDENCY_SCHEMA = 'support-upgrade-physical-dependency/1';
const CERTIFICATION_SCHEMA = 'scenario-certification/1';
const ARCHIVE_SCHEMA = 'certification-evidence/1';
const PASSED = 'passed';
const CERTIFIED = 'certified';
const FULL_SHA = /^[a-f0-9]{40}$/u;
const ARTIFACT_DIGEST = /^sha256:[a-f0-9]{64}$/u;
const MAX_REQUIRED_WRITES = 100_000;
const MAX_RECORDED_LOG_BYTES = 8 * 1024 * 1024;
const ZERO = 0;

function recordedCertifications(logPath) {
  const stat = lstatSync(logPath);
  if (!stat.isFile() || stat.size > MAX_RECORDED_LOG_BYTES) {
    throw new Error('invalid original certification record log');
  }
  const texts = readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.type === 'finding' && entry.kind === 'evidence')
    .map((entry) => entry.text);
  return parseCertificationRecords(texts);
}

function verifiedCertification(root, records, manifestDigest, scenario) {
  const record = records.find(
    (candidate) => candidate.scenario === scenario && candidate.manifestDigest === manifestDigest);
  if (!record || record.scenario !== scenario || record.outcome !== CERTIFIED ||
    !record.manifestDigest || !FULL_SHA.test(record.sha)) {
    throw new Error('missing recorded exact-run certification');
  }
  const directory = resolve(root, safeName(record.sha), safeName(record.start));
  if (realpathSync(directory) !== directory) {
    throw new Error('certification archive path leaves its configured root');
  }
  const {entry, manifest, started} = verifyEvidenceDir(directory, {
    expectedManifestDigest: record.manifestDigest,
  });
  const certification = entry.certification;
  if (manifest.schema !== ARCHIVE_SCHEMA || manifest.scenario !== scenario ||
    manifest.runStartedAt !== record.start || manifest.requestedSha !== record.sha ||
    manifest.sha !== record.sha || manifest.outcome !== PASSED || manifest.certified !== true ||
    !Number.isSafeInteger(started?.controller?.pid) || started.controller.pid <= ZERO ||
    typeof started.controller.host !== 'string' || started.controller.host.length === ZERO ||
    !Array.isArray(manifest.missingNodeLogs) || manifest.missingNodeLogs.length !== ZERO ||
    certification.schema !== CERTIFICATION_SCHEMA || certification.requested !== true ||
    certification.requestedSha !== record.sha || certification.sha !== record.sha ||
    certification.certified !== true || certification.failures?.length !== ZERO ||
    entry.outcome !== PASSED) {
    throw new Error('retained certification does not establish the requested physical run');
  }
  return {entry, manifest, reference: record.manifestDigest};
}

function sameArtifact(found, expected) {
  return found?.version === expected.version &&
    ARTIFACT_DIGEST.test(found?.digest) && found.digest === expected.digest;
}

function verifyRunSubject(detail, policy, execution) {
  return detail?.policyDigest === policy.envelopeDigest &&
    sameArtifact(detail.source, execution.source) &&
    sameArtifact(detail.target, execution.target);
}

function deployedNodeIds(archive, detail, policy) {
  const topology = archive.entry.certification.conditions?.find(
    (condition) => condition.condition === 'topology');
  const placedNodes = topology?.evidence?.placedNodes;
  const hostSet = archive.manifest.hostSet;
  const nodeCount = detail.nodeCount;
  const bounds = policy.topologyEnvelope;
  if (!Array.isArray(placedNodes) || !Array.isArray(hostSet) ||
    topology.met !== true || !Number.isSafeInteger(nodeCount) ||
    nodeCount < bounds.minNodes || nodeCount > bounds.maxNodes ||
    detail.replicationFactor !== bounds.replicationFactor) return null;

  const hosts = new Set(placedNodes.map((node) => node.hostId));
  const nodes = new Set(placedNodes.map((node) => node.nodeId));
  const memberPaths = new Set(archive.manifest.files
    .filter((file) => file.bytes > ZERO).map((file) => file.path));
  const valid = hosts.size === nodeCount && nodes.size === nodeCount &&
    placedNodes.length === nodeCount && hostSet.length === nodeCount &&
    new Set(hostSet).size === nodeCount &&
    hostSet.every((host) => typeof host === 'string' && host.length > ZERO && hosts.has(host)) &&
    [...nodes].every((node) => typeof node === 'string' && node.length > ZERO &&
      memberPaths.has(`logs/${safeName(node)}.log.gz`));
  return valid ? nodes : null;
}

function writeMap(rows) {
  if (!Array.isArray(rows) || rows.length === ZERO || rows.length > MAX_REQUIRED_WRITES) {
    return null;
  }
  const result = new Map();
  for (const row of rows) {
    if (typeof row?.requestId !== 'string' || !row.requestId ||
      !ARTIFACT_DIGEST.test(row.checksum) || result.has(row.requestId)) return null;
    result.set(row.requestId, row.checksum);
  }
  return result;
}

function acknowledgedWritesPreserved(observation) {
  const accepted = writeMap(observation.acknowledgedWrites);
  const recovered = writeMap(observation.recoveredWrites);
  return accepted !== null && recovered !== null && accepted.size === recovered.size &&
    [...accepted].every(([requestId, checksum]) => recovered.get(requestId) === checksum);
}

function drillMeasured(observation, policy, availability) {
  if (!observation || !Number.isSafeInteger(observation.startedAtMs) ||
    !Number.isSafeInteger(observation.completedAtMs) || observation.startedAtMs < ZERO) return false;
  const elapsedMs = observation.completedAtMs - observation.startedAtMs;
  return elapsedMs > ZERO && elapsedMs <= policy.rebuildEnvelope.maxRebuildDurationMs &&
    availability.includes(observation.availability?.outcome) &&
    Number.isSafeInteger(observation.availability.durationMs) &&
    observation.availability.durationMs >= ZERO && observation.availability.durationMs <= elapsedMs &&
    acknowledgedWritesPreserved(observation);
}

function rollingMeasured(effect, execution, nodeIds) {
  if (!Array.isArray(effect.restarts) || effect.restarts.length !== nodeIds.size) return false;
  const distinctNodes = new Set();
  for (const restart of effect.restarts) {
    if (!nodeIds.has(restart?.nodeId) ||
      !sameArtifact(restart.before, execution.source) ||
      !sameArtifact(restart.after, execution.target)) return false;
    distinctNodes.add(restart.nodeId);
  }
  return distinctNodes.size === nodeIds.size;
}

function drillEffectObserved(drillId, effect, requirements, policy, execution, nodeIds) {
  const {ids, rollbackRefusal} = requirements;
  if (!effect) return false;
  switch (drillId) {
  case ids.ROLLING_UPGRADE:
    return rollingMeasured(effect, execution, nodeIds);
  case ids.DOWNGRADE_ROLLBACK_BOUNDARY:
    return sameArtifact(effect.beforeCutoff?.restored, execution.source) &&
      effect.beforeCutoff.phase === policy.rollback.rollbackCutoff &&
      effect.afterCutoff?.reasonCode === rollbackRefusal &&
      sameArtifact(effect.afterCutoff.retained, execution.target);
  case ids.ONE_NODE_FAILURE_RECOVERY:
    return nodeIds.has(effect.failedNodeId) &&
      effect.failedNodeId === effect.recoveredNodeId && sameArtifact(effect.recovered, execution.target);
  case ids.WIPED_REPLICA_REBUILD:
    return nodeIds.has(effect.nodeId) &&
      typeof effect.wipedReplicaId === 'string' && Boolean(effect.wipedReplicaId) &&
      typeof effect.rebuiltReplicaId === 'string' && Boolean(effect.rebuiltReplicaId) &&
      effect.wipedReplicaId !== effect.rebuiltReplicaId &&
      Number.isSafeInteger(effect.catchUpIndex) && effect.catchUpIndex > ZERO &&
      Number.isSafeInteger(effect.rebuiltBytes) && effect.rebuiltBytes > ZERO &&
      effect.rebuiltBytes <= policy.rebuildEnvelope.maxReplicaBytes;
  case ids.SERVICE_ARTIFACT_UPGRADE:
    return effect.artifactAbi === policy.boundaries.artifactAbi &&
      ARTIFACT_DIGEST.test(effect.previousArtifactDigest) &&
      ARTIFACT_DIGEST.test(effect.observedArtifactDigest) &&
      effect.previousArtifactDigest !== effect.observedArtifactDigest &&
      Number.isSafeInteger(effect.previousGeneration) &&
      Number.isSafeInteger(effect.observedGeneration) &&
      effect.previousGeneration >= ZERO && effect.observedGeneration > effect.previousGeneration;
  default:
    return false;
  }
}

function verifyRequiredDrills(detail, policy, execution, requirements, nodeIds) {
  return requirements.drillIds.every((drillId) => {
    const observation = detail.drills?.[drillId];
    return drillMeasured(observation, policy, requirements.availability) &&
      drillEffectObserved(
        drillId, observation.effect, requirements, policy, execution, nodeIds);
  });
}

function verifyDependency(records, questId, execution, policy) {
  const archive = verifiedCertification(
    execution.root, records, execution.dependencyRuns?.[questId], questId);
  const detail = archive.entry.details?.supportDependency;
  if (detail?.schema !== DEPENDENCY_SCHEMA || detail.questId !== questId ||
    !verifyRunSubject(detail, policy, execution)) {
    throw new Error(`dependency ${questId} does not attest the requested policy and artifact pair`);
  }
  return archive.reference;
}

// The release preparation owner supplies a local materialized archive root
// and recorded run references. A supplied envelope, digest of result flags,
// simulation, or source-only report is never an input to physical admission.
function readSupportEnvelopeExecution(policy, execution, requirements) {
  if (!execution || typeof execution.root !== 'string' ||
    typeof execution.recordedRunLog !== 'string') {
    throw new Error('original certification archive root unavailable');
  }
  const {sourceVersion, targetVersion} = policy.versionPair;
  if (execution.source?.version !== sourceVersion || execution.target?.version !== targetVersion ||
    !ARTIFACT_DIGEST.test(execution.source.digest) || !ARTIFACT_DIGEST.test(execution.target.digest) ||
    execution.source.digest === execution.target.digest) {
    throw new Error('original certification artifact identities do not match support policy');
  }
  const records = recordedCertifications(execution.recordedRunLog);
  const archive = verifiedCertification(
    execution.root, records, execution.releaseRun, RELEASE_SCENARIO);
  const detail = archive.entry.details?.upgradeRecoveryObservations;
  const nodes = detail?.schema === OBSERVATION_SCHEMA ?
    deployedNodeIds(archive, detail, policy) : null;
  if (nodes === null || !verifyRunSubject(detail, policy, execution) ||
    !verifyRequiredDrills(detail, policy, execution, requirements, nodes)) {
    throw new Error('original physical drill observations are incomplete or outside the support policy');
  }
  const dependencyReferences = requirements.dependencyIds.map(
    (questId) => verifyDependency(records, questId, execution, policy));
  return {
    nodeCount: detail.nodeCount,
    sourceArtifactDigest: execution.source.digest,
    targetArtifactDigest: execution.target.digest,
    drillIds: [...requirements.drillIds],
    executionReferences: [archive.reference, ...dependencyReferences],
  };
}

export {readSupportEnvelopeExecution};
