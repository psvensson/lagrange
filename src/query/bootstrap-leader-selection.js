import {NUM, TYPEOF} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

const LOCAL_STR_LEADER_ROLE = 'leader_role';
const LOCAL_STR_LEADER_HINT = 'leader_hint';
const LOCAL_STR_SINGLE_SERVICE = 'single_service';

function normalizeVisiblePartitionServices(services) {
  return (Array.isArray(services) ? services : [])
    .filter((service) => service && typeof service === TYPEOF.OBJECT)
    .filter((service) => {
      const nodeId = String(service?.node_id || service?.nodeId || '');
      return nodeId.length > NUM.ZERO;
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

  if (leaderServices.length === NUM.ONE) {
    const leaderServiceNodeId =
      leaderServices[NUM.ZERO]?.node_id ||
      leaderServices[NUM.ZERO]?.nodeId;
    return {
      selectedService: leaderServices[NUM.ZERO],
      ...(typeof leaderServiceNodeId === TYPEOF.STRING &&
        leaderServiceNodeId.length > NUM.ZERO ? {
          leaderNodeId: leaderServiceNodeId,
        } : {}),
      selectionSource: LOCAL_STR_LEADER_ROLE,
    };
  }

  if (hintedLeaderNodeId.length > NUM.ZERO) {
    const hintedServices = visibleServices.filter((service) => {
      const nodeId = service?.node_id || service?.nodeId || null;
      return nodeId === hintedLeaderNodeId;
    });
    if (hintedServices.length === NUM.ONE) {
      return {
        selectedService: hintedServices[NUM.ZERO],
        leaderNodeId: hintedLeaderNodeId,
        selectionSource: LOCAL_STR_LEADER_HINT,
      };
    }
  }

  if (options?.allowSingleReplicaFallback !== false &&
      visibleServices.length === NUM.ONE) {
    const singleReplicaNodeId =
      visibleServices[NUM.ZERO]?.node_id ||
      visibleServices[NUM.ZERO]?.nodeId;
    return {
      selectedService: visibleServices[NUM.ZERO],
      ...(typeof singleReplicaNodeId === TYPEOF.STRING &&
        singleReplicaNodeId.length > NUM.ZERO ? {
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
