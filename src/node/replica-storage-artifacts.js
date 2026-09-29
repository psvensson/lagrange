const REPLICA_STORAGE_ARTIFACT_SUFFIXES = Object.freeze([
  '',
  '-wal',
  '-shm',
  '-journal',
]);

const REPLICA_STORAGE_ARTIFACT_OUTCOME = Object.freeze({
  ALREADY_ABSENT: 'already_absent',
  DELETED: 'deleted',
  FAILED: 'failed',
  RETRY_DEFERRED: 'retry_deferred',
});

const RETRYABLE_UNLINK_CODES = new Set([
  'EACCES',
  'EAGAIN',
  'EBUSY',
  'EPERM',
]);

function replicaStorageArtifactPaths(dbPath) {
  return REPLICA_STORAGE_ARTIFACT_SUFFIXES.map((suffix) =>
    `${dbPath}${suffix}`);
}

function replicaStorageArtifactsAbsent(fs, dbPath) {
  return replicaStorageArtifactPaths(dbPath).every((artifactPath) =>
    !fs.existsSync(artifactPath));
}

async function removeReplicaStorageArtifacts(fs, dbPath, beforeRemove) {
  const outcomes = Array.from({length: 0});
  for (const artifactPath of replicaStorageArtifactPaths(dbPath)) {
    if (!fs.existsSync(artifactPath)) {
      outcomes.push({artifactPath,
        outcome: REPLICA_STORAGE_ARTIFACT_OUTCOME.ALREADY_ABSENT});
      continue;
    }
    await beforeRemove?.(artifactPath);
    try {
      fs.unlinkSync(artifactPath);
      outcomes.push({artifactPath,
        outcome: REPLICA_STORAGE_ARTIFACT_OUTCOME.DELETED});
    } catch (error) {
      const outcome = !fs.existsSync(artifactPath) ?
        REPLICA_STORAGE_ARTIFACT_OUTCOME.ALREADY_ABSENT :
        RETRYABLE_UNLINK_CODES.has(error?.code) ?
          REPLICA_STORAGE_ARTIFACT_OUTCOME.RETRY_DEFERRED :
          REPLICA_STORAGE_ARTIFACT_OUTCOME.FAILED;
      outcomes.push({artifactPath, outcome, error});
    }
  }
  return Object.freeze({
    allAbsent: replicaStorageArtifactsAbsent(fs, dbPath),
    outcomes: Object.freeze(outcomes),
  });
}

export {
  REPLICA_STORAGE_ARTIFACT_OUTCOME,
  removeReplicaStorageArtifacts,
  replicaStorageArtifactsAbsent,
};
