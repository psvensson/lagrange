// The formation world of the joint-admission release-liveness reproducer
// (quest formation-ready-lease-independent-of-spread): one seed and its
// joiners, each node the REAL control-plane owners of a production node
// (createSimulatedNodeHosts: readiness service with its formation-release
// closure owner and publication coordinator, membership publication
// coordinator, gateway, CDC owner, heartbeat service, rebalance coordinator)
// over ONE durable row store, on ONE clock that never moves.
//
// What is a double here, and why none can hide the defect under test:
//   - the clock: a VirtualTimeSource that is never advanced past its start.
//     Only work already due at that instant runs; a timer with a positive
//     delay stays armed and is reported, never fired;
//   - the transport: every started node is connected to every other one at
//     boot incarnation 1 (the routers are real but never open a socket), and
//     the durable row store is shared, so replication has zero latency. The
//     measured deadlock had no partition and no replication lag;
//   - consensus: a partition's leader is the node its partition row names and
//     a node holds a replica where a services row says so;
//   - the node-local publication mode (CDC group propagation), which the
//     measured joiners had already passed.
// Every decision the claim is about (barrier, startup authority, handoff
// capture and revoke, membership derivation, planning, admission, remove
// safety) is the production owner's, over the rows below.

import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_SCHEMAS,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  seedMessageGroupRow,
  seedPartitionRow,
  seedTableRow,
} from '../../src/bootstrap/seed-foundation-rows.js';
import {
  buildClusterIncarnationFence,
} from '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  buildNodeRegistrationRow,
} from '../../src/bootstrap/shared/node-registration-owner-row-builder.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
} from '../../src/bootstrap/system-partition-classification.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION, COLUMN, SERVICE_STATUS, STATE, TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  NodeLifecyclePublication,
} from '../../src/control-plane/node-lifecycle-publication.js';
import {
  createSystemMetadataOwners,
} from '../../src/control-plane/owners/index.js';
import {
  ReplicaDispatchService,
} from '../../src/control-plane/replica-dispatch-service.js';
import {
  MessageGroupServiceRowOwner,
} from '../../src/message-group/message-group-service-row-owner.js';
import {
  NodeReadyLeaseAuthority,
} from '../../src/control-plane/node-ready-lease-authority.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  createNodeEntry,
  initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';
import {
  withFixtureCommittedMembership,
} from '../rebalancer/committed-membership-fixture.js';
import {withFixtureReplaceWitness} from '../rebalancer/test-helpers.js';
import {
  createPriorityPartitionRebalancer,
  createSimulatedNodeHosts,
} from '../simulation/formation-sim-node-hosts.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const SEED_NODE_ID = 'seed';
const WORLD_START_MS = Date.UTC(2026, 10, 14, 12, 31, 2);
const WORLD_CACHE_ID = 'formation-world/cache';
const NODE_ADDRESS_PREFIX = 'ws://';
const NODE_ADDRESS_SUFFIX = ':9000';
const READY_LEASE_MS = 30000;
const STORAGE_BUDGET_BYTES = 64 * 1024 * 1024 * 1024;
const STORAGE_BUDGET_SOURCE = 'configured';
const DUE_NOW_DELAY_MS = 0;
const SETTLE_TURNS = 12;
const SETTLE_ROUND_LIMIT = 400;
const QUIET_ROUNDS_TO_SETTLE = 2;
const STACK_LINE_SEPARATOR = '\n';
const SOURCE_FRAME_MARKER = '/src/';
const UNKNOWN_ARMING_SOURCE = 'unknown';
const RANDOM_SEED = 20261114;
const LEADER_TERM = 1;
const LEADER_COMMIT_INDEX = 1;
const SCHEMA_BY_TABLE_ID = Object.freeze(Object.fromEntries(
  SYSTEM_TABLE_SCHEMAS.map((schema) => [schema.tableName, schema])));
const PRIORITY_TABLE_IDS = Object.freeze(
  [...PRIORITY_CONTROL_PLANE_TABLE_IDS].sort());
