// Production wiring for the S1-S5 snapshot catch-up chain (quest
// raft-snapshot-live-rebuild, spec solve/specs/raft-snapshot-transfer-
// install/live-rebuild-design.md, S6 Phase A links 2/4/6). This module owns
// the three previously-dead seams:
//   - the LEADER dispatcher: service.onSnapshotCatchupNeeded -> one typed
//     dispatchSnapshotCatchup call with the replica's checkpoints root, the
//     cache-derived identity, the partition's generation sealer, the
//     caller's abort signal and the bulk-channel socketProvider. NO
//     driver-level tokenBucket travels here (verifier MUST-CHANGE: chunks
//     are already paced by sendChunkFrame — a second bucket double-charges
//     every byte).
//   - the PEER DIAL socketProvider: resolveNodeWebSocketAddress over the
//     cached node_endpoints rows (the CDC node-join dial precedent), then
//     one registry.dial per dispatch (never a reused connection), wrapped
//     by the transfer socket adapter. Every unresolved leg, a busy lane
//     included, returns null so the dispatcher types SOCKET_UNAVAILABLE.
//   - the FOLLOWER offer routing: every adopted inbound bulk connection is
//     armed with the peek-then-replay offer router. The node's replica of the
//     offered group, the admission of the offer (before anything is
//     received) and the return of the replica the orchestration stops are
//     all the replica handler's install owner's
//     (node/replica-snapshot-install-owner.js); this module only hands
//     orchestrateSnapshotCatchupInstall the receive options and that owner's
//     episode seam, and records every result that is not installed and
//     recreated on the replica that runs.
// Both production factories (bootstrap and join/durable-rejoin) flow
// through wrapPartitionServiceFactoryWithSnapshotCatchup at the shared
// ReplicaHandlerSetup; the join durable-rejoin restore path additionally
// attaches per-service (it constructs services without the handler factory).

import {
  buildSnapshotCatchupIdentityFromCache,
  dispatchSnapshotCatchup,
} from '../../raft/snapshot-catchup.js';
import {
  orchestrateSnapshotCatchupInstall,
} from '../../raft/snapshot-catchup-install.js';
import {
  bulkConnectionTransferSocket,
} from '../../raft/bulk-connection-transfer-socket.js';
import {
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_RECREATION_STATE,
} from '../../raft/snapshot-catchup-constants.js';
import {
  RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME,
  armSnapshotOfferRouter,
} from '../../raft/snapshot-offer-router.js';
import {
  resolveReplicaCheckpointsRoot,
} from '../../raft/snapshot-install.js';
import {
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  resolveNodeWebSocketAddress,
} from '../../transport/node-address-resolution.js';
import {LoggingService} from '../../logging/logging-service.js';
import {SUBSYSTEM} from '../../constants/index.js';

// A notification that carries no abort signal and no progress observer.
const NO_DISPATCH_OPTIONS = Object.freeze({});
const SNAPSHOT_WIRING_LOG_MSG = Object.freeze({
  DISPATCH_FAILED: 'Snapshot catch-up dispatch failed',
  OFFER_ORCHESTRATION_FAILED: 'Snapshot offer orchestration failed',
  LANE_IDLE_CLOSED: 'Snapshot lane closed: adopted connection silent for the idle bound',
});
// The reason of an install result that names none of its own.
const NO_INSTALL_REASON = 'none';
const INSTALL_DETAIL_FIELD = 'detail';

// The install owner's own answer of an install it did not complete, in its
// own fields: its rejection reason, its conflict detail and the receiver
// lifecycle owner's refusal, each only when the answer carries it.
const INSTALL_ANSWER_FIELDS = Object.freeze([
  ['reason', 'installReason'],
  ['detail', 'installDetail'],
  ['validationOutcome', 'validationOutcome'],
]);

// The field of an install answer that carries the receiver lifecycle owner's
// refusal.
const INSTALL_RECEIVER_REFUSAL_FIELD = 'consensus';

