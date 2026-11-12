import {captureReplicaRuntimeObservation, isReplicaRuntimeObservationCurrent,
  runtimeObservationChangedError} from '../../node/replica-runtime-observation.js';
import {createReplicaRuntimePublication} from '../../node/replica-runtime-publication.js';
import {requireReplicaRuntimeFactory, requireReplicaRuntimeProducer} from
  '../../node/replica-runtime-producer.js';
import {releaseFailedReplicaRuntimeHost} from '../../node/replica-runtime-cleanup-custody.js';
// Production wiring for the S1-S5 snapshot catch-up chain (quest
// raft-snapshot-live-rebuild, spec solve/specs/raft-snapshot-transfer-
// install/live-rebuild-design.md, S6 Phase A links 2/4/6). This module owns
// the three previously-dead seams:
//   - the LEADER dispatcher: service.onSnapshotCatchupNeeded -> one typed
//     dispatchSnapshotCatchup call with the replica's checkpoints root, the
//     cache-derived identity, and the bulk-channel socketProvider. NO
//     driver-level tokenBucket travels here (verifier MUST-CHANGE: chunks
//     are already paced by sendChunkFrame — a second bucket double-charges
//     every byte).
//   - the PEER DIAL socketProvider: resolveNodeWebSocketAddress over the
//     cached node_endpoints rows (the CDC node-join dial precedent), then
//     registry.getConnection || registry.dial, wrapped by the transfer
//     socket adapter. Every unresolved leg returns null so the dispatcher
//     types SOCKET_UNAVAILABLE.
//   - the FOLLOWER offer routing: every adopted inbound bulk connection is
//     armed with the peek-then-replay offer router, mapping the OFFER's
//     raftGroupId to the local replica and driving
//     orchestrateSnapshotCatchupInstall with the production partition
//     factory and ReplicaHandler.replaceLocalReplicaService.
// Both production factories (bootstrap and join/durable-rejoin) flow
// through wrapPartitionServiceFactoryWithSnapshotCatchup at the shared
// ReplicaHandlerSetup; the join durable-rejoin restore path additionally
// attaches per-service (it constructs services without the handler factory).

import {
  buildSnapshotCatchupIdentityFromCache,
  dispatchSnapshotCatchup,
  orchestrateSnapshotCatchupInstall,
} from '../../raft/snapshot-catchup.js';
import {
  bulkConnectionTransferSocket,
} from '../../raft/bulk-connection-transfer-socket.js';
import {armSnapshotOfferRouter} from '../../raft/snapshot-offer-router.js';
import {
  resolveReplicaCheckpointsRoot,
} from '../../raft/snapshot-install.js';
import {
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  resolveNodeWebSocketAddress,
} from '../../transport/node-address-resolution.js';
import {LoggingService} from '../../logging/logging-service.js';
import {SUBSYSTEM} from '../../constants/index.js';

const SNAPSHOT_WIRING_LOG_MSG = Object.freeze({
  DISPATCH_FAILED: 'Snapshot catch-up dispatch failed',
  OFFER_ORCHESTRATION_FAILED: 'Snapshot offer orchestration failed',
});

function resolveWiringLogger() {
  const loggingService = LoggingService.getInstance();
  return loggingService.isInitialized() ?
    loggingService.forSubsystem(SUBSYSTEM.REPLICA_HANDLER_SETUP) :
    console;
}

