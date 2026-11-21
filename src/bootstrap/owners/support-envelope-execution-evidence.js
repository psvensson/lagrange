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
const UTF8 = 'utf8';
const RECORD_SEPARATOR = '\n';
const RECORDED_FINDING = 'finding';
const EVIDENCE_KIND = 'evidence';
const TOPOLOGY_CONDITION = 'topology';
const EXECUTION_ERROR = Object.freeze({
  INVALID_LOG: 'invalid original certification record log',
  MISSING_CERTIFICATION: 'missing recorded exact-run certification',
  ARCHIVE_PATH: 'certification archive path leaves its configured root',
  UNCERTIFIED_ARCHIVE: 'retained certification does not establish the requested physical run',
  UNAVAILABLE_ROOT: 'original certification archive root unavailable',
  WRONG_ARTIFACTS: 'original certification artifact identities do not match support policy',
  MISSING_DRILLS: 'original physical drill observations are incomplete or outside the support policy',
});
const arrayIsArray = Array.isArray;

function recordedCertifications(logPath) {
  const stat = lstatSync(logPath);
  if (!stat.isFile() || stat.size > MAX_RECORDED_LOG_BYTES) {
    throw new Error(EXECUTION_ERROR.INVALID_LOG);
  }
  const texts = readFileSync(logPath, UTF8).split(RECORD_SEPARATOR).filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.type === RECORDED_FINDING && entry.kind === EVIDENCE_KIND)
    .map((entry) => entry.text);
  return parseCertificationRecords(texts);
}

function archiveMatchesRecord(manifest, record, scenario) {
  return manifest.schema === ARCHIVE_SCHEMA && manifest.scenario === scenario &&
    manifest.runStartedAt === record.start && manifest.requestedSha === record.sha &&
    manifest.sha === record.sha && manifest.outcome === PASSED && manifest.certified === true;
}

function physicalCaptureComplete(manifest, started) {
  const controller = started?.controller;
  return Number.isSafeInteger(controller?.pid) && controller.pid > ZERO &&
    typeof controller.host === 'string' && controller.host.length > ZERO &&
    Array.isArray(manifest.missingNodeLogs) && manifest.missingNodeLogs.length === ZERO;
}

function certificationPassed(entry, sha) {
  const certification = entry.certification;
  return certification.schema === CERTIFICATION_SCHEMA && certification.requested === true &&
    certification.requestedSha === sha && certification.sha === sha &&
    certification.certified === true && certification.failures?.length === ZERO &&
    entry.outcome === PASSED;
}

