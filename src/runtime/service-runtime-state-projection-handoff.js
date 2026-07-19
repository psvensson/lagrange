import {
  UNIFIED_SERVICE_TYPE,
} from '../constants/unified-service-lifecycle.js';
import {normalizeCauseId} from '../utils/cause-id.js';

function buildReplicaStateProjectionRequest(
  definition,
  status,
  extras,
  context,
) {
  const nodeId = definition?.nodeId ??
    definition?.node_id ?? null;
  const serviceType = definition?.serviceType ??
    definition?.service_type ??
    UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
  return {
    causeId: normalizeCauseId(context?.causeId),
    nodeId,
    stateRow: {
      service_type: serviceType,
      node_id: nodeId,
      status,
      address: definition?.address ?? null,
      updated_at: Date.now(),
      ...extras,
    },
  };
}

function isRetainedStateProjection(projectionResult) {
  return projectionResult?.retained === true;
}

export {
  buildReplicaStateProjectionRequest,
  isRetainedStateProjection,
};