const PRIORITY_PARTITION_IDS = Object.freeze(
  PRIORITY_TABLE_IDS.map((tableId) => INITIAL_PARTITION_IDS[tableId]));
const FOLLOWER_SERVICE = Object.freeze({getRole: () => RAFT_ROLE.FOLLOWER});
// The two startup-branch fences the entrypoint resolves: the seed boots over
// a fresh data directory; a joiner persists its rejoin hints (identity and
// the seed's address) before it resolves its own.
const SEED_FENCE = buildClusterIncarnationFence({durableStateDetected: false});
const PUBLICATION_MODE_ENTERED_AT = new Date(WORLD_START_MS).toISOString();
const PUBLICATION_MODE_GROUPED = Object.freeze({
  currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
  reasonCode: null,
  enteredAt: PUBLICATION_MODE_ENTERED_AT,
  recentTransitions: Object.freeze([]),
});
// What a node's CDC group propagation reports while a joiner's message group
// is not active yet: the fan-out is conservative until the group is.
const PUBLICATION_MODE_JOINER_GROUP_PENDING = Object.freeze({
  currentMode: CONTROL_PLANE_PUBLICATION_MODE.CONSERVATIVE_FANOUT,
  reasonCode: 'missing_active_groups',
  enteredAt: PUBLICATION_MODE_ENTERED_AT,
  recentTransitions: Object.freeze([]),
});
const LINK_KEY_SEPARATOR = '<->';
const ADDRESS_SEPARATOR = '/';
const REPLICA_HANDLER_SERVICE = 'replica-handler';
const REPLICA_DISPATCH_SERVICE = 'replica-dispatch';
const LEARNER_SERVICE = Object.freeze({getRole: () => RAFT_ROLE.LEARNER});
const HANDOFF_PUBLICATION_KIND = 'formation_release_handoff';
const PUBLICATION_KIND_COLUMN = 'publication_kind';
const PUBLICATION_ID_COLUMN = 'publication_id';

function nodeAddressOf(nodeId) {
  return `${NODE_ADDRESS_PREFIX}${nodeId}${NODE_ADDRESS_SUFFIX}`;
}

// Frozen time: the clock is never advanced. advance(0) runs only what is due
// at the frozen instant (deferred continuations), and a macrotask turn lets
// promise chains reach their next deferral. A timer armed with a positive
// delay can never fire: it is recorded with the source line that armed it,
// so a stuck world can name the timers that would have had to expire.
function armingSourceLine() {
  const frames = String(new Error().stack).split(STACK_LINE_SEPARATOR);
  const frame = frames.find((line) => line.includes(SOURCE_FRAME_MARKER));
  return frame ?
    frame.slice(frame.indexOf(SOURCE_FRAME_MARKER) + 1).replace(/\)$/u, '') :
    UNKNOWN_ARMING_SOURCE;
}

function createFrozenClock() {
  const clock = new VirtualTimeSource({startMs: WORLD_START_MS});
  const armed = new Map();
  const dueNow = new Set();
  const baseSetTimeout = clock.setTimeout.bind(clock);
  const baseSetInterval = clock.setInterval.bind(clock);
  const baseClear = clock.clearTimeout.bind(clock);
  const arm = (schedule, repeating) => (callback, delayMs, ...args) => {
    const delay = Number.isFinite(Number(delayMs)) && Number(delayMs) > 0 ?
      Number(delayMs) : DUE_NOW_DELAY_MS;
    if (delay > DUE_NOW_DELAY_MS) {
      const handle = schedule(callback, delay, ...args);
      armed.set(handle, {delayMs: delay, repeating, armedBy: armingSourceLine()});
      return handle;
    }
    const handle = schedule((...fired) => {
      dueNow.delete(handle);
      return callback(...fired);
    }, DUE_NOW_DELAY_MS, ...args);
    dueNow.add(handle);
    return handle;
  };
  const clear = (handle) => {
    armed.delete(handle);
    dueNow.delete(handle);
    baseClear(handle);
  };
  clock.setTimeout = arm(baseSetTimeout, false);
  clock.setInterval = arm(baseSetInterval, true);
  clock.clearTimeout = clear;
  clock.clearInterval = clear;
  return {
    clock,
    now: () => clock.now(),
    // The timers that would have to EXPIRE for anything more to happen.
    armedTimers: () => [...armed.values()],
    async settle() {
      let quietRounds = 0;
      for (let round = 0; round < SETTLE_ROUND_LIMIT; round += 1) {
        const hadDueWork = dueNow.size > 0;
        clock.advance(DUE_NOW_DELAY_MS);
        for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        quietRounds = hadDueWork || dueNow.size > 0 ? 0 : quietRounds + 1;
        if (quietRounds >= QUIET_ROUNDS_TO_SETTLE) return;
      }
      throw new Error('formation world did not quiesce at the frozen instant');
    },
  };
}

