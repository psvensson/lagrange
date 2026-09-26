// R2 boundary witness for owner decision D1 (2026-09-25): a new replica
// bootstraps from its group's current committed membership, so a REPLACE
// target starts with its source while the source is a committed voter.
//
// Real PartitionService replicas on the rs-raft backend, one database file
// each, on a loopback transport. The target's bootstrap membership comes
// through the production chain end to end: the creation owner stamps the
// operation (createOperationRecordInternal, which builds the bootstrap
// topology from the group's services rows), the target node's replica
// handler resolves the replica context from that stamp and its own cache
// view (resolveReplicaContext), and PartitionService hands the resolved list
// to the rs-raft port.
//
// Every expectation is read from raft-rs: the committed ConfState the
// group's leader reports and the ConfState the target's own core reports.
// The replica -> raft peer id map is the backend's own (each live replica's
// readStatus().peerId); no id and no membership is written here. The source
// is a founding voter, so no ConfChange in the log names it: whatever the
// target's bootstrap says about it is all the target will ever know until a
// real RemoveNode commits.
//
// The target node's cache holds no services row for the partition yet (a new
// node's cache lags; only the dispatched stamp knows the group), so the
// target's identity reservations come from its bootstrap and nothing else.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {createLoopbackTransport} from
  '../../partition/partition-service-test-support.js';
import {
  CDCOperation,
  PartitionService,
} from '../../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../../src/node/replica-handler.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../../src/constants/index.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  applyRebalanceCoordinatorOperationCreationMethods,
} from '../../../src/rebalancer/rebalance-coordinator-operation-creation.js';
import {
  applyRebalanceCoordinatorOperationReadMethods,
} from '../../../src/rebalancer/rebalance-coordinator-operation-read-methods.js';
import {OperationType} from
  '../../../src/rebalancer/replica-operation-progress.js';
import {ReplicaOperationField} from
  '../../../src/rebalancer/replica-operation-constants.js';

const PARTITION_ID = 'd1-bootstrap';
const TABLE_NAME = 'd1_bootstrap_table';
const TARGET_REPLICA_COUNT = 3;
const WAIT_BUDGET_MS = 8000;
const ISOLATION_WINDOW_MS = 600;
const QUORUM_WINDOW_MS = 2000;
const POLL_MS = 10;
const TABLE_SCHEMA = Object.freeze({
  columns: [{name: 'seq', type: 'INTEGER', primaryKey: true}],
});
const LEADER_ROLE = 'leader';
const STAMP_CAPTURED = new Error('bootstrap stamp captured');
const SILENT = Object.freeze({
  info() {}, warn() {}, error() {}, debug() {}, trace() {},
});

class CreationOwner {}
applyRebalanceCoordinatorOperationCreationMethods(CreationOwner);
applyRebalanceCoordinatorOperationReadMethods(CreationOwner);

function addressOf([replicaId, nodeId]) {
  return `${nodeId}/partition/${replicaId}`;
}

function serviceRow([replicaId, nodeId]) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    address: addressOf([replicaId, nodeId]),
    status: SERVICE_STATUS.ACTIVE,
  };
}

function metadataCache(members) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.TABLES, CDCOperation.INSERT, {
    table_id: TABLE_NAME,
    table_name: TABLE_NAME,
    schema_definition: JSON.stringify(TABLE_SCHEMA),
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    partition_id: PARTITION_ID,
    table_id: TABLE_NAME,
    replica_count: TARGET_REPLICA_COUNT,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: null,
  });
  for (const member of members) {
    cache.applySystemTableChange(
      TABLES.SERVICES, CDCOperation.INSERT, serviceRow(member));
  }
  return cache;
}

function waitFor(predicate, boundMs = WAIT_BUDGET_MS) {
  const deadline = Date.now() + boundMs;
  return new Promise((resolve) => {
    const poll = () => {
      if (predicate()) {
        resolve(true);
      } else if (Date.now() >= deadline) {
        resolve(false);
      } else {
        setTimeout(poll, POLL_MS);
      }
    };
    poll();
  });
}

function statusOf(service) {
  return service.raft.readStatus();
}

