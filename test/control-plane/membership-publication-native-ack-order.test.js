/**
 * Independent publication owners submit through CDC and the publications
 * partition's actual statement admission, outcome ledger and file-backed
 * apply. The fixture controls proposal timing and drops one caller reply.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {CONTROL_PLANE_PUBLICATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {TABLES} from '../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {MEMBERSHIP_PUBLICATION_STATUS as STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {ControlPlanePublicationsOwner} from
  '../../src/control-plane/owners/control-plane-publications-owner.js';
import {normalizeControlPlanePublicationRow} from
  '../../src/control-plane/system-row-normalizers.js';
import {deriveParticipantEntryId} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {
  applyCommitted, clearFixtureSingletons, resetFixtureSingletons, settleTicks,
  shutdownAll, startLeader, statementState, temporaryDbPath, track,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const TABLE = TABLES.CONTROL_PLANE_PUBLICATIONS;
const PARTITION_ID = `${TABLE}-p1`;
const NODES = Object.freeze(['node-a', 'node-b']);
const WRITER_TIME = 20_000;
const SELECT_ROW = `SELECT * FROM ${TABLE} WHERE publication_id = ?`;

function publicationRow(epoch, nodes, nowMs) {
  return buildMembershipPublicationRow({
    nowMs,
    candidate: {
      publicationEpoch: epoch, publisherNodeId: NODES[0],
      sourceTopologyEpoch: epoch, sourceSnapshotVersion: epoch,
      publishedActiveNodeIds: nodes, requiredAckNodeIds: nodes,
      acknowledgedNodeIds: [],
    },
  });
}

function createPublicationWriter(leader, nodeId, nowMs) {
  const cdc = new CDCIntegrationService({
    nodeId,
    partitionServicesProvider: new Map([[PARTITION_ID, leader]]),
  });
  cdc.initialize();
  const owner = new ControlPlanePublicationsOwner({
    controlPlaneSystemTableGateway: new ControlPlaneSystemTableGateway({
      nodeId, cdcIntegrationService: cdc,
    }),
  });
  const coordinator = new MembershipPublicationCoordinator({
    nodeId, now: () => nowMs, controlPlanePublicationsOwner: owner,
  });
  return {cdc, owner, coordinator};
}

async function openPublicationsLedger(dbPath) {
  const {leader} = await startLeader({
    tableName: TABLE, schema: CONTROL_PLANE_PUBLICATIONS_SCHEMA, dbPath,
  }, PARTITION_ID);
  const applied = [];
  leader.controllablePort.setProposeHandler(async (command) => {
    assert.equal(applyCommitted(leader, command), null, 'the real partition applies the proposal');
    applied.push(command);
  });
  return {leader, applied};
}

function holdFirstAcknowledgement(leader) {
  const release = Promise.withResolvers();
  const execute = leader.executeQuery.bind(leader);
  const record = {request: null, replay: null, release: release.resolve};
  leader.executeQuery = async (sql, params, options) => {
    if (!options?.idempotencyKey || record.request) {
      return execute(sql, params, options);
    }
    record.request = {sql, params, options};
    await release.promise;
    const original = await execute(sql, params, options);
    assert.equal(original.success, true, 'the original proposal committed before reply loss');
    // The answer is lost between application and the owning writer. Deliver
    // the same statement a second time with its original participant key.
    record.replay = await execute(sql, params, options);
    return record.replay;
  };
  return record;
}

function readDurablePublication(ledger, id) {
  return normalizeControlPlanePublicationRow(ledger.db.prepare(SELECT_ROW).get(id));
}

async function exerciseAcknowledgementOrder({slowNode, fastNode, successor}) {
  const {directory, dbPath} = temporaryDbPath();
  let leader;
  let reopened;
  let slowWriter;
  let fastWriter;
  let held;
  let pending;
  try {
    const ledger = await openPublicationsLedger(dbPath);
    leader = ledger.leader;
    slowWriter = createPublicationWriter(leader, slowNode, WRITER_TIME);
    fastWriter = createPublicationWriter(leader, fastNode, WRITER_TIME + 10);
    const original = publicationRow(3, NODES, WRITER_TIME - 10);
    const publicationId = original.publication_id;
    await slowWriter.coordinator.persistPublicationRow(original);
    assert.equal(readDurablePublication(leader, publicationId).status, STATUS.OPEN);

    held = holdFirstAcknowledgement(leader);
    pending = track(slowWriter.coordinator.acknowledgePublication(publicationId, slowNode));
    await settleTicks();
    assert.ok(held.request, `the first owner reached the held write after its reads: ${JSON.stringify(pending.value)}`);
    const slowEntryId = deriveParticipantEntryId(held.request.options.idempotencyKey, PARTITION_ID);
    assert.equal(held.request.options.entryId, slowEntryId);
    assert.equal(ledger.applied.some((entry) => entry.entryId === slowEntryId), false);

    const fast = await fastWriter.coordinator.acknowledgePublication(publicationId, fastNode);
    assert.deepEqual(normalizeControlPlanePublicationRow(fast).acknowledgedNodeIds, [fastNode]);
    assert.deepEqual(readDurablePublication(leader, publicationId).acknowledgedNodeIds,
      [fastNode], 'the other coordinator confirmed its actual durable ACK first');

    let nextId;
    if (successor) {
      const next = publicationRow(4, [fastNode, successor], WRITER_TIME + 30);
      nextId = next.publication_id;
      await fastWriter.coordinator.persistPublicationRow(next);
      await fastWriter.coordinator.acknowledgePublication(nextId, fastNode);
      await fastWriter.coordinator.persistPublicationRow({
        ...original, status: STATUS.SUPERSEDED, updated_at: WRITER_TIME + 30,
      });
      assert.equal(readDurablePublication(leader, publicationId).status, STATUS.SUPERSEDED);
    }

    held.release();
    const slow = await pending.promise;
    assert.equal(held.replay?.success, true, 'the exact retransmission recovers its committed result');
    assert.equal(ledger.applied.filter((entry) => entry.entryId === slowEntryId).length, 1,
      'identical content and participant identity cannot re-apply');
    assert.equal(statementState(leader, slowEntryId), 'settled');
    assert.equal(held.replay.changes, 0, 'the replay of the stale CAS changes no row');
    if (!successor) {
      const rebased = ledger.applied.at(-1);
      assert.notEqual(rebased.entryId, slowEntryId, 'the changed preimage has a distinct entry');
      assert.equal(rebased.params.includes(JSON.stringify(NODES)), true,
        'the rebased update carries the same-revision ACK union');
      const committed = ledger.applied.length;
      const unchanged = await slowWriter.coordinator
        .acknowledgePublication(publicationId, slowNode);
      assert.deepEqual(normalizeControlPlanePublicationRow(unchanged).acknowledgedNodeIds, NODES);
      assert.equal(ledger.applied.length, committed, 'an already confirmed ACK needs no new write');
    }
    const settled = readDurablePublication(leader, publicationId);
    await shutdownAll(leader);
    leader = null;
    ({leader: reopened} = await openPublicationsLedger(dbPath));
    assert.deepEqual(readDurablePublication(reopened, publicationId), settled,
      'the durable result survives native reopen');

    if (successor) {
      const newer = readDurablePublication(reopened, nextId);
      assert.deepEqual(newer.publishedActiveNodeIds, [fastNode, successor].sort());
      assert.deepEqual(newer.acknowledgedNodeIds, [fastNode]);
      assert.equal(newer.status, STATUS.ACK_PENDING, 'an old ACK cannot satisfy the newer revision');
      assert.equal(settled.status, STATUS.SUPERSEDED, 'the retired publication cannot reopen');
    } else {
      assert.deepEqual(settled.acknowledgedNodeIds, NODES,
        'both independently confirmed acknowledgments survive arbitrary apply order');
      assert.equal(settled.status, STATUS.PUBLISHED);
      assert.deepEqual(normalizeControlPlanePublicationRow(slow).acknowledgedNodeIds, NODES,
        'the delayed owner returns the confirmed union');
    }
  } finally {
    held?.release();
    await Promise.allSettled(pending ? [pending.promise] : []);
    slowWriter?.cdc.markShuttingDown();
    fastWriter?.cdc.markShuttingDown();
    try {
      await shutdownAll(leader, reopened);
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  }
}

for (const [slowNode, fastNode] of [NODES, [...NODES].reverse()]) {
  test(`the publications ledger retains ${fastNode}'s confirmed ACK when ${slowNode} applies late`,
    () => exerciseAcknowledgementOrder({slowNode, fastNode}));
}

test('a late old-publication ACK has no authority to reopen a superseded revision',
  () => exerciseAcknowledgementOrder({
    slowNode: NODES[0], fastNode: NODES[1], successor: 'node-c',
  }));