// Consensus as the rows state it: the partition row names the leader, a
// services row is a replica.
function createRowPartitionAuthority(cache, hostsById, now) {
  return Object.freeze({
    resolvePartitionLeader(partitionId) {
      const leaderId =
        cache.get(TABLES.PARTITIONS, partitionId)?.[COLUMN.LEADER_NODE_ID];
      return leaderId ? Object.freeze({
        leaderId,
        term: LEADER_TERM,
        commitIndex: LEADER_COMMIT_INDEX,
        appliedIndex: LEADER_COMMIT_INDEX,
      }) : null;
    },
    // A read is answered by the partition's leader, with the leader's read
    // authority: a node holding only a follower or a joining replica is not
    // a read authority for the partition.
    hasLocalReplica(nodeId, partitionId) {
      return cache.get(TABLES.PARTITIONS, partitionId)
        ?.[COLUMN.LEADER_NODE_ID] === nodeId;
    },
    resolveNodeSqlEngine: (nodeId) =>
      hostsById.get(nodeId)?.sqlQueryEngine || null,
    resolveNodeNow: now,
  });
}

// The transport double: a full mesh among the nodes that are up.
function linkKey(leftNodeId, rightNodeId) {
  return [leftNodeId, rightNodeId].sort().join(LINK_KEY_SEPARATOR);
}

function installMeshTransport(hosts, upNodeIds, downLinks) {
  const router = hosts.messageRouter;
  const localNodeId = hosts.nodeId;
  const isUp = (nodeId) => upNodeIds.has(nodeId) &&
    upNodeIds.has(localNodeId) &&
    !downLinks.has(linkKey(localNodeId, nodeId));
  router.getConnectionState = (nodeId) =>
    (isUp(nodeId) ? STATE.CONNECTED : null);
  router.getConnectedNodes = () =>
    [...upNodeIds].filter((nodeId) => nodeId !== localNodeId && isUp(nodeId));
  router.hasScheduledReconnect = () => false;
  router.pingNode = async (nodeId) => isUp(nodeId);
  router.isOutboundQueueAvailable = () => true;
  router.getQueryDataPlaneTransportReadiness = () =>
    ({ready: true, state: STATE.READY});
  router.getLocalBootIncarnationIdentity = () => Object.freeze({
    nodeId: localNodeId,
    bootIncarnation: TEST_BOOT_INCARNATION,
    connectionId: `local:${localNodeId}:${TEST_BOOT_INCARNATION}`,
  });
  router.getCurrentPrimaryConnectionBootIncarnation = (nodeId) =>
    (nodeId !== localNodeId && isUp(nodeId) ? Object.freeze({
      nodeId,
      bootIncarnation: TEST_BOOT_INCARNATION,
      connectionId: `primary:${nodeId}:${TEST_BOOT_INCARNATION}`,
    }) : null);
}