// A configuration as the core reports it, reduced to what membership is:
// the incoming and outgoing voter sets and the learners, each sorted.
function membershipOf(confState) {
  const sorted = (ids) => [...(ids || [])].map(String).sort();
  return {
    voters: sorted(confState.voters),
    votersOutgoing: sorted(confState.votersOutgoing),
    learners: sorted(confState.learners),
  };
}

function committedMembership(service) {
  return membershipOf(statusOf(service).confState);
}

function withoutPeer(membership, peerId) {
  return {
    ...membership,
    voters: membership.voters.filter((id) => id !== String(peerId)),
  };
}

// The stamp the creation owner puts on an ADD or REPLACE for this partition,
// captured at the persistence boundary; the services rows are the group's
// own members, served both as the cache view and as the authoritative
// services-owner read.
async function creationStamp({type, sourceReplicaId = null, sourceNodeId,
  target, rows}) {
  let stamped = null;
  const owner = Object.assign(new CreationOwner(), {
    logger: SILENT,
    nodeId: 'coordinator-node',
    now: () => Date.now(),
    stats: {operationsCreated: 0},
    repository: {getEntityServiceRows: () => rows.map((row) => ({...row}))},
    getAuthoritativeEntityServiceRowsObservation: async () => ({
      available: true, rows: rows.map((row) => ({...row}))}),
    controlPlaneReadinessService: {getNodeReadinessSync: () => null},
    resolveEntitySizeBytes: () => 0,
    ensureProvisioningAdmissionAllowed: async () => undefined,
    resolveOperationReadinessDecisionDimension: () => null,
    persistNewOperation: async (operation) => {
      stamped = operation;
      throw STAMP_CAPTURED;
    },
  });
  const [targetReplicaId, targetNodeId] = target;
  const move = {
    type,
    nodeId: targetNodeId,
    replicaId: type === OperationType.REPLACE ?
      sourceReplicaId : targetReplicaId,
    replicaIntentId: targetReplicaId,
  };
  await owner.createOperationRecordInternal({
    move,
    normalizedMove: move,
    normalizedMoveType: type,
    shouldEmitOperationCreated: false,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: PARTITION_ID,
    partitionId: PARTITION_ID,
    dedupeKey: `${type}:${targetReplicaId}`,
    criticalAddLikeIntentKey: null,
    sourceNodeId,
  }).catch((error) => {
    if (error !== STAMP_CAPTURED) {
      throw error;
    }
  });
  assert.ok(stamped, `the creation owner persisted the ${type} operation`);
  return {
    replicaIds: stamped[ReplicaOperationField.REPLICA_IDS] || [],
    peerAddresses: stamped[ReplicaOperationField.PEER_ADDRESSES] || [],
  };
}

// What the target node's replica handler resolves for the dispatched stamp.
// Resolution reads the cache and the stamp only; its CDC service and replica
// factory are required collaborators that this read never reaches.
function targetContext({target, operationType, stamp, cache}) {
  const [targetReplicaId, targetNodeId] = target;
  const unreachable = () => {
    throw new Error('context resolution reached a write collaborator');
  };
  const handler = new ReplicaHandler({
    nodeId: targetNodeId,
    systemTableCache: cache,
    cdcIntegrationService: {insertSystemTableRow: unreachable},
    createPartitionService: unreachable,
  });
  return handler.resolveReplicaContext(PARTITION_ID, targetReplicaId, {
    explicitOperationType: operationType,
    bootstrapReplicaIds: stamp.replicaIds,
    bootstrapPeerAddresses: stamp.peerAddresses,
  });
}

function configure() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'd1-node'},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