// Peer bulk dial (Phase A link 4): existing open channel first, else resolve
// the follower's ws address from the cached node_endpoints rows and dial a
// fresh bulk channel under this node's identity. Null at every unresolved
// leg — the dispatcher owns the typed SOCKET_UNAVAILABLE refusal.
function createBulkSocketProvider(context) {
  const {messageRouter, systemTableCache} = context;
  return async ({followerNodeId}) => {
    const registry = messageRouter?.bulkChannelRegistry;
    if (!registry) {
      return null;
    }
    const existing = registry.getConnection(followerNodeId);
    if (existing?.isOpen()) {
      return bulkConnectionTransferSocket(existing);
    }
    const resolution = resolveNodeWebSocketAddress({
      targetNodeId: followerNodeId,
      systemTableCache,
    });
    if (resolution.state !==
        NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED) {
      return null;
    }
    const connection = await registry.dial({
      nodeId: followerNodeId,
      address: resolution.address,
      identify: {
        nodeId: messageRouter.nodeId,
        nodeAddress: messageRouter.advertisedAddress ||
          messageRouter.nodeAddress,
        // This node's issued boot incarnation (MessageRouter requires it at
        // construction): the snapshot channel identifies the exact generation
        // that dialled it, like the primary channel (D5).
        bootIncarnation: messageRouter.bootIncarnation,
      },
    });
    return bulkConnectionTransferSocket(connection);
  };
}

/**
 * Set the leader-side dispatcher seam on one partition service (Phase A
 * link 2): every typed install_snapshot decision from the snapshot owner becomes one
 * dispatchSnapshotCatchup call. The seam returns the dispatch promise
 * (always resolving to a typed result — dial faults are caught and logged)
 * so guards can await the outcome; the consensus runtime does not consume the callback return value.
 * @param {Object} context wiring context
 * @param {Object} context.service the partition service to wire
 * @param {Object} context.systemTableCache cached system tables
 * @param {Object} context.messageRouter node message router (bulk registry
 *   + local identify facts)
 * @return {Object} the wired service
 */
function attachSnapshotCatchupDispatcher(context) {
  const {service, systemTableCache, messageRouter} = context;
  const socketProvider = createBulkSocketProvider(
    {messageRouter, systemTableCache});
  service.onSnapshotCatchupNeeded = (decision) =>
    dispatchSnapshotCatchup({
      decision,
      checkpointsRoot: resolveReplicaCheckpointsRoot(service.dbPath),
      identity: buildSnapshotCatchupIdentityFromCache({
        partitionId: service.partitionId,
        tableName: service.tableName,
        systemTableCache,
      }),
      db: service.db,
      socketProvider,
      // Deliberately NO tokenBucket: sendChunkFrame already paces every
      // chunk byte (S3); a driver bucket would double-charge (verifier
      // MUST-CHANGE).
    }).catch((error) => {
      resolveWiringLogger().warn(SNAPSHOT_WIRING_LOG_MSG.DISPATCH_FAILED, {
        partitionId: service.partitionId,
        error: error?.message,
      });
      return null;
    });
  return service;
}

/**
 * Wrap a production partition-service factory so every service it creates
 * carries the snapshot catch-up dispatcher seam (Phase A link 2 — the
 * shared point BOTH the bootstrap and the join factories flow through via
 * ReplicaHandlerSetup). Replacement services recreated after an install
 * flow through the same wrapped factory, so the seam re-attaches itself.
 * @param {Object} context wiring context
 * @param {Object} context.partitionServiceFactory frozen inner factory
 * @param {Object} context.systemTableCache cached system tables
 * @param {Object} context.messageRouter node message router
 * @return {Object} Frozen wrapped producer/construction pair.
 */
function wrapPartitionServiceFactoryWithSnapshotCatchup(context) {
  const {systemTableCache, messageRouter} = context;
  const factory = requireReplicaRuntimeFactory(context.partitionServiceFactory);
  return Object.freeze({captureProducer: factory.captureProducer,
    async create(serviceOptions) {
      const request = Object.freeze({...serviceOptions});
      const producer = requireReplicaRuntimeProducer(request.runtimeProducer, request.replicaId);
      const service = await factory.create(request);
      try {
        producer.assertCurrent();
        attachSnapshotCatchupDispatcher({service, systemTableCache, messageRouter});
        producer.assertCurrent();
        return service;
      } catch (error) {
        await releaseFailedReplicaRuntimeHost(producer,
          request.replicaId, request.partitionId, service, error);
        throw error;
      }
    }});
}

