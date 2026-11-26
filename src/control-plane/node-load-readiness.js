import {COLUMN} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DEFAULT} from './control-plane-readiness-constants.js';

export function isNodeLoadReady(nodeRow) {
  const loadValues = [
    nodeRow?.[COLUMN.HOST_CPU_UTILIZATION_PERCENT],
    Number(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]),
    Number(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]),
  ];

  return loadValues.every((value) => {
    return !Number.isFinite(value) ||
      value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT;
  });
}