// A durable row carries every column of its table (an unset one is SQL
// NULL): the row a registration producer builds is completed here the way
// the SQL store returns it.
function asStoredRow(tableName, row) {
  const stored = {};
  for (const column of SCHEMA_BY_TABLE_ID[tableName].columns) {
    stored[column.name] = row[column.name] ?? null;
  }
  return stored;
}

function insertStoredRow(cache, tableName, row) {
  cache.applySystemTableChange(
    tableName, CDC_OPERATION.INSERT, asStoredRow(tableName, row));
}

// The replica runtime of every node, at its message boundary: the handler a
// node's `<node>/service/replica-handler` address reaches. It does to the
// durable replica rows what an admitted operation's handler does, and
// nothing else: a CREATE registers the replica as a SYNCING learner on the
// addressed node, a REMOVE marks its row REMOVING. One step of the runtime
// lets every learner catch up (its row turns ACTIVE voter, as the promoted
// replica's own lifecycle publishes it) and retires every REMOVING row.
// The runtime never reads an operation row, a node row or a lease, and never
// completes, refuses, orders or retries anything: whether an operation is
// admitted, dispatched, complete, or safe to remove is decided by the
// coordinators and planners from the rows it leaves behind.
function createReplicaRuntime(cache, now) {
  const learnerReplicaIds = new Set();
  const removingReplicaIds = new Set();
  const handled = [];
  const answerCreate = (nodeId, payload) => {
    const replicaId = payload[ReplicaOperationField.REPLICA_ID];
    if (cache.get(TABLES.SERVICES, replicaId)) {
      return {status: learnerReplicaIds.has(replicaId) ?
        ReplicaOperationResponseStatus.IN_PROGRESS :
        ReplicaOperationResponseStatus.ALREADY_EXISTS};
    }
    insertStoredRow(cache, TABLES.SERVICES, {
      ...PartitionServiceRowOwner.buildServiceRow({
        partitionId: payload[ReplicaOperationField.PARTITION_ID],
        replicaId,
        nodeId,
        service: LEARNER_SERVICE,
        timestamp: now(),
        status: ReplicaStatus.SYNCING,
      }),
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
    });
    learnerReplicaIds.add(replicaId);
    return {status: ReplicaOperationResponseStatus.INITIATED};
  };
  const answerRemove = (payload) => {
    const replicaId = payload[ReplicaOperationField.REPLICA_ID];
    const row = cache.get(TABLES.SERVICES, replicaId);
    if (!row) {
      return {status: ReplicaOperationResponseStatus.NOT_FOUND};
    }
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      ...row,
      [COLUMN.STATUS]: ReplicaStatus.REMOVING,
    });
    removingReplicaIds.add(replicaId);
    return {status: ReplicaOperationResponseStatus.INITIATED};
  };
  return {
    handled,
    answer(nodeId, payload) {
      const type = payload?.[ReplicaOperationField.TYPE];
      if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
        handled.push({nodeId, type,
          replicaId: payload[ReplicaOperationField.REPLICA_ID]});
        return answerCreate(nodeId, payload);
      }
      if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        handled.push({nodeId, type,
          replicaId: payload[ReplicaOperationField.REPLICA_ID]});
        return answerRemove(payload);
      }
      return undefined;
    },
    step() {
      for (const replicaId of [...learnerReplicaIds]) {
        learnerReplicaIds.delete(replicaId);
        const row = cache.get(TABLES.SERVICES, replicaId);
        if (row && row[COLUMN.STATUS] === ReplicaStatus.SYNCING) {
          cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
            ...row,
            [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
            [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
          });
        }
      }
      for (const replicaId of [...removingReplicaIds]) {
        removingReplicaIds.delete(replicaId);
        const row = cache.get(TABLES.SERVICES, replicaId);
        if (row) {
          cache.applySystemTableChange(
            TABLES.SERVICES, CDC_OPERATION.DELETE, row);
        }
      }
    },
  };
}