// raftGroupId === partitionId: the live (non-shutdown) local service for
// that partition, resolved late so replicas registered after arming still
// route.
function resolveLocalReplicaService(replicaHandler, raftGroupId) {
  for (const service of replicaHandler.localServices.values()) {
    if (service && service.partitionId === raftGroupId &&
        service.isShutdown !== true) {
      return service;
    }
  }
  return null;
}

/**
 * Arm the follower-side snapshot offer routing on the node's bulk channel
 * registry (Phase A link 6): every ADOPTED inbound bulk connection gets a
 * peek-then-replay offer router that drives the full
 * orchestrateSnapshotCatchupInstall loop — receive, closed-handle shutdown,
 * atomic install, recreate via the production factory, and
 * replaceLocalReplicaService registry swap.
 * @param {Object} context wiring context
 * @param {Object} context.registry bulk transfer channel registry
 * @param {Object} context.replicaHandler node replica handler (wrapped
 *   factory + localServices registry)
 * @param {Object} context.systemTableCache cached system tables
 * @param {Function} [context.onRouteOutcome] guard observer for typed route
 *   outcomes
 * @return {void}
 */
function armSnapshotOfferRouting(context) {
  const {registry, replicaHandler, systemTableCache} = context;
  registry.onAdopt((connection) => {
    armSnapshotOfferRouter({
      connection,
      resolveLocalReplica: (raftGroupId) =>
        resolveLocalReplicaService(replicaHandler, raftGroupId),
      orchestrate: ({service, socket}) => {
        const factory = replicaHandler.partitionServiceFactory;
        const producer = factory.captureProducer(replicaHandler, service.replicaId);
        const observed = captureReplicaRuntimeObservation(replicaHandler, service.replicaId);
        if (observed?.service !== service || !observed.sourceEvidence ||
            !isReplicaRuntimeObservationCurrent(observed)) {
          throw runtimeObservationChangedError(service.replicaId);
        }
        const runtimePublication = createReplicaRuntimePublication(producer,
          observed.sourceEvidence, observed.admission, service);
        return orchestrateSnapshotCatchupInstall({
          service,
          receiveOptions: {
            socket,
            checkpointsRoot: resolveReplicaCheckpointsRoot(service.dbPath),
            // Function form: the membership epoch is re-read at accept AND
            // completion, so an epoch advance mid-transfer aborts typed.
            expectedIdentity: () => buildSnapshotCatchupIdentityFromCache({
              partitionId: service.partitionId,
              tableName: service.tableName,
              systemTableCache,
            }),
          },
          createPartitionService: (serviceOptions) =>
            factory.create({...serviceOptions, runtimePublication, runtimeProducer: producer,
              publishRuntime: (replacement, hostServices) =>
                replicaHandler.replaceLocalReplicaService(
                  service.replicaId, replacement, observed, hostServices),
              resolveHandlerRetirementLane: () => observed.owner}),
          registerReplacementService: async (replacement) => {
            try {
              producer.assertCurrent();
              return replicaHandler.replaceLocalReplicaService(
                service.replicaId, replacement, observed);
            } catch (error) {
              await replicaHandler.fenceFailedReplicaCreateRuntime(
                service.replicaId, service.partitionId, replacement, error,
              );
              throw error;
            }
          },
        }).catch((error) => {
          resolveWiringLogger().warn(
            SNAPSHOT_WIRING_LOG_MSG.OFFER_ORCHESTRATION_FAILED, {
              partitionId: service.partitionId,
              error: error?.message,
            });
          return null;
        });
      },
      onOutcome: context.onRouteOutcome,
    });
  });
}

export {
  armSnapshotOfferRouting,
  attachSnapshotCatchupDispatcher,
  wrapPartitionServiceFactoryWithSnapshotCatchup,
};
