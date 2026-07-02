import {CDC_PIPELINE_METRIC} from '../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';

const ONE_MINUTE_MS = 60 * 1000;

function normalizePartitionSize(partition) {
  const sizeBytes = Number(partition?.size_bytes ?? partition?.sizeBytes ?? 0);
  return Number.isFinite(sizeBytes) ? sizeBytes : 0;
}

function findLocalLeaderPartitionService(partitionServices, partitionId) {
  if (!partitionServices ||
      !partitionId ||
      typeof partitionServices.values !== LOCAL_STR_FUNCTION) {
    return null;
  }

  for (const service of partitionServices.values()) {
    if (!service ||
        service.partitionId !== partitionId ||
        service.isLeader !== true ||
        typeof service.getSize !== LOCAL_STR_FUNCTION) {
      continue;
    }
    return service;
  }

  return null;
}

function normalizeCounterValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function resolveGeneratedWriteCount(partitionService) {
  if (!partitionService?.cdcPipelineMetrics ||
      typeof partitionService.cdcPipelineMetrics.getSnapshot !== LOCAL_STR_FUNCTION) {
    return null;
  }
  const snapshot = partitionService.cdcPipelineMetrics.getSnapshot();
  return normalizeCounterValue(
    snapshot?.[CDC_PIPELINE_METRIC.EVENTS_GENERATED],
  );
}

function calculateQueriesPerMinuteFromSample(
  partitionId,
  generatedWriteCount,
  nowMs,
  trafficSamples,
) {
  const previousSample = trafficSamples.get(partitionId);
  trafficSamples.set(partitionId, {
    sampledAtMs: nowMs,
    generatedWriteCount,
  });

  if (!previousSample ||
      !Number.isFinite(previousSample.sampledAtMs) ||
      !Number.isFinite(previousSample.generatedWriteCount)) {
    return 0;
  }

  const deltaMs = nowMs - previousSample.sampledAtMs;
  const deltaWrites = generatedWriteCount - previousSample.generatedWriteCount;
  if (deltaMs <= 0 || deltaWrites <= 0) {
    return 0;
  }

  return (deltaWrites * ONE_MINUTE_MS) / deltaMs;
}

function createManagedSplitMetricsProvider(options = {}) {
  const partitionServices = options.partitionServices || null;
  const nowFn = typeof options.now === 'function' ?
    options.now :
    () => Date.now();
  const trafficSamples = new Map();

  return (partitionId, partition) => {
    const normalizedPartitionId =
      partitionId || partition?.partition_id || partition?.partitionId || null;
    const localLeaderService = findLocalLeaderPartitionService(
      partitionServices,
      normalizedPartitionId,
    );

    if (localLeaderService) {
      const liveSizeBytes = Number(localLeaderService.getSize());
      const generatedWriteCount = resolveGeneratedWriteCount(localLeaderService);
      const queriesPerMinute = generatedWriteCount === null ?
        0 :
        calculateQueriesPerMinuteFromSample(
          normalizedPartitionId,
          generatedWriteCount,
          nowFn(),
          trafficSamples,
        );
      if (Number.isFinite(liveSizeBytes)) {
        return {
          sizeBytes: liveSizeBytes,
          queriesPerMinute,
        };
      }
    }

    return {
      sizeBytes: normalizePartitionSize(partition),
      queriesPerMinute: 0,
    };
  };
}

export {
  calculateQueriesPerMinuteFromSample,
  createManagedSplitMetricsProvider,
  findLocalLeaderPartitionService,
  resolveGeneratedWriteCount,
};