function installAnswerOf(install) {
  const answer = {};
  for (const [field, summaryField] of INSTALL_ANSWER_FIELDS) {
    if (Object.hasOwn(install, field)) answer[summaryField] = install[field];
  }
  if (Object.hasOwn(install, INSTALL_RECEIVER_REFUSAL_FIELD)) {
    answer.receiverReason = install.consensus.reason;
  }
  return answer;
}

// What the recreation owner answered for a replica the orchestration
// stopped: its state and, while the replica is not running, the attempt that
// left it so.
const RECREATION_FIELD = 'recreation';

function recreationSummaryOf(recreation) {
  return Object.freeze(
    recreation.state === RAFT_SNAPSHOT_RECREATION_STATE.RUNNING ?
      {state: recreation.state} :
      {state: recreation.state, attempt: recreation.attempt,
        reason: recreation.reason});
}

// The reason of each orchestration outcome that names one of its own.
const INSTALL_OUTCOME_REASONS = Object.freeze({
  [RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.RECEIVE_FAILED]:
    (result) => result.transfer.reason,
  [RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.RECREATE_NOT_ADMITTED]:
    (result) => result.admission.reason,
  [RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.INSTALL_REJECTED]:
    (result) => result.install.outcome,
});

// The typed summary of an install orchestration that did not complete: its
// outcome; the receive's, the admission's or the install owner's own reason;
// the install owner's answer of a rejected install; for a step that threw,
// the detail the orchestration recorded; and, for a replica the
// orchestration stopped, what its recreation owner answered.
function installOutcomeOf(result) {
  const reasonOf = INSTALL_OUTCOME_REASONS[result.outcome];
  const {recreation} = result;
  return Object.freeze({outcome: result.outcome,
    reason: reasonOf === undefined ? NO_INSTALL_REASON : reasonOf(result),
    ...(result.outcome === RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.INSTALL_REJECTED ?
      installAnswerOf(result.install) : {}),
    ...(Object.hasOwn(result, INSTALL_DETAIL_FIELD) ?
      {detail: result.detail} : {}),
    ...(Object.hasOwn(result, RECREATION_FIELD) ?
      {recreation: recreationSummaryOf(recreation)} : {})});
}

function resolveWiringLogger() {
  const loggingService = LoggingService.getInstance();
  return loggingService.isInitialized() ?
    loggingService.forSubsystem(SUBSYSTEM.REPLICA_HANDLER_SETUP) :
    console;
}

