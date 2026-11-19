// The declared host identity (src/topology/node-host-identity.js) of the
// nodes a test starts in this process: they all run on this machine, so they
// declare its name. A test that needs a synthetic multi-host topology
// declares its own host ids instead.
import {hostname} from 'node:os';

const LOCAL_MACHINE_HOST_ID = hostname();

function extractTopologyEntries(topology) {
  if (Array.isArray(topology)) {
    return topology;
  }
  return topology?.hosts || topology?.nodes || [];
}

function extractEntryHostId(entry) {
  if (typeof entry === 'string') {
    return entry.trim();
  }
  const raw = entry?.hostId || entry?.host_id || entry?.nodeId || entry?.node_id;
  return typeof raw === 'string' ? raw.trim() : '';
}

function declaredHostCountOf(topology) {
  if (Number.isSafeInteger(topology) && topology > 0) {
    return topology;
  }
  if (topology instanceof Set) {
    return topology.size;
  }
  const hosts = new Set();
  for (const entry of extractTopologyEntries(topology)) {
    const hostId = extractEntryHostId(entry);
    if (hostId.length > 0) {
      hosts.add(hostId);
    }
  }
  return hosts.size;
}

export {LOCAL_MACHINE_HOST_ID, declaredHostCountOf};
