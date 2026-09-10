import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';

const {
  EntityType,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  normalizeServiceRow,
} = UNIFIED_REBALANCER_SHARED;

const UNIFIED_REBALANCER_LEDGER_SURPLUS_DRAIN_REPLICA_STATE_METHODS = {
  /**
   * A ledger-surplus capability is minted from current ACTIVE voter actuals.
   * If terminal operation history contradicts those actuals, preserve the
   * generic retirement projection but restore the contradictory voters for
   * this authorized count-decreasing plan. The coordinator's authoritative
   * placement fence still decides whether the resulting REMOVE may execute.
   *
   * @param {Array<Object>} replicas
   * @param {Object|null} capability
   * @return {Array<Object>}
   */
  restoreLedgerSurplusDrainActiveVoters(replicas, capability) {
    const normalizedReplicas = Array.isArray(replicas) ? replicas : [];
    if (
      !capability ||
      this.entityType !== EntityType.PARTITION ||
      !Array.isArray(capability.targetNodeIds)
    ) {
      return normalizedReplicas;
    }
    const retiredReplicaIds = this.getTerminalRetiredReplicaIds();
    if (retiredReplicaIds.size === 0) {
      return normalizedReplicas;
    }
    const visibleReplicaIds = new Set(
      normalizedReplicas.map((replica) =>
        this.getReplicaIdFromServiceRow(replica),
      ),
    );
    const capabilityNodeIds = new Set(capability.targetNodeIds);
    const contradictoryActiveVoters = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICES,
      (service) => {
        const normalizedService = normalizeServiceRow(service);
        return (
          normalizedService.partitionId === this.entityId &&
          normalizedService.serviceType === EntityType.PARTITION &&
          normalizedService.status === ReplicaStatus.ACTIVE &&
          isVoterRaftRole(normalizedService.raftRole) &&
          capabilityNodeIds.has(normalizedService.nodeId) &&
          retiredReplicaIds.has(normalizedService.replicaId) &&
          !visibleReplicaIds.has(normalizedService.replicaId)
        );
      },
    );
    return contradictoryActiveVoters.length === 0 ?
      normalizedReplicas :
      [...normalizedReplicas, ...contradictoryActiveVoters];
  },
};

export {UNIFIED_REBALANCER_LEDGER_SURPLUS_DRAIN_REPLICA_STATE_METHODS};