// One partition on real replicas: each built with its own database file,
// the given membership list and cache, on one loopback network.
function createGroupHarness() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'd1-bootstrap-'));
  const network = createLoopbackTransport();
  const services = new Map();
  const caches = new Map();
  const build = (member, {replicaIds, peerAddresses, cache,
    deferElection = true}) => {
    const service = new PartitionService({
      partitionId: PARTITION_ID,
      tableId: TABLE_NAME,
      tableName: TABLE_NAME,
      replicaId: member[0],
      replicaIds,
      peerAddresses,
      nodeId: member[1],
      transport: network,
      systemTableCache: cache,
      schema: TABLE_SCHEMA,
      dbPath: path.join(directory, `${member[0]}.db`),
      deferElection,
    });
    services.set(member[0], service);
    caches.set(member[0], cache);
    return service;
  };
  const leader = () => [...services.values()].find((service) =>
    service.raft?.readStatus?.()?.role === LEADER_ROLE);
  const dispose = async () => {
    network.deliver = async () => undefined;
    await Promise.all([...services.values()].map((service) =>
      service.shutdown().catch(() => undefined)));
    fs.rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  };
  return {directory, network, services, caches, build, leader, dispose};
}

// Founders share one genesis list; every founder's cache names every founder.
async function formGroup(harness, founders) {
  for (const founder of founders) {
    harness.build(founder, {
      replicaIds: founders.map(([replicaId]) => replicaId),
      peerAddresses: founders.map(addressOf),
      cache: metadataCache(founders),
      deferElection: founders.length > 1,
    });
  }
  for (const founder of founders) {
    await harness.services.get(founder[0]).initialize();
  }
  for (const founder of founders) {
    harness.services.get(founder[0]).startElection();
  }
  assert.equal(await waitFor(() => harness.leader() !== undefined), true,
    'setup: the founding group elects a leader');
}

// The REPLACE target through the production chain: creation stamp, target
// handler context, PartitionService on rs-raft.
async function buildReplaceTarget(harness, {source, target, founders}) {
  const stamp = await creationStamp({
    type: OperationType.REPLACE,
    sourceReplicaId: source[0],
    sourceNodeId: source[1],
    target,
    rows: founders.map(serviceRow),
  });
  const targetCache = metadataCache([]);
  const context = targetContext({
    target, operationType: OperationType.REPLACE, stamp, cache: targetCache,
  });
  const service = harness.build(target, {
    replicaIds: context.replicaIds,
    peerAddresses: context.peerAddresses,
    cache: targetCache,
  });
  await service.initialize();
  return {service, stamp, context};
}

// The group's own admission: the target's row reaches every member's cache
// and the leader proposes the ConfChange.
async function admit(harness, target, members) {
  for (const [replicaId] of members) {
    harness.caches.get(replicaId).applySystemTableChange(
      TABLES.SERVICES, CDCOperation.INSERT, serviceRow(target));
  }
  const joined = harness.services.get(target[0]);
  joined.startElection();
  const joinedPeerId = statusOf(joined).peerId;
  return waitFor(() => {
    const leader = harness.leader();
    if (!leader) {
      return false;
    }
    const status = statusOf(leader);
    return status.confState.voters.map(String).includes(
      String(joinedPeerId)) &&
      statusOf(joined).commitIndex === status.commitIndex;
  });
}

async function restart(harness, member, cache) {
  const before = harness.services.get(member[0]);
  const options = {
    replicaIds: [...before.replicaIds],
    peerAddresses: [...(before.peerAddresses || [])],
    cache,
  };
  await before.shutdown();
  const reopened = harness.build(member, options);
  await reopened.initialize();
  reopened.startElection();
  assert.equal(await waitFor(() => statusOf(reopened).leaderId !== null),
    true, 'the restarted replica hears its leader again');
  return reopened;
}

