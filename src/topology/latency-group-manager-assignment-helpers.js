/**
 * Assignment and lifecycle helpers for LatencyGroupManager.
 */

import {COLUMN} from '../constants/index.js';
import {LATENCY_GROUP_STATE} from './latency-topology-constants.js';

function buildNormalizedGroupRow(options) {
  const groupRow = options.groupRow;
  return {
    [COLUMN.GROUP_ID]: options.groupId,
    [COLUMN.REPRESENTATIVE_NODE_ID]:
      groupRow?.[COLUMN.REPRESENTATIVE_NODE_ID] || null,
    [COLUMN.COORDINATOR_NODE_ID]:
      groupRow?.[COLUMN.COORDINATOR_NODE_ID] || null,
    [COLUMN.STATE]: options.desiredState,
    [COLUMN.CREATED_AT]: groupRow?.[COLUMN.CREATED_AT] || options.timestamp,
    [COLUMN.UPDATED_AT]: options.timestamp,
  };
}

function shouldPersistLifecycleState(currentGroupRow, nextGroupRow) {
  if (!currentGroupRow) {
    return true;
  }
  return currentGroupRow[COLUMN.STATE] !== nextGroupRow[COLUMN.STATE];
}

function buildLatencyGroupMap(allGroupRows) {
  const map = new Map();
  for (const groupRow of allGroupRows) {
    const groupId = groupRow?.[COLUMN.GROUP_ID];
    if (!groupId) {
      continue;
    }
    map.set(groupId, groupRow);
  }
  return map;
}

function buildNodeRowsAfterAssignment(options) {
  return options.allNodeRows.map((nodeRow) => {
    if (nodeRow?.[COLUMN.NODE_ID] !== options.nodeId) {
      return nodeRow;
    }
    return {
      ...nodeRow,
      [COLUMN.LATENCY_GROUP_ID]: options.targetGroupId,
    };
  });
}

function collectAffectedGroupIds(previousGroupId, targetGroupId) {
  const groupIds = new Set();
  if (previousGroupId) {
    groupIds.add(previousGroupId);
  }
  if (targetGroupId) {
    groupIds.add(targetGroupId);
  }
  return [...groupIds];
}

function selectNearestEligibleGroup(measurements, groupThresholdMs) {
  const eligible = measurements.filter((measurement) => {
    return measurement.rttMs <= groupThresholdMs;
  });
  return eligible[0] || null;
}

function getMeasurementForGroup(measurements, groupId) {
  if (!groupId) {
    return null;
  }
  return measurements.find((measurement) => measurement.groupId === groupId) ||
    null;
}

function getActiveLatencyGroups(groupRows) {
  return groupRows.filter((groupRow) => {
    const state = groupRow?.[COLUMN.STATE];
    return !state || state === LATENCY_GROUP_STATE.ACTIVE;
  });
}

export {
  buildLatencyGroupMap,
  buildNodeRowsAfterAssignment,
  buildNormalizedGroupRow,
  collectAffectedGroupIds,
  getActiveLatencyGroups,
  getMeasurementForGroup,
  selectNearestEligibleGroup,
  shouldPersistLifecycleState,
};