function verifiedCertification(root, records, manifestDigest, scenario) {
  const record = records.find(
    (candidate) => candidate.scenario === scenario && candidate.manifestDigest === manifestDigest);
  if (!record || record.scenario !== scenario || record.outcome !== CERTIFIED ||
    !record.manifestDigest || !FULL_SHA.test(record.sha)) {
    throw new Error(EXECUTION_ERROR.MISSING_CERTIFICATION);
  }
  const directory = resolve(root, safeName(record.sha), safeName(record.start));
  if (realpathSync(directory) !== directory) {
    throw new Error(EXECUTION_ERROR.ARCHIVE_PATH);
  }
  const {entry, manifest, started} = verifyEvidenceDir(directory, {
    expectedManifestDigest: record.manifestDigest,
  });
  if (!archiveMatchesRecord(manifest, record, scenario) ||
      !physicalCaptureComplete(manifest, started) || !certificationPassed(entry, record.sha)) {
    throw new Error(EXECUTION_ERROR.UNCERTIFIED_ARCHIVE);
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

function placementWithinBounds(topology, detail, bounds) {
  const {nodeCount, replicationFactor} = detail;
  return topology.met === true && Number.isSafeInteger(nodeCount) &&
    nodeCount >= bounds.minNodes && nodeCount <= bounds.maxNodes &&
    replicationFactor === bounds.replicationFactor;
}

function placementMatchesHosts(placedNodes, hostSet, nodeCount) {
  const hosts = new Set(placedNodes.map((node) => node.hostId));
  return hosts.size === nodeCount && placedNodes.length === nodeCount &&
    hostSet.length === nodeCount && new Set(hostSet).size === nodeCount &&
    hostSet.every((host) => typeof host === 'string' && host.length > ZERO && hosts.has(host));
}

function deployedNodeIds(archive, detail, policy) {
  const topology = archive.entry.certification.conditions?.find(
    (condition) => condition.condition === TOPOLOGY_CONDITION);
  const placedNodes = topology?.evidence?.placedNodes;
  const hostSet = archive.manifest.hostSet;
  const {nodeCount} = detail;
  if (!Array.isArray(placedNodes) || !Array.isArray(hostSet) ||
      !placementWithinBounds(topology, detail, policy.topologyEnvelope) ||
      !placementMatchesHosts(placedNodes, hostSet, nodeCount)) return null;

  const nodes = new Set(placedNodes.map((node) => node.nodeId));
  const memberPaths = new Set(archive.manifest.files
    .filter((file) => file.bytes > ZERO).map((file) => file.path));
  const captured = [...nodes].every((node) => typeof node === 'string' && node.length > ZERO &&
    memberPaths.has(`logs/${safeName(node)}.log.gz`));
  return nodes.size === nodeCount && captured ? nodes : null;
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
    !Number.isSafeInteger(observation.completedAtMs) ||
    observation.startedAtMs < ZERO) return false;
  const elapsedMs = observation.completedAtMs - observation.startedAtMs;
  return elapsedMs > ZERO && elapsedMs <= policy.rebuildEnvelope.maxRebuildDurationMs &&
    availability.includes(observation.availability?.outcome) &&
    Number.isSafeInteger(observation.availability.durationMs) &&
    observation.availability.durationMs >= ZERO &&
    observation.availability.durationMs <= elapsedMs &&
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

function wipedReplicaRebuilt(effect, nodeIds, maxReplicaBytes) {
  return nodeIds.has(effect.nodeId) &&
    typeof effect.wipedReplicaId === 'string' && Boolean(effect.wipedReplicaId) &&
    typeof effect.rebuiltReplicaId === 'string' && Boolean(effect.rebuiltReplicaId) &&
    effect.wipedReplicaId !== effect.rebuiltReplicaId &&
    Number.isSafeInteger(effect.catchUpIndex) && effect.catchUpIndex > ZERO &&
    Number.isSafeInteger(effect.rebuiltBytes) && effect.rebuiltBytes > ZERO &&
    effect.rebuiltBytes <= maxReplicaBytes;
}

function serviceArtifactReplaced(effect, artifactAbi) {
  return effect.artifactAbi === artifactAbi &&
    ARTIFACT_DIGEST.test(effect.previousArtifactDigest) &&
    ARTIFACT_DIGEST.test(effect.observedArtifactDigest) &&
    effect.previousArtifactDigest !== effect.observedArtifactDigest &&
    Number.isSafeInteger(effect.previousGeneration) &&
    Number.isSafeInteger(effect.observedGeneration) &&
    effect.previousGeneration >= ZERO && effect.observedGeneration > effect.previousGeneration;
}

function rollbackBoundaryObserved(effect, policy, execution, rollbackRefusal) {
  return sameArtifact(effect.beforeCutoff?.restored, execution.source) &&
    effect.beforeCutoff.phase === policy.rollback.rollbackCutoff &&
    effect.afterCutoff?.reasonCode === rollbackRefusal &&
    sameArtifact(effect.afterCutoff.retained, execution.target);
}

function drillEffectObserved(drillId, effect, requirements, policy, execution, nodeIds) {
  const {ids, rollbackRefusal} = requirements;
  if (!effect) return false;
  switch (drillId) {
  case ids.ROLLING_UPGRADE:
    return rollingMeasured(effect, execution, nodeIds);
  case ids.DOWNGRADE_ROLLBACK_BOUNDARY:
    return rollbackBoundaryObserved(effect, policy, execution, rollbackRefusal);
  case ids.ONE_NODE_FAILURE_RECOVERY:
    return nodeIds.has(effect.failedNodeId) &&
      effect.failedNodeId === effect.recoveredNodeId &&
      sameArtifact(effect.recovered, execution.target);
  case ids.WIPED_REPLICA_REBUILD:
    return wipedReplicaRebuilt(effect, nodeIds, policy.rebuildEnvelope.maxReplicaBytes);
  case ids.SERVICE_ARTIFACT_UPGRADE:
    return serviceArtifactReplaced(effect, policy.boundaries.artifactAbi);
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

function verifyRequestedArtifacts({sourceVersion, targetVersion}, execution) {
  if (execution.source?.version !== sourceVersion || execution.target?.version !== targetVersion ||
      !ARTIFACT_DIGEST.test(execution.source.digest) ||
      !ARTIFACT_DIGEST.test(execution.target.digest) ||
      execution.source.digest === execution.target.digest) {
    throw new Error(EXECUTION_ERROR.WRONG_ARTIFACTS);
  }
}

// The release preparation owner supplies a local materialized archive root
// and recorded run references. A supplied envelope, digest of result flags,
// simulation, or source-only report is never an input to physical admission.
function readSupportEnvelopeExecution(policy, execution, requirements) {
  if (!execution || typeof execution.root !== 'string' ||
    typeof execution.recordedRunLog !== 'string') {
    throw new Error(EXECUTION_ERROR.UNAVAILABLE_ROOT);
  }
  verifyRequestedArtifacts(policy.versionPair, execution);
  const records = recordedCertifications(execution.recordedRunLog);
  const archive = verifiedCertification(
    execution.root, records, execution.releaseRun, RELEASE_SCENARIO);
  const detail = archive.entry.details?.upgradeRecoveryObservations;
  const nodes = detail?.schema === OBSERVATION_SCHEMA ?
    deployedNodeIds(archive, detail, policy) : null;
  if (nodes === null || !verifyRunSubject(detail, policy, execution) ||
    !verifyRequiredDrills(detail, policy, execution, requirements, nodes)) {
    throw new Error(EXECUTION_ERROR.MISSING_DRILLS);
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

function executionBinding(policyDigest, observation) {
  return {
    policyDigest,
    executionReferences: [...observation.executionReferences],
    sourceArtifactDigest: observation.sourceArtifactDigest,
    targetArtifactDigest: observation.targetArtifactDigest,
    nodeCount: observation.nodeCount,
  };
}

function sameExecutionBinding(retained, current) {
  return retained?.policyDigest === current.policyDigest &&
    retained.sourceArtifactDigest === current.sourceArtifactDigest &&
    retained.targetArtifactDigest === current.targetArtifactDigest &&
    retained.nodeCount === current.nodeCount &&
    arrayIsArray(retained.executionReferences) &&
    retained.executionReferences.length === current.executionReferences.length &&
    current.executionReferences.every((ref, index) => retained.executionReferences[index] === ref);
}

function loadSupportEnvelopeExecution(policy, execution, requirements) {
  try {
    return {
      reasonCode: requirements.accepted,
      observation: readSupportEnvelopeExecution(policy, execution, requirements),
    };
  } catch {
    return requirements.refusal;
  }
}

function measuredExecutionBinding(validation, execution, request) {
  if (!validation.valid) return null;
  const {observation} = execution;
  const matches = request.nodeCount === observation.nodeCount &&
    request.sourceArtifactDigest === observation.sourceArtifactDigest &&
    request.targetArtifactDigest === observation.targetArtifactDigest;
  return matches ? executionBinding(validation.actualDigest, observation) : null;
}

function rollbackBindingMatches(validation, execution, activeBinding, currentArtifactDigest) {
  return validation.valid &&
    sameExecutionBinding(activeBinding,
      executionBinding(validation.actualDigest, execution.observation)) &&
    [activeBinding.sourceArtifactDigest, activeBinding.targetArtifactDigest]
      .includes(currentArtifactDigest);
}

function mixedArtifactsMatch(pair, execution, local, peer) {
  const {observation} = execution;
  const artifactIdentities = new Map([
    [pair.sourceVersion, observation.sourceArtifactDigest],
    [pair.targetVersion, observation.targetArtifactDigest],
  ]);
  return local.digest === artifactIdentities.get(local.version) &&
    peer.digest === artifactIdentities.get(peer.version);
}

function nodeCountOutsideEnvelope(topology, validation, nodeCount) {
  if (!validation.policyValid || nodeCount === undefined) return false;
  return !Number.isSafeInteger(nodeCount) ||
    nodeCount < topology.minNodes || nodeCount > topology.maxNodes;
}

function knownMixedVersions(pair, localVersion, peerVersion) {
  const allowedVersions = new Set([pair.sourceVersion, pair.targetVersion]);
  return typeof localVersion === 'string' && typeof peerVersion === 'string' &&
    allowedVersions.has(localVersion) && allowedVersions.has(peerVersion);
}

export {
  knownMixedVersions, loadSupportEnvelopeExecution, measuredExecutionBinding,
  mixedArtifactsMatch, nodeCountOutsideEnvelope,
  rollbackBindingMatches, sameExecutionBinding,
};
