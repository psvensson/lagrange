import {NUM, TYPEOF} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

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
    return {
      selectedService: leaderServices[NUM.ZERO],
      leaderNodeId:
        leaderServices[NUM.ZERO]?.node_id ||
        leaderServices[NUM.ZERO]?.nodeId ||
        null,
      selectionSource: 'leader_role',
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
        selectionSource: 'leader_hint',
      };
    }
  }

  if (options?.allowSingleReplicaFallback !== false &&
      visibleServices.length === NUM.ONE) {
    return {
      selectedService: visibleServices[NUM.ZERO],
      leaderNodeId:
        visibleServices[NUM.ZERO]?.node_id ||
        visibleServices[NUM.ZERO]?.nodeId ||
        null,
      selectionSource: 'single_service',
    };
  }

  return {
    selectedService: null,
    leaderNodeId: null,
    selectionSource: null,
  };
}

export {resolveBootstrapLeaderSelection};