// Peer bulk dial (Phase A link 4). One bulk connection carries one
// transfer: every dispatch dials its own, and the dispatch owner closes it
// when the dispatch ends, so the follower's one-shot offer router is fresh
// for every offer. An OPEN connection to the follower's node is therefore
// never this node's to reuse: it is that node's own transfer towards this
// one (its dial, adopted here), and an offer sent into it would land in a
// lane with no router and beside another transfer's frames. That lane is
// busy: null, like every other unresolved leg, and the dispatcher owns the
// typed SOCKET_UNAVAILABLE refusal. The dial is cancelled by the dispatch's
// signal.
function createBulkSocketProvider(context) {
  const {messageRouter, systemTableCache} = context;
  return async ({followerNodeId, signal}) => {
    const registry = messageRouter?.bulkChannelRegistry;
    if (!registry) {
      return null;
    }
    if (registry.getConnection(followerNodeId)?.isOpen()) {
      return null;
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
      signal,
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
  service.onSnapshotCatchupNeeded = (decision, dispatch = NO_DISPATCH_OPTIONS) =>
    dispatchSnapshotCatchup({
      decision,
      checkpointsRoot: resolveReplicaCheckpointsRoot(service.dbPath),
      identity: buildSnapshotCatchupIdentityFromCache({
        partitionId: service.partitionId,
        tableName: service.tableName,
        systemTableCache,
      }),
      // The partition's ONE image creation owner (its checkpoint cadence):
      // a generation sealed for a follower respects and shares the
      // cadence's standing refusal and its in-flight exclusion.
      sealGeneration: (request) =>
        service.sealSnapshotGenerationForCatchup(request),
      socketProvider,
      // The catch-up driver's abort signal and progress observer.
      signal: dispatch.signal,
      onProgress: dispatch.onProgress,
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
 * @param {Function} context.createPartitionService inner factory
 * @param {Object} context.systemTableCache cached system tables
 * @param {Object} context.messageRouter node message router
 * @return {Function} wrapped async factory
 */
function wrapPartitionServiceFactoryWithSnapshotCatchup(context) {
  const {createPartitionService, systemTableCache, messageRouter} = context;
  return async (serviceOptions) => {
    const service = await createPartitionService(serviceOptions);
    if (service) {
      attachSnapshotCatchupDispatcher(
        {service, systemTableCache, messageRouter});
    }
    return service;
  };
}

/**
 * Arm the follower-side snapshot offer routing on the node's bulk channel
 * registry (Phase A link 6): every ADOPTED inbound bulk connection gets a
 * peek-then-replay offer router that asks the replica handler's install
 * owner for the node's replica and the offer's admission, and drives the
 * orchestrateSnapshotCatchupInstall loop — receive, admission, closed-handle
 * shutdown, atomic install — with that owner's episode seam.
 * @param {Object} context wiring context
 * @param {Object} context.registry bulk transfer channel registry
 * @param {Object} context.replicaHandler node replica handler (its
 *   snapshotInstallOwner)
 * @param {Object} context.systemTableCache cached system tables
 * @param {Function} [context.onRouteOutcome] guard observer for typed route
 *   outcomes
 * @param {Object} [context.timeSource] the node's clock for the adopted
 *   lane idle bound
 * @return {void}
 */
function armSnapshotOfferRouting(context) {
  const {registry, replicaHandler, systemTableCache} = context;
  registry.onAdopt((connection) => {
    armSnapshotOfferRouter({
      connection,
      timeSource: context.timeSource,
      // The node's replica of the offered group and the admission of the
      // offer are the replica handler's install owner's, like the return of
      // the replica the orchestration stops.
      resolveReceiver: (raftGroupId) =>
        replicaHandler.snapshotInstallOwner.resolveReceiver(raftGroupId),
      admitOffer: async ({service}) => {
        const admission =
          await replicaHandler.snapshotInstallOwner.admitOffer(service);
        if (!admission.admitted) {
          service.recordSnapshotInstallOutcome(Object.freeze({
            outcome: RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.RECREATE_NOT_ADMITTED,
            reason: admission.reason}));
        }
        return admission;
      },
      orchestrate: ({service, socket, onTransferEnded}) =>
        orchestrateSnapshotCatchupInstall({
          service,
          onTransferEnded,
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
          recreation: replicaHandler.snapshotInstallOwner.episodeFor(service),
        }).then((result) => {
          // Every result but installed-and-recreated is the replica's own
          // typed line and its diagnostics (the leader's record says
          // served): on the episode's record, which outlives the stopped
          // service and the install marker, and on the service that runs
          // now (the one the recreation answered, or the untouched one).
          if (result.outcome !==
              RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.INSTALLED_AND_RECREATED) {
            const outcome = installOutcomeOf(result);
            replicaHandler.snapshotInstallOwner.recordInstallOutcome(
              service, outcome);
            replicaHandler.snapshotInstallOwner.continuationOf(service)
              .recordSnapshotInstallOutcome(outcome);
          }
          return result;
        }).catch((error) => {
          resolveWiringLogger().warn(
            SNAPSHOT_WIRING_LOG_MSG.OFFER_ORCHESTRATION_FAILED, {
              partitionId: service.partitionId,
              error: error?.message,
            });
          return null;
        }),
      onOutcome: (route) => {
        if (route.outcome === RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.LANE_IDLE_CLOSED) {
          resolveWiringLogger().warn(SNAPSHOT_WIRING_LOG_MSG.LANE_IDLE_CLOSED, {
            event: route.outcome,
            peerNodeId: connection.nodeId,
            boundMs: route.boundMs,
          });
        }
        context.onRouteOutcome?.(route);
      },
    });
  });
}

export {
  armSnapshotOfferRouting,
  attachSnapshotCatchupDispatcher,
  wrapPartitionServiceFactoryWithSnapshotCatchup,
};