test('D1 R2 witness: a REPLACE target of a founding voter bootstraps from ' +
  'the committed configuration, keeps the source until a real RemoveNode ' +
  'commits, then observes it; restart restores the same membership',
async () => {
  configure();
  const harness = createGroupHarness();
  const founderA = ['d1-a', 'node-a'];
  const source = ['d1-s', 'node-s'];
  const founderB = ['d1-b', 'node-b'];
  const target = ['d1-t', 'node-t'];
  const founders = [founderA, source, founderB];
  try {
    await formGroup(harness, founders);
    const committedAtCreation = committedMembership(harness.leader());
    const sourcePeerId = statusOf(harness.services.get(source[0])).peerId;
    assert.ok(committedAtCreation.voters.includes(String(sourcePeerId)),
      'setup: the source is a committed voter of the group');

    // (a) The target's bootstrap membership is the committed configuration
    // (plus the target itself, the joiner's own pending admission).
    const {service: replaceTarget} = await buildReplaceTarget(harness, {
      source, target, founders});
    const targetPeerId = statusOf(replaceTarget).peerId;
    const bootstrap = committedMembership(replaceTarget);
    assert.ok(bootstrap.voters.includes(String(targetPeerId)),
      'the target names itself, as every joiner does');
    assert.deepEqual(withoutPeer(bootstrap, targetPeerId),
      committedAtCreation,
      '(a) the target bootstrap equals the committed configuration');

    // (b)+(c) While the source is a committed voter the target represents
    // it; sampled through the whole catch-up, it never shows a removal the
    // group has not committed.
    const samples = [];
    const sampling = setInterval(() => {
      samples.push(committedMembership(replaceTarget));
    }, POLL_MS);
    const admitted = await admit(harness, target, founders);
    clearInterval(sampling);
    assert.equal(admitted, true, 'the group admits the target');
    assert.ok(samples.length > 0, 'the catch-up was sampled');
    assert.ok(samples.every((sample) =>
      sample.voters.includes(String(sourcePeerId))),
    '(c) no sample of the target configuration dropped the source before ' +
      'its removal was committed');
    assert.deepEqual(committedMembership(replaceTarget),
      committedMembership(harness.leader()),
      '(b) caught up, the target configuration is the leader committed one');

    // (e) Restart before the removal: the durable record, not the list.
    const restarted = await restart(harness, target,
      harness.caches.get(target[0]));
    assert.deepEqual(committedMembership(restarted),
      committedMembership(harness.leader()),
      '(e) a restart restores the committed membership, source included');

    // (d) The real removal, proposed through the target (the source must be
    // reserved there for REMOVE_PEER to be admissible), committed by the
    // group; the target observes the changed ConfState.
    const proposal = await restarted.raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: source[0],
      peerAddress: addressOf(source),
    });
    assert.equal(proposal?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      'REMOVE_PEER for the source is admissible on the target ' +
      `(${JSON.stringify(proposal)})`);
    assert.equal(await waitFor(() => {
      const leader = harness.leader();
      return leader !== undefined && leader !== harness.services.get(
        source[0]) && !statusOf(leader).confState.voters.map(String)
        .includes(String(sourcePeerId)) &&
        statusOf(restarted).commitIndex === statusOf(leader).commitIndex;
    }), true, 'the group commits the removal of the source');
    const afterRemoval = committedMembership(restarted);
    assert.equal(afterRemoval.voters.includes(String(sourcePeerId)), false,
      '(d) the target observes the committed removal');
    assert.deepEqual(afterRemoval, committedMembership(harness.leader()),
      '(d) the target configuration is the leader committed one');

    const reopened = await restart(harness, target,
      harness.caches.get(target[0]));
    assert.deepEqual(committedMembership(reopened), afterRemoval,
      '(e) a restart after the removal restores the same membership');
  } finally {
    await harness.dispose();
  }
});

