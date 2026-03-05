import {NUM} from '../constants/index.js';

function normalizePartitionSize(partition) {
  const sizeBytes = Number(partition?.size_bytes ?? partition?.sizeBytes ?? NUM.ZERO);
  return Number.isFinite(sizeBytes) ? sizeBytes : NUM.ZERO;
}

function findLocalLeaderPartitionService(partitionServices, partitionId) {
  if (!partitionServices || !partitionId || typeof partitionServices.values !== 'function') {
    return null;
  }

  for (const service of partitionServices.values()) {
    if (!service ||
        service.partitionId !== partitionId ||
        service.isLeader !== true ||
        typeof service.getSize !== 'function') {
      continue;
    }
    return service;
  }

  return null;
}

function createManagedSplitMetricsProvider(options = {}) {
  const partitionServices = options.partitionServices || null;

  return (partitionId, partition) => {
    const normalizedPartitionId =
      partitionId || partition?.partition_id || partition?.partitionId || null;
    const localLeaderService = findLocalLeaderPartitionService(
      partitionServices,
      normalizedPartitionId,
    );

    if (localLeaderService) {
      const liveSizeBytes = Number(localLeaderService.getSize());
      if (Number.isFinite(liveSizeBytes)) {
        return {
          sizeBytes: liveSizeBytes,
          queriesPerMinute: NUM.ZERO,
        };
      }
    }

    return {
      sizeBytes: normalizePartitionSize(partition),
      queriesPerMinute: NUM.ZERO,
    };
  };
}

export {
  createManagedSplitMetricsProvider,
  findLocalLeaderPartitionService,
};
