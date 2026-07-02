import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {STRING, TABLES} from '../constants/index.js';
import {ensureLiferaftProviderForRuntime} from './raft-provider-control.js';
import {
  deliverRaftPacketWithBackpressureMute,
} from './raft-peer-backpressure-mute.js';
import {
  RAFT_REPLICA_BASE_ADDRESS,
  RAFT_REPLICA_BASE_DEFAULT,
  RAFT_REPLICA_BASE_ERROR_MSG,
  RAFT_REPLICA_BASE_LIFERAFT_TIMER,
  RAFT_REPLICA_BASE_LOG_MSG,
  RAFT_REPLICA_BASE_VALUE,
} from './raft-replica-base-constants.js';

function buildPeerAddressForReplica(replica, peerId) {
  if (peerId.includes(RAFT_REPLICA_BASE_ADDRESS.SEPARATOR)) {
    const validation = replica.addressManager.validate(peerId);
    if (validation.valid) {
      return peerId;
    }
    replica.logger.error(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
      peerId,
      replicaId: replica.replicaId,
      error: validation.error,
    });
    throw new Error(RAFT_REPLICA_BASE_ERROR_MSG.peerAddressNotUnified(peerId));
  }

  if (replica.peerAddresses && replica.peerAddresses.length > 0) {
    for (const addr of replica.peerAddresses) {
      const validation = replica.addressManager.validate(addr);
      if (!validation.valid) {
        replica.logger.error(
          RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED,
          {
            peerId: addr,
            replicaId: replica.replicaId,
            error: validation.error,
          },
        );
        throw new Error(
          RAFT_REPLICA_BASE_ERROR_MSG.peerAddressNotUnified(addr),
        );
      }
      const parsed = replica.addressManager.parse(addr);
      if (parsed.serviceId === peerId) {
        replica.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_FROM_LIST, {
          peerId,
          address: addr,
          replicaId: replica.replicaId,
        });
        return addr;
      }
    }
  }

  if (replica.systemTableCache) {
    const service = replica.systemTableCache.get(TABLES.SERVICES, peerId);
    if (service && service.node_id) {
      const address = replica.addressManager.format(
        service.node_id,
        replica.entityType,
        peerId,
      );
      replica.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.PEER_ADDRESS_FROM_CACHE, {
        peerId,
        nodeId: service.node_id,
        address,
        replicaId: replica.replicaId,
      });
      return address;
    }
  }

  throw new Error(RAFT_REPLICA_BASE_ERROR_MSG.peerAddressUnresolved(peerId));
}

function createRaftInstanceForReplica(replica, logAdapter) {
  ensureLiferaftProviderForRuntime();

  const config = ConfigurationManager.getInstance();
  const heartbeatMs = config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
    RAFT_REPLICA_BASE_DEFAULT.HEARTBEAT_DEFAULT_MS;
  const baseElectionMinMs = config.get(
    CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
  ) || RAFT_REPLICA_BASE_DEFAULT.ELECTION_MIN_DEFAULT_MS;
  const baseElectionMaxMs = config.get(
    CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
  ) || RAFT_REPLICA_BASE_DEFAULT.ELECTION_MAX_DEFAULT_MS;

  let replicaIndex = replica.replicaIds.indexOf(replica.replicaId);
  if (replicaIndex < 0) {
    const hashCode = replica.replicaId.split(STRING.EMPTY).reduce(
      (acc, char) => acc + char.charCodeAt(0), 0,
    );
    replicaIndex = replica.replicaIds.length +
      (hashCode % RAFT_REPLICA_BASE_VALUE.HASH_MODULO);
  }
  const jitterMs = replicaIndex *
    RAFT_REPLICA_BASE_DEFAULT.ELECTION_JITTER_PER_REPLICA_MS;
  const electionMinMs = baseElectionMinMs + jitterMs;
  const electionMaxMs = baseElectionMaxMs + jitterMs;

  const RaftNode = replica.raftProvider.createNodeClass({
    deferElection: replica.deferElection,
    logger: replica.logger,
    replicaId: replica.replicaId,
    resolvePeerAddress: (peerId) => replica.buildPeerAddress(peerId),
    deliverPacket: (peerAddress, packet) =>
      deliverRaftPacketWithBackpressureMute(
        replica.transport,
        peerAddress,
        packet,
      ),
  });

  const raftOptions = {
    [RAFT_REPLICA_BASE_LIFERAFT_TIMER.HEARTBEAT]: heartbeatMs,
    [RAFT_REPLICA_BASE_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
    [RAFT_REPLICA_BASE_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs,
  };

  if (logAdapter) {
    raftOptions[RAFT_REPLICA_BASE_LIFERAFT_TIMER.LOG] = function() {
      return logAdapter;
    };
  }

  replica.raft = new RaftNode(replica.unifiedAddress, raftOptions);

  if (replica.deferElection && replica.raft) {
    replica.raftProvider.clearTimers(
      replica.raft,
      RAFT_REPLICA_BASE_LIFERAFT_TIMER.HEARTBEAT_ELECTION,
    );
    replica.logger.debug(RAFT_REPLICA_BASE_LOG_MSG.CLEARED_LIFERAFT_TIMERS, {
      replicaId: replica.replicaId,
    });
  }

  return replica.raft;
}

export {
  buildPeerAddressForReplica,
  createRaftInstanceForReplica,
};
