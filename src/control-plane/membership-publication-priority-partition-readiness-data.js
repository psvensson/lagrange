import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  appendOwnArrayValue,
  buildStringSet,
  copyDenseOwnDataArray,
  copyStrictOwnDataRecord,
  createNullRecord,
  DATA_PROPERTY_STATE,
  defineOwnDataProperty,
  inspectOwnDataProperty,
  normalizePrimitiveStringList,
  readOwnDataProperty,
} from './membership-publication-priority-partition-canonical-data.js';

const DIMENSIONS_FIELD = 'dimensions';
const LOCALLY_ELIGIBLE_NODE_IDS_FIELD = 'locallyEligibleNodeIds';
const PROJECTED_SERVING_NODE_IDS_FIELD = 'projectedServingNodeIds';
const PUBLISHED_ACTIVE_NODE_IDS_FIELD = 'publishedActiveNodeIds';
const READINESS_BY_NODE_ID_FIELD = 'readinessByNodeId';
const objectKeys = Object.keys;

function isReadinessPromotable(readinessEntry = null) {
  if (readinessEntry === null || readinessEntry === undefined) {
    return true;
  }
  const readinessSnapshot = copyStrictOwnDataRecord(readinessEntry);
  if (readinessSnapshot === null) {
    return false;
  }
  const dimensionsEntry = inspectOwnDataProperty(
    readinessSnapshot,
    [DIMENSIONS_FIELD],
  );
  if (dimensionsEntry.state === DATA_PROPERTY_STATE.ABSENT) {
    return true;
  }
  if (dimensionsEntry.state !== DATA_PROPERTY_STATE.VALID) {
    return false;
  }
  const dimensions = copyStrictOwnDataRecord(dimensionsEntry.value);
  if (dimensions === null) {
    return false;
  }
  const readDimension = (name) => readOwnDataProperty(dimensions, [name]);
  const published = readDimension(
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED,
  );
  const recoveryEligible = readDimension(
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );
  const hasPublicationSignal = published.found || recoveryEligible.found;
  const clusterHealthy = readDimension(
    CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
  ).value;
  const controlPlaneWritable = readDimension(
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
  ).value;
  const repairEligible = readDimension(
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
  ).value;
  const serveEligible = readDimension(
    CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  ).value;
  if (!hasPublicationSignal) {
    return clusterHealthy === true &&
      controlPlaneWritable !== false &&
      repairEligible !== false &&
      serveEligible !== false;
  }
  if (published.value === true) {
    return clusterHealthy === true &&
      controlPlaneWritable !== false &&
      repairEligible !== false &&
      serveEligible !== false;
  }
  return recoveryEligible.value === true;
}

function readOwnDenseStringArrayState(record, propertyName) {
  const entry = inspectOwnDataProperty(record, [propertyName]);
  if (entry.state !== DATA_PROPERTY_STATE.VALID) {
    return entry;
  }
  const values = copyDenseOwnDataArray(entry.value);
  const normalized = values === null ? null : normalizePrimitiveStringList(values);
  return normalized === null ?
    {state: DATA_PROPERTY_STATE.INVALID, value: null} :
    {state: DATA_PROPERTY_STATE.VALID, value: normalized};
}

function copyNodeEvidenceById(options) {
  const entry = inspectOwnDataProperty(options, [READINESS_BY_NODE_ID_FIELD]);
  if (entry.state === DATA_PROPERTY_STATE.ABSENT) {
    return createNullRecord(null);
  }
  if (entry.state !== DATA_PROPERTY_STATE.VALID) {
    return null;
  }
  const source = copyStrictOwnDataRecord(entry.value);
  if (source === null) {
    return null;
  }
  const copy = createNullRecord(null);
  const nodeIds = objectKeys(source);
  for (let index = 0; index < nodeIds.length; index += 1) {
    const nodeId = nodeIds[index];
    const normalizedNodeId = normalizePrimitiveStringList([nodeId]);
    if (normalizedNodeId === null || normalizedNodeId[0] !== nodeId) {
      return null;
    }
    const readiness = copyStrictOwnDataRecord(source[nodeId]);
    if (readiness === null) {
      return null;
    }
    const dimensionsEntry = inspectOwnDataProperty(
      readiness,
      [DIMENSIONS_FIELD],
    );
    if (dimensionsEntry.state === DATA_PROPERTY_STATE.INVALID) {
      return null;
    }
    if (dimensionsEntry.state === DATA_PROPERTY_STATE.VALID) {
      const dimensions = copyStrictOwnDataRecord(dimensionsEntry.value);
      if (dimensions === null) {
        return null;
      }
      defineOwnDataProperty(readiness, DIMENSIONS_FIELD, {
        value: dimensions,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    defineOwnDataProperty(copy, nodeId, {
      value: readiness,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copy;
}

function hasInvalidNodeListInput(inputs) {
  for (let index = 0; index < inputs.length; index += 1) {
    if (inputs[index].state === DATA_PROPERTY_STATE.INVALID) {
      return true;
    }
  }
  return false;
}

function resolvePreferredNodeIds(
  locallyEligibleNodeIds,
  projectedServingNodeIds,
  publishedActiveNodeIds,
) {
  if (locallyEligibleNodeIds.value?.length > 0) {
    return locallyEligibleNodeIds.value;
  }
  if (projectedServingNodeIds.value?.length > 0) {
    return projectedServingNodeIds.value;
  }
  return publishedActiveNodeIds.value || [];
}

function buildPrioritySpreadEligibleNodeSnapshot(options = {}) {
  const locallyEligibleNodeIds = readOwnDenseStringArrayState(
    options,
    LOCALLY_ELIGIBLE_NODE_IDS_FIELD,
  );
  const projectedServingNodeIds = readOwnDenseStringArrayState(
    options,
    PROJECTED_SERVING_NODE_IDS_FIELD,
  );
  const publishedActiveNodeIds = readOwnDenseStringArrayState(
    options,
    PUBLISHED_ACTIVE_NODE_IDS_FIELD,
  );
  const inputs = [
    locallyEligibleNodeIds,
    projectedServingNodeIds,
    publishedActiveNodeIds,
  ];
  if (hasInvalidNodeListInput(inputs)) {
    return null;
  }
  const preferredNodeIds = resolvePreferredNodeIds(
    locallyEligibleNodeIds,
    projectedServingNodeIds,
    publishedActiveNodeIds,
  );
  const readinessByNodeId = copyNodeEvidenceById(options);
  if (readinessByNodeId === null) {
    return null;
  }
  if (preferredNodeIds.length > 0) {
    return {
      eligibleNodeIds: buildStringSet(preferredNodeIds),
      readinessByNodeId,
    };
  }
  const promotableNodeIds = [];
  const readinessNodeIds = objectKeys(readinessByNodeId);
  for (let index = 0; index < readinessNodeIds.length; index += 1) {
    const nodeId = readinessNodeIds[index];
    const entry = readOwnDataProperty(readinessByNodeId, [nodeId]);
    if (entry.found && isReadinessPromotable(entry.value)) {
      appendOwnArrayValue(promotableNodeIds, nodeId);
    }
  }
  const normalizedPromotableNodeIds = normalizePrimitiveStringList(
    promotableNodeIds,
  );
  if (normalizedPromotableNodeIds === null) {
    return null;
  }
  return {
    eligibleNodeIds: buildStringSet(normalizedPromotableNodeIds),
    readinessByNodeId,
  };
}

export {
  buildPrioritySpreadEligibleNodeSnapshot,
  isReadinessPromotable,
};
