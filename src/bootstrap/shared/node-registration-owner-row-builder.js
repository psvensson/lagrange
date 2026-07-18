import os from 'os';
import {
  COLUMN,
  NODE_STATE,
  NUM,
  STATE,
} from '../../constants/index.js';

function buildNodeRegistrationRow({
  nodeId,
  nodeAddress,
  nodeCapabilities,
  now,
}) {
  const cpus = os.cpus();
  const totalMemoryBytes = os.totalmem();
  const totalMemoryMb = Math.floor(
    totalMemoryBytes / (NUM.THOUSAND * NUM.THOUSAND),
  );

  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.NODE_ADDRESS]: nodeAddress,
    [COLUMN.CPU_CORES]: cpus.length,
    [COLUMN.MEMORY_MB]: totalMemoryMb,
    [COLUMN.DISK_GB]: NUM.HUNDRED,
    [COLUMN.CPU_USAGE_PERCENT]: 0,
    [COLUMN.MEMORY_USAGE_PERCENT]: 0,
    [COLUMN.DISK_USAGE_PERCENT]: 0,
    [COLUMN.STATUS]: NODE_STATE.JOINING,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.CAPABILITIES]: JSON.stringify(nodeCapabilities || []),
    [COLUMN.LAST_HEARTBEAT]: now,
    [COLUMN.CREATED_AT]: now,
  };
}

export {buildNodeRegistrationRow};
