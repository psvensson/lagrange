import {CONFIG_KEY} from '../config/config-constants.js';
import {DEFAULT_TABLE_POLICY} from './policy-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_PLACEMENT_CONSTRAINTS = 'placementConstraints';

function resolveConfiguredTablePolicyDefaults(config) {
  return {
    ...DEFAULT_TABLE_POLICY,
    replicaCount:
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) ??
      DEFAULT_TABLE_POLICY.replicaCount,
    splitStorageThreshold:
      config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES) ??
      DEFAULT_TABLE_POLICY.splitStorageThreshold,
    splitTrafficThreshold:
      config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM) ??
      DEFAULT_TABLE_POLICY.splitTrafficThreshold,
    mergeStorageThreshold:
      config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES) ??
      DEFAULT_TABLE_POLICY.mergeStorageThreshold,
    mergeTrafficThreshold:
      config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM) ??
      DEFAULT_TABLE_POLICY.mergeTrafficThreshold,
    placementConstraints: {
      ...DEFAULT_TABLE_POLICY.placementConstraints,
    },
  };
}

function mergeStoredTablePolicyOverrides(storedPolicy, policyUpdates) {
  const stored = storedPolicy && typeof storedPolicy === LOCAL_STR_OBJECT ?
    storedPolicy : {};
  const merged = {...stored, ...policyUpdates};
  const placementUpdates = policyUpdates?.[LOCAL_STR_PLACEMENT_CONSTRAINTS];

  if (placementUpdates && typeof placementUpdates === LOCAL_STR_OBJECT) {
    const storedPlacement =
      stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] &&
      typeof stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] === LOCAL_STR_OBJECT ?
        stored[LOCAL_STR_PLACEMENT_CONSTRAINTS] : {};
    merged[LOCAL_STR_PLACEMENT_CONSTRAINTS] = {
      ...storedPlacement,
      ...placementUpdates,
    };
  }

  return merged;
}

export {
  mergeStoredTablePolicyOverrides,
  resolveConfiguredTablePolicyDefaults,
};