// Delivery between nodes: a replica-handler message reaches the addressed
// node's replica runtime; the REPLACE witness reads and the committed-
// membership read are answered from the replica rows by the repository's
// fixture world; a replica-dispatch message (a coordinator-to-coordinator
// wake) reaches the handler the addressed node's real ReplicaDispatchService
// registered for that address.
function installDelivery(hosts, cache, replicaRuntime, deliveries,
  dispatchServiceByNodeId) {
  const router = hosts.messageRouter;
  router.deliver = async (target, payload) => {
    const [targetNodeId, , service] = String(target).split(ADDRESS_SEPARATOR);
    deliveries.push({
      from: hosts.nodeId,
      target,
      type: payload?.[ReplicaOperationField.TYPE] || null,
      operationId: payload?.[ReplicaOperationField.OPERATION_ID] || null,
    });
    if (service === REPLICA_DISPATCH_SERVICE) {
      await dispatchServiceByNodeId.get(targetNodeId)
        .directDispatchServiceHandler({payload});
      return buildDeliveryEnvelope({acknowledged: true},
        {status: ReplicaOperationResponseStatus.COMPLETED});
    }
    const answered = service === REPLICA_HANDLER_SERVICE ?
      replicaRuntime.answer(targetNodeId, payload) : undefined;
    return buildDeliveryEnvelope({acknowledged: true}, answered ||
      {status: ReplicaOperationResponseStatus.COMPLETED});
  };
  withFixtureReplaceWitness(router, cache);
  withFixtureCommittedMembership(router, cache);
}

