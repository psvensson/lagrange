/**
 * Immutable diagnostic projection owner for OwnerKeyReconcileQueue.
 * Runtime scheduling mutates the queue; this module alone materializes its
 * hostile-intrinsic-safe array and object snapshots.
 */
const mapForEach = Function.call.bind(Map.prototype.forEach);
const setForEach = Function.call.bind(Set.prototype.forEach);
const objectDefineProperty = Object.defineProperty;

function defineSnapshotValue(snapshot, index, value) {
  objectDefineProperty(snapshot, index, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function appendSnapshotValue(snapshot, value) {
  defineSnapshotValue(snapshot, snapshot.length, value);
}

function appendBoundedSnapshotValue(snapshot, value, index, capacity) {
  if (snapshot.length < capacity) {
    appendSnapshotValue(snapshot, value);
  } else {
    defineSnapshotValue(snapshot, index, value);
  }
  return (index + 1) % capacity;
}

function recordStaleFenceDiagnosticSamples(queue, sample, capacity) {
  queue._staleClaimIndex = appendBoundedSnapshotValue(
    queue.staleClaims,
    sample,
    queue._staleClaimIndex,
    capacity,
  );
  queue._staleFenceSampleIndex = appendBoundedSnapshotValue(
    queue._staleFenceSamples,
    sample,
    queue._staleFenceSampleIndex,
    capacity,
  );
}

function copySnapshotValues(source) {
  const copy = [];
  for (let index = 0; index < source.length; index++) {
    defineSnapshotValue(copy, index, source[index]);
  }
  return copy;
}

function snapshotMapEntries(map) {
  const entries = [];
  let index = 0;
  mapForEach(map, (value, key) => {
    defineSnapshotValue(entries, index, [key, value]);
    index++;
  });
  return entries;
}

function snapshotMapKeys(map) {
  const keys = [];
  let index = 0;
  mapForEach(map, (_value, key) => {
    defineSnapshotValue(keys, index, key);
    index++;
  });
  return keys;
}

function snapshotSetValues(set) {
  const values = [];
  let index = 0;
  setForEach(set, (value) => {
    defineSnapshotValue(values, index, value);
    index++;
  });
  return values;
}

function buildReconcileQueueDiagnostics(queue) {
  const fenceTokens = {};
  mapForEach(queue.fenceTokens, (token, key) => {
    defineSnapshotValue(fenceTokens, key, token);
  });
  const retryStates = {};
  mapForEach(queue.retryStates, (state, key) => {
    defineSnapshotValue(retryStates, key, {...state});
  });
  const exhaustedRetryStates = {};
  mapForEach(queue.exhaustedRetryStates, (state, key) => {
    defineSnapshotValue(exhaustedRetryStates, key, {...state});
  });
  return {
    queue: queue.name,
    maxConcurrency: queue.maxConcurrency,
    maxItemsPerDrain: queue.maxItemsPerDrain,
    pendingKeys: snapshotMapKeys(queue.pending),
    retryingKeys: snapshotMapKeys(queue.retryWorkItems),
    exhaustedRetryKeys: snapshotMapKeys(queue.exhaustedWorkItems),
    inFlightKeys: snapshotSetValues(queue.inFlight),
    fenceTokens,
    staleClaims: copySnapshotValues(queue.staleClaims),
    staleFenceRejectionCount: queue._staleFenceRejectionCount,
    staleInFlightDeferralCount: queue._staleInFlightDeferralCount,
    recentStaleFenceSamples: copySnapshotValues(queue._staleFenceSamples),
    retryStates,
    exhaustedRetryStates,
    retryableDrainFailureCount: queue._retryableDrainFailureCount,
    retryableDrainExhaustedCount: queue._retryableDrainExhaustedCount,
    recentRetryableDrainFailureSamples:
      copySnapshotValues(queue._retryableDrainFailureSamples),
    draining: queue.draining,
    stopped: queue.stopped,
  };
}

export {
  appendSnapshotValue,
  buildReconcileQueueDiagnostics,
  recordStaleFenceDiagnosticSamples,
  snapshotMapEntries,
  snapshotSetValues,
};