test('D1 R2 witness: the admitted target counts quorum over the committed ' +
  'configuration, so two of four committed voters elect no leader',
async () => {
  configure();
  const harness = createGroupHarness();
  const founderA = ['d1q-a', 'node-a'];
  const source = ['d1q-s', 'node-s'];
  const founderB = ['d1q-b', 'node-b'];
  const target = ['d1q-t', 'node-t'];
  const founders = [founderA, source, founderB];
  try {
    await formGroup(harness, founders);
    const {service: replaceTarget} = await buildReplaceTarget(harness, {
      source, target, founders});
    assert.equal(await admit(harness, target, founders), true,
      'the group admits the target');
    const committed = committedMembership(harness.leader());
    assert.equal(committed.voters.length, founders.length + 1,
      'setup: the committed configuration holds the source and the target');

    // Only the target and one founder remain: a minority of the committed
    // configuration, however the target counts it.
    for (const [replicaId] of [source, founderB]) {
      await harness.services.get(replicaId).shutdown();
    }
    const campaign = await replaceTarget.raft.campaign();
    assert.equal(campaign?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the target campaigned (${JSON.stringify(campaign)})`);
    const ledWithMinority = await waitFor(() =>
      statusOf(replaceTarget).role === LEADER_ROLE, QUORUM_WINDOW_MS);
    assert.equal(ledWithMinority, false,
      'the target cannot lead with two of the four committed voters');
  } finally {
    await harness.dispose();
  }
});

test('D1 R2 witness (f): an ordinary ADD stamps the committed ' +
  'configuration plus its target, as before',
async () => {
  configure();
  const harness = createGroupHarness();
  const founders = [['d1f-a', 'node-a'], ['d1f-b', 'node-b'],
    ['d1f-c', 'node-c']];
  const joiner = ['d1f-j', 'node-j'];
  try {
    await formGroup(harness, founders);
    const committed = committedMembership(harness.leader());
    const stamp = await creationStamp({
      type: OperationType.ADD,
      sourceNodeId: founders[0][1],
      target: joiner,
      rows: founders.map(serviceRow),
    });
    const peerIdOf = new Map(founders.map(([replicaId]) => [replicaId,
      String(statusOf(harness.services.get(replicaId)).peerId)]));
    assert.equal(stamp.replicaIds.at(-1), joiner[0],
      'the ADD stamp ends with its target');
    assert.deepEqual(
      stamp.replicaIds.filter((replicaId) => replicaId !== joiner[0])
        .map((replicaId) => peerIdOf.get(replicaId)).sort(),
      committed.voters,
      '(f) the ADD stamp without its target is the committed voter set');
  } finally {
    await harness.dispose();
  }
});

test('D1 R2 witness (RF=1): the sole voter is replaced through ' +
  'add-voter, leadership transfer and remove-voter, and the target never ' +
  'leads alone before the removal commits',
async () => {
  configure();
  const harness = createGroupHarness();
  const source = ['d1r-s', 'node-s'];
  const target = ['d1r-t', 'node-t'];
  try {
    await formGroup(harness, [source]);
    const sourceService = harness.services.get(source[0]);
    const committedAtCreation = committedMembership(sourceService);
    const {service: replaceTarget} = await buildReplaceTarget(harness, {
      source, target, founders: [source]});
    const targetPeerId = statusOf(replaceTarget).peerId;
    assert.deepEqual(
      withoutPeer(committedMembership(replaceTarget), targetPeerId),
      committedAtCreation,
      'the target bootstrap is the committed configuration: it is not a ' +
        'sole voter');
    // The target stands for election once, through the port: raft-rs
    // counts its votes over the bootstrap configuration, which needs the
    // source, and the source's log is ahead of the empty one.
    const campaign = await replaceTarget.raft.campaign();
    assert.equal(campaign?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the target campaigned (${JSON.stringify(campaign)})`);
    const ledAlone = await waitFor(() =>
      statusOf(replaceTarget).role === LEADER_ROLE, ISOLATION_WINDOW_MS);
    assert.equal(ledAlone, false,
      'the target cannot elect itself while the source is a voter');
    assert.equal(await waitFor(() =>
      statusOf(sourceService).role === LEADER_ROLE), true,
    'the sole voter leads again');

    assert.equal(await admit(harness, target, [source]), true,
      'the sole voter admits the target');
    const transfer = await sourceService.raft.transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: target[0],
    });
    assert.equal(transfer?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `leadership transfer to the target (${JSON.stringify(transfer)})`);
    assert.equal(await waitFor(() =>
      statusOf(replaceTarget).role === LEADER_ROLE), true,
    'the target leads the two-voter group');
    const proposal = await replaceTarget.raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: source[0],
      peerAddress: addressOf(source),
    });
    assert.equal(proposal?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `REMOVE_PEER for the source (${JSON.stringify(proposal)})`);
    assert.equal(await waitFor(() => {
      const voters = committedMembership(replaceTarget).voters;
      return voters.length === 1 && voters[0] === String(targetPeerId);
    }), true, 'the committed configuration is the target alone');
    assert.equal(statusOf(replaceTarget).role, LEADER_ROLE,
      'the target leads its sole-voter group');
  } finally {
    await harness.dispose();
  }
});