function seedSystemRows(cache, nowMs) {
  const insert = (table, row) => insertStoredRow(cache, table, row);
  insert(TABLES.NODES, createNodeEntry(SEED_NODE_ID, {
    [COLUMN.NODE_ADDRESS]: nodeAddressOf(SEED_NODE_ID),
    [COLUMN.LAST_HEARTBEAT]: nowMs,
    [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + READY_LEASE_MS,
    [COLUMN.CREATED_AT]: nowMs,
    [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION,
    [COLUMN.STORAGE_BUDGET_BYTES]: STORAGE_BUDGET_BYTES,
    [COLUMN.STORAGE_BUDGET_SOURCE]: STORAGE_BUDGET_SOURCE,
    [COLUMN.STORAGE_BUDGET_UPDATED_AT]: nowMs,
  }, nowMs));
  insert(TABLES.MESSAGE_GROUPS, seedMessageGroupRow(SEED_NODE_ID, nowMs));
  INITIAL_MESSAGE_GROUP_REPLICA_IDS.forEach((replicaId) => {
    insert(TABLES.SERVICES, MessageGroupServiceRowOwner.buildServiceRow({
      groupId: INITIAL_MESSAGE_GROUP_ID,
      replicaId,
      nodeId: SEED_NODE_ID,
      service: FOLLOWER_SERVICE,
      timestamp: nowMs,
      status: SERVICE_STATUS.ACTIVE,
    }));
  });
  for (const schema of SYSTEM_TABLE_SCHEMAS) {
    const replicaIds = getInitialReplicaIds(schema.tableName);
    const partitionId = INITIAL_PARTITION_IDS[schema.tableName];
    if (!partitionId || !replicaIds) continue;
    insert(TABLES.TABLES, seedTableRow(schema, nowMs));
    insert(TABLES.PARTITIONS, seedPartitionRow(schema, SEED_NODE_ID, nowMs));
    replicaIds.forEach((replicaId, index) => {
      // Registration publishes every replica as a follower; the elected
      // leader's role reaches its row with the leadership publication.
      insert(TABLES.SERVICES, {
        ...PartitionServiceRowOwner.buildServiceRow({
          partitionId,
          replicaId,
          nodeId: SEED_NODE_ID,
          service: FOLLOWER_SERVICE,
          timestamp: nowMs,
          status: SERVICE_STATUS.ACTIVE,
        }),
        [COLUMN.RAFT_ROLE]: index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
      });
    });
  }
}

/**
 * Build the world: the seed formed alone (its rows as the registration
 * producers write them), no joiner yet.
 * @return {object} the world
 */
function createFormationWorld() {
  initializeTestEnvironment();
  const frozen = createFrozenClock();
  const {clock} = frozen;
  const cache = new SystemTableCache({
    timeSource: clock,
    cacheId: WORLD_CACHE_ID,
    scheduleCacheChangeNotification: (callback) =>
      clock.setTimeout(callback, DUE_NOW_DELAY_MS),
  });
  const hostsById = new Map();
  const upNodeIds = new Set();
  const downLinks = new Set();
  const publicationModeByNodeId = new Map();
  const lifecyclePublicationByNodeId = new Map();
  const dispatchServiceByNodeId = new Map();
  // The SQL store's answer for a formation-release publication. The engine
  // seam answers reads from the cache, whose publication merge keeps a row's
  // first created_at; the store replaces the row (INSERT OR REPLACE), and the
  // handoff reader requires the row exactly as its authority last wrote it.
  const storedHandoffRows = new Map();
  function installStoredHandoffRows(hosts) {
    const owner = hosts.membershipPublicationService.controlPlanePublicationsOwner;
    const upsertPublication = owner.upsertPublication.bind(owner);
    const getPublication = owner.getPublication.bind(owner);
    owner.upsertPublication = async (row, options) => {
      const result = await upsertPublication(row, options);
      if (row?.[PUBLICATION_KIND_COLUMN] === HANDOFF_PUBLICATION_KIND) {
        storedHandoffRows.set(row[PUBLICATION_ID_COLUMN], row);
      }
      return result;
    };
    owner.getPublication = async (publicationId, options) =>
      storedHandoffRows.get(publicationId) ??
        getPublication(publicationId, options);
  }
  const network = Object.freeze({
    networkTimeSource: () => clock,
    setTimer: (nodeId, callback, delayMs) =>
      clock.setTimeout(callback, delayMs),
  });
  const partitionAuthority =
    createRowPartitionAuthority(cache, hostsById, frozen.now);
  const replicaRuntime = createReplicaRuntime(cache, frozen.now);
  const deliveries = [];

  function startNode(nodeId, clusterIncarnationFence) {
    const hosts = createSimulatedNodeHosts({
      network,
      nodeId,
      systemTableCache: cache,
      partitionAuthority,
      randomSource: new SeededRandomSource({seed: RANDOM_SEED}),
    });
    const readiness = hosts.controlPlaneReadinessService;
    readiness.setFormationReleaseAuthorityNodeId(SEED_NODE_ID);
    const publicationModeOwner = Object.freeze({
      getPublicationModeDiagnostics: () =>
        publicationModeByNodeId.get(nodeId) || PUBLICATION_MODE_GROUPED,
    });
    readiness.syncOwnerDependencies({
      storageAccountingService: hosts.storageAccountingService,
      heartbeatService: hosts.heartbeatService,
      cdcGroupPropagationService: publicationModeOwner,
      localClusterIncarnationFenceProvider: () => clusterIncarnationFence,
    });
    // The one durable node lifecycle owner of the node (the NODES boundary
    // the READY lease is published through), built as control-plane setup
    // builds it.
    const nodeLifecyclePublication = new NodeLifecyclePublication({
      gateway: hosts.controlPlaneSystemTableGateway,
      leaseAuthority: NodeReadyLeaseAuthority.fromConfiguration(),
      now: frozen.now,
    });
    hosts.heartbeatService.nodeLifecyclePublication = nodeLifecyclePublication;
    // The node's replica dispatch owner, built as control-plane setup builds
    // it; its timers are armed on the world clock and never fire.
    const metadataOwners = createSystemMetadataOwners({
      controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
    });
    const dispatchService = new ReplicaDispatchService({
      nodeId,
      messageRouter: hosts.messageRouter,
      cdcIntegrationService: hosts.cdcIntegrationService,
      systemTableCache: cache,
      rebalanceCoordinator: hosts.rebalanceCoordinator,
      sqlQueryEngine: hosts.sqlQueryEngine,
      controlPlaneReadinessService: readiness,
      storageAccountingService: hosts.storageAccountingService,
      cdcGroupPropagationService: publicationModeOwner,
      controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
      nodesOwner: metadataOwners.nodesOwner,
      servicesOwner: metadataOwners.servicesOwner,
      replicaOperationsOwner: metadataOwners.replicaOperationsOwner,
      nodeLifecyclePublication,
      setTimeoutFn: (callback, delayMs) => clock.setTimeout(callback, delayMs),
      clearTimeoutFn: (handle) => clock.clearTimeout(handle),
    });
    dispatchService.initialize();
    dispatchServiceByNodeId.set(nodeId, dispatchService);
    hostsById.set(nodeId, hosts);
    lifecyclePublicationByNodeId.set(nodeId, nodeLifecyclePublication);
    upNodeIds.add(nodeId);
    installMeshTransport(hosts, upNodeIds, downLinks);
    installDelivery(hosts, cache, replicaRuntime, deliveries,
      dispatchServiceByNodeId);
    installStoredHandoffRows(hosts);
    return hosts;
  }

  seedSystemRows(cache, frozen.now());
  const seed = startNode(SEED_NODE_ID, SEED_FENCE);
  const seedRebalancers = new Map(PRIORITY_TABLE_IDS.map((tableId) =>
    [INITIAL_PARTITION_IDS[tableId],
      createPriorityPartitionRebalancer(seed, tableId)]));

  return {
    cache,
    clock,
    frozen,
    hostsById,
    upNodeIds,
    replicaRuntime,
    deliveries,
    dispatchServiceByNodeId,
    seed,
    seedRebalancers,
    startNode,
    settle: () => frozen.settle(),
    lifecyclePublicationOf: (nodeId) => lifecyclePublicationByNodeId.get(nodeId),
    // One link of the mesh drops or returns (a connection re-identification
    // is a drop followed by a return).
    setLink(leftNodeId, rightNodeId, up) {
      if (up) {
        downLinks.delete(linkKey(leftNodeId, rightNodeId));
      } else {
        downLinks.add(linkKey(leftNodeId, rightNodeId));
      }
    },
    // A node's fan-out turns conservative while a joiner's message group is
    // joining, and grouped again once that group is active.
    setJoinerGroupPending(nodeId, pending) {
      if (pending) {
        publicationModeByNodeId.set(nodeId, PUBLICATION_MODE_JOINER_GROUP_PENDING);
      } else {
        publicationModeByNodeId.delete(nodeId);
      }
    },
    /**
     * A joiner's process starts and the seed registers it: its node row as
     * the registration owner builds it (JOINING, CONNECTED, no READY lease).
     * @param {string} nodeId
     * @return {object} the joiner's hosts
     */
    registerJoiner(nodeId) {
      const hosts = startNode(nodeId, buildClusterIncarnationFence({
        durableStateDetected: true,
        localIdentityMatched: true,
        peerProofRequired: true,
        peerAddresses: [nodeAddressOf(SEED_NODE_ID)],
      }));
      insertStoredRow(cache, TABLES.NODES, {
        ...buildNodeRegistrationRow({
          nodeId,
          nodeAddress: nodeAddressOf(nodeId),
          nodeCapabilities: [],
          bootIncarnation: TEST_BOOT_INCARNATION,
          now: frozen.now(),
        }),
        [COLUMN.STORAGE_BUDGET_BYTES]: STORAGE_BUDGET_BYTES,
        [COLUMN.STORAGE_BUDGET_SOURCE]: STORAGE_BUDGET_SOURCE,
        [COLUMN.STORAGE_BUDGET_UPDATED_AT]: frozen.now(),
      });
      return hosts;
    },
  };
}

export {
  PRIORITY_PARTITION_IDS,
  PRIORITY_TABLE_IDS,
  SCHEMA_BY_TABLE_ID,
  SEED_NODE_ID,
  WORLD_START_MS,
  createFormationWorld,
  nodeAddressOf,
};
