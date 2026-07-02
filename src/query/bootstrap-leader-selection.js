import {RAFT_ROLE} from '../raft/constants.js';

const LOCAL_STR_LEADER_ROLE = 'leader_role';
const LOCAL_STR_LEADER_HINT = 'leader_hint';
const LOCAL_STR_SINGLE_SERVICE = 'single_service';

function normalizeVisiblePartitionServices(services) {
  return (Array.isArray(services) ? services : [])
    .filter((service) => service && typeof service === 'object')
    .filter((service) => {
      const nodeId = String(service?.node_id || service?.nodeId || '');
      return nodeId.length > 0;
    });
}

function resolveBootstrapLeaderSelection(options = {}) {
  const visibleServices =
    normalizeVisiblePartitionServices(options?.services);
  const hintedLeaderNodeId = String(
    options?.hintedLeaderNodeId ||
    options?.bootstrapLeaderNodeId ||
    '',
  );
  const leaderServices = visibleServices.filter((service) => {
    return String(service?.raft_role || '')
      .toLowerCase() === String(RAFT_ROLE.LEADER).toLowerCase();
  });

  if (leaderServices.length === 1) {
    const leaderServiceNodeId =
      leaderServices[0]?.node_id ||
      leaderServices[0]?.nodeId;
    return {
      selectedService: leaderServices[0],
      ...(typeof leaderServiceNodeId === 'string' &&
        leaderServiceNodeId.length > 0 ? {
          leaderNodeId: leaderServiceNodeId,
        } : {}),
      selectionSource: LOCAL_STR_LEADER_ROLE,
    };
  }

  if (hintedLeaderNodeId.length > 0) {
    const hintedServices = visibleServices.filter((service) => {
      const nodeId = service?.node_id || service?.nodeId || null;
      return nodeId === hintedLeaderNodeId;
    });
    if (hintedServices.length === 1) {
      return {
        selectedService: hintedServices[0],
        leaderNodeId: hintedLeaderNodeId,
        selectionSource: LOCAL_STR_LEADER_HINT,
      };
    }
  }

  if (options?.allowSingleReplicaFallback !== false &&
      visibleServices.length === 1) {
    const singleReplicaNodeId =
      visibleServices[0]?.node_id ||
      visibleServices[0]?.nodeId;
    return {
      selectedService: visibleServices[0],
      ...(typeof singleReplicaNodeId === 'string' &&
        singleReplicaNodeId.length > 0 ? {
          leaderNodeId: singleReplicaNodeId,
        } : {}),
      selectionSource: LOCAL_STR_SINGLE_SERVICE,
    };
  }

  return {
    selectedService: null,
    selectionSource: null,
  };
}

export {resolveBootstrapLeaderSelection};
